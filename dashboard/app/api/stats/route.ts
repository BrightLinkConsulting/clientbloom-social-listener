/**
 * /api/stats — Aggregated statistics for the dashboard charts.
 */

import { NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import { SHARED_BASE, PROV_TOKEN, tenantFilter } from '@/lib/airtable'

async function fetchAllPosts(tenantId: string, tableName: string) {
  const AIRTABLE_BASE = 'https://api.airtable.com/v0'
  const allRecords: any[] = []
  let offset: string | null = null

  do {
    const url = new URL(`${AIRTABLE_BASE}/${SHARED_BASE}/${encodeURIComponent(tableName)}`)
    url.searchParams.set('filterByFormula', tenantFilter(tenantId))
    url.searchParams.set('fields[]', 'Platform')
    url.searchParams.append('fields[]', 'Captured At')
    url.searchParams.append('fields[]', 'Keywords Matched')
    url.searchParams.append('fields[]', 'Group Name')
    url.searchParams.append('fields[]', 'Relevance Score')
    url.searchParams.append('fields[]', 'Status')
    url.searchParams.append('fields[]', 'Author Name')
    url.searchParams.set('pageSize', '100')
    if (offset) url.searchParams.set('offset', offset)

    const res = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${PROV_TOKEN}` },
      next: { revalidate: 300 }
    })

    if (!res.ok) break

    const data = await res.json()
    allRecords.push(...(data.records || []))
    offset = data.offset || null
  } while (offset)

  return allRecords
}

export async function GET() {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()
  const { tenantId } = tenant

  const tableName = 'Captured Posts'
  const records   = await fetchAllPosts(tenantId, tableName)
  const fields    = records.map((r: any) => r.fields)

  // Platform breakdown
  const platformCounts: Record<string, number> = {}
  fields.forEach((f: any) => {
    const p = f['Platform'] || 'Unknown'
    platformCounts[p] = (platformCounts[p] || 0) + 1
  })

  // Posts per day (last 14 days)
  const now = new Date()
  const dailyCounts: Record<string, number> = {}
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    dailyCounts[d.toISOString().slice(0, 10)] = 0
  }
  fields.forEach((f: any) => {
    const capturedAt = f['Captured At']
    if (!capturedAt) return
    const day = capturedAt.slice(0, 10)
    if (day in dailyCounts) dailyCounts[day]++
  })

  // Top keywords
  const keywordCounts: Record<string, number> = {}
  fields.forEach((f: any) => {
    const kw = f['Keywords Matched'] || ''
    kw.split(',').forEach((k: string) => {
      const keyword = k.trim().toLowerCase()
      if (keyword) keywordCounts[keyword] = (keywordCounts[keyword] || 0) + 1
    })
  })
  const topKeywords = Object.entries(keywordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([keyword, count]) => ({ keyword, count }))

  // Top source groups
  const groupCounts: Record<string, number> = {}
  fields.forEach((f: any) => {
    const group = f['Group Name'] || 'Unknown'
    groupCounts[group] = (groupCounts[group] || 0) + 1
  })
  const topGroups = Object.entries(groupCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([group, count]) => ({ group, count }))

  // Score distribution
  const scoreBuckets = [
    { range: '1-2', count: 0 }, { range: '3-4', count: 0 },
    { range: '5-6', count: 0 }, { range: '7-8', count: 0 },
    { range: '9-10', count: 0 },
  ]
  fields.forEach((f: any) => {
    const score = f['Relevance Score'] || 0
    if (score <= 2)      scoreBuckets[0].count++
    else if (score <= 4) scoreBuckets[1].count++
    else if (score <= 6) scoreBuckets[2].count++
    else if (score <= 8) scoreBuckets[3].count++
    else                 scoreBuckets[4].count++
  })

  const statusCounts: Record<string, number> = {}
  fields.forEach((f: any) => {
    const s = f['Status'] || 'New'
    statusCounts[s] = (statusCounts[s] || 0) + 1
  })

  return NextResponse.json({
    totalPosts: records.length,
    platformCounts,
    dailyCounts: Object.entries(dailyCounts).map(([date, count]) => ({ date, count })),
    topKeywords,
    topGroups,
    scoreBuckets,
    statusCounts,
  })
}
