import { NextResponse } from 'next/server'

const AIRTABLE_TOKEN = process.env.AIRTABLE_API_TOKEN!
const BASE_ID        = process.env.AIRTABLE_BASE_ID!
const TABLE          = 'LinkedIn ICPs'
const BASE_URL       = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}`

const headers = () => ({
  'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
  'Content-Type': 'application/json',
})

// GET /api/linkedin-icps — return all ICP profiles
export async function GET() {
  try {
    const all: any[] = []
    let offset: string | undefined

    do {
      const url = new URL(BASE_URL)
      url.searchParams.set('pageSize', '100')
      url.searchParams.set('sort[0][field]', 'Name')
      url.searchParams.set('sort[0][direction]', 'asc')
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

    const profiles = all.map((r: any) => ({
      id:          r.id,
      name:        r.fields['Name']        || '',
      profileUrl:  r.fields['Profile URL'] || '',
      jobTitle:    r.fields['Job Title']   || '',
      company:     r.fields['Company']     || '',
      industry:    r.fields['Industry']    || '',
      active:      r.fields['Active']      ?? true,
      source:      r.fields['Source']      || 'manual',
      notes:       r.fields['Notes']       || '',
      addedDate:   r.fields['Added Date']  || '',
      postsFound:  r.fields['Posts Found'] || 0,
    }))

    return NextResponse.json({ profiles })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/linkedin-icps — add a new ICP profile
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { name, profileUrl, jobTitle, company, industry, notes, source } = body

    if (!profileUrl || !profileUrl.includes('linkedin.com/in/')) {
      return NextResponse.json(
        { error: 'Profile URL must be a LinkedIn profile URL (linkedin.com/in/...)' },
        { status: 400 }
      )
    }

    const fields: any = {
      'Name':        name || profileUrl,
      'Profile URL': profileUrl.trim(),
      'Active':      true,
      'Source':      source || 'manual',
    }
    if (jobTitle)  fields['Job Title'] = jobTitle
    if (company)   fields['Company']   = company
    if (industry)  fields['Industry']  = industry
    if (notes)     fields['Notes']     = notes

    // Set Added Date to today
    fields['Added Date'] = new Date().toISOString().split('T')[0]

    const resp = await fetch(BASE_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ records: [{ fields }] }),
    })
    if (!resp.ok) {
      const err = await resp.text()
      return NextResponse.json({ error: err }, { status: resp.status })
    }
    const data = await resp.json()
    const r = data.records[0]
    return NextResponse.json({
      profile: {
        id:         r.id,
        name:       r.fields['Name'] || '',
        profileUrl: r.fields['Profile URL'] || '',
        jobTitle:   r.fields['Job Title'] || '',
        company:    r.fields['Company'] || '',
        industry:   r.fields['Industry'] || '',
        active:     r.fields['Active'] ?? true,
        source:     r.fields['Source'] || 'manual',
      }
    }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
