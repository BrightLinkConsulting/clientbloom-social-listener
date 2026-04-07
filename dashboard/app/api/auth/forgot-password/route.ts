/**
 * POST /api/auth/forgot-password
 *
 * Initiates password reset flow.
 * 1. Finds tenant by email
 * 2. Generates secure reset token
 * 3. Hashes and stores token + expiry in Airtable
 * 4. Sends reset email via Resend with unhashed token
 * Returns success for all emails (privacy — don't reveal if email exists)
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN || ''
const PLATFORM_BASE = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const RESEND_KEY = process.env.RESEND_API_KEY || ''
const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL || 'https://app.clientbloom.ai').replace(/\/$/, '')

async function findTenantByEmail(email: string) {
  if (!PLATFORM_TOKEN || !PLATFORM_BASE) return null

  const url =
    `https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent('Tenants')}` +
    `?filterByFormula=${encodeURIComponent(`{Email}='${email.toLowerCase().replace(/'/g, "\\'")}'`)}&maxRecords=1`

  try {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
    })
    if (!resp.ok) return null
    const data = await resp.json()
    return data.records?.[0] || null
  } catch {
    return null
  }
}

async function sendPasswordResetEmail(email: string, resetToken: string): Promise<boolean> {
  if (!RESEND_KEY) {
    console.warn('[forgot-password] RESEND_API_KEY not set')
    return false
  }

  const resetLink = `${BASE_URL}/reset-password?token=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(email)}`

  const html = `
    <div style="font-family:sans-serif;max-width:540px;margin:0 auto;color:#1a1a1a">
      <div style="background:#4F6BFF;padding:20px 28px;border-radius:12px 12px 0 0">
        <p style="color:#fff;font-size:16px;font-weight:700;margin:0">Reset Your Scout Password</p>
      </div>
      <div style="background:#f9f9f9;padding:28px 32px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none">
        <p style="margin:0 0 20px;color:#555;font-size:14px">
          We received a request to reset your password. If you didn't make this request, you can ignore this email.
        </p>

        <a href="${resetLink}"
           style="display:inline-block;background:#4F6BFF;color:#fff;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;margin-bottom:20px">
          Reset Your Password
        </a>

        <p style="font-size:13px;color:#888;margin:0 0 10px;line-height:1.6">
          Or copy this link if the button doesn't work:<br/>
          <code style="background:#f0f0f0;padding:4px 8px;border-radius:4px;word-break:break-all;font-size:12px">${resetLink}</code>
        </p>

        <p style="font-size:13px;color:#999;margin:0">
          This link expires in 1 hour. If you need a new reset link, visit the login page and select "Forgot password?"
        </p>

        <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0 16px" />
        <p style="font-size:12px;color:#aaa;margin:0">
          Scout by ClientBloom — AI-Powered LinkedIn Relationship Intelligence
        </p>
      </div>
    </div>
  `

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Scout Support <support@clientbloom.ai>',
        to: [email],
        subject: 'Reset Your Scout Password',
        html,
      }),
    })
    return res.ok
  } catch (e) {
    console.error('[forgot-password] Failed to send email:', e)
    return false
  }
}

export async function POST(req: NextRequest) {
  const { email } = await req.json()

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email required' }, { status: 400 })
  }

  try {
    // Find tenant by email
    const tenantRecord = await findTenantByEmail(email)

    // Generate reset token (unhashed version to send in email)
    const resetToken = crypto.randomUUID() + Date.now().toString(36)
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex')

    // If tenant exists, store the hashed token
    if (tenantRecord) {
      const expiresAt = new Date(Date.now() + 3600000).toISOString() // 1 hour from now

      await fetch(
        `https://api.airtable.com/v0/${PLATFORM_BASE}/Tenants/${tenantRecord.id}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${PLATFORM_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fields: {
              'Password Reset Token': hashedToken,
              'Password Reset Expires At': expiresAt,
            }
          })
        }
      )
    }

    // Send reset email (always, even if email doesn't exist — privacy)
    await sendPasswordResetEmail(email, resetToken)

    // Always return success to prevent email enumeration
    return NextResponse.json({
      success: true,
      message: 'If an account exists with this email, we\'ve sent a password reset link.'
    })
  } catch (e: any) {
    console.error('[forgot-password] Error:', e)
    return NextResponse.json({
      success: true, // Still return success for privacy
      message: 'If an account exists with this email, we\'ve sent a password reset link.'
    })
  }
}
