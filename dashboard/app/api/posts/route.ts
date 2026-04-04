/**
 * /api/posts — Server-side Airtable proxy.
 * Returns filtered posts + metadata: action counts, last scrape time, available groups.
 */

import { NextRequest, NextResponse } from 'next/server'

const AIRTABLE_BASE = 'https://api.airtable.com/v0'

export async function GET(request: NextRequest) {
  const token = process.env.AIRTABLE_API_TOKEN
  const baseId = process.env.AIRTABLE_BASE_ID
  const tableName = process.env.AIRTABLE_POSTS_TABLE || 'Captured Posts'

  if (!token || !baseId) {
    return NextResponse.json({ error: 'Airtable credentials not configured' }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || 'New'
  const platform = searchParams.get('platform')
  const minScore = searchParams.get('minScore') || '0'
  const group = searchParams.get('group') || ''
  const limit = searchParams.get('limit') || '100'
  const offset = searchParams.get('offset') || ''

  // --- Build filter formula ---
  const filters: string[] = []

  if (action && action !== 'all') {
    if (action === 'New') {
      // Inbox: Action is New/empty AND not archived
      filters.push(`OR({Action}='New', {Action}='')`)
      filters.push(`{Engagement Status}!=\'archived\'`)
    } else if (action === 'Engaged') {
      // Engaged: Action=Engaged AND no sub-status (not replied, not archived)
      filters.push(`{Action}='Engaged'`)
      filters.push(`OR({Engagement Status}='', {Engagement Status}=BLANK())`)
    } else if (action === 'Replied') {
      // Replied: Action=Engaged AND Engagement Status=replied
      filters.push(`{Action}='Engaged'`)
      filters.push(`{Engagement Status}='replied'`)
    } else if (action === 'Archived') {
      filters.push(`{Engagement Status}='archived'`)
    } else {
      filters.push(`{Action}='${action}'`)
    }
  }
  if (platform && platform !== 'all') {
    filters.push(`{Platform}='${platform}'`)
  }
  if (minScore && minScore !== '0') {
    filters.push(`{Relevance Score}>=${minScore}`)
  }
  if (group && group !== 'all') {
    // Escape single quotes in group name
    filters.push(`{Group Name}='${group.replace(/'/g, "\\'")}'`)
  }

  const formula = filters.length > 1
    ? `AND(${filters.join(', ')})`
    : filters.length === 1
    ? filters[0]
    : ''

  const params = new URLSearchParams({
    'sort[0][field]': 'Relevance Score',
    'sort[0][direction]': 'desc',
    'sort[1][field]': 'Captured At',
    'sort[1][direction]': 'desc',
    pageSize: limit,
  })
  if (formula) params.set('filterByFormula', formula)
  if (offset) params.set('offset', offset)

  const postsUrl = `${AIRTABLE_BASE}/${baseId}/${encodeURIComponent(tableName)}?${params}`

  // --- Fetch metadata (action counts + last scrape) from all posts records ---
  const metaParams = new URLSearchParams({
    'fields[]':  'Action',
    'fields[1]': 'Captured At',
    'fields[2]': 'Engagement Status',
    pageSize: '100',
  })
  const metaUrl = `${AIRTABLE_BASE}/${baseId}/${encodeURIComponent(tableName)}?${metaParams}`

  // --- Fetch active Facebook groups from Sources table (canonical group list) ---
  const sourcesParams = new URLSearchParams({
    filterByFormula: "AND({Type}='facebook_group', {Active}=1)",
    'fields[]': 'Name',
    pageSize: '100',
  })
  const sourcesUrl = `${AIRTABLE_BASE}/${baseId}/Sources?${sourcesParams}`

  // Run all three fetches in parallel
  const [postsResp, metaResp, sourcesResp] = await Promise.all([
    fetch(postsUrl, {
      headers: { 'Authorization': `Bearer ${token}` },
      next: { revalidate: 0 }
    }),
    fetch(metaUrl, {
      headers: { 'Authorization': `Bearer ${token}` },
      next: { revalidate: 0 }
    }),
    fetch(sourcesUrl, {
      headers: { 'Authorization': `Bearer ${token}` },
      next: { revalidate: 0 }
    })
  ])

  if (!postsResp.ok) {
    const error = await postsResp.text()
    return NextResponse.json({ error }, { status: postsResp.status })
  }

  const [postsData, metaData, sourcesData] = await Promise.all([
    postsResp.json(),
    metaResp.json(),
    sourcesResp.ok ? sourcesResp.json() : Promise.resolve({ records: [] })
  ])

  // Compute metadata from all records
  const actionCounts: Record<string, number> = { New: 0, Engaged: 0, Replied: 0, Skipped: 0, Archived: 0 }
  let lastScrapedAt: string | null = null

  for (const record of metaData.records || []) {
    const f  = record.fields || {}
    const a  = f['Action']            || 'New'
    const es = f['Engagement Status'] || ''

    // Derive logical status from Action + Engagement Status
    if (es === 'archived') {
      actionCounts['Archived'] = (actionCounts['Archived'] || 0) + 1
    } else if (a === 'Engaged' && es === 'replied') {
      actionCounts['Replied'] = (actionCounts['Replied'] || 0) + 1
    } else {
      actionCounts[a] = (actionCounts[a] || 0) + 1
    }

    // Track most recent captured time
    const capturedAt = f['Captured At']
    if (capturedAt && (!lastScrapedAt || capturedAt > lastScrapedAt)) {
      lastScrapedAt = capturedAt
    }
  }

  // Build group list from Sources table (the single source of truth)
  const availableGroups = (sourcesData.records || [])
    .map((r: any) => r.fields?.Name || '')
    .filter(Boolean)
    .sort()

  return NextResponse.json({
    ...postsData,
    actionCounts,
    lastScrapedAt,
    availableGroups,
  })
}
