/**
 * GET /api/cron/service-check
 *
 * Client Services Manager — runs every 4 hours.
 *
 * Sweeps every tenant account and evaluates a set of health rules. Writes the
 * resulting flags (and a "Service Checked At" timestamp) back to each Tenant
 * record in Airtable. The admin Usage tab reads these flags and surfaces them
 * as actionable alerts.
 *
 * This cron answers the question: "Is every customer getting what they pay for,
 * and are any accounts in a state that needs my attention?"
 *
 * ── Flag codes and their meaning ──────────────────────────────────────────────
 *
 * CRITICAL (needs immediate attention):
 *   paid_no_scan_48h      Active paid account — no successful scan in 48 hours
 *   scan_failed           Last scan ended with an error
 *   trial_billing_mismatch Trial expired in Airtable but status not updated
 *
 * WARNING (worth monitoring):
 *   trial_expiring_48h    Trial ends in under 48 hours (churn risk)
 *   paid_zero_posts       Paid account with 0 posts captured this month
 *   trial_no_setup        Trial started > 24 hours ago but onboarding incomplete
 *   scan_stalled          Scan Health shows 'scanning' for > 30 minutes
 *
 * INFO (awareness only):
 *   no_icps_configured    Account has no ICP profiles saved (nothing to scan)
 *   no_keywords           Account has no keyword sources configured
 *
 * ── Airtable fields required ──────────────────────────────────────────────────
 * Tenants table (add if missing):
 *   Service Flags       (Long text)  — JSON array of ServiceFlag objects
 *   Service Checked At  (Date/time)  — timestamp of last service-check run
 *
 * Secured by CRON_SECRET env var.
 */

import { NextRequest, NextResponse } from 'next/server'
import { escapeAirtableString } from '@/lib/airtable'

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const CRON_SECRET    = process.env.CRON_SECRET               || ''
const AIRTABLE_API   = 'https://api.airtable.com/v0'

export const maxDuration = 300

interface ServiceFlag {
  code:       string
  severity:   'critical' | 'warning' | 'info'
  message:    string
  detectedAt: string
}

// ── Airtable helpers ──────────────────────────────────────────────────────────

async function patchTenantFlags(recordId: string, flags: ServiceFlag[], checkedAt: string): Promise<void> {
  const url = `${AIRTABLE_API}/${PLATFORM_BASE}/Tenants/${recordId}`
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${PLATFORM_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        'Service Flags':      JSON.stringify(flags),
        'Service Checked At': checkedAt,
      },
    }),
  })
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    console.error(`[service-check] Failed to patch ${recordId}: HTTP ${resp.status} — ${body.slice(0, 200)}`)
    // If the fields are missing from the Airtable schema, surface a clear hint
    if (resp.status === 422) {
      console.error('[service-check] 422 likely means "Service Flags" or "Service Checked At" fields are missing from the Tenants table. Add them: Service Flags (Long text), Service Checked At (Date/time).')
    }
  }
}

/** Count Airtable records matching a formula (returns up to 1 page = 100). */
async function countRecords(table: string, formula: string): Promise<number> {
  const url = new URL(`${AIRTABLE_API}/${PLATFORM_BASE}/${encodeURIComponent(table)}`)
  url.searchParams.set('pageSize', '1')
  url.searchParams.set('filterByFormula', formula)
  url.searchParams.set('fields[]', 'Tenant ID') // minimal field fetch

  try {
    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
    })
    if (!resp.ok) return -1
    const data = await resp.json()
    // Airtable doesn't return total count — we need to check if any records exist
    // For the flags we just need exists(>0) vs empty(=0) in most cases
    return (data.records || []).length
  } catch { return -1 }
}

/** Fetch scan health record for a tenant. */
async function getScanHealth(tenantId: string): Promise<{
  lastScanAt: string | null; lastScanStatus: string | null; lastError: string | null
} | null> {
  const filter = encodeURIComponent(`{Tenant ID}='${escapeAirtableString(tenantId)}'`)
  const url = new URL(`${AIRTABLE_API}/${PLATFORM_BASE}/Scan%20Health`)
  url.searchParams.set('filterByFormula', filter)
  url.searchParams.set('pageSize', '1')

  try {
    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
    })
    if (!resp.ok) return null
    const data = await resp.json()
    const r = data.records?.[0]
    if (!r) return null
    return {
      lastScanAt:     r.fields?.['Last Scan At']     || null,
      lastScanStatus: r.fields?.['Last Scan Status'] || null,
      lastError:      r.fields?.['Last Error']       || null,
    }
  } catch { return null }
}

/** Check if an account has any posts this month. */
async function hasPostsThisMonth(tenantId: string): Promise<boolean> {
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  const filter = `AND({Tenant ID}='${escapeAirtableString(tenantId)}',{Captured At}>='${monthStart}')`
  const count = await countRecords('Captured Posts', filter)
  return count > 0
}

/** Check if an account has any ICP profiles saved. */
async function hasIcps(tenantId: string): Promise<boolean> {
  const filter = `{Tenant ID}='${escapeAirtableString(tenantId)}'`
  const count = await countRecords('LinkedIn ICPs', filter)
  return count > 0
}

/** Check if an account has any keyword sources. */
async function hasKeywords(tenantId: string): Promise<boolean> {
  const filter = `{Tenant ID}='${escapeAirtableString(tenantId)}'`
  const count = await countRecords('Sources', filter)
  return count > 0
}

// ── Flag evaluation ───────────────────────────────────────────────────────────

const PAID_PLANS    = new Set(['Scout Starter', 'Scout Pro', 'Scout Agency'])
const ACTIVE_PLANS  = new Set(['Scout Starter', 'Scout Pro', 'Scout Agency', 'Trial', 'Owner', 'Complimentary'])

async function evaluateFlags(
  r: any,
  checkedAt: string,
): Promise<ServiceFlag[]> {
  const flags: ServiceFlag[] = []
  const now = Date.now()

  const tenantId    = r.fields?.['Tenant ID']    || ''
  const plan        = r.fields?.['Plan']          || ''
  const status      = r.fields?.['Status']        || ''
  const trialEndsAt = r.fields?.['Trial Ends At'] || null
  const onboarded   = r.fields?.['Onboarded']    ?? false
  const createdAt   = r.fields?.['Created At']    || null
  const isAdmin     = r.fields?.['Is Admin']      ?? false

  // Skip internal admin accounts — they don't get customer service checks
  if (isAdmin) return []
  // Skip suspended accounts and trial_expired — already in known terminal states
  if (status === 'Suspended') return []

  // ── Billing mismatch: trial expired but status not updated ─────────────────
  if (plan === 'Trial' && trialEndsAt && new Date(trialEndsAt).getTime() < now && status !== 'trial_expired') {
    flags.push({
      code: 'trial_billing_mismatch', severity: 'critical',
      message: `Trial ended ${Math.floor((now - new Date(trialEndsAt).getTime()) / 86400000)}d ago but status is still '${status}' — trial-check cron may be delayed`,
      detectedAt: checkedAt,
    })
  }

  if (status === 'trial_expired') return flags // expired accounts — billing mismatch is the only relevant flag

  // ── Paid account health ─────────────────────────────────────────────────────
  if (PAID_PLANS.has(plan)) {
    const health = await getScanHealth(tenantId)

    // No successful scan in 48h
    if (health?.lastScanAt) {
      const lastScanMs = new Date(health.lastScanAt).getTime()
      const hoursAgo = (now - lastScanMs) / 3600000
      if (hoursAgo > 48) {
        flags.push({
          code: 'paid_no_scan_48h', severity: 'critical',
          message: `Last successful scan was ${Math.floor(hoursAgo)}h ago — scans may be broken for this paid account`,
          detectedAt: checkedAt,
        })
      }
    } else if (!health?.lastScanAt) {
      // Never scanned — only flag as warning if account is > 48h old
      if (createdAt && (now - new Date(createdAt).getTime()) > 48 * 3600000) {
        flags.push({
          code: 'paid_no_scan_ever', severity: 'warning',
          message: `Paid account created > 48h ago with no scan recorded`,
          detectedAt: checkedAt,
        })
      }
    }

    // Scan failed
    if (health?.lastScanStatus === 'failed') {
      flags.push({
        code: 'scan_failed', severity: 'critical',
        message: health.lastError ? `Last scan failed: ${health.lastError.slice(0, 120)}` : 'Last scan ended with an error',
        detectedAt: checkedAt,
      })
    }

    // Stalled scan
    if (health?.lastScanStatus === 'scanning' && health.lastScanAt) {
      const minsSinceStart = (now - new Date(health.lastScanAt).getTime()) / 60000
      if (minsSinceStart > 30) {
        flags.push({
          code: 'scan_stalled', severity: 'warning',
          message: `Scan has been in 'scanning' state for ${Math.floor(minsSinceStart)}m — may be stuck`,
          detectedAt: checkedAt,
        })
      }
    }

    // Zero posts this month
    const hasPosts = await hasPostsThisMonth(tenantId)
    if (!hasPosts) {
      flags.push({
        code: 'paid_zero_posts', severity: 'warning',
        message: `Paid account with 0 posts captured this month — check ICP/keyword config and scan health`,
        detectedAt: checkedAt,
      })
    }
  }

  // ── Trial account health ────────────────────────────────────────────────────
  if (plan === 'Trial' && ACTIVE_PLANS.has(plan) && status === 'Active') {
    // Expiring within 48 hours
    if (trialEndsAt) {
      const msLeft = new Date(trialEndsAt).getTime() - now
      if (msLeft > 0 && msLeft < 48 * 3600000) {
        const hrsLeft = Math.floor(msLeft / 3600000)
        flags.push({
          code: 'trial_expiring_48h', severity: 'warning',
          message: `Trial expires in ${hrsLeft}h — no subscription yet`,
          detectedAt: checkedAt,
        })
      }
    }

    // Onboarding not complete after 24h
    if (!onboarded && createdAt) {
      const hoursOld = (now - new Date(createdAt).getTime()) / 3600000
      if (hoursOld > 24) {
        flags.push({
          code: 'trial_no_setup', severity: 'warning',
          message: `Trial created ${Math.floor(hoursOld)}h ago but onboarding not complete`,
          detectedAt: checkedAt,
        })
      }
    }

    // Scan health checks for active trials
    const health = await getScanHealth(tenantId)
    if (health?.lastScanStatus === 'failed') {
      flags.push({
        code: 'scan_failed', severity: 'critical',
        message: health.lastError ? `Last scan failed: ${health.lastError.slice(0, 120)}` : 'Last scan ended with an error',
        detectedAt: checkedAt,
      })
    }
    if (health?.lastScanStatus === 'scanning' && health.lastScanAt) {
      const minsSinceStart = (now - new Date(health.lastScanAt).getTime()) / 60000
      if (minsSinceStart > 30) {
        flags.push({
          code: 'scan_stalled', severity: 'warning',
          message: `Scan stuck in 'scanning' for ${Math.floor(minsSinceStart)}m`,
          detectedAt: checkedAt,
        })
      }
    }
  }

  // ── Config checks (all active accounts) ───────────────────────────────────
  if (ACTIVE_PLANS.has(plan) && status === 'Active') {
    // Only run config checks for accounts old enough to have been set up
    const hoursOld = createdAt ? (now - new Date(createdAt).getTime()) / 3600000 : 999

    if (hoursOld > 12) {
      const [icps, keywords] = await Promise.all([hasIcps(tenantId), hasKeywords(tenantId)])

      if (!icps) {
        flags.push({
          code: 'no_icps_configured', severity: 'info',
          message: 'No ICP profiles saved — account will only scan by keyword',
          detectedAt: checkedAt,
        })
      }
      if (!keywords) {
        flags.push({
          code: 'no_keywords', severity: 'info',
          message: 'No keyword sources configured — account will only scan ICP profiles',
          detectedAt: checkedAt,
        })
      }
      if (!icps && !keywords) {
        // Upgrade to warning if both are missing
        flags[flags.length - 1].severity = 'warning'
        flags[flags.length - 2].severity = 'warning'
        flags.push({
          code: 'nothing_to_scan', severity: 'warning',
          message: 'No ICPs and no keywords — scans will produce 0 results until configured',
          detectedAt: checkedAt,
        })
      }
    }
  }

  return flags
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!CRON_SECRET || req.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  if (!PLATFORM_TOKEN || !PLATFORM_BASE) {
    return NextResponse.json({ error: 'Platform Airtable not configured' }, { status: 500 })
  }

  const checkedAt = new Date().toISOString()
  const results: { id: string; email: string; flags: number; error?: string }[] = []

  try {
    // Fetch all tenants
    const allTenants: any[] = []
    let offset: string | undefined

    do {
      const url = new URL(`${AIRTABLE_API}/${PLATFORM_BASE}/Tenants`)
      url.searchParams.set('pageSize', '100')
      if (offset) url.searchParams.set('offset', offset)

      const resp = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
      })
      if (!resp.ok) {
        return NextResponse.json({ error: `Failed to fetch tenants: ${resp.status}` }, { status: 500 })
      }

      const data = await resp.json()
      allTenants.push(...(data.records || []))
      offset = data.offset
    } while (offset)

    // Evaluate flags for each tenant — sequential to avoid Airtable rate limiting
    // at 5 req/s. For 100 tenants × 4-6 calls each = 400-600 calls total.
    // Processing ~10 tenants/sec means ~10-60s for 100 tenants — within maxDuration.
    for (const r of allTenants) {
      const email = r.fields?.['Email'] || r.id

      try {
        const flags = await evaluateFlags(r, checkedAt)
        await patchTenantFlags(r.id, flags, checkedAt)
        results.push({ id: r.id, email, flags: flags.length })
      } catch (e: any) {
        results.push({ id: r.id, email, flags: 0, error: e.message?.slice(0, 80) })
      }

      // Throttle to stay comfortably under Airtable's 5 req/s limit
      // Each tenant evaluation uses ~4-6 calls; sleeping 200ms between tenants
      // gives ~5 calls per 200ms = 25 calls/sec budget for the tenant itself,
      // but the sequential processing naturally staggers them.
      await new Promise(r => setTimeout(r, 100))
    }

    const flagged = results.filter(r => r.flags > 0).length
    const errors  = results.filter(r => r.error).length

    console.log(`[service-check] Checked ${allTenants.length} tenants — ${flagged} flagged, ${errors} errors`)

    return NextResponse.json({
      ok:        true,
      checkedAt,
      total:     allTenants.length,
      flagged,
      errors,
      results,
    })
  } catch (e: any) {
    console.error('[service-check] Fatal error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
