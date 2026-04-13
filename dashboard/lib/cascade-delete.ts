/**
 * lib/cascade-delete.ts
 *
 * Cascade delete helper for Scout tenant accounts.
 *
 * When a tenant is hard-deleted, data spans two Airtable bases and requires
 * two separate API tokens. This module owns that dual-token architecture so
 * no other file has to reason about it.
 *
 * ── Token ownership ───────────────────────────────────────────────────────────
 *
 *  PLATFORM_AIRTABLE_TOKEN  (env: PLATFORM_AIRTABLE_TOKEN)
 *    Platform base (PLATFORM_AIRTABLE_BASE_ID):
 *    - Tenants table          ← the root record (deleted last)
 *    - Scan Health table      ← per-tenant scan state
 *
 *  AIRTABLE_PROVISIONING_TOKEN  (env: AIRTABLE_PROVISIONING_TOKEN)
 *    Shared data base (AIRTABLE_PROVISIONING_BASE_ID = appZWp7QdPptIOUYB):
 *    - Captured Posts         (tblvhgibBTXtAvWpi)
 *    - Sources                (tbllcd92zZn8HIk6D)
 *    - LinkedIn ICPs          (tblCu0UiUXKAijGVt)
 *    - Business Profile       (tblxoKaCyy28yzbFE)
 *    - Facebook Keywords      (tblHPXqKhduxmS0cS)
 *    - Target Groups          (tblTargetGroups — verify ID before use)
 *
 * ── Delete order ─────────────────────────────────────────────────────────────
 * 1. Shared data base (all 6 tables) — uses AIRTABLE_PROVISIONING_TOKEN
 * 2. Scan Health (platform base)     — uses PLATFORM_AIRTABLE_TOKEN
 * 3. Sub-accounts (Is Feed Only = true, linked to this tenant) — uses PLATFORM_AIRTABLE_TOKEN
 * 4. Tenants row for the tenant itself — uses PLATFORM_AIRTABLE_TOKEN (last)
 *
 * The Tenants row is always deleted last so that if a mid-cascade failure
 * occurs the tenant record still exists and the operation can be retried.
 *
 * ── Sub-account handling ──────────────────────────────────────────────────────
 * Sub-accounts (Is Feed Only = true) linked to a primary tenant share the
 * primary's Tenant ID field. When a primary is deleted, all linked sub-accounts
 * must also be deleted to prevent orphaned auth records.
 *
 * Sub-accounts can also be deleted independently (pass deletePrimary=false),
 * in which case only the sub-account's own data and Tenants row is removed.
 *
 * ── Return value ─────────────────────────────────────────────────────────────
 * Returns a CascadeResult describing what was deleted and any partial failures.
 * API routes should surface this to the caller so the admin can see if any
 * cleanup step failed and needs a manual follow-up.
 */

const PLATFORM_TOKEN       = process.env.PLATFORM_AIRTABLE_TOKEN         || ''
const PLATFORM_BASE        = process.env.PLATFORM_AIRTABLE_BASE_ID        || ''
const PROV_TOKEN           = process.env.AIRTABLE_PROVISIONING_TOKEN      || ''
const PROV_BASE            = process.env.AIRTABLE_PROVISIONING_BASE_ID    || 'appZWp7QdPptIOUYB'

const AIRTABLE_API = 'https://api.airtable.com/v0'

// Shared-data-base table IDs (scoped to PROV_BASE)
const SHARED_TABLES: { name: string; id: string }[] = [
  { name: 'Captured Posts',   id: 'tblvhgibBTXtAvWpi' },
  { name: 'Sources',          id: 'tbllcd92zZn8HIk6D'  },
  { name: 'LinkedIn ICPs',    id: 'tblCu0UiUXKAijGVt'  },
  { name: 'Business Profile', id: 'tblxoKaCyy28yzbFE'  },
  { name: 'Facebook Keywords',id: 'tblHPXqKhduxmS0cS'  },
  // Target Groups — ID TBD; included as no-op if table doesn't exist
  { name: 'Target Groups',    id: process.env.AIRTABLE_TARGET_GROUPS_TABLE_ID || '' },
]

export interface CascadeTableResult {
  table:   string
  deleted: number
  failed:  number
  error?:  string
}

export interface CascadeResult {
  tenantId:         string
  tenantRecordId:   string
  tables:           CascadeTableResult[]
  scanHealthDeleted: number
  subAccountsDeleted: number
  tenantRowDeleted:  boolean
  errors:           string[]
  durationMs:       number
}

// ── Airtable fetch helpers ────────────────────────────────────────────────────

/** Fetch all record IDs in a table matching a filterByFormula. */
async function fetchMatchingIds(
  baseId:  string,
  token:   string,
  tableId: string,
  formula: string,
): Promise<string[]> {
  const ids: string[] = []
  let offset: string | undefined

  do {
    const url = new URL(`${AIRTABLE_API}/${baseId}/${tableId}`)
    url.searchParams.set('filterByFormula', formula)
    url.searchParams.set('fields[]', 'Tenant ID')  // fetch minimal fields
    url.searchParams.set('pageSize', '100')
    if (offset) url.searchParams.set('offset', offset)

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!resp.ok) {
      const body = await resp.text()
      throw new Error(`Airtable ${resp.status}: ${body.slice(0, 200)}`)
    }

    const data = await resp.json()
    for (const r of data.records || []) ids.push(r.id)
    offset = data.offset
  } while (offset)

  return ids
}

/** Delete records in batches of 10 (Airtable max per request). */
async function batchDelete(
  baseId:  string,
  token:   string,
  tableId: string,
  ids:     string[],
): Promise<{ deleted: number; failed: number; error?: string }> {
  if (!ids.length) return { deleted: 0, failed: 0 }

  let deleted = 0
  let failed  = 0
  let lastError: string | undefined

  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10)
    const params = chunk.map(id => `records[]=${id}`).join('&')
    const url    = `${AIRTABLE_API}/${baseId}/${tableId}?${params}`

    try {
      const resp = await fetch(url, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (resp.ok) {
        const data = await resp.json()
        deleted += (data.records || []).length
      } else {
        const body = await resp.text()
        failed += chunk.length
        lastError = `${resp.status}: ${body.slice(0, 120)}`
        console.error(`[cascade-delete] batchDelete failed on chunk:`, lastError)
      }
    } catch (e: any) {
      failed += chunk.length
      lastError = e.message
    }

    // Brief pause between batches to respect Airtable rate limits (5 req/s)
    if (i + 10 < ids.length) await sleep(250)
  }

  return { deleted, failed, error: lastError }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Sub-account lookup ────────────────────────────────────────────────────────

/** Find all sub-accounts (Is Feed Only = true) linked to a primary tenantId. */
async function findSubAccounts(tenantId: string): Promise<{ recordId: string; tenantRowId: string }[]> {
  // Sub-accounts share the same Tenant ID as the primary and have Is Feed Only = true
  const url = new URL(`${AIRTABLE_API}/${PLATFORM_BASE}/Tenants`)
  url.searchParams.set(
    'filterByFormula',
    `AND({Is Feed Only}=TRUE(), {Tenant ID}='${tenantId.replace(/'/g, "\\'")}')`,
  )
  url.searchParams.set('fields[]', 'Tenant ID')
  url.searchParams.set('pageSize', '100')

  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
  })

  if (!resp.ok) return []
  const data = await resp.json()
  return (data.records || []).map((r: any) => ({
    recordId:    r.id,   // Airtable record ID (used for deletion)
    tenantRowId: r.id,
  }))
}

// ── Scan Health lookup ────────────────────────────────────────────────────────

async function deleteScanHealth(tenantId: string): Promise<number> {
  try {
    const ids = await fetchMatchingIds(
      PLATFORM_BASE,
      PLATFORM_TOKEN,
      'Scan Health',
      `{Tenant ID}='${tenantId.replace(/'/g, "\\'")}'`,
    )
    if (!ids.length) return 0
    const result = await batchDelete(PLATFORM_BASE, PLATFORM_TOKEN, 'Scan Health', ids)
    return result.deleted
  } catch {
    return 0
  }
}

// ── Main cascade delete ───────────────────────────────────────────────────────

/**
 * Perform a full cascade delete for a single tenant record.
 *
 * @param tenantRecordId  The Airtable record ID from the Tenants table (rec…)
 * @param tenantId        The Tenant ID string (UUID used for data isolation)
 * @param deletePrimary   If false, only deletes this record's data — does NOT
 *                        cascade to sub-accounts. Use for sub-account-only deletes.
 */
export async function cascadeDeleteTenant(
  tenantRecordId: string,
  tenantId:       string,
  deletePrimary   = true,
): Promise<CascadeResult> {
  const startMs = Date.now()
  const tables:  CascadeTableResult[] = []
  const errors:  string[]             = []
  let scanHealthDeleted  = 0
  let subAccountsDeleted = 0
  let tenantRowDeleted   = false

  // Safety guards — refuse to proceed if tokens are missing
  if (!tenantId || tenantId === 'owner') {
    throw new Error('Invalid tenantId — cascade delete requires a proper UUID tenant ID.')
  }
  if (!PLATFORM_TOKEN || !PLATFORM_BASE) {
    throw new Error('PLATFORM_AIRTABLE_TOKEN and PLATFORM_AIRTABLE_BASE_ID must be set.')
  }

  // ── STEP 1: Shared data base (6 tables) ──────────────────────────────────
  if (PROV_TOKEN && PROV_BASE) {
    const formula = `{Tenant ID}='${tenantId.replace(/'/g, "\\'")}'`

    for (const table of SHARED_TABLES) {
      if (!table.id) {
        // Skip tables with unknown IDs (e.g., Target Groups pending verification)
        tables.push({ table: table.name, deleted: 0, failed: 0, error: 'Table ID not configured — skipped' })
        continue
      }

      try {
        const ids = await fetchMatchingIds(PROV_BASE, PROV_TOKEN, table.id, formula)
        const result = await batchDelete(PROV_BASE, PROV_TOKEN, table.id, ids)
        tables.push({ table: table.name, deleted: result.deleted, failed: result.failed, error: result.error })
        if (result.error) errors.push(`${table.name}: ${result.error}`)
      } catch (e: any) {
        tables.push({ table: table.name, deleted: 0, failed: 0, error: e.message })
        errors.push(`${table.name}: ${e.message}`)
      }

      // Rate limit pause between tables
      await sleep(200)
    }
  } else {
    errors.push('AIRTABLE_PROVISIONING_TOKEN or AIRTABLE_PROVISIONING_BASE_ID not set — shared data tables skipped.')
  }

  // ── STEP 2: Scan Health (platform base) ──────────────────────────────────
  try {
    scanHealthDeleted = await deleteScanHealth(tenantId)
  } catch (e: any) {
    errors.push(`Scan Health: ${e.message}`)
  }

  // ── STEP 3: Sub-accounts (only when deleting a primary) ──────────────────
  if (deletePrimary) {
    try {
      const subs = await findSubAccounts(tenantId)

      for (const sub of subs) {
        // Each sub-account gets its own shared-data cascade first, then Tenants row
        // Sub-accounts share the same tenantId as the primary, so shared-data
        // was already wiped in Step 1. Just remove the Tenants row.
        const subResp = await fetch(
          `${AIRTABLE_API}/${PLATFORM_BASE}/Tenants/${sub.tenantRowId}`,
          {
            method:  'DELETE',
            headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
          }
        )
        if (subResp.ok) subAccountsDeleted++
        else errors.push(`Sub-account ${sub.tenantRowId}: delete failed ${subResp.status}`)

        await sleep(150)
      }
    } catch (e: any) {
      errors.push(`Sub-accounts: ${e.message}`)
    }
  }

  // ── STEP 4: Delete the Tenants row itself ─────────────────────────────────
  try {
    const resp = await fetch(
      `${AIRTABLE_API}/${PLATFORM_BASE}/Tenants/${tenantRecordId}`,
      {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
      }
    )
    tenantRowDeleted = resp.ok
    if (!resp.ok) errors.push(`Tenants row: delete failed ${resp.status}`)
  } catch (e: any) {
    errors.push(`Tenants row: ${e.message}`)
  }

  return {
    tenantId,
    tenantRecordId,
    tables,
    scanHealthDeleted,
    subAccountsDeleted,
    tenantRowDeleted,
    errors,
    durationMs: Date.now() - startMs,
  }
}
