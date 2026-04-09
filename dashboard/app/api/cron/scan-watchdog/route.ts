/**
 * GET /api/cron/scan-watchdog
 *
 * Hourly self-healing watchdog — the safety net for Vercel cron unreliability.
 *
 * Vercel cron jobs are "best effort" HTTP calls. They can be silently skipped
 * when Vercel's scheduler infrastructure has issues. This watchdog runs every
 * hour and:
 *
 *   1. Resets tenants stuck in 'scanning' status for > STUCK_SCANNING_THRESHOLD_H
 *      (Vercel maxDuration = 300s, so any scan still "running" after 1h is stuck)
 *   2. Re-fires the scan orchestrator if ANY tenant's last scan is more than
 *      STALE_THRESHOLD_H old (14h — catches any single missed cron window)
 *   3. Sends a Slack + email alert when recovery fires
 *
 * ── Why 1h for stuck-scanning detection? ─────────────────────────────────────
 * scan-tenant has maxDuration = 300s (5 min). A scan that appears to still be
 * running after 1h has definitely completed — the status write just failed silently
 * (upsertScanHealth swallows exceptions for graceful degradation). The watchdog
 * resets these to 'failed' so the UI clears and the stale check can recover them.
 *
 * ── Why 14h for stale detection? ─────────────────────────────────────────────
 * Normal scan interval = 12h (6 AM + 6 PM PDT).
 * 14h = 12h interval + 2h grace period before we declare a scan missed.
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

export const maxDuration = 60   // Just needs to read health + patch records + fire orchestrator

const PLATFORM_TOKEN          = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE           = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const STALE_THRESHOLD_H       = 14  // hours since last scan before we consider it missed
const STUCK_SCANNING_THRESHOLD_H = 1   // hours a scan can appear "in progress" before it's stuck

interface TenantHealth {
  recordId:   string
  tenantId:   string
  lastScanAt: string | null
  status:     string | null
}

// ── Fetch all tenant scan health records ─────────────────────────────────────
async function getAllTenantHealth(): Promise<TenantHealth[]> {
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
    return (data.records || []).map((r: any) => ({
      recordId:   r.id,
      tenantId:   (r.fields['Tenant ID']       || '').trim(),
      lastScanAt: r.fields['Last Scan At']     || null,
      status:     r.fields['Last Scan Status'] || null,
    })).filter((t: TenantHealth) => !!t.tenantId)
  } catch (e: any) {
    console.error('[scan-watchdog] Error fetching scan health:', e.message)
    return []
  }
}

// ── Reset a stuck tenant's scan status directly via Airtable PATCH ───────────
async function resetStuckScanStatus(tenant: TenantHealth): Promise<void> {
  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent('Scan Health')}/${tenant.recordId}`,
      {
        method:  'PATCH',
        headers: {
          Authorization: `Bearer ${PLATFORM_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: {
            'Last Scan Status': 'failed',
            'Last Error':       'stuck-scanning: scan status reset by watchdog',
          },
        }),
      }
    )
    if (!res.ok) {
      console.error(`[scan-watchdog] Failed to reset stuck status for ${tenant.tenantId}: ${res.status}`)
    } else {
      console.log(`[scan-watchdog] Reset stuck 'scanning' status for ${tenant.tenantId}`)
    }
  } catch (e: any) {
    console.error(`[scan-watchdog] Exception resetting stuck status for ${tenant.tenantId}:`, e.message)
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

  // ── 1. Fetch all health records ───────────────────────────────────────────
  const allTenants = await getAllTenantHealth()

  const stuckThresholdMs = STUCK_SCANNING_THRESHOLD_H * 60 * 60 * 1000
  const staleThresholdMs = STALE_THRESHOLD_H * 60 * 60 * 1000
  const nowMs            = Date.now()

  // ── 2. Identify stuck-scanning tenants ───────────────────────────────────
  // A tenant is "stuck scanning" if status='scanning' AND the scan has been
  // running for more than STUCK_SCANNING_THRESHOLD_H. Since Vercel maxDuration
  // for scan-tenant is 300s, a scan still showing as 'scanning' after 1h is
  // definitely complete — the status write failed silently.
  //
  // We approximate "scan start time" using lastScanAt (the previous completed
  // scan's timestamp). If the previous scan is > 1h old AND status is 'scanning',
  // the current scan is stuck. Tenants with no lastScanAt at all that show
  // 'scanning' are also stuck (very first scan never wrote its final status).
  const stuckTenants = allTenants.filter(t => {
    if (t.status !== 'scanning') return false
    if (!t.lastScanAt) return true  // Never had a successful scan but showing 'scanning'
    const lastScanAge = nowMs - new Date(t.lastScanAt).getTime()
    return lastScanAge > stuckThresholdMs
  })

  // ── 3. Reset stuck tenants ────────────────────────────────────────────────
  if (stuckTenants.length > 0) {
    console.warn(
      `[scan-watchdog] ${stuckTenants.length} stuck-scanning tenant(s) detected — resetting.`,
      stuckTenants.map(t => `${t.tenantId} (last: ${t.lastScanAt || 'never'})`).join(', ')
    )
    await Promise.all(stuckTenants.map(t => resetStuckScanStatus(t)))
  }

  // ── 4. Check for stale tenants ────────────────────────────────────────────
  // After resetting stuck tenants, check all non-scanning tenants for staleness.
  // Tenants just reset from 'scanning' are treated as having 'failed' status —
  // they'll be stale if lastScanAt is old enough, triggering the orchestrator.
  const effectiveStatuses = new Map(stuckTenants.map(t => [t.tenantId, 'failed']))

  const staleTenants = allTenants.filter(t => {
    const effectiveStatus = effectiveStatuses.get(t.tenantId) ?? t.status
    // Skip tenants actively mid-scan (were not stuck)
    if (effectiveStatus === 'scanning') return false
    // Stale = never scanned OR last scan older than threshold
    if (!t.lastScanAt) return true
    return nowMs - new Date(t.lastScanAt).getTime() > staleThresholdMs
  })

  if (staleTenants.length === 0 && stuckTenants.length === 0) {
    console.log('[scan-watchdog] All tenants healthy — nothing to do.')
    return NextResponse.json({ ok: true, stuck: 0, stale: 0, triggered: false })
  }

  if (staleTenants.length === 0) {
    // Only had stuck tenants — already reset, no need to trigger orchestrator
    console.log(`[scan-watchdog] Reset ${stuckTenants.length} stuck tenant(s); no stale tenants to recover.`)
    return NextResponse.json({
      ok:      true,
      stuck:   stuckTenants.length,
      stale:   0,
      triggered: false,
      stuckTenants: stuckTenants.map(t => ({ tenantId: t.tenantId, lastScanAt: t.lastScanAt })),
    })
  }

  // ── 5. Fire the scan orchestrator for stale tenants ───────────────────────
  console.warn(
    `[scan-watchdog] ${staleTenants.length} STALE tenant(s) detected — triggering recovery scan.`,
    staleTenants.map(t => `${t.tenantId} (last: ${t.lastScanAt || 'never'})`).join(', ')
  )

  const triggered = await triggerScanOrchestrator(cronSecret)

  // ── 6. Send alert ─────────────────────────────────────────────────────────
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
    stuck:      stuckTenants.length,
    stale:      staleTenants.length,
    triggered,
    stuckTenants: stuckTenants.map(t => ({ tenantId: t.tenantId, lastScanAt: t.lastScanAt })),
    staleTenants: staleTenants.map(t => ({
      tenantId:   t.tenantId,
      lastScanAt: t.lastScanAt,
      status:     t.status,
    })),
  })
}
