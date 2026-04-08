/**
 * GET /api/cron/scan-watchdog
 *
 * Hourly self-healing watchdog — the safety net for Vercel cron unreliability.
 *
 * Vercel cron jobs are "best effort" HTTP calls. They can be silently skipped
 * when Vercel's scheduler infrastructure has issues. This watchdog runs every
 * hour and re-fires the scan orchestrator if ANY tenant's last scan is
 * more than STALE_THRESHOLD_HOURS old (currently 14h — safely above the 12h
 * normal interval, but short enough to catch any single missed window).
 *
 * ── What it does ─────────────────────────────────────────────────────────────
 * 1. Reads all tenant Scan Health records
 * 2. Finds tenants whose last successful scan is older than 14h
 *    (skips tenants currently mid-scan)
 * 3. Triggers /api/cron/scan (the normal orchestrator) to re-run all tenants
 * 4. Sends a Slack + email alert so the team knows a recovery happened
 *
 * ── Why 14h? ─────────────────────────────────────────────────────────────────
 * Normal scan interval = 12h (6 AM + 6 PM PDT).
 * 14h = 12h interval + 2h grace period before we declare a scan missed.
 * This means: if the 6 AM scan fires 2h late or misses, the watchdog catches
 * it by 8 AM at the latest (one hourly cycle after the grace period).
 *
 * ── Schedule ─────────────────────────────────────────────────────────────────
 * vercel.json: { "path": "/api/cron/scan-watchdog", "schedule": "0 * * * *" }
 * = top of every hour, UTC
 *
 * ── Protected by CRON_SECRET ─────────────────────────────────────────────────
 * Same secret as all other cron routes.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sendMissedScanAlert }       from '@/lib/notify'

export const maxDuration = 60   // Just needs to read health + fire orchestrator

const PLATFORM_TOKEN     = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE      = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const STALE_THRESHOLD_H  = 14  // hours since last scan before we consider it missed

// ── Fetch all tenant scan health records ─────────────────────────────────────
async function getStaleTenants(): Promise<
  { tenantId: string; lastScanAt: string | null; status: string | null }[]
> {
  if (!PLATFORM_TOKEN || !PLATFORM_BASE) {
    console.error('[scan-watchdog] PLATFORM_AIRTABLE_TOKEN or PLATFORM_AIRTABLE_BASE_ID not set')
    return []
  }

  try {
    const url = new URL(
      `https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent('Scan Health')}`
    )
    url.searchParams.set('pageSize', '100')
    url.searchParams.set('fields[]', 'Tenant ID')
    url.searchParams.append('fields[]', 'Last Scan At')
    url.searchParams.append('fields[]', 'Last Scan Status')

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
    })
    if (!res.ok) {
      console.error(`[scan-watchdog] Failed to read Scan Health: ${res.status}`)
      return []
    }

    const data = await res.json()
    const staleThreshold = Date.now() - STALE_THRESHOLD_H * 60 * 60 * 1000

    return (data.records || [])
      .map((r: any) => ({
        tenantId:   (r.fields['Tenant ID']      || '').trim(),
        lastScanAt: r.fields['Last Scan At']    || null,
        status:     r.fields['Last Scan Status'] || null,
      }))
      .filter((t: { tenantId: string; lastScanAt: string | null; status: string | null }) => {
        if (!t.tenantId) return false
        // Skip tenants actively mid-scan — they're fine
        if (t.status === 'scanning') return false
        // Stale = never scanned OR last scan older than threshold
        if (!t.lastScanAt) return true
        return new Date(t.lastScanAt).getTime() < staleThreshold
      })
  } catch (e: any) {
    console.error('[scan-watchdog] Error fetching scan health:', e.message)
    return []
  }
}

// ── Kick the scan orchestrator ────────────────────────────────────────────────
async function triggerScanOrchestrator(cronSecret: string): Promise<boolean> {
  const appUrl  = (process.env.NEXTAUTH_URL || 'https://scout.clientbloom.ai').replace(/\/$/, '')
  const scanUrl = `${appUrl}/api/cron/scan`

  try {
    // Fire-and-forget with a short connection timeout.
    // The orchestrator itself runs for up to 300s — we don't need to wait.
    const res = await fetch(scanUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${cronSecret}` },
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[scan-watchdog] Scan trigger returned ${res.status}: ${text.slice(0, 150)}`)
      return false
    }
    return true
  } catch (e: any) {
    // AbortError = timed out after 8s — that's expected because the orchestrator
    // takes ~150s to complete. A connection timeout here does NOT mean it failed;
    // it means Vercel accepted the invocation and it's running.
    const isExpectedTimeout = e.name === 'AbortError' || e.name === 'TimeoutError'
    if (!isExpectedTimeout) {
      console.error('[scan-watchdog] Failed to trigger scan orchestrator:', e.message)
      return false
    }
    // Treat connection timeout as success — the function was invoked
    return true
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const now = new Date().toISOString()
  console.log(`[scan-watchdog] Running at ${now}`)

  // ── 1. Check for stale tenants ────────────────────────────────────────────
  const staleTenants = await getStaleTenants()

  if (staleTenants.length === 0) {
    console.log('[scan-watchdog] All tenants have recent scans — nothing to do.')
    return NextResponse.json({ ok: true, stale: 0, triggered: false })
  }

  // ── 2. Fire the scan orchestrator ────────────────────────────────────────
  console.warn(
    `[scan-watchdog] ${staleTenants.length} STALE tenant(s) detected — triggering recovery scan.`,
    staleTenants.map(t => `${t.tenantId} (last: ${t.lastScanAt || 'never'})`).join(', ')
  )

  const triggered = await triggerScanOrchestrator(cronSecret)

  // ── 3. Send alert ─────────────────────────────────────────────────────────
  await sendMissedScanAlert({
    staleTenants: staleTenants.map(t => ({
      tenantId:   t.tenantId,
      lastScanAt: t.lastScanAt,
      status:     t.status || 'unknown',
    })),
    triggered,
    detectedAt: now,
  })

  return NextResponse.json({
    ok:         true,
    stale:      staleTenants.length,
    triggered,
    tenants:    staleTenants.map(t => ({
      tenantId:   t.tenantId,
      lastScanAt: t.lastScanAt,
      status:     t.status,
    })),
  })
}
