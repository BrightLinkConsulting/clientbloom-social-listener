import { NextResponse } from 'next/server'

const AIRTABLE_TOKEN = process.env.AIRTABLE_API_TOKEN
const BASE_ID = process.env.AIRTABLE_BASE_ID
const TABLE = 'Sources'

// GET /api/sources — list all sources
export async function GET() {
  if (!AIRTABLE_TOKEN || !BASE_ID) {
    return NextResponse.json({ error: 'Missing Airtable credentials' }, { status: 500 })
  }

  const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}?sort[0][field]=Type&sort[0][direction]=asc&sort[1][field]=Priority&sort[1][direction]=asc`

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    cache: 'no-store',
  })

  if (!resp.ok) {
    const err = await resp.text()
    return NextResponse.json({ error: err }, { status: resp.status })
  }

  const data = await resp.json()
  const sources = data.records.map((r: any) => ({
    id: r.id,
    name: r.fields.Name || '',
    type: r.fields.Type || '',
    value: r.fields.Value || '',
    active: r.fields.Active === true,
    priority: r.fields.Priority || 'medium',
  }))

  return NextResponse.json({ sources })
}

// POST /api/sources — create a new source
export async function POST(request: Request) {
  if (!AIRTABLE_TOKEN || !BASE_ID) {
    return NextResponse.json({ error: 'Missing Airtable credentials' }, { status: 500 })
  }

  const body = await request.json()
  const { name, type, value, priority } = body

  if (!name || !type || !value) {
    return NextResponse.json({ error: 'name, type, and value are required' }, { status: 400 })
  }

  if (!['facebook_group', 'linkedin_term'].includes(type)) {
    return NextResponse.json({ error: 'type must be facebook_group or linkedin_term' }, { status: 400 })
  }

  const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}`

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      records: [{
        fields: {
          Name: name,
          Type: type,
          Value: value,
          Active: true,
          Priority: priority || 'medium',
        }
      }]
    }),
  })

  if (!resp.ok) {
    const err = await resp.text()
    return NextResponse.json({ error: err }, { status: resp.status })
  }

  const data = await resp.json()
  const r = data.records[0]
  return NextResponse.json({
    source: {
      id: r.id,
      name: r.fields.Name,
      type: r.fields.Type,
      value: r.fields.Value,
      active: r.fields.Active === true,
      priority: r.fields.Priority || 'medium',
    }
  }, { status: 201 })
}
