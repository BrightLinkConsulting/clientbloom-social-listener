/**
 * /api/crm-settings — GET/POST CRM config (stored in Business Profile table)
 *
 * Fields managed:
 *   CRM Type        — 'GoHighLevel' | 'None'
 *   CRM API Key     — Private Integration token (GHL)
 *   CRM Location ID — GHL sub-account location ID (visible in GHL URL bar)
 *   CRM Pipeline ID — optional; GHL pipeline to auto-create Opportunities in
 */
import { NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import { airtableList, airtableCreate, airtableUpdate } from '@/lib/airtable'

const TABLE = 'Business Profile'

const CRM_ALLOWED_PLANS = new Set(['Scout Agency', 'Owner'])

export async function GET() {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()
  // Non-Agency plans get empty config — prevents leaking previously-saved key data
  if (!CRM_ALLOWED_PLANS.has(tenant.plan)) {
    return NextResponse.json({ crmType: 'None', crmApiKey: '', crmLocationId: '', crmPipelineId: '' })
  }
  try {
    const res = await airtableList(TABLE, tenant.tenantId, { pageSize: '1' })
    const data = await res.json()
    const record = data.records?.[0]
    if (!record) {
      return NextResponse.json({ crmType: 'None', crmApiKey: '', crmLocationId: '', crmPipelineId: '' })
    }
    return NextResponse.json({
      crmType:       record.fields['CRM Type']        || 'None',
      crmApiKey:     record.fields['CRM API Key']     || '',
      crmLocationId: record.fields['CRM Location ID'] || '',
      crmPipelineId: record.fields['CRM Pipeline ID'] || '',
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()
  if (!CRM_ALLOWED_PLANS.has(tenant.plan)) {
    return NextResponse.json(
      { error: 'CRM settings require the Scout Agency plan.' },
      { status: 403 }
    )
  }
  try {
    const { crmType, crmApiKey, crmLocationId, crmPipelineId } = await req.json()
    const fields: Record<string, any> = {}
    if (crmType       !== undefined) fields['CRM Type']        = crmType
    if (crmApiKey     !== undefined) fields['CRM API Key']     = crmApiKey
    if (crmLocationId !== undefined) fields['CRM Location ID'] = crmLocationId
    if (crmPipelineId !== undefined) fields['CRM Pipeline ID'] = crmPipelineId

    const existing = await (await airtableList(TABLE, tenant.tenantId, { pageSize: '1' })).json()
    const rec = existing.records?.[0]
    const saved = rec
      ? await airtableUpdate(TABLE, rec.id, fields)
      : await airtableCreate(TABLE, tenant.tenantId, fields)
    if (!saved.ok) return NextResponse.json({ error: await saved.text() }, { status: saved.status })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
