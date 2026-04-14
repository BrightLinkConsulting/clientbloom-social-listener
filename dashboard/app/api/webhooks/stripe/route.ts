/**
 * POST /api/webhooks/stripe
 *
 * Stripe webhook handler. Processes subscription lifecycle events and
 * drives tenant provisioning, suspension, and reactivation.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY            — sk_live_... or sk_test_...
 *   STRIPE_WEBHOOK_SECRET        — whsec_... from Stripe dashboard webhook settings
 *   PLATFORM_AIRTABLE_TOKEN      — token for platform Airtable base
 *   PLATFORM_AIRTABLE_BASE_ID    — platform base that holds the Tenants table
 *   AIRTABLE_PROVISIONING_TOKEN  — token with write access to the shared data base
 *   RESEND_API_KEY               — (optional) for sending welcome / suspension emails
 *   NEXT_PUBLIC_BASE_URL         — canonical app URL
 *
 * Events handled:
 *   checkout.session.completed    → provision new tenant (create record + seed data)
 *   invoice.payment_failed        → suspend tenant (access disabled)
 *   invoice.payment_succeeded     → reactivate suspended tenant
 *   customer.subscription.deleted → suspend tenant (canceled)
 */

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import crypto from 'crypto'
import { provisionNewTenant } from '@/lib/provision'
import { planFromPriceId, escapeAirtableString } from '@/lib/tier'
import {
  buildPurchaseWelcomeEmail,
  buildUpgradeConfirmationEmail,
  buildAdminNewPurchaseEmail,
  buildAdminPaymentFailedEmail,
  buildCancellationEmail,
} from '@/lib/emails'
import { sendPurchaseAlert } from '@/lib/notify'
import { ghlMoveToPaid }     from '@/lib/ghl-platform'

// Tier → plan name mapping (duplicated from lib/tier for use without process.env at module scope)
const TIER_TO_PLAN: Record<string, string> = {
  starter: 'Scout Starter',
  pro:     'Scout Pro',
  agency:  'Scout Agency',
}
// Tier → price ID (read at runtime so env vars are resolved)
function priceIdForTier(tier: string): string {
  const map: Record<string, string | undefined> = {
    starter: process.env.STRIPE_PRICE_STARTER,
    pro:     process.env.STRIPE_PRICE_PRO,
    agency:  process.env.STRIPE_PRICE_AGENCY,
  }
  return map[tier] || ''
}

// ── Airtable helpers (platform Tenants table) ──────────────────────────────
const PLATFORM_TOKEN  = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE   = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const TENANTS_TABLE   = 'Tenants'
const BASE_URL        = (process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '')

async function findTenantByEmail(email: string) {
  const url =
    `https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent(TENANTS_TABLE)}` +
    `?filterByFormula=${encodeURIComponent(`{Email}='${escapeAirtableString(email.toLowerCase())}'`)}&maxRecords=1`

  const resp = await fetch(url, { headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` } })
  if (!resp.ok) return null
  const data = await resp.json()
  return data.records?.[0] || null
}

async function findTenantByStripeCustomerId(customerId: string) {
  const url =
    `https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent(TENANTS_TABLE)}` +
    `?filterByFormula=${encodeURIComponent(`{Stripe Customer ID}='${escapeAirtableString(customerId)}'`)}&maxRecords=1`

  const resp = await fetch(url, { headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` } })
  if (!resp.ok) return null
  const data = await resp.json()
  return data.records?.[0] || null
}

async function createTenantRecord(fields: Record<string, any>) {
  const resp = await fetch(
    `https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent(TENANTS_TABLE)}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${PLATFORM_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    }
  )
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Airtable createTenant failed: ${err}`)
  }
  return resp.json()
}

async function updateTenantRecord(recordId: string, fields: Record<string, any>) {
  const resp = await fetch(
    `https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent(TENANTS_TABLE)}/${recordId}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${PLATFORM_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    }
  )
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Airtable updateTenant failed: ${err}`)
  }
  return resp.json()
}

// ── Email helpers ──────────────────────────────────────────────────────────
async function sendWelcomeEmail(
  email:       string,
  companyName: string,
  password:    string,
  plan:        string,
) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    console.log(`[webhook] Would send welcome email to ${email} (RESEND_API_KEY not set)`)
    return
  }
  const { subject, html } = buildPurchaseWelcomeEmail({
    companyName,
    email,
    password,
    plan,
    appUrl: BASE_URL,
  })
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Scout by ClientBloom <info@clientbloom.ai>', to: [email], subject, html }),
  })
}

/** General admin notification for cases without a dedicated template (e.g. cancellation). */
async function sendAdminNotification(event: string, email: string, details: string) {
  const resendKey  = process.env.RESEND_API_KEY
  const adminEmail = process.env.ADMIN_EMAIL || ''
  if (!resendKey || !adminEmail) return

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    'Scout Alerts <info@clientbloom.ai>',
      to:      [adminEmail],
      subject: `[Scout] ${event} — ${email}`,
      html:    `<p><strong>${event}</strong></p><p>${email}</p><p>${details}</p>`,
    }),
  })
}

/** Typed admin notification using a lib/emails.ts template. */
async function sendAdminEmail(subject: string, html: string) {
  const resendKey  = process.env.RESEND_API_KEY
  const adminEmail = process.env.ADMIN_EMAIL || ''
  if (!resendKey || !adminEmail) return
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Scout Alerts <info@clientbloom.ai>', to: [adminEmail], subject, html }),
  })
}

// ── Password generator ─────────────────────────────────────────────────────
function generatePassword(): string {
  return crypto.randomBytes(9).toString('base64url').slice(0, 12)
}

async function hashPassword(plain: string): Promise<string> {
  const bcrypt = await import('bcryptjs')
  return bcrypt.hash(plain, 12)
}

// ── Main handler ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ''
  const secretKey     = process.env.STRIPE_SECRET_KEY     || ''

  if (!webhookSecret || !secretKey) {
    console.error('[webhook] Missing STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  // Instantiate Stripe inside handler so env vars are always resolved
  const stripe = new Stripe(secretKey, { apiVersion: '2023-10-16' as any })

  const rawBody = await req.text()
  const sig     = req.headers.get('stripe-signature') || ''

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch {
    console.warn('[webhook] Invalid Stripe signature — rejecting request')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  console.log(`[webhook] Received: ${event.type}`)

  try {
    switch (event.type) {

      // ── New subscription purchased ────────────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== 'subscription') break

        const email      = session.customer_details?.email || session.customer_email || ''
        const customerId = typeof session.customer === 'string' ? session.customer : ''
        const subId      = typeof session.subscription === 'string' ? session.subscription : ''

        // Detect tier from session metadata (set during checkout creation in /api/billing/upgrade).
        // NOTE: line_items are NOT included in webhook payloads by default — do not rely on them.
        const tier     = (session.metadata?.tier || 'pro').toLowerCase()
        const planName = TIER_TO_PLAN[tier] || 'Scout Pro'
        const priceId  = priceIdForTier(tier)

        if (!email) {
          console.error('[webhook] No email on checkout session:', session.id)
          break
        }

        // Idempotency: if tenant already exists (trial user upgrading), update their plan
        const existing = await findTenantByEmail(email)
        if (existing) {
          const fields: Record<string, any> = {}
          if (customerId)  fields['Stripe Customer ID']     = customerId
          if (subId)       fields['Stripe Subscription ID'] = subId
          if (planName)    fields['Plan']                   = planName
          if (priceId)     fields['Stripe Price ID']        = priceId
          fields['Status']          = 'Active'
          fields['Trial Ends At']   = null  // clear trial expiry on paid conversion
          fields['Trial Email Day'] = 0     // stop trial email sequence
          await updateTenantRecord(existing.id, fields)
          console.log(`[webhook] Trial user ${email} upgraded to ${planName}`)

          // Send upgrade confirmation to user and admin notification
          const resendKey  = process.env.RESEND_API_KEY
          const adminEmail = process.env.ADMIN_EMAIL || ''
          const companyName = (existing.fields['Company Name'] as string) || email
          if (resendKey) {
            const { subject, html } = buildUpgradeConfirmationEmail({
              companyName,
              email,
              plan: planName,
              appUrl: BASE_URL,
            })
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ from: 'Scout by ClientBloom <info@clientbloom.ai>', to: [email], subject, html }),
            })
            if (adminEmail) {
              const purchaseAlert = buildAdminNewPurchaseEmail({
                email, name: companyName, plan: planName, subId: subId || '',
              })
              await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ from: 'Scout Alerts <info@clientbloom.ai>', to: [adminEmail], subject: purchaseAlert.subject, html: purchaseAlert.html }),
              })
            }
          }
          // Slack alert + GHL pipeline move (trial → paid) — awaited before break
          await Promise.allSettled([
            sendPurchaseAlert(email, companyName, planName),
            ghlMoveToPaid(email, companyName, planName, existing.id),
          ])
          break
        }

        // Brand new user (direct purchase, skipped trial)
        const password     = generatePassword()
        const passwordHash = await hashPassword(password)
        const companyName  = session.customer_details?.name || email.split('@')[0]

        // 1. Create Tenant record
        const tenantRecord = await createTenantRecord({
          'Email':                  email.toLowerCase(),
          'Company Name':           companyName,
          'Password Hash':          passwordHash,
          'Status':                 'Active',
          'Plan':                   planName,
          'Trial Type':             'cc',
          'Stripe Price ID':        priceId,
          'Is Admin':               false,
          'Stripe Customer ID':     customerId,
          'Stripe Subscription ID': subId,
        })

        // 2. Auto-provision
        try {
          const tenantId = await provisionNewTenant(tenantRecord.id, companyName)
          console.log(`[webhook] Provisioned tenant ID ${tenantId} for ${email} (${planName})`)
        } catch (provErr: any) {
          console.error(`[webhook] provisionNewTenant failed for ${email}:`, provErr.message)
        }

        // 3. Send welcome email + admin notification
        await sendWelcomeEmail(email, companyName, password, planName)
        const purchaseAlert = buildAdminNewPurchaseEmail({
          email, name: companyName, plan: planName, subId: subId || '',
        })
        await sendAdminEmail(purchaseAlert.subject, purchaseAlert.html)

        // Slack alert + GHL pipeline entry (direct purchase) — awaited before break
        await Promise.allSettled([
          sendPurchaseAlert(email, companyName, planName),
          ghlMoveToPaid(email, companyName, planName, tenantRecord.id),
        ])

        console.log(`[webhook] Provisioned new tenant: ${email}`)
        break
      }

      // ── Payment failed — suspend access ──────────────────────────────
      case 'invoice.payment_failed': {
        const invoice    = event.data.object as Stripe.Invoice
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : ''
        if (!customerId) break

        const tenant = await findTenantByStripeCustomerId(customerId)
        if (!tenant) {
          console.warn(`[webhook] No tenant for Stripe customer ${customerId}`)
          break
        }

        await updateTenantRecord(tenant.id, { 'Status': 'Suspended' })
        const tenantEmail = (tenant.fields['Email'] || customerId) as string
        const failedAlert = buildAdminPaymentFailedEmail({
          email:     tenantEmail,
          invoiceId: invoice.id || '',
          amount:    `$${(invoice.amount_due / 100).toFixed(2)}`,
        })
        await sendAdminEmail(failedAlert.subject, failedAlert.html)
        console.log(`[webhook] Suspended tenant due to payment failure: ${customerId}`)
        break
      }

      // ── Payment succeeded — reactivate if suspended ───────────────────
      case 'invoice.payment_succeeded': {
        const invoice    = event.data.object as Stripe.Invoice
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : ''
        if (!customerId) break

        const tenant = await findTenantByStripeCustomerId(customerId)
        if (!tenant) break

        if (tenant.fields['Status'] === 'Suspended') {
          await updateTenantRecord(tenant.id, { 'Status': 'Active' })
          console.log(`[webhook] Reactivated tenant: ${customerId}`)
        }
        break
      }

      // ── Subscription canceled — suspend access ───────────────────────
      case 'customer.subscription.deleted': {
        const sub        = event.data.object as Stripe.Subscription
        const customerId = typeof sub.customer === 'string' ? sub.customer : ''
        if (!customerId) break

        const tenant = await findTenantByStripeCustomerId(customerId)
        if (!tenant) {
          console.warn(`[webhook] No tenant for Stripe customer ${customerId}`)
          break
        }

        await updateTenantRecord(tenant.id, { 'Status': 'Suspended' })

        // Cancellation email to the user — confirms access period, includes resubscribe CTA
        const cancelEmail  = tenant.fields['Email'] as string || ''
        const cancelName   = tenant.fields['Company Name'] as string || cancelEmail
        const periodEndMs  = (sub.current_period_end || 0) * 1000
        const periodEndDate = periodEndMs
          ? new Date(periodEndMs).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' })
          : 'end of billing period'
        const resendKeyCancel = process.env.RESEND_API_KEY
        if (resendKeyCancel && cancelEmail) {
          const { subject: cancelSubject, html: cancelHtml } = buildCancellationEmail({
            name:           cancelName,
            email:          cancelEmail,
            periodEndDate,
            resubscribeUrl: `${BASE_URL}/upgrade`,
          })
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${resendKeyCancel}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: 'Scout by ClientBloom <info@clientbloom.ai>', to: [cancelEmail], subject: cancelSubject, html: cancelHtml }),
          })
        }

        await sendAdminNotification(
          'Subscription canceled — tenant suspended',
          cancelEmail || customerId,
          `Subscription: ${sub.id}`
        )
        console.log(`[webhook] Suspended tenant due to cancellation: ${customerId}`)
        break
      }

      default:
        break
    }
  } catch (err: any) {
    console.error(`[webhook] Error processing ${event.type}:`, err.message)
    // Return 200 so Stripe doesn't retry — log for manual review
    return NextResponse.json({ received: true, error: err.message }, { status: 200 })
  }

  return NextResponse.json({ received: true })
}
