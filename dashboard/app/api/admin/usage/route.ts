/**
 * GET /api/admin/usage
 *
 * Admin-only. Returns per-tenant usage stats with REAL Apify cost data.
 *
 * Cost data strategy (three-tier, most accurate wins):
 *
 *   1. REAL PER-TENANT (tagged runs)
 *      Apify runs tagged with tenantId (from scan-tenant, added 2026-04-05).
 *      Query /v2/actor-runs?tag={tenantId} → sum usageTotalUsd per tenant.
 *      Most accurate — direct attribution, no estimation.
 *
 *   2. PRO-RATA FALLBACK (pre-tagging tenants)
 *      Tenants with runs before tagging was introduced have no tagged history.
 *      Their cost = (their post count / total unattributed posts) × unattributed spend.
 *      Reasonably accurate — proportional to actual scan volume.
 *
 *   3. ACCOUNT TOTAL ALWAYS SHOWN
 *      /v2/users/me/usage/monthly → exact billing cycle total.
 *      Always displayed prominently so the real number is never hidden.
 *
 * Post counts:
 *   Reads from Platform Airtable cached fields (written hourly by usage-sync cron).
 *   Falls back to live fetch for tenants with no cache yet.
 */

import { NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'

const PLATFORM_TOKEN  = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE   = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const SHARED_APIFY    = process.env.APIFY_API_TOKEN            || ''
const AIRTABLE_API    = 'https://api.airtable.com/v0'
const APIFY_API       = 'https://api.apify.com/v2'

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
  // Query all runs tagged with this tenantId since billing cycle start
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
        // Only count runs within the current billing cycle
        if (cycleStart && run.startedAt < cycleStart) break
        totalUsd += run.usageTotalUsd || 0
      }

      // Stop if last run is before billing cycle start (runs are desc by date)
      const last = runs[runs.length - 1]
      if (!last || (cycleStart && last.startedAt < cycleStart)) break

      offset = d?.data?.nextCursor || undefined
    } catch { break }
  } while (offset)

  return Math.round(totalUsd * 10000) / 10000
}

// ── Airtable post-count helpers ───────────────────────────────────────────────

async function liveFetch(
  baseId: string,
  token: string
): Promise<{ count: number; lastScan: string | null }> {
  let count = 0
  let lastScan: string | null = null
  let offset: string | undefined
  const MAX_PAGES = 5

  do {
    const url = new URL(`${AIRTABLE_API}/${baseId}/Captured%20Posts`)
    url.searchParams.set('pageSize', '100')
    url.searchParams.set('fields[]', 'Captured At')
    url.searchParams.set('sort[0][field]', 'Captured At')
    url.searchParams.set('sort[0][direction]', 'desc')
    if (offset) url.searchParams.set('offset', offset)

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!resp.ok) throw new Error(`Airtable ${resp.status}`)

    const data = await resp.json()
    const records: any[] = data.records || []
    count += records.length
    if (!lastScan && records.length > 0) {
      lastScan = records[0]?.fields?.['Captured At'] || null
    }
    offset = data.offset
  } while (offset && count < MAX_PAGES * 100)

  return { count, lastScan }
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
    // ── 1. Real Apify account spend (always fetch — single fast call) ─────────
    const apifyAccount = SHARED_APIFY ? await getApifyMonthlySpend(SHARED_APIFY) : null

    // ── 2. Fetch all tenant records from Platform Airtable ────────────────────
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

    const payingTenants = all.filter(r => r.fields?.Plan !== 'Owner')

    // ── 3. Build usage records — post counts from cache, costs from Apify ─────
    const usageRaw = await Promise.all(
      payingTenants.map(async (r) => {
        const base       = r.fields?.['Airtable Base ID']   || ''
        const token      = r.fields?.['Airtable API Token'] || ''
        const syncedAt   = r.fields?.['Usage Synced At']    || null
        const tenantId   = r.fields?.['Tenant ID']          || ''
        const ownApify   = r.fields?.['Apify API Key']      || ''

        const record: {
          id: string; email: string; companyName: string; plan: string; status: string; tenantId: string
          postCount: number | null; lastScan: string | null; estCost: number | null
          realCost: number | null; costSource: 'tagged' | 'prorata' | 'own_key' | 'no_data'
          syncedAt: string | null; fromCache: boolean; ownApify: boolean; error?: string
        } = {
          id: r.id, email: r.fields?.['Email'] || '', companyName: r.fields?.['Company Name'] || '',
          plan: r.fields?.['Plan'] || '', status: r.fields?.['Status'] || 'Active',
          tenantId, postCount: null, lastScan: null, estCost: null,
          realCost: null, costSource: 'no_data', syncedAt, fromCache: false,
          ownApify: !!ownApify,
        }

        // Post count: cache-first
        const cachedCount = r.fields?.['Post Count']
        if (typeof cachedCount === 'number') {
          record.postCount = cachedCount
          record.fromCache = true
        } else if (base && token) {
          try {
            const { count, lastScan } = await liveFetch(base, token)
            record.postCount = count
            record.lastScan  = lastScan
          } catch (e: any) {
            record.error = e.message?.slice(0, 80)
          }
        } else if (!base || !token) {
          record.error = 'no_credentials'
        }

        // Real cost: tagged runs from own Apify key, or defer to pro-rata
        if (ownApify && apifyAccount?.billingCycleStart) {
          try {
            const own = await getApifyMonthlySpend(ownApify)
            if (own) {
              record.realCost    = own.totalUsd
              record.costSource  = 'own_key'
            }
          } catch {}
        } else if (tenantId && SHARED_APIFY && apifyAccount?.billingCycleStart) {
          const tagged = await getTenantTaggedSpend(SHARED_APIFY, tenantId, apifyAccount.billingCycleStart)
          if (tagged > 0) {
            record.realCost   = tagged
            record.costSource = 'tagged'
          }
          // else: will be filled by pro-rata after all tenants are loaded
        }

        return record
      })
    )

    // ── 4. Pro-rata fallback for tenants with no tagged spend yet ─────────────
    if (apifyAccount) {
      const sharedPoolTenants = usageRaw.filter(u => !u.ownApify)
      const attributedSpend   = sharedPoolTenants.reduce((s, u) => s + (u.costSource === 'tagged' ? (u.realCost || 0) : 0), 0)
      const unattributed      = Math.max(0, apifyAccount.totalUsd - usageRaw.filter(u => u.ownApify).reduce((s, u) => s + (u.realCost || 0), 0) - attributedSpend)

      const proRataTenants    = sharedPoolTenants.filter(u => u.costSource === 'no_data' || u.costSource === 'prorata')
      const totalProRataPosts = proRataTenants.reduce((s, u) => s + (u.postCount || 0), 0)

      for (const u of proRataTenants) {
        if (totalProRataPosts > 0 && (u.postCount || 0) > 0) {
          u.realCost   = Math.round((unattributed * (u.postCount! / totalProRataPosts)) * 10000) / 10000
          u.costSource = 'prorata'
        }
      }
    }

    // ── 5. Sync metadata ──────────────────────────────────────────────────────
    const syncTimes   = usageRaw.filter(u => u.syncedAt).map(u => new Date(u.syncedAt!).getTime())
    const newestSyncedAt = syncTimes.length ? new Date(Math.max(...syncTimes)).toISOString() : null

    return NextResponse.json({
      usage: usageRaw,
      newestSyncedAt,
      apify: apifyAccount,   // { totalUsd, billingCycleStart, billingCycleEnd }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
