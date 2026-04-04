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

const AIRTABLE_BASE = 'https://api.airtable.com/v0'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const token  = process.env.AIRTABLE_API_TOKEN
  const baseId = process.env.AIRTABLE_BASE_ID
  const table  = process.env.AIRTABLE_POSTS_TABLE || 'Captured Posts'

  if (!token || !baseId) {
    return NextResponse.json({ error: 'Airtable credentials not configured' }, { status: 500 })
  }

  const { id } = params
  const body = await request.json()
  const { action, notes, crmContactId, crmPushedAt } = body

  const coreActions   = ['New', 'Engaged', 'Skipped']
  const subStatuses   = ['Replied', 'Archived']
  const allActions    = [...coreActions, ...subStatuses]

  if (action && !allActions.includes(action)) {
    return NextResponse.json(
      { error: `Invalid action. Must be one of: ${allActions.join(', ')}` },
      { status: 400 }
    )
  }

  // Build Airtable fields object
  const fields: Record<string, any> = {}

  if (action) {
    if (coreActions.includes(action)) {
      // Standard action — set Action field, clear Engagement Status
      fields['Action']            = action
      fields['Engagement Status'] = ''
    } else if (action === 'Replied') {
      // They replied — keep as Engaged, mark sub-status
      fields['Action']            = 'Engaged'
      fields['Engagement Status'] = 'replied'
    } else if (action === 'Archived') {
      // Archive — keep existing Action, mark as archived
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

  const url = `${AIRTABLE_BASE}/${baseId}/${encodeURIComponent(table)}/${id}`

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  })

  if (!response.ok) {
    const error = await response.text()
    return NextResponse.json({ error }, { status: response.status })
  }

  return NextResponse.json(await response.json())
}
