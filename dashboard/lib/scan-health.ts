/**
 * lib/scan-health.ts
 *
 * Tracks per-tenant scan health in Airtable using an upsert pattern.
 * One record per tenant in the "Scan Health" table.
 *
 * Required Airtable fields:
 *   Tenant ID         (text, required)
 *   Last Scan At      (date/time)
 *   Last Scan Status  (text: success | partial | failed | pending)
 *   Last Posts Found  (number)
 *   Last Scan Source  (text: icp_profiles | keyword_search | none)
 *   Last Error        (text, optional)
 *
 * The system degrades gracefully if the table is missing — scans still run,
 * health tracking is simply skipped.
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
      lastScanAt:     f['Last Scan At']     || null,
      lastScanStatus: f['Last Scan Status'] || null,
      lastPostsFound: f['Last Posts Found'] || 0,
      lastScanSource: f['Last Scan Source'] || null,
      lastError:      f['Last Error']       || null,
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
  }>,
): Promise<void> {
  const atFields: Record<string, any> = {}
  if (fields.lastScanAt     !== undefined) atFields['Last Scan At']     = fields.lastScanAt
  if (fields.lastScanStatus !== undefined) atFields['Last Scan Status'] = fields.lastScanStatus
  if (fields.lastPostsFound !== undefined) atFields['Last Posts Found'] = fields.lastPostsFound
  if (fields.lastScanSource !== undefined) atFields['Last Scan Source'] = fields.lastScanSource
  if (fields.lastError      !== undefined) atFields['Last Error']       = fields.lastError

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
