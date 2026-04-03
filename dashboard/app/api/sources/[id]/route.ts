import { NextResponse } from 'next/server'

const AIRTABLE_TOKEN = process.env.AIRTABLE_API_TOKEN
const BASE_ID = process.env.AIRTABLE_BASE_ID
const TABLE = 'Sources'

// PATCH /api/sources/[id] — update name, active, priority
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!AIRTABLE_TOKEN || !BASE_ID) {
    return NextResponse.json({ error: 'Missing Airtable credentials' }, { status: 500 })
  }

  const body = await request.json()
  const fields: Record<string, any> = {}

  if (body.name !== undefined) fields.Name = body.name
  if (body.active !== undefined) fields.Active = body.active
  if (body.priority !== undefined) fields.Priority = body.priority
  if (body.value !== undefined) fields.Value = body.value

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}/${params.id}`

  const resp = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  })

  if (!resp.ok) {
    const err = await resp.text()
    return NextResponse.json({ error: err }, { status: resp.status })
  }

  const r = await resp.json()
  return NextResponse.json({
    source: {
      id: r.id,
      name: r.fields.Name,
      type: r.fields.Type,
      value: r.fields.Value,
      active: r.fields.Active === true,
      priority: r.fields.Priority || 'medium',
    }
  })
}

// DELETE /api/sources/[id] — remove a source
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  if (!AIRTABLE_TOKEN || !BASE_ID) {
    return NextResponse.json({ error: 'Missing Airtable credentials' }, { status: 500 })
  }

  const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}/${params.id}`

  const resp = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
  })

  if (!resp.ok) {
    const err = await resp.text()
    return NextResponse.json({ error: err }, { status: resp.status })
  }

  return NextResponse.json({ deleted: true })
}
