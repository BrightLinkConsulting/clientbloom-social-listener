/**
 * lib/airtable.ts
 *
 * Shared Airtable helpers for the multi-tenant platform.
 * All customer data lives in one shared base (PLATFORM_AIRTABLE_BASE_ID).
 * Row-level isolation is enforced via the "Tenant ID" field on every table.
 *
 * The provisioning token (AIRTABLE_PROVISIONING_TOKEN) is used for all
 * server-side data access. Customers never interact with Airtable directly.
 *
 * Rate-limit resilience (airtableFetch):
 *   Airtable enforces 5 requests/second per base (shared across all tenants).
 *   At 100+ concurrent scan runs this limit is easily exceeded.
 *   airtableFetch wraps every outbound call with exponential-backoff retry on
 *   HTTP 429 (and transient 5xx), so individual scan workers back off
 *   independently rather than thundering-herding after a burst.
 */

export const SHARED_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID      || ''
export const PROV_TOKEN   = process.env.AIRTABLE_PROVISIONING_TOKEN     || ''

// ── Retry-aware fetch for Airtable ─────────────────────────────────────────
//
// Why this exists:
//   Airtable rate-limits at 5 req/s per base (shared across all tenants).
//   200 trial tenants scanning simultaneously generate ~2,400 calls in a burst.
//   Without backoff, every worker retries at the same time, causing cascading
//   failures and scan results that look blank even though Apify worked.
//
// Strategy:
//   - Up to RETRY_MAX additional attempts after the first 429/5xx
//   - Exponential base delay doubles each attempt: 1 s -> 2 s -> 4 s
//   - Respects Retry-After header when Airtable sends one (often 1-2 s)
//   - +-20% random jitter spreads simultaneous retriers apart
//   - Hard cap of 10 s per wait — keeps total retry budget under 21 s max
//     (1+2+4 s base × 1.2 jitter), safe for the tightest function budget
//     (trigger-scan maxDuration=90 s, scan-tenant maxDuration=300 s)
//   - 4xx errors other than 429 are NOT retried (they are client errors)
//
// Cap rationale: trigger-scan has a 90 s Vercel function budget.
//   Old cap: 30 s × 3 retries = 90 s in waits alone — zero budget for Apify/Claude.
//   New cap: 10 s × 3 retries = 30 s max — leaves 60 s for actual work.

const RETRY_MAX     = 3       // additional attempts after first try
const RETRY_BASE_MS = 1_000   // 1 s base delay
const RETRY_CAP_MS  = 10_000  // 10 s ceiling per wait (was 30 s — see rationale above)

/**
 * Drop-in replacement for fetch() for all Airtable API calls.
 * Retries on 429 and transient 5xx with exponential backoff + jitter.
 */
export async function airtableFetch(
  url: string | URL,
  options?: RequestInit,
): Promise<Response> {
  let attempt = 0

  while (true) {
    const res = await fetch(url.toString(), options)

    // Success or unretriable client error — return immediately
    const isRateLimit    = res.status === 429
    const isTransient5xx = res.status >= 500 && res.status < 600
    if ((!isRateLimit && !isTransient5xx) || attempt >= RETRY_MAX) {
      if (attempt > 0 && res.ok) {
        console.log(`[airtable] Recovered after ${attempt} retry(ies) — status ${res.status}`)
      }
      return res
    }

    attempt++

    // Respect Airtable's Retry-After header (seconds) when present
    const retryAfterHeader = res.headers.get('Retry-After')
    const retryAfterMs     = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1_000 : 0

    // Exponential backoff: 1 s, 2 s, 4 s ... capped at RETRY_CAP_MS
    const exponentialMs = Math.min(RETRY_BASE_MS * Math.pow(2, attempt - 1), RETRY_CAP_MS)

    // Take the larger of Retry-After and our computed backoff, add +-20% jitter
    const baseWait = Math.max(retryAfterMs, exponentialMs)
    const jitter   = 1 + (Math.random() * 0.4 - 0.2)   // 0.8 to 1.2
    const waitMs   = Math.round(baseWait * jitter)

    console.warn(
      `[airtable] HTTP ${res.status} — attempt ${attempt}/${RETRY_MAX}, ` +
      `waiting ${waitMs} ms before retry`
    )

    await new Promise(resolve => setTimeout(resolve, waitMs))
  }
}

// ── Formula helpers ────────────────────────────────────────────────────────

/**
 * Escapes a string for safe use inside an Airtable single-quoted formula literal.
 * Airtable formula strings are single-quoted; an unescaped ' or \ in the value
 * would break the formula and could enable formula injection.
 *
 * Examples:
 *   O'Brien       ->  O\'Brien
 *   back\slash    ->  back\\slash
 *   t_x', '1'='1 ->  t_x\', \'1\'=\'1   (injection attempt neutralized)
 */
export function escapeAirtableString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

// ── Headers ────────────────────────────────────────────────────────────────
export function airtableHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${PROV_TOKEN}`,
    'Content-Type': 'application/json',
  }
}

// ── Tenant filter formula ──────────────────────────────────────────────────
// The 'owner' tenant also matches records with no Tenant ID (backward compat
// for Mike's data that existed before the multi-tenant migration).
// tenantId is escaped to prevent Airtable formula injection.
export function tenantFilter(tenantId: string): string {
  if (tenantId === 'owner') {
    return `OR({Tenant ID}='owner',{Tenant ID}='')`
  }
  return `{Tenant ID}='${escapeAirtableString(tenantId)}'`
}

// ── Ownership verification ─────────────────────────────────────────────────
// Fetches a record by ID and checks that its Tenant ID matches the caller.
// Use before any update/delete that takes a record ID from user input to
// prevent cross-tenant IDOR (Insecure Direct Object Reference) attacks.
export async function verifyRecordTenant(
  table: string,
  recordId: string,
  tenantId: string,
): Promise<boolean> {
  // Use a filter-formula query (same path as list operations) rather than a
  // direct record-by-ID fetch.  Some provisioning tokens have list/write scope
  // but not single-record-read scope, which caused PATCH to return 404 even
  // when the record existed and was correctly scoped to the tenant.
  try {
    const ownerFormula = `AND(OR({Tenant ID}='owner',{Tenant ID}=''),RECORD_ID()='${recordId}')`
    const tenantFormula = `AND({Tenant ID}='${escapeAirtableString(tenantId)}',RECORD_ID()='${recordId}')`
    const formula = tenantId === 'owner' ? ownerFormula : tenantFormula

    const url = new URL(
      `https://api.airtable.com/v0/${SHARED_BASE}/${encodeURIComponent(table)}`
    )
    url.searchParams.set('filterByFormula', formula)
    url.searchParams.set('fields[]', 'Tenant ID')
    url.searchParams.set('maxRecords', '1')

    const resp = await airtableFetch(url.toString(), { headers: airtableHeaders() })
    if (!resp.ok) {
      console.error(`[verifyRecordTenant] Airtable ${resp.status} for table=${table} recordId=${recordId} tenantId=${tenantId}`)
      return false
    }
    const data = await resp.json()
    return Array.isArray(data.records) && data.records.length > 0
  } catch (err) {
    console.error(`[verifyRecordTenant] exception: ${err}`)
    return false
  }
}

// ── List records (GET with tenant filtering) ───────────────────────────────
export async function airtableList(
  table: string,
  tenantId: string,
  extraParams: Record<string, string> = {}
): Promise<Response> {
  const url = new URL(
    `https://api.airtable.com/v0/${SHARED_BASE}/${encodeURIComponent(table)}`
  )
  url.searchParams.set('filterByFormula', tenantFilter(tenantId))
  for (const [k, v] of Object.entries(extraParams)) {
    url.searchParams.set(k, v)
  }
  return airtableFetch(url.toString(), { headers: airtableHeaders() })
}

// ── Create record (POST with tenant ID injected) ───────────────────────────
export async function airtableCreate(
  table: string,
  tenantId: string,
  fields: Record<string, any>
): Promise<Response> {
  return airtableFetch(
    `https://api.airtable.com/v0/${SHARED_BASE}/${encodeURIComponent(table)}`,
    {
      method: 'POST',
      headers: airtableHeaders(),
      body: JSON.stringify({
        records: [{ fields: { ...fields, 'Tenant ID': tenantId } }],
      }),
    }
  )
}


// ── Batch create records (POST multiple records with max 10 per request) ───
export async function airtableBatchCreate(
  table: string,
  tenantId: string,
  records: Array<{ fields: Record<string, unknown> }>
): Promise<void> {
  // Airtable batch create supports max 10 records per request
  const chunkSize = 10
  for (let i = 0; i < records.length; i += chunkSize) {
    const batch = records.slice(i, i + chunkSize)
    // Inject tenantId into all records
    const recordsWithTenant = batch.map(r => ({
      fields: { ...r.fields, 'Tenant ID': tenantId }
    }))
    const resp = await airtableFetch(
      `https://api.airtable.com/v0/${SHARED_BASE}/${encodeURIComponent(table)}`,
      {
        method: 'POST',
        headers: airtableHeaders(),
        body: JSON.stringify({ records: recordsWithTenant }),
      }
    )
    if (!resp.ok) {
      throw new Error(
        `Batch create failed for ${table} (batch ${Math.floor(i / chunkSize) + 1}): ${resp.statusText}`
      )
    }
  }
}

// ── Update record (PATCH — no filter needed, uses record ID directly) ──────
export async function airtableUpdate(
  table: string,
  recordId: string,
  fields: Record<string, any>
): Promise<Response> {
  return airtableFetch(
    `https://api.airtable.com/v0/${SHARED_BASE}/${encodeURIComponent(table)}/${recordId}`,
    {
      method: 'PATCH',
      headers: airtableHeaders(),
      body: JSON.stringify({ fields }),
    }
  )
}

// ── Delete record ──────────────────────────────────────────────────────────
export async function airtableDelete(
  table: string,
  recordId: string
): Promise<Response> {
  return airtableFetch(
    `https://api.airtable.com/v0/${SHARED_BASE}/${encodeURIComponent(table)}/${recordId}`,
    {
      method: 'DELETE',
      headers: airtableHeaders(),
    }
  )
}

// ── Upsert: update first matching record, or create if none exists ─────────
export async function airtableUpsert(
  table: string,
  tenantId: string,
  fields: Record<string, any>
): Promise<Response> {
  const listResp = await airtableList(table, tenantId, { pageSize: '1' })
  if (!listResp.ok) return listResp
  const existing = (await listResp.json()).records?.[0]
  if (existing) {
    return airtableUpdate(table, existing.id, fields)
  }
  return airtableCreate(table, tenantId, fields)
}
