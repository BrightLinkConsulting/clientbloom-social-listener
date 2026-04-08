/**
 * lib/scan-health.ts
 *
 * Tracks the health of each tenant's scans in Airtable.
 * Uses a "Scan Health" table with one record per tenant (upsert pattern).
 *
 * Fields in the "Scan Health" Airtable table:
 *   - Tenant ID         (text, required)
 *   - Last Scan At      (date/time)
 *   - Last Scan Status  (text: success | partial | failed | pending)
 *   - Last Posts Found  (number)
 *   - Last Scan Source  (text: linkedin | none)
 *   - Last Error        (text, optional)
 *   - FB Run ID         (text — legacy, no longer populated)
 *   - FB Run At         (date/time — legacy, no longer populated)
 *   - FB Dataset ID     (text — legacy, no longer populated)
 *
 * SETUP: Create a table called "Scan Health" in your Airtable base with the
 * fields above. The system degrades gracefully if the table doesn't exist —
 * scans still run, health tracking is just skipped.
 *
 * NOTE: FB* fields remain in the schema for backward compat with existing
 * Airtable tables but are never written after commit b906384 (April 8 2026).
 */

import { SHARED_BASE, PROV_TOKEN, tenantFilter } from './airtable'

const TABLE = 'Scan Health'

function headers() {
  return {
    Authorization: `Bearer ${PROV_TOKEN}`,
    'Content-Type': 'application/json',
  }
}

// ── Read health record for a tenant ──────────────────────────────────────────
export interface ScanHealthRecord {
  recordId:       string
  lastScanAt:     string | null
  lastScanStatus: string | null
  lastPostsFound: number
  lastScanSource: string | null
  lastError:      string | null
  fbRunId:        string | null
  fbRunAt:        string | null
  fbDatasetId:    string | null
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
    return {
      recordId:       record.id,
      lastScanAt:     f['Last Scan At']      || null,
      lastScanStatus: f['Last Scan Status']  || null,
      lastPostsFound: f['Last Posts Found']  || 0,
      lastScanSource: f['Last Scan Source']  || null,
      lastError:      f['Last Error']        || null,
      fbRunId:        f['FB Run ID']         || null,
      fbRunAt:        f['FB Run At']         || null,
      fbDatasetId:    f['FB Dataset ID']     || null,
    }
  } catch {
    return null
  }
}

// ── Write / update health record ──────────────────────────────────────────────
export async function upsertScanHealth(
  tenantId: string,
  fields: Partial<{
    lastScanAt:     string
    lastScanStatus: string
    lastPostsFound: number
    lastScanSource: string
    lastError:      string
    fbRunId:        string
    fbRunAt:        string
    fbDatasetId:    string
  }>,
): Promise<void> {
  // Map to Airtable field names
  const atFields: Record<string, any> = {}
  if (fields.lastScanAt     !== undefined) atFields['Last Scan At']     = fields.lastScanAt
  if (fields.lastScanStatus !== undefined) atFields['Last Scan Status'] = fields.lastScanStatus
  if (fields.lastPostsFound !== undefined) atFields['Last Posts Found'] = fields.lastPostsFound
  if (fields.lastScanSource !== undefined) atFields['Last Scan Source'] = fields.lastScanSource
  if (fields.lastError      !== undefined) atFields['Last Error']       = fields.lastError
  if (fields.fbRunId        !== undefined) atFields['FB Run ID']        = fields.fbRunId
  if (fields.fbRunAt        !== undefined) atFields['FB Run At']        = fields.fbRunAt
  if (fields.fbDatasetId    !== undefined) atFields['FB Dataset ID']    = fields.fbDatasetId

  try {
    // Try to find existing record
    const existing = await getScanHealth(tenantId)

    if (existing) {
      // Update existing record
      await fetch(
        `https://api.airtable.com/v0/${SHARED_BASE}/${encodeURIComponent(TABLE)}/${existing.recordId}`,
        {
          method:  'PATCH',
          headers: headers(),
          body:    JSON.stringify({ fields: atFields }),
        },
      )
    } else {
      // Create new record
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
    // Graceful degradation — health tracking failure must never break a scan
    console.warn(`[scan-health] Failed to write health for ${tenantId}:`, err.message)
  }
}

// getPendingFbRuns() removed — Facebook scraping decommissioned April 8 2026 (commit b906384)
