/**
 * GET /api/cron/scan
 *
 * Vercel cron job — fires at 6 AM and 6 PM PDT every day.
 * Iterates every Active tenant and runs LinkedIn + Facebook scans for each.
 *
 * Protected by CRON_SECRET env var. Vercel automatically sends
 * Authorization: Bearer <CRON_SECRET> when invoking cron routes.
 *
 * Reliability layers built into this route:
 *   1. runScanForTenant() already retries each actor up to 2× with progressive
 *      memory scaling before giving up (see lib/scan.ts).
 *   2. If Facebook sync fails after both attempts, this route starts an async
 *      Apify run and stores the pending run ID in Scan Health (Airtable).
 *   3. /api/webhooks/apify collects Facebook results the instant they're ready.
 *   4. /api/cron/scan-collect (runs 15 min later) collects any webhook misses.
 *   5. /api/cron/scan-retry (runs 20 min later) reruns tenants that had 0 results.
 */

import { NextRequest, NextResponse } from 'next/server'
import { runScanForTenant }         from '@/lib/scan'
import { sendScanAlert }            from '@/lib/notify'
import { upsertScanHealth }         from '@/lib/scan-health'
import { startApifyRunAsync }       from '@/lib/apify-async'
import { tenantFilter }             from '@/lib/airtable'

// 300s max: cron may run multiple tenants sequentially; each scan can take up
// to ~150s (LinkedIn 60s + Facebook 90s) with retries, so 300s = 2 tenants max.
// Scale to async architecture if tenant count grows beyond 2.
export const maxDuration = 300

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''

async function getActiveTenants(): Promise<{
  id:       string
  tenantId: string
  email:    string
  apifyKey?: string
}[]> {
  const url = new URL(
    `https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent('Tenants')}`
  )
  url.searchParams.set('filterByFormula', `AND({Status}='Active',{Is Feed Only}!=1)`)
  url.searchParams.set('fields[]', 'Tenant ID')
  url.searchParams.append('fields[]', 'Email')
  url.searchParams.append('fields[]', 'Apify API Key')
  url.searchParams.set('pageSize', '100')

  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
  })
  if (!resp.ok) return []
  const data = await resp.json()
  return (data.records || []).map((r: any) => ({
    id:       r.id,
    tenantId: r.fields['Tenant ID']     || 'owner',
    email:    r.fields['Email']         || '',
    apifyKey: r.fields['Apify API Key'] || undefined,
  }))
}

// Get Facebook group URLs for a tenant (used for async fallback start)
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

export async function GET(req: NextRequest) {
  // Verify the cron secret so only Vercel (or you) can trigger this
  const cronSecret = process.env.CRON_SECRET || ''
  if (cronSecret) {
    const authHeader = req.headers.get('authorization') || ''
    const token      = authHeader.replace('Bearer ', '')
    if (token !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const started = Date.now()
  console.log(`[cron/scan] Starting scheduled scan at ${new Date().toISOString()}`)

  const tenants = await getActiveTenants()
  console.log(`[cron/scan] Found ${tenants.length} active tenant(s)`)

  if (tenants.length === 0) {
    return NextResponse.json({ ok: true, tenants: 0, message: 'No active tenants to scan.' })
  }

  // Mark all tenants as scan-in-progress immediately so the feed can show it
  await Promise.all(
    tenants.map(t =>
      upsertScanHealth(t.tenantId, {
        lastScanStatus: 'scanning',
        lastError: '',
      })
    )
  )

  const results = []

  for (const tenant of tenants) {
    const tenantStart = Date.now()
    const poolLabel = tenant.apifyKey ? 'custom key' : 'shared pool'
    console.log(`[cron/scan] Scanning tenant ${tenant.tenantId} (${tenant.email}) — ${poolLabel}`)

    const result = await runScanForTenant(tenant.tenantId, tenant.apifyKey)
    const elapsed = `${((Date.now() - tenantStart) / 1000).toFixed(1)}s`

    console.log(`[cron/scan] ${tenant.email}: ${result.postsFound} posts saved, ${result.error || 'ok'} in ${elapsed}`)

    // ── Async Facebook fallback ─────────────────────────────────────────────
    // If the sync scan completed but scanned 0 posts AND Facebook groups are
    // configured, start an async Facebook run. The webhook / scan-collect will
    // pick up the results when Apify finishes (could be 1-5 min).
    let fbPendingRunId = ''
    const APIFY_TOKEN = tenant.apifyKey || process.env.APIFY_API_TOKEN || ''

    if (result.scanned === 0 && APIFY_TOKEN) {
      const fbGroups = await getFacebookGroupUrls(tenant.tenantId)
      if (fbGroups.length > 0) {
        console.log(`[cron/scan] Starting async Facebook fallback for ${tenant.tenantId}`)

        const webhookSecret = process.env.APIFY_WEBHOOK_SECRET || ''
        const appUrl        = process.env.NEXTAUTH_URL || 'https://app.clientbloom.ai'
        const webhookUrl    = webhookSecret
          ? `${appUrl}/api/webhooks/apify?tenantId=${tenant.tenantId}&secret=${webhookSecret}`
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
          1024,        // 1 GB — give Apify plenty of headroom on async run
          webhookUrl,
        )

        if (handle) {
          fbPendingRunId = handle.runId
          await upsertScanHealth(tenant.tenantId, {
            lastScanStatus: 'pending_fb',
            lastScanAt:     new Date().toISOString(),
            fbRunId:        handle.runId,
            fbDatasetId:    handle.datasetId,
            fbRunAt:        new Date().toISOString(),
            lastError:      '',
          })
          console.log(`[cron/scan] Async Facebook run started: ${handle.runId}`)
        }
      }
    }

    // ── Write final scan health ────────────────────────────────────────────
    if (!fbPendingRunId) {
      const status = result.error
        ? 'failed'
        : result.scanned === 0
          ? 'no_results'
          : 'success'

      await upsertScanHealth(tenant.tenantId, {
        lastScanAt:     new Date().toISOString(),
        lastScanStatus: status,
        lastPostsFound: result.postsFound,
        lastScanSource: result.scanSource,
        lastError:      result.error || '',
      })
    }

    // ── Alert on scan failure ───────────────────────────────────────────────
    // Alert when the scan produced nothing AND no async fallback was started.
    if ((result.error || result.scanned === 0) && !fbPendingRunId) {
      await sendScanAlert({
        tenantId:   tenant.tenantId,
        email:      tenant.email,
        error:      result.error,
        scanned:    result.scanned,
        scanSource: result.scanSource,
        elapsed,
      })
    }

    results.push({ ...result, fbPendingRunId: fbPendingRunId || undefined, elapsed })
  }

  const totalFound   = results.reduce((sum, r) => sum + r.postsFound, 0)
  const totalScanned = results.reduce((sum, r) => sum + r.scanned, 0)
  const errors       = results.filter(r => r.error).map(r => ({ tenantId: r.tenantId, error: r.error }))
  const elapsed      = ((Date.now() - started) / 1000).toFixed(1)

  console.log(`[cron/scan] Done in ${elapsed}s — ${totalFound} posts saved across ${tenants.length} tenants`)

  return NextResponse.json({
    ok:           true,
    tenants:      tenants.length,
    totalFound,
    totalScanned,
    elapsed:      `${elapsed}s`,
    errors:       errors.length ? errors : undefined,
    results,
  })
}
