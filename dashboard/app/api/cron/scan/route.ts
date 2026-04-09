/**
 * GET /api/cron/scan
 *
 * Scan ORCHESTRATOR — fires at 6 AM and 6 PM PDT every day.
 *
 * ── Scalability architecture ─────────────────────────────────────────────────
 * This route does NOT run scans itself. It fetches the tenant list and
 * dispatches each tenant to /api/cron/scan-tenant as a PARALLEL, INDEPENDENT
 * serverless function invocation. Each worker has its own 300s timeout budget.
 *
 * Result: 500 tenants scan in the same ~150s as 1 tenant.
 * (Previous sequential design: 500 tenants × 150s = ~20 hours.)
 *
 * Vercel Pro supports up to 1,000 concurrent function invocations.
 * If tenant count exceeds that, batch dispatches into groups of 900.
 *
 * ── Three-layer reliability (LinkedIn only — Facebook removed April 8 2026) ────
 *   1. In-scan retry — reduced scope + more RAM on second attempt
 *   2. /api/cron/scan-collect (15 min later) — collects any in-flight Apify runs
 *   3. /api/cron/scan-retry (20 min later) — re-runs tenants with 0 results
 *
 * ── Staggered dispatch (anti-thundering-herd) ────────────────────────────────
 * Without staggering, all N workers start at the same millisecond and hit
 * Airtable simultaneously at scan-start. Even with airtableFetch retry/backoff,
 * a 200-tenant burst generates ~2,400 simultaneous calls vs Airtable's 5 req/s
 * limit — the backoff absorbs the load but adds latency to every scan.
 *
 * With DISPATCH_JITTER_MAX_MS=5000 (5 s spread), 200 workers start across a
 * 5 s window → average ~40 calls/s instead of 2,400 calls/burst. Each scan
 * still runs fully in parallel; only the START TIME is staggered.
 *
 * The orchestrator's 300 s budget comfortably absorbs the 5 s stagger overhead.
 *
 * ── Protected by CRON_SECRET ─────────────────────────────────────────────────
 * Vercel automatically injects Authorization: Bearer <CRON_SECRET> for cron
 * invocations. The same secret is forwarded to each scan-tenant worker.
 */

import { NextRequest, NextResponse } from 'next/server'
import { upsertScanHealth }          from '@/lib/scan-health'
import { airtableFetch }             from '@/lib/airtable'

// The orchestrator awaits all parallel workers concurrently.
// Workers run in ~150s max, so 300s budget is comfortable.
// Critical: even though N workers run at once, the orchestrator only
// blocks for max(individual scan times + stagger jitter) ≈ 155s — NOT sum.
export const maxDuration = 300

// ── Stagger constant ─────────────────────────────────────────────────────────
// Each tenant's dispatch is delayed by a random amount in [0, DISPATCH_JITTER_MAX_MS].
// At 200 tenants this spreads simultaneous Airtable calls across ~5 s
// instead of a single burst, reducing peak load from 2,400 req/burst to ~40 req/s.
// Increase this value if Airtable rate-limit warnings appear in logs at scale.
const DISPATCH_JITTER_MAX_MS = 5_000  // 5 s spread — safe for 300 s orchestrator budget

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''

// ── Fetch active tenant list ───────────────────────────────────────────────────
async function getActiveTenants(): Promise<{
  tenantId: string
  email:    string
  plan:     string
  apifyKey?: string
}[]> {
  if (!PLATFORM_TOKEN || !PLATFORM_BASE) {
    console.error('[cron/scan] PLATFORM_AIRTABLE_TOKEN or PLATFORM_AIRTABLE_BASE_ID not set')
    return []
  }

  const url = new URL(
    `https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent('Tenants')}`
  )
  url.searchParams.set('filterByFormula', `AND({Status}='Active',{Is Feed Only}!=1)`)
  url.searchParams.set('fields[]', 'Tenant ID')
  url.searchParams.append('fields[]', 'Email')
  url.searchParams.append('fields[]', 'Plan')
  url.searchParams.append('fields[]', 'Apify API Key')
  url.searchParams.set('pageSize', '100')

  const resp = await airtableFetch(url.toString(), {
    headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
  })
  if (!resp.ok) {
    console.error(`[cron/scan] Failed to fetch tenants: ${resp.status}`)
    return []
  }
  const data = await resp.json()
  return (data.records || []).map((r: any) => ({
    tenantId: r.fields['Tenant ID']     || 'owner',
    email:    r.fields['Email']         || '',
    plan:     r.fields['Plan']          || '',
    apifyKey: r.fields['Apify API Key'] || undefined,
  }))
}

// ── Dispatch a single scan-tenant worker ───────────────────────────────────────
// Returns the HTTP status code (200 = dispatched OK, anything else = failed to dispatch).
// staggerMs: caller-supplied random delay applied BEFORE the HTTP call to spread
// simultaneous worker starts across a time window (see DISPATCH_JITTER_MAX_MS).
async function dispatchTenantScan(
  workerUrl: string,
  cronSecret: string,
  tenant: { tenantId: string; email: string; plan: string; apifyKey?: string },
  staggerMs = 0,
): Promise<{ tenantId: string; dispatched: boolean; status: number; error?: string }> {
  // Apply stagger BEFORE opening the network connection. This is the mechanism
  // that spreads 200 workers across a 5 s window instead of all firing at once.
  if (staggerMs > 0) {
    await new Promise(resolve => setTimeout(resolve, staggerMs))
  }
  try {
    const resp = await fetch(workerUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cronSecret}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        tenantId: tenant.tenantId,
        email:    tenant.email,
        plan:     tenant.plan,
        apifyKey: tenant.apifyKey,
      }),
      // Signal.timeout not available in all environments — use a generous absolute timeout
      // The worker will keep running on Vercel even if this connection drops
      signal: AbortSignal.timeout(290_000),  // 290s — just under the worker's 300s limit
    })

    // Read a small slice of the body just to confirm the worker returned
    const text = await resp.text().catch(() => '')
    const wasOk = resp.ok

    if (!wasOk) {
      console.error(`[cron/scan] scan-tenant returned ${resp.status} for ${tenant.tenantId}: ${text.slice(0, 200)}`)
    }

    return { tenantId: tenant.tenantId, dispatched: wasOk, status: resp.status }
  } catch (e: any) {
    // AbortError = worker took >290s (extremely unlikely given scan-tenant's own maxDuration)
    const isTimeout = e.name === 'AbortError' || e.name === 'TimeoutError'
    if (!isTimeout) {
      console.error(`[cron/scan] Dispatch error for ${tenant.tenantId}:`, e.message)
    }
    return {
      tenantId:   tenant.tenantId,
      dispatched: false,
      status:     isTimeout ? 408 : 0,
      error:      e.message,
    }
  }
}

// ── Main handler ───────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // Verify cron secret — Vercel injects this automatically for scheduled invocations
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const started = Date.now()
  console.log(`[cron/scan] Orchestrator starting at ${new Date().toISOString()}`)

  // ── 1. Fetch tenant list ──────────────────────────────────────────────────────
  const tenants = await getActiveTenants()
  console.log(`[cron/scan] Found ${tenants.length} active tenant(s) — dispatching in parallel`)

  if (tenants.length === 0) {
    return NextResponse.json({ ok: true, tenants: 0, message: 'No active tenants to scan.' })
  }

  // ── 2. Mark all tenants as scanning immediately ───────────────────────────────
  // The feed will show the amber "scanning" pill before any results arrive
  await Promise.allSettled(
    tenants.map(t =>
      upsertScanHealth(t.tenantId, {
        lastScanStatus: 'scanning',
        lastError:      '',
      })
    )
  )

  // ── 3. Dispatch all tenant scans in parallel ──────────────────────────────────
  // Each dispatch creates a fully independent Vercel serverless invocation.
  // The orchestrator waits for all responses (max ~150s) before returning.
  //
  // For very large tenant counts (>900), chunk to avoid HTTP concurrency limits.
  const appUrl    = (process.env.NEXTAUTH_URL || 'https://app.clientbloom.ai').replace(/\/$/, '')
  const workerUrl = `${appUrl}/api/cron/scan-tenant`

  const CHUNK_SIZE  = 900  // Vercel Pro concurrent invocation limit
  const allResults: { tenantId: string; dispatched: boolean; status: number; error?: string }[] = []

  for (let i = 0; i < tenants.length; i += CHUNK_SIZE) {
    const chunk = tenants.slice(i, i + CHUNK_SIZE)
    console.log(`[cron/scan] Dispatching chunk ${Math.floor(i / CHUNK_SIZE) + 1}: ${chunk.length} tenants`)

    // Each tenant gets a unique random stagger in [0, DISPATCH_JITTER_MAX_MS].
    // Using Math.random() per tenant (not index-based) ensures even distribution
    // even if a subset of the chunk fails fast and retries quickly.
    const settled = await Promise.allSettled(
      chunk.map(tenant =>
        dispatchTenantScan(workerUrl, cronSecret, tenant, Math.random() * DISPATCH_JITTER_MAX_MS)
      )
    )

    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        allResults.push(outcome.value)
      } else {
        console.error('[cron/scan] Unexpected dispatch rejection:', outcome.reason)
      }
    }
  }

  // ── 4. Summarise dispatch results ─────────────────────────────────────────────
  const dispatched  = allResults.filter(r => r.dispatched).length
  const failed      = allResults.filter(r => !r.dispatched)
  const elapsed     = ((Date.now() - started) / 1000).toFixed(1)

  if (failed.length > 0) {
    console.error(`[cron/scan] ${failed.length} worker dispatch(es) failed:`,
      failed.map(f => `${f.tenantId}:${f.status}`).join(', ')
    )
  }

  console.log(`[cron/scan] Orchestrator done in ${elapsed}s — dispatched ${dispatched}/${tenants.length} workers`)

  return NextResponse.json({
    ok:         true,
    tenants:    tenants.length,
    dispatched,
    failed:     failed.length > 0 ? failed.map(f => ({ tenantId: f.tenantId, status: f.status, error: f.error })) : undefined,
    elapsed:    `${elapsed}s`,
    note:       'Each tenant scan runs as an independent serverless function. Check individual worker logs for per-tenant results.',
  })
}
