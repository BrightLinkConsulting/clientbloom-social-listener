/**
 * GET /api/billing/upgrade?tier=starter|pro|agency
 *
 * Creates a Stripe Checkout session for upgrading from trial to a paid plan.
 * Redirects the user to Stripe's hosted payment page.
 *
 * On Stripe success, the checkout.session.completed webhook fires and updates
 * the tenant's plan in Airtable.
 *
 * Security: requires authenticated session.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Stripe from 'stripe'

const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL || 'https://scout.clientbloom.ai').replace(/\/$/, '')

const PRICE_MAP: Record<string, string | undefined> = {
  starter: process.env.STRIPE_PRICE_STARTER,
  pro:     process.env.STRIPE_PRICE_PRO,
  agency:  process.env.STRIPE_PRICE_AGENCY,
}

export async function GET(req: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY || ''
  if (!secretKey) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })
  }

  // Must be authenticated
  const session = await getServerSession(authOptions as any)
  if (!session?.user) {
    return NextResponse.redirect(new URL('/sign-in', BASE_URL))
  }

  const user  = session.user as any
  const email = user.email || ''

  // Validate tier param
  const { searchParams } = new URL(req.url)
  const tier = (searchParams.get('tier') || 'pro').toLowerCase()
  const priceId = PRICE_MAP[tier]

  if (!priceId) {
    // Missing env var — return clear error (attack vector #12 mitigation)
    console.error(`[billing/upgrade] Price ID missing for tier "${tier}". Check STRIPE_PRICE_${tier.toUpperCase()} env var.`)
    return NextResponse.json(
      { error: `Stripe price ID not configured for tier "${tier}". Contact support.` },
      { status: 500 }
    )
  }

  const stripe = new Stripe(secretKey, { apiVersion: '2023-10-16' as any })

  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${BASE_URL}/welcome?upgraded=1&tier=${tier}`,
      cancel_url:  `${BASE_URL}/upgrade?canceled=1`,
      metadata: {
        tier,
        source: 'trial_upgrade',
      },
      subscription_data: {
        metadata: { tier, source: 'trial_upgrade' },
      },
    })

    if (!checkoutSession.url) {
      return NextResponse.json({ error: 'Failed to create Stripe Checkout session' }, { status: 500 })
    }

    return NextResponse.redirect(checkoutSession.url)
  } catch (err: any) {
    console.error('[billing/upgrade] Stripe error:', err.message)
    return NextResponse.json({ error: 'Stripe error — please try again.' }, { status: 500 })
  }
}
