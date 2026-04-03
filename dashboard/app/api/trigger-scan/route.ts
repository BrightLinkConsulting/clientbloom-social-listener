import { NextResponse } from 'next/server'

export const maxDuration = 60

const APIFY_TOKEN = process.env.APIFY_API_TOKEN
const AIRTABLE_TOKEN = process.env.AIRTABLE_API_TOKEN
const BASE_ID = process.env.AIRTABLE_BASE_ID
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

// ── Airtable helper ──────────────────────────────────────────────────────────
async function atFetch(table: string, path = '', opts: RequestInit = {}) {
  const res = await fetch(
    `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(table)}${path}`,
    {
      ...opts,
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
      },
    }
  )
  return res.json()
}

// ── Apify helper (synchronous run, waits for finish) ─────────────────────────
async function runApifyActor(actorId: string, input: object, waitSecs = 45) {
  const res = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items` +
      `?token=${APIFY_TOKEN}&timeout=${waitSecs}&memory=256`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  )
  if (!res.ok) return []
  try { return await res.json() } catch { return [] }
}

// ── Claude scoring helper ────────────────────────────────────────────────────
async function scorePosts(posts: any[], businessProfile: string) {
  if (!posts.length || !ANTHROPIC_KEY) return posts.map(p => ({ ...p, score: 5, reason: '' }))

  const prompt = `${businessProfile ? `BUSINESS CONTEXT:\n${businessProfile}\n\n` : ''}You are a social listening AI. Score each post for engagement opportunity (1-10).

9-10: Strong natural opening — question, struggle, or milestone where you can add genuine value
7-8: Good opening — relevant context you can thoughtfully reference
5-6: Possible fit — tangentially relevant
2-4: Low relevance — broadcast content with no real hook
1: Skip — irrelevant

Return JSON array: [{"post_id":"...", "score": N, "reason": "...", "comment_approach": "..."}]
Keep comment_approach to 2 sentences max — peer tone, specific reference, one follow-up question.

Posts:
${JSON.stringify(posts.map(p => ({ post_id: p.id || p.postId, text: (p.text || p.content || '').slice(0, 500), author: p.authorName || p.author?.name || '' })))}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) return posts.map(p => ({ ...p, score: 5, reason: '' }))

  const data = await res.json()
  const text = data.content?.[0]?.text || '[]'
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    const scores: any[] = jsonMatch ? JSON.parse(jsonMatch[0]) : []
    return posts.map(p => {
      const s = scores.find(x => x.post_id === (p.id || p.postId))
      return { ...p, score: s?.score ?? 5, reason: s?.reason ?? '', comment_approach: s?.comment_approach ?? '' }
    })
  } catch { return posts.map(p => ({ ...p, score: 5, reason: '' })) }
}

// ── Main handler ─────────────────────────────────────────────────────────────
export async function POST() {
  if (!APIFY_TOKEN || !AIRTABLE_TOKEN) {
    return NextResponse.json({ error: 'Missing API credentials' }, { status: 500 })
  }

  try {
    // 1. Fetch business profile for scoring context
    const profileData = await atFetch('Business Profile')
    const profile = profileData.records?.[0]?.fields
    const businessContext = profile ? [
      profile['Business Name'] && `Business: ${profile['Business Name']}`,
      profile['Industry'] && `Industry: ${profile['Industry']}`,
      profile['Ideal Client'] && `Ideal client: ${profile['Ideal Client']}`,
      profile['Problem Solved'] && `We solve: ${profile['Problem Solved']}`,
      profile['Signal Types'] && `Looking for: ${profile['Signal Types']}`,
    ].filter(Boolean).join('\n') : ''

    // 2. Fetch ICP profiles from Airtable (first scan: limit to 3 profiles, 5 posts each)
    const icpData = await atFetch('LinkedIn ICPs', '?filterByFormula={Active}=1&maxRecords=3')
    const icpProfiles = (icpData.records || []).map((r: any) => r.fields['Profile URL']).filter(Boolean)

    let allPosts: any[] = []
    let platform = 'LinkedIn'

    if (icpProfiles.length > 0) {
      // Quick ICP scan — fastest, most reliable
      const items = await runApifyActor('harvestapi/linkedin-profile-posts', {
        profileUrls: icpProfiles,
        maxPosts: 5,
        proxy: { useApifyProxy: true },
        scrapeReactions: false,
        scrapeComments: false,
      })

      allPosts = (Array.isArray(items) ? items : []).map((raw: any) => ({
        id: raw.id || raw.linkedinUrl || String(Math.random()),
        postId: raw.id || raw.linkedinUrl,
        text: raw.content || '',
        content: raw.content || '',
        authorName: raw.author?.name || '',
        authorUrl: raw.author?.linkedinUrl || raw.socialContent?.authorUrl || '',
        postUrl: raw.socialContent?.shareUrl || raw.linkedinUrl || '',
        platform: 'LinkedIn',
        groupName: `LinkedIn ICP: ${raw.author?.name || 'Profile'}`,
        capturedAt: new Date().toISOString(),
      }))
    } else {
      // Fallback: keyword scan on LinkedIn
      const keywordData = await atFetch('LinkedIn Search Terms', '?filterByFormula={Active}=1&maxRecords=2')
      const terms = (keywordData.records || []).map((r: any) => r.fields['Term']).filter(Boolean)
      if (terms.length > 0) {
        const items = await runApifyActor('apimaestro/linkedin-posts-search-scraper-no-cookies', {
          searchQuery: terms[0],
          limit: 15,
          sort_type: 'relevance',
        })
        allPosts = (Array.isArray(items) ? items : []).map((raw: any) => ({
          id: raw.id || raw.postUrl || String(Math.random()),
          postId: raw.id || raw.postUrl,
          text: raw.text || raw.content || '',
          content: raw.text || raw.content || '',
          authorName: raw.authorName || raw.author?.name || '',
          authorUrl: raw.authorProfileUrl || '',
          postUrl: raw.postUrl || raw.url || '',
          platform: 'LinkedIn',
          groupName: `LinkedIn: ${terms[0]}`,
          capturedAt: new Date().toISOString(),
        }))
      }
    }

    if (allPosts.length === 0) {
      return NextResponse.json({ postsFound: 0, message: 'No posts returned from scan. Try again after adding more sources.' })
    }

    // 3. Score all posts
    const scored = await scorePosts(allPosts, businessContext)
    const qualifying = scored.filter(p => p.score >= 5)

    // 4. Save qualifying posts to Airtable (Posts table)
    let saved = 0
    for (const p of qualifying) {
      try {
        await atFetch('Posts', '', {
          method: 'POST',
          body: JSON.stringify({
            fields: {
              'Post ID': p.postId || p.id,
              'Platform': p.platform || 'LinkedIn',
              'Group Name': p.groupName || '',
              'Author Name': p.authorName || '',
              'Author Profile URL': p.authorUrl || '',
              'Post Text': p.text || p.content || '',
              'Post URL': p.postUrl || '',
              'Keywords Matched': '',
              'Relevance Score': p.score || 5,
              'Score Reason': p.reason || '',
              'Comment Approach': p.comment_approach || '',
              'Captured At': p.capturedAt || new Date().toISOString(),
              'Action': 'New',
            },
          }),
        })
        saved++
      } catch { /* skip duplicates */ }
    }

    return NextResponse.json({
      postsFound: saved,
      scanned: allPosts.length,
      platform,
      message: saved > 0
        ? `Found ${saved} relevant post${saved !== 1 ? 's' : ''} ready in your inbox.`
        : 'Scan complete. Posts are still being processed.',
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
