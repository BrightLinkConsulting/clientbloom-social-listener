import { NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import { airtableList, airtableCreate, airtableUpdate, airtableDelete, SHARED_BASE, PROV_TOKEN, airtableHeaders } from '@/lib/airtable'

const TABLE = 'Facebook Keywords'

export async function GET() {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()
  try {
    const all: any[] = []
    let offset: string | undefined
    do {
      const extra: Record<string,string> = { pageSize: '100' }
      if (offset) extra.offset = offset
      const resp = await airtableList(TABLE, tenant.tenantId, extra)
      if (!resp.ok) return NextResponse.json({ error: await resp.text() }, { status: resp.status })
      const data = await resp.json()
      all.push(...(data.records || []))
      offset = data.offset
    } while (offset)

    return NextResponse.json({ keywords: all.map((r: any) => ({
      id:       r.id,
      keyword:  r.fields['Keyword']  || '',
      category: r.fields['Category'] || '',
      active:   r.fields['Active']   ?? true,
    })) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()
  try {
    const { keyword, category = '' } = await req.json()
    if (!keyword?.trim()) return NextResponse.json({ error: 'keyword is required' }, { status: 400 })
    const resp = await airtableCreate(TABLE, tenant.tenantId, { Keyword: keyword.trim(), Category: category, Active: true })
    if (!resp.ok) return NextResponse.json({ error: await resp.text() }, { status: resp.status })
    const data = await resp.json()
    const r = data.records[0]
    return NextResponse.json({ keyword: { id: r.id, keyword: r.fields['Keyword'], category: r.fields['Category'] || '', active: true } })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()
  try {
    const { id, active } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const resp = await airtableUpdate(TABLE, id, { Active: active })
    if (!resp.ok) return NextResponse.json({ error: await resp.text() }, { status: resp.status })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const resp = await airtableDelete(TABLE, id)
    if (!resp.ok) return NextResponse.json({ error: await resp.text() }, { status: resp.status })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
