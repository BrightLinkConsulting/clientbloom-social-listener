import { NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import { airtableList, airtableCreate, SHARED_BASE, PROV_TOKEN, tenantFilter } from '@/lib/airtable'

const TABLE = 'LinkedIn ICPs'

/**
 * POST /api/linkedin-icps/discover
 *
 * Body: { jobTitles: string[], keywords: string[], maxProfiles: number }
 *
 * Flow:
 *  1. Build Google search queries from job titles + keywords
 *  2. Run apify/google-search-scraper
 *  3. Extract LinkedIn profile URLs from organic results
 *  4. Fetch existing profile URLs from Airtable to avoid duplicates
 *  5. Save new profiles as "discovered" records in LinkedIn ICPs table
 *  6. Return { added, skipped, profiles }
 */
export async function POST(req: Request) {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()
  const { tenantId } = tenant

  const APIFY_TOKEN = process.env.APIFY_API_TOKEN

  try {
    const { jobTitles = [], keywords = [], maxProfiles = 50 } = await req.json()

    if (!jobTitles.length) {
      return NextResponse.json({ error: 'At least one job title is required.' }, { status: 400 })
    }
    if (!APIFY_TOKEN) {
      return NextResponse.json({ error: 'Discovery is not configured on this platform.' }, { status: 500 })
    }

    const cap = Math.min(Number(maxProfiles) || 50, 200)

    // ---- Build search queries ----
    const keywordStr = keywords.map((k: string) => `"${k}"`).join(' ')
    const queries    = jobTitles.map((title: string) =>
      `site:linkedin.com/in "${title}"${keywordStr ? ' ' + keywordStr : ''}`
    )

    // ---- Run Google Search scraper ----
    const apifyRunResp = await fetch(
      'https://api.apify.com/v2/acts/apify~google-search-scraper/runs?waitForFinish=120',
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${APIFY_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries: queries.join('\n'),
          maxPagesPerQuery: 3,
          resultsPerPage: 10,
          proxy: { useApifyProxy: true },
        }),
      }
    )

    if (!apifyRunResp.ok) {
      return NextResponse.json({ error: `Apify error: ${await apifyRunResp.text()}` }, { status: 500 })
    }

    const apifyData = await apifyRunResp.json()
    const datasetId = apifyData?.data?.defaultDatasetId

    if (!datasetId) {
      return NextResponse.json({ error: 'Apify run did not produce a dataset.' }, { status: 500 })
    }

    // ---- Fetch dataset items ----
    const itemsResp = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?format=json&clean=true`,
      { headers: { 'Authorization': `Bearer ${APIFY_TOKEN}` } }
    )
    const items = await itemsResp.json()

    // ---- Extract LinkedIn profile URLs ----
    const profilePattern = /https?:\/\/(?:www\.|[a-z]{2}\.)?linkedin\.com\/in\/([a-zA-Z0-9_-]+)/gi
    const discovered: { profileUrl: string; name: string; snippet: string }[] = []
    const seen = new Set<string>()

    for (const item of (Array.isArray(items) ? items : [])) {
      for (const result of (item.organicResults || [])) {
        const rawUrl: string = result.url || ''
        const match = profilePattern.exec(rawUrl)
        profilePattern.lastIndex = 0
        if (match) {
          const slug = match[1].toLowerCase()
          if (!seen.has(slug)) {
            seen.add(slug)
            discovered.push({
              profileUrl: `https://www.linkedin.com/in/${slug}/`,
              name:       result.title       || slug,
              snippet:    result.description || '',
            })
          }
        }
        if (discovered.length >= cap) break
      }
      if (discovered.length >= cap) break
    }

    if (!discovered.length) {
      return NextResponse.json({ added: 0, skipped: 0, profiles: [], message: 'No LinkedIn profiles found. Try different keywords or job titles.' })
    }

    // ---- Fetch existing profile URLs from Airtable (dedup) ----
    const existingUrl = new URL(`https://api.airtable.com/v0/${SHARED_BASE}/${encodeURIComponent(TABLE)}`)
    existingUrl.searchParams.set('filterByFormula', tenantFilter(tenantId))
    existingUrl.searchParams.set('fields[]', 'Profile URL')
    existingUrl.searchParams.set('pageSize', '100')

    const existingResp = await fetch(existingUrl.toString(), {
      headers: { Authorization: `Bearer ${PROV_TOKEN}` },
    })
    const existingData = await existingResp.json()
    const existingSlugs = new Set<string>(
      (existingData.records || []).map((r: any) => {
        const u: string = r.fields?.['Profile URL'] || ''
        const m = u.match(/linkedin\.com\/in\/([^/?&\s]+)/)
        return m ? m[1].toLowerCase() : ''
      }).filter(Boolean)
    )

    // ---- Save new profiles to Airtable ----
    const toAdd = discovered.filter(p => {
      const m    = p.profileUrl.match(/linkedin\.com\/in\/([^/?&\s]+)/)
      const slug = m ? m[1].toLowerCase() : ''
      return slug && !existingSlugs.has(slug)
    })

    const today     = new Date().toISOString().split('T')[0]
    const batchSize = 10
    const addedProfiles: any[] = []

    for (let i = 0; i < toAdd.length; i += batchSize) {
      const batch = toAdd.slice(i, i + batchSize)

      // airtableCreate only handles one record at a time; batch via direct fetch
      const records = batch.map(p => ({
        fields: {
          'Name':        p.name,
          'Profile URL': p.profileUrl,
          'Active':      true,
          'Source':      'discovered',
          'Notes':       p.snippet?.slice(0, 200) || '',
          'Added Date':  today,
          'Tenant ID':   tenantId,
        }
      }))

      const saveResp = await fetch(
        `https://api.airtable.com/v0/${SHARED_BASE}/${encodeURIComponent(TABLE)}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${PROV_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ records }),
        }
      )

      if (saveResp.ok) {
        const saved = await saveResp.json()
        addedProfiles.push(...(saved.records || []).map((r: any) => ({
          id:         r.id,
          name:       r.fields['Name'],
          profileUrl: r.fields['Profile URL'],
          active:     true,
          source:     'discovered',
        })))
      }
    }

    return NextResponse.json({
      added:    addedProfiles.length,
      skipped:  discovered.length - toAdd.length,
      profiles: addedProfiles,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
