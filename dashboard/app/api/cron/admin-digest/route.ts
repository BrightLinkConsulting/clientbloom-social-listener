/**
 * /api/cron/admin-digest
 *
 * Daily admin digest — runs once per day at 9 AM Pacific (17:00 UTC).
 *
 * Purpose
 * ───────
 * The service-check cron handles automated first contact (customer emails +
 * immediate Slack alerts for critical flags). This cron handles the follow-up
 * layer: surfacing accounts that were notified but still haven't resolved their
 * issues 72+ hours later. These accounts need personal admin outreach.
 *
 * Logic
 * ─────
 * 1. Fetch all tenant records from Airtable (fields limited to what we need)
 * 2. Filter for accounts where:
 *    - Service Flags is non-empty (still has active flags)
 *    - Service Flag Email Sent At is > 72 hours ago (notified but unresolved)
 *    - Is Admin !== true (skip internal accounts)
 *    - Status is not 'Suspended' or 'trial_expired' (skip inactive accounts)
 * 3. Separate into paid vs. trial groups
 * 4. Post one Slack message to #clientbloom-support
 *    - Paid accounts: "respond today" section (highest priority)
 *    - Trial accounts: "personal outreach recommended" section
 *    - All clear message if no lingering accounts
 * 5. Return JSON summary
 *
 * Badge auto-clearing
 * ───────────────────
 * Flag badges in the admin panel clear automatically. The service-check cron
 * overwrites Service Flags on every run — when evaluateFlags() returns [] for
 * a resolved account, Airtable is patched with [] and the badge disappears on
 * the next admin panel refresh. No manual clearing needed.
 *
 * Env vars required
 * ─────────────────
 * CRON_SECRET          — must match Authorization header
 * AIRTABLE_TOKEN       — Airtable personal access token (platform base)
 * AIRTABLE_BASE_ID     — platform Tenants table base ID
 * SLACK_WEBHOOK_URL    — incoming webhook for #clientbloom-support (optional)
 * NEXT_PUBLIC_BASE_URL — canonical app URL (falls back to scout.clientbloom.ai)
 */

import { NextRequest, NextResponse } from 'next/server'
import { sendLingeringAccountsDigest, type LingeringAccount } from '@/lib/notify'

const CRON_SECRET    = process.env.CRON_SECRET        || ''
const PLATFORM_TOKEN = process.env.AIRTABLE_TOKEN     || ''
const PLATFORM_BASE  = process.env.AIRTABLE_BASE_ID   || ''
const AIRTABLE_API   = 'https://api.airtable.com/v0'
const BASE_URL       = (process.env.NEXT_PUBLIC_BASE_URL || 'https://scout.clientbloom.ai').replace(/\/$/, '')

const LINGER_THRESHOLD_MS = 72 * 60 * 60 * 1000   // 72 hours

// Statuses that mean the account is inactive — don't include in digest
const SKIP_STATUSES = new Set(['Suspended', 'trial_expired'])

export async function GET(req: NextRequest) {
  if (!CRON_SECRET || req.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  if (!PLATFORM_TOKEN || !PLATFORM_BASE) {
    return NextResponse.json({ error: 'Platform Airtable not configured' }, { status: 500 })
  }

  const checkedAt = new Date().toISOString()

  try {
    // Fetch tenant records — only the fields we need for the digest
    const allTenants: any[] = []
    let offset: string | undefined

    do {
      const url = new URL(`${AIRTABLE_API}/${PLATFORM_BASE}/Tenants`)
      url.searchParams.set('pageSize', '100')
      url.searchParams.append('fields[]', 'Email')
      url.searchParams.append('fields[]', 'Plan')
      url.searchParams.append('fields[]', 'Is Admin')
      url.searchParams.append('fields[]', 'Status')
      url.searchParams.append('fields[]', 'Service Flags')
      url.searchParams.append('fields[]', 'Service Flag Email Sent At')
      if (offset) url.searchParams.set('offset', offset)

      const resp = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
      })

      if (!resp.ok) {
        const body = await resp.text().catch(() => '')
        console.error(`[admin-digest] Airtable fetch failed: ${resp.status} — ${body.slice(0, 200)}`)
        return NextResponse.json({ error: `Airtable fetch failed: ${resp.status}` }, { status: 500 })
      }

      const data = await resp.json()
      allTenants.push(...(data.records || []))
      offset = data.offset
    } while (offset)

    const now             = Date.now()
    const lingeringAccounts: LingeringAccount[] = []

    for (const r of allTenants) {
      const fields = r.fields || {}

      // Skip internal admin accounts
      if (fields['Is Admin'] === true) continue

      // Skip inactive accounts
      const status = fields['Status'] || ''
      if (SKIP_STATUSES.has(status)) continue

      // Must have been notified by email
      const emailedAt = fields['Service Flag Email Sent At']
      if (!emailedAt) continue

      // Must still be within 72h linger window
      const emailedMs = new Date(emailedAt).getTime()
      if (isNaN(emailedMs) || now - emailedMs < LINGER_THRESHOLD_MS) continue

      // Must still have active flags
      let flags: any[] = []
      try {
        const raw = fields['Service Flags']
        if (raw) flags = JSON.parse(raw)
      } catch {
        // malformed JSON — treat as no flags
      }
      if (!Array.isArray(flags) || flags.length === 0) continue

      const flagCodes = flags.map((f: any) => f.code || '').filter(Boolean)
      if (flagCodes.length === 0) continue

      lingeringAccounts.push({
        email:     fields['Email']  || r.id,
        plan:      fields['Plan']   || 'Unknown',
        flagCodes,
        emailedAt,
      })
    }

    // Sort: paid first, then trial; within each group, longest-waiting first
    lingeringAccounts.sort((a, b) => {
      const aPaid = a.plan !== 'Trial' ? 0 : 1
      const bPaid = b.plan !== 'Trial' ? 0 : 1
      if (aPaid !== bPaid) return aPaid - bPaid
      return new Date(a.emailedAt).getTime() - new Date(b.emailedAt).getTime()
    })

    await sendLingeringAccountsDigest(lingeringAccounts, `${BASE_URL}/admin`)

    return NextResponse.json({
      ok:          true,
      checkedAt,
      total:       allTenants.length,
      lingering:   lingeringAccounts.length,
      accounts:    lingeringAccounts.map(a => ({
        email:     a.email,
        plan:      a.plan,
        flagCodes: a.flagCodes,
        emailedAt: a.emailedAt,
      })),
    })
  } catch (e: any) {
    console.error('[admin-digest] Unexpected error:', e)
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 })
  }
}
