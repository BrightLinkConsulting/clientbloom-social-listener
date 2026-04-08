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
import { getTenantConfig, tenantError } from '@/lib/tenant'
import { airtableList, airtableUpdate, verifyRecordTenant } from '@/lib/airtable'

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
    data.postUrl          ? `Post: ${data.postUrl}`             : '',
    '',
    `Post snippet:`,
    (data.postText || '').slice(0, 300) + ((data.postText || '').length > 300 ? '…' : ''),
    data.notes ? `\nMy notes: ${data.notes}` : '',
  ]
  return lines.filter(l => l !== undefined).join('\n').trim()
}

async function pushToGHL(apiKey: string, body: any) {
  const { firstName, lastName } = parseName(body.authorName)

  const upsertResp = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Version': '2021-07-28' },
    body: JSON.stringify({
      firstName,
      lastName,
      source: 'ClientBloom Listener',
      tags: ['clientbloom-listener', body.platform?.toLowerCase() === 'linkedin' ? 'linkedin-icp' : 'facebook-lead'],
    }),
  })

  if (!upsertResp.ok) throw new Error(`GHL upsert failed: ${await upsertResp.text()}`)

  const upsertData = await upsertResp.json()
  const contactId: string = upsertData?.contact?.id || upsertData?.id || ''
  if (!contactId) throw new Error('GHL did not return a contact ID')

  const noteBody = buildNoteBody(body)
  await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}/notes`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Version': '2021-07-28' },
    body: JSON.stringify({ body: noteBody }),
  }).catch(() => {})

  return { contactId, contactUrl: `https://app.gohighlevel.com/contacts/${contactId}` }
}

async function pushToHubSpot(apiKey: string, body: any) {
  const { firstName, lastName } = parseName(body.authorName)
  const noteBody = buildNoteBody(body)

  const createResp = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      properties: { firstname: firstName, lastname: lastName, hs_lead_status: 'NEW' },
    }),
  })

  if (!createResp.ok && createResp.status !== 409) {
    throw new Error(`HubSpot create failed: ${await createResp.text()}`)
  }

  const createData = await createResp.json()
  const contactId: string = createData?.id || ''

  if (contactId) {
    await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: { hs_note_body: noteBody, hs_timestamp: new Date().toISOString() },
        associations: [{ to: { id: contactId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }] }],
      }),
    }).catch(() => null)
  }

  return { contactId, contactUrl: contactId ? `https://app.hubspot.com/contacts/contact/${contactId}` : '' }
}

export async function POST(req: Request) {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()
  const { tenantId } = tenant

  try {
    const body = await req.json()
    const { recordId } = body

    // Ownership check — verify the post record belongs to this tenant before
    // writing CRM metadata back to it (prevents cross-tenant IDOR)
    if (recordId) {
      const owned = await verifyRecordTenant('Captured Posts', recordId, tenantId)
      if (!owned) {
        return NextResponse.json({ error: 'Not found.' }, { status: 404 })
      }
    }

    // Fetch CRM settings from this tenant's Business Profile
    const bpResp = await airtableList('Business Profile', tenantId, { pageSize: '1' })
    if (!bpResp.ok) throw new Error('Could not load CRM settings')
    const bpData   = await bpResp.json()
    const bpRecord = bpData.records?.[0]?.fields || {}

    const crmType = bpRecord['CRM Type']    || 'None'
    const crmKey  = bpRecord['CRM API Key'] || ''

    if (!crmKey || crmType === 'None') {
      return NextResponse.json({ error: 'No CRM configured. Set up your CRM in Settings → System.' }, { status: 400 })
    }

    let result: { contactId: string; contactUrl: string }

    if      (crmType === 'GoHighLevel') result = await pushToGHL(crmKey, body)
    else if (crmType === 'HubSpot')     result = await pushToHubSpot(crmKey, body)
    else return NextResponse.json({ error: `Unknown CRM type: ${crmType}` }, { status: 400 })

    // Write CRM contact ID back to the post record and move it to the "In CRM" tab
    if (recordId && result.contactId) {
      await airtableUpdate('Captured Posts', recordId, {
        'CRM Contact ID':    result.contactId,
        'CRM Pushed At':     new Date().toISOString(),
        'Action':            'CRM',
        'Engagement Status': '',
      }).catch(() => {})
    }

    return NextResponse.json({ ok: true, ...result, crmType })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
