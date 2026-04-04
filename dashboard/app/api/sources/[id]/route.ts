import { NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import { airtableUpdate, airtableDelete } from '@/lib/airtable'

const TABLE = 'Sources'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()

  const body = await request.json()
  const fields: Record<string, any> = {}

  if (body.name     !== undefined) fields.Name     = body.name
  if (body.active   !== undefined) fields.Active   = body.active
  if (body.priority !== undefined) fields.Priority = body.priority
  if (body.value    !== undefined) fields.Value    = body.value

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const resp = await airtableUpdate(TABLE, params.id, fields)
  if (!resp.ok) return NextResponse.json({ error: await resp.text() }, { status: resp.status })

  const r = await resp.json()
  return NextResponse.json({
    source: {
      id:       r.id,
      name:     r.fields.Name,
      type:     r.fields.Type,
      value:    r.fields.Value,
      active:   r.fields.Active === true,
      priority: r.fields.Priority || 'medium',
    }
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()

  const resp = await airtableDelete(TABLE, params.id)
  if (!resp.ok) return NextResponse.json({ error: await resp.text() }, { status: resp.status })

  return NextResponse.json({ deleted: true })
}
