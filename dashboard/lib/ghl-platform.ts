/**
 * lib/ghl-platform.ts
 *
 * Platform-level GoHighLevel integration for Scout by ClientBloom.
 * Manages Scout's own user lifecycle in Mike's GHL account — separate from the
 * per-tenant Agency CRM integration (which uses each customer's own GHL keys).
 *
 * Pipeline: "SCOUT by ClientBloom"  (id: 5xyEuDU0n5Fgq5n6BoKf)
 * Location: ClientBloom sub-account (id: hz6swxxqV8ZMTuyTG0hP)
 *
 * Stage IDs (hardcoded — fixed for the Scout lifecycle pipeline):
 *   Trial User      → df3a8ce5-b1b9-458e-8dc6-29a5171e529b
 *   Paid Subscriber → acdbc33a-3a44-4e57-84bb-2406b848f930
 *   Expired Trial   → 69aef152-bd86-4b54-9d73-8e29cc2fa03f
 *   Archived        → 652e9e98-c9f9-4cc8-85a5-bdf9ec650c7c
 *
 * GHL ID persistence:
 *   GHL Opportunity ID and GHL Contact ID are stored in the Tenants Airtable
 *   record on creation. All subsequent stage moves read the stored opportunity ID
 *   directly — no GHL search queries are used. This avoids a bug in GHL's search
 *   API where contact_id filtering returns 0 results for newly created pipelines.
 *
 * Required env vars:
 *   SCOUT_GHL_API_KEY            — Private Integration token (ClientBloom sub-account)
 *   PLATFORM_AIRTABLE_TOKEN      — to read/write GHL IDs in the Tenants table
 *   PLATFORM_AIRTABLE_BASE_ID    — appZWp7QdPptIOUYB
 *
 * If SCOUT_GHL_API_KEY is not set, all functions no-op silently.
 * All public functions must be awaited at call sites — never fire-and-forget.
 */

const GHL_BASE    = 'https://services.leadconnectorhq.com'
const GHL_VERSION = '2021-07-28'

const GHL_LOCATION_ID = 'hz6swxxqV8ZMTuyTG0hP'
const GHL_PIPELINE_ID = '5xyEuDU0n5Fgq5n6BoKf'

export const GHL_STAGE = {
  trial:    'df3a8ce5-b1b9-458e-8dc6-29a5171e529b',
  paid:     'acdbc33a-3a44-4e57-84bb-2406b848f930',
  expired:  '69aef152-bd86-4b54-9d73-8e29cc2fa03f',
  archived: '652e9e98-c9f9-4cc8-85a5-bdf9ec650c7c',
} as const

// Paid plan names that map to the "Paid Subscriber" stage on restore/unarchive
const PAID_PLANS = new Set([
  'Scout Starter', 'Scout Pro', 'Scout Agency',
  'Complimentary', 'Owner',
  'Scout $79', 'Scout $49',  // legacy grandfathered plans
])

// Monthly price per plan — shown as monetary value on GHL opportunities.
// Stripe is the source of truth for billing; this is display-only.
const PLAN_MONTHLY_VALUE: Record<string, number> = {
  'Scout Starter': 49,
  'Scout Pro':     99,
  'Scout Agency':  249,
  'Starter':       49,   // short-form names from some webhook paths
  'Pro':           99,
  'Agency':        249,
  'Scout $49':     49,   // legacy grandfathered
  'Scout $79':     79,
}

function planPrice(plan: string): number | undefined {
  return PLAN_MONTHLY_VALUE[plan] ?? undefined
}

function ghlHeaders(apiKey: string) {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type':  'application/json',
    'Version':       GHL_VERSION,
  }
}

function parseName(fullName: string): { firstName: string; lastName: string } {
  const parts = (fullName || '').trim().split(/\s+/)
  if (!parts[0]) return { firstName: 'Unknown', lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

// ── Airtable helpers (for persisting GHL IDs) ──────────────────────────────────

async function readGhlIds(airtableRecordId: string): Promise<{ contactId: string | null; oppId: string | null }> {
  const token = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
  const base  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
  if (!token || !base) return { contactId: null, oppId: null }

  try {
    const res  = await fetch(`https://api.airtable.com/v0/${base}/Tenants/${airtableRecordId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return { contactId: null, oppId: null }
    const data = await res.json()
    return {
      contactId: (data.fields?.['GHL Contact ID'] as string) || null,
      oppId:     (data.fields?.['GHL Opportunity ID'] as string) || null,
    }
  } catch (e: any) {
    console.error('[ghl-platform] readGhlIds error:', e.message)
    return { contactId: null, oppId: null }
  }
}

async function storeGhlIds(airtableRecordId: string, contactId: string, oppId: string): Promise<void> {
  const token = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
  const base  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
  if (!token || !base) return

  try {
    const res = await fetch(`https://api.airtable.com/v0/${base}/Tenants/${airtableRecordId}`, {
      method:  'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ fields: { 'GHL Contact ID': contactId, 'GHL Opportunity ID': oppId } }),
    })
    if (!res.ok) {
      console.error('[ghl-platform] storeGhlIds failed:', res.status, await res.text().catch(() => ''))
    }
  } catch (e: any) {
    console.error('[ghl-platform] storeGhlIds error:', e.message)
  }
}

// ── GHL API helpers ────────────────────────────────────────────────────────────

async function upsertContact(apiKey: string, email: string, name: string): Promise<string | null> {
  try {
    const { firstName, lastName } = parseName(name)
    const res = await fetch(`${GHL_BASE}/contacts/upsert`, {
      method:  'POST',
      headers: ghlHeaders(apiKey),
      body: JSON.stringify({
        locationId: GHL_LOCATION_ID,
        email:      email.toLowerCase(),
        firstName,
        lastName,
        name,
        source: 'Scout by ClientBloom',
        tags:   ['scout-user'],
      }),
    })
    if (!res.ok) {
      console.error('[ghl-platform] upsertContact failed:', res.status, await res.text().catch(() => ''))
      return null
    }
    const data = await res.json()
    const id = data?.contact?.id || data?.id || null
    if (!id) console.error('[ghl-platform] upsertContact: unexpected response shape:', JSON.stringify(data).slice(0, 300))
    return id
  } catch (e: any) {
    console.error('[ghl-platform] upsertContact error:', e.message)
    return null
  }
}

async function createOpportunity(
  apiKey:         string,
  contactId:      string,
  stageId:        string,
  name:           string,
  monetaryValue?: number,
): Promise<string | null> {
  try {
    const body: Record<string, unknown> = {
      locationId:      GHL_LOCATION_ID,
      pipelineId:      GHL_PIPELINE_ID,
      pipelineStageId: stageId,
      name,
      contactId,
      status: 'open',
    }
    if (monetaryValue !== undefined) body.monetaryValue = monetaryValue

    const res = await fetch(`${GHL_BASE}/opportunities/`, {
      method:  'POST',
      headers: ghlHeaders(apiKey),
      body:    JSON.stringify(body),
    })
    if (!res.ok) {
      console.error('[ghl-platform] createOpportunity failed:', res.status, await res.text().catch(() => ''))
      return null
    }
    const data = await res.json()
    const id = data?.opportunity?.id || data?.id || null
    if (!id) console.error('[ghl-platform] createOpportunity: unexpected response shape:', JSON.stringify(data).slice(0, 300))
    return id
  } catch (e: any) {
    console.error('[ghl-platform] createOpportunity error:', e.message)
    return null
  }
}

async function updateOpportunityStage(
  apiKey:         string,
  oppId:          string,
  stageId:        string,
  monetaryValue?: number,
): Promise<boolean> {
  try {
    const body: Record<string, unknown> = { pipelineStageId: stageId }
    if (monetaryValue !== undefined) body.monetaryValue = monetaryValue

    const res = await fetch(`${GHL_BASE}/opportunities/${oppId}`, {
      method:  'PUT',
      headers: ghlHeaders(apiKey),
      body:    JSON.stringify(body),
    })
    if (!res.ok) {
      console.error('[ghl-platform] updateOpportunityStage failed:', res.status, await res.text().catch(() => ''))
      return false
    }
    return true
  } catch (e: any) {
    console.error('[ghl-platform] updateOpportunityStage error:', e.message)
    return false
  }
}

// ── Internal: move stage using stored Airtable IDs ────────────────────────────

async function moveStage(
  apiKey:            string,
  email:             string,
  stageId:           string,
  airtableRecordId:  string,
  fallbackPlan?:     string,
): Promise<void> {
  const { contactId: storedContactId, oppId: storedOppId } = await readGhlIds(airtableRecordId)

  if (storedOppId) {
    // Fast path: use stored opportunity ID directly
    await updateOpportunityStage(apiKey, storedOppId, stageId)
    console.log(`[ghl-platform] Moved stage for ${email} → ${stageId.slice(0, 8)}... (stored ID)`)
    return
  }

  // Slow path: stored ID missing (legacy tenant or Airtable write failed at creation).
  // Upsert contact and create a new opportunity at the target stage.
  console.warn(`[ghl-platform] No stored GHL opp ID for ${email} (${airtableRecordId}) — creating new`)
  const contactId = storedContactId || await upsertContact(apiKey, email, fallbackPlan || 'Scout User')
  if (!contactId) return

  const oppName = fallbackPlan ? `${fallbackPlan} — ${email}` : `Scout — ${email}`
  const newOppId = await createOpportunity(apiKey, contactId, stageId, oppName)
  if (newOppId && contactId) {
    await storeGhlIds(airtableRecordId, contactId, newOppId)
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Called on trial signup.
 * Creates GHL contact + opportunity, stores both IDs in Airtable.
 * Guards against duplicates — safe to retry.
 * Must be awaited at the call site.
 */
export async function ghlAddTrialUser(
  email:            string,
  name:             string,
  airtableRecordId: string,
): Promise<void> {
  const apiKey = process.env.SCOUT_GHL_API_KEY || ''
  if (!apiKey) return

  // Duplicate guard: if IDs already stored (retry), skip creation
  const existing = await readGhlIds(airtableRecordId)
  if (existing.oppId) {
    console.log(`[ghl-platform] Trial opportunity already exists for ${email} — skipping create`)
    return
  }

  const contactId = await upsertContact(apiKey, email, name)
  if (!contactId) return

  const oppId = await createOpportunity(apiKey, contactId, GHL_STAGE.trial, `Scout Trial — ${name || email}`)
  if (oppId) {
    await storeGhlIds(airtableRecordId, contactId, oppId)
    console.log(`[ghl-platform] Added trial user to GHL: ${email}`)
  }
}

/**
 * Called on paid conversion (trial → paid, or direct purchase).
 * Upserts contact, stores GHL IDs if missing, moves or creates opportunity at Paid stage.
 * Must be awaited at the call site.
 */
export async function ghlMoveToPaid(
  email:            string,
  name:             string,
  plan:             string,
  airtableRecordId: string,
): Promise<void> {
  const apiKey = process.env.SCOUT_GHL_API_KEY || ''
  if (!apiKey) return

  const { oppId: storedOppId, contactId: storedContactId } = await readGhlIds(airtableRecordId)
  const price = planPrice(plan)

  if (storedOppId) {
    // Move existing opportunity (trial conversion) — also stamp monetary value
    await updateOpportunityStage(apiKey, storedOppId, GHL_STAGE.paid, price)
    console.log(`[ghl-platform] Moved to Paid Subscriber in GHL: ${email} (${plan}${price !== undefined ? `, $${price}` : ''})`)
    return
  }

  // No stored opp — direct purchase (no prior trial) or first time.
  const contactId = storedContactId || await upsertContact(apiKey, email, name)
  if (!contactId) return

  const oppId = await createOpportunity(apiKey, contactId, GHL_STAGE.paid, `Scout ${plan} — ${name || email}`, price)
  if (oppId) {
    await storeGhlIds(airtableRecordId, contactId, oppId)
    console.log(`[ghl-platform] Created Paid Subscriber in GHL: ${email} (${plan}${price !== undefined ? `, $${price}` : ''})`)
  }
}

/**
 * Called by trial-check cron on trial expiry.
 * Must be awaited at the call site.
 */
export async function ghlMoveToExpired(email: string, airtableRecordId: string): Promise<void> {
  const apiKey = process.env.SCOUT_GHL_API_KEY || ''
  if (!apiKey) return
  await moveStage(apiKey, email, GHL_STAGE.expired, airtableRecordId, 'Trial Expired')
}

/**
 * Called when a tenant is archived via admin panel or CSM agent.
 * Must be awaited at the call site.
 */
export async function ghlMoveToArchived(email: string, airtableRecordId: string): Promise<void> {
  const apiKey = process.env.SCOUT_GHL_API_KEY || ''
  if (!apiKey) return
  await moveStage(apiKey, email, GHL_STAGE.archived, airtableRecordId)
}

/**
 * Called when a tenant is unarchived.
 * Moves to Paid Subscriber for paid plans, Trial User for trial plan.
 * Must be awaited at the call site.
 */
export async function ghlRestoreFromArchived(
  email:            string,
  plan:             string,
  airtableRecordId: string,
): Promise<void> {
  const apiKey = process.env.SCOUT_GHL_API_KEY || ''
  if (!apiKey) return
  const targetStage = PAID_PLANS.has(plan) ? GHL_STAGE.paid : GHL_STAGE.trial
  await moveStage(apiKey, email, targetStage, airtableRecordId, plan)
}
