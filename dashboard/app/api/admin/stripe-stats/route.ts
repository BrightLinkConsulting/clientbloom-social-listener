/**
 * GET /api/admin/stripe-stats
 *
 * Returns subscription and revenue metrics for the Scout admin dashboard.
 * Queries ALL three Scout price IDs (Starter $49 / Pro $99 / Agency $249)
 * so every paying subscriber appears in admin counts and MRR is accurate.
 *
 * Admin-only — requires isAdmin session flag.
 */

import { NextResponse } from 'next/server'
import { getTenantConfig } from '@/lib/tenant'

// Price IDs map to their monthly amounts
const SCOUT_PRICES: Record<string, number> = {
  // Populated from env vars at runtime — see below
}

export async function GET() {
  const tenant = await getTenantConfig()
  if (!tenant)         return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!tenant.isAdmin) return NextResponse.json({ error: 'Admin only'   }, { status: 403 })

  const stripeKey      = process.env.STRIPE_SECRET_KEY          || ''
  const priceStarter   = process.env.STRIPE_PRICE_STARTER       || ''
  const pricePro       = process.env.STRIPE_PRICE_PRO           || ''
  const priceAgency    = process.env.STRIPE_PRICE_AGENCY        || ''
  const platformToken  = process.env.PLATFORM_AIRTABLE_TOKEN    || ''
  const platformBase   = process.env.PLATFORM_AIRTABLE_BASE_ID  || ''

  // Build price → amount map from env vars
  const priceAmountMap: Record<string, number> = {}
  if (priceStarter) priceAmountMap[priceStarter] = 49
  if (pricePro)     priceAmountMap[pricePro]     = 99
  if (priceAgency)  priceAmountMap[priceAgency]  = 249

  // All configured Scout price IDs
  const scoutPriceIds = Object.keys(priceAmountMap)

  // ── Scout tenant counts from Airtable (always available) ────────────────────
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
        const payingTenants = allTenants.filter((r: any) => r.fields?.Plan !== 'Owner')
        activeTenants    = payingTenants.filter((r: any) => r.fields?.Status === 'Active').length
        suspendedTenants = payingTenants.filter((r: any) => r.fields?.Status === 'Suspended').length
      }
    } catch {
      // fallthrough
    }
  }

  // ── Stripe metrics (all Scout prices) ────────────────────────────────────────
  if (stripeKey && scoutPriceIds.length > 0) {
    try {
      const Stripe = (await import('stripe')).default
      const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' })

      const now       = Math.floor(Date.now() / 1000)
      const sixMonths = now - 60 * 60 * 24 * 30 * 6

      // Fetch active + past_due + canceled subs for EACH Scout price ID
      const subFetches = scoutPriceIds.flatMap(priceId => [
        stripe.subscriptions.list({ status: 'active',   price: priceId, limit: 100 }),
        stripe.subscriptions.list({ status: 'past_due', price: priceId, limit: 100 }),
        stripe.subscriptions.list({ status: 'canceled', price: priceId, limit: 100 }),
      ])

      const allSubResults = await Promise.all(subFetches)

      // Collect unique subscriptions across all price IDs (deduplicate by sub ID)
      const seenSubIds = new Set<string>()
      const activeSubs: any[] = []
      const canceledSubs: any[] = []

      for (let i = 0; i < allSubResults.length; i++) {
        const isActive  = i % 3 === 0
        const isPastDue = i % 3 === 1
        const isCanceled = i % 3 === 2

        for (const sub of allSubResults[i].data) {
          if (seenSubIds.has(sub.id)) continue
          seenSubIds.add(sub.id)

          if (isActive || isPastDue) {
            activeSubs.push(sub)
          } else if (isCanceled) {
            canceledSubs.push(sub)
          }
        }
      }

      // MRR: sum actual subscription amounts based on price ID
      let mrr = 0
      for (const sub of activeSubs) {
        // Find which Scout price this subscription is for
        for (const item of (sub.items?.data || [])) {
          const pid = item.price?.id
          if (pid && priceAmountMap[pid] !== undefined) {
            mrr += priceAmountMap[pid]
          }
        }
      }
      const arr = mrr * 12

      // Build set of all Scout customer IDs for event filtering
      const allScoutSubs = [...activeSubs, ...canceledSubs]
      const scoutCustomerIds = new Set(
        allScoutSubs.map((s: any) => (typeof s.customer === 'string' ? s.customer : s.customer.id))
      )

      // Monthly revenue — paid invoices with any Scout price line item
      const invoices = await stripe.invoices.list({
        limit:   100,
        status:  'paid',
        created: { gte: sixMonths },
      })

      const monthlyRevenue: Record<string, number> = {}
      for (const inv of invoices.data) {
        const isScout = inv.lines.data.some((line: any) => scoutPriceIds.includes(line.price?.id))
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
        activeCount:    activeSubs.length,
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

  // ── Stub mode (Stripe not configured or errored) ──────────────────────────────
  // Estimate MRR assuming Pro ($99) for all active tenants — closest to real without Stripe
  const mrr          = activeTenants * 99
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
