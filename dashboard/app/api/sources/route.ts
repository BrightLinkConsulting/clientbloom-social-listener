import { NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import { airtableList, airtableCreate, SHARED_BASE, PROV_TOKEN, tenantFilter } from '@/lib/airtable'

const TABLE = 'Sources'

export async function GET() {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()
  const { tenantId } = tenant

  // Combine tenant filter with sort params via manual URL build
  const formula = tenantFilter(tenantId)
  const url = new URL(`https://api.airtable.com/v0/${SHARED_BASE}/${encodeURIComponent(TABLE)}`)
  url.searchParams.set('filterByFormula', formula)
  url.searchParams.set('sort[0][field]', 'Type')
  url.searchParams.set('sort[0][direction]', 'asc')
  url.searchParams.set('sort[1][field]', 'Priority')
  url.searchParams.set('sort[1][direction]', 'asc')

  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${PROV_TOKEN}` },
    cache: 'no-store',
  })

  if (!resp.ok) return NextResponse.json({ error: await resp.text() }, { status: resp.status })

  const data = await resp.json()
  const sources = data.records.map((r: any) => ({
    id:       r.id,
    name:     r.fields.Name     || '',
    type:     r.fields.Type     || '',
    value:    r.fields.Value    || '',
    active:   r.fields.Active   === true,
    priority: r.fields.Priority || 'medium',
  }))

  return NextResponse.json({ sources })
}

export async function POST(request: Request) {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()
  const { tenantId } = tenant

  const body = await request.json()
  const { name, type, value, priority } = body

  if (!name || !type || !value) {
    return NextResponse.json({ error: 'name, type, and value are required' }, { status: 400 })
  }
  if (type !== 'linkedin_term') {
    return NextResponse.json({ error: 'type must be linkedin_term' }, { status: 400 })
  }

  const resp = await airtableCreate(TABLE, tenantId, {
    Name: name, Type: type, Value: value, Active: true, Priority: priority || 'medium',
  })

  if (!resp.ok) return NextResponse.json({ error: await resp.text() }, { status: resp.status })

  const data = await resp.json()
  const r = data.records[0]
  return NextResponse.json({
    source: {
      id:       r.id,
      name:     r.fields.Name,
      type:     r.fields.Type,
      value:    r.fields.Value,
      active:   r.fields.Active === true,
      priority: r.fields.Priority || 'medium',
    }
  }, { status: 201 })
}
