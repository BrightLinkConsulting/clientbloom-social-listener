import { NextResponse } from 'next/server'

const AIRTABLE_TOKEN = process.env.AIRTABLE_API_TOKEN!
const BASE_ID        = process.env.AIRTABLE_BASE_ID!
const TABLE          = 'LinkedIn ICPs'
const BASE_URL       = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}`

const headers = () => ({
  'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
  'Content-Type': 'application/json',
})

// PATCH /api/linkedin-icps/[id] — update a profile (toggle active, edit fields)
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json()
    const fields: any = {}

    if (body.active    !== undefined) fields['Active']    = body.active
    if (body.name      !== undefined) fields['Name']      = body.name
    if (body.jobTitle  !== undefined) fields['Job Title'] = body.jobTitle
    if (body.company   !== undefined) fields['Company']   = body.company
    if (body.industry  !== undefined) fields['Industry']  = body.industry
    if (body.notes     !== undefined) fields['Notes']     = body.notes

    const resp = await fetch(`${BASE_URL}/${params.id}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ fields }),
    })
    if (!resp.ok) {
      const err = await resp.text()
      return NextResponse.json({ error: err }, { status: resp.status })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/linkedin-icps/[id] — remove a profile
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const resp = await fetch(`${BASE_URL}/${params.id}`, {
      method: 'DELETE',
      headers: headers(),
    })
    if (!resp.ok) {
      const err = await resp.text()
      return NextResponse.json({ error: err }, { status: resp.status })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
