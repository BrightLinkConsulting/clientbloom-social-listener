/**
 * GET /api/admin/usage
 *
 * Admin-only. Returns per-tenant usage stats with REAL Apify cost data,
 * scan health status, role information, and service flags.
 *
 * Cost data strategy (three-tier, most accurate wins):
 *
 *   1. REAL PER-TENANT (tagged runs)
 *      Apify runs tagged with tenantId (scan.ts passes &tag={tenantId}).
 *      Query /v2/actor-runs?tag={tenantId} → sum usageTotalUsd per tenant.
 *      Most accurate — direct attribution.
 *
 *   2. PRO-RATA FALLBACK (pre-tagging tenants)
 *      cost = (tenant post count / total unattributed posts) × unattributed spend.
 *
 *   3. ACCOUNT TOTAL ALWAYS SHOWN
 *      /v2/users/me/usage/monthly → exact billing cycle total.
 *
 * Post counts:
 *   Cache-first (written hourly by usage-sync cron).
 *   Falls back to LIVE platform-base fetch for tenants with no cache yet.
 *   No more "no_credentials" errors for shared-platform tenants.
 *
 * Scan health:
 *   Fetched in one parallel pass from Scan Health table (all tenants).
 *
 * Service flags:
 *   Read from Service Flags JSON field (written by /api/cron/service-check).
 */

import { NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import { escapeAirtableString } from '@/lib/airtable'

const PLATFORM_TOKEN  = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE   = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const SHARED_APIFY    = process.env.APIFY_API_TOKEN            || ''
const AIRTABLE_API    = 'https://api.airtable.com/v0'
const APIFY_API       = 'https://api.apify.com/v2'

// ── Service flag type ─────────────────────────────────────────────────────────

export interface ServiceFlag {
  code:       string
  severity:   'critical' | 'warning' | 'info'
  message:    string
  detectedAt: string
}

// ── Apify helpers ─────────────────────────────────────────────────────────────

async function getApifyMonthlySpend(token: string): Promise<{
  totalUsd: number
  billingCycleStart: string
  billingCycleEnd: string
} | null> {
  try {
    const resp = await fetch(`${APIFY_API}/users/me/usage/monthly?token=${token}`)
    if (!resp.ok) return null
    const d = await resp.json()
    const services = d?.data?.monthlyServiceUsage || {}
    const totalUsd = Object.values(services as Record<string, any>)
      .reduce((sum: number, v: any) => sum + (v?.amountAfterVolumeDiscountUsd || 0), 0)
    return {
      totalUsd: Math.round(totalUsd * 10000) / 10000,
      billingCycleStart: d?.data?.usageCycle?.startAt || '',
      billingCycleEnd:   d?.data?.usageCycle?.endAt   || '',
    }
  } catch { return null }
}

async function getTenantTaggedSpend(
  token: string,
  tenantId: string,
  cycleStart: string,
): Promise<number> {
  let totalUsd = 0
  let offset: string | undefined

  do {
    const url = new URL(`${APIFY_API}/actor-runs`)
    url.searchParams.set('token', token)
    url.searchParams.set('tag', tenantId)
    url.searchParams.set('limit', '100')
    url.searchParams.set('desc', '1')
    if (offset) url.searchParams.set('offset', offset)

    try {
      const resp = await fetch(url.toString())
      if (!resp.ok) break
      const d = await resp.json()
      const runs: any[] = d?.data?.items || []

      for (const run of runs) {
        if (cycleStart && run.startedAt < cycleStart) break
        totalUsd += run.usageTotalUsd || 0
      }

      const last = runs[runs.length - 1]
      if (!last || (cycleStart && last.startedAt < cycleStart)) break

      offset = d?.data?.nextCursor || undefined
    } catch { break }
  } while (offset)

  return Math.round(totalUsd * 10000) / 10000
}

// ── Live post count from shared platform base (fallback when cache is absent) ──

async function liveFetchSharedBase(tenantId: string): Promise<{ count: number; lastScan: string | null }> {
  let count = 0
  let lastScan: string | null = null
  let offset: string | undefined

  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  // NOTE: Do NOT encodeURIComponent here — URLSearchParams.set() encodes automatically.
  // Double-encoding breaks Airtable formula parsing (422).
  const filter = `AND({Tenant ID}='${escapeAirtableString(tenantId)}',{Captured At}>='${monthStart}')`

  do {
    const url = new URL(`${AIRTABLE_API}/${PLATFORM_BASE}/Captured%20Posts`)
    url.searchParams.set('pageSize', '100')
    url.searchParams.set('fields[]', 'Captured At')
    url.searchParams.set('filterByFormula', filter)
    url.searchParams.set('sort[0][field]', 'Captured At')
    url.searchParams.set('sort[0][direction]', 'desc')
    if (offset) url.searchParams.set('offset', offset)

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
    })
    if (!resp.ok) throw new Error(`Airtable ${resp.status}`)

    const data = await resp.json()
    const records: any[] = data.records || []
    count += records.length
    if (!lastScan && records.length > 0) {
      lastScan = records[0]?.fields?.['Captured At'] || null
    }
    offset = data.offset
    if (count >= 1000) break // cap for performance
  } while (offset)

  return { count, lastScan }
}

// ── Scan health (single pass, all tenants) ────────────────────────────────────

interface ScanHealthRow {
  lastScanAt:     string | null
  lastScanStatus: string | null
  lastError:      string | null
  lastPostsFound: number
}

async function getAllScanHealth(): Promise<Map<string, ScanHealthRow>> {
  const map = new Map<string, ScanHealthRow>()
  let offset: string | undefined

  do {
    const url = new URL(`${AIRTABLE_API}/${PLATFORM_BASE}/Scan%20Health`)
    url.searchParams.set('pageSize', '100')
    url.searchParams.set('fields[]', 'Tenant ID')
    url.searchParams.set('fields[]', 'Last Scan At')
    url.searchParams.set('fields[]', 'Last Scan Status')
    url.searchParams.set('fields[]', 'Last Error')
    url.searchParams.set('fields[]', 'Last Posts Found')
    if (offset) url.searchParams.set('offset', offset)

    try {
      const resp = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
      })
      if (!resp.ok) break
      const data = await resp.json()
      for (const r of data.records || []) {
        const tid = r.fields?.['Tenant ID']
        if (tid) {
          map.set(tid, {
            lastScanAt:     r.fields?.['Last Scan At']     || null,
            lastScanStatus: r.fields?.['Last Scan Status'] || null,
            lastError:      r.fields?.['Last Error']       || null,
            lastPostsFound: r.fields?.['Last Posts Found'] || 0,
          })
        }
      }
      offset = data.offset
    } catch { break }
  } while (offset)

  return map
}

// ── Main route ────────────────────────────────────────────────────────────────

export async function GET() {
  const caller = await getTenantConfig()
  if (!caller) return tenantError()
  if (!caller.isAdmin) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }
  if (!PLATFORM_TOKEN || !PLATFORM_BASE) {
    return NextResponse.json({ error: 'Platform Airtable not configured.' }, { status: 500 })
  }

  try {
    // ── Parallel: Apify account spend + scan health ─────────────────────────
    const [apifyAccount, scanHealthMap] = await Promise.all([
      SHARED_APIFY ? getApifyMonthlySpend(SHARED_APIFY) : Promise.resolve(null),
      getAllScanHealth(),
    ])

    // ── Fetch all tenant records ────────────────────────────────────────────
    const all: any[] = []
    let offset: string | undefined

    do {
      const url = new URL(`${AIRTABLE_API}/${PLATFORM_BASE}/Tenants`)
      url.searchParams.set('pageSize', '100')
      url.searchParams.set('sort[0][field]', 'Company Name')
      url.searchParams.set('sort[0][direction]', 'asc')
      if (offset) url.searchParams.set('offset', offset)

      const resp = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
      })
      if (!resp.ok) return NextResponse.json({ error: await resp.text() }, { status: resp.status })

      const data = await resp.json()
      all.push(...(data.records || []))
      offset = data.offset
    } while (offset)

    // ── Build per-tenant usage records ─────────────────────────────────────
    const usageRaw = await Promise.all(
      all.map(async (r) => {
        const syncedAt    = r.fields?.['Usage Synced At'] || null
        const tenantId    = r.fields?.['Tenant ID']       || ''
        const ownApify    = r.fields?.['Apify API Key']   || ''

        // Parse stored service flags
        let serviceFlags: ServiceFlag[] = []
        try {
          const raw = r.fields?.['Service Flags'] || '[]'
          serviceFlags = JSON.parse(raw)
          if (!Array.isArray(serviceFlags)) serviceFlags = []
        } catch { serviceFlags = [] }

        const sh = tenantId ? scanHealthMap.get(tenantId) : null

        const record: {
          id: string; email: string; companyName: string; plan: string; status: string; tenantId: string
          isAdmin: boolean; isFeedOnly: boolean; onboarded: boolean; trialEndsAt: string | null
          postCount: number | null; lastScan: string | null; realCost: number | null
          costSource: 'tagged' | 'prorata' | 'own_key' | 'no_data'
          syncedAt: string | null; fromCache: boolean; ownApify: boolean
          scanStatus: string | null; lastScanAt: string | null; lastScanError: string | null; lastPostsFound: number
          serviceFlags: ServiceFlag[]
          error?: string
        } = {
          id:             r.id,
          email:          r.fields?.['Email']        || '',
          companyName:    r.fields?.['Company Name'] || '',
          plan:           r.fields?.['Plan']         || '',
          status:         r.fields?.['Status']       || 'Active',
          tenantId,
          isAdmin:        r.fields?.['Is Admin']     ?? false,
          isFeedOnly:     r.fields?.['Is Feed Only'] ?? false,
          onboarded:      r.fields?.['Onboarded']    ?? false,
          trialEndsAt:    r.fields?.['Trial Ends At'] || null,
          postCount: null, lastScan: null, realCost: null, costSource: 'no_data',
          syncedAt, fromCache: false, ownApify: !!ownApify,
          scanStatus:     sh?.lastScanStatus || null,
          lastScanAt:     sh?.lastScanAt     || null,
          lastScanError:  sh?.lastError      || null,
          lastPostsFound: sh?.lastPostsFound || 0,
          serviceFlags,
        }

        // Post count: cache-first, then live platform-base fetch
        const cachedCount = r.fields?.['Post Count']
        if (typeof cachedCount === 'number') {
          record.postCount = cachedCount
          record.fromCache = true
        } else if (tenantId) {
          try {
            const { count, lastScan } = await liveFetchSharedBase(tenantId)
            record.postCount = count
            record.lastScan  = lastScan
          } catch (e: any) {
            record.error = `fetch_error: ${e.message?.slice(0, 60)}`
          }
        } else {
          record.error = 'no_tenant_id'
        }

        // Real cost: own Apify key wins, then tagged runs, then pro-rata
        if (ownApify && apifyAccount?.billingCycleStart) {
          try {
            const own = await getApifyMonthlySpend(ownApify)
            if (own) { record.realCost = own.totalUsd; record.costSource = 'own_key' }
          } catch {}
        } else if (tenantId && SHARED_APIFY && apifyAccount?.billingCycleStart) {
          const tagged = await getTenantTaggedSpend(SHARED_APIFY, tenantId, apifyAccount.billingCycleStart)
          if (tagged > 0) { record.realCost = tagged; record.costSource = 'tagged' }
        }

        return record
      })
    )

    // ── Pro-rata fallback for unattributed shared-pool tenants ──────────────
    if (apifyAccount) {
      const sharedPool        = usageRaw.filter(u => !u.ownApify)
      const attributedSpend   = sharedPool.reduce((s, u) => s + (u.costSource === 'tagged' ? (u.realCost || 0) : 0), 0)
      const ownKeySpend       = usageRaw.filter(u => u.ownApify).reduce((s, u) => s + (u.realCost || 0), 0)
      const unattributed      = Math.max(0, apifyAccount.totalUsd - ownKeySpend - attributedSpend)
      const proRataTenants    = sharedPool.filter(u => u.costSource === 'no_data')
      const totalProRataPosts = proRataTenants.reduce((s, u) => s + (u.postCount || 0), 0)

      for (const u of proRataTenants) {
        if (totalProRataPosts > 0 && (u.postCount || 0) > 0) {
          u.realCost   = Math.round((unattributed * (u.postCount! / totalProRataPosts)) * 10000) / 10000
          u.costSource = 'prorata'
        }
      }
    }

    // ── Sync metadata + service summary ────────────────────────────────────
    const syncTimes      = usageRaw.filter(u => u.syncedAt).map(u => new Date(u.syncedAt!).getTime())
    const newestSyncedAt = syncTimes.length ? new Date(Math.max(...syncTimes)).toISOString() : null

    const serviceSummary = {
      critical: usageRaw.reduce((n, u) => n + u.serviceFlags.filter(f => f.severity === 'critical').length, 0),
      warning:  usageRaw.reduce((n, u) => n + u.serviceFlags.filter(f => f.severity === 'warning').length, 0),
      info:     usageRaw.reduce((n, u) => n + u.serviceFlags.filter(f => f.severity === 'info').length, 0),
      lastChecked: all.reduce((latest: string | null, r) => {
        const checked = r.fields?.['Service Checked At'] || null
        if (!checked) return latest
        if (!latest) return checked
        return checked > latest ? checked : latest
      }, null as string | null),
    }

    return NextResponse.json({
      usage:   usageRaw,
      newestSyncedAt,
      apify:   apifyAccount,
      serviceSummary,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
