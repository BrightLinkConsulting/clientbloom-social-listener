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
 *   plan?:    string    // used for scansPerDay enforcement
 * }
 *
 * Returns: scan result JSON (same shape as runScanForTenant output)
 */

import { NextRequest, NextResponse } from 'next/server'
import { runScanForTenant } from '@/lib/scan'
import { sendScanAlert }    from '@/lib/notify'
import { upsertScanHealth, getScanHealth } from '@/lib/scan-health'
import { getTierLimits }    from '@/lib/tier'

// Thin wrapper: reads only the consecutiveZeroScans field, fail-open.
async function getScanHealthForCounter(tenantId: string) {
  try { return await getScanHealth(tenantId) } catch { return null }
}

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
  let body: { tenantId?: string; email?: string; apifyKey?: string; plan?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { tenantId, email, apifyKey, plan } = body
  if (!tenantId || !email) {
    return NextResponse.json({ error: 'tenantId and email are required.' }, { status: 400 })
  }

  // ── scansPerDay enforcement ───────────────────────────────────────────────
  // Trial and Starter plans allow only 1 scan per day. The cron orchestrator runs
  // twice daily (6 AM + 6 PM), so we check Scan Health to skip the second run.
  if (plan) {
    const { scansPerDay } = getTierLimits(plan)
    if (scansPerDay <= 1) {
      try {
        const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN || ''
        const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
        if (PLATFORM_TOKEN && PLATFORM_BASE) {
          const shUrl = new URL(`https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent('Scan Health')}`)
          shUrl.searchParams.set('filterByFormula', `{Tenant ID}='${tenantId}'`)
          shUrl.searchParams.set('fields[]', 'Last Scan At')
          shUrl.searchParams.set('maxRecords', '1')
          const shResp = await fetch(shUrl.toString(), { headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` } })
          if (shResp.ok) {
            const shData   = await shResp.json()
            const lastScan = shData.records?.[0]?.fields?.['Last Scan At']
            if (lastScan) {
              const hoursSinceLast = (Date.now() - new Date(lastScan).getTime()) / (1000 * 60 * 60)
              if (hoursSinceLast < 12) {
                console.log(`[scan-tenant] Skipping ${tenantId} (${email}) — plan=${plan} scansPerDay=${scansPerDay}, last scan ${hoursSinceLast.toFixed(1)}h ago`)

                // IMPORTANT: clear the 'scanning' status that the orchestrator set before
                // dispatching this worker. Without this reset, the UI shows "Scanning…"
                // indefinitely until the next /api/scan-status poll cycle detects the
                // stale timestamp. 'success' is the correct status — the scan was
                // intentionally skipped because the plan quota is satisfied, not failed.
                await upsertScanHealth(tenantId, { lastScanStatus: 'success' })

                return NextResponse.json({
                  ok: true, tenantId, skipped: true,
                  reason: `Plan ${plan} allows ${scansPerDay} scan/day; last scan ${hoursSinceLast.toFixed(1)}h ago`,
                })
              }
            }
          }
        }
      } catch (e: any) {
        // Non-fatal — if we can't check, proceed with the scan rather than block it
        console.warn(`[scan-tenant] Could not check scan cooldown for ${tenantId}:`, e.message)
      }
    }
  }

  const started    = Date.now()
  const poolLabel  = apifyKey ? 'custom key' : 'shared pool'
  console.log(`[scan-tenant] Starting scan for ${tenantId} (${email}) — ${poolLabel} — plan=${plan || 'unknown'}`)

  // ── Read current health snapshot (for consecutive-zero counter) ─────────────
  // We need the current consecutiveZeroScans value BEFORE the scan so we can
  // increment or reset it. Fail-open: if we can't read health, counter starts at 0.
  const healthBefore = await getScanHealthForCounter(tenantId)

  // ── Run the scan ────────────────────────────────────────────────────────────
  const result  = await runScanForTenant(tenantId, apifyKey, plan || 'Trial')
  const elapsed = `${((Date.now() - started) / 1000).toFixed(1)}s`

  console.log(`[scan-tenant] ${email}: ${result.postsFound} posts saved, ${result.error || 'ok'} in ${elapsed}`)

  // ── Write scan health ───────────────────────────────────────────────────────
  const status = result.error
    ? 'failed'
    : result.scanned === 0
      ? 'no_results'
      : 'success'

  // ── Consecutive-zero counter (E3 + E4 from adversarial review) ─────────────
  // Only counts as a "zero" when:
  //   - no error (actor failure is tracked separately as 'failed')
  //   - scanned > 0 (actor returned results, but all were deduped/filtered/below threshold)
  //   - postsFound === 0 (genuinely no new posts saved)
  // Reset to 0 the moment postsFound > 0.
  // Does NOT fire when scanSource === 'none' with scanned=0 (that is an actor failure, not a zero-scan).
  const prevZeroCount = healthBefore?.consecutiveZeroScans ?? 0
  let consecutiveZeroScans: number
  if (result.error) {
    // Error path: preserve existing count — don't punish the user for actor failures
    consecutiveZeroScans = prevZeroCount
  } else if (result.postsFound > 0) {
    consecutiveZeroScans = 0
  } else if (result.scanned > 0) {
    // scanned>0 means actor fetched posts but all were deduped/below threshold
    consecutiveZeroScans = prevZeroCount + 1
    console.log(`[scan-tenant] ${tenantId}: consecutiveZeroScans → ${consecutiveZeroScans}`)
  } else {
    // scanned=0: actor returned nothing — preserve count (actor issue, not user data issue)
    consecutiveZeroScans = prevZeroCount
  }

  // ── Degraded flag (R4 sanity check result from scan.ts) ─────────────────────
  // lastScanDegraded = true when >30% of saved records had blank Post Text.
  // Separate from status — a scan can be 'success' (posts saved) AND degraded
  // (some fields missing due to actor schema shift).
  const lastScanDegraded = result.degraded === true

  // When scan succeeds but finds 0 new posts, store the breakdown JSON in lastError
  // so the frontend can explain WHY (too old / already seen / below threshold).
  // The breakdown is a plain JSON object starting with '{', which scan-health.ts
  // detects and parses — it is NOT shown as an error message to the user.
  const lastErrorField = result.error
    || (result.postsFound === 0 && result.breakdown
        ? JSON.stringify(result.breakdown)
        : '')

  await upsertScanHealth(tenantId, {
    lastScanAt:            new Date().toISOString(),
    lastScanStatus:        status,
    lastPostsFound:        result.postsFound,
    lastScanSource:        result.scanSource,
    lastError:             lastErrorField,
    lastScanDegraded,
    consecutiveZeroScans,
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
