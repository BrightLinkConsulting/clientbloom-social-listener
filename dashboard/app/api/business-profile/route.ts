import { NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import { airtableList, airtableCreate, airtableUpdate } from '@/lib/airtable'

const TABLE = 'Business Profile'

export async function GET() {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()
  try {
    const res  = await airtableList(TABLE, tenant.tenantId, { maxRecords: '1' })
    const data = await res.json()
    const record = data.records?.[0]
    if (!record) return NextResponse.json({ profile: null })
    return NextResponse.json({ profile: record.fields, id: record.id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()
  try {
    const body = await req.json()
    const fields: Record<string, string> = {
      'Business Name':  body.businessName  || '',
      'Industry':       body.industry      || '',
      'Ideal Client':   body.idealClient   || '',
      'Problem Solved': body.problemSolved || '',
      'Signal Types': Array.isArray(body.signalTypes)
        ? body.signalTypes.join(', ')
        : body.signalTypes || '',
      'Updated At': new Date().toISOString(),
    }
    if (typeof body.scoringPrompt === 'string') fields['Scoring Prompt'] = body.scoringPrompt

    const existing = await (await airtableList(TABLE, tenant.tenantId, { maxRecords: '1' })).json()
    const rec = existing.records?.[0]
    if (rec) {
      const updated = await (await airtableUpdate(TABLE, rec.id, fields)).json()
      return NextResponse.json({ success: true, id: updated.id })
    } else {
      const created = await (await airtableCreate(TABLE, tenant.tenantId, fields)).json()
      return NextResponse.json({ success: true, id: created.id })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
