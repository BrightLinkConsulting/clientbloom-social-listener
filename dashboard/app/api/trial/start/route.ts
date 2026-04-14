/**
 * POST /api/trial/start
 *
 * Creates a no-credit-card 7-day trial account in Airtable.
 * This is the entry point for all new Scout users — Stripe is NOT touched here.
 *
 * Security measures:
 * - IP rate-limited: 10 requests per IP per hour (in-memory, sliding window)
 * - Email normalization (lowercase, Gmail + alias stripping)
 * - Duplicate email check before creating record (idempotent — 409 on same email)
 * - Trial Ends At is treated as required — returns 500 if Airtable write fails
 *
 * On success:
 * - Airtable Tenant record is created with Plan='Trial', Status='Active'
 * - Day 1 trial email is triggered via Resend
 * - Admin notification is sent
 * - Auto-provision is triggered (generates Tenant ID, seeds Business Profile)
 */

import { NextRequest, NextResponse } from 'next/server'
import { provisionNewTenant }        from '@/lib/provision'
import { escapeAirtableString }      from '@/lib/tier'
import { buildTrialDay1Email, buildAdminNewTrialEmail } from '@/lib/emails'
import { sendTrialSignupAlert }                         from '@/lib/notify'
import { ghlAddTrialUser }                              from '@/lib/ghl-platform'

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const RESEND_KEY     = process.env.RESEND_API_KEY             || ''
const BASE_URL       = (process.env.NEXT_PUBLIC_BASE_URL || 'https://scout.clientbloom.ai').replace(/\/$/, '')
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL || 'twp1996@gmail.com'

// ── IP rate limiter (in-memory, module-level) ─────────────────────────────
// 10 attempts per IP per hour — generous enough for legitimate use, tight enough
// to block automated trial-account farming. Upgrade to Redis (Upstash) when
// the platform scales beyond a single Vercel function instance.
const WINDOW_MS  = 60 * 60 * 1000
const IP_MAX     = 10

interface RateBucket { count: number; resetAt: number }
const ipBuckets: Map<string, RateBucket> = new Map()

function checkIpRateLimit(ip: string): boolean {
  const now = Date.now()
  let b = ipBuckets.get(ip)
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + WINDOW_MS }
    ipBuckets.set(ip, b)
  }
  if (b.count >= IP_MAX) return false
  b.count++
  return true
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for') ?? ''
  return forwarded.split(',')[0].trim() || 'unknown'
}

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
    `?filterByFormula=${encodeURIComponent(`{Email}='${escapeAirtableString(email)}'`)}&maxRecords=1`
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

async function sendTrialDay1Email(email: string): Promise<void> {
  if (!RESEND_KEY) {
    console.log(`[trial/start] Would send Day 1 email to ${email} — RESEND_API_KEY not set`)
    return
  }

  const unsubUrl = `${BASE_URL}/api/unsubscribe?email=${encodeURIComponent(email)}`
  const { subject, html } = buildTrialDay1Email({ appUrl: BASE_URL, unsubUrl })

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Mike at Scout <info@clientbloom.ai>',
      to:   [email],
      subject,
      html,
    }),
  })
}

async function sendAdminNotification(email: string, name: string, trialEndsAt: Date): Promise<void> {
  if (!RESEND_KEY) return
  const trialEnds = trialEndsAt.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles',
  })
  const { subject, html } = buildAdminNewTrialEmail({ email, name, trialEnds })
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Scout Alerts <info@clientbloom.ai>', to: [ADMIN_EMAIL], subject, html }),
  })
}

// ── Main handler ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!PLATFORM_TOKEN || !PLATFORM_BASE) {
    return NextResponse.json({ error: 'Platform not configured' }, { status: 500 })
  }

  // IP rate limit — checked before any Airtable interaction
  if (!checkIpRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    )
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
        { error: 'Your trial has expired. Please upgrade to continue using Scout.', action: 'upgrade' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: 'An account with this email already exists. Please sign in instead.', action: 'sign_in' },
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
      'Created At':      new Date().toISOString(),   // full ISO — enrollment datetime, not date-only
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
  await sendTrialDay1Email(email).catch(e =>
    console.error('[trial/start] Day 1 email failed:', e.message)
  )
  await sendAdminNotification(email, name.trim(), trialEndsAt).catch(e =>
    console.error('[trial/start] Admin notification failed:', e.message)
  )

  // Slack alert + GHL pipeline entry (non-fatal, fire-and-forget)
  sendTrialSignupAlert(email, name.trim()).catch(e =>
    console.error('[trial/start] Slack trial alert failed:', e.message)
  )
  ghlAddTrialUser(email, name.trim()).catch(e =>
    console.error('[trial/start] GHL add trial user failed:', e.message)
  )

  console.log(`[trial/start] New trial account created: ${email}, expires: ${trialEndsAt.toISOString()}`)

  return NextResponse.json({
    ok: true,
    message: 'Trial account created',
    trialEndsAt: trialEndsAt.toISOString(),
  })
}

