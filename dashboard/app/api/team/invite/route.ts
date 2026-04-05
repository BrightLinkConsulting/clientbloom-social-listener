/**
 * POST /api/team/invite
 *
 * Admin-only. Creates a feed-only team member account under the same Tenant ID,
 * then sends an invitation email via Resend with their temporary password.
 *
 * Body: { email: string }
 *
 * The created account has:
 *   - Is Feed Only = true  (redirected away from settings on login)
 *   - Same Tenant ID as the admin (sees same feed data)
 *   - Temp password emailed on creation
 */

import { NextResponse }              from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import bcrypt                         from 'bcryptjs'

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const RESEND_KEY     = process.env.RESEND_API_KEY             || ''
const BASE_URL       = (process.env.NEXT_PUBLIC_BASE_URL || 'https://cb-dashboard-xi.vercel.app').replace(/\/$/, '')
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

  if ((caller as any).isFeedOnly) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  if (!PLATFORM_TOKEN || !PLATFORM_BASE) {
    return NextResponse.json({ error: 'Platform Airtable not configured.' }, { status: 500 })
  }
  if (!RESEND_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured.' }, { status: 500 })
  }

  try {
    const { email } = await req.json()
    if (!email) return NextResponse.json({ error: 'email is required.' }, { status: 400 })

    const cleanEmail   = email.toLowerCase().trim()
    const tempPassword = generateTempPassword()
    const passwordHash = await bcrypt.hash(tempPassword, 12)

    // Check they're not already a member of this tenant
    const checkFormula = encodeURIComponent(
      `AND({Tenant ID}='${caller.tenantId}',{Email}='${cleanEmail}')`
    )
    const checkResp = await fetch(
      `https://api.airtable.com/v0/${PLATFORM_BASE}/Tenants?filterByFormula=${checkFormula}&maxRecords=1`,
      { headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` } }
    )
    if (checkResp.ok) {
      const checkData = await checkResp.json()
      if (checkData.records?.length > 0) {
        return NextResponse.json({ error: 'This email is already a member of your team.' }, { status: 409 })
      }
    }

    // Create feed-only tenant record with same Tenant ID
    const createResp = await fetch(
      `https://api.airtable.com/v0/${PLATFORM_BASE}/Tenants`,
      {
        method:  'POST',
        headers: { Authorization: `Bearer ${PLATFORM_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: [{
            fields: {
              'Email':         cleanEmail,
              'Password Hash': passwordHash,
              'Company Name':  cleanEmail,   // will show their email as display name
              'Tenant ID':     caller.tenantId,
              'Is Feed Only':  true,
              'Status':        'Active',
              'Plan':          'Member',
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

    const created  = await createResp.json()
    const recordId = created.records?.[0]?.id

    // Send invitation email
    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
        <div style="background:#4F6BFF;padding:20px 28px;border-radius:12px 12px 0 0">
          <p style="color:#fff;font-size:16px;font-weight:700;margin:0">You've been invited to Scout</p>
        </div>
        <div style="background:#f9f9f9;padding:28px 32px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none">
          <h2 style="margin:0 0 8px;font-size:18px">Your team access is ready</h2>
          <p style="color:#555;margin:0 0 24px;font-size:14px;line-height:1.6">
            A teammate has given you access to their Scout feed. You can view and act on
            incoming ICP posts, use AI-generated comment starters, and mark leads as
            Engaged or Skipped — all without touching any account settings.
          </p>

          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px">
            <tr style="border-bottom:1px solid #eee">
              <td style="padding:10px 0;color:#888;width:110px">Login URL</td>
              <td style="padding:10px 0">
                <a href="${BASE_URL}/sign-in" style="color:#4F6BFF;text-decoration:none">${BASE_URL}/sign-in</a>
              </td>
            </tr>
            <tr style="border-bottom:1px solid #eee">
              <td style="padding:10px 0;color:#888">Your email</td>
              <td style="padding:10px 0;font-weight:500">${cleanEmail}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;color:#888">Temp password</td>
              <td style="padding:10px 0;font-family:monospace;font-size:16px;font-weight:700;letter-spacing:0.05em">${tempPassword}</td>
            </tr>
          </table>

          <div style="background:#f0f4ff;border:1px solid #c7d4ff;border-radius:8px;padding:14px 18px;margin:0 0 24px">
            <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#1e40af">What you can do</p>
            <ul style="margin:0;padding-left:16px;font-size:13px;color:#374151;line-height:1.8">
              <li>View and filter all incoming ICP posts in the feed</li>
              <li>Copy AI-generated comment starters and reply on LinkedIn or Facebook</li>
              <li>Mark posts as Engaged, Replied, or Skipped</li>
              <li>Refresh the feed to pull the latest scans</li>
            </ul>
          </div>

          <a href="${BASE_URL}/sign-in"
             style="display:inline-block;background:#4F6BFF;color:#fff;font-weight:600;padding:11px 24px;border-radius:8px;text-decoration:none;font-size:14px">
            Open Scout Feed →
          </a>

          <p style="font-size:12px;color:#aaa;margin:20px 0 0;line-height:1.6">
            Your access is limited to the feed — account settings and billing are managed
            by the account owner. If you didn't expect this invite, you can ignore this email.
          </p>
        </div>
      </div>
    `

    const emailResp = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    FROM,
        to:      [cleanEmail],
        subject: 'You have been invited to Scout by ClientBloom',
        html,
      }),
    })

    if (!emailResp.ok) {
      const body = await emailResp.text()
      return NextResponse.json({
        ok:           true,
        recordId,
        emailWarning: `Account created but invite email failed: ${body.slice(0, 200)}`,
      })
    }

    return NextResponse.json({ ok: true, recordId })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
