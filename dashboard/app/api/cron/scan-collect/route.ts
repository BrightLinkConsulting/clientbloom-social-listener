/**
 * GET /api/cron/scan-collect
 *
 * Safety-net cron — fires 15 minutes after each main scan.
 * Its job: collect any Facebook runs that the main scan started asynchronously
 * (because sync attempts failed) and hadn't yet been collected by the webhook.
 *
 * Schedule (vercel.json):
 *   6:15 AM PDT  → "15 13 * * *" UTC
 *   6:15 PM PDT  → "15 1 * * *" UTC
 *
 * This means: even if Apify's webhook call to us fails (network hiccup, cold
 * start, etc.), Facebook results will still land in the feed within 15 minutes.
 * Tenants never miss a scan because of webhook delivery issues.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPendingFbRuns, upsertScanHealth } from '@/lib/scan-health'
import { getApifyRunStatus, fetchApifyDataset } from '@/lib/apify-async'
import { normalizeFacebookPost, scorePosts, saveScoredPosts } from '@/lib/scan'
import { SHARED_BASE, PROV_TOKEN, tenantFilter } from '@/lib/airtable'

// 120s max: collects multiple tenants' Facebook results sequentially
export const maxDuration = 120

async function getBusinessContext(tenantId: string): Promise<{ context: string; prompt: string }> {
  try {
    const formula = tenantFilter(tenantId)
    const url = new URL(`https://api.airtable.com/v0/${SHARED_BASE}/${encodeURIComponent('Business Profile')}`)
    url.searchParams.set('filterByFormula', formula)
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${PROV_TOKEN}` },
    })
    if (!res.ok) return { context: '', prompt: '' }
    const data = await res.json()
    const profile = data.records?.[0]?.fields || {}
    const context = [
      profile['Business Name'] && `Business: ${profile['Business Name']}`,
      profile['Industry']      && `Industry: ${profile['Industry']}`,
      profile['Ideal Client']  && `Ideal client: ${profile['Ideal Client']}`,
      profile['Problem Solved']&& `We solve: ${profile['Problem Solved']}`,
      profile['Signal Types']  && `Looking for: ${profile['Signal Types']}`,
    ].filter(Boolean).join('\n')
    return { context, prompt: (profile['Scoring Prompt'] || '').trim() }
  } catch {
    return { context: '', prompt: '' }
  }
}

export async function GET(req: NextRequest) {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET || ''
  if (cronSecret) {
    const authHeader = req.headers.get('authorization') || ''
    if (authHeader.replace('Bearer ', '') !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const APIFY_TOKEN   = process.env.APIFY_API_TOKEN || ''
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ''

  console.log(`[scan-collect] Starting collection run at ${new Date().toISOString()}`)

  // Find all tenants with pending async Facebook runs
  const pendingRuns = await getPendingFbRuns()
  console.log(`[scan-collect] Found ${pendingRuns.length} pending Facebook run(s)`)

  if (pendingRuns.length === 0) {
    return NextResponse.json({ ok: true, message: 'No pending Facebook runs to collect.' })
  }

  const results = []

  for (const run of pendingRuns) {
    console.log(`[scan-collect] Checking run ${run.fbRunId} for tenant ${run.tenantId}`)

    // Use tenant's own Apify key if stored in health record (future enhancement)
    const token = APIFY_TOKEN

    const status = await getApifyRunStatus(token, run.fbRunId)
    console.log(`[scan-collect] Run ${run.fbRunId} status: ${status}`)

    if (status === 'RUNNING' || status === 'READY') {
      // Still in progress — leave as pending, next collect cycle will check again
      results.push({ tenantId: run.tenantId, status: 'still_running' })
      continue
    }

    if (status === 'FAILED' || status === 'TIMED-OUT' || status === 'ABORTED' || !status) {
      // The async run itself failed — mark as failed
      await upsertScanHealth(run.tenantId, {
        lastScanStatus: 'failed',
        lastError:      `Async FB run ${status || 'unknown'}: ${run.fbRunId}`,
        fbRunId:        '',
        fbDatasetId:    '',
      })
      results.push({ tenantId: run.tenantId, status: 'failed', runStatus: status })
      continue
    }

    if (status === 'SUCCEEDED') {
      // Fetch items from the dataset
      const rawItems = await fetchApifyDataset(token, run.fbDatasetId)
      console.log(`[scan-collect] Run ${run.fbRunId} succeeded — ${rawItems.length} items in dataset`)

      const normalized = rawItems.map(normalizeFacebookPost)

      // Get keywords for this tenant to filter posts
      // (simplified: we'll score all and let the AI decide — keywords filtering
      //  already happened inside the actor via maxPosts on the right groups)
      let saved = 0
      if (normalized.length > 0) {
        const { context, prompt } = await getBusinessContext(run.tenantId)
        const scored = await scorePosts(ANTHROPIC_KEY, normalized, context, prompt)
        saved = await saveScoredPosts(run.tenantId, scored)
      }

      await upsertScanHealth(run.tenantId, {
        lastScanAt:     new Date().toISOString(),
        lastScanStatus: 'success',
        lastPostsFound: saved,
        lastScanSource: 'facebook_groups (async)',
        lastError:      '',
        fbRunId:        '',
        fbDatasetId:    '',
      })

      console.log(`[scan-collect] Tenant ${run.tenantId}: saved ${saved} posts from async Facebook run`)
      results.push({ tenantId: run.tenantId, status: 'collected', saved })
    }
  }

  return NextResponse.json({
    ok:      true,
    checked: pendingRuns.length,
    results,
  })
}
