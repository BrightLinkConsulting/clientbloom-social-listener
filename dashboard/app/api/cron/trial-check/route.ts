/**
 * /api/cron/trial-check — Trial expiry enforcement + 7-day email sequence
 *
 * Runs every 6 hours (schedule: "0 *\/6 * * *" in vercel.json).
 *
 * Two jobs in one:
 *
 * JOB 1 — Email sequence sender
 *   Finds active trial tenants and sends the correct day's email based on
 *   Trial Email Day field. Uses Trial Last Email Sent At to prevent double-sends.
 *   Only sends if >= 20 hours since the last email.
 *
 * JOB 2 — Trial expiry enforcement
 *   Finds tenants where Trial Ends At is in the past and Status is still Active.
 *   Sets Status = 'trial_expired'. Sends the Day 7 expiry email if not already sent.
 *
 * Protected by CRON_SECRET bearer token.
 */

import { NextResponse } from 'next/server'

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const RESEND_KEY     = process.env.RESEND_API_KEY             || ''
const BASE_URL       = (process.env.NEXT_PUBLIC_BASE_URL || 'https://scout.clientbloom.ai').replace(/\/$/, '')

export const maxDuration = 60

// ── Airtable helpers ───────────────────────────────────────────────────────
async function fetchTrialTenants() {
  const url = new URL(`https://api.airtable.com/v0/${PLATFORM_BASE}/Tenants`)
  // Active trial accounts (no Stripe subscription = no-CC trial)
  url.searchParams.set('filterByFormula', `AND({Plan}='Trial',{Status}='Active')`)
  url.searchParams.set('fields[]', 'Email')
  url.searchParams.append('fields[]', 'Company Name')
  url.searchParams.append('fields[]', 'Trial Ends At')
  url.searchParams.append('fields[]', 'Trial Email Day')
  url.searchParams.append('fields[]', 'Trial Last Email Sent At')
  url.searchParams.set('pageSize', '100')

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` } })
  if (!res.ok) throw new Error('Failed to fetch trial tenants')
  const data = await res.json()
  return data.records || []
}

async function fetchExpiredTrials() {
  const now = new Date().toISOString()
  const url = new URL(`https://api.airtable.com/v0/${PLATFORM_BASE}/Tenants`)
  url.searchParams.set(
    'filterByFormula',
    `AND({Plan}='Trial',{Status}='Active',IS_BEFORE({Trial Ends At},'${now}'))`
  )
  url.searchParams.set('fields[]', 'Email')
  url.searchParams.append('fields[]', 'Company Name')
  url.searchParams.append('fields[]', 'Trial Email Day')
  url.searchParams.set('pageSize', '100')

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` } })
  if (!res.ok) throw new Error('Failed to fetch expired trials')
  const data = await res.json()
  return data.records || []
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

// ── Email content per day ──────────────────────────────────────────────────
function getTrialEmailContent(day: number, firstName: string, upgradeUrl: string) {
  const emails: Record<number, { subject: string; html: string }> = {
    2: {
      subject: 'Day 2: The comment that gets you remembered (copy-paste ready)',
      html: `
        <div style="font-family:sans-serif;max-width:540px;margin:0 auto;color:#1a1a1a">
          <div style="background:#4F6BFF;padding:20px 28px;border-radius:12px 12px 0 0">
            <p style="color:#fff;font-size:14px;font-weight:700;margin:0">Scout · Day 2 of 7</p>
          </div>
          <div style="background:#f9f9f9;padding:28px 32px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none">
            <h2 style="margin:0 0 16px;font-size:20px">How to write a comment that gets remembered</h2>
            <p style="color:#444;line-height:1.7;font-size:14px">Hi ${firstName},</p>
            <p style="color:#444;line-height:1.7;font-size:14px">
              Most people comment the same three ways: "Great point!", "So true!", or a paragraph that's actually about themselves. None of these work.
            </p>
            <p style="color:#444;line-height:1.7;font-size:14px">Here's the framework that does:</p>
            <div style="background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:20px;margin:16px 0">
              <p style="margin:0 0 12px;font-weight:700;font-size:14px">The 3-part comment formula:</p>
              <p style="margin:0 0 8px;font-size:14px;color:#333"><strong>1. Name a specific detail from their post</strong> — shows you actually read it</p>
              <p style="margin:0 0 8px;font-size:14px;color:#333"><strong>2. Add one related data point or experience</strong> — builds your authority</p>
              <p style="margin:0 0 0;font-size:14px;color:#333"><strong>3. Ask one real question</strong> — creates a conversation, not a monologue</p>
            </div>
            <p style="color:#444;line-height:1.7;font-size:14px">
              Scout's AI comment suggestions use this exact structure. Open your feed, find a post scored above 75, and look at the suggested angle. That's your starting point.
            </p>
            <a href="${BASE_URL}/" style="display:inline-block;background:#4F6BFF;color:#fff;font-weight:700;padding:12px 24px;border-radius:10px;text-decoration:none;font-size:14px;margin-top:8px">Open your Scout feed →</a>
          </div>
        </div>`,
    },
    3: {
      subject: 'Day 3: Check-in — are your comments landing?',
      html: `
        <div style="font-family:sans-serif;max-width:540px;margin:0 auto;color:#1a1a1a">
          <div style="background:#4F6BFF;padding:20px 28px;border-radius:12px 12px 0 0">
            <p style="color:#fff;font-size:14px;font-weight:700;margin:0">Scout · Day 3 of 7</p>
          </div>
          <div style="background:#f9f9f9;padding:28px 32px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none">
            <h2 style="margin:0 0 16px;font-size:20px">How to tell if it's working</h2>
            <p style="color:#444;line-height:1.7;font-size:14px">Hi ${firstName},</p>
            <p style="color:#444;line-height:1.7;font-size:14px">You should have your first 2–3 comments live by now. Here's how to track whether they're building anything:</p>
            <div style="background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:20px;margin:16px 0">
              <p style="margin:0 0 8px;font-weight:700;font-size:14px">Week 1 signals to watch:</p>
              <p style="margin:0 0 8px;font-size:14px;color:#333">✓ Profile view spike after a comment (check LinkedIn notifications)</p>
              <p style="margin:0 0 8px;font-size:14px;color:#333">✓ Reply from the post author — even a short one counts</p>
              <p style="margin:0 0 0;font-size:14px;color:#333">✓ New connection request from someone in your ICP</p>
            </div>
            <p style="color:#444;line-height:1.7;font-size:14px">
              These won't all happen in week one — but if you get even one, you're doing it right. Mark those posts as "Engaged" in Scout to keep your pipeline organized.
            </p>
            <a href="${BASE_URL}/" style="display:inline-block;background:#4F6BFF;color:#fff;font-weight:700;padding:12px 24px;border-radius:10px;text-decoration:none;font-size:14px;margin-top:8px">Open Scout →</a>
          </div>
        </div>`,
    },
    4: {
      subject: 'Day 4: The best time to comment (most people get this wrong)',
      html: `
        <div style="font-family:sans-serif;max-width:540px;margin:0 auto;color:#1a1a1a">
          <div style="background:#4F6BFF;padding:20px 28px;border-radius:12px 12px 0 0">
            <p style="color:#fff;font-size:14px;font-weight:700;margin:0">Scout · Day 4 of 7</p>
          </div>
          <div style="background:#f9f9f9;padding:28px 32px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none">
            <h2 style="margin:0 0 16px;font-size:20px">Timing is the unfair advantage nobody talks about</h2>
            <p style="color:#444;line-height:1.7;font-size:14px">Hi ${firstName},</p>
            <p style="color:#444;line-height:1.7;font-size:14px">
              LinkedIn's algorithm rewards early engagement. A comment in the first 60–90 minutes of a post's life gets 3–5x more visibility than the same comment posted 6 hours later.
            </p>
            <p style="color:#444;line-height:1.7;font-size:14px">
              Most people open LinkedIn twice a day and scroll what's already trending. By then, the window is closed.
            </p>
            <p style="color:#444;line-height:1.7;font-size:14px">
              Scout scans twice daily — morning and evening — so you're always seeing fresh posts, not yesterday's content. Check your feed first thing in the morning and again in the early evening. That's when you're catching posts in their first hour.
            </p>
            <a href="${BASE_URL}/" style="display:inline-block;background:#4F6BFF;color:#fff;font-weight:700;padding:12px 24px;border-radius:10px;text-decoration:none;font-size:14px;margin-top:8px">Check today's feed →</a>
          </div>
        </div>`,
    },
    5: {
      subject: 'Day 5: Real results — and your trial has 2 days left',
      html: `
        <div style="font-family:sans-serif;max-width:540px;margin:0 auto;color:#1a1a1a">
          <div style="background:#7C3AED;padding:20px 28px;border-radius:12px 12px 0 0">
            <p style="color:#fff;font-size:14px;font-weight:700;margin:0">Scout · Day 5 of 7 — Trial ending soon</p>
          </div>
          <div style="background:#f9f9f9;padding:28px 32px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none">
            <h2 style="margin:0 0 16px;font-size:20px">What 30 days of this actually looks like</h2>
            <p style="color:#444;line-height:1.7;font-size:14px">Hi ${firstName},</p>
            <p style="color:#444;line-height:1.7;font-size:14px">
              Consultants who stick with this approach for 30 days consistently report the same thing: prospects start reaching out first, before any pitch. It's not magic — it's just being visible in conversations your buyers are already having.
            </p>
            <p style="color:#444;line-height:1.7;font-size:14px">Your trial ends in 2 days. Don't lose the momentum you've built.</p>
            <a href="${upgradeUrl}" style="display:inline-block;background:#7C3AED;color:#fff;font-weight:700;padding:14px 28px;border-radius:10px;text-decoration:none;font-size:15px;margin-top:8px">Continue with Scout →</a>
            <p style="font-size:13px;color:#888;margin:16px 0 0">Starting at $49/month · Cancel anytime · No setup fees</p>
          </div>
        </div>`,
    },
    6: {
      subject: 'Day 6: Tomorrow your trial ends — here\'s what stopping at day 7 actually costs',
      html: `
        <div style="font-family:sans-serif;max-width:540px;margin:0 auto;color:#1a1a1a">
          <div style="background:#7C3AED;padding:20px 28px;border-radius:12px 12px 0 0">
            <p style="color:#fff;font-size:14px;font-weight:700;margin:0">Scout · Day 6 of 7 — Trial ends tomorrow</p>
          </div>
          <div style="background:#f9f9f9;padding:28px 32px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none">
            <h2 style="margin:0 0 16px;font-size:20px">Day 7 vs. Day 30 — the difference is stark</h2>
            <p style="color:#444;line-height:1.7;font-size:14px">Hi ${firstName},</p>
            <div style="background:#fff;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;margin:16px 0">
              <table style="width:100%;border-collapse:collapse;font-size:13px">
                <tr style="background:#f5f5f5">
                  <th style="padding:12px 16px;text-align:left;color:#666;font-weight:600">If you stop at day 7</th>
                  <th style="padding:12px 16px;text-align:left;color:#7C3AED;font-weight:600">If you continue to day 30</th>
                </tr>
                <tr>
                  <td style="padding:12px 16px;border-top:1px solid #eee;color:#444">ICP prospects don't know you yet</td>
                  <td style="padding:12px 16px;border-top:1px solid #eee;color:#333">3+ prospects recognize your name</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;border-top:1px solid #eee;color:#444">Cold outreach still required</td>
                  <td style="padding:12px 16px;border-top:1px solid #eee;color:#333">Inbound conversations starting</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;border-top:1px solid #eee;color:#444">Lost the timing advantage</td>
                  <td style="padding:12px 16px;border-top:1px solid #eee;color:#333">First mover in your niche's feed</td>
                </tr>
              </table>
            </div>
            <a href="${upgradeUrl}" style="display:inline-block;background:#7C3AED;color:#fff;font-weight:700;padding:14px 28px;border-radius:10px;text-decoration:none;font-size:15px;margin-top:8px">Don't stop at day 7 →</a>
            <p style="font-size:13px;color:#888;margin:16px 0 0">Starting at $49/month · Cancel anytime</p>
          </div>
        </div>`,
    },
    7: {
      subject: 'Your Scout trial ends tonight — you\'re 23% of the way there',
      html: `
        <div style="font-family:sans-serif;max-width:540px;margin:0 auto;color:#1a1a1a">
          <div style="background:#E91E8C;padding:20px 28px;border-radius:12px 12px 0 0">
            <p style="color:#fff;font-size:14px;font-weight:700;margin:0">Scout · Day 7 — Trial ends today</p>
          </div>
          <div style="background:#f9f9f9;padding:28px 32px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none">
            <h2 style="margin:0 0 16px;font-size:20px">You started something. Don't leave it at 23%.</h2>
            <p style="color:#444;line-height:1.7;font-size:14px">Hi ${firstName},</p>
            <p style="color:#444;line-height:1.7;font-size:14px">
              On Day 1, I introduced the 30-Day LinkedIn Authority Challenge. Today is day 7 — you're 23% through it.
            </p>
            <p style="color:#444;line-height:1.7;font-size:14px">
              The people who get results from this approach are the ones who don't stop at day 7. The recognition — the moments where a prospect messages you first, mentions your name in a conversation, asks for your help — those happen between days 20 and 30.
            </p>
            <p style="color:#444;line-height:1.7;font-size:14px">You're 23% of the way to something real. Your trial ends tonight.</p>
            <a href="${upgradeUrl}" style="display:inline-block;background:#E91E8C;color:#fff;font-weight:700;padding:14px 28px;border-radius:10px;text-decoration:none;font-size:15px;margin:16px 0 8px">Finish what you started →</a>
            <p style="font-size:13px;color:#888;margin:0">Starter $49 · Pro $99 · Agency $249 · Cancel anytime</p>
          </div>
        </div>`,
    },
  }

  return emails[day] || null
}

// Expiry email (sent when trial is marked expired)
function getExpiredEmail(firstName: string, upgradeUrl: string) {
  return {
    subject: 'Your Scout trial has ended — your leads are waiting',
    html: `
      <div style="font-family:sans-serif;max-width:540px;margin:0 auto;color:#1a1a1a">
        <div style="background:#0a0c10;padding:20px 28px;border-radius:12px 12px 0 0">
          <p style="color:#fff;font-size:14px;font-weight:700;margin:0">Scout by ClientBloom</p>
        </div>
        <div style="background:#f9f9f9;padding:28px 32px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none">
          <h2 style="margin:0 0 16px;font-size:20px">Your trial has ended</h2>
          <p style="color:#444;line-height:1.7;font-size:14px">Hi ${firstName},</p>
          <p style="color:#444;line-height:1.7;font-size:14px">
            Your 7-day Scout trial has ended. Your captured leads and engagement history are still there — locked until you subscribe.
          </p>
          <a href="${upgradeUrl}" style="display:inline-block;background:#4F6BFF;color:#fff;font-weight:700;padding:14px 28px;border-radius:10px;text-decoration:none;font-size:15px;margin:16px 0 8px">Unlock my leads →</a>
          <p style="font-size:13px;color:#888;margin:0">Starter $49 · Pro $99 · Agency $249 · Cancel anytime</p>
        </div>
      </div>`,
  }
}

// ── Email sender ───────────────────────────────────────────────────────────
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
        from: 'Mike at Scout <mike@clientbloom.ai>',
        to:   [to],
        subject,
        html,
      }),
    })
    return res.ok
  } catch (e) {
    console.error('[trial-check] Email send failed:', e)
    return false
  }
}

// ── Main handler ───────────────────────────────────────────────────────────
export async function GET(req: Request) {
  // Auth check
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  if (!PLATFORM_TOKEN || !PLATFORM_BASE) {
    return NextResponse.json({ error: 'Platform Airtable not configured' }, { status: 500 })
  }

  const now = new Date()
  const upgradeUrl = `${BASE_URL}/upgrade`

  const results = {
    emailsSent:   0,
    emailsSkipped: 0,
    expired:       0,
    errors:        0,
  }

  try {
    // ── JOB 1: Send sequence emails for active trial tenants ───────────────
    const activeTrials = await fetchTrialTenants()
    console.log(`[trial-check] Found ${activeTrials.length} active trial tenants`)

    for (const record of activeTrials) {
      try {
        const email       = record.fields['Email'] || ''
        const name        = record.fields['Company Name'] || email.split('@')[0]
        const firstName   = name.split(' ')[0] || 'there'
        const trialEndsAt = record.fields['Trial Ends At']
          ? new Date(record.fields['Trial Ends At'])
          : null
        const currentDay  = record.fields['Trial Email Day'] || 1
        const lastSentAt  = record.fields['Trial Last Email Sent At']
          ? new Date(record.fields['Trial Last Email Sent At'])
          : null

        if (!trialEndsAt) continue

        // Calculate which day of the trial we're on
        const trialStartAt    = new Date(trialEndsAt.getTime() - 7 * 24 * 60 * 60 * 1000)
        const daysSinceStart  = Math.floor((now.getTime() - trialStartAt.getTime()) / (24 * 60 * 60 * 1000))
        const targetDay       = Math.min(daysSinceStart + 1, 7)  // Day 1 was sent at signup

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

        // Get the email for targetDay (days 2-7, Day 1 sent at signup)
        const emailContent = getTrialEmailContent(targetDay, firstName, upgradeUrl)
        if (!emailContent) {
          results.emailsSkipped++
          continue
        }

        const sent = await sendEmail(email, emailContent.subject, emailContent.html)

        if (sent) {
          // Update Trial Email Day and Last Sent At
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

    // ── JOB 2: Mark expired trials ─────────────────────────────────────────
    const expiredTrials = await fetchExpiredTrials()
    console.log(`[trial-check] Found ${expiredTrials.length} expired trial tenants`)

    for (const record of expiredTrials) {
      try {
        const email     = record.fields['Email'] || ''
        const name      = record.fields['Company Name'] || email.split('@')[0]
        const firstName = name.split(' ')[0] || 'there'

        // Mark as expired in Airtable
        await updateTenant(record.id, {
          'Status':          'trial_expired',
          'Trial Email Day': 7,
        })

        // Send expiry email (only if Day 7 email wasn't already sent)
        const currentDay = record.fields['Trial Email Day'] || 0
        if (currentDay < 7) {
          const expired = getExpiredEmail(firstName, upgradeUrl)
          await sendEmail(email, expired.subject, expired.html)
        }

        results.expired++
        console.log(`[trial-check] Marked ${email} as trial_expired`)
      } catch (e: any) {
        console.error('[trial-check] Error expiring tenant:', e.message)
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
    message: `Trial check complete: ${results.emailsSent} emails sent, ${results.expired} trials expired.`,
  })
}

// Helper used by JOB 1 loop
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
