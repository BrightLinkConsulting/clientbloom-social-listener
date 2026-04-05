/**
 * lib/apify-async.ts
 *
 * Helpers for the async Apify pattern used by Scout's reliability layer.
 *
 * Instead of calling Apify synchronously (start → wait → get results),
 * these helpers let us:
 *   1. Start an actor run and immediately get a run ID (fire-and-forget)
 *   2. Check a run's status later
 *   3. Fetch the resulting dataset items once the run succeeds
 *
 * This powers:
 *   - The async Facebook fallback in /api/cron/scan (if sync attempts fail)
 *   - /api/cron/scan-collect (collects results 15 min later)
 *   - /api/webhooks/apify (collects results the instant Apify finishes)
 *
 * Apify run lifecycle:
 *   READY → RUNNING → SUCCEEDED | FAILED | TIMED-OUT | ABORTED
 */

export type ApifyRunStatus =
  | 'READY'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'TIMED-OUT'
  | 'ABORTED'

export interface AsyncRunHandle {
  runId:     string
  datasetId: string
  actorId:   string
}

// ── Start a run without waiting ───────────────────────────────────────────────
// Returns a handle containing the runId and defaultDatasetId.
// webhookUrl (optional): Apify will POST to this URL when the run finishes.
//   Include ?secret=XXX&tenantId=YYY in the URL for verification.
export async function startApifyRunAsync(
  apifyToken: string,
  actorId: string,
  input: object,
  memoryMbytes = 512,
  webhookUrl?: string,
  tenantTag?: string,          // tenantId — stored as run tag for per-tenant cost attribution
): Promise<AsyncRunHandle | null> {
  const safeActorId = actorId.replace('/', '~')
  // Encode tenantId as a run tag so we can later query /v2/actor-runs?tag=<tenantId>
  const tagParam = tenantTag ? `&tag=${encodeURIComponent(tenantTag)}` : ''
  const url = `https://api.apify.com/v2/acts/${safeActorId}/runs?token=${apifyToken}&memory=${memoryMbytes}${tagParam}`

  const body: any = { ...input }

  // Configure webhook so Apify calls us immediately on completion
  if (webhookUrl) {
    body.webhooks = [
      {
        eventTypes: ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED', 'ACTOR.RUN.TIMED_OUT', 'ACTOR.RUN.ABORTED'],
        requestUrl: webhookUrl,
        payloadTemplate: JSON.stringify({
          eventType:    '{{eventType}}',
          runId:        '{{resource.id}}',
          actorId:      '{{resource.actId}}',
          status:       '{{resource.status}}',
          datasetId:    '{{resource.defaultDatasetId}}',
          itemCount:    '{{resource.stats.itemCount}}',
          finishedAt:   '{{resource.finishedAt}}',
        }),
      },
    ]
  }

  let res: Response
  try {
    res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
  } catch (err: any) {
    console.error(`[apify-async] Network error starting ${actorId}:`, err.message)
    return null
  }

  if (!res.ok) {
    let errText = ''
    try { errText = await res.text() } catch {}
    console.error(`[apify-async] HTTP ${res.status} starting ${actorId}: ${errText.slice(0, 200)}`)
    return null
  }

  try {
    const data = await res.json()
    const run = data.data || data
    return {
      runId:     run.id,
      datasetId: run.defaultDatasetId,
      actorId,
    }
  } catch (err: any) {
    console.error(`[apify-async] JSON parse error for ${actorId}:`, err.message)
    return null
  }
}

// ── Check run status ──────────────────────────────────────────────────────────
export async function getApifyRunStatus(
  apifyToken: string,
  runId: string,
): Promise<ApifyRunStatus | null> {
  const url = `https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken}`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    return (data.data?.status || data.status || null) as ApifyRunStatus
  } catch {
    return null
  }
}

// ── Fetch dataset items for a completed run ───────────────────────────────────
// Pass either a datasetId (preferred) or derive from runId.
export async function fetchApifyDataset(
  apifyToken: string,
  datasetId: string,
  limit = 50,
): Promise<any[]> {
  const url = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken}&limit=${limit}&clean=true`
  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.error(`[apify-async] Failed to fetch dataset ${datasetId}: HTTP ${res.status}`)
      return []
    }
    const items = await res.json()
    return Array.isArray(items) ? items : []
  } catch (err: any) {
    console.error(`[apify-async] Error fetching dataset ${datasetId}:`, err.message)
    return []
  }
}

// ── Convenience: wait for a run already in progress (for scan-collect) ───────
// Polls Apify up to maxWaitMs. Returns items if succeeded, null if still running/failed.
export async function pollApifyRun(
  apifyToken: string,
  runId: string,
  datasetId: string,
  maxWaitMs = 0,         // 0 = don't poll, just check current status
  pollIntervalMs = 5000,
): Promise<{ status: ApifyRunStatus; items: any[] } | null> {
  const deadline = Date.now() + maxWaitMs
  while (true) {
    const status = await getApifyRunStatus(apifyToken, runId)
    if (!status) return null

    if (status === 'SUCCEEDED') {
      const items = await fetchApifyDataset(apifyToken, datasetId)
      return { status, items }
    }

    if (status === 'FAILED' || status === 'TIMED-OUT' || status === 'ABORTED') {
      return { status, items: [] }
    }

    // READY or RUNNING — check if we should keep waiting
    if (Date.now() >= deadline) {
      return { status, items: [] }  // still in progress
    }

    await new Promise(r => setTimeout(r, pollIntervalMs))
  }
}
