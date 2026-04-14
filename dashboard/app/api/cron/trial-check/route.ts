/**
 * /api/cron/trial-check — Trial expiry enforcement + 7-day email sequence
 *
 * Runs every 6 hours (vercel.json schedule: every 6h).
 *
 * ── JOB 1: Email sequence sender ─────────────────────────────────────────────
 * Finds active Trial tenants and sends the correct day's email based on the
 * "Trial Email Day" field. Respects "Trial Last Email Sent At" to prevent
 * double-sends (requires >= 20 hours between emails). Skips opted-out tenants
 * (Email Opted Out = true).
 *
 * Email templates are from lib/emails.ts — the single source of truth.
 * All marketing emails include a CAN-SPAM-compliant unsubscribe link
 * pointing to /api/unsubscribe?email=<encoded>.
 *
 * ── JOB 2: Trial expiry enforcement ──────────────────────────────────────────
 * Finds tenants where Trial Ends At is in the past and Status is still Active.
 * Sets Status = 'trial_expired'. Sends the expiry email if Day 7 sequence
 * email was not already sent.
 *
 * ── Protected by CRON_SECRET bearer token ────────────────────────────────────
 */

import { NextResponse } from 'next/server'
import {
  buildTrialDay2Email,
  buildTrialDay3Email,
  buildTrialDay4Email,
  buildTrialDay5Email,
  buildTrialDay6Email,
  buildTrialDay7Email,
  buildTrialExpiredEmail,
  buildTrialWinBackEmail,
  buildAdminTrialExpiredEmail,
} from '@/lib/emails'
import { ghlMoveToExpired } from '@/lib/ghl-platform'

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const RESEND_KEY     = process.env.RESEND_API_KEY             || ''
const BASE_URL       = (process.env.NEXT_PUBLIC_BASE_URL || 'https://scout.clientbloom.ai').replace(/\/$/, '')
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL || 'twp1996@gmail.com'

export const maxDuration = 60

// ── Airtable helpers ───────────────────────────────────────────────────────────

/** Fetch all pages from an Airtable URL with offset-based pagination. */
async function fetchAllPages(baseUrl: URL): Promise<any[]> {
  const records: any[] = []
  let offset: string | undefined

  do {
    const url = new URL(baseUrl.toString())
    if (offset) url.searchParams.set('offset', offset)
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` } })
    if (!res.ok) throw new Error(`Airtable fetch failed: ${res.status}`)
    const data = await res.json()
    records.push(...(data.records || []))
    offset = data.offset
  } while (offset)

  return records
}

async function fetchTrialTenants() {
  const url = new URL(`https://api.airtable.com/v0/${PLATFORM_BASE}/Tenants`)
  url.searchParams.set('filterByFormula', `AND({Plan}='Trial',{Status}='Active')`)
  url.searchParams.set('fields[]', 'Email')
  url.searchParams.append('fields[]', 'Company Name')
  url.searchParams.append('fields[]', 'Trial Ends At')
  url.searchParams.append('fields[]', 'Trial Email Day')
  url.searchParams.append('fields[]', 'Trial Last Email Sent At')
  url.searchParams.append('fields[]', 'Email Opted Out')
  url.searchParams.set('pageSize', '100')
  return fetchAllPages(url)
}

/** Fetch trial_expired tenants eligible for the win-back email (day ~10).
 *  Criteria: status=trial_expired, Trial Ends At <= 3 days ago, Trial Email Day < 10.
 *  Trial Email Day < 10 is the sentinel that the win-back hasn't been sent yet.
 */
async function fetchWinBackCandidates(threeDaysAgoIso: string) {
  const url = new URL(`https://api.airtable.com/v0/${PLATFORM_BASE}/Tenants`)
  url.searchParams.set(
    'filterByFormula',
    `AND({Status}='trial_expired',{Trial Ends At}<'${threeDaysAgoIso}',{Trial Email Day}<10)`
  )
  url.searchParams.set('fields[]', 'Email')
  url.searchParams.append('fields[]', 'Company Name')
  url.searchParams.append('fields[]', 'Email Opted Out')
  url.searchParams.set('pageSize', '100')
  return fetchAllPages(url)
}

async function updateTenant(recordId: string, fields: Record<string, unknown>) {
  const res = await fetch(
    `https://api.airtable.com/v0/${PLATFORM_BASE}/Tenants/${recordId}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${PLATFORM_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    }
  )
  if (!res.ok) throw new Error(await res.text())
}

// ── Email sender ───────────────────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_KEY) {
    console.log(`[trial-check] Would send "${subject}" to ${to} — RESEND_API_KEY not set`)
    return false
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    'Mike at Scout <info@clientbloom.ai>',
        to:      [to],
        subject,
        html,
      }),
    })
    if (!res.ok) {
      console.error(`[trial-check] Resend returned ${res.status} for ${to}`)
    }
    return res.ok
  } catch (e) {
    console.error('[trial-check] Email send failed:', e)
    return false
  }
}

// ── Email builder ──────────────────────────────────────────────────────────────

/**
 * Build the correct day's email using the centralized lib/emails.ts templates.
 * All marketing emails include a CAN-SPAM unsubscribe link.
 */
function buildEmailForDay(
  day:   number,
  email: string,
): { subject: string; html: string } | null {
  const appUrl     = BASE_URL
  const upgradeUrl = `${BASE_URL}/upgrade`
  const unsubUrl   = `${BASE_URL}/api/unsubscribe?email=${encodeURIComponent(email)}`

  switch (day) {
    case 2: return buildTrialDay2Email({ appUrl, unsubUrl })
    case 3: return buildTrialDay3Email({ appUrl, unsubUrl })
    case 4: return buildTrialDay4Email({ appUrl, unsubUrl })
    case 5: return buildTrialDay5Email({ appUrl, upgradeUrl, unsubUrl })
    case 6: return buildTrialDay6Email({ upgradeUrl, unsubUrl })
    case 7: return buildTrialDay7Email({ upgradeUrl, unsubUrl })
    default: return null
  }
}

// ── Main handler ───────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  if (!PLATFORM_TOKEN || !PLATFORM_BASE) {
    return NextResponse.json({ error: 'Platform Airtable not configured' }, { status: 500 })
  }

  const now        = new Date()
  const upgradeUrl = `${BASE_URL}/upgrade`

  const results = {
    emailsSent:    0,
    emailsSkipped: 0,
    expired:       0,
    optedOut:      0,
    winBack:       0,
    errors:        0,
  }

  try {
    const threeDaysAgo    = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    const threeDaysAgoIso = threeDaysAgo.toISOString().split('T')[0]

    const [activeTrials, winBackCandidates] = await Promise.all([
      fetchTrialTenants(),
      fetchWinBackCandidates(threeDaysAgoIso),
    ])
    console.log(`[trial-check] Found ${activeTrials.length} active trial tenants, ${winBackCandidates.length} win-back candidates`)

    for (const record of activeTrials) {
      try {
        const email    = (record.fields['Email'] || '').trim()
        const optedOut = !!record.fields['Email Opted Out']

        if (!email) continue

        // Respect unsubscribe — never email opted-out tenants
        if (optedOut) {
          results.optedOut++
          continue
        }

        const trialEndsAt = record.fields['Trial Ends At']
          ? new Date(record.fields['Trial Ends At'])
          : null
        const currentDay  = record.fields['Trial Email Day'] || 1
        const lastSentAt  = record.fields['Trial Last Email Sent At']
          ? new Date(record.fields['Trial Last Email Sent At'])
          : null

        if (!trialEndsAt) continue

        // ── JOB 2: Mark expired trials ─────────────────────────────────────
        if (trialEndsAt < now) {
          await updateTenant(record.id, {
            'Status':          'trial_expired',
            'Trial Email Day': 7,
          })

          // Send expiry email only if the Day 7 sequence email wasn't already sent
          if (currentDay < 7) {
            const unsubUrl = `${BASE_URL}/api/unsubscribe?email=${encodeURIComponent(email)}`
            const expired  = buildTrialExpiredEmail({ upgradeUrl, unsubUrl })
            await sendEmail(email, expired.subject, expired.html)
            results.emailsSent++
          }

          // Admin alert — fires on every trial expiry
          if (ADMIN_EMAIL && RESEND_KEY) {
            const companyName = ((record.fields['Company Name'] || email) as string)
            const adminAlert  = buildAdminTrialExpiredEmail({ email, name: companyName })
            await sendEmail(ADMIN_EMAIL, adminAlert.subject, adminAlert.html)
          }

          // GHL: move to Expired Trial stage (non-fatal)
          ghlMoveToExpired(email).catch(e =>
            console.error(`[trial-check] GHL move to expired failed for ${email}:`, e.message)
          )

          results.expired++
          console.log(`[trial-check] Marked ${email} as trial_expired`)
          continue
        }

        // ── JOB 1: Send sequence emails ────────────────────────────────────
        // Day 1 is sent at signup (trial/start route). This cron sends Days 2–7.
        const trialStartAt   = new Date(trialEndsAt.getTime() - 7 * 24 * 60 * 60 * 1000)
        const daysSinceStart = Math.floor((now.getTime() - trialStartAt.getTime()) / (24 * 60 * 60 * 1000))
        const targetDay      = Math.min(daysSinceStart + 1, 7)

        // Already sent up to this day
        if (currentDay >= targetDay) {
          results.emailsSkipped++
          continue
        }

        // Double-send protection: require >= 20 hours between emails
        if (lastSentAt) {
          const hoursSinceLast = (now.getTime() - lastSentAt.getTime()) / (1000 * 60 * 60)
          if (hoursSinceLast < 20) {
            results.emailsSkipped++
            continue
          }
        }

        const emailContent = buildEmailForDay(targetDay, email)
        if (!emailContent) {
          results.emailsSkipped++
          continue
        }

        const sent = await sendEmail(email, emailContent.subject, emailContent.html)

        if (sent) {
          await updateTenant(record.id, {
            'Trial Email Day':          targetDay,
            'Trial Last Email Sent At': now.toISOString(),
          })
          results.emailsSent++
          console.log(`[trial-check] Sent Day ${targetDay} email to ${email}`)
        } else {
          results.errors++
        }

      } catch (e: any) {
        console.error('[trial-check] Error processing tenant:', e.message)
        results.errors++
      }
    }

    // ── JOB 3: Win-back emails (~3 days post-expiry) ─────────────────────────
    for (const record of winBackCandidates) {
      try {
        const email    = (record.fields['Email'] || '').trim()
        const optedOut = !!record.fields['Email Opted Out']

        if (!email) continue
        if (optedOut) { results.optedOut++; continue }

        const unsubUrl = `${BASE_URL}/api/unsubscribe?email=${encodeURIComponent(email)}`
        const winBack  = buildTrialWinBackEmail({ upgradeUrl, unsubUrl })
        const sent     = await sendEmail(email, winBack.subject, winBack.html)

        if (sent) {
          await updateTenant(record.id, { 'Trial Email Day': 10 })
          results.winBack++
          console.log(`[trial-check] Sent win-back email to ${email}`)
        } else {
          results.errors++
        }
      } catch (e: any) {
        console.error('[trial-check] Error sending win-back email:', e.message)
        results.errors++
      }
    }

  } catch (e: any) {
    console.error('[trial-check] Fatal error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    ...results,
    message: `Trial check complete: ${results.emailsSent} emails sent, ${results.expired} trials expired, ${results.winBack} win-backs, ${results.optedOut} opted out.`,
  })
}
