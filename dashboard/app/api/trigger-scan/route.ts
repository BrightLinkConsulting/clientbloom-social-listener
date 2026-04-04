/**
 * POST /api/trigger-scan
 *
 * Manual scan triggered by the authenticated user.
 * Reads the tenant from the session, looks up their Apify key override (if any),
 * then delegates to lib/scan.ts.
 */

import { NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import { runScanForTenant } from '@/lib/scan'

// 90s: LinkedIn+Facebook run in parallel (~30s) + scoring + Airtable saves
export const maxDuration = 90

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''

// Look up a tenant's custom Apify key from the Tenants table (if set by admin).
async function getTenantApifyKey(tenantId: string): Promise<string | undefined> {
  if (!PLATFORM_TOKEN || !PLATFORM_BASE) return undefined
  try {
    const filter = tenantId === 'owner'
      ? `OR({Tenant ID}='owner',{Tenant ID}='')`
      : `{Tenant ID}='${tenantId}'`
    const url = new URL(`https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent('Tenants')}`)
    url.searchParams.set('filterByFormula', filter)
    url.searchParams.set('fields[]', 'Apify API Key')
    url.searchParams.set('maxRecords', '1')
    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
    })
    if (!resp.ok) return undefined
    const data = await resp.json()
    return data.records?.[0]?.fields?.['Apify API Key'] || undefined
  } catch {
    return undefined
  }
}

export async function POST() {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()

  // Use tenant's own Apify key if assigned by admin; otherwise fall back to shared pool
  const apifyKey = await getTenantApifyKey(tenant.tenantId)
  const result   = await runScanForTenant(tenant.tenantId, apifyKey)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json(result)
}
