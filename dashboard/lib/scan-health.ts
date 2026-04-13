/**
 * lib/scan-health.ts
 *
 * Tracks per-tenant scan health in Airtable using an upsert pattern.
 * One record per tenant in the "Scan Health" table.
 *
 * Required Airtable fields:
 *   Tenant ID             (text, required)
 *   Last Scan At          (date/time)
 *   Last Scan Status      (text: success | partial | failed | pending | degraded)
 *   Last Posts Found      (number)
 *   Last Scan Source      (text: icp_profiles | keyword_search | none)
 *   Last Error            (text, optional)
 *   Scan Lock Token       (text — UUID written at scan start, cleared at end)
 *   Scan Lock Expires At  (date/time — now+120s on acquire, cleared at end)
 *
 * Session 15 additions (Apify concentration risk — R2, R5):
 *   R2 — acquireScanLock / releaseScanLock: prevents concurrent duplicate scans.
 *         Lock uses token + expiry so stale locks (from crashed functions) don't
 *         block future scans indefinitely.
 *   R5 — incrementInflight / decrementInflight / resetStaleInflight:
 *         Global inflight counter on a platform-level record (Tenant ID = '_platform').
 *         Soft throttle at 24 concurrent runs (80% of Starter plan's 32-run limit).
 *         Watchdog resets stuck counters after 10 minutes of inactivity.
 *
 * Race condition disclosure:
 *   The lock acquire is not atomically compare-and-swap. Two Vercel instances
 *   firing within Airtable's write latency window (~200ms) can both pass the lock
 *   check. The cron stagger (15s between tenants) makes this statistically unlikely.
 *   A Redis-based atomic lock is the correct 90-day fix. This is documented; not hidden.
 *
 * The system degrades gracefully if the table is missing — scans still run,
 * health tracking is simply skipped.
 */

import { SHARED_BASE, PROV_TOKEN, tenantFilter } from './airtable'

const TABLE = 'Scan Health'

// Tenant ID used for the platform-level global inflight counter (R5)
const PLATFORM_TENANT_ID = '_platform'

// Soft ceiling: throttle new scans if inflight count is at or above this number.
// Set to 80% of Apify Starter plan's 32-run concurrent limit.
const INFLIGHT_SOFT_CEILING = 24

// Stale lock window: if a scan lock's expiry is this many ms in the past, treat it as stale.
// Matches the lock lifetime (120 seconds) with a small buffer.
const LOCK_LIFETIME_MS = 120_000

// Stale inflight watchdog: reset Global Inflight Count if last scan activity was this long ago.
const INFLIGHT_STALE_MS = 10 * 60 * 1_000  // 10 minutes

function headers() {
  return {
    Authorization: `Bearer ${PROV_TOKEN}`,
    'Content-Type': 'application/json',
  }
}

// ── Read health record for a tenant ──────────────────────────────────────────
export interface ScanHealthRecord {
  recordId:              string
  lastScanAt:            string | null
  lastScanStatus:        string | null
  lastPostsFound:        number
  lastScanSource:        string | null
  lastError:             string | null
  lockToken:             string | null
  lockExpiresAt:         string | null
  lastScanBreakdown:     Record<string, number> | null
  // Degraded UX signals (added April 2026)
  lastScanDegraded:      boolean   // true when R4 sanity check fired (>30% blank Post Text)
  consecutiveZeroScans:  number    // increments when scanned>0 && postsFound===0 && no error; reset to 0 on postsFound>0
}

export async function getScanHealth(tenantId: string): Promise<ScanHealthRecord | null> {
  try {
    const url = new URL(`https://api.airtable.com/v0/${SHARED_BASE}/${encodeURIComponent(TABLE)}`)
    url.searchParams.set('filterByFormula', tenantFilter(tenantId))
    url.searchParams.set('pageSize', '1')

    const res = await fetch(url.toString(), { headers: headers() })
    if (!res.ok) return null

    const data = await res.json()
    const record = data.records?.[0]
    if (!record) return null

    const f = record.fields

    const rawError = f['Last Error'] || null
    let lastError: string | null = rawError
    let lastScanBreakdown: Record<string, number> | null = null
    if (rawError && rawError.startsWith('{')) {
      try {
        lastScanBreakdown = JSON.parse(rawError)
        lastError = null
      } catch { /* treat as plain error string */ }
    }

    return {
      recordId:              record.id,
      lastScanAt:            f['Last Scan At']              || null,
      lastScanStatus:        f['Last Scan Status']          || null,
      lastPostsFound:        f['Last Posts Found']          || 0,
      lastScanSource:        f['Last Scan Source']          || null,
      lastError,
      lockToken:             f['Scan Lock Token']           || null,
      lockExpiresAt:         f['Scan Lock Expires At']      || null,
      lastScanBreakdown,
      lastScanDegraded:      f['Last Scan Degraded']        === true,
      consecutiveZeroScans:  f['Consecutive Zero Scans']   || 0,
    }
  } catch {
    return null
  }
}

// ── Write / update health record ──────────────────────────────────────────────
export async function upsertScanHealth(
  tenantId: string,
  fields: Partial<{
    lastScanAt:             string
    lastScanStatus:         string
    lastPostsFound:         number
    lastScanSource:         string
    lastError:              string
    lockToken:              string | null
    lockExpiresAt:          string | null
    // Degraded UX signals (April 2026)
    lastScanDegraded:       boolean
    consecutiveZeroScans:   number
  }>,
): Promise<void> {
  const atFields: Record<string, any> = {}
  if (fields.lastScanAt            !== undefined) atFields['Last Scan At']             = fields.lastScanAt
  if (fields.lastScanStatus        !== undefined) atFields['Last Scan Status']         = fields.lastScanStatus
  if (fields.lastPostsFound        !== undefined) atFields['Last Posts Found']         = fields.lastPostsFound
  if (fields.lastScanSource        !== undefined) atFields['Last Scan Source']         = fields.lastScanSource
  if (fields.lastError             !== undefined) atFields['Last Error']               = fields.lastError
  if (fields.lockToken             !== undefined) atFields['Scan Lock Token']          = fields.lockToken ?? ''
  if (fields.lockExpiresAt         !== undefined) atFields['Scan Lock Expires At']     = fields.lockExpiresAt ?? ''
  if (fields.lastScanDegraded      !== undefined) atFields['Last Scan Degraded']       = fields.lastScanDegraded
  if (fields.consecutiveZeroScans  !== undefined) atFields['Consecutive Zero Scans']   = fields.consecutiveZeroScans

  try {
    const existing = await getScanHealth(tenantId)

    if (existing) {
      await fetch(
        `https://api.airtable.com/v0/${SHARED_BASE}/${encodeURIComponent(TABLE)}/${existing.recordId}`,
        {
          method:  'PATCH',
          headers: headers(),
          body:    JSON.stringify({ fields: atFields }),
        },
      )
    } else {
      await fetch(
        `https://api.airtable.com/v0/${SHARED_BASE}/${encodeURIComponent(TABLE)}`,
        {
          method:  'POST',
          headers: headers(),
          body:    JSON.stringify({
            records: [{ fields: { ...atFields, 'Tenant ID': tenantId } }],
          }),
        },
      )
    }
  } catch (err: any) {
    console.warn(`[scan-health] Failed to write health for ${tenantId}:`, err.message)
  }
}

// ── R2: Concurrency lock ──────────────────────────────────────────────────────

/**
 * Attempt to acquire a scan lock for a tenant.
 *
 * Returns:
 *   { acquired: true }   — lock is yours, scan can proceed
 *   { acquired: false, reason: string } — another scan is running, abort
 *
 * On any Airtable error, defaults to allowing the scan to proceed (fail-open).
 * The alternative — fail-closed on Airtable errors — would block all scans
 * whenever Airtable is slow, which is a worse failure mode.
 */
export async function acquireScanLock(
  tenantId: string,
): Promise<{ acquired: boolean; reason?: string }> {
  try {
    const health = await getScanHealth(tenantId)

    if (health?.lockToken && health.lockExpiresAt) {
      const expiresAt = new Date(health.lockExpiresAt).getTime()
      const now       = Date.now()

      if (expiresAt > now) {
        // Lock is held and not expired
        const remainingSecs = Math.round((expiresAt - now) / 1000)
        console.log(`[scan-health] Lock held for ${tenantId}, expires in ${remainingSecs}s — aborting duplicate scan`)
        return { acquired: false, reason: `scan_in_progress (${remainingSecs}s remaining)` }
      } else {
        // Lock exists but expired — stale from a crashed function
        console.warn(`[scan-health] Stale lock detected for ${tenantId} (expired ${Math.round((now - expiresAt) / 1000)}s ago) — clearing and proceeding`)
      }
    }

    // Acquire the lock: write a UUID + expiry
    const token     = generateLockToken()
    const expiresAt = new Date(Date.now() + LOCK_LIFETIME_MS).toISOString()

    await upsertScanHealth(tenantId, {
      lockToken:     token,
      lockExpiresAt: expiresAt,
    })

    console.log(`[scan-health] Lock acquired for ${tenantId} (token=${token.slice(0, 8)}...)`)
    return { acquired: true }
  } catch (err: any) {
    // Fail-open: if lock check itself errors, allow the scan to proceed
    console.warn(`[scan-health] Lock acquire failed for ${tenantId} (fail-open):`, err.message)
    return { acquired: true }
  }
}

/**
 * Release the scan lock for a tenant after scan completion or failure.
 * Clears both the token and expiry fields.
 */
export async function releaseScanLock(tenantId: string): Promise<void> {
  try {
    await upsertScanHealth(tenantId, {
      lockToken:     null,
      lockExpiresAt: null,
    })
    console.log(`[scan-health] Lock released for ${tenantId}`)
  } catch (err: any) {
    // Non-fatal — a stale lock will auto-clear on the next scan's expiry check
    console.warn(`[scan-health] Lock release failed for ${tenantId}:`, err.message)
  }
}

/** Simple UUID-like token generator (no crypto dependency needed) */
function generateLockToken(): string {
  return `lock_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

// ── R5: Global inflight counter ───────────────────────────────────────────────

/**
 * Get the current global inflight count from the platform record.
 * Returns 0 if the record doesn't exist or can't be read (fail-open).
 */
export async function getInflightCount(): Promise<number> {
  try {
    const health = await getScanHealth(PLATFORM_TENANT_ID)
    return health?.lastPostsFound || 0  // reuse lastPostsFound as the inflight counter field
    // Note: The platform record uses 'Last Posts Found' as the inflight counter.
    // A dedicated 'Global Inflight Count' field would be cleaner but requires an Airtable
    // schema addition. The platform record never has real post counts, so this reuse is safe.
  } catch {
    return 0
  }
}

/**
 * Increment the global inflight counter.
 * Call this when a scan begins (after acquiring the tenant lock).
 */
export async function incrementInflight(): Promise<void> {
  try {
    const current = await getInflightCount()
    await upsertScanHealth(PLATFORM_TENANT_ID, {
      lastPostsFound: current + 1,
      lastScanAt:     new Date().toISOString(),
      lastScanStatus: 'tracking',
    })
  } catch (err: any) {
    console.warn('[scan-health] Failed to increment inflight counter:', err.message)
  }
}

/**
 * Decrement the global inflight counter.
 * Call this when a scan ends (success, failure, or crash recovery).
 * Floors at 0 to prevent negative counts.
 */
export async function decrementInflight(): Promise<void> {
  try {
    const current = await getInflightCount()
    const next = Math.max(0, current - 1)
    await upsertScanHealth(PLATFORM_TENANT_ID, {
      lastPostsFound: next,
      lastScanAt:     new Date().toISOString(),
    })
  } catch (err: any) {
    console.warn('[scan-health] Failed to decrement inflight counter:', err.message)
  }
}

/**
 * Check if we're at or above the soft ceiling for concurrent runs.
 * Returns true if the new scan should be delayed.
 *
 * Does NOT hard-block — a delay of 60 seconds is applied by the caller.
 * This is advisory, not a gate.
 */
export async function isAtInflightCeiling(): Promise<boolean> {
  const count = await getInflightCount()
  if (count >= INFLIGHT_SOFT_CEILING) {
    console.warn(`[scan-health] Inflight ceiling reached: ${count} >= ${INFLIGHT_SOFT_CEILING} — new scan should delay`)
    return true
  }
  return false
}

/**
 * Watchdog: reset the inflight counter if it has been non-zero for longer than
 * INFLIGHT_STALE_MS without any scan activity update.
 *
 * This handles the case where Vercel functions crash without decrementing.
 * Should be called from the cron job at the start of each scan cycle.
 *
 * Returns true if the counter was reset.
 */
export async function resetStaleInflight(): Promise<boolean> {
  try {
    const health = await getScanHealth(PLATFORM_TENANT_ID)
    if (!health || !health.lastPostsFound || health.lastPostsFound === 0) return false

    const lastActivity = health.lastScanAt ? new Date(health.lastScanAt).getTime() : 0
    const staleSince   = Date.now() - lastActivity

    if (staleSince > INFLIGHT_STALE_MS) {
      console.warn(
        `[scan-health] Inflight watchdog: counter stuck at ${health.lastPostsFound} for ${Math.round(staleSince / 60000)}m — resetting to 0`
      )
      await upsertScanHealth(PLATFORM_TENANT_ID, {
        lastPostsFound: 0,
        lastScanStatus: 'watchdog_reset',
        lastScanAt:     new Date().toISOString(),
      })
      return true
    }

    return false
  } catch (err: any) {
    console.warn('[scan-health] Inflight watchdog check failed:', err.message)
    return false
  }
}

// getPendingFbRuns() removed — Facebook scraping decommissioned April 8 2026 (commit b906384)
