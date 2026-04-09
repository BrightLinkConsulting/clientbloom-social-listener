/**
 * GET /api/session/refresh
 *
 * Re-reads the authenticated tenant's current Plan and Trial Ends At from
 * Airtable and returns them so the client can call session.update({ plan, trialEndsAt })
 * to immediately reflect post-payment plan changes without requiring sign-out.
 *
 * Called by the /welcome page when ?upgraded=1 is present (post-Stripe checkout).
 *
 * Returns: { plan: string, trialEndsAt: string | null }
 */

import { NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import { escapeAirtableString } from '@/lib/tier'

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''

export async function GET() {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()

  if (!PLATFORM_TOKEN || !PLATFORM_BASE) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 })
  }

  try {
    const url =
      `https://api.airtable.com/v0/${PLATFORM_BASE}/Tenants` +
      `?filterByFormula=${encodeURIComponent(`{Email}='${escapeAirtableString(tenant.email.toLowerCase())}'`)}&maxRecords=1` +
      `&fields[]=Plan&fields[]=Trial Ends At`

    const res = await fetch(url, { headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` } })
    if (!res.ok) return NextResponse.json({ error: 'Airtable lookup failed' }, { status: 500 })

    const data   = await res.json()
    const fields = data.records?.[0]?.fields || {}

    return NextResponse.json({
      plan:        fields['Plan']          || '',
      trialEndsAt: fields['Trial Ends At'] || null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
