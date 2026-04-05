/**
 * POST /api/webhooks/apify
 *
 * Apify calls this endpoint the moment an actor run finishes — success or failure.
 * This gives near-instant Facebook results without waiting for the scan-collect cron.
 *
 * Security: verified via ?secret=APIFY_WEBHOOK_SECRET query param.
 *           The tenantId is also passed as a query param when we start the run.
 *
 * To activate Apify webhooks:
 *   When starting an async Facebook run (via startApifyRunAsync in apify-async.ts),
 *   pass the webhook URL as:
 *     https://app.clientbloom.ai/api/webhooks/apify?tenantId=TENANT_ID&secret=WEBHOOK_SECRET
 *
 *   Set APIFY_WEBHOOK_SECRET in your Vercel environment variables (any strong random string).
 *
 * Payload Apify POSTs (configured in startApifyRunAsync):
 *   { eventType, runId, actorId, status, datasetId, itemCount, finishedAt }
 */

import { NextRequest, NextResponse } from 'next/server'
import { fetchApifyDataset } from '@/lib/apify-async'
import { normalizeFacebookPost, scorePosts, saveScoredPosts } from '@/lib/scan'
import { upsertScanHealth } from '@/lib/scan-health'
import { SHARED_BASE, PROV_TOKEN, tenantFilter } from '@/lib/airtable'

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

export async function POST(req: NextRequest) {
  // Verify webhook secret
  const webhookSecret = process.env.APIFY_WEBHOOK_SECRET || ''
  const { searchParams } = new URL(req.url)
  const incomingSecret = searchParams.get('secret') || ''
  const tenantId       = searchParams.get('tenantId') || ''

  if (webhookSecret && incomingSecret !== webhookSecret) {
    console.warn('[webhooks/apify] Invalid webhook secret')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!tenantId) {
    console.warn('[webhooks/apify] Missing tenantId in webhook URL')
    return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 })
  }

  let body: any = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { status, datasetId, runId, eventType } = body
  console.log(`[webhooks/apify] Received ${eventType} for run ${runId}, tenant ${tenantId}, status: ${status}`)

  // Handle failed/timed-out runs
  if (status !== 'SUCCEEDED') {
    await upsertScanHealth(tenantId, {
      lastScanStatus: 'failed',
      lastError:      `Apify run ${status}: ${runId}`,
      fbRunId:        '',
      fbDatasetId:    '',
    })
    console.log(`[webhooks/apify] Run ${runId} did not succeed (${status}) — marked as failed`)
    return NextResponse.json({ ok: true, processed: false, reason: `Run status: ${status}` })
  }

  // Run succeeded — fetch items and process
  if (!datasetId) {
    return NextResponse.json({ error: 'Missing datasetId in payload' }, { status: 400 })
  }

  const APIFY_TOKEN   = process.env.APIFY_API_TOKEN || ''
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ''

  const rawItems = await fetchApifyDataset(APIFY_TOKEN, datasetId)
  console.log(`[webhooks/apify] Fetched ${rawItems.length} items from dataset ${datasetId}`)

  let saved = 0
  if (rawItems.length > 0) {
    const normalized         = rawItems.map(normalizeFacebookPost)
    const { context, prompt} = await getBusinessContext(tenantId)
    const scored             = await scorePosts(ANTHROPIC_KEY, normalized, context, prompt)
    saved                    = await saveScoredPosts(tenantId, scored)
  }

  // Update scan health — clear pending FB run
  await upsertScanHealth(tenantId, {
    lastScanAt:     new Date().toISOString(),
    lastScanStatus: 'success',
    lastPostsFound: saved,
    lastScanSource: 'facebook_groups (webhook)',
    lastError:      '',
    fbRunId:        '',
    fbDatasetId:    '',
  })

  console.log(`[webhooks/apify] Tenant ${tenantId}: saved ${saved} posts via webhook`)
  return NextResponse.json({ ok: true, processed: true, saved })
}
