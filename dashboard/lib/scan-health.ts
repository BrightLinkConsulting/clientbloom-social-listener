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
 *   - Last Scan Source  (text: linkedin | facebook_groups | both | none)
 *   - Last Error        (text, optional)
 *   - FB Run ID         (text — Apify run ID for in-flight async Facebook scan)
 *   - FB Run At         (date/time — when the async FB run was started)
 *   - FB Dataset ID     (text — Apify dataset ID to fetch results from)
 *
 * SETUP: Create a table called "Scan Health" in your Airtable base with the
 * fields above. The system degrades gracefully if the table doesn't exist —
 * scans still run, health tracking is just skipped.
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

// ── Get all tenants with pending async Facebook runs ─────────────────────────
// Used by scan-collect to know which runs to check on.
export interface PendingFbRun {
  tenantId:   string
  fbRunId:    string
  fbDatasetId: string
  fbRunAt:    string
  recordId:   string
  apifyKey?:  string
}

export async function getPendingFbRuns(): Promise<PendingFbRun[]> {
  try {
    const url = new URL(`https://api.airtable.com/v0/${SHARED_BASE}/${encodeURIComponent(TABLE)}`)
    // pending status + run started within last 3 hours
    url.searchParams.set('filterByFormula', `AND({Last Scan Status}='pending_fb',{FB Run ID}!='')`)
    url.searchParams.set('pageSize', '50')

    const res = await fetch(url.toString(), { headers: headers() })
    if (!res.ok) return []

    const data = await res.json()
    return (data.records || [])
      .map((r: any) => ({
        tenantId:    r.fields['Tenant ID']   || '',
        fbRunId:     r.fields['FB Run ID']   || '',
        fbDatasetId: r.fields['FB Dataset ID'] || '',
        fbRunAt:     r.fields['FB Run At']   || '',
        recordId:    r.id,
      }))
      .filter((r: PendingFbRun) => r.tenantId && r.fbRunId)
  } catch {
    return []
  }
}
