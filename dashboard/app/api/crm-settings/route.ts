/**
 * /api/crm-settings
 * GET  — fetch CRM configuration from Business Profile table
 * POST — save CRM configuration
 */

import { NextResponse } from 'next/server'

const AIRTABLE_TOKEN = process.env.AIRTABLE_API_TOKEN!
const BASE_ID        = process.env.AIRTABLE_BASE_ID!
const TABLE          = 'Business Profile'
const BASE_URL       = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}`
const HEADERS        = () => ({
  'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
  'Content-Type':  'application/json',
})

export async function GET() {
  try {
    const resp = await fetch(`${BASE_URL}?pageSize=1`, { headers: HEADERS() })
    if (!resp.ok) return NextResponse.json({ error: await resp.text() }, { status: resp.status })

    const data    = await resp.json()
    const record  = data.records?.[0]
    if (!record) return NextResponse.json({ crmType: 'None', crmApiKey: '', crmPipelineId: '' })

    return NextResponse.json({
      crmType:       record.fields['CRM Type']        || 'None',
      crmApiKey:     record.fields['CRM API Key']     || '',
      crmPipelineId: record.fields['CRM Pipeline ID'] || '',
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { crmType, crmApiKey, crmPipelineId } = await req.json()

    // Fetch existing record to upsert
    const listResp = await fetch(`${BASE_URL}?pageSize=1`, { headers: HEADERS() })
    if (!listResp.ok) return NextResponse.json({ error: await listResp.text() }, { status: listResp.status })
    const listData = await listResp.json()
    const existing = listData.records?.[0]

    const fields: Record<string, any> = {}
    if (crmType       !== undefined) fields['CRM Type']        = crmType
    if (crmApiKey     !== undefined) fields['CRM API Key']     = crmApiKey
    if (crmPipelineId !== undefined) fields['CRM Pipeline ID'] = crmPipelineId

    let saveResp: Response
    if (existing) {
      saveResp = await fetch(`${BASE_URL}/${existing.id}`, {
        method: 'PATCH',
        headers: HEADERS(),
        body: JSON.stringify({ fields }),
      })
    } else {
      saveResp = await fetch(BASE_URL, {
        method: 'POST',
        headers: HEADERS(),
        body: JSON.stringify({ records: [{ fields }] }),
      })
    }

    if (!saveResp.ok) return NextResponse.json({ error: await saveResp.text() }, { status: saveResp.status })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
