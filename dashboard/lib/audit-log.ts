/**
 * lib/audit-log.ts
 *
 * Admin Audit Log — write helper.
 *
 * Writes structured event records to the "Admin Audit Log" table in the
 * platform Airtable base. This table is created on first use if the Airtable
 * schema has been provisioned (see docs/admin-panel.md for setup instructions).
 *
 * ── Event types ───────────────────────────────────────────────────────────────
 *
 * Scoped to archive/delete for the initial launch. Additional event types
 * (grant_access, plan_change, password_reset, etc.) are post-launch additions.
 *
 * ── Failure behavior ─────────────────────────────────────────────────────────
 * Audit log writes are non-fatal. If the write fails (misconfigured table,
 * network error, etc.), the error is logged to console but the calling
 * operation is NOT rolled back. The audit trail is a best-effort system —
 * it must never block the primary admin action.
 *
 * ── Airtable table schema ────────────────────────────────────────────────────
 * Table name: Admin Audit Log
 * Fields:
 *   Event Type        (Single line text)
 *   Admin Email       (Email)
 *   Target Email      (Single line text)
 *   Target Tenant ID  (Single line text)
 *   Target Record ID  (Single line text)
 *   Notes             (Long text)       — JSON summary of outcome
 *   Timestamp         (Date/time)       — ISO 8601, set by this helper
 */

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''

export type AuditEventType =
  | 'archive_tenant'
  | 'unarchive_tenant'
  | 'hard_delete_tenant'
  | 'grant_access'
  | 'password_reset'
  | 'plan_change'
  | 'status_change'
  | 'csm_agent_action'

export interface AuditLogEntry {
  eventType:        AuditEventType
  adminEmail:       string
  targetEmail?:     string
  targetTenantId?:  string
  targetRecordId?:  string
  notes?:           string | Record<string, unknown>
}

/**
 * Write a single event to the Admin Audit Log table.
 * Non-fatal — never throws. All errors are logged to console.
 */
export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  if (!PLATFORM_TOKEN || !PLATFORM_BASE) return

  try {
    const notes = entry.notes
      ? (typeof entry.notes === 'string' ? entry.notes : JSON.stringify(entry.notes, null, 2))
      : ''

    const fields: Record<string, string> = {
      'Event Type':       entry.eventType,
      'Admin Email':      entry.adminEmail,
      'Timestamp':        new Date().toISOString(),
    }

    if (entry.targetEmail)    fields['Target Email']     = entry.targetEmail
    if (entry.targetTenantId) fields['Target Tenant ID'] = entry.targetTenantId
    if (entry.targetRecordId) fields['Target Record ID'] = entry.targetRecordId
    if (notes)                fields['Notes']            = notes

    const resp = await fetch(
      `https://api.airtable.com/v0/${PLATFORM_BASE}/Admin%20Audit%20Log`,
      {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${PLATFORM_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ records: [{ fields }] }),
      }
    )

    if (!resp.ok) {
      const body = await resp.text()
      console.error(`[audit-log] Write failed (${resp.status}):`, body.slice(0, 200))
    }
  } catch (e: any) {
    console.error('[audit-log] Unexpected error:', e.message)
  }
}
