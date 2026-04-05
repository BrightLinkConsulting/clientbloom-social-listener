/**
 * GET /api/admin/usage
 *
 * Admin-only. Returns per-tenant usage stats.
 *
 * Data strategy (two-tier):
 *   1. PRIMARY  — reads "Post Count", "Est Cost", "Usage Synced At" fields from
 *      the Platform Airtable Tenants table (written by /api/cron/usage-sync hourly).
 *      Instant — single API call, no per-tenant fan-out.
 *   2. FALLBACK — if a tenant has no cached data yet (Post Count is blank),
 *      falls back to a live count from that tenant's Airtable base.
 *
 * Response includes:
 *   - newestSyncedAt  — most recent cache write timestamp (for UI "last updated" badge)
 *   - fromCache per record — lets the UI badge stale rows differently
 */

import { NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const AIRTABLE_API   = 'https://api.airtable.com/v0'
const COST_PER_POST  = 0.002

async function liveFetch(
  baseId: string,
  token: string
): Promise<{ count: number; lastScan: string | null }> {
  let count = 0
  let lastScan: string | null = null
  let offset: string | undefined
  const MAX_PAGES = 5

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
    const records: any[] = data.records || []
    count += records.length
    if (!lastScan && records.length > 0) {
      lastScan = records[0]?.fields?.['Captured At'] || null
    }
    offset = data.offset
  } while (offset && count < MAX_PAGES * 100)

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
    // ── 1. Fetch all tenant records (includes cached usage fields) ────────────
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

    const payingTenants = all.filter(r => r.fields?.Plan !== 'Owner')

    // ── 2. Build usage records — cache-first, live fallback ──────────────────
    const usage = await Promise.all(
      payingTenants.map(async (r) => {
        const base     = r.fields?.['Airtable Base ID']   || ''
        const token    = r.fields?.['Airtable API Token'] || ''
        const syncedAt = r.fields?.['Usage Synced At']    || null

        const record: {
          id: string; email: string; companyName: string; plan: string; status: string
          postCount: number | null; lastScan: string | null; estCost: number | null
          syncedAt: string | null; fromCache: boolean; error?: string
        } = {
          id:          r.id,
          email:       r.fields?.['Email']        || '',
          companyName: r.fields?.['Company Name'] || '',
          plan:        r.fields?.['Plan']         || '',
          status:      r.fields?.['Status']       || 'Active',
          postCount:   null,
          lastScan:    null,
          estCost:     null,
          syncedAt,
          fromCache:   false,
        }

        // Cache hit: Post Count field is a number
        const cachedCount = r.fields?.['Post Count']
        if (typeof cachedCount === 'number') {
          record.postCount = cachedCount
          record.estCost   = typeof r.fields?.['Est Cost'] === 'number'
            ? r.fields['Est Cost']
            : Math.round(cachedCount * COST_PER_POST * 100) / 100
          record.fromCache = true
          return record
        }

        // Cache miss: live fetch
        if (!base || !token) {
          record.error = 'no_credentials'
          return record
        }

        try {
          const { count, lastScan } = await liveFetch(base, token)
          record.postCount = count
          record.lastScan  = lastScan
          record.estCost   = Math.round(count * COST_PER_POST * 100) / 100
        } catch (e: any) {
          record.error = e.message?.slice(0, 80) || 'fetch_error'
        }

        return record
      })
    )

    // ── 3. Compute sync metadata for the UI ──────────────────────────────────
    const syncTimes = usage
      .filter(u => u.syncedAt)
      .map(u => new Date(u.syncedAt!).getTime())

    const newestSyncedAt = syncTimes.length
      ? new Date(Math.max(...syncTimes)).toISOString()
      : null

    return NextResponse.json({ usage, newestSyncedAt })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
