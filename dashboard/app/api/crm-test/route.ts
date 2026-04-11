/**
 * /api/crm-test
 *
 * POST — server-side CRM connection test (proxies browser request to avoid CORS)
 *
 * Body: { crmType: 'GoHighLevel', crmApiKey: string, crmLocationId: string }
 *
 * Returns: { ok: boolean, message: string }
 *
 * Why server-side: GHL and HubSpot APIs do not send CORS headers, so calling
 * them directly from the browser always fails with a CORS error regardless of
 * whether the credentials are valid. Proxying through Next.js server avoids this.
 */

import { NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'

const CRM_ALLOWED_PLANS = new Set(['Scout Agency', 'Owner'])

export async function POST(req: Request) {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()
  if (!CRM_ALLOWED_PLANS.has(tenant.plan)) {
    return NextResponse.json({ ok: false, message: 'CRM requires the Scout Agency plan.' }, { status: 403 })
  }

  let crmType: string, crmApiKey: string, crmLocationId: string
  try {
    const body = await req.json()
    crmType       = String(body.crmType       || '').trim()
    crmApiKey     = String(body.crmApiKey     || '').trim()
    crmLocationId = String(body.crmLocationId || '').trim()
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid request body.' }, { status: 400 })
  }

  if (!crmApiKey) {
    return NextResponse.json({ ok: false, message: 'Paste your Private Integration token first.' })
  }

  if (crmType === 'GoHighLevel') {
    if (!crmLocationId) {
      return NextResponse.json({ ok: false, message: 'Enter your Location ID first.' })
    }
    try {
      // Validate by fetching a lightweight contacts list for this location
      const r = await fetch(
        `https://services.leadconnectorhq.com/contacts/?locationId=${encodeURIComponent(crmLocationId)}&limit=1`,
        {
          headers: {
            'Authorization': `Bearer ${crmApiKey}`,
            'Content-Type':  'application/json',
            'Version':       '2021-07-28',
          },
        }
      )
      if (r.ok) {
        return NextResponse.json({ ok: true, message: 'Connected — GoHighLevel credentials are valid.' })
      }
      if (r.status === 401) {
        return NextResponse.json({ ok: false, message: 'Invalid token — 401 Unauthorized. Make sure you copied the Private Integration token (not the legacy API Key) and that it has contacts.readonly scope.' })
      }
      if (r.status === 403) {
        return NextResponse.json({ ok: false, message: 'Token valid but missing permissions. Ensure contacts.readonly and contacts.write scopes are enabled on the Private Integration.' })
      }
      const text = await r.text().catch(() => r.status.toString())
      return NextResponse.json({ ok: false, message: `GHL returned ${r.status}. ${text.slice(0, 120)}` })
    } catch (e: any) {
      return NextResponse.json({ ok: false, message: `Network error reaching GHL: ${e.message}` }, { status: 502 })
    }
  }

  // HubSpot coming soon — this branch shouldn't be reachable via UI but guard anyway
  return NextResponse.json({ ok: false, message: 'HubSpot integration coming soon.' })
}
