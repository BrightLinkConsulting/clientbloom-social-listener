/**
 * /api/stats — Aggregated statistics for the dashboard charts.
 *
 * Fetches all posts and computes:
 * - Platform breakdown
 * - Posts per day (last 14 days)
 * - Top keywords by frequency
 * - Top source groups by post count
 * - Score distribution
 * - Total counts by status
 */

import { NextResponse } from 'next/server'

const AIRTABLE_BASE = 'https://api.airtable.com/v0'

async function fetchAllPosts(token: string, baseId: string, tableName: string) {
  const allRecords: any[] = []
  let offset: string | null = null

  do {
    const params = new URLSearchParams({
      'fields[]': ['Platform', 'Captured At', 'Keywords Matched', 'Group Name',
                   'Relevance Score', 'Status', 'Author Name'].join('&fields[]='),
      pageSize: '100',
    })
    if (offset) params.set('offset', offset)

    const url = `${AIRTABLE_BASE}/${baseId}/${encodeURIComponent(tableName)}?${params}`
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` },
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
  const token = process.env.AIRTABLE_API_TOKEN
  const baseId = process.env.AIRTABLE_BASE_ID
  const tableName = process.env.AIRTABLE_POSTS_TABLE || 'Captured Posts'

  if (!token || !baseId) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 })
  }

  const records = await fetchAllPosts(token, baseId, tableName)
  const fields = records.map((r: any) => r.fields)

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
    if (day in dailyCounts) {
      dailyCounts[day]++
    }
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

  // Score distribution (buckets: 1-2, 3-4, 5-6, 7-8, 9-10)
  const scoreBuckets = [
    { range: '1-2', count: 0 },
    { range: '3-4', count: 0 },
    { range: '5-6', count: 0 },
    { range: '7-8', count: 0 },
    { range: '9-10', count: 0 },
  ]
  fields.forEach((f: any) => {
    const score = f['Relevance Score'] || 0
    if (score <= 2) scoreBuckets[0].count++
    else if (score <= 4) scoreBuckets[1].count++
    else if (score <= 6) scoreBuckets[2].count++
    else if (score <= 8) scoreBuckets[3].count++
    else scoreBuckets[4].count++
  })

  // Status counts
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
