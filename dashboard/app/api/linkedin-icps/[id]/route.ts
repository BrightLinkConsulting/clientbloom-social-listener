import { NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import { airtableUpdate, airtableDelete } from '@/lib/airtable'

const TABLE = 'LinkedIn ICPs'

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()

  try {
    const body   = await req.json()
    const fields: any = {}

    if (body.active   !== undefined) fields['Active']    = body.active
    if (body.name     !== undefined) fields['Name']      = body.name
    if (body.jobTitle !== undefined) fields['Job Title'] = body.jobTitle
    if (body.company  !== undefined) fields['Company']   = body.company
    if (body.industry !== undefined) fields['Industry']  = body.industry
    if (body.notes    !== undefined) fields['Notes']     = body.notes

    const resp = await airtableUpdate(TABLE, params.id, fields)
    if (!resp.ok) return NextResponse.json({ error: await resp.text() }, { status: resp.status })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()

  try {
    const resp = await airtableDelete(TABLE, params.id)
    if (!resp.ok) return NextResponse.json({ error: await resp.text() }, { status: resp.status })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
