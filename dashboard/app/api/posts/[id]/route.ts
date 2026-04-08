/**
 * /api/posts/[id] — Update a post's Action, Engagement Status, Notes, or Reply Log.
 *
 * Body options:
 *   { action: 'New' | 'Engaged' | 'Skipped' }           — standard status change
 *   { action: 'Replied' }                                — keeps Action=Engaged, sets Engagement Status=replied
 *   { action: 'Archived' }                               — sets Engagement Status=archived
 *   { notes: string }                                    — saves notes + Notes Updated By from session
 *   { appendReplyLog: string }                           — appends a new entry to Reply Log with attribution
 *   { crmContactId: string, crmPushedAt: string }        — saves CRM push metadata
 */

import { NextRequest, NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import { airtableUpdate, verifyRecordTenant, SHARED_BASE, PROV_TOKEN } from '@/lib/airtable'

const TABLE = 'Captured Posts'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()

  const { id } = params

  // Ownership check — prevent cross-tenant IDOR
  const owned = await verifyRecordTenant(TABLE, id, tenant.tenantId)
  if (!owned) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const body = await request.json()
  const { action, notes, appendReplyLog, crmContactId, crmPushedAt } = body

  const coreActions = ['New', 'Engaged', 'Skipped', 'CRM']
  const subStatuses = ['Replied', 'Archived']
  const allActions  = [...coreActions, ...subStatuses]

  if (action && !allActions.includes(action)) {
    return NextResponse.json(
      { error: `Invalid action. Must be one of: ${allActions.join(', ')}` },
      { status: 400 }
    )
  }

  // ── Handle appendReplyLog (read-then-write to append an entry) ─────────────
  if (appendReplyLog !== undefined) {
    let currentLog: { text: string; by: string; at: string }[] = []
    try {
      const getResp = await fetch(
        `https://api.airtable.com/v0/${SHARED_BASE}/${encodeURIComponent(TABLE)}/${id}?fields[]=Reply%20Log`,
        { headers: { Authorization: `Bearer ${PROV_TOKEN}` } }
      )
      if (getResp.ok) {
        const record = await getResp.json()
        const raw = record.fields?.['Reply Log']
        if (raw) currentLog = JSON.parse(raw)
      }
    } catch { /* start with empty log */ }

    currentLog.push({
      text: appendReplyLog,
      by:   tenant.email,
      at:   new Date().toISOString(),
    })

    const logResp = await airtableUpdate(TABLE, id, { 'Reply Log': JSON.stringify(currentLog) })
    if (!logResp.ok) {
      return NextResponse.json({ error: await logResp.text() }, { status: logResp.status })
    }
    return NextResponse.json({ ok: true })
  }

  // ── Standard field updates ─────────────────────────────────────────────────
  const fields: Record<string, any> = {}

  if (action) {
    if (coreActions.includes(action)) {
      fields['Action']            = action
      fields['Engagement Status'] = ''
    } else if (action === 'Replied') {
      fields['Action']            = 'Engaged'
      fields['Engagement Status'] = 'replied'
    } else if (action === 'Archived') {
      fields['Engagement Status'] = 'archived'
    }
  }

  if (notes !== undefined) {
    fields['Notes']            = notes
    fields['Notes Updated At'] = new Date().toISOString()
    fields['Notes Updated By'] = tenant.email
  }

  if (crmContactId !== undefined) fields['CRM Contact ID'] = crmContactId
  if (crmPushedAt  !== undefined) fields['CRM Pushed At']  = crmPushedAt

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const response = await airtableUpdate(TABLE, id, fields)

  if (!response.ok) {
    return NextResponse.json({ error: await response.text() }, { status: response.status })
  }

  return NextResponse.json(await response.json())
}
