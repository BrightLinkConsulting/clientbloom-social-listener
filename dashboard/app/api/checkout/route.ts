/**
 * GET /api/checkout
 *
 * Creates a Stripe Checkout Session for the Scout $79/month subscription
 * and redirects the browser to Stripe's hosted checkout page.
 *
 * Every new subscriber gets a 14-day free trial before their card is charged.
 * Set STRIPE_TRIAL_DAYS env var to override (default: 14). Set to "0" to disable.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY    — sk_live_... or sk_test_...
 *   STRIPE_PRICE_ID      — price_... for the $79/month recurring price
 *   NEXT_PUBLIC_BASE_URL — canonical URL of this deployment
 *
 * Optional env vars:
 *   STRIPE_TRIAL_DAYS    — trial period in days (default: 14, set to 0 to disable)
 *
 * On success, Stripe redirects to /welcome?session_id={CHECKOUT_SESSION_ID}
 * On cancel,  Stripe redirects back to /
 */

import { NextResponse } from 'next/server'
import Stripe from 'stripe'

export async function GET() {
  return createCheckoutSession()
}

export async function POST() {
  return createCheckoutSession()
}

async function createCheckoutSession() {
  const secretKey = (process.env.STRIPE_SECRET_KEY || '').trim()
  const priceId   = (process.env.STRIPE_PRICE_ID   || '').trim()
  const baseUrl   = (process.env.NEXT_PUBLIC_BASE_URL || 'https://scout.clientbloom.ai').replace(/\/$/, '')

  if (!secretKey || !priceId) {
    console.error('[checkout] Missing env vars — STRIPE_SECRET_KEY or STRIPE_PRICE_ID not set')
    return NextResponse.json(
      { error: 'Stripe is not yet configured. Please check back soon.' },
      { status: 503 }
    )
  }

  // Instantiate inside the handler so env vars are always resolved at request time
  const stripe = new Stripe(secretKey, {
    apiVersion: '2023-10-16' as any,
  })

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      success_url: `${baseUrl}/welcome?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${baseUrl}/?checkout=cancelled`,
      metadata: {
        product: 'scout',
      },
      subscription_data: {
        metadata: {
          product: 'scout',
        },
        // 14-day free trial before first charge.
        // Override with STRIPE_TRIAL_DAYS env var; set to "0" to disable.
        ...((() => {
          const days = parseInt(process.env.STRIPE_TRIAL_DAYS ?? '14', 10)
          return days > 0 ? { trial_period_days: days } : {}
        })()),
      },
    })

    if (!session.url) {
      console.error('[checkout] Stripe returned session without URL:', session.id)
      return NextResponse.json({ error: 'No checkout URL returned.' }, { status: 500 })
    }

    return NextResponse.redirect(session.url, { status: 303 })
  } catch (err: any) {
    console.error('[checkout] Stripe error:', err?.message, err?.type, err?.code)
    return NextResponse.json(
      { error: 'Could not create checkout session. Please try again.', detail: err?.message },
      { status: 500 }
    )
  }
}
