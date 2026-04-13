/**
 * GET /api/cron/usage-sync
 *
 * Runs hourly. Counts each tenant's captured posts from the shared Captured Posts table
 * using the tenantId filter, then writes the results back to the Platform Airtable
 * Tenants table as a snapshot cache. The admin Usage tab reads this cache for instant load.
 *
 * Now supports multi-tenant: uses the shared Airtable base and tenantId filtering
 * instead of requiring per-tenant credentials.
 *
 * Platform Airtable Tenants table requires 3 fields (add if missing):
 *   - "Post Count"       (Number)
 *   - "Est Cost"         (Number)
 *   - "Usage Synced At"  (Date/time, ISO 8601)
 *
 * Secured by CRON_SECRET env var (set in Vercel project settings).
 */

import { NextRequest, NextResponse } from 'next/server'
import { escapeAirtableString } from '@/lib/airtable'

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const CRON_SECRET    = process.env.CRON_SECRET               || ''
const AIRTABLE_API   = 'https://api.airtable.com/v0'
const COST_PER_POST  = 0.002

/**
 * Count posts for a tenant in the current calendar month
 * Uses tenantId filter on the shared Captured Posts table
 */
async function countTenantPostsThisMonth(
  tenantId: string
): Promise<{ count: number; lastCapture: string | null }> {
  let count = 0
  let lastCapture: string | null = null
  let offset: string | undefined
  const MAX_PAGES = 50  // up to 5000 posts before we cap

  // Calculate start of current month (UTC)
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const monthStartISO = monthStart.toISOString()

  // Build filter: (Tenant ID = tenantId) AND (Captured At >= month start)
  // NOTE: Do NOT encodeURIComponent here — URLSearchParams.set() encodes automatically.
  // Double-encoding breaks Airtable formula parsing (422).
  const filter = `AND({Tenant ID}='${escapeAirtableString(tenantId)}',{Captured At}>='${monthStartISO}')`

  do {
    const url = new URL(`${AIRTABLE_API}/${PLATFORM_BASE}/Captured%20Posts`)
    url.searchParams.set('pageSize', '100')
    url.searchParams.set('fields[]', 'Captured At')
    url.searchParams.set('filterByFormula', filter)
    url.searchParams.set('sort[0][field]', 'Captured At')
    url.searchParams.set('sort[0][direction]', 'desc')
    if (offset) url.searchParams.set('offset', offset)

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
      next: { revalidate: 0 },
    })
    if (!resp.ok) throw new Error(`Airtable GET failed: ${resp.status}`)

    const data = await resp.json()
    const records: any[] = data.records || []
    count += records.length

    if (!lastCapture && records.length > 0) {
      lastCapture = records[0]?.fields?.['Captured At'] || null
    }

    offset = data.offset
  } while (offset && count < MAX_PAGES * 100)

  return { count, lastCapture }
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
  // Auth check — unconditional CRON_SECRET enforcement
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!PLATFORM_TOKEN || !PLATFORM_BASE) {
    return NextResponse.json({ error: 'Platform Airtable not configured' }, { status: 500 })
  }

  const syncedAt = new Date().toISOString()
  const results: { id: string; tenantId: string; email: string; postCount: number | null; error?: string }[] = []

  try {
    // 1. Fetch active tenants only — skip Archived and deleted accounts.
    // Usage sync on archived tenants wastes Airtable API calls and inflates cost estimates.
    const allTenants: any[] = []
    let offset: string | undefined

    do {
      const url = new URL(`${AIRTABLE_API}/${PLATFORM_BASE}/Tenants`)
      url.searchParams.set('pageSize', '100')
      // Filter: exclude Archived, deleted, and trial_expired statuses
      // trial_expired accounts have no active subscription — syncing their post counts
      // wastes Airtable API calls and inflates shared-pool cost estimates.
      url.searchParams.set(
        'filterByFormula',
        `AND({Status}!='Archived', {Status}!='deleted', {Status}!='trial_expired')`,
      )
      // append() required — set() replaces the previous value for the same key
      url.searchParams.append('fields[]', 'Tenant ID')
      url.searchParams.append('fields[]', 'Email')
      url.searchParams.append('fields[]', 'Status')
      if (offset) url.searchParams.set('offset', offset)

      const resp = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
        next: { revalidate: 0 },
      })
      if (!resp.ok) return NextResponse.json({ error: await resp.text() }, { status: resp.status })

      const data = await resp.json()
      allTenants.push(...(data.records || []))
      offset = data.offset
    } while (offset)

    // 2. Count posts for each tenant in parallel (fan-out)
    await Promise.allSettled(
      allTenants.map(async (r) => {
        const tenantId = r.fields['Tenant ID'] as string
        const email    = r.fields['Email'] as string || r.id
        const status   = r.fields['Status'] as string

        // Skip misconfigured tenants (no Tenant ID means never provisioned)
        if (!tenantId) {
          results.push({ id: r.id, tenantId: '', email, postCount: null, error: 'No Tenant ID' })
          return
        }

        try {
          const { count } = await countTenantPostsThisMonth(tenantId)
          const estCost = Math.round(count * COST_PER_POST * 100) / 100

          await patchTenant(r.id, count, estCost, syncedAt)
          results.push({ id: r.id, tenantId, email, postCount: count })
        } catch (e: any) {
          results.push({
            id: r.id,
            tenantId,
            email,
            postCount: null,
            error: e.message?.slice(0, 80)
          })
        }
      })
    )

    const synced = results.filter(r => r.postCount !== null).length
    const errors = results.filter(r => r.error).length

    return NextResponse.json({
      ok: true,
      syncedAt,
      total:  allTenants.length,
      synced,
      errors,
      results,
    })
  } catch (e: any) {
    console.error('[usage-sync] Error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
