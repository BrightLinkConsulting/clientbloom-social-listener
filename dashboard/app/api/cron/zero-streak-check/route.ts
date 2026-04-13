/**
 * GET /api/cron/zero-streak-check
 *
 * Sends a one-time reengagement email to tenants whose consecutive zero-scan
 * streak has reached or exceeded ZERO_STREAK_THRESHOLD (5 scans).
 *
 * ── Design constraints ────────────────────────────────────────────────────────
 * - ONE email per tenant per cooldown window (14 days), not a sequence.
 *   Prevents harassing users who are having a normal quiet stretch.
 * - cooldown is tracked via "Zero Streak Email Sent At" on the Tenants table.
 *   If that field is null OR older than COOLDOWN_DAYS, the email fires.
 * - Only sent to Active tenants. Expired trial / suspended tenants are excluded.
 * - consecutiveZeroScans is read from the Scan Health table, not the Tenants
 *   table, so the counter stays normalized and resets correctly.
 *
 * ── Schedule ─────────────────────────────────────────────────────────────────
 * Runs once daily (vercel.json: "0 10 * * *" = 10:00 UTC / ~3 AM PDT).
 * Low-frequency cron is intentional: the email fires at most once per 14 days,
 * so checking more than daily adds no value.
 *
 * ── Protected by CRON_SECRET ─────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from 'next/server'
import { buildZeroStreakEmail }       from '@/lib/emails'

export const maxDuration = 60

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN    || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID  || ''
const RESEND_KEY     = process.env.RESEND_API_KEY              || ''
const BASE_URL_VAL   = (process.env.NEXT_PUBLIC_BASE_URL || 'https://scout.clientbloom.ai').replace(/\/$/, '')

// A streak of 5 means:
//   Trial/Starter (1 scan/day) → 5 days of no results
//   Pro/Agency   (2 scans/day) → 2.5 days of no results
const ZERO_STREAK_THRESHOLD = 5
const COOLDOWN_DAYS         = 14

// ── Airtable helpers ──────────────────────────────────────────────────────────

async function fetchAllPages(baseUrl: URL): Promise<any[]> {
  const records: any[] = []
  let offset: string | undefined
  do {
    const url = new URL(baseUrl.toString())
    if (offset) url.searchParams.set('offset', offset)
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` } })
    if (!res.ok) throw new Error(`Airtable error: ${res.status} — ${await res.text()}`)
    const data = await res.json()
    records.push(...(data.records || []))
    offset = data.offset
  } while (offset)
  return records
}

/** Fetch all Active tenants with email + plan + email-opt-out + cooldown field. */
async function fetchActiveTenants(): Promise<{
  id:                    string
  email:                 string
  plan:                  string
  tenantId:              string
  emailOptedOut:         boolean
  zeroStreakEmailSentAt: string | null
}[]> {
  const url = new URL(`https://api.airtable.com/v0/${PLATFORM_BASE}/Tenants`)
  url.searchParams.set('filterByFormula', `{Status}='Active'`)
  url.searchParams.set('fields[]',  'Email')
  url.searchParams.append('fields[]', 'Plan')
  url.searchParams.append('fields[]', 'Tenant ID')
  url.searchParams.append('fields[]', 'Email Opted Out')
  url.searchParams.append('fields[]', 'Zero Streak Email Sent At')
  url.searchParams.set('pageSize', '100')

  const records = await fetchAllPages(url)
  return records.map((r: any) => ({
    id:                    r.id,
    email:                 r.fields['Email']                      || '',
    plan:                  r.fields['Plan']                       || '',
    tenantId:              r.fields['Tenant ID']                  || '',
    emailOptedOut:         r.fields['Email Opted Out']            === true,
    zeroStreakEmailSentAt: r.fields['Zero Streak Email Sent At']  || null,
  }))
}

/**
 * Fetch ALL Scan Health records and return a map of tenantId → consecutiveZeroScans.
 *
 * We intentionally fetch the full table rather than building an OR filter formula,
 * because the OR formula grows proportionally with tenant count and will exceed
 * Airtable's URL length limit at ~50+ tenants. The Scan Health table has exactly
 * one record per tenant, so a full-table read is fast and stays within API limits.
 */
async function fetchAllScanHealth(): Promise<Map<string, number>> {
  const url = new URL(
    `https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent('Scan Health')}`
  )
  url.searchParams.set('fields[]',  'Tenant ID')
  url.searchParams.append('fields[]', 'Consecutive Zero Scans')
  url.searchParams.set('pageSize', '100')

  const records = await fetchAllPages(url)
  const map = new Map<string, number>()
  for (const r of records) {
    const tid   = r.fields['Tenant ID']              || ''
    const count = r.fields['Consecutive Zero Scans'] || 0
    if (tid) map.set(tid, count)
  }
  return map
}

/** Write Zero Streak Email Sent At timestamp to prevent duplicate sends. */
async function markEmailSent(recordId: string): Promise<void> {
  await fetch(`https://api.airtable.com/v0/${PLATFORM_BASE}/Tenants/${recordId}`, {
    method:  'PATCH',
    headers: { Authorization: `Bearer ${PLATFORM_TOKEN}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ fields: { 'Zero Streak Email Sent At': new Date().toISOString() } }),
  })
}

// ── Email sender ──────────────────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_KEY) {
    console.log(`[zero-streak-check] Would send "${subject}" to ${to} — RESEND_API_KEY not set`)
    return false
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        from:    'Mike at Scout <info@clientbloom.ai>',
        to:      [to],
        subject,
        html,
      }),
    })
    if (!res.ok) {
      console.error(`[zero-streak-check] Resend ${res.status} for ${to}: ${await res.text()}`)
    }
    return res.ok
  } catch (e) {
    console.error('[zero-streak-check] Email send error:', e)
    return false
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  if (!PLATFORM_TOKEN || !PLATFORM_BASE) {
    return NextResponse.json({ error: 'Platform Airtable not configured.' }, { status: 500 })
  }

  const started = Date.now()
  console.log(`[zero-streak-check] Starting at ${new Date().toISOString()}`)

  // ── 1. Fetch all active tenants ───────────────────────────────────────────────
  let tenants: Awaited<ReturnType<typeof fetchActiveTenants>>
  try {
    tenants = await fetchActiveTenants()
  } catch (e: any) {
    console.error('[zero-streak-check] Failed to fetch tenants:', e.message)
    return NextResponse.json({ error: 'Failed to fetch tenants' }, { status: 500 })
  }

  // ── 2. Filter out opted-out tenants + those in cooldown ───────────────────────
  const now          = Date.now()
  const cooldownMs   = COOLDOWN_DAYS * 24 * 60 * 60 * 1000
  const candidates   = tenants.filter(t => {
    if (!t.email)          return false
    if (t.emailOptedOut)   return false
    if (!t.tenantId)       return false
    if (t.zeroStreakEmailSentAt) {
      const sentAt = new Date(t.zeroStreakEmailSentAt).getTime()
      if (!isNaN(sentAt) && now - sentAt < cooldownMs) return false
    }
    return true
  })

  if (candidates.length === 0) {
    console.log('[zero-streak-check] No eligible tenants after opt-out + cooldown filter')
    return NextResponse.json({ ok: true, checked: tenants.length, eligible: 0, sent: 0 })
  }

  // ── 3. Fetch all Scan Health records ─────────────────────────────────────────
  let streakMap: Map<string, number>
  try {
    streakMap = await fetchAllScanHealth()
  } catch (e: any) {
    console.error('[zero-streak-check] Failed to fetch scan health:', e.message)
    return NextResponse.json({ error: 'Failed to fetch scan health' }, { status: 500 })
  }

  // ── 4. Send emails to qualifying tenants ──────────────────────────────────────
  let sent    = 0
  let skipped = 0

  for (const tenant of candidates) {
    const streak = streakMap.get(tenant.tenantId) ?? 0

    if (streak < ZERO_STREAK_THRESHOLD) {
      skipped++
      continue
    }

    console.log(`[zero-streak-check] Sending to ${tenant.email} — streak=${streak}`)

    const settingsUrl = `${BASE_URL_VAL}/settings?tab=linkedin`
    const unsubUrl    = `${BASE_URL_VAL}/api/unsubscribe?email=${encodeURIComponent(tenant.email)}`

    const { subject, html } = buildZeroStreakEmail(
      tenant.email,
      streak,
      tenant.plan,
      { appUrl: BASE_URL_VAL, settingsUrl, unsubUrl },
    )

    const ok = await sendEmail(tenant.email, subject, html)

    if (ok) {
      sent++
      // Mark sent — non-fatal if this PATCH fails (worst case: duplicate email on next run)
      try {
        await markEmailSent(tenant.id)
      } catch (e: any) {
        console.error(`[zero-streak-check] Failed to mark sent for ${tenant.email}:`, e.message)
      }
    }
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`[zero-streak-check] Done in ${elapsed}s — checked ${tenants.length}, eligible ${candidates.length}, sent ${sent}, skipped ${skipped}`)

  return NextResponse.json({
    ok:       true,
    checked:  tenants.length,
    eligible: candidates.length,
    sent,
    skipped,
    elapsed: `${elapsed}s`,
  })
}
