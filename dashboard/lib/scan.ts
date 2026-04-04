/**
 * lib/scan.ts
 *
 * Core scanning logic — used by both:
 *   - POST /api/trigger-scan  (manual, single tenant from session)
 *   - GET  /api/cron/scan     (automatic, iterates all active tenants)
 *
 * Accepts a tenantId directly so it works without a session.
 *
 * Scan priority:
 *   LinkedIn  → ICP profiles first, then keyword search, then business-profile fallback
 *   Facebook  → facebook_group sources (always runs if configured, parallel with LinkedIn)
 */

import { SHARED_BASE, PROV_TOKEN, tenantFilter, airtableCreate } from './airtable'

const DEFAULT_SCAN_PROMPT = `You are a social listening AI. Score each post for engagement opportunity (1-10).

9-10: Strong natural opening — question, struggle, or milestone where you can add genuine value
7-8: Good opening — relevant context you can thoughtfully reference
5-6: Possible fit — tangentially relevant
2-4: Low relevance — broadcast content with no real hook
1: Skip — irrelevant

Return JSON array: [{"post_id":"...", "score": N, "reason": "...", "comment_approach": "..."}]
Keep comment_approach to 2 sentences max — peer tone, specific reference, one follow-up question.

Posts:
{posts_json}`

async function runApifyActor(apifyToken: string, actorId: string, input: object, waitSecs = 45) {
  // Apify API requires tilde (~) as the separator in actor IDs, not slash
  // e.g. "harvestapi/linkedin-profile-posts" → "harvestapi~linkedin-profile-posts"
  const safeActorId = actorId.replace('/', '~')
  const url =
    `https://api.apify.com/v2/acts/${safeActorId}/run-sync-get-dataset-items` +
    `?token=${apifyToken}&timeout=${waitSecs}&memory=256`

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  } catch (networkErr: any) {
    console.error(`[scan] Apify network error for ${actorId}:`, networkErr.message)
    return []
  }

  if (!res.ok) {
    let errBody = ''
    try { errBody = await res.text() } catch {}
    console.error(`[scan] Apify HTTP ${res.status} for ${actorId}: ${errBody.slice(0, 400)}`)
    return []
  }

  try { return await res.json() } catch (parseErr: any) {
    console.error(`[scan] Apify JSON parse error for ${actorId}:`, parseErr.message)
    return []
  }
}

async function scorePosts(anthropicKey: string, posts: any[], businessContext: string, customPrompt = '') {
  if (!posts.length || !anthropicKey) return posts.map(p => ({ ...p, score: 5, reason: '' }))

  const postsJson = JSON.stringify(posts.map(p => ({
    post_id: p.id || p.postId,
    text:    (p.text || p.content || '').slice(0, 500),
    author:  p.authorName || p.author?.name || '',
  })))

  const basePrompt   = customPrompt.trim() || DEFAULT_SCAN_PROMPT
  const activePrompt = basePrompt.includes('{posts_json}')
    ? basePrompt.replace('{posts_json}', postsJson)
    : basePrompt + `\n\nPosts:\n${postsJson}`
  const prompt = businessContext ? `BUSINESS CONTEXT:\n${businessContext}\n\n${activePrompt}` : activePrompt

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
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

// Filtered Airtable GET for a specific tenant
async function atGet(tenantId: string, table: string, extraFormula = '') {
  const base    = tenantFilter(tenantId)
  const formula = extraFormula ? `AND(${base},${extraFormula})` : base
  const url     = new URL(`https://api.airtable.com/v0/${SHARED_BASE}/${encodeURIComponent(table)}`)
  url.searchParams.set('filterByFormula', formula)
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${PROV_TOKEN}`, 'Content-Type': 'application/json' },
  })
  return res.json()
}

// ── Facebook group scanning ────────────────────────────────────────────────────

async function scanFacebookGroups(apifyToken: string, groupUrls: string[], keywords: string[]): Promise<any[]> {
  if (!groupUrls.length) return []

  console.log(`[scan] Facebook: scanning ${groupUrls.length} group(s)`)

  // maxPosts intentionally kept low (5) so the actor finishes well under the
  // 30-second window we allocate when running parallel with LinkedIn.
  // Higher values were causing 55s timeouts on every run and burning Apify budget.
  const items = await runApifyActor(
    apifyToken,
    'apify/facebook-groups-scraper',
    {
      startUrls:   groupUrls.map(url => ({ url })),
      maxPosts:    5,
      maxComments: 0,
      proxy:       { useApifyProxy: true },
    },
    30,
  )

  if (!Array.isArray(items) || !items.length) {
    console.log('[scan] Facebook: no items returned from actor')
    return []
  }

  // Keyword filter — if keywords configured, only keep posts that contain at least one
  const lowerKeywords = keywords.map(k => k.toLowerCase())
  const filtered = lowerKeywords.length > 0
    ? items.filter((raw: any) => {
        const postText = (raw.text || raw.message || raw.body || '').toLowerCase()
        return lowerKeywords.some(kw => postText.includes(kw))
      })
    : items

  console.log(`[scan] Facebook: ${items.length} posts fetched, ${filtered.length} passed keyword filter`)

  return filtered.map((raw: any) => {
    const groupName  = raw.groupName  || raw.group?.name  || 'Facebook Group'
    const authorName = raw.authorName || raw.user?.name   || raw.author?.name  || ''
    const authorUrl  = raw.authorUrl  || raw.user?.url    || raw.author?.url   || ''
    const postUrl    = raw.url        || raw.postUrl      || raw.link          || ''
    const postId     = raw.postId     || raw.id           || postUrl           || String(Math.random())
    const text       = raw.text       || raw.message      || raw.body         || ''

    return {
      id:         postId,
      postId,
      text,
      content:    text,
      authorName,
      authorUrl,
      postUrl,
      platform:   'Facebook',
      groupName:  `FB: ${groupName}`,
      capturedAt: new Date().toISOString(),
    }
  })
}

// ── Exports ────────────────────────────────────────────────────────────────────

export interface ScanResult {
  tenantId:   string
  postsFound: number
  scanned:    number
  scanSource: string
  message:    string
  error?:     string
}

// apifyTokenOverride: tenant's own Apify key (set by admin for account isolation).
// Falls back to the platform-wide APIFY_API_TOKEN env var for the shared pool.
export async function runScanForTenant(tenantId: string, apifyTokenOverride?: string): Promise<ScanResult> {
  const APIFY_TOKEN   = apifyTokenOverride || process.env.APIFY_API_TOKEN || ''
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ''

  if (!APIFY_TOKEN) {
    return { tenantId, postsFound: 0, scanned: 0, scanSource: '', message: '', error: 'APIFY_API_TOKEN not set' }
  }

  try {
    // 1. Business profile for scoring context
    const profileData = await atGet(tenantId, 'Business Profile')
    const profile     = profileData.records?.[0]?.fields || {}
    const businessContext = [
      profile['Business Name'] && `Business: ${profile['Business Name']}`,
      profile['Industry']      && `Industry: ${profile['Industry']}`,
      profile['Ideal Client']  && `Ideal client: ${profile['Ideal Client']}`,
      profile['Problem Solved']&& `We solve: ${profile['Problem Solved']}`,
      profile['Signal Types']  && `Looking for: ${profile['Signal Types']}`,
    ].filter(Boolean).join('\n')
    const customPrompt = (profile['Scoring Prompt'] || '').trim()

    // 2a. LinkedIn ICP profiles
    const icpJson     = await atGet(tenantId, 'LinkedIn ICPs', '{Active}=1')
    const icpProfiles = (icpJson.records || [])
      .slice(0, 3)
      .map((r: any) => r.fields['Profile URL'])
      .filter(Boolean)

    // 2b. All sources — split by type
    const sourcesJson    = await atGet(tenantId, 'Sources', '{Active}=1')
    const allSources     = sourcesJson.records || []
    const linkedinTerms  = allSources
      .filter((r: any) => r.fields['Type'] === 'linkedin_term')
      .slice(0, 2)
      .map((r: any) => r.fields['Value'] || r.fields['Name'])
      .filter(Boolean)
    const facebookGroups = allSources
      .filter((r: any) => r.fields['Type'] === 'facebook_group')
      .slice(0, 5)
      .map((r: any) => r.fields['Value'] || r.fields['Name'])
      .filter(Boolean)

    // 2c. Facebook keywords for post-fetch filtering
    const fbKeywordsJson = await atGet(tenantId, 'Facebook Keywords', '{Active}=1')
    const fbKeywords     = (fbKeywordsJson.records || [])
      .map((r: any) => r.fields['Keyword'] || '')
      .filter(Boolean) as string[]

    // 2d. Smart fallback from business profile (LinkedIn only)
    let fallbackTerm = ''
    if (!icpProfiles.length && !linkedinTerms.length) {
      const industry    = (profile['Industry']     || '').split(',')[0].trim()
      const idealClient = (profile['Ideal Client'] || '').slice(0, 60).trim()
      fallbackTerm = industry || idealClient || ''
    }

    // ── LinkedIn + Facebook scans run in PARALLEL ──────────────────────────────
    // Running sequentially (LinkedIn 7s + Facebook 55s) exceeded the 60s
    // maxDuration on both routes. Parallel execution keeps total wall-clock
    // time to ~30s (Facebook now the bottleneck at 30s max).

    const runLinkedIn = async (): Promise<{ posts: any[]; source: string }> => {
      if (icpProfiles.length > 0) {
        console.log(`[scan] LinkedIn: scanning ${icpProfiles.length} ICP profile(s)`)
        const items = await runApifyActor(APIFY_TOKEN, 'harvestapi/linkedin-profile-posts', {
          profileUrls: icpProfiles, maxPosts: 5,
          proxy: { useApifyProxy: true }, scrapeReactions: false, scrapeComments: false,
        })
        return {
          source: 'icp_profiles',
          posts:  (Array.isArray(items) ? items : []).map((raw: any) => ({
            id:         raw.id || raw.linkedinUrl || String(Math.random()),
            postId:     raw.id || raw.linkedinUrl,
            text:       raw.content || '',
            content:    raw.content || '',
            authorName: raw.author?.name || '',
            authorUrl:  raw.author?.linkedinUrl || raw.socialContent?.authorUrl || '',
            postUrl:    raw.socialContent?.shareUrl || raw.linkedinUrl || '',
            platform:   'LinkedIn',
            groupName:  `LinkedIn ICP: ${raw.author?.name || 'Profile'}`,
            capturedAt: new Date().toISOString(),
          })),
        }
      } else if (linkedinTerms.length > 0 || fallbackTerm) {
        const searchTerm = linkedinTerms[0] || fallbackTerm
        console.log(`[scan] LinkedIn: keyword search for "${searchTerm}"`)
        const items = await runApifyActor(APIFY_TOKEN, 'apimaestro/linkedin-posts-search-scraper-no-cookies', {
          searchQuery: searchTerm, limit: 15, sort_type: 'relevance',
        })
        return {
          source: 'keyword_search',
          posts:  (Array.isArray(items) ? items : []).map((raw: any) => ({
            id:         raw.id || raw.postUrl || String(Math.random()),
            postId:     raw.id || raw.postUrl,
            text:       raw.text || raw.content || '',
            content:    raw.text || raw.content || '',
            authorName: raw.authorName || raw.author?.name || '',
            authorUrl:  raw.authorProfileUrl || '',
            postUrl:    raw.postUrl || raw.url || '',
            platform:   'LinkedIn',
            groupName:  `LinkedIn: ${searchTerm}`,
            capturedAt: new Date().toISOString(),
          })),
        }
      }
      return { posts: [], source: '' }
    }

    const [linkedinResult, facebookPosts] = await Promise.all([
      runLinkedIn(),
      scanFacebookGroups(APIFY_TOKEN, facebookGroups, fbKeywords),
    ])
    const linkedinPosts  = linkedinResult.posts
    const linkedinSource = linkedinResult.source

    // ── Combine ────────────────────────────────────────────────────────────────
    const allPosts = [...linkedinPosts, ...facebookPosts]
    const scanSources = [
      linkedinSource || (linkedinPosts.length ? 'linkedin' : ''),
      facebookPosts.length ? 'facebook_groups' : '',
    ].filter(Boolean).join('+') || 'none'

    console.log(`[scan] Total: ${linkedinPosts.length} LinkedIn + ${facebookPosts.length} Facebook = ${allPosts.length} posts`)

    if (!allPosts.length) {
      return { tenantId, postsFound: 0, scanned: 0, scanSource: scanSources, message: 'No posts returned from sources.' }
    }

    // 3. Score
    const scored     = await scorePosts(ANTHROPIC_KEY, allPosts, businessContext, customPrompt)
    const qualifying = scored.filter(p => p.score >= 5)

    // 4. Save
    let saved = 0
    for (const p of qualifying) {
      try {
        await airtableCreate('Captured Posts', tenantId, {
          'Post ID':            p.postId || p.id,
          'Platform':           p.platform || 'LinkedIn',
          'Group Name':         p.groupName || '',
          'Author Name':        p.authorName || '',
          'Author Profile URL': p.authorUrl || '',
          'Post Text':          p.text || p.content || '',
          'Post URL':           p.postUrl || '',
          'Keywords Matched':   '',
          'Relevance Score':    p.score || 5,
          'Score Reason':       p.reason || '',
          'Comment Approach':   p.comment_approach || '',
          'Captured At':        p.capturedAt || new Date().toISOString(),
          'Action':             'New',
        })
        saved++
      } catch { /* skip duplicates */ }
    }

    return {
      tenantId,
      postsFound: saved,
      scanned:    allPosts.length,
      scanSource: scanSources,
      message: saved > 0
        ? `Found ${saved} relevant post${saved !== 1 ? 's' : ''}.`
        : 'Scan complete — no posts above threshold.',
    }
  } catch (e: any) {
    return { tenantId, postsFound: 0, scanned: 0, scanSource: '', message: '', error: e.message }
  }
}
