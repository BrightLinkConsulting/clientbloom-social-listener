/**
 * GET /api/cron/archive-posts
 *
 * Weekly archival job. Sets Engagement Status = 'archived' on all
 * Captured Posts older than ARCHIVE_DAYS days (default 90).
 *
 * This prevents unbounded Airtable row growth while preserving records
 * for audit/history purposes. Archived posts are hidden from all feed
 * queries (the /api/posts route filters out Engagement Status='archived').
 *
 * Runs every Sunday at 03:00 UTC (see vercel.json).
 * Protected by CRON_SECRET bearer token.
 *
 * Batches Airtable PATCH requests at 10 records per call (Airtable limit).
 * Handles pagination via offset for large tenants.
 */

import { NextResponse } from 'next/server'
import { SHARED_BASE, PROV_TOKEN } from '@/lib/airtable'

export const maxDuration = 60

const ARCHIVE_DAYS = 90
const TABLE        = 'Captured Posts'
const BATCH_SIZE   = 10   // Airtable bulk PATCH limit

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchStalePostIds(): Promise<string[]> {
  const cutoff     = new Date(Date.now() - ARCHIVE_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const formula    = encodeURIComponent(
    `AND(IS_BEFORE({Captured At}, '${cutoff}'), {Engagement Status}!='archived')`
  )

  const ids: string[] = []
  let offset: string | undefined

  do {
    const url = new URL(`https://api.airtable.com/v0/${SHARED_BASE}/${encodeURIComponent(TABLE)}`)
    url.searchParams.set('filterByFormula', decodeURIComponent(formula))
    url.searchParams.set('fields[]', 'Captured At')
    url.searchParams.set('pageSize', '100')
    if (offset) url.searchParams.set('offset', offset)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${PROV_TOKEN}` },
    })
    if (!res.ok) throw new Error(`Airtable fetch failed: ${res.status}`)

    const data = await res.json()
    for (const r of data.records || []) ids.push(r.id)
    offset = data.offset
  } while (offset)

  return ids
}

async function archiveBatch(ids: string[]): Promise<void> {
  const records = ids.map(id => ({
    id,
    fields: { 'Engagement Status': 'archived' },
  }))
  const res = await fetch(
    `https://api.airtable.com/v0/${SHARED_BASE}/${encodeURIComponent(TABLE)}`,
    {
      method:  'PATCH',
      headers: { Authorization: `Bearer ${PROV_TOKEN}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ records }),
    }
  )
  if (!res.ok) throw new Error(`Airtable batch PATCH failed: ${await res.text()}`)
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  if (!PROV_TOKEN || !SHARED_BASE) {
    return NextResponse.json({ error: 'Airtable provisioning env vars not set' }, { status: 500 })
  }

  try {
    const staleIds = await fetchStalePostIds()
    console.log(`[archive-posts] Found ${staleIds.length} posts older than ${ARCHIVE_DAYS} days`)

    let archived = 0
    let errors   = 0

    // Chunk into batches of BATCH_SIZE
    for (let i = 0; i < staleIds.length; i += BATCH_SIZE) {
      const batch = staleIds.slice(i, i + BATCH_SIZE)
      try {
        await archiveBatch(batch)
        archived += batch.length
      } catch (e: any) {
        console.error(`[archive-posts] Batch ${i / BATCH_SIZE + 1} failed:`, e.message)
        errors += batch.length
      }
    }

    console.log(`[archive-posts] Done: ${archived} archived, ${errors} errors`)
    return NextResponse.json({
      ok:       true,
      archived,
      errors,
      message:  `Archived ${archived} posts older than ${ARCHIVE_DAYS} days.`,
    })
  } catch (e: any) {
    console.error('[archive-posts] Fatal:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
