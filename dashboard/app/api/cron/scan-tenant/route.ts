/**
 * POST /api/cron/scan-tenant
 *
 * Scan worker — runs the full LinkedIn + Facebook scan pipeline for ONE tenant.
 * Called by /api/cron/scan (the orchestrator), which dispatches all tenants
 * concurrently so N tenants take max(individual scan time) instead of sum.
 *
 * This is the unit of parallelism that makes Scout scale to hundreds of users:
 * - Each call is an independent Vercel serverless function invocation
 * - Vercel can run up to 1,000 concurrent invocations (Pro plan)
 * - So 500 tenants scan in ~150s, same as 1 tenant
 *
 * Auth: same CRON_SECRET used by all cron routes.
 *       The orchestrator passes it as Authorization: Bearer <secret>.
 *
 * Body: {
 *   tenantId: string
 *   email:    string
 *   apifyKey?: string   // per-tenant override; falls back to shared APIFY_API_TOKEN
 * }
 *
 * Returns: scan result JSON (same shape as runScanForTenant output)
 */

import { NextRequest, NextResponse } from 'next/server'
import { runScanForTenant }   from '@/lib/scan'
import { sendScanAlert }      from '@/lib/notify'
import { upsertScanHealth }   from '@/lib/scan-health'
import { startApifyRunAsync } from '@/lib/apify-async'
import { tenantFilter }       from '@/lib/airtable'

// Up to 300s per tenant: LinkedIn sync (~60s) + Facebook sync retries (~90s)
// + async fallback start (fast) or FB dataset fetch + scoring (~30s)
export const maxDuration = 300

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''

async function getFacebookGroupUrls(tenantId: string): Promise<string[]> {
  try {
    const formula = `AND(${tenantFilter(tenantId)},{Active}=1,{Type}='facebook_group')`
    const url = new URL(
      `https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent('Sources')}`
    )
    url.searchParams.set('filterByFormula', formula)
    url.searchParams.set('fields[]', 'Value')
    url.searchParams.append('fields[]', 'Name')
    url.searchParams.set('pageSize', '5')

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.records || [])
      .map((r: any) => r.fields['Value'] || r.fields['Name'])
      .filter(Boolean)
  } catch {
    return []
  }
}

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET || ''
  if (cronSecret) {
    const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
    if (token !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // ── Parse body ───────────────────────────────────────────────────────────────
  let body: { tenantId?: string; email?: string; apifyKey?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { tenantId, email, apifyKey } = body
  if (!tenantId || !email) {
    return NextResponse.json({ error: 'tenantId and email are required.' }, { status: 400 })
  }

  const started    = Date.now()
  const poolLabel  = apifyKey ? 'custom key' : 'shared pool'
  console.log(`[scan-tenant] Starting scan for ${tenantId} (${email}) — ${poolLabel}`)

  // ── Run the scan ────────────────────────────────────────────────────────────
  const result  = await runScanForTenant(tenantId, apifyKey)
  const elapsed = `${((Date.now() - started) / 1000).toFixed(1)}s`

  console.log(`[scan-tenant] ${email}: ${result.postsFound} posts saved, ${result.error || 'ok'} in ${elapsed}`)

  // ── Async Facebook fallback ─────────────────────────────────────────────────
  // If sync returned 0 posts AND Facebook groups are configured, start an async
  // Apify run. The webhook / scan-collect will collect results when Apify finishes.
  let fbPendingRunId = ''
  const APIFY_TOKEN  = apifyKey || process.env.APIFY_API_TOKEN || ''

  if (result.scanned === 0 && APIFY_TOKEN) {
    const fbGroups = await getFacebookGroupUrls(tenantId)

    if (fbGroups.length > 0) {
      console.log(`[scan-tenant] Starting async Facebook fallback for ${tenantId}`)

      const webhookSecret = process.env.APIFY_WEBHOOK_SECRET || ''
      const appUrl        = process.env.NEXTAUTH_URL || 'https://app.clientbloom.ai'
      const webhookUrl    = webhookSecret
        ? `${appUrl}/api/webhooks/apify?tenantId=${tenantId}&secret=${webhookSecret}`
        : undefined

      const handle = await startApifyRunAsync(
        APIFY_TOKEN,
        'apify/facebook-groups-scraper',
        {
          startUrls:   fbGroups.map(url => ({ url })),
          maxPosts:    5,
          maxComments: 0,
          proxy:       { useApifyProxy: true },
        },
        1024,       // 1 GB for async run — plenty of headroom
        webhookUrl,
        tenantId,   // tag run with tenantId for per-tenant cost attribution
      )

      if (handle) {
        fbPendingRunId = handle.runId
        await upsertScanHealth(tenantId, {
          lastScanStatus: 'pending_fb',
          lastScanAt:     new Date().toISOString(),
          fbRunId:        handle.runId,
          fbDatasetId:    handle.datasetId,
          fbRunAt:        new Date().toISOString(),
          lastError:      '',
        })
        console.log(`[scan-tenant] Async Facebook run started: ${handle.runId}`)
      }
    }
  }

  // ── Write scan health ───────────────────────────────────────────────────────
  if (!fbPendingRunId) {
    const status = result.error
      ? 'failed'
      : result.scanned === 0
        ? 'no_results'
        : 'success'

    await upsertScanHealth(tenantId, {
      lastScanAt:     new Date().toISOString(),
      lastScanStatus: status,
      lastPostsFound: result.postsFound,
      lastScanSource: result.scanSource,
      lastError:      result.error || '',
    })
  }

  // ── Alert on failure ────────────────────────────────────────────────────────
  if ((result.error || result.scanned === 0) && !fbPendingRunId) {
    await sendScanAlert({
      tenantId,
      email,
      error:      result.error,
      scanned:    result.scanned,
      scanSource: result.scanSource,
      elapsed,
    })
  }

  return NextResponse.json({
    ok:             true,
    tenantId,
    postsFound:     result.postsFound,
    scanned:        result.scanned,
    scanSource:     result.scanSource,
    fbPendingRunId: fbPendingRunId || undefined,
    error:          result.error || undefined,
    elapsed,
  })
}
