/**
 * POST /api/billing/cancel
 *
 * Cancels the authenticated user's Stripe subscription at period end.
 * Does NOT cancel immediately — the user keeps access until the current
 * billing period ends, at which point the customer.subscription.deleted
 * Stripe webhook fires and marks their status as Suspended.
 *
 * Updates Airtable Status to 'canceling' to reflect the pending state.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Stripe from 'stripe'

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const RESEND_KEY     = process.env.RESEND_API_KEY             || ''
const BASE_URL       = (process.env.NEXT_PUBLIC_BASE_URL || 'https://scout.clientbloom.ai').replace(/\/$/, '')

async function getTenantRecord(email: string) {
  const url =
    `https://api.airtable.com/v0/${PLATFORM_BASE}/Tenants` +
    `?filterByFormula=${encodeURIComponent(`{Email}='${email.toLowerCase()}'`)}&maxRecords=1`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` } })
  if (!res.ok) return null
  const data = await res.json()
  return data.records?.[0] || null
}

async function updateTenantRecord(recordId: string, fields: Record<string, unknown>) {
  const res = await fetch(
    `https://api.airtable.com/v0/${PLATFORM_BASE}/Tenants/${recordId}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${PLATFORM_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    }
  )
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function sendCancellationEmail(email: string, name: string, periodEnd: Date): Promise<void> {
  if (!RESEND_KEY) return
  const formattedDate = periodEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Scout by ClientBloom <noreply@clientbloom.ai>',
      to:   [email],
      subject: 'Your Scout subscription has been canceled',
      html: `
        <div style="font-family:sans-serif;max-width:540px;margin:0 auto;color:#1a1a1a">
          <div style="background:#0a0c10;padding:24px 32px;border-radius:12px 12px 0 0">
            <p style="color:#fff;font-size:18px;font-weight:700;margin:0">Scout by ClientBloom</p>
          </div>
          <div style="background:#f9f9f9;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none">
            <h2 style="margin:0 0 12px">Your subscription has been canceled</h2>
            <p style="color:#444;line-height:1.6;font-size:14px">
              Hi ${name || email.split('@')[0]},<br><br>
              Your Scout subscription is canceled and will end on <strong>${formattedDate}</strong>. You'll have full access until then.
            </p>
            <p style="color:#444;line-height:1.6;font-size:14px">
              Changed your mind? You can resubscribe anytime before that date and nothing will change.
            </p>
            <a href="${BASE_URL}/upgrade"
               style="display:inline-block;background:#4F6BFF;color:#fff;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;margin-top:8px">
              Resubscribe →
            </a>
            <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0 16px" />
            <p style="font-size:12px;color:#aaa;margin:0">
              Questions? Reply to this email — we read every message.
            </p>
          </div>
        </div>
      `,
    }),
  })
}

export async function POST(req: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY || ''
  if (!secretKey || !PLATFORM_TOKEN || !PLATFORM_BASE) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 })
  }

  const session = await getServerSession(authOptions as any) as any
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user  = session.user as any
  const email = user.email || ''

  const tenant = await getTenantRecord(email)
  if (!tenant) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  const subscriptionId = tenant.fields['Stripe Subscription ID'] || ''
  if (!subscriptionId) {
    return NextResponse.json({ error: 'No active subscription found' }, { status: 400 })
  }

  const stripe = new Stripe(secretKey, { apiVersion: '2023-10-16' as any })

  try {
    const sub = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    })

    const periodEnd = new Date(sub.current_period_end * 1000)

    // Mark as canceling in Airtable
    await updateTenantRecord(tenant.id, { 'Status': 'canceling' })

    // Send confirmation email
    await sendCancellationEmail(
      email,
      tenant.fields['Company Name'] || '',
      periodEnd
    ).catch(e => console.error('[billing/cancel] Email failed:', e.message))

    return NextResponse.json({
      ok: true,
      message: 'Subscription canceled at period end',
      accessUntil: periodEnd.toISOString(),
    })
  } catch (err: any) {
    console.error('[billing/cancel] Stripe error:', err.message)
    return NextResponse.json({ error: 'Cancellation failed. Please try again.' }, { status: 500 })
  }
}
