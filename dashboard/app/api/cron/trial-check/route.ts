/**
 * /api/cron/trial-check — Daily trial expiry enforcement
 *
 * Runs at 9 AM UTC (2 AM PDT) daily.
 * 1. Finds all tenants with expired trials and no active subscription
 * 2. Sets their status to 'trial_expired'
 * 3. Sends "upgrade now" email
 * 4. Logs the action
 *
 * Protected by CRON_SECRET bearer token.
 */

import { NextResponse } from 'next/server'

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN || ''
const PLATFORM_BASE = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const RESEND_KEY = process.env.RESEND_API_KEY || ''
const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL || 'https://app.clientbloom.ai').replace(/\/$/, '')
const STRIPE_CHECKOUT = process.env.STRIPE_CHECKOUT_URL || 'https://buy.stripe.com/...' // Mike needs to set this

export const maxDuration = 60

async function sendTrialExpiredEmail(email: string, companyName: string): Promise<boolean> {
  if (!RESEND_KEY) {
    console.warn('[trial-check] RESEND_API_KEY not set')
    return false
  }

  const upgradeLink = `${BASE_URL}/upgrade?source=trial_expired`

  const html = `
    <div style="font-family:sans-serif;max-width:540px;margin:0 auto;color:#1a1a1a">
      <div style="background:#7C3AED;padding:20px 28px;border-radius:12px 12px 0 0">
        <p style="color:#fff;font-size:16px;font-weight:700;margin:0">Your Scout Trial Has Ended</p>
      </div>
      <div style="background:#f9f9f9;padding:28px 32px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none">
        <p style="margin:0 0 20px;color:#555;font-size:14px">
          Hi ${companyName || 'there'},
        </p>

        <p style="margin:0 0 20px;color:#555;font-size:14px;line-height:1.6">
          Your 14-day Scout trial has ended. You've experienced how Scout's AI-powered LinkedIn relationship intelligence can unlock hidden opportunities in your prospect network.
        </p>

        <p style="margin:0 0 20px;color:#555;font-size:14px;line-height:1.6">
          To continue monitoring your LinkedIn prospects, scoring new opportunities, and building real relationships at scale, upgrade to Scout Pro.
        </p>

        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;background:#f0f0f0;border-radius:8px;overflow:hidden">
          <tr>
            <td style="padding:16px;color:#666">Scout Pro</td>
            <td style="padding:16px;font-weight:700;color:#000;text-align:right">$79<span style="font-size:12px;font-weight:400">/month</span></td>
          </tr>
          <tr style="border-top:1px solid #ddd">
            <td colspan="2" style="padding:12px 16px;font-size:12px;color:#777">
              Unlimited prospect monitoring, daily scans, AI scoring, and relationship tracking
            </td>
          </tr>
        </table>

        <a href="${upgradeLink}"
           style="display:inline-block;background:#7C3AED;color:#fff;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;margin-bottom:20px">
          Upgrade to Scout Pro
        </a>

        <p style="font-size:12px;color:#999;margin:0">
          Need a custom plan? Reply to this email — our team can help with volume discounts for teams.
        </p>

        <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0 16px" />
        <p style="font-size:12px;color:#aaa;margin:0">
          Scout by ClientBloom — AI-Powered LinkedIn Relationship Intelligence
        </p>
      </div>
    </div>
  `

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Scout <noreply@clientbloom.ai>',
        to: [email],
        subject: 'Your Scout Trial Has Ended — Upgrade Now',
        html,
      }),
    })
    return res.ok
  } catch (e) {
    console.error('[trial-check] Failed to send email:', e)
    return false
  }
}

export async function GET(req: Request) {
  // Auth check
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  if (!PLATFORM_TOKEN || !PLATFORM_BASE) {
    return NextResponse.json({ error: 'Platform Airtable not configured' }, { status: 500 })
  }

  try {
    // Fetch all tenants with expired trials and no active subscription
    const now = new Date().toISOString()
    const url = new URL(`https://api.airtable.com/v0/${PLATFORM_BASE}/Tenants`)
    url.searchParams.set(
      'filterByFormula',
      `AND({Status}='Active',IS_BEFORE({Trial Ends At},'${now}'),{Stripe Subscription ID}='')`
    )
    url.searchParams.set('fields[]', 'Email')
    url.searchParams.append('fields[]', 'Company Name')
    url.searchParams.append('fields[]', 'Trial Ends At')
    url.searchParams.set('pageSize', '100')

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch tenants' }, { status: 500 })
    }

    const data = await res.json()
    const expiredTrialTenants = data.records || []

    console.log(`[trial-check] Found ${expiredTrialTenants.length} tenants with expired trials`)

    // For each expired trial tenant: set status to trial_expired and send email
    const results = await Promise.allSettled(
      expiredTrialTenants.map(async (record: any) => {
        const email = record.fields['Email']
        const companyName = record.fields['Company Name']

        // Update status to trial_expired
        await fetch(
          `https://api.airtable.com/v0/${PLATFORM_BASE}/Tenants/${record.id}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${PLATFORM_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              fields: { Status: 'trial_expired' }
            })
          }
        )

        // Send upgrade email
        await sendTrialExpiredEmail(email, companyName)

        return { email, status: 'expired' }
      })
    )

    const succeeded = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length

    console.log(`[trial-check] Processed ${succeeded} tenants, ${failed} failures`)

    return NextResponse.json({
      ok: true,
      processed: succeeded,
      failed,
      message: `Trial check complete: ${succeeded} expired trials marked, emails sent.`
    })
  } catch (e: any) {
    console.error('[trial-check] Error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
