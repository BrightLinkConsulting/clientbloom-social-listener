/**
 * POST /api/billing/cancel
 *
 * Cancels the authenticated user's Stripe subscription at period end.
 * Does NOT cancel immediately — the user keeps access until the current
 * billing period ends, at which point the customer.subscription.deleted
 * Stripe webhook fires and sets their status to Suspended.
 *
 * Updates Airtable Status to 'canceling' to reflect the pending state.
 * Sends a confirmation email via lib/emails.ts buildCancellationEmail.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Stripe from 'stripe'
import { escapeAirtableString } from '@/lib/tier'
import { buildCancellationEmail } from '@/lib/emails'

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const RESEND_KEY     = process.env.RESEND_API_KEY             || ''
const BASE_URL       = (process.env.NEXT_PUBLIC_BASE_URL || 'https://scout.clientbloom.ai').replace(/\/$/, '')
const FROM           = 'Scout by ClientBloom <info@clientbloom.ai>'

// ── Method enforcement ────────────────────────────────────────────────────────
export async function GET()    { return NextResponse.json({ error: 'Method not allowed' }, { status: 405 }) }
export async function PUT()    { return NextResponse.json({ error: 'Method not allowed' }, { status: 405 }) }
export async function PATCH()  { return NextResponse.json({ error: 'Method not allowed' }, { status: 405 }) }
export async function DELETE() { return NextResponse.json({ error: 'Method not allowed' }, { status: 405 }) }

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getTenantRecord(email: string) {
  const url =
    `https://api.airtable.com/v0/${PLATFORM_BASE}/Tenants` +
    `?filterByFormula=${encodeURIComponent(`{Email}='${escapeAirtableString(email.toLowerCase())}'`)}&maxRecords=1`
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

async function sendConfirmationEmail(
  email: string,
  companyName: string,
  periodEnd: Date,
): Promise<void> {
  if (!RESEND_KEY) return

  const periodEndDate = periodEnd.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })

  const { subject, html } = buildCancellationEmail({
    name:           companyName || email.split('@')[0],
    email,
    periodEndDate,
    resubscribeUrl: `${BASE_URL}/upgrade`,
  })

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [email], subject, html }),
  })
}

// ── POST /api/billing/cancel ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY || ''
  if (!secretKey || !PLATFORM_TOKEN || !PLATFORM_BASE) {
    return NextResponse.json({ error: 'Billing not configured. Contact support.' }, { status: 500 })
  }

  const session = await getServerSession(authOptions as any) as any
  if (!session?.user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  const user  = session.user as any
  const email = user.email || ''

  // Fetch tenant record
  const tenant = await getTenantRecord(email)
  if (!tenant) {
    return NextResponse.json({ error: 'Account not found.' }, { status: 404 })
  }

  const subscriptionId = tenant.fields['Stripe Subscription ID'] || ''
  if (!subscriptionId) {
    return NextResponse.json(
      { error: 'No active subscription found. If you believe this is an error, contact support.' },
      { status: 400 }
    )
  }

  const stripe = new Stripe(secretKey, { apiVersion: '2023-10-16' as any })

  try {
    // Set cancel_at_period_end — subscription stays active until billing period ends
    const sub = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    })

    const periodEnd = new Date(sub.current_period_end * 1000)

    // Mark as canceling in Airtable (non-fatal if this fails)
    await updateTenantRecord(tenant.id, { 'Status': 'canceling' })
      .catch(e => console.error('[billing/cancel] Airtable update failed:', e.message))

    // Send confirmation email (non-fatal)
    await sendConfirmationEmail(
      email,
      tenant.fields['Company Name'] || '',
      periodEnd,
    ).catch(e => console.error('[billing/cancel] Email failed:', e.message))

    return NextResponse.json({
      ok:          true,
      message:     'Subscription canceled at period end',
      accessUntil: periodEnd.toISOString(),
    })
  } catch (err: any) {
    console.error('[billing/cancel] Stripe error:', err.message)
    return NextResponse.json(
      { error: 'Cancellation failed — please try again or contact support.' },
      { status: 500 }
    )
  }
}
