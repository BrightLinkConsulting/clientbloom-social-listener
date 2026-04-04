/**
 * POST /api/admin/grant-access
 *
 * Admin-only. Creates a Complimentary plan tenant and sends a welcome
 * email with login credentials via Resend. No Airtable credentials required
 * at creation time — the user can connect their own base in Settings.
 */

import { NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import bcrypt from 'bcryptjs'

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const RESEND_KEY     = process.env.RESEND_API_KEY             || ''
const BASE_URL_SITE  = (process.env.NEXT_PUBLIC_BASE_URL || 'https://cb-dashboard-xi.vercel.app').replace(/\/$/, '')
const FROM           = 'Scout <noreply@clientbloom.ai>'

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

    const tempPassword = generateTempPassword()
    const passwordHash = await bcrypt.hash(tempPassword, 12)

    // Create tenant record in Platform Airtable
    const createResp = await fetch(
      `https://api.airtable.com/v0/${PLATFORM_BASE}/Tenants`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${PLATFORM_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          records: [{
            fields: {
              'Email':         email.toLowerCase().trim(),
              'Password Hash': passwordHash,
              'Company Name':  companyName?.trim() || email,
              'Plan':          'Complimentary',
              'Status':        'Active',
              'Created At':    new Date().toISOString().split('T')[0],
            },
          }],
        }),
      }
    )

    if (!createResp.ok) {
      const body = await createResp.text()
      return NextResponse.json({ error: `Airtable error: ${body.slice(0, 200)}` }, { status: 500 })
    }

    const created = await createResp.json()
    const tenantId = created.records?.[0]?.id

    // Send welcome email via Resend
    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
        <div style="background:#4F6BFF;padding:20px 28px;border-radius:12px 12px 0 0">
          <p style="color:#fff;font-size:16px;font-weight:700;margin:0">Welcome to Scout</p>
        </div>
        <div style="background:#f9f9f9;padding:28px 32px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none">
          <h2 style="margin:0 0 8px;font-size:20px">Your Scout account is ready 🎉</h2>
          <p style="color:#555;margin:0 0 24px;font-size:14px;line-height:1.6">
            ${companyName ? `Hey ${companyName},` : 'Hey,'} your complimentary Scout access has been set up.
            Use the credentials below to sign in and start exploring.
          </p>
          ${note ? `<p style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;font-size:13px;color:#92400e;margin:0 0 24px">${note}</p>` : ''}
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px">
            <tr style="border-bottom:1px solid #eee">
              <td style="padding:10px 0;color:#888;width:110px">Login URL</td>
              <td style="padding:10px 0">
                <a href="${BASE_URL_SITE}/sign-in" style="color:#4F6BFF;text-decoration:none">${BASE_URL_SITE}/sign-in</a>
              </td>
            </tr>
            <tr style="border-bottom:1px solid #eee">
              <td style="padding:10px 0;color:#888">Email</td>
              <td style="padding:10px 0;font-weight:500">${email.toLowerCase().trim()}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;color:#888">Password</td>
              <td style="padding:10px 0;font-family:monospace;font-size:16px;font-weight:700;letter-spacing:0.05em">${tempPassword}</td>
            </tr>
          </table>
          <p style="font-size:13px;color:#555;margin:0 0 20px;line-height:1.6">
            After signing in, head to <strong>Settings</strong> to connect your Airtable base and
            configure your keyword sources. Your scan will start automatically.
          </p>
          <a href="${BASE_URL_SITE}/sign-in"
             style="display:inline-block;background:#4F6BFF;color:#fff;font-weight:600;padding:11px 24px;border-radius:8px;text-decoration:none;font-size:14px">
            Sign in to Scout →
          </a>
          <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0 16px" />
          <p style="font-size:12px;color:#aaa;margin:0">
            Scout monitors LinkedIn and Facebook for high-intent conversations that match
            your ideal customer profile — so you can engage at exactly the right moment.
          </p>
        </div>
      </div>
    `

    const emailResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    FROM,
        to:      [email.toLowerCase().trim()],
        subject: 'Your Scout account is ready',
        html,
      }),
    })

    if (!emailResp.ok) {
      // Tenant was created — warn but don't fail
      const body = await emailResp.text()
      return NextResponse.json({
        ok: true,
        tenantId,
        emailWarning: `Account created but welcome email failed: ${body.slice(0, 200)}`,
      })
    }

    return NextResponse.json({ ok: true, tenantId })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
