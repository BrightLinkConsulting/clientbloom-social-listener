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
 * Stage IDs (hardcoded — these are fixed for the Scout lifecycle pipeline):
 *   Trial User     → df3a8ce5-b1b9-458e-8dc6-29a5171e529b
 *   Paid Subscriber→ acdbc33a-3a44-4e57-84bb-2406b848f930
 *   Expired Trial  → 69aef152-bd86-4b54-9d73-8e29cc2fa03f
 *   Archived       → 652e9e98-c9f9-4cc8-85a5-bdf9ec650c7c
 *
 * Required env vars:
 *   SCOUT_GHL_API_KEY  — Private Integration token for the ClientBloom sub-account.
 *                        Create at: GHL > Settings > Private Integrations > Create
 *                        Scope required: contacts.write, contacts.readonly,
 *                                        opportunities.write, opportunities.readonly
 *
 * If SCOUT_GHL_API_KEY is not set, all functions no-op silently so Vercel
 * deploys without the key will not error.
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

type ScoutStage = keyof typeof GHL_STAGE

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

// ── Contact lookup ─────────────────────────────────────────────────────────────

async function findContactByEmail(apiKey: string, email: string): Promise<string | null> {
  try {
    const url =
      `${GHL_BASE}/contacts/?locationId=${encodeURIComponent(GHL_LOCATION_ID)}` +
      `&query=${encodeURIComponent(email)}&limit=5`
    const res  = await fetch(url, { headers: ghlHeaders(apiKey) })
    if (!res.ok) return null
    const data = await res.json()
    const contacts: any[] = data.contacts || []
    // Match on email field specifically (GHL query also searches name/phone)
    const match = contacts.find(
      c => (c.email || '').toLowerCase() === email.toLowerCase()
    )
    return match?.id || null
  } catch (e: any) {
    console.error('[ghl-platform] findContactByEmail error:', e.message)
    return null
  }
}

// ── Opportunity lookup ─────────────────────────────────────────────────────────

async function findOpportunityByContact(apiKey: string, contactId: string): Promise<string | null> {
  try {
    const url =
      `${GHL_BASE}/opportunities/search?location_id=${encodeURIComponent(GHL_LOCATION_ID)}` +
      `&pipeline_id=${encodeURIComponent(GHL_PIPELINE_ID)}` +
      `&contact_id=${encodeURIComponent(contactId)}&limit=5`
    const res  = await fetch(url, { headers: ghlHeaders(apiKey) })
    if (!res.ok) return null
    const data = await res.json()
    const opps: any[] = data.opportunities || []
    return opps[0]?.id || null
  } catch (e: any) {
    console.error('[ghl-platform] findOpportunityByContact error:', e.message)
    return null
  }
}

// ── Upsert contact + create opportunity ───────────────────────────────────────

async function upsertContact(apiKey: string, email: string, name: string): Promise<string | null> {
  try {
    const { firstName, lastName } = parseName(name)
    const res = await fetch(`${GHL_BASE}/contacts/upsert`, {
      method:  'POST',
      headers: ghlHeaders(apiKey),
      body: JSON.stringify({
        locationId: GHL_LOCATION_ID,
        email,
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
    return data?.contact?.id || data?.id || null
  } catch (e: any) {
    console.error('[ghl-platform] upsertContact error:', e.message)
    return null
  }
}

async function createOpportunity(
  apiKey:      string,
  contactId:   string,
  stageId:     string,
  name:        string,
): Promise<string | null> {
  try {
    const res = await fetch(`${GHL_BASE}/opportunities/`, {
      method:  'POST',
      headers: ghlHeaders(apiKey),
      body: JSON.stringify({
        locationId:      GHL_LOCATION_ID,
        pipelineId:      GHL_PIPELINE_ID,
        pipelineStageId: stageId,
        name,
        contactId,
        status: 'open',
      }),
    })
    if (!res.ok) {
      console.error('[ghl-platform] createOpportunity failed:', res.status, await res.text().catch(() => ''))
      return null
    }
    const data = await res.json()
    return data?.opportunity?.id || data?.id || null
  } catch (e: any) {
    console.error('[ghl-platform] createOpportunity error:', e.message)
    return null
  }
}

async function updateOpportunityStage(
  apiKey:        string,
  opportunityId: string,
  stageId:       string,
): Promise<boolean> {
  try {
    const res = await fetch(`${GHL_BASE}/opportunities/${opportunityId}`, {
      method:  'PUT',
      headers: ghlHeaders(apiKey),
      body: JSON.stringify({ pipelineStageId: stageId }),
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

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Called on trial signup. Creates a contact in GHL and places them in the
 * "Trial User" stage of the Scout pipeline. Non-fatal — errors are logged only.
 */
export async function ghlAddTrialUser(email: string, name: string): Promise<void> {
  const apiKey = process.env.SCOUT_GHL_API_KEY || ''
  if (!apiKey) return

  const contactId = await upsertContact(apiKey, email, name)
  if (!contactId) return

  await createOpportunity(apiKey, contactId, GHL_STAGE.trial, `Scout Trial — ${name || email}`)
  console.log(`[ghl-platform] Added trial user to GHL: ${email}`)
}

/**
 * Called on paid conversion (trial → paid, or direct purchase).
 * Upserts contact, then moves or creates the Scout pipeline opportunity to
 * the "Paid Subscriber" stage. Non-fatal.
 */
export async function ghlMoveToPaid(email: string, name: string, plan: string): Promise<void> {
  const apiKey = process.env.SCOUT_GHL_API_KEY || ''
  if (!apiKey) return

  const contactId = await upsertContact(apiKey, email, name)
  if (!contactId) return

  const oppId = await findOpportunityByContact(apiKey, contactId)
  if (oppId) {
    await updateOpportunityStage(apiKey, oppId, GHL_STAGE.paid)
  } else {
    // Direct purchase — no prior trial opportunity. Create at paid stage.
    await createOpportunity(apiKey, contactId, GHL_STAGE.paid, `Scout ${plan} — ${name || email}`)
  }
  console.log(`[ghl-platform] Moved to Paid Subscriber in GHL: ${email} (${plan})`)
}

/**
 * Called by trial-check cron when a trial expires.
 * Moves the Scout pipeline opportunity to "Expired Trial". Non-fatal.
 */
export async function ghlMoveToExpired(email: string): Promise<void> {
  const apiKey = process.env.SCOUT_GHL_API_KEY || ''
  if (!apiKey) return

  const contactId = await findContactByEmail(apiKey, email)
  if (!contactId) return

  const oppId = await findOpportunityByContact(apiKey, contactId)
  if (!oppId) return

  await updateOpportunityStage(apiKey, oppId, GHL_STAGE.expired)
  console.log(`[ghl-platform] Moved to Expired Trial in GHL: ${email}`)
}

/**
 * Called when a tenant is archived via the admin panel.
 * Moves the Scout pipeline opportunity to "Archived". Non-fatal.
 */
export async function ghlMoveToArchived(email: string): Promise<void> {
  const apiKey = process.env.SCOUT_GHL_API_KEY || ''
  if (!apiKey) return

  const contactId = await findContactByEmail(apiKey, email)
  if (!contactId) return

  const oppId = await findOpportunityByContact(apiKey, contactId)
  if (!oppId) return

  await updateOpportunityStage(apiKey, oppId, GHL_STAGE.archived)
  console.log(`[ghl-platform] Moved to Archived in GHL: ${email}`)
}
