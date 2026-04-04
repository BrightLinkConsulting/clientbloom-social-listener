/**
 * lib/provision.ts
 *
 * Tenant provisioning utility.
 * Called by the Stripe webhook immediately after a new customer pays.
 *
 * Responsibilities:
 *   1. Generate a unique Tenant ID and store it on the Tenants record
 *   2. Nothing else — the customer fills in their own Business Profile
 *      during the onboarding wizard (no pre-seeded empty records needed)
 *
 * Why no pre-seeding?
 *   The FeedPage checks: if no posts AND no localStorage flag → redirect to /onboarding.
 *   If we pre-seeded a Business Profile record (even empty), the onboarding wizard
 *   would update it rather than create it — which is fine — but a blank Industry
 *   field is a reliable onboarding signal only if we don't pre-populate it with
 *   placeholder content.  Better to let the wizard own the Business Profile entirely.
 */

import { SHARED_BASE, PROV_TOKEN } from './airtable'

// ── Generate a short, URL-safe tenant ID ──────────────────────────────────
function generateTenantId(): string {
  // e.g. t_a3f8c2d9b1e74056  (16 hex chars = very low collision probability)
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return `t_${hex}`
}

// ── Write the generated Tenant ID back to the Tenants table record ─────────
async function updateTenantRecord(recordId: string, tenantId: string) {
  const resp = await fetch(
    `https://api.airtable.com/v0/${SHARED_BASE}/Tenants/${recordId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${PROV_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields: { 'Tenant ID': tenantId } }),
    }
  )
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Failed to update Tenants record: ${err}`)
  }
  return resp.json()
}

// ── Main provisioning function ─────────────────────────────────────────────
export async function provisionNewTenant(
  tenantRecordId: string,
  _companyName: string   // reserved for future use
): Promise<string> {
  const tenantId = generateTenantId()

  // Store the tenant ID on their Tenants record.
  // The Business Profile will be created by the onboarding wizard.
  await updateTenantRecord(tenantRecordId, tenantId)

  return tenantId
}
