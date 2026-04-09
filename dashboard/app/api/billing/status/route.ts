/**
 * GET /api/billing/status
 *
 * Returns the authenticated user's current subscription status from Airtable
 * and, if the subscription is set to cancel at period end, the access-until date
 * from Stripe.
 *
 * Used by the Plan & Billing section on page load to restore the post-cancel
 * amber card without requiring a full session refresh. This closes the Known P2
 * gap where `canceledUntil` React state would vanish after a page refresh.
 *
 * Response shapes:
 *   { status: 'active' }
 *   { status: 'canceling', accessUntil: ISO-string }
 *   { status: 'suspended' }
 *   { status: 'none' }  — no Stripe subscription found
 *
 * Only callable by authenticated Stripe-billed plan users.
 * Non-Stripe plans (Trial, Owner, Complimentary) receive { status: 'none' }.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Stripe from 'stripe'
import { escapeAirtableString } from '@/lib/tier'

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''

// ── Method enforcement ────────────────────────────────────────────────────────
export async function POST()   { return NextResponse.json({ error: 'Method not allowed' }, { status: 405 }) }
export async function PUT()    { return NextResponse.json({ error: 'Method not allowed' }, { status: 405 }) }
export async function PATCH()  { return NextResponse.json({ error: 'Method not allowed' }, { status: 405 }) }
export async function DELETE() { return NextResponse.json({ error: 'Method not allowed' }, { status: 405 }) }

async function getTenantRecord(email: string) {
  if (!PLATFORM_TOKEN || !PLATFORM_BASE) return null
  const url =
    `https://api.airtable.com/v0/${PLATFORM_BASE}/Tenants` +
    `?filterByFormula=${encodeURIComponent(`{Email}='${escapeAirtableString(email.toLowerCase())}'`)}&maxRecords=1`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` } })
  if (!res.ok) return null
  const data = await res.json()
  return data.records?.[0] || null
}

// ── GET /api/billing/status ───────────────────────────────────────────────────
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions as any) as any
  if (!session?.user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  const user  = session.user as any
  const plan  = user.plan  || ''
  const email = user.email || ''

  // Non-Stripe plans have no subscription to report
  const STRIPE_PLANS = new Set(['Scout Starter', 'Scout Pro', 'Scout Agency'])
  if (!STRIPE_PLANS.has(plan)) {
    return NextResponse.json({ status: 'none' })
  }

  const tenant = await getTenantRecord(email)
  if (!tenant) {
    return NextResponse.json({ status: 'none' })
  }

  const airtableStatus = (tenant.fields['Status'] || '').toLowerCase()
  const subscriptionId = tenant.fields['Stripe Subscription ID'] || ''

  if (airtableStatus === 'suspended') {
    return NextResponse.json({ status: 'suspended' })
  }

  if (airtableStatus !== 'canceling' || !subscriptionId) {
    return NextResponse.json({ status: 'active' })
  }

  // Status is 'canceling' — fetch the exact period end from Stripe
  const secretKey = process.env.STRIPE_SECRET_KEY || ''
  if (!secretKey) {
    // Stripe not configured — return canceling without accessUntil
    return NextResponse.json({ status: 'canceling' })
  }

  try {
    const stripe = new Stripe(secretKey, { apiVersion: '2023-10-16' as any })
    const sub    = await stripe.subscriptions.retrieve(subscriptionId)

    // If the subscription was already fully deleted (shouldn't happen while 'canceling'),
    // fall back to 'suspended'
    if (sub.status === 'canceled') {
      return NextResponse.json({ status: 'suspended' })
    }

    const accessUntil = new Date(sub.current_period_end * 1000).toISOString()
    return NextResponse.json({ status: 'canceling', accessUntil })
  } catch (err: any) {
    console.error('[billing/status] Stripe error:', err.message)
    // Return canceling without accessUntil rather than erroring
    return NextResponse.json({ status: 'canceling' })
  }
}
