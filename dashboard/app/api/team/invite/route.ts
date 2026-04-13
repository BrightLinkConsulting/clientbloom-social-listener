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
import { escapeAirtableString }       from '@/lib/tier'
import { buildTeamInviteEmail }       from '@/lib/emails'
import bcrypt                         from 'bcryptjs'

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const RESEND_KEY     = process.env.RESEND_API_KEY             || ''
const BASE_URL       = (process.env.NEXT_PUBLIC_BASE_URL || 'https://scout.clientbloom.ai').replace(/\/$/, '')
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
      `AND({Tenant ID}='${escapeAirtableString(caller.tenantId)}',{Email}='${escapeAirtableString(cleanEmail)}')`
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
    const { subject: emailSubject, html } = buildTeamInviteEmail({
      inviteeEmail: cleanEmail,
      tempPassword,
      loginUrl:     BASE_URL,
    })

    const emailResp = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [cleanEmail], subject: emailSubject, html }),
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
