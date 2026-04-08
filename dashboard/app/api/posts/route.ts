/**
 * /api/posts — Server-side Airtable proxy.
 * Returns filtered posts + metadata: action counts, last scrape time, ICP profiles.
 *
 * Filter params:
 *   action    — New | Engaged | Replied | Skipped | Archived | all
 *   platform  — LinkedIn | Facebook | all
 *   minScore  — minimum relevance score (0 = no filter)
 *   icp       — LinkedIn profile URL to filter by author (server-side, efficient)
 *   limit     — max records (default 100)
 *   offset    — Airtable pagination offset
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
  const icp      = searchParams.get('icp')      || ''   // LinkedIn profile URL for ICP filter
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
  if (icp      && icp      !== 'all') filters.push(`{Author Profile URL}='${icp.replace(/'/g, "\\'")}'`)

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

  const metaFormula  = tenantFilter(tenantId)
  const metaParams   = new URLSearchParams({
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

  // ICP profiles query — used by feed to classify posts and populate person filter
  const icpParams = new URLSearchParams({
    filterByFormula: `AND(${tenantFilter(tenantId)}, {Active}=1)`,
    'fields[]':  'Name',
    'fields[1]': 'Profile URL',
    'fields[2]': 'Job Title',
    'fields[3]': 'Company',
    sort: '',
    'sort[0][field]':     'Name',
    'sort[0][direction]': 'asc',
    pageSize: '100',
  })
  const icpUrl = `${AIRTABLE_BASE}/${SHARED_BASE}/${encodeURIComponent('LinkedIn ICPs')}?${icpParams}`

  const [postsResp, icpResp] = await Promise.all([
    fetch(postsUrl, { headers: authHeader, next: { revalidate: 0 } }),
    fetch(icpUrl,   { headers: authHeader, next: { revalidate: 0 } }),
  ])

  if (!postsResp.ok) {
    return NextResponse.json({ error: await postsResp.text() }, { status: postsResp.status })
  }

  const [postsData, icpData] = await Promise.all([
    postsResp.json(),
    icpResp.ok ? icpResp.json() : Promise.resolve({ records: [] }),
  ])

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

  // Build ICP profile list for feed filter
  const icpProfiles = (icpData.records || [])
    .map((r: any) => ({
      name:       r.fields?.Name        || '',
      profileUrl: r.fields?.['Profile URL'] || '',
      jobTitle:   r.fields?.['Job Title']   || '',
      company:    r.fields?.Company     || '',
    }))
    .filter((p: any) => p.profileUrl)  // must have a URL to be useful as a filter

  // Build a Set of ICP profile URLs for fast client-side lookup
  const icpProfileUrls = icpProfiles.map((p: any) => p.profileUrl)

  return NextResponse.json({
    ...postsData,
    actionCounts,
    lastScannedAt: lastScrapedAt,
    lastScrapedAt,
    icpProfiles,
    icpProfileUrls,
    // Keep availableGroups as empty array for any external callers that check it
    availableGroups: [],
  })
}
