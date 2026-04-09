import { NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import { airtableList, airtableCreate, SHARED_BASE, PROV_TOKEN, tenantFilter } from '@/lib/airtable'
import { getTierLimits } from '@/lib/tier'

const TABLE = 'LinkedIn ICPs'

// ── Count active ICP profiles for a tenant ────────────────────────────────────
async function countIcpProfiles(tenantId: string): Promise<number> {
  const url = new URL(`https://api.airtable.com/v0/${SHARED_BASE}/${encodeURIComponent(TABLE)}`)
  url.searchParams.set('filterByFormula', `AND(${tenantFilter(tenantId)},{Active}=1)`)
  url.searchParams.set('fields[]', 'Active')
  url.searchParams.set('pageSize', '100')
  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${PROV_TOKEN}` },
    cache: 'no-store',
  })
  if (!resp.ok) throw new Error(`Airtable count failed: ${resp.status}`)
  const data = await resp.json()
  return (data.records ?? []).length
}

export async function GET() {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()
  const { tenantId } = tenant

  try {
    const all: any[] = []
    let offset: string | undefined

    do {
      const url = new URL(`https://api.airtable.com/v0/${SHARED_BASE}/${encodeURIComponent(TABLE)}`)
      url.searchParams.set('filterByFormula', tenantFilter(tenantId))
      url.searchParams.set('pageSize', '100')
      url.searchParams.set('sort[0][field]', 'Name')
      url.searchParams.set('sort[0][direction]', 'asc')
      if (offset) url.searchParams.set('offset', offset)

      const resp = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${PROV_TOKEN}`, 'Content-Type': 'application/json' },
      })
      if (!resp.ok) return NextResponse.json({ error: await resp.text() }, { status: resp.status })
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

export async function POST(req: Request) {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()
  const { tenantId, plan } = tenant

  try {
    const body = await req.json()
    const { name, profileUrl, jobTitle, company, industry, notes, source } = body

    if (!profileUrl || !profileUrl.includes('linkedin.com/in/')) {
      return NextResponse.json(
        { error: 'Profile URL must be a LinkedIn profile URL (linkedin.com/in/...)' },
        { status: 400 }
      )
    }

    // ── Plan limit enforcement ────────────────────────────────────────────
    const { profiles: profileLimit } = getTierLimits(plan)
    try {
      const currentCount = await countIcpProfiles(tenantId)
      if (currentCount >= profileLimit) {
        return NextResponse.json(
          {
            error:   `You've reached the ${profileLimit} ICP profile limit for your plan. Upgrade to add more.`,
            limit:   profileLimit,
            current: currentCount,
          },
          { status: 429 }
        )
      }
    } catch (e: any) {
      console.error('[linkedin-icps] Profile count check failed:', e.message)
      return NextResponse.json(
        { error: 'Could not verify plan limits. Please try again.' },
        { status: 503 }
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
    fields['Added Date'] = new Date().toISOString().split('T')[0]

    const resp = await airtableCreate(TABLE, tenantId, fields)
    if (!resp.ok) return NextResponse.json({ error: await resp.text() }, { status: resp.status })

    const data = await resp.json()
    const r    = data.records[0]
    return NextResponse.json({
      profile: {
        id:         r.id,
        name:       r.fields['Name']        || '',
        profileUrl: r.fields['Profile URL'] || '',
        jobTitle:   r.fields['Job Title']   || '',
        company:    r.fields['Company']     || '',
        industry:   r.fields['Industry']    || '',
        active:     r.fields['Active']      ?? true,
        source:     r.fields['Source']      || 'manual',
      }
    }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
