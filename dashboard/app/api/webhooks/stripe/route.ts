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

// ── Airtable helpers (platform Tenants table) ──────────────────────────────
const PLATFORM_TOKEN  = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE   = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const TENANTS_TABLE   = 'Tenants'
const BASE_URL        = (process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '')

async function findTenantByEmail(email: string) {
  const url =
    `https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent(TENANTS_TABLE)}` +
    `?filterByFormula=${encodeURIComponent(`{Email}='${email.toLowerCase()}'`)}&maxRecords=1`

  const resp = await fetch(url, { headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` } })
  if (!resp.ok) return null
  const data = await resp.json()
  return data.records?.[0] || null
}

async function findTenantByStripeCustomerId(customerId: string) {
  const url =
    `https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent(TENANTS_TABLE)}` +
    `?filterByFormula=${encodeURIComponent(`{Stripe Customer ID}='${customerId}'`)}&maxRecords=1`

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
async function sendWelcomeEmail(email: string, companyName: string, password: string) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    console.log(`[webhook] Would send welcome email to ${email} (RESEND_API_KEY not set)`)
    return
  }

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
      <div style="background:#4F6BFF;padding:24px 32px;border-radius:12px 12px 0 0">
        <p style="color:#fff;font-size:18px;font-weight:700;margin:0">Scout by ClientBloom</p>
      </div>
      <div style="background:#f9f9f9;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none">
        <h2 style="margin:0 0 12px">Welcome, ${companyName || email.split('@')[0]}.</h2>
        <p style="color:#444;line-height:1.6">
          Your Scout account is live and ready. Here are your login credentials:
        </p>
        <div style="background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:20px;margin:20px 0">
          <p style="margin:0 0 8px;font-size:13px;color:#888">Email</p>
          <p style="margin:0 0 16px;font-weight:600">${email}</p>
          <p style="margin:0 0 8px;font-size:13px;color:#888">Temporary password</p>
          <p style="margin:0;font-family:monospace;font-size:15px;background:#f5f5f5;padding:8px 12px;border-radius:6px;letter-spacing:0.05em">${password}</p>
        </div>
        <p style="color:#444;line-height:1.6;font-size:14px">
          Sign in and complete your quick setup — tell Scout about your business and
          the kinds of leads you're looking for. Then hit <strong>Scan Now</strong>
          to pull your first batch of leads immediately.
        </p>
        <a href="${BASE_URL}/sign-in"
           style="display:inline-block;background:#4F6BFF;color:#fff;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:8px">
          Sign in to Scout →
        </a>
        <hr style="border:none;border-top:1px solid #e5e5e5;margin:28px 0" />
        <p style="font-size:12px;color:#999;margin:0">
          Questions? Reply to this email — we're real people and we read every message.
        </p>
      </div>
    </div>
  `

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Scout by ClientBloom <noreply@clientbloom.ai>',
      to: [email],
      subject: 'Your Scout account is ready',
      html,
    }),
  })
}

async function sendAdminNotification(event: string, email: string, details: string) {
  const resendKey  = process.env.RESEND_API_KEY
  const adminEmail = process.env.ADMIN_EMAIL || 'twp1996@gmail.com'
  if (!resendKey) return

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Scout Alerts <noreply@clientbloom.ai>',
      to: [adminEmail],
      subject: `[Scout] ${event} — ${email}`,
      html: `<p><strong>${event}</strong></p><p>${email}</p><p>${details}</p>`,
    }),
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

  try {
    stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch {
    console.warn('[webhook] Invalid Stripe signature — rejecting request')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = JSON.parse(rawBody) as Stripe.Event
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
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

        if (!email) {
          console.error('[webhook] No email on checkout session:', session.id)
          break
        }

        // Idempotency: don't re-provision if tenant already exists
        const existing = await findTenantByEmail(email)
        if (existing) {
          const fields: Record<string, any> = {}
          if (!existing.fields['Stripe Customer ID'] && customerId)  fields['Stripe Customer ID']  = customerId
          if (!existing.fields['Stripe Subscription ID'] && subId)   fields['Stripe Subscription ID'] = subId
          if (existing.fields['Status'] === 'Suspended')             fields['Status'] = 'Active'
          if (Object.keys(fields).length) await updateTenantRecord(existing.id, fields)
          console.log(`[webhook] Tenant already exists for ${email}, updated Stripe IDs`)
          break
        }

        // Generate login credentials
        const password     = generatePassword()
        const passwordHash = await hashPassword(password)
        const companyName  = session.customer_details?.name || email.split('@')[0]

        // 1. Create Tenant record in the platform Tenants table
        const tenantRecord = await createTenantRecord({
          'Email':                  email.toLowerCase(),
          'Company Name':           companyName,
          'Password Hash':          passwordHash,
          'Status':                 'Active',
          'Plan':                   'Scout $79',
          'Is Admin':               false,
          'Stripe Customer ID':     customerId,
          'Stripe Subscription ID': subId,
        })

        // 2. Auto-provision: generate Tenant ID + seed Business Profile
        //    No Airtable setup required from the customer
        try {
          const tenantId = await provisionNewTenant(tenantRecord.id, companyName)
          console.log(`[webhook] Provisioned tenant ID ${tenantId} for ${email}`)
        } catch (provErr: any) {
          console.error(`[webhook] provisionNewTenant failed for ${email}:`, provErr.message)
          // Non-fatal — tenant can still log in; provisioning can be retried
        }

        // 2.5. Calculate and store trial end date
        try {
          const trialEndAt = new Date()
          trialEndAt.setDate(trialEndAt.getDate() + 14)
          await updateTenantRecord(tenantRecord.id, {
            'Trial Ends At': trialEndAt.toISOString(),
          })
          console.log(`[webhook] Trial expires for ${email} on ${trialEndAt.toISOString()}`)
        } catch (trialErr: any) {
          console.error(`[webhook] Failed to set trial end date for ${email}:`, trialErr.message)
          // Non-fatal
        }

        // 3. Send welcome email + admin notification
        await sendWelcomeEmail(email, companyName, password)
        await sendAdminNotification(
          'New signup',
          email,
          `Company: ${companyName} | Subscription: ${subId}`
        )

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
        await sendAdminNotification(
          'Payment failed — tenant suspended',
          tenant.fields['Email'] || customerId,
          `Invoice: ${invoice.id} | Amount due: $${(invoice.amount_due / 100).toFixed(2)}`
        )
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
        await sendAdminNotification(
          'Subscription canceled — tenant suspended',
          tenant.fields['Email'] || customerId,
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
