/**
 * POST /api/admin/send-reset
 *
 * Admin-only. Generates a new temporary password for a tenant,
 * stores the hash in Airtable, and emails the new credentials via Resend.
 */

import { NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import { buildAdminSentResetEmail } from '@/lib/emails'
import bcrypt from 'bcryptjs'

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const RESEND_KEY     = process.env.RESEND_API_KEY             || ''
const BASE_URL_SITE  = (process.env.NEXT_PUBLIC_BASE_URL || 'https://scout.clientbloom.ai').replace(/\/$/, '')
const FROM           = 'Scout <info@clientbloom.ai>'

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let pw = ''
  for (let i = 0; i < 12; i++) {
    pw += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return pw
}

export async function POST(req: Request) {
  const caller = await getTenantConfig()
  if (!caller) return tenantError()
  if (!caller.isAdmin) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }
  if (!RESEND_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured.' }, { status: 500 })
  }

  try {
    const { id, email, companyName } = await req.json()
    if (!id || !email) {
      return NextResponse.json({ error: 'id and email are required.' }, { status: 400 })
    }

    // Generate new temp password and hash it
    const tempPassword = generateTempPassword()
    const passwordHash = await bcrypt.hash(tempPassword, 12)

    // Store new hash in Airtable
    const patchResp = await fetch(
      `https://api.airtable.com/v0/${PLATFORM_BASE}/Tenants/${id}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${PLATFORM_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields: { 'Password Hash': passwordHash } }),
      }
    )
    if (!patchResp.ok) {
      return NextResponse.json({ error: 'Failed to update password in Airtable.' }, { status: 500 })
    }

    // Send email via Resend
    const { subject: emailSubject, html } = buildAdminSentResetEmail({
      email,
      companyName: companyName || undefined,
      tempPassword,
      loginUrl:    `${BASE_URL_SITE}/sign-in`,
    })

    const emailResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [email], subject: emailSubject, html }),
    })

    if (!emailResp.ok) {
      const body = await emailResp.text()
      return NextResponse.json({ error: `Email failed: ${body.slice(0, 200)}` }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
