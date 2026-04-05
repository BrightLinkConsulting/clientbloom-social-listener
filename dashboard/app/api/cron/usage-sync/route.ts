/**
 * GET /api/cron/usage-sync
 *
 * Runs hourly. Queries each tenant's Airtable base for post count + last scan,
 * then writes the results back to the Platform Airtable Tenants table as a
 * snapshot cache. The admin Usage tab reads this cache for instant load.
 *
 * Platform Airtable Tenants table requires 3 fields (add if missing):
 *   - "Post Count"       (Number)
 *   - "Est Cost"         (Number)
 *   - "Usage Synced At"  (Date/time, ISO 8601)
 *
 * Secured by CRON_SECRET env var (set in Vercel project settings).
 * Vercel also sets x-vercel-signature on scheduled invocations.
 */

import { NextRequest, NextResponse } from 'next/server'

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const CRON_SECRET    = process.env.CRON_SECRET               || ''
const AIRTABLE_API   = 'https://api.airtable.com/v0'
const COST_PER_POST  = 0.002

async function getPostCount(
  baseId: string,
  token: string
): Promise<{ count: number; lastScan: string | null }> {
  let count = 0
  let lastScan: string | null = null
  let offset: string | undefined
  const MAX_PAGES = 10  // up to 1000 posts before we cap

  do {
    const url = new URL(`${AIRTABLE_API}/${baseId}/Captured%20Posts`)
    url.searchParams.set('pageSize', '100')
    url.searchParams.set('fields[]', 'Captured At')
    url.searchParams.set('sort[0][field]', 'Captured At')
    url.searchParams.set('sort[0][direction]', 'desc')
    if (offset) url.searchParams.set('offset', offset)

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 0 },
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

async function patchTenant(
  recordId: string,
  postCount: number,
  estCost: number,
  syncedAt: string
): Promise<void> {
  const url = `${AIRTABLE_API}/${PLATFORM_BASE}/Tenants/${recordId}`
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${PLATFORM_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        'Post Count':      postCount,
        'Est Cost':        estCost,
        'Usage Synced At': syncedAt,
      },
    }),
  })
  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`Patch failed for ${recordId}: ${body.slice(0, 120)}`)
  }
}

export const maxDuration = 300

export async function GET(req: NextRequest) {
  // Auth check — Vercel sets Authorization header for cron; also accept CRON_SECRET query param
  const authHeader = req.headers.get('authorization')
  const secretParam = req.nextUrl.searchParams.get('secret')
  const validCron   = authHeader === `Bearer ${CRON_SECRET}`
  const validParam  = CRON_SECRET && secretParam === CRON_SECRET

  if (!validCron && !validParam) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!PLATFORM_TOKEN || !PLATFORM_BASE) {
    return NextResponse.json({ error: 'Platform Airtable not configured' }, { status: 500 })
  }

  const syncedAt = new Date().toISOString()
  const results: { id: string; email: string; postCount: number | null; error?: string }[] = []

  try {
    // 1. Fetch all tenants with credentials
    const all: any[] = []
    let offset: string | undefined

    do {
      const url = new URL(`${AIRTABLE_API}/${PLATFORM_BASE}/Tenants`)
      url.searchParams.set('pageSize', '100')
      if (offset) url.searchParams.set('offset', offset)

      const resp = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
        next: { revalidate: 0 },
      })
      if (!resp.ok) return NextResponse.json({ error: await resp.text() }, { status: resp.status })

      const data = await resp.json()
      all.push(...(data.records || []))
      offset = data.offset
    } while (offset)

    // 2. Filter tenants that have Airtable credentials
    const tenants = all.filter(r => {
      const base  = r.fields?.['Airtable Base ID']   || ''
      const token = r.fields?.['Airtable API Token']  || ''
      return base && token
    })

    // 3. Query all in parallel (fan-out)
    await Promise.allSettled(
      tenants.map(async (r) => {
        const base  = r.fields['Airtable Base ID']  as string
        const token = r.fields['Airtable API Token'] as string
        const email = r.fields['Email'] as string || r.id

        try {
          const { count } = await getPostCount(base, token)
          const estCost   = Math.round(count * COST_PER_POST * 100) / 100

          await patchTenant(r.id, count, estCost, syncedAt)
          results.push({ id: r.id, email, postCount: count })
        } catch (e: any) {
          results.push({ id: r.id, email, postCount: null, error: e.message?.slice(0, 80) })
        }
      })
    )

    const synced = results.filter(r => r.postCount !== null).length
    const errors = results.filter(r => r.error).length

    return NextResponse.json({
      ok: true,
      syncedAt,
      total:  tenants.length,
      synced,
      errors,
      results,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
