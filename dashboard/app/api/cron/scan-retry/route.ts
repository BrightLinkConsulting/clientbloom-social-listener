/**
 * GET /api/cron/scan-retry
 *
 * Safety-net cron — fires 20 minutes after each main scan.
 * Reruns the full LinkedIn scan for any tenant whose last scan
 * produced 0 posts (failed, no_results, or scanning status).
 *
 * Schedule (vercel.json):
 *   6:20 AM PDT  → "20 13 * * *" UTC
 *   6:20 PM PDT  → "20 1 * * *" UTC
 */

import { NextRequest, NextResponse } from 'next/server'
import { runScanForTenant }  from '@/lib/scan'
import { upsertScanHealth }  from '@/lib/scan-health'
import { sendScanAlert }     from '@/lib/notify'

export const maxDuration = 300

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''

async function getFailedTenants(): Promise<{
  tenantId: string
  email:    string
  apifyKey?: string
}[]> {
  // Read Scan Health records with status failed or no_results (set within last 30 min)
  // and cross-reference with active Tenants for their Apify key
  try {
    const shUrl = new URL(
      `https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent('Scan Health')}`
    )
    shUrl.searchParams.set(
      'filterByFormula',
      `OR({Last Scan Status}='failed',{Last Scan Status}='no_results',{Last Scan Status}='scanning')`
    )
    shUrl.searchParams.set('pageSize', '50')

    const shRes = await fetch(shUrl.toString(), {
      headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
    })
    if (!shRes.ok) return []

    const shData   = await shRes.json()
    const records  = shData.records || []

    if (!records.length) return []

    // Filter to records updated within the last 30 minutes
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const recentlyFailed = records.filter((r: any) => {
      const scanAt = r.fields['Last Scan At'] || ''
      return !scanAt || scanAt > thirtyMinAgo
    })

    if (!recentlyFailed.length) return []

    // Get tenant details for the failed ones
    const tenantIds = recentlyFailed.map((r: any) => r.fields['Tenant ID']).filter(Boolean)
    const formula   = `AND({Status}='Active',OR(${tenantIds.map((id: string) => `{Tenant ID}='${id}'`).join(',')}))`

    const tUrl = new URL(
      `https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent('Tenants')}`
    )
    tUrl.searchParams.set('filterByFormula', formula)
    tUrl.searchParams.set('fields[]', 'Tenant ID')
    tUrl.searchParams.append('fields[]', 'Email')
    tUrl.searchParams.append('fields[]', 'Apify API Key')
    tUrl.searchParams.set('pageSize', '50')

    const tRes = await fetch(tUrl.toString(), {
      headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
    })
    if (!tRes.ok) return []

    const tData = await tRes.json()
    return (tData.records || []).map((r: any) => ({
      tenantId: r.fields['Tenant ID']     || '',
      email:    r.fields['Email']         || '',
      apifyKey: r.fields['Apify API Key'] || undefined,
    })).filter((t: any) => t.tenantId)
  } catch (e: any) {
    console.error('[scan-retry] Error fetching failed tenants:', e.message)
    return []
  }
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  console.log(`[scan-retry] Starting retry pass at ${new Date().toISOString()}`)

  const failedTenants = await getFailedTenants()
  console.log(`[scan-retry] ${failedTenants.length} tenant(s) need a retry`)

  if (failedTenants.length === 0) {
    return NextResponse.json({ ok: true, retried: 0, message: 'All tenants scanned successfully — no retries needed.' })
  }

  // Retry all failed tenants in PARALLEL — same pattern as the main scan orchestrator
  async function retryTenant(tenant: { tenantId: string; email: string; apifyKey?: string }) {
    console.log(`[scan-retry] Retrying scan for tenant ${tenant.tenantId} (${tenant.email})`)

    const result = await runScanForTenant(tenant.tenantId, tenant.apifyKey)

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

    if (result.error || result.scanned === 0) {
      await sendScanAlert({
        tenantId:   tenant.tenantId,
        email:      tenant.email,
        error:      `[RETRY ALSO FAILED] ${result.error || 'No posts scraped'}`,
        scanned:    result.scanned,
        scanSource: result.scanSource,
        elapsed:    '',
      })
    }

    console.log(`[scan-retry] ${tenant.email}: ${result.postsFound} posts — ${result.error || 'ok'}`)
    return result
  }

  const settled = await Promise.allSettled(failedTenants.map(retryTenant))
  const results = settled.map(s => s.status === 'fulfilled' ? s.value : { error: String((s as any).reason), postsFound: 0, scanned: 0 })

  return NextResponse.json({
    ok:      true,
    retried: failedTenants.length,
    results,
  })
}

