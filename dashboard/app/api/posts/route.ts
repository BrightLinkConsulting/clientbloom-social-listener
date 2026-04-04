/**
 * /api/posts — Server-side Airtable proxy.
 * Returns filtered posts + metadata: action counts, last scrape time, available groups.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import { SHARED_BASE, PROV_TOKEN, tenantFilter } from '@/lib/airtable'

const AIRTABLE_BASE = 'https://api.airtable.com/v0'

export async function GET(request: NextRequest) {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()

  const { tenantId } = tenant
  const tableName = 'Captured Posts'

  const { searchParams } = new URL(request.url)
  const action   = searchParams.get('action')   || 'New'
  const platform = searchParams.get('platform')
  const minScore = searchParams.get('minScore') || '0'
  const group    = searchParams.get('group')    || ''
  const limit    = searchParams.get('limit')    || '100'
  const offset   = searchParams.get('offset')  || ''

  // --- Build filter formula ---
  const filters: string[] = [tenantFilter(tenantId)]

  if (action && action !== 'all') {
    if (action === 'New') {
      filters.push(`OR({Action}='New', {Action}='')`)
      filters.push(`{Engagement Status}!='archived'`)
    } else if (action === 'Engaged') {
      filters.push(`{Action}='Engaged'`)
      filters.push(`OR({Engagement Status}='', {Engagement Status}=BLANK())`)
    } else if (action === 'Replied') {
      filters.push(`{Action}='Engaged'`)
      filters.push(`{Engagement Status}='replied'`)
    } else if (action === 'Archived') {
      filters.push(`{Engagement Status}='archived'`)
    } else {
      filters.push(`{Action}='${action}'`)
    }
  }
  if (platform && platform !== 'all') filters.push(`{Platform}='${platform}'`)
  if (minScore && minScore !== '0')   filters.push(`{Relevance Score}>=${minScore}`)
  if (group    && group    !== 'all') filters.push(`{Group Name}='${group.replace(/'/g, "\\'")}'`)

  const formula = filters.length > 1
    ? `AND(${filters.join(', ')})`
    : filters[0]

  const params = new URLSearchParams({
    'sort[0][field]':     'Relevance Score',
    'sort[0][direction]': 'desc',
    'sort[1][field]':     'Captured At',
    'sort[1][direction]': 'desc',
    pageSize: limit,
  })
  params.set('filterByFormula', formula)
  if (offset) params.set('offset', offset)

  const postsUrl = `${AIRTABLE_BASE}/${SHARED_BASE}/${encodeURIComponent(tableName)}?${params}`

  // Meta query — just action/status/time fields, still filtered by tenant
  const metaFormula = tenantFilter(tenantId)
  const metaParams = new URLSearchParams({
    filterByFormula: metaFormula,
    'fields[]':  'Action',
    'fields[1]': 'Captured At',
    'fields[2]': 'Engagement Status',
    pageSize: '100',
  })
  const metaUrl = `${AIRTABLE_BASE}/${SHARED_BASE}/${encodeURIComponent(tableName)}?${metaParams}`

  // Sources query — filtered by tenant
  const sourcesFormula = `AND(${tenantFilter(tenantId)}, {Type}='facebook_group', {Active}=1)`
  const sourcesParams = new URLSearchParams({
    filterByFormula: sourcesFormula,
    'fields[]': 'Name',
    pageSize: '100',
  })
  const sourcesUrl = `${AIRTABLE_BASE}/${SHARED_BASE}/Sources?${sourcesParams}`

  const authHeader = { 'Authorization': `Bearer ${PROV_TOKEN}` }

  const [postsResp, metaResp, sourcesResp] = await Promise.all([
    fetch(postsUrl,   { headers: authHeader, next: { revalidate: 0 } }),
    fetch(metaUrl,    { headers: authHeader, next: { revalidate: 0 } }),
    fetch(sourcesUrl, { headers: authHeader, next: { revalidate: 0 } }),
  ])

  if (!postsResp.ok) {
    return NextResponse.json({ error: await postsResp.text() }, { status: postsResp.status })
  }

  const [postsData, metaData, sourcesData] = await Promise.all([
    postsResp.json(),
    metaResp.json(),
    sourcesResp.ok ? sourcesResp.json() : Promise.resolve({ records: [] }),
  ])

  const actionCounts: Record<string, number> = { New: 0, Engaged: 0, Replied: 0, Skipped: 0, CRM: 0, Archived: 0 }
  let lastScrapedAt: string | null = null

  for (const record of metaData.records || []) {
    const f  = record.fields || {}
    const a  = f['Action']            || 'New'
    const es = f['Engagement Status'] || ''

    if (es === 'archived') {
      actionCounts['Archived'] = (actionCounts['Archived'] || 0) + 1
    } else if (a === 'Engaged' && es === 'replied') {
      actionCounts['Replied'] = (actionCounts['Replied'] || 0) + 1
    } else {
      actionCounts[a] = (actionCounts[a] || 0) + 1
    }

    const capturedAt = f['Captured At']
    if (capturedAt && (!lastScrapedAt || capturedAt > lastScrapedAt)) {
      lastScrapedAt = capturedAt
    }
  }

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
