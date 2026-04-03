/**
 * /api/posts/[id] — Update a post's Action status in Airtable.
 * Called when Joseph clicks Engage, Skip, or Undo on a post card.
 */

import { NextRequest, NextResponse } from 'next/server'

const AIRTABLE_BASE = 'https://api.airtable.com/v0'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = process.env.AIRTABLE_API_TOKEN
  const baseId = process.env.AIRTABLE_BASE_ID
  const tableName = process.env.AIRTABLE_POSTS_TABLE || 'Captured Posts'

  if (!token || !baseId) {
    return NextResponse.json({ error: 'Airtable credentials not configured' }, { status: 500 })
  }

  const { id } = params
  const body = await request.json()
  const { action } = body

  const validActions = ['New', 'Engaged', 'Skipped']
  if (!action || !validActions.includes(action)) {
    return NextResponse.json({ error: `Invalid action. Must be one of: ${validActions.join(', ')}` }, { status: 400 })
  }

  const url = `${AIRTABLE_BASE}/${baseId}/${encodeURIComponent(tableName)}/${id}`

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: { Action: action }
    })
  })

  if (!response.ok) {
    const error = await response.text()
    return NextResponse.json({ error }, { status: response.status })
  }

  const data = await response.json()
  return NextResponse.json(data)
}
