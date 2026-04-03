import { NextResponse } from 'next/server'

const BASE_ID    = process.env.AIRTABLE_BASE_ID!
const TOKEN      = process.env.AIRTABLE_API_TOKEN!
const TABLE      = 'Facebook%20Keywords'
const BASE_URL   = `https://api.airtable.com/v0/${BASE_ID}/${TABLE}`

const headers = () => ({
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
})

// GET — fetch all keywords
export async function GET() {
  try {
    const all: any[] = []
    let offset: string | undefined

    do {
      const url = new URL(BASE_URL)
      url.searchParams.set('pageSize', '100')
      if (offset) url.searchParams.set('offset', offset)

      const resp = await fetch(url.toString(), { headers: headers() })
      if (!resp.ok) {
        const err = await resp.text()
        return NextResponse.json({ error: err }, { status: resp.status })
      }
      const data = await resp.json()
      all.push(...(data.records || []))
      offset = data.offset
    } while (offset)

    const keywords = all.map((r: any) => ({
      id:       r.id,
      keyword:  r.fields['Keyword']  || '',
      category: r.fields['Category'] || '',
      active:   r.fields['Active']   ?? true,
    }))

    return NextResponse.json({ keywords })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST — add a keyword
export async function POST(req: Request) {
  try {
    const { keyword, category = '' } = await req.json()
    if (!keyword?.trim()) {
      return NextResponse.json({ error: 'keyword is required' }, { status: 400 })
    }

    const resp = await fetch(BASE_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        records: [{ fields: { Keyword: keyword.trim(), Category: category, Active: true } }],
      }),
    })

    if (!resp.ok) {
      const err = await resp.text()
      return NextResponse.json({ error: err }, { status: resp.status })
    }

    const data = await resp.json()
    const r = data.records[0]
    return NextResponse.json({
      keyword: { id: r.id, keyword: r.fields['Keyword'], category: r.fields['Category'] || '', active: true },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH — toggle active / update
export async function PATCH(req: Request) {
  try {
    const { id, active } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const resp = await fetch(`${BASE_URL}/${id}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ fields: { Active: active } }),
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

// DELETE — remove a keyword
export async function DELETE(req: Request) {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const resp = await fetch(`${BASE_URL}/${id}`, {
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
