/**
 * GET /api/team/members
 *
 * Returns all feed-only team members associated with the calling tenant.
 * Only the admin (Is Feed Only = false) may call this endpoint.
 */

import { NextResponse }        from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''

export async function GET() {
  const caller = await getTenantConfig()
  if (!caller) return tenantError()

  // Feed-only users cannot manage team
  if ((caller as any).isFeedOnly) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  if (!PLATFORM_TOKEN || !PLATFORM_BASE) {
    return NextResponse.json({ error: 'Platform Airtable not configured.' }, { status: 500 })
  }

  try {
    const formula  = encodeURIComponent(
      `AND({Tenant ID}='${caller.tenantId}',{Is Feed Only}=1)`
    )
    const url = `https://api.airtable.com/v0/${PLATFORM_BASE}/Tenants?filterByFormula=${formula}&fields[]=Email&fields[]=Company Name&fields[]=Status&fields[]=Created At`

    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
    })
    if (!resp.ok) {
      const body = await resp.text()
      return NextResponse.json({ error: `Airtable error: ${body.slice(0, 200)}` }, { status: 500 })
    }

    const data    = await resp.json()
    const members = (data.records || []).map((r: any) => ({
      id:        r.id,
      email:     r.fields['Email']        || '',
      name:      r.fields['Company Name'] || '',
      status:    r.fields['Status']       || 'Active',
      createdAt: r.fields['Created At']   || '',
    }))

    return NextResponse.json({ members })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
