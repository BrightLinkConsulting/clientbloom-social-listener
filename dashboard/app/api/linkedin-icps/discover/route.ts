import { NextResponse } from 'next/server'

const APIFY_TOKEN    = process.env.APIFY_API_TOKEN!
const AIRTABLE_TOKEN = process.env.AIRTABLE_API_TOKEN!
const BASE_ID        = process.env.AIRTABLE_BASE_ID!
const TABLE          = 'LinkedIn ICPs'
const AIRTABLE_URL   = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}`

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
  try {
    const { jobTitles = [], keywords = [], maxProfiles = 50 } = await req.json()

    if (!jobTitles.length) {
      return NextResponse.json({ error: 'At least one job title is required.' }, { status: 400 })
    }

    const cap = Math.min(Number(maxProfiles) || 50, 200)

    // ---- Build search queries ----
    // One query per job title, combining all keywords with the title
    const keywordStr = keywords.map((k: string) => `"${k}"`).join(' ')
    const queries = jobTitles.map((title: string) =>
      `site:linkedin.com/in "${title}"${keywordStr ? ' ' + keywordStr : ''}`
    )

    // ---- Run Google Search scraper ----
    const apifyRunResp = await fetch(
      'https://api.apify.com/v2/acts/apify~google-search-scraper/runs?waitForFinish=120',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${APIFY_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          queries: queries.join('\n'),
          maxPagesPerQuery: 3,
          resultsPerPage: 10,
          proxy: { useApifyProxy: true },
        }),
      }
    )

    if (!apifyRunResp.ok) {
      const err = await apifyRunResp.text()
      return NextResponse.json({ error: `Apify error: ${err}` }, { status: 500 })
    }

    const apifyData  = await apifyRunResp.json()
    const datasetId  = apifyData?.data?.defaultDatasetId

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
      const results = item.organicResults || []
      for (const result of results) {
        const rawUrl: string = result.url || ''
        const match = profilePattern.exec(rawUrl)
        profilePattern.lastIndex = 0  // reset regex
        if (match) {
          const slug = match[1].toLowerCase()
          if (!seen.has(slug)) {
            seen.add(slug)
            discovered.push({
              profileUrl: `https://www.linkedin.com/in/${slug}/`,
              name: result.title || slug,
              snippet: result.description || '',
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
    const existingResp = await fetch(
      `${AIRTABLE_URL}?fields[]=Profile URL&pageSize=100`,
      { headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}` } }
    )
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
      const m = p.profileUrl.match(/linkedin\.com\/in\/([^/?&\s]+)/)
      const slug = m ? m[1].toLowerCase() : ''
      return slug && !existingSlugs.has(slug)
    })

    const today = new Date().toISOString().split('T')[0]
    const batchSize = 10
    const addedProfiles: any[] = []

    for (let i = 0; i < toAdd.length; i += batchSize) {
      const batch = toAdd.slice(i, i + batchSize)
      const records = batch.map(p => ({
        fields: {
          'Name':        p.name,
          'Profile URL': p.profileUrl,
          'Active':      true,
          'Source':      'discovered',
          'Notes':       p.snippet?.slice(0, 200) || '',
          'Added Date':  today,
        }
      }))

      const saveResp = await fetch(AIRTABLE_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ records }),
      })

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
