/**
 * /api/crm-push
 *
 * POST — push an engaged post's author as a contact into the configured CRM,
 *        then optionally create an Opportunity in the configured pipeline.
 *
 * Body: {
 *   recordId:        string   — Airtable record ID of the post
 *   authorName:      string
 *   authorProfileUrl:string   — LinkedIn profile URL (used as dedup identity)
 *   postText:        string
 *   postUrl:         string
 *   platform:        string
 *   notes:           string   — user's engagement notes
 *   engagedAt:       string   — ISO date
 * }
 *
 * Returns: { ok: true, contactId, contactUrl, opportunityId?, noteWarning? }
 *
 * GHL implementation notes:
 * ─────────────────────────
 * • Requires a Private Integration token (not the legacy Location API Key).
 *   Private Integration tokens are scoped to a specific GHL sub-account.
 * • locationId must be sent in the request body for contact and opportunity endpoints.
 * • Deduplication strategy (no email available from LinkedIn posts):
 *   1. Search GHL contacts by author full name in the given location.
 *   2. If any result has website == authorProfileUrl, treat it as the same person → PATCH.
 *   3. Otherwise POST a new contact via upsert with website = LinkedIn URL.
 * • After contact upsert, creates a GHL Opportunity at stage[0] of the configured pipeline.
 *   Pipeline stage is fetched live so this works with any customer's pipeline config.
 * • Note creation failures are surfaced as warnings (non-fatal) — contact + opportunity still succeed.
 */

import { NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import { airtableList, airtableUpdate, verifyRecordTenant } from '@/lib/airtable'

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseName(fullName: string): { firstName: string; lastName: string } {
  const parts = (fullName || '').trim().split(/\s+/)
  if (parts.length === 0 || !parts[0]) return { firstName: 'Unknown', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

function buildNoteBody(data: {
  platform:         string
  postUrl:          string
  authorProfileUrl: string
  postText:         string
  notes:            string
  engagedAt:        string
}): string {
  const lines = [
    `Source: Scout by ClientBloom`,
    `Platform: ${data.platform}`,
    `Engaged: ${data.engagedAt ? new Date(data.engagedAt).toLocaleDateString() : 'today'}`,
    data.authorProfileUrl ? `LinkedIn: ${data.authorProfileUrl}` : '',
    data.postUrl          ? `Post URL: ${data.postUrl}`          : '',
    '',
    `Post snippet:`,
    (data.postText || '').slice(0, 400) + ((data.postText || '').length > 400 ? '…' : ''),
    data.notes ? `\nMy engagement notes: ${data.notes}` : '',
  ]
  return lines.filter(l => l !== undefined).join('\n').trim()
}

// ── GHL helpers ─────────────────────────────────────────────────────────────

const GHL_BASE    = 'https://services.leadconnectorhq.com'
const GHL_VERSION = '2021-07-28'

function ghlHeaders(apiKey: string) {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type':  'application/json',
    'Version':       GHL_VERSION,
  }
}

/**
 * Deduplicate: search GHL for a contact with the same LinkedIn profile URL.
 * Returns the existing GHL contact ID if found, or null.
 */
async function findExistingGHLContact(
  apiKey:      string,
  locationId:  string,
  fullName:    string,
  linkedInUrl: string,
): Promise<string | null> {
  if (!linkedInUrl) return null

  try {
    const { firstName, lastName } = parseName(fullName)
    const query = encodeURIComponent(`${firstName} ${lastName}`.trim())
    const r = await fetch(
      `${GHL_BASE}/contacts/?locationId=${encodeURIComponent(locationId)}&query=${query}&limit=10`,
      { headers: ghlHeaders(apiKey) }
    )
    if (!r.ok) return null

    const data = await r.json()
    const contacts: any[] = data?.contacts || []

    // Match on website field (LinkedIn URL stored there) — exact string match
    const match = contacts.find(
      c => (c.website || '').trim().toLowerCase() === linkedInUrl.trim().toLowerCase()
    )
    return match?.id || null
  } catch {
    return null
  }
}

/**
 * Fetch the first pipeline stage ID for the given pipeline.
 * Returns null if pipeline not found or stages are empty.
 */
async function getFirstPipelineStageId(
  apiKey:     string,
  locationId: string,
  pipelineId: string,
): Promise<string | null> {
  try {
    const r = await fetch(
      `${GHL_BASE}/opportunities/pipelines?locationId=${encodeURIComponent(locationId)}`,
      { headers: ghlHeaders(apiKey) }
    )
    if (!r.ok) return null
    const data = await r.json()
    const pipelines: any[] = data?.pipelines || []
    const pipeline = pipelines.find(p => p.id === pipelineId)
    if (!pipeline) return null
    const sorted = [...(pipeline.stages || [])].sort((a, b) => a.position - b.position)
    return sorted[0]?.id || null
  } catch {
    return null
  }
}

// ── Main GHL push ────────────────────────────────────────────────────────────

async function pushToGHL(
  apiKey:     string,
  locationId: string,
  pipelineId: string,
  body:       {
    authorName:       string
    authorProfileUrl: string
    postText:         string
    postUrl:          string
    platform:         string
    notes:            string
    engagedAt:        string
  }
): Promise<{
  contactId:     string
  contactUrl:    string
  opportunityId: string
  noteWarning:   string
}> {
  const { firstName, lastName } = parseName(body.authorName)
  const linkedInUrl = (body.authorProfileUrl || '').trim()

  // ── Step 1: Deduplicate — find existing contact by LinkedIn URL ──────────
  const existingId = await findExistingGHLContact(apiKey, locationId, body.authorName, linkedInUrl)

  let contactId = existingId

  if (existingId) {
    // PATCH existing contact — update tags and website to keep data fresh
    await fetch(`${GHL_BASE}/contacts/${existingId}`, {
      method:  'PUT',
      headers: ghlHeaders(apiKey),
      body:    JSON.stringify({
        firstName,
        lastName,
        locationId,
        website: linkedInUrl || undefined,
        tags:    ['scout-listener', 'linkedin-engaged'],
        source:  'Scout by ClientBloom',
      }),
    }).catch(() => {}) // non-fatal — contact was found, update is best-effort
  } else {
    // POST new contact via upsert endpoint
    const upsertResp = await fetch(`${GHL_BASE}/contacts/upsert`, {
      method:  'POST',
      headers: ghlHeaders(apiKey),
      body:    JSON.stringify({
        firstName,
        lastName,
        locationId,
        website: linkedInUrl || undefined,
        source:  'Scout by ClientBloom',
        tags:    ['scout-listener', 'linkedin-engaged'],
      }),
    })

    if (!upsertResp.ok) {
      const errText = await upsertResp.text().catch(() => upsertResp.status.toString())
      if (upsertResp.status === 401) {
        throw new Error(`GHL upsert failed: Invalid token (401). Make sure you're using a Private Integration token with contacts.write scope, not the legacy API Key.`)
      }
      throw new Error(`GHL upsert failed: ${errText}`)
    }

    const upsertData = await upsertResp.json()
    contactId = upsertData?.contact?.id || upsertData?.id || ''
    if (!contactId) throw new Error('GHL did not return a contact ID. Check your Private Integration token scopes.')
  }

  // ── Step 2: Add a note to the contact ────────────────────────────────────
  let noteWarning = ''
  const noteBody = buildNoteBody(body)
  const noteResp = await fetch(`${GHL_BASE}/contacts/${contactId}/notes`, {
    method:  'POST',
    headers: ghlHeaders(apiKey),
    body:    JSON.stringify({ body: noteBody, userId: '' }),
  }).catch(e => ({ ok: false, status: 0, text: () => Promise.resolve(e.message) }))

  if (!noteResp.ok) {
    const noteErr = await (noteResp as any).text?.().catch(() => '') || ''
    noteWarning = `Contact created but note attachment failed (${noteErr.slice(0, 80)}). Check opportunities.write scope.`
    console.warn('[crm-push] GHL note creation failed:', noteErr)
  }

  // ── Step 3: Create Opportunity in the configured pipeline ─────────────────
  let opportunityId = ''
  if (pipelineId) {
    const stageId = await getFirstPipelineStageId(apiKey, locationId, pipelineId)
    if (stageId) {
      const oppResp = await fetch(`${GHL_BASE}/opportunities/`, {
        method:  'POST',
        headers: ghlHeaders(apiKey),
        body:    JSON.stringify({
          pipelineId,
          locationId,
          name:            `${body.authorName} — LinkedIn`,
          pipelineStageId: stageId,
          status:          'open',
          contactId,
          monetaryValue:   0,
          source:          'Scout by ClientBloom',
        }),
      }).catch(() => null)

      if (oppResp?.ok) {
        const oppData = await oppResp.json().catch(() => ({}))
        opportunityId = oppData?.opportunity?.id || oppData?.id || ''
      } else if (oppResp) {
        const oppErr = await oppResp.text().catch(() => '')
        console.warn('[crm-push] GHL opportunity creation failed:', oppResp.status, oppErr)
        if (!noteWarning) {
          noteWarning = `Contact created but pipeline assignment failed (${oppResp.status}). Check opportunities.write scope.`
        }
      }
    } else {
      console.warn('[crm-push] Could not resolve pipeline stage for pipelineId:', pipelineId)
      if (!noteWarning) {
        noteWarning = `Contact created but pipeline not found. Double-check the Pipeline ID in CRM settings.`
      }
    }
  }

  // ── Step 4: Build correct GHL deep link ──────────────────────────────────
  const contactUrl = `https://app.gohighlevel.com/v2/location/${locationId}/contacts/detail/${contactId}`

  return { contactId, contactUrl, opportunityId, noteWarning }
}

// ── Plan gate ────────────────────────────────────────────────────────────────

const CRM_ALLOWED_PLANS = new Set(['Scout Agency', 'Owner'])

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()
  const { tenantId, plan } = tenant

  if (!CRM_ALLOWED_PLANS.has(plan)) {
    return NextResponse.json(
      { error: 'CRM push requires the Scout Agency plan.' },
      { status: 403 }
    )
  }

  try {
    const body = await req.json()
    const { recordId } = body

    // Ownership check — prevent cross-tenant IDOR
    if (recordId) {
      const owned = await verifyRecordTenant('Captured Posts', recordId, tenantId)
      if (!owned) {
        return NextResponse.json({ error: 'Not found.' }, { status: 404 })
      }
    }

    // Load CRM settings from Business Profile
    const bpResp = await airtableList('Business Profile', tenantId, { pageSize: '1' })
    if (!bpResp.ok) throw new Error('Could not load CRM settings from your account.')
    const bpData   = await bpResp.json()
    const bpRecord = bpData.records?.[0]?.fields || {}

    const crmType       = bpRecord['CRM Type']        || 'None'
    const crmKey        = bpRecord['CRM API Key']     || ''
    const crmLocationId = bpRecord['CRM Location ID'] || ''
    const crmPipelineId = bpRecord['CRM Pipeline ID'] || ''

    if (!crmKey || crmType === 'None') {
      return NextResponse.json(
        { error: 'No CRM configured. Set up your CRM in Settings → System → CRM Integration.' },
        { status: 400 }
      )
    }

    if (crmType === 'GoHighLevel' && !crmLocationId) {
      return NextResponse.json(
        { error: 'GoHighLevel Location ID is missing. Add it in Settings → System → CRM Integration.' },
        { status: 400 }
      )
    }

    let result: { contactId: string; contactUrl: string; opportunityId: string; noteWarning: string }

    if (crmType === 'GoHighLevel') {
      result = await pushToGHL(crmKey, crmLocationId, crmPipelineId, body)
    } else {
      return NextResponse.json({ error: `CRM type "${crmType}" is not yet supported.` }, { status: 400 })
    }

    // Write CRM metadata back to the Airtable post record
    if (recordId && result.contactId) {
      await airtableUpdate('Captured Posts', recordId, {
        'CRM Contact ID':    result.contactId,
        'CRM Pushed At':     new Date().toISOString(),
        'Action':            'CRM',
        'Engagement Status': '',
      }).catch(() => {})
    }

    return NextResponse.json({
      ok:            true,
      contactId:     result.contactId,
      contactUrl:    result.contactUrl,
      opportunityId: result.opportunityId,
      noteWarning:   result.noteWarning || undefined,
      crmType,
    })

  } catch (e: any) {
    console.error('[crm-push] Error:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
