/**
 * /api/crm-push
 *
 * POST — push an engaged post's author as a contact into the configured CRM
 *
 * Body: {
 *   recordId:        string   — Airtable record ID of the post
 *   authorName:      string
 *   authorProfileUrl:string
 *   postText:        string
 *   postUrl:         string
 *   platform:        string
 *   notes:           string   — user's engagement notes
 *   engagedAt:       string   — ISO date
 * }
 *
 * Returns: { ok: true, contactId, contactUrl }
 */

import { NextResponse } from 'next/server'

const AIRTABLE_TOKEN = process.env.AIRTABLE_API_TOKEN!
const BASE_ID        = process.env.AIRTABLE_BASE_ID!

// ---- Helpers ----
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
    `Source: ClientBloom Social Listener`,
    `Platform: ${data.platform}`,
    `Engaged: ${data.engagedAt ? new Date(data.engagedAt).toLocaleDateString() : 'today'}`,
    data.authorProfileUrl ? `Profile: ${data.authorProfileUrl}` : '',
    data.postUrl          ? `Post: ${data.postUrl}` : '',
    '',
    `Post snippet:`,
    (data.postText || '').slice(0, 300) + ((data.postText || '').length > 300 ? '…' : ''),
    data.notes ? `\nMy notes: ${data.notes}` : '',
  ]
  return lines.filter(l => l !== undefined).join('\n').trim()
}

// ---- GHL ----
async function pushToGHL(apiKey: string, body: any) {
  const { firstName, lastName } = parseName(body.authorName)

  // Upsert contact
  const upsertResp = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
      'Version':       '2021-07-28',
    },
    body: JSON.stringify({
      firstName,
      lastName,
      source: 'ClientBloom Listener',
      tags:   ['clientbloom-listener', body.platform?.toLowerCase() === 'linkedin' ? 'linkedin-icp' : 'facebook-lead'],
    }),
  })

  if (!upsertResp.ok) {
    const err = await upsertResp.text()
    throw new Error(`GHL upsert failed: ${err}`)
  }

  const upsertData = await upsertResp.json()
  const contactId: string = upsertData?.contact?.id || upsertData?.id || ''

  if (!contactId) throw new Error('GHL did not return a contact ID')

  // Add a note to the contact
  const noteBody = buildNoteBody(body)
  await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}/notes`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
      'Version':       '2021-07-28',
    },
    body: JSON.stringify({ body: noteBody }),
  }).catch(() => { /* non-fatal — note failed, contact still created */ })

  return {
    contactId,
    contactUrl: `https://app.gohighlevel.com/contacts/${contactId}`,
  }
}

// ---- HubSpot ----
async function pushToHubSpot(apiKey: string, body: any) {
  const { firstName, lastName } = parseName(body.authorName)
  const noteBody = buildNoteBody(body)

  // Create/find contact via email (no email = use name as dedup key via search)
  const createResp = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      properties: {
        firstname:      firstName,
        lastname:       lastName,
        hs_lead_status: 'NEW',
      },
    }),
  })

  if (!createResp.ok) {
    const err = await createResp.text()
    // 409 = conflict (already exists) — try to get the existing one
    if (createResp.status !== 409) throw new Error(`HubSpot create failed: ${err}`)
  }

  const createData = await createResp.json()
  const contactId: string = createData?.id || ''

  if (contactId) {
    // Add an engagement note
    const noteResp = await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        properties: {
          hs_note_body: noteBody,
          hs_timestamp: new Date().toISOString(),
        },
        associations: [{
          to:    { id: contactId },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }],
        }],
      }),
    }).catch(() => null)
  }

  return {
    contactId,
    contactUrl: contactId ? `https://app.hubspot.com/contacts/contact/${contactId}` : '',
  }
}

// ---- Main handler ----
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { recordId } = body

    // Fetch CRM settings from Business Profile
    const bpResp = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent('Business Profile')}?pageSize=1`,
      { headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}` } }
    )
    if (!bpResp.ok) throw new Error('Could not load CRM settings')
    const bpData   = await bpResp.json()
    const bpRecord = bpData.records?.[0]?.fields || {}

    const crmType  = bpRecord['CRM Type']    || 'None'
    const crmKey   = bpRecord['CRM API Key'] || ''

    if (!crmKey || crmType === 'None') {
      return NextResponse.json({ error: 'No CRM configured. Set up your CRM in Settings → System.' }, { status: 400 })
    }

    let result: { contactId: string; contactUrl: string }

    if (crmType === 'GoHighLevel') {
      result = await pushToGHL(crmKey, body)
    } else if (crmType === 'HubSpot') {
      result = await pushToHubSpot(crmKey, body)
    } else {
      return NextResponse.json({ error: `Unknown CRM type: ${crmType}` }, { status: 400 })
    }

    // Write CRM contact ID back to the Airtable post record
    if (recordId && result.contactId) {
      await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent('Captured Posts')}/${recordId}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
            'Content-Type':  'application/json',
          },
          body: JSON.stringify({
            fields: {
              'CRM Contact ID': result.contactId,
              'CRM Pushed At':  new Date().toISOString(),
            },
          }),
        }
      ).catch(() => { /* non-fatal */ })
    }

    return NextResponse.json({ ok: true, ...result, crmType })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
