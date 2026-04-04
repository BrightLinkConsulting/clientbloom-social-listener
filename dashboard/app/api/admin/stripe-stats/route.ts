/**
 * GET /api/admin/stripe-stats
 *
 * Returns subscription and revenue metrics for the admin dashboard.
 * Admin-only — requires isAdmin session flag.
 *
 * If Stripe is not yet configured (STRIPE_SECRET_KEY not set),
 * returns stub data derived from the Platform Airtable tenant count.
 */

import { NextResponse } from 'next/server'
import { getTenantConfig } from '@/lib/tenant'

const PRICE_PER_SEAT = 49 // $49/month

export async function GET() {
  const tenant = await getTenantConfig()
  if (!tenant)           return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!tenant.isAdmin)   return NextResponse.json({ error: 'Admin only'   }, { status: 403 })

  const stripeKey  = process.env.STRIPE_SECRET_KEY || ''
  const platformToken = process.env.PLATFORM_AIRTABLE_TOKEN  || ''
  const platformBase  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''

  // ── Derive tenant counts from Airtable (always available) ───────────────
  let activeTenants   = 0
  let suspendedTenants = 0
  let allTenants: any[] = []

  if (platformToken && platformBase) {
    try {
      const url = `https://api.airtable.com/v0/${platformBase}/Tenants?maxRecords=200`
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${platformToken}` },
      })
      if (resp.ok) {
        const data = await resp.json()
        allTenants = data.records || []
        activeTenants    = allTenants.filter((r: any) => r.fields?.Status === 'Active').length
        suspendedTenants = allTenants.filter((r: any) => r.fields?.Status === 'Suspended').length
      }
    } catch {
      // fallthrough to defaults
    }
  }

  // ── Stripe metrics (when configured) ────────────────────────────────────
  if (stripeKey) {
    try {
      const Stripe = (await import('stripe')).default
      const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' })

      // Active subscriptions
      const activeSubs = await stripe.subscriptions.list({
        status: 'active',
        limit: 100,
      })

      // Past-due (payment failed, still counting)
      const pastDueSubs = await stripe.subscriptions.list({
        status: 'past_due',
        limit: 100,
      })

      const activeCount  = activeSubs.data.length + pastDueSubs.data.length
      const mrr          = activeCount * PRICE_PER_SEAT
      const arr          = mrr * 12

      // Monthly revenue for the last 6 months via charges
      const now       = Math.floor(Date.now() / 1000)
      const sixMonths = now - 60 * 60 * 24 * 30 * 6

      const charges = await stripe.charges.list({
        limit: 100,
        created: { gte: sixMonths },
      })

      // Bucket by month
      const monthlyRevenue: Record<string, number> = {}
      for (const charge of charges.data) {
        if (charge.status !== 'succeeded') continue
        const d     = new Date(charge.created * 1000)
        const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        monthlyRevenue[key] = (monthlyRevenue[key] || 0) + charge.amount / 100
      }

      // Build 6-month array (newest last)
      const revenueChart = buildMonthlyArray(6, monthlyRevenue)

      // Recent Stripe events for activity feed
      const events = await stripe.events.list({
        limit: 20,
        types: [
          'checkout.session.completed',
          'customer.subscription.deleted',
          'invoice.payment_failed',
          'invoice.payment_succeeded',
        ],
      })

      const activity = events.data.map(e => ({
        id:   e.id,
        type: e.type,
        time: e.created,
        email: extractEmailFromEvent(e),
      }))

      return NextResponse.json({
        source:      'stripe',
        mrr,
        arr,
        activeCount,
        suspendedCount: suspendedTenants,
        totalTenants:   allTenants.length,
        revenueChart,
        activity,
      })
    } catch (err: any) {
      console.error('[stripe-stats] Stripe error:', err.message)
      // Fall through to stub
    }
  }

  // ── Stub mode (Stripe not configured or error) ───────────────────────────
  const mrr = activeTenants * PRICE_PER_SEAT

  // Flat revenue chart — just mirrors the current MRR each month
  const revenueChart = buildMonthlyArray(6, {})
  const thisMonth    = revenueChart[revenueChart.length - 1]
  if (thisMonth) thisMonth.revenue = mrr

  return NextResponse.json({
    source:         'stub',
    mrr,
    arr:            mrr * 12,
    activeCount:    activeTenants,
    suspendedCount: suspendedTenants,
    totalTenants:   allTenants.length,
    revenueChart,
    activity:       [],
  })
}

// ── Helpers ────────────────────────────────────────────────────────────────
function buildMonthlyArray(months: number, data: Record<string, number>) {
  const result = []
  const now    = new Date()
  for (let i = months - 1; i >= 0; i--) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    result.push({
      month:   d.toLocaleString('default', { month: 'short' }),
      revenue: data[key] || 0,
      key,
    })
  }
  return result
}

function extractEmailFromEvent(e: any): string {
  try {
    const obj = e.data?.object || {}
    return (
      obj.customer_email ||
      obj.customer_details?.email ||
      obj.billing_details?.email ||
      ''
    )
  } catch {
    return ''
  }
}
