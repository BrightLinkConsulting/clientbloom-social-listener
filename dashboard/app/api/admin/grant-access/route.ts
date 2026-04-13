/**
 * POST /api/admin/grant-access
 *
 * Admin-only. Creates a fully-provisioned 7-day free trial account:
 *   1. Creates the Tenants record
 *   2. Calls provisionNewTenant() to generate a Tenant ID (same path as paid users)
 *   3. Sets a 7-day Trial Ends At date
 *   4. Sends a welcome email via Resend with login credentials + trial details
 *
 * When the trial expires, the user is redirected to /upgrade to subscribe.
 * Their data (ICP, captured posts) is preserved and unlocked on payment.
 */

import { NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import { provisionNewTenant } from '@/lib/provision'
import { buildAdminGrantAccessEmail } from '@/lib/emails'
import bcrypt from 'bcryptjs'

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const RESEND_KEY     = process.env.RESEND_API_KEY             || ''
const BASE_URL_SITE  = (process.env.NEXT_PUBLIC_BASE_URL || 'https://scout.clientbloom.ai').replace(/\/$/, '')
const FROM           = 'Scout <info@clientbloom.ai>'
const TRIAL_DAYS     = 7

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let pw = ''
  for (let i = 0; i < 12; i++) {
    pw += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return pw
}

function trialEndDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + TRIAL_DAYS)
  return d.toISOString()
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles',
  })
}

export async function POST(req: Request) {
  const caller = await getTenantConfig()
  if (!caller) return tenantError()
  if (!caller.isAdmin) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }
  if (!PLATFORM_TOKEN || !PLATFORM_BASE) {
    return NextResponse.json({ error: 'Platform Airtable not configured.' }, { status: 500 })
  }
  if (!RESEND_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured — cannot send welcome email.' }, { status: 500 })
  }

  try {
    const { email, companyName, note } = await req.json()
    if (!email) {
      return NextResponse.json({ error: 'email is required.' }, { status: 400 })
    }

    const cleanEmail    = email.toLowerCase().trim()
    const displayName   = companyName?.trim() || cleanEmail
    const tempPassword  = generateTempPassword()
    const passwordHash  = await bcrypt.hash(tempPassword, 12)
    const trialEndsAt   = trialEndDate()
    const trialEndLabel = formatDate(trialEndsAt)

    // ── Duplicate email guard ─────────────────────────────────────────────────
    const dupeCheckUrl =
      `https://api.airtable.com/v0/${PLATFORM_BASE}/Tenants` +
      `?filterByFormula=${encodeURIComponent(`{Email}='${cleanEmail.replace(/'/g, "\\'")}'`)}&maxRecords=1&fields[]=Email`

    const dupeResp = await fetch(dupeCheckUrl, {
      headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
    })
    if (dupeResp.ok) {
      const dupeData = await dupeResp.json()
      if ((dupeData.records || []).length > 0) {
        return NextResponse.json(
          { error: `An account with email "${cleanEmail}" already exists.` },
          { status: 409 }
        )
      }
    }

    // ── Step 1: Create Tenants record ────────────────────────────────────────
    const createResp = await fetch(
      `https://api.airtable.com/v0/${PLATFORM_BASE}/Tenants`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${PLATFORM_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: [{
            fields: {
              'Email':          cleanEmail,
              'Password Hash':  passwordHash,
              'Company Name':   displayName,
              'Plan':           'Trial',
              'Status':         'Active',
              'Trial Ends At':  trialEndsAt,
              'Created At':     new Date().toISOString(),  // full ISO datetime — never date-only
            },
          }],
        }),
      }
    )

    if (!createResp.ok) {
      const body = await createResp.text()
      return NextResponse.json({ error: `Airtable error: ${body.slice(0, 200)}` }, { status: 500 })
    }

    const created   = await createResp.json()
    const recordId  = created.records?.[0]?.id

    // ── Step 2: Provision Tenant ID (same path as paid users via Stripe) ─────
    // This generates a unique Tenant ID and stores it on the record so all
    // shared-base data tables can isolate this user's rows.
    let provisionedTenantId: string | null = null
    try {
      provisionedTenantId = await provisionNewTenant(recordId, displayName)
    } catch (provErr: any) {
      // Non-fatal: tenant can still log in, but data isolation won't work until
      // provisionNewTenant succeeds. Log and continue.
      console.error('[grant-access] provisionNewTenant failed:', provErr.message)
    }

    // ── Step 3: Send welcome email ───────────────────────────────────────────
    const { subject: emailSubject, html } = buildAdminGrantAccessEmail({
      displayName,
      email:         cleanEmail,
      tempPassword,
      trialEndLabel,
      loginUrl:      `${BASE_URL_SITE}/sign-in`,
      note:          note || undefined,
    })

    const emailResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [cleanEmail], subject: emailSubject, html }),
    })

    if (!emailResp.ok) {
      const body = await emailResp.text()
      return NextResponse.json({
        ok: true,
        recordId,
        provisionedTenantId,
        emailWarning: `Account created but welcome email failed: ${body.slice(0, 200)}`,
      })
    }

    return NextResponse.json({ ok: true, recordId, provisionedTenantId, trialEndsAt })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
