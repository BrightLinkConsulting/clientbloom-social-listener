/**
 * lib/airtable.ts
 *
 * Shared Airtable helpers for the multi-tenant platform.
 * All customer data lives in one shared base (PLATFORM_AIRTABLE_BASE_ID).
 * Row-level isolation is enforced via the "Tenant ID" field on every table.
 *
 * The provisioning token (AIRTABLE_PROVISIONING_TOKEN) is used for all
 * server-side data access. Customers never interact with Airtable directly.
 */

export const SHARED_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID      || ''
export const PROV_TOKEN   = process.env.AIRTABLE_PROVISIONING_TOKEN     || ''

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
export function tenantFilter(tenantId: string): string {
  if (tenantId === 'owner') {
    return `OR({Tenant ID}='owner',{Tenant ID}='')`
  }
  return `{Tenant ID}='${tenantId}'`
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
  return fetch(url.toString(), { headers: airtableHeaders() })
}

// ── Create record (POST with tenant ID injected) ───────────────────────────
export async function airtableCreate(
  table: string,
  tenantId: string,
  fields: Record<string, any>
): Promise<Response> {
  return fetch(
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

// ── Update record (PATCH — no filter needed, uses record ID directly) ──────
export async function airtableUpdate(
  table: string,
  recordId: string,
  fields: Record<string, any>
): Promise<Response> {
  return fetch(
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
  return fetch(
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
