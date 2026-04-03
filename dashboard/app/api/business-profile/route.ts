import { NextResponse } from 'next/server'

const AIRTABLE_TOKEN = process.env.AIRTABLE_API_TOKEN
const BASE_ID = process.env.AIRTABLE_BASE_ID
const TABLE = 'Business Profile'

async function at(path: string, opts: RequestInit = {}) {
  const res = await fetch(
    `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}${path}`,
    {
      ...opts,
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
      },
    }
  )
  return res.json()
}

export async function GET() {
  try {
    const data = await at('?maxRecords=1')
    const record = data.records?.[0]
    if (!record) return NextResponse.json({ profile: null })
    return NextResponse.json({ profile: record.fields, id: record.id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const fields: Record<string, string> = {
      'Business Name': body.businessName || '',
      'Industry': body.industry || '',
      'Ideal Client': body.idealClient || '',
      'Problem Solved': body.problemSolved || '',
      'Signal Types': Array.isArray(body.signalTypes)
        ? body.signalTypes.join(', ')
        : body.signalTypes || '',
      'Updated At': new Date().toISOString(),
    }

    const existing = await at('?maxRecords=1')
    const rec = existing.records?.[0]

    if (rec) {
      const updated = await at(`/${rec.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields }),
      })
      return NextResponse.json({ success: true, id: updated.id })
    } else {
      const created = await at('', {
        method: 'POST',
        body: JSON.stringify({ fields }),
      })
      return NextResponse.json({ success: true, id: created.id })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
