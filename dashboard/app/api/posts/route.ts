/**
 * /api/posts — Server-side Airtable proxy.
 * Returns filtered posts + metadata: action counts, last scrape time.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import { SHARED_BASE, PROV_TOKEN, tenantFilter } from '@/lib/airtable'
import { escapeAirtableString } from '@/lib/tier'

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
  if (platform && platform !== 'all') filters.push(`{Platform}='${escapeAirtableString(platform)}'`)
  if (minScore && minScore !== '0')   filters.push(`{Relevance Score}>=${minScore}`)

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

  // Meta query — paginated so tab counts are accurate beyond Airtable's 100-record cap
  const authHeader = { 'Authorization': `Bearer ${PROV_TOKEN}` }

  const metaFormula = tenantFilter(tenantId)
  const metaParams  = new URLSearchParams({
    filterByFormula: metaFormula,
    'fields[]':  'Action',
    'fields[1]': 'Captured At',
    'fields[2]': 'Engagement Status',
    pageSize: '100',
  })

  // Paginate meta records so counts reflect the full dataset, not just the first page
  const allMetaRecords: any[] = []
  let metaOffset: string | undefined
  do {
    if (metaOffset) metaParams.set('offset', metaOffset)
    else metaParams.delete('offset')
    const r    = await fetch(`${AIRTABLE_BASE}/${SHARED_BASE}/${encodeURIComponent(tableName)}?${metaParams}`, {
      headers: authHeader, next: { revalidate: 0 },
    })
    const data = await r.json()
    allMetaRecords.push(...(data.records || []))
    metaOffset = data.offset
  } while (metaOffset)

  const postsResp = await fetch(postsUrl, { headers: authHeader, next: { revalidate: 0 } })

  if (!postsResp.ok) {
    return NextResponse.json({ error: await postsResp.text() }, { status: postsResp.status })
  }

  const postsData = await postsResp.json()

  const actionCounts: Record<string, number> = { New: 0, Engaged: 0, Replied: 0, Skipped: 0, Archived: 0 }
  let lastScrapedAt: string | null = null

  for (const record of allMetaRecords) {
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

  return NextResponse.json({
    ...postsData,
    actionCounts,
    lastScannedAt: lastScrapedAt,
    lastScrapedAt,
  })
}
