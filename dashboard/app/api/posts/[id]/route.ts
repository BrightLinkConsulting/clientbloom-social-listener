/**
 * /api/posts/[id] — Update a post's Action, Engagement Status, or Notes in Airtable.
 *
 * Body options:
 *   { action: 'New' | 'Engaged' | 'Skipped' }           — standard status change
 *   { action: 'Replied' }                                — keeps Action=Engaged, sets Engagement Status=replied
 *   { action: 'Archived' }                               — sets Engagement Status=archived
 *   { notes: string }                                    — saves user notes
 *   { crmContactId: string, crmPushedAt: string }        — saves CRM push metadata
 */

import { NextRequest, NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import { airtableUpdate } from '@/lib/airtable'

const TABLE = 'Captured Posts'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()

  const { id } = params
  const body = await request.json()
  const { action, notes, crmContactId, crmPushedAt } = body

  const coreActions = ['New', 'Engaged', 'Skipped']
  const subStatuses = ['Replied', 'Archived']
  const allActions  = [...coreActions, ...subStatuses]

  if (action && !allActions.includes(action)) {
    return NextResponse.json(
      { error: `Invalid action. Must be one of: ${allActions.join(', ')}` },
      { status: 400 }
    )
  }

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
