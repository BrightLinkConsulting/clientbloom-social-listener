/**
 * GET /api/admin/stripe-stats
 *
 * Returns subscription and revenue metrics for the Scout admin dashboard.
 * All Stripe queries are scoped to SCOUT_PRICE_ID so data from other
 * Stripe products (ClientBloom, BrightLink, etc.) never appears here.
 *
 * Admin-only — requires isAdmin session flag.
 */

import { NextResponse } from 'next/server'
import { getTenantConfig } from '@/lib/tenant'

const PRICE_PER_SEAT = 79

export async function GET() {
  const tenant = await getTenantConfig()
  if (!tenant)         return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!tenant.isAdmin) return NextResponse.json({ error: 'Admin only'   }, { status: 403 })

  const stripeKey      = process.env.STRIPE_SECRET_KEY       || ''
  const scoutPriceId   = process.env.STRIPE_PRICE_ID_LIVE    || process.env.STRIPE_PRICE_ID || ''
  const platformToken  = process.env.PLATFORM_AIRTABLE_TOKEN  || ''
  const platformBase   = process.env.PLATFORM_AIRTABLE_BASE_ID || ''

  // ── Scout-only tenant counts from Airtable ───────────────────────────────
  // These are always available and are the source of truth for tenant status.
  let activeTenants    = 0
  let suspendedTenants = 0
  let allTenants: any[] = []

  if (platformToken && platformBase) {
    try {
      const url  = `https://api.airtable.com/v0/${platformBase}/Tenants?maxRecords=200`
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${platformToken}` } })
      if (resp.ok) {
        const data = await resp.json()
        allTenants = data.records || []
        // Exclude the 'owner' plan — count only paying Scout subscribers
        const payingTenants = allTenants.filter((r: any) => r.fields?.Plan !== 'Owner')
        activeTenants    = payingTenants.filter((r: any) => r.fields?.Status === 'Active').length
        suspendedTenants = payingTenants.filter((r: any) => r.fields?.Status === 'Suspended').length
      }
    } catch {
      // fallthrough
    }
  }

  // ── Stripe metrics (Scout price only) ────────────────────────────────────
  if (stripeKey && scoutPriceId) {
    try {
      const Stripe = (await import('stripe')).default
      const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' })

      const now       = Math.floor(Date.now() / 1000)
      const sixMonths = now - 60 * 60 * 24 * 30 * 6

      // All Scout subscriptions (active + past_due = paying; canceled for history)
      const [activeSubs, pastDueSubs, canceledSubs] = await Promise.all([
        stripe.subscriptions.list({ status: 'active',   price: scoutPriceId, limit: 100 }),
        stripe.subscriptions.list({ status: 'past_due', price: scoutPriceId, limit: 100 }),
        stripe.subscriptions.list({ status: 'canceled', price: scoutPriceId, limit: 100 }),
      ])

      const activeCount = activeSubs.data.length + pastDueSubs.data.length
      const mrr         = activeCount * PRICE_PER_SEAT
      const arr         = mrr * 12

      // Build a set of all Scout customer IDs (active + historical) for event filtering
      const allScoutSubs    = [...activeSubs.data, ...pastDueSubs.data, ...canceledSubs.data]
      const scoutCustomerIds = new Set(
        allScoutSubs.map(s => (typeof s.customer === 'string' ? s.customer : s.customer.id))
      )

      // Monthly revenue — use paid invoices filtered to Scout's price line item
      const invoices = await stripe.invoices.list({
        limit:   100,
        status:  'paid',
        created: { gte: sixMonths },
      })

      const monthlyRevenue: Record<string, number> = {}
      for (const inv of invoices.data) {
        // Only include invoices that contain a Scout price line item
        const isScout = inv.lines.data.some((line: any) => line.price?.id === scoutPriceId)
        if (!isScout) continue
        const d   = new Date(inv.created * 1000)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        monthlyRevenue[key] = (monthlyRevenue[key] || 0) + inv.amount_paid / 100
      }

      const revenueChart = buildMonthlyArray(6, monthlyRevenue)

      // Recent activity — only events tied to known Scout customers
      const events = await stripe.events.list({
        limit: 50,
        types: [
          'checkout.session.completed',
          'customer.subscription.deleted',
          'invoice.payment_failed',
          'invoice.payment_succeeded',
        ],
      })

      const activity = events.data
        .filter(e => {
          const obj    = e.data.object as any
          const custId = typeof obj.customer === 'string' ? obj.customer : obj.customer?.id
          return custId && scoutCustomerIds.has(custId)
        })
        .slice(0, 20)
        .map(e => ({
          id:    e.id,
          type:  e.type,
          time:  e.created,
          email: extractEmailFromEvent(e),
        }))

      return NextResponse.json({
        source:         'stripe',
        mrr,
        arr,
        activeCount,
        suspendedCount: suspendedTenants,
        totalTenants:   allTenants.filter((r: any) => r.fields?.Plan !== 'Owner').length,
        revenueChart,
        activity,
      })
    } catch (err: any) {
      console.error('[stripe-stats] Stripe error:', err.message)
      // Fall through to stub
    }
  }

  // ── Stub mode (Stripe not configured, or scoutPriceId missing, or error) ──
  const mrr          = activeTenants * PRICE_PER_SEAT
  const revenueChart = buildMonthlyArray(6, {})

  return NextResponse.json({
    source:         'stub',
    mrr,
    arr:            mrr * 12,
    activeCount:    activeTenants,
    suspendedCount: suspendedTenants,
    totalTenants:   allTenants.filter((r: any) => r.fields?.Plan !== 'Owner').length,
    revenueChart,
    activity:       [],
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
      obj.customer_email          ||
      obj.customer_details?.email ||
      obj.billing_details?.email  ||
      ''
    )
  } catch {
    return ''
  }
}
