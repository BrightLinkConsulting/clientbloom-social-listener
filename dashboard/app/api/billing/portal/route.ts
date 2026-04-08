/**
 * GET /api/billing/portal
 *
 * Creates a Stripe Billing Portal session and redirects the user to it.
 * Used by paid subscribers to manage their card, view invoices, and
 * update or cancel their subscription.
 *
 * Requires an authenticated session with a Stripe Customer ID.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Stripe from 'stripe'
import { escapeAirtableString } from '@/lib/tier'

const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL || 'https://scout.clientbloom.ai').replace(/\/$/, '')

// Helper: look up Stripe Customer ID from Airtable
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

export async function GET(req: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY || ''
  if (!secretKey) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })
  }

  const session = await getServerSession(authOptions as any) as any
  if (!session?.user) {
    return NextResponse.redirect(new URL('/sign-in', BASE_URL))
  }

  const user  = session.user as any
  const email = user.email || ''

  const customerId = await getStripeCustomerId(email)
  if (!customerId) {
    return NextResponse.json(
      { error: 'No billing account found. Please contact support.' },
      { status: 404 }
    )
  }

  const stripe = new Stripe(secretKey, { apiVersion: '2023-10-16' as any })

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer:   customerId,
      return_url: `${BASE_URL}/settings`,
    })

    return NextResponse.redirect(portalSession.url)
  } catch (err: any) {
    console.error('[billing/portal] Stripe error:', err.message)
    return NextResponse.json({ error: 'Could not open billing portal. Try again.' }, { status: 500 })
  }
}
