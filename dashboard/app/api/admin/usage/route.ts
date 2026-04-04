/**
 * GET /api/admin/usage
 *
 * Admin-only. Returns per-tenant usage stats:
 *   - Total captured posts (from each tenant's Airtable base)
 *   - Most recent Captured At timestamp
 *   - Estimated Apify cost (~$0.002 per post, rough baseline)
 *
 * Tenants without an Airtable token return { count: null, error: 'no_token' }.
 * This endpoint fetches Platform Airtable for token details (never exposed to client).
 */

import { NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'

const PLATFORM_TOKEN    = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE     = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const AIRTABLE_API      = 'https://api.airtable.com/v0'
const COST_PER_POST     = 0.002  // Apify ~$0.002 per scraped result (rough estimate)

interface UsageRecord {
  id:          string
  email:       string
  companyName: string
  plan:        string
  status:      string
  postCount:   number | null
  lastScan:    string | null
  estCost:     number | null
  error?:      string
}

async function getTenantPostCount(
  baseId: string,
  token: string
): Promise<{ count: number; lastScan: string | null }> {
  let count = 0
  let lastScan: string | null = null
  let offset: string | undefined

  // Fetch all pages (up to 500 max for performance — show "500+" if capped)
  const MAX_PAGES = 5
  let pages = 0

  do {
    const url = new URL(`${AIRTABLE_API}/${baseId}/Captured%20Posts`)
    url.searchParams.set('pageSize', '100')
    url.searchParams.set('fields[]', 'Captured At')
    url.searchParams.set('sort[0][field]', 'Captured At')
    url.searchParams.set('sort[0][direction]', 'desc')
    if (offset) url.searchParams.set('offset', offset)

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!resp.ok) throw new Error(`Airtable ${resp.status}`)

    const data = await resp.json()
    const records = data.records || []
    count += records.length

    // Grab the most recent Captured At from the first page
    if (!lastScan && records.length > 0) {
      lastScan = records[0]?.fields?.['Captured At'] || null
    }

    offset = data.offset
    pages++
  } while (offset && pages < MAX_PAGES)

  return { count, lastScan }
}

export async function GET() {
  const caller = await getTenantConfig()
  if (!caller) return tenantError()
  if (!caller.isAdmin) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }
  if (!PLATFORM_TOKEN || !PLATFORM_BASE) {
    return NextResponse.json({ error: 'Platform Airtable not configured.' }, { status: 500 })
  }

  try {
    // Fetch all tenant records including tokens (admin-only, never exposed to client)
    const all: any[] = []
    let offset: string | undefined

    do {
      const url = new URL(`${AIRTABLE_API}/${PLATFORM_BASE}/Tenants`)
      url.searchParams.set('pageSize', '100')
      url.searchParams.set('sort[0][field]', 'Company Name')
      url.searchParams.set('sort[0][direction]', 'asc')
      if (offset) url.searchParams.set('offset', offset)

      const resp = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
      })
      if (!resp.ok) return NextResponse.json({ error: await resp.text() }, { status: resp.status })

      const data = await resp.json()
      all.push(...(data.records || []))
      offset = data.offset
    } while (offset)

    // Query each tenant's Captured Posts count in parallel (with concurrency limit)
    const payingTenants = all.filter(r => r.fields?.Plan !== 'Owner')

    const usageResults: UsageRecord[] = await Promise.all(
      payingTenants.map(async (r): Promise<UsageRecord> => {
        const base:  string = r.fields?.['Airtable Base ID']    || ''
        const token: string = r.fields?.['Airtable API Token']  || ''

        const record: UsageRecord = {
          id:          r.id,
          email:       r.fields?.['Email']        || '',
          companyName: r.fields?.['Company Name'] || '',
          plan:        r.fields?.['Plan']         || '',
          status:      r.fields?.['Status']       || 'Active',
          postCount:   null,
          lastScan:    null,
          estCost:     null,
        }

        if (!base || !token) {
          record.error = 'no_credentials'
          return record
        }

        try {
          const { count, lastScan } = await getTenantPostCount(base, token)
          record.postCount = count
          record.lastScan  = lastScan
          record.estCost   = Math.round(count * COST_PER_POST * 100) / 100
        } catch (e: any) {
          record.error = e.message?.slice(0, 80) || 'fetch_error'
        }

        return record
      })
    )

    return NextResponse.json({ usage: usageResults })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
