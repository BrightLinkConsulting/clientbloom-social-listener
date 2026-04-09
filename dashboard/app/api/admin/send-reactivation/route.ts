/**
 * POST /api/admin/send-reactivation
 *
 * Admin-only. Sends a curated reactivation email to a lapsed trial user
 * (typically ≥30 days post-expiry) and records the send timestamp in Airtable.
 *
 * Body: { id: string, email: string, companyName: string }
 * Returns: { ok: true, sentAt: ISO string }
 */

import { NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import { buildTrialReactivationEmail } from '@/lib/emails'

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const RESEND_KEY     = process.env.RESEND_API_KEY             || ''
const BASE_URL_SITE  = (process.env.NEXT_PUBLIC_BASE_URL || 'https://scout.clientbloom.ai').replace(/\/$/, '')
const FROM           = 'Mike at Scout <info@clientbloom.ai>'

// Only allow POST
export async function GET()    { return NextResponse.json({ error: 'Method not allowed' }, { status: 405 }) }
export async function PUT()    { return NextResponse.json({ error: 'Method not allowed' }, { status: 405 }) }
export async function DELETE() { return NextResponse.json({ error: 'Method not allowed' }, { status: 405 }) }
export async function PATCH()  { return NextResponse.json({ error: 'Method not allowed' }, { status: 405 }) }

export async function POST(req: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const caller = await getTenantConfig()
  if (!caller) return tenantError()
  if (!caller.isAdmin) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }

  // ── Config ─────────────────────────────────────────────────────────────────
  if (!RESEND_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured.' }, { status: 500 })
  }
  if (!PLATFORM_TOKEN || !PLATFORM_BASE) {
    return NextResponse.json({ error: 'Platform Airtable not configured.' }, { status: 500 })
  }

  try {
    const { id, email, companyName } = await req.json()

    if (!id || !email) {
      return NextResponse.json({ error: 'id and email are required.' }, { status: 400 })
    }

    // ── Build email ───────────────────────────────────────────────────────────
    const upgradeUrl = `${BASE_URL_SITE}/upgrade`
    const unsubUrl   = `${BASE_URL_SITE}/api/unsubscribe?email=${encodeURIComponent(email)}`

    const { subject, html } = buildTrialReactivationEmail({
      companyName: companyName || email,
      email,
      upgradeUrl,
      unsubUrl,
    })

    // ── Send via Resend ───────────────────────────────────────────────────────
    const emailResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [email], subject, html }),
    })

    if (!emailResp.ok) {
      const body = await emailResp.text()
      return NextResponse.json({ error: `Email send failed: ${body.slice(0, 300)}` }, { status: 500 })
    }

    // ── Record send timestamp in Airtable ─────────────────────────────────────
    const sentAt = new Date().toISOString()

    const patchResp = await fetch(
      `https://api.airtable.com/v0/${PLATFORM_BASE}/Tenants/${id}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${PLATFORM_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields: { 'Reactivation Sent At': sentAt } }),
      }
    )

    if (!patchResp.ok) {
      // Email already sent — log the Airtable failure but don't error the whole response
      console.error('[send-reactivation] Airtable patch failed:', await patchResp.text())
    }

    return NextResponse.json({ ok: true, sentAt })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
