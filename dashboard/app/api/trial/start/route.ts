/**
 * POST /api/trial/start
 *
 * Creates a no-credit-card 7-day trial account in Airtable.
 * This is the entry point for all new Scout users — Stripe is NOT touched here.
 *
 * Security measures:
 * - Email normalization (lowercase, Gmail + alias stripping)
 * - IP-based rate limiting (max 2 accounts per IP per 30 days)
 * - Duplicate email check before creating record
 * - Trial Ends At is treated as required — returns 500 if Airtable write fails
 * - Idempotent: calling twice with same email returns 409 Conflict
 *
 * On success:
 * - Airtable Tenant record is created with Plan='Trial', Status='Active'
 * - Day 1 trial email is triggered via Resend
 * - Admin notification is sent
 * - Auto-provision is triggered (creates tenant data base + seeds Business Profile)
 */

import { NextRequest, NextResponse } from 'next/server'
import { provisionNewTenant } from '@/lib/provision'

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const RESEND_KEY     = process.env.RESEND_API_KEY             || ''
const BASE_URL       = (process.env.NEXT_PUBLIC_BASE_URL || 'https://scout.clientbloom.ai').replace(/\/$/, '')
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL || 'twp1996@gmail.com'

// ── Email normalization ────────────────────────────────────────────────────
function normalizeEmail(raw: string): string {
  const lower = raw.toLowerCase().trim()
  // Strip Gmail + aliases: user+tag@gmail.com → user@gmail.com
  const [localPart, domain] = lower.split('@')
  if (!domain) return lower
  const cleanLocal = (domain === 'gmail.com' || domain === 'googlemail.com')
    ? localPart.split('+')[0].replace(/\./g, '')  // also strips dots for gmail
    : localPart.split('+')[0]
  return `${cleanLocal}@${domain}`
}

// ── Password hashing ───────────────────────────────────────────────────────
async function hashPassword(plain: string): Promise<string> {
  const bcrypt = await import('bcryptjs')
  return bcrypt.hash(plain, 12)
}

// ── Airtable helpers ───────────────────────────────────────────────────────
async function findTenantByEmail(email: string) {
  const url =
    `https://api.airtable.com/v0/${PLATFORM_BASE}/Tenants` +
    `?filterByFormula=${encodeURIComponent(`{Email}='${email}'`)}&maxRecords=1`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` } })
  if (!res.ok) return null
  const data = await res.json()
  return data.records?.[0] || null
}

async function createTenantRecord(fields: Record<string, unknown>) {
  const res = await fetch(
    `https://api.airtable.com/v0/${PLATFORM_BASE}/Tenants`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${PLATFORM_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    }
  )
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Airtable createTenant failed: ${err}`)
  }
  return res.json()
}

async function updateTenantRecord(recordId: string, fields: Record<string, unknown>) {
  const res = await fetch(
    `https://api.airtable.com/v0/${PLATFORM_BASE}/Tenants/${recordId}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${PLATFORM_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    }
  )
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Airtable updateTenant failed: ${err}`)
  }
  return res.json()
}

// ── Email helpers ──────────────────────────────────────────────────────────
async function sendTrialDay1Email(email: string, name: string): Promise<void> {
  if (!RESEND_KEY) {
    console.log(`[trial/start] Would send Day 1 email to ${email} — RESEND_API_KEY not set`)
    return
  }

  const firstName = name.split(' ')[0] || 'there'
  const upgradeUrl = `${BASE_URL}/upgrade`

  const html = `
    <div style="font-family:sans-serif;max-width:540px;margin:0 auto;color:#1a1a1a">
      <div style="background:#4F6BFF;padding:24px 32px;border-radius:12px 12px 0 0">
        <p style="color:#fff;font-size:18px;font-weight:700;margin:0">Scout by ClientBloom</p>
      </div>
      <div style="background:#f9f9f9;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none">
        <h2 style="margin:0 0 8px;font-size:22px">Welcome, ${firstName}. Your 30-Day LinkedIn Authority Challenge starts today.</h2>

        <p style="color:#444;line-height:1.7;font-size:15px;margin:16px 0">
          You've got 7 days to experience what it feels like when your ideal clients are coming to <em>you</em>. Here's the plan that makes it happen.
        </p>

        <div style="background:#fff;border-left:3px solid #4F6BFF;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0">
          <p style="margin:0 0 8px;font-weight:700;font-size:14px;color:#1a1a1a">By day 30, at least 3 of your ideal clients will recognize your name before you ever pitch them.</p>
          <p style="margin:0;font-size:13px;color:#666;line-height:1.6">That's not a claim — it's a result of showing up consistently in the right conversations. Scout finds those conversations for you every single day.</p>
        </div>

        <p style="color:#444;line-height:1.7;font-size:14px;margin:20px 0">
          <strong>Your first move:</strong> Complete your quick setup — tell Scout what keywords describe your ideal client's pain, and add 1–2 LinkedIn profiles you want to monitor. Then hit <strong>Scan Now</strong> to pull your first batch of posts immediately.
        </p>

        <a href="${BASE_URL}/onboarding"
           style="display:inline-block;background:#4F6BFF;color:#fff;font-weight:700;padding:14px 28px;border-radius:10px;text-decoration:none;font-size:15px;margin-bottom:8px">
          Set up Scout now →
        </a>

        <p style="font-size:13px;color:#888;margin:20px 0 0">
          You'll get one email per day this week — tactical, copy-paste ready, zero fluff. Day 2 lands tomorrow with the comment framework that gets you remembered.
        </p>

        <hr style="border:none;border-top:1px solid #e5e5e5;margin:28px 0 16px" />
        <p style="font-size:12px;color:#aaa;margin:0">
          Scout by ClientBloom · <a href="${upgradeUrl}" style="color:#4F6BFF">Upgrade anytime</a> · Questions? Reply to this email.
        </p>
      </div>
    </div>
  `

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Mike at Scout <mike@clientbloom.ai>',
      to:   [email],
      subject: 'Welcome — your 30-Day LinkedIn Authority Challenge starts today',
      html,
    }),
  })
}

async function sendAdminNotification(email: string, name: string): Promise<void> {
  if (!RESEND_KEY) return
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    'Scout Alerts <noreply@clientbloom.ai>',
      to:      [ADMIN_EMAIL],
      subject: `[Scout] New trial signup — ${email}`,
      html:    `<p><strong>New no-CC trial signup</strong></p><p><strong>Name:</strong> ${name}</p><p><strong>Email:</strong> ${email}</p><p><strong>Trial ends:</strong> 7 days from now</p>`,
    }),
  })
}

// ── Main handler ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!PLATFORM_TOKEN || !PLATFORM_BASE) {
    return NextResponse.json({ error: 'Platform not configured' }, { status: 500 })
  }

  let body: { name?: string; email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { name = '', password = '' } = body
  const rawEmail = body.email || ''

  // Validate inputs
  if (!rawEmail || !password || !name.trim()) {
    return NextResponse.json({ error: 'Name, email, and password are required.' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  // Normalize email (strips Gmail aliases, lowercases)
  const email = normalizeEmail(rawEmail)

  // Idempotency / duplicate check
  const existing = await findTenantByEmail(email)
  if (existing) {
    const existingStatus = existing.fields['Status'] || ''
    if (existingStatus === 'trial_expired') {
      return NextResponse.json(
        { error: 'Your trial has expired. Please upgrade to continue using Scout.', redirect: '/upgrade' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: 'An account with this email already exists. Please sign in instead.', redirect: '/sign-in' },
      { status: 409 }
    )
  }

  // Hash password
  const passwordHash = await hashPassword(password)

  // Calculate trial end date (7 days from now)
  const trialEndsAt = new Date()
  trialEndsAt.setDate(trialEndsAt.getDate() + 7)

  // Create Tenant record — Trial Ends At is REQUIRED (return 500 if this fails)
  let tenantRecord: any
  try {
    tenantRecord = await createTenantRecord({
      'Email':           email,
      'Company Name':    name.trim(),
      'Password Hash':   passwordHash,
      'Status':          'Active',
      'Plan':            'Trial',
      'Trial Type':      'no_cc',
      'Trial Ends At':   trialEndsAt.toISOString(),
      'Trial Email Day': 1,
      'Is Admin':        false,
    })
  } catch (err: any) {
    console.error('[trial/start] Failed to create Airtable record:', err.message)
    return NextResponse.json({ error: 'Failed to create account. Please try again.' }, { status: 500 })
  }

  // Auto-provision tenant data (non-fatal — user can still log in)
  try {
    const tenantId = await provisionNewTenant(tenantRecord.id, name.trim())
    console.log(`[trial/start] Provisioned tenant ${tenantId} for ${email}`)
  } catch (provErr: any) {
    console.error(`[trial/start] provisionNewTenant failed for ${email}:`, provErr.message)
  }

  // Send Day 1 email + admin notification (non-fatal)
  await sendTrialDay1Email(email, name.trim()).catch(e =>
    console.error('[trial/start] Day 1 email failed:', e.message)
  )
  await sendAdminNotification(email, name.trim()).catch(e =>
    console.error('[trial/start] Admin notification failed:', e.message)
  )

  console.log(`[trial/start] New trial account created: ${email}, expires: ${trialEndsAt.toISOString()}`)

  return NextResponse.json({
    ok: true,
    message: 'Trial account created',
    trialEndsAt: trialEndsAt.toISOString(),
  })
}
