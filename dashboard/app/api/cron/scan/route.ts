/**
 * GET /api/cron/scan
 *
 * Vercel cron job — fires at 6 AM and 6 PM PDT every day.
 * Iterates every Active tenant and runs a LinkedIn scan for each.
 *
 * Protected by CRON_SECRET env var. Vercel automatically sends
 * Authorization: Bearer <CRON_SECRET> when invoking cron routes.
 */

import { NextRequest, NextResponse } from 'next/server'
import { runScanForTenant } from '@/lib/scan'
import { sendScanAlert } from '@/lib/notify'

// 300s max: cron may run multiple tenants sequentially; each scan ~30-40s
export const maxDuration = 300

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''

async function getActiveTenants(): Promise<{ id: string; tenantId: string; email: string; apifyKey?: string }[]> {
  const url = new URL(
    `https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent('Tenants')}`
  )
  url.searchParams.set('filterByFormula', `{Status}='Active'`)
  url.searchParams.set('fields[]', 'Tenant ID')
  url.searchParams.append('fields[]', 'Email')
  url.searchParams.append('fields[]', 'Apify API Key')  // per-tenant key for account isolation
  url.searchParams.set('pageSize', '100')

  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
  })
  if (!resp.ok) return []
  const data = await resp.json()
  return (data.records || []).map((r: any) => ({
    id:       r.id,
    tenantId: r.fields['Tenant ID']    || 'owner',
    email:    r.fields['Email']        || '',
    apifyKey: r.fields['Apify API Key'] || undefined,
  }))
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

  // Run scans sequentially to avoid hammering Apify rate limits
  const results = []
  for (const tenant of tenants) {
    const tenantStart = Date.now()
    const poolLabel = tenant.apifyKey ? 'custom key' : 'shared pool'
    console.log(`[cron/scan] Scanning tenant ${tenant.tenantId} (${tenant.email}) — ${poolLabel}`)
    const result = await runScanForTenant(tenant.tenantId, tenant.apifyKey)
    results.push(result)
    console.log(`[cron/scan] ${tenant.email}: ${result.postsFound} posts saved, ${result.error || 'ok'}`)

    // Alert when the scan pipeline itself produced nothing or errored.
    // We do NOT alert when posts were scanned but scored below threshold —
    // that is normal filtering behavior, not a signal of breakage.
    if (result.error || result.scanned === 0) {
      await sendScanAlert({
        tenantId:   tenant.tenantId,
        email:      tenant.email,
        error:      result.error,
        scanned:    result.scanned,
        scanSource: result.scanSource,
        elapsed:    `${((Date.now() - tenantStart) / 1000).toFixed(1)}s`,
      })
    }
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
