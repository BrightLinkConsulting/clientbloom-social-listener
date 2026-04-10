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
 * Additionally:
 *   - Sends customer-facing emails for new actionable flags (warning/critical)
 *     with a 24-hour cooldown and per-code dedup to prevent spam
 *   - Sends a batched admin Slack alert when any tenant gains a new critical flag
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
 *   paid_no_scan_ever     Paid account > 48h old, never scanned
 *   nothing_to_scan       No ICPs AND no keywords — all scans will be empty
 *
 * INFO (awareness only — no email, no Slack):
 *   no_icps_configured    Account has no ICP profiles saved (nothing to scan)
 *   no_keywords           Account has no keyword sources configured
 *
 * ── Customer email cadence ────────────────────────────────────────────────────
 * Flags eligible for tenant-facing email:
 *   nothing_to_scan, paid_zero_posts, scan_failed, paid_no_scan_48h,
 *   trial_no_setup, paid_no_scan_ever
 *
 * Not emailed to tenant (admin-only):
 *   trial_billing_mismatch, scan_stalled, trial_expiring_48h (handled by
 *   trial-check cron), no_icps_configured, no_keywords
 *
 * Dedup rules (stored in Tenants table):
 *   Service Flag Email Sent At  — throttle: skip if sent < 24h ago
 *   Last Flag Codes Emailed     — per-code: skip codes already sent
 *   Reset both when account becomes fully healthy (0 actionable flags)
 *
 * ── Admin Slack alert ─────────────────────────────────────────────────────────
 * One batched Slack message per cron run (not per tenant) when any tenant
 * gains a new critical flag. SLACK_WEBHOOK_URL must be set in Vercel env.
 *
 * ── Airtable fields required ──────────────────────────────────────────────────
 * Tenants table (add if missing):
 *   Service Flags              (Long text)  — JSON array of ServiceFlag objects
 *   Service Checked At         (Date/time)  — timestamp of last service-check run
 *   Service Flag Email Sent At (Date/time)  — when last flag email was sent
 *   Last Flag Codes Emailed    (Long text)  — JSON array of flag codes emailed
 *
 * Secured by CRON_SECRET env var.
 */

import { NextRequest, NextResponse } from 'next/server'
import { escapeAirtableString } from '@/lib/airtable'
import {
  sendServiceFlagEmail,
  sendCriticalFlagSlackAlert,
  type CriticalFlagAlert,
} from '@/lib/notify'

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const CRON_SECRET    = process.env.CRON_SECRET               || ''
const AIRTABLE_API   = 'https://api.airtable.com/v0'
const BASE_URL       = (process.env.NEXT_PUBLIC_BASE_URL || 'https://scout.clientbloom.ai').replace(/\/$/, '')

export const maxDuration = 300

// ── Types ─────────────────────────────────────────────────────────────────────

interface ServiceFlag {
  code:       string
  severity:   'critical' | 'warning' | 'info'
  message:    string
  detectedAt: string
}

// Flags eligible for customer-facing email notifications.
// Excludes: trial_expiring_48h (handled by trial-check), scan_stalled
// (transient — not worth emailing), trial_billing_mismatch (admin-only),
// no_icps_configured, no_keywords (info-level only).
const CUSTOMER_EMAIL_CODES = new Set([
  'nothing_to_scan',
  'paid_zero_posts',
  'scan_failed',
  'paid_no_scan_48h',
  'trial_no_setup',
  'paid_no_scan_ever',
])

// Critical flags that trigger an admin Slack alert.
const ADMIN_SLACK_CODES = new Set([
  'paid_no_scan_48h',
  'scan_failed',
  'trial_billing_mismatch',
])

const EMAIL_COOLDOWN_MS = 24 * 60 * 60 * 1000 // 24 hours

// ── Airtable helpers ──────────────────────────────────────────────────────────

/**
 * Write flags + checkedAt timestamp to a Tenant record.
 * This is the primary write — notification state is written separately.
 */
async function patchTenantFlags(recordId: string, flags: ServiceFlag[], checkedAt: string): Promise<void> {
  const url = `${AIRTABLE_API}/${PLATFORM_BASE}/Tenants/${recordId}`
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization:  `Bearer ${PLATFORM_TOKEN}`,
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
    console.error(`[service-check] Failed to patch flags on ${recordId}: HTTP ${resp.status} — ${body.slice(0, 200)}`)
    if (resp.status === 422) {
      console.error('[service-check] 422 likely means "Service Flags" or "Service Checked At" fields are missing from the Tenants table.')
    }
  }
}

/**
 * Write notification dedup state: when we last emailed + which codes we sent.
 * Called after a flag email is sent, and also on reset (all flags cleared).
 *
 * emailSentAt:
 *   string  — ISO timestamp to write (email was just sent)
 *   undefined — do NOT touch this field (reset path: preserve existing cooldown)
 *
 * Preserving Service Flag Email Sent At on reset is intentional: if an account
 * heals and then breaks again within 24h, we don't want to spam the user with
 * a new email. The 24h cooldown must survive a heal/break cycle.
 */
async function patchNotificationState(
  recordId:     string,
  emailSentAt:  string | undefined,
  emailedCodes: string[],
): Promise<void> {
  const fields: Record<string, string | null> = {
    'Last Flag Codes Emailed': JSON.stringify(emailedCodes),
  }
  // Only write Service Flag Email Sent At when explicitly provided (email just sent)
  if (emailSentAt !== undefined) {
    fields['Service Flag Email Sent At'] = emailSentAt
  }

  const url = `${AIRTABLE_API}/${PLATFORM_BASE}/Tenants/${recordId}`
  const resp = await fetch(url, {
    method:  'PATCH',
    headers: { Authorization: `Bearer ${PLATFORM_TOKEN}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ fields }),
  })
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    console.error(`[service-check] Failed to patch notification state on ${recordId}: HTTP ${resp.status} — ${body.slice(0, 200)}`)
    if (resp.status === 422) {
      console.error('[service-check] 422 likely means "Service Flag Email Sent At" or "Last Flag Codes Emailed" fields are missing from the Tenants table. Run the Airtable field setup script.')
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
    return (data.records || []).length
  } catch { return -1 }
}

/** Fetch scan health record for a tenant. */
async function getScanHealth(tenantId: string): Promise<{
  lastScanAt: string | null; lastScanStatus: string | null; lastError: string | null
} | null> {
  const filter = `{Tenant ID}='${escapeAirtableString(tenantId)}'`
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

const PAID_PLANS   = new Set(['Scout Starter', 'Scout Pro', 'Scout Agency'])
const ACTIVE_PLANS = new Set(['Scout Starter', 'Scout Pro', 'Scout Agency', 'Trial', 'Owner', 'Complimentary'])

async function evaluateFlags(r: any, checkedAt: string): Promise<ServiceFlag[]> {
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
  // Skip suspended accounts — already in known terminal states
  if (status === 'Suspended') return []

  // ── Billing mismatch: trial expired but status not updated ─────────────────
  if (plan === 'Trial' && trialEndsAt && new Date(trialEndsAt).getTime() < now && status !== 'trial_expired') {
    flags.push({
      code: 'trial_billing_mismatch', severity: 'critical',
      message: `Trial ended ${Math.floor((now - new Date(trialEndsAt).getTime()) / 86400000)}d ago but status is still '${status}' — trial-check cron may be delayed`,
      detectedAt: checkedAt,
    })
  }

  if (status === 'trial_expired') return flags // billing mismatch is the only relevant check for expired

  // ── Paid account health ─────────────────────────────────────────────────────
  if (PAID_PLANS.has(plan)) {
    const health = await getScanHealth(tenantId)

    if (health?.lastScanAt) {
      const lastScanMs = new Date(health.lastScanAt).getTime()
      const hoursAgo   = (now - lastScanMs) / 3600000
      if (hoursAgo > 48) {
        flags.push({
          code: 'paid_no_scan_48h', severity: 'critical',
          message: `Last successful scan was ${Math.floor(hoursAgo)}h ago — scans may be broken for this paid account`,
          detectedAt: checkedAt,
        })
      }
    } else if (!health?.lastScanAt) {
      if (createdAt && (now - new Date(createdAt).getTime()) > 48 * 3600000) {
        flags.push({
          code: 'paid_no_scan_ever', severity: 'warning',
          message: `Paid account created > 48h ago with no scan recorded`,
          detectedAt: checkedAt,
        })
      }
    }

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
          message: `Scan has been in 'scanning' state for ${Math.floor(minsSinceStart)}m — may be stuck`,
          detectedAt: checkedAt,
        })
      }
    }

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
  if (plan === 'Trial' && status === 'Active') {
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

  // ── Config checks (all active accounts) ────────────────────────────────────
  if (ACTIVE_PLANS.has(plan) && status === 'Active') {
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
        // Upgrade both info flags to warning + add a combined flag
        const noIcpsIdx = flags.findIndex(f => f.code === 'no_icps_configured')
        const noKwIdx   = flags.findIndex(f => f.code === 'no_keywords')
        if (noIcpsIdx !== -1) flags[noIcpsIdx].severity = 'warning'
        if (noKwIdx   !== -1) flags[noKwIdx].severity   = 'warning'
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

// ── Notification dispatch ────────────────────────────────────────────────────

/**
 * Decide whether to send a customer email for this tenant's flags, handle
 * dedup, and dispatch both customer email and admin Slack accumulation.
 *
 * Returns a CriticalFlagAlert if this tenant has new critical flags (for
 * batching into the end-of-run Slack message), or null otherwise.
 */
async function dispatchNotifications(
  r:          any,
  flags:      ServiceFlag[],
  checkedAt:  string,
): Promise<CriticalFlagAlert | null> {
  const email        = r.fields?.['Email']                     || ''
  const sentAtRaw    = r.fields?.['Service Flag Email Sent At'] || null
  const sentCodesRaw = r.fields?.['Last Flag Codes Emailed']   || '[]'
  const recordId     = r.id

  // ── Parse previously emailed codes ─────────────────────────────────────────
  let sentCodes: string[] = []
  try { sentCodes = JSON.parse(sentCodesRaw) } catch { sentCodes = [] }
  if (!Array.isArray(sentCodes)) sentCodes = []

  // ── Flags eligible for customer email ──────────────────────────────────────
  const actionableFlags = flags.filter(
    f => f.severity !== 'info' && CUSTOMER_EMAIL_CODES.has(f.code)
  )
  const actionableCodes = actionableFlags.map(f => f.code)
  // New = not in the previously-sent codes list
  const newCodes        = actionableCodes.filter(c => !sentCodes.includes(c))

  // ── Customer email ─────────────────────────────────────────────────────────
  // Send only when: there are new codes AND the 24h cooldown has passed
  const lastSentMs     = sentAtRaw ? new Date(sentAtRaw).getTime() : 0
  const cooldownPassed = !sentAtRaw || (Date.now() - lastSentMs) > EMAIL_COOLDOWN_MS

  if (email && newCodes.length > 0 && cooldownPassed) {
    const flagsToSend = actionableFlags.filter(f => newCodes.includes(f.code))
    const sent = await sendServiceFlagEmail({ to: email, flags: flagsToSend })

    if (sent) {
      const allSentCodes = Array.from(new Set(sentCodes.concat(newCodes)))
      await patchNotificationState(recordId, new Date().toISOString(), allSentCodes)
    }
  }

  // ── Reset dedup state when account is fully clean ─────────────────────────
  // Clear Last Flag Codes Emailed so a future recurrence of a flag triggers
  // a fresh email. We do NOT touch Service Flag Email Sent At here — that
  // cooldown timestamp intentionally survives a heal/break cycle to prevent
  // rapid re-notification on flapping accounts.
  if (actionableCodes.length === 0 && sentCodes.length > 0) {
    await patchNotificationState(recordId, undefined, [])
  }

  // ── Admin Slack accumulation ───────────────────────────────────────────────
  // Return a CriticalFlagAlert for any NEW critical flags on this tenant.
  // The caller batches these and sends one Slack message at the end of the run.
  const newCriticalFlags = flags.filter(
    f => f.severity === 'critical' &&
         ADMIN_SLACK_CODES.has(f.code) &&
         !sentCodes.includes(f.code)   // only alert on genuinely new flags
  )

  if (newCriticalFlags.length > 0 && email) {
    return {
      email,
      flagCodes: newCriticalFlags.map(f => f.code),
      messages:  newCriticalFlags.map(f => f.message),
    }
  }

  return null
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!CRON_SECRET || req.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  if (!PLATFORM_TOKEN || !PLATFORM_BASE) {
    return NextResponse.json({ error: 'Platform Airtable not configured' }, { status: 500 })
  }

  const checkedAt     = new Date().toISOString()
  const results: { id: string; email: string; flags: number; emailedCodes?: string[]; error?: string }[] = []
  const criticalAlerts: CriticalFlagAlert[] = []

  try {
    // Fetch all tenants — no fields[] restriction so notification state fields are included
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

    // Evaluate flags for each tenant sequentially to stay under Airtable rate limits.
    // Each tenant: ~4-6 Airtable reads + 1-2 writes (flags + optional notification state).
    for (const r of allTenants) {
      const email = r.fields?.['Email'] || r.id

      try {
        const flags = await evaluateFlags(r, checkedAt)

        // Write flags to Airtable first
        await patchTenantFlags(r.id, flags, checkedAt)

        // Then dispatch notifications (email + Slack accumulation)
        const criticalAlert = await dispatchNotifications(r, flags, checkedAt)
        if (criticalAlert) criticalAlerts.push(criticalAlert)

        const newCodes = flags
          .filter(f => f.severity !== 'info' && CUSTOMER_EMAIL_CODES.has(f.code))
          .map(f => f.code)

        results.push({ id: r.id, email, flags: flags.length, emailedCodes: newCodes })
      } catch (e: any) {
        results.push({ id: r.id, email, flags: 0, error: e.message?.slice(0, 80) })
      }

      // Throttle to stay comfortably under Airtable's 5 req/s limit.
      // Each tenant uses ~4-8 calls; 100ms sleep provides natural staggering.
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // Send one batched admin Slack alert for all new critical flags this run
    if (criticalAlerts.length > 0) {
      await sendCriticalFlagSlackAlert(criticalAlerts, `${BASE_URL}/admin`)
    }

    const flagged  = results.filter(r => r.flags > 0).length
    const errors   = results.filter(r => r.error).length
    const emailed  = results.filter(r => r.emailedCodes && r.emailedCodes.length > 0).length

    console.log(
      `[service-check] Checked ${allTenants.length} tenants — ` +
      `${flagged} flagged, ${emailed} emailed, ${criticalAlerts.length} Slack alerts, ${errors} errors`
    )

    return NextResponse.json({
      ok:             true,
      checkedAt,
      total:          allTenants.length,
      flagged,
      emailed,
      slackAlerts:    criticalAlerts.length,
      errors,
      results,
    })
  } catch (e: any) {
    console.error('[service-check] Fatal error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
