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
import { isPaidPlan } from '@/lib/tier'
import { airtableFetch } from '@/lib/airtable'

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
    const resp = await airtableFetch(url.toString(), {
      headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
    })
    if (!resp.ok) return undefined
    const data = await resp.json()
    return data.records?.[0]?.fields?.['Apify API Key'] || undefined
  } catch {
    return undefined
  }
}

async function getTenantRecord(tenantId: string) {
  if (!PLATFORM_TOKEN || !PLATFORM_BASE) return null
  try {
    const filter = tenantId === 'owner'
      ? `OR({Tenant ID}='owner',{Tenant ID}='')`
      : `{Tenant ID}='${tenantId}'`
    const url = new URL(`https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent('Tenants')}`)
    url.searchParams.set('filterByFormula', filter)
    url.searchParams.set('fields[]', 'Last Manual Scan At')
    url.searchParams.set('maxRecords', '1')
    const resp = await airtableFetch(url.toString(), {
      headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
    })
    if (!resp.ok) return null
    const data = await resp.json()
    return data.records?.[0] || null
  } catch {
    return null
  }
}

async function updateTenantLastScan(recordId: string, timestamp: string) {
  if (!PLATFORM_TOKEN || !PLATFORM_BASE) return
  try {
    await airtableFetch(
      `https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent('Tenants')}/${recordId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${PLATFORM_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: { 'Last Manual Scan At': timestamp },
        }),
      }
    )
  } catch (e) {
    console.error('[trigger-scan] Failed to update Last Manual Scan At:', e)
  }
}

export async function POST() {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()

  // Block expired trial users — trial expiry must be enforced server-side.
  // The UI shows a gate overlay but an authenticated user could bypass it directly.
  if (!isPaidPlan(tenant.plan)) {
    // Active trial: trialEndsAt is set and not yet passed — allow scan
    // Expired trial or no trial date: block
    const trialActive = tenant.trialEndsAt && new Date() <= new Date(tenant.trialEndsAt)
    if (!trialActive) {
      return NextResponse.json(
        { error: 'Your trial has ended. Upgrade to keep scanning.' },
        { status: 403 }
      )
    }
  }

  // Check 30-minute cooldown on manual scans
  const tenantRecord = await getTenantRecord(tenant.tenantId)
  if (tenantRecord) {
    const lastScanAt = tenantRecord.fields?.['Last Manual Scan At']
    if (lastScanAt) {
      const lastScanTime = new Date(lastScanAt).getTime()
      const minutesSinceLastScan = (Date.now() - lastScanTime) / 1000 / 60
      if (minutesSinceLastScan < 30) {
        const waitMinutes = Math.ceil(30 - minutesSinceLastScan)
        return NextResponse.json(
          {
            error: `Please wait ${waitMinutes} more minute${waitMinutes === 1 ? '' : 's'} before scanning again.`,
            retryAfter: Math.ceil((30 - minutesSinceLastScan) * 60), // seconds
          },
          { status: 429 }
        )
      }
    }
  }

  // Use tenant's own Apify key if assigned by admin; otherwise fall back to shared pool
  const apifyKey = await getTenantApifyKey(tenant.tenantId)
  const result   = await runScanForTenant(tenant.tenantId, apifyKey)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  // Record the scan time for cooldown enforcement
  if (tenantRecord) {
    await updateTenantLastScan(tenantRecord.id, new Date().toISOString())
  }

  return NextResponse.json(result)
}
