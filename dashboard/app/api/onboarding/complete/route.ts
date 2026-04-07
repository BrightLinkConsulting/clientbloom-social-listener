/**
 * POST /api/onboarding/complete
 *
 * Mark a tenant as onboarded by setting the Onboarded field in Airtable.
 * Called at the end of the onboarding flow (after first scan or manual skip).
 */

import { NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''

async function getTenantRecord(tenantId: string) {
  if (!PLATFORM_TOKEN || !PLATFORM_BASE) return null
  try {
    const filter = tenantId === 'owner'
      ? `OR({Tenant ID}='owner',{Tenant ID}='')`
      : `{Tenant ID}='${tenantId}'`
    const url = new URL(`https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent('Tenants')}`)
    url.searchParams.set('filterByFormula', filter)
    url.searchParams.set('maxRecords', '1')
    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
    })
    if (!resp.ok) return null
    const data = await resp.json()
    return data.records?.[0] || null
  } catch {
    return null
  }
}

async function updateTenantRecord(recordId: string) {
  if (!PLATFORM_TOKEN || !PLATFORM_BASE) return
  await fetch(
    `https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent('Tenants')}/${recordId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${PLATFORM_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: { 'Onboarded': true },
      }),
    }
  )
}

export async function POST() {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()

  try {
    const tenantRecord = await getTenantRecord(tenant.tenantId)
    if (tenantRecord) {
      await updateTenantRecord(tenantRecord.id)
      console.log(`[onboarding] Marked tenant ${tenant.tenantId} as onboarded`)
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[onboarding] Failed to mark onboarding complete:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
