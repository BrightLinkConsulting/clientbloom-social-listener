/**
 * lib/scan.ts
 *
 * Core scanning logic — used by both:
 *   - POST /api/trigger-scan  (manual, single tenant from session)
 *   - GET  /api/cron/scan     (automatic, iterates all active tenants)
 *
 * Reliability architecture:
 *   LinkedIn (ICP profiles) → sync, up to 8 profiles, 10 posts each, with retry
 *   LinkedIn (keyword terms) → sync, up to 4 terms in parallel, 25 posts each
 *   Facebook → REMOVED (browser-based actor: high cost, near-zero qualifying posts)
 *
 * Error categories logged for each failure:
 *   TIMEOUT    – Apify actor exceeded waitSecs (most common Facebook failure)
 *   AUTH       – Bad API token
 *   RATE_LIMIT – Too many requests to Apify
 *   RUN_FAILED – Actor errored on Apify's side
 *   NETWORK    – Connection error before Apify even responded
 *   HTTP_xxx   – Unexpected HTTP status
 */

import { SHARED_BASE, PROV_TOKEN, tenantFilter, airtableCreate } from './airtable'

const DEFAULT_SCAN_PROMPT = `You are a LinkedIn relationship intelligence AI. Score each post for relationship-building conversation value (1-10).

HIGH VALUE (7-10):
9-10 — Strong conversation entry point: post asks a genuine question, kicks off an industry debate, shares a bold opinion, announces a milestone or transition, or invites community input. A thoughtful comment here will be noticed and remembered.
7-8  — Good entry point: relevant industry discussion, a comparison or evaluation post, a lesson-learned share, or content from a tracked ICP profile that you can extend with a specific perspective.

LOW VALUE (1-6):
5-6  — Possible fit: tangentially relevant, minor natural comment angle but nothing compelling.
2-4  — Broadcast content: pure thought leadership monologue, motivational content, or promotional post with no real hook or conversation angle.
1    — Skip: irrelevant, self-promotional, or no natural entry point.

IMPORTANT SCORING RULES:
- Do NOT score based on whether someone is expressing pain or problems. Most LinkedIn posts are not pain posts — that is normal and expected.
- Score HIGHER when a post comes from a tracked ICP profile, regardless of topic.
- Score based on whether you can say something genuinely worth saying in reply — not whether they need help.
- A well-timed, insightful comment on a non-pain post builds more trust than a solution pitch on a pain post.

Return JSON array: [{"post_id":"...", "score": N, "reason": "...", "comment_approach": "..."}]

For comment_approach (2 sentences max): describe a response that adds a specific insight the post didn't cover, shares a counterintuitive perspective, or asks one genuinely curious follow-up question. Peer-to-peer tone. No pitching. No offering services. The goal is to be someone they want to know.

Posts:
{posts_json}`

// ── Error categorization ────────────────────────────────────────────────────
export function categorizeApifyError(statusCode: number, body: string): string {
  if (statusCode === 401 || statusCode === 403) return 'AUTH'
  if (statusCode === 429) return 'RATE_LIMIT'
  if (statusCode === 400 && body.includes('TIMED-OUT')) return 'TIMEOUT'
  if (statusCode === 400 && body.includes('run-failed')) return 'RUN_FAILED'
  if (statusCode >= 500) return 'APIFY_SERVER_ERROR'
  return `HTTP_${statusCode}`
}

// ── Core Apify sync runner ────────────────────────────────────────────────────
// Returns items array on success, empty array on any failure.
// memoryMbytes: higher memory lets actors boot faster (costs more Apify CU).
export async function runApifyActor(
  apifyToken: string,
  actorId: string,
  input: object,
  waitSecs = 45,
  memoryMbytes = 256,
): Promise<{ items: any[]; errorType: string | null }> {
  const safeActorId = actorId.replace('/', '~')
  const url =
    `https://api.apify.com/v2/acts/${safeActorId}/run-sync-get-dataset-items` +
    `?token=${apifyToken}&timeout=${waitSecs}&memory=${memoryMbytes}`

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  } catch (networkErr: any) {
    console.error(`[scan] Apify NETWORK error for ${actorId}:`, networkErr.message)
    return { items: [], errorType: 'NETWORK' }
  }

  if (!res.ok) {
    let errBody = ''
    try { errBody = await res.text() } catch {}
    const errorType = categorizeApifyError(res.status, errBody)
    console.error(`[scan] Apify ${errorType} (${res.status}) for ${actorId}: ${errBody.slice(0, 400)}`)
    return { items: [], errorType }
  }

  try {
    const items = await res.json()
    return { items: Array.isArray(items) ? items : [], errorType: null }
  } catch (parseErr: any) {
    console.error(`[scan] Apify JSON parse error for ${actorId}:`, parseErr.message)
    return { items: [], errorType: 'PARSE_ERROR' }
  }
}

// ── Retry wrapper ─────────────────────────────────────────────────────────────
// Tries the primary config first. On empty result or retriable error, retries
// with a smaller scope and more memory to increase success probability.
export async function runApifyActorWithRetry(
  apifyToken: string,
  actorId: string,
  primaryInput: object,
  primaryOpts: { waitSecs: number; memoryMbytes: number },
  retryInput: object,
  retryOpts: { waitSecs: number; memoryMbytes: number },
  label: string,
): Promise<any[]> {
  console.log(`[scan] ${label}: attempt 1 (timeout=${primaryOpts.waitSecs}s, memory=${primaryOpts.memoryMbytes}MB)`)
  const first = await runApifyActor(
    apifyToken, actorId, primaryInput,
    primaryOpts.waitSecs, primaryOpts.memoryMbytes,
  )

  if (first.items.length > 0) {
    console.log(`[scan] ${label}: attempt 1 succeeded — ${first.items.length} items`)
    return first.items
  }

  // Only retry on retriable errors (timeout, server error, network) — not auth failures
  const retriable = !first.errorType || ['TIMEOUT', 'RUN_FAILED', 'NETWORK', 'APIFY_SERVER_ERROR'].includes(first.errorType)
  if (!retriable) {
    console.log(`[scan] ${label}: not retrying (error type: ${first.errorType})`)
    return []
  }

  console.log(`[scan] ${label}: attempt 2 (smaller scope, timeout=${retryOpts.waitSecs}s, memory=${retryOpts.memoryMbytes}MB)`)
  const second = await runApifyActor(
    apifyToken, actorId, retryInput,
    retryOpts.waitSecs, retryOpts.memoryMbytes,
  )

  if (second.items.length > 0) {
    console.log(`[scan] ${label}: attempt 2 succeeded — ${second.items.length} items`)
  } else {
    console.log(`[scan] ${label}: both attempts returned 0 items (errorType: ${second.errorType || 'none'})`)
  }

  return second.items
}

// ── Post normalizers (exported so webhook can reuse them) ────────────────────
export function normalizeFacebookPost(raw: any) {
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
}

export function normalizeLinkedInIcpPost(raw: any) {
  return {
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
  }
}

export function normalizeLinkedInKeywordPost(raw: any, searchTerm: string) {
  return {
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
  }
}

// ── Scorer (exported for reuse by webhook / scan-collect) ────────────────────
export async function scorePosts(
  anthropicKey: string,
  posts: any[],
  businessContext: string,
  customPrompt = '',
): Promise<any[]> {
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

// ── Save scored posts to Airtable ────────────────────────────────────────────
export async function saveScoredPosts(tenantId: string, scored: any[]): Promise<number> {
  const qualifying = scored.filter(p => p.score >= 5)
  
  // Collect all records to save, then batch-create them
  const recordsToSave = qualifying.map(p => ({
    fields: {
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
    }
  }))
  
  if (recordsToSave.length === 0) {
    return 0
  }
  
  try {
    await airtableBatchCreate('Captured Posts', tenantId, recordsToSave)
    return recordsToSave.length
  } catch (error) {
    console.error('[saveScoredPosts] Batch create failed:', error)
    // Fallback: try individual creates
    let saved = 0
    for (const record of recordsToSave) {
      try {
        await airtableCreate('Captured Posts', tenantId, record.fields)
        saved++
      } catch { /* skip duplicates */ }
    }
    return saved
  }
}

// ── Filtered Airtable GET for a specific tenant ──────────────────────────────
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

// ── Facebook group scanning ───────────────────────────────────────────────────
// Primary actor:  apify/facebook-groups-scraper
// Reliability: 2-attempt retry with progressive timeout + memory tuning
async function scanFacebookGroups(
  apifyToken: string,
  groupUrls: string[],
  keywords: string[],
): Promise<any[]> {
  if (!groupUrls.length) return []
  console.log(`[scan] Facebook: scanning ${groupUrls.length} group(s)`)

  const baseInput = {
    startUrls:   groupUrls.map(url => ({ url })),
    maxComments: 0,
    proxy:       { useApifyProxy: true },
  }

  const items = await runApifyActorWithRetry(
    apifyToken,
    'apify/facebook-groups-scraper',
    // Primary: 3 posts, 512 MB, 90s — handles typical load
    { ...baseInput, maxPosts: 3 },
    { waitSecs: 90, memoryMbytes: 512 },
    // Retry: 2 posts, 1 GB, 60s — more memory boots browser faster when slow
    { ...baseInput, maxPosts: 2 },
    { waitSecs: 60, memoryMbytes: 1024 },
    'Facebook groups-scraper',
  )

  if (!items.length) {
    console.log('[scan] Facebook: no items returned from actor (both attempts)')
    return []
  }

  // Keyword filter — only keep posts containing at least one configured keyword
  const lowerKeywords = keywords.map(k => k.toLowerCase())
  const filtered = lowerKeywords.length > 0
    ? items.filter((raw: any) => {
        const postText = (raw.text || raw.message || raw.body || '').toLowerCase()
        return lowerKeywords.some(kw => postText.includes(kw))
      })
    : items

  console.log(`[scan] Facebook: ${items.length} posts fetched, ${filtered.length} passed keyword filter`)
  return filtered.map(normalizeFacebookPost)
}

// ── LinkedIn scanning ─────────────────────────────────────────────────────────
async function scanLinkedIn(
  apifyToken: string,
  icpProfiles: string[],
  linkedinTerms: string[],
  fallbackTerm: string,
): Promise<{ posts: any[]; source: string }> {
  if (icpProfiles.length > 0) {
    console.log(`[scan] LinkedIn: scanning ${icpProfiles.length} ICP profile(s)`)
    const items = await runApifyActorWithRetry(
      apifyToken,
      'harvestapi/linkedin-profile-posts',
      { profileUrls: icpProfiles, maxPosts: 10, proxy: { useApifyProxy: true }, scrapeReactions: false, scrapeComments: false },
      { waitSecs: 45, memoryMbytes: 256 },
      { profileUrls: icpProfiles.slice(0, 4), maxPosts: 5, proxy: { useApifyProxy: true }, scrapeReactions: false, scrapeComments: false },
      { waitSecs: 60, memoryMbytes: 512 },
      'LinkedIn ICP profiles',
    )
    return { source: 'icp_profiles', posts: items.map(normalizeLinkedInIcpPost) }
  }

  // Run all configured keyword terms in parallel (up to 4) — each is an independent
  // API-based actor call (cheap, ~$0.001/run) with no shared browser state.
  const terms = linkedinTerms.length > 0 ? linkedinTerms : (fallbackTerm ? [fallbackTerm] : [])
  if (terms.length === 0) return { posts: [], source: '' }

  console.log(`[scan] LinkedIn: keyword search for ${terms.length} term(s): ${terms.join(', ')}`)
  const results = await Promise.all(
    terms.map(term =>
      runApifyActorWithRetry(
        apifyToken,
        'apimaestro/linkedin-posts-search-scraper-no-cookies',
        { searchQuery: term, limit: 25, sort_type: 'relevance' },
        { waitSecs: 45, memoryMbytes: 256 },
        { searchQuery: term, limit: 15, sort_type: 'relevance' },
        { waitSecs: 60, memoryMbytes: 512 },
        `LinkedIn keyword "${term}"`,
      ).then(items => items.map(r => normalizeLinkedInKeywordPost(r, term)))
    )
  )
  const posts = results.flat()
  return { source: 'keyword_search', posts }
}

// ── Exports ───────────────────────────────────────────────────────────────────
export interface ScanResult {
  tenantId:   string
  postsFound: number
  scanned:    number
  scanSource: string
  message:    string
  error?:     string
  fbPending?: boolean  // legacy field — kept for API compatibility
}

// apifyTokenOverride: tenant's own Apify key (set by admin for account isolation).
// Falls back to the platform-wide APIFY_API_TOKEN env var for the shared pool.
export async function runScanForTenant(
  tenantId: string,
  apifyTokenOverride?: string,
): Promise<ScanResult> {
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

    // 2a. LinkedIn ICP profiles (up to 8 — API-based actor, cheap per profile)
    const icpJson     = await atGet(tenantId, 'LinkedIn ICPs', '{Active}=1')
    const icpProfiles = (icpJson.records || [])
      .slice(0, 8)
      .map((r: any) => r.fields['Profile URL'])
      .filter(Boolean)

    // 2b. LinkedIn keyword terms (up to 4 — each term runs as a parallel API call)
    const sourcesJson   = await atGet(tenantId, 'Sources', '{Active}=1')
    const allSources    = sourcesJson.records || []
    const linkedinTerms = allSources
      .filter((r: any) => r.fields['Type'] === 'linkedin_term')
      .slice(0, 4)
      .map((r: any) => r.fields['Value'] || r.fields['Name'])
      .filter(Boolean)

    // 2c. Smart fallback from business profile
    let fallbackTerm = ''
    if (!icpProfiles.length && !linkedinTerms.length) {
      const industry    = (profile['Industry']     || '').split(',')[0].trim()
      const idealClient = (profile['Ideal Client'] || '').slice(0, 60).trim()
      fallbackTerm = industry || idealClient || ''
    }

    // ── LinkedIn-only scan ───────────────────────────────────────────────────
    // Facebook scraping removed: browser-based actor costs ~$5/day at minimal
    // usage and produces 0 posts above score threshold in practice.
    // LinkedIn (API-based actors) costs ~$0.10-0.40/day for unlimited tenants.
    const linkedinResult = await scanLinkedIn(APIFY_TOKEN, icpProfiles, linkedinTerms, fallbackTerm)

    const allPosts    = linkedinResult.posts
    const scanSources = linkedinResult.source || 'none'

    console.log(`[scan] Total: ${linkedinResult.posts.length} LinkedIn posts`)

    if (!allPosts.length) {
      return {
        tenantId, postsFound: 0, scanned: 0, scanSource: scanSources,
        message: 'No posts returned from sources.',
      }
    }

    // 3. Score
    const scored = await scorePosts(ANTHROPIC_KEY, allPosts, businessContext, customPrompt)

    // 4. Save
    const saved = await saveScoredPosts(tenantId, scored)

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
