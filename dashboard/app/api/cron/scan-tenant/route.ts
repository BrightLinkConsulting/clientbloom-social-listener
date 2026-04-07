/**
 * POST /api/cron/scan-tenant
 *
 * Scan worker — runs the LinkedIn-only scan pipeline for ONE tenant.
 * Called by /api/cron/scan (the orchestrator), which dispatches all tenants
 * concurrently so N tenants take max(individual scan time) instead of sum.
 *
 * This is the unit of parallelism that makes Scout scale to hundreds of users:
 * - Each call is an independent Vercel serverless function invocation
 * - Vercel can run up to 1,000 concurrent invocations (Pro plan)
 * - So 500 tenants scan in ~60s, same as 1 tenant
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
import { runScanForTenant } from '@/lib/scan'
import { sendScanAlert }    from '@/lib/notify'
import { upsertScanHealth } from '@/lib/scan-health'

// LinkedIn API-based actors complete in ~30-60s. 300s maxDuration gives
// generous headroom for Airtable reads, scoring, and writes.
export const maxDuration = 300

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
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

  // ── Write scan health ───────────────────────────────────────────────────────
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

  // ── Alert on failure ────────────────────────────────────────────────────────
  if (result.error || result.scanned === 0) {
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
    ok:         true,
    tenantId,
    postsFound: result.postsFound,
    scanned:    result.scanned,
    scanSource: result.scanSource,
    error:      result.error || undefined,
    elapsed,
  })
}
