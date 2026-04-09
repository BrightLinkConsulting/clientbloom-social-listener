/**
 * GET /api/billing/portal
 *
 * Returns a Stripe Billing Portal URL for the authenticated user.
 * Returns JSON { url } — the client is responsible for the redirect.
 * This allows the settings page to display a friendly error instead of
 * rendering raw JSON when something goes wrong.
 *
 * Only paid subscribers with a Stripe Customer ID can access the portal.
 * Owner and Complimentary accounts have no Stripe customer — do not call
 * this route for them (use isStripeBilledPlan() guard before rendering the button).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Stripe from 'stripe'
import { escapeAirtableString } from '@/lib/tier'

const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL || 'https://scout.clientbloom.ai').replace(/\/$/, '')

// ── Method enforcement ────────────────────────────────────────────────────────
export async function POST()   { return NextResponse.json({ error: 'Method not allowed' }, { status: 405 }) }
export async function PUT()    { return NextResponse.json({ error: 'Method not allowed' }, { status: 405 }) }
export async function PATCH()  { return NextResponse.json({ error: 'Method not allowed' }, { status: 405 }) }
export async function DELETE() { return NextResponse.json({ error: 'Method not allowed' }, { status: 405 }) }

// ── Helper: look up Stripe Customer ID from Airtable ─────────────────────────
async function getStripeCustomerId(email: string): Promise<string | null> {
  const token = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
  const base  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
  if (!token || !base) return null

  const url =
    `https://api.airtable.com/v0/${base}/Tenants` +
    `?filterByFormula=${encodeURIComponent(`{Email}='${escapeAirtableString(email.toLowerCase())}'`)}&maxRecords=1`

  const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return null
  const data = await res.json()
  return data.records?.[0]?.fields?.['Stripe Customer ID'] || null
}

// ── GET /api/billing/portal ───────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY || ''
  if (!secretKey) {
    return NextResponse.json({ error: 'Billing not configured. Contact support.' }, { status: 500 })
  }

  const session = await getServerSession(authOptions as any) as any
  if (!session?.user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  const user  = session.user as any
  const plan  = user.plan || ''
  const email = user.email || ''

  // Guard: Owner and Complimentary have no Stripe subscription — fail fast with
  // a clear message rather than an opaque "no billing account found".
  const STRIPE_PLANS = new Set(['Scout Starter', 'Scout Pro', 'Scout Agency'])
  if (!STRIPE_PLANS.has(plan)) {
    return NextResponse.json(
      { error: 'Your plan does not have a billing subscription to manage.' },
      { status: 400 }
    )
  }

  const customerId = await getStripeCustomerId(email)
  if (!customerId) {
    return NextResponse.json(
      { error: 'No billing account found. If you believe this is an error, contact support.' },
      { status: 404 }
    )
  }

  const stripe = new Stripe(secretKey, { apiVersion: '2023-10-16' as any })

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer:   customerId,
      return_url: `${BASE_URL}/settings?tab=billing`,
    })

    // Return JSON — let the client handle the redirect. This means errors
    // can be caught and displayed in the UI instead of rendering raw JSON.
    return NextResponse.json({ url: portalSession.url })
  } catch (err: any) {
    console.error('[billing/portal] Stripe error:', err.message)
    return NextResponse.json(
      { error: 'Could not open billing portal. Please try again.' },
      { status: 500 }
    )
  }
}
