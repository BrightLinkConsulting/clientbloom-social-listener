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
 *   TIMEOUT    – Apify actor exceeded waitSecs
 *   AUTH       – Bad API token
 *   RATE_LIMIT – Too many requests to Apify
 *   RUN_FAILED – Actor errored on Apify's side
 *   NETWORK    – Connection error before Apify even responded
 *   HTTP_xxx   – Unexpected HTTP status
 *
 * Cost optimizations (A1-A5):
 *   A2: Post deduplication — skip Claude scoring for posts already in Airtable
 *   A3: Post age filtering — only process posts from last 7 days
 *   A4: Apify result limits — cap posts fetched per actor call
 *   A5: Per-tenant usage tracking — track scans/posts processed for billing
 */

import { SHARED_BASE, PROV_TOKEN, tenantFilter, airtableCreate, airtableBatchCreate, airtableFetch } from './airtable'
import { getTierLimits } from './tier'

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
//
// tenantTag: when set, appended as &tag={tenantId} to the Apify run URL.
// This enables per-tenant cost attribution in the admin Usage tab:
// the usage route queries /v2/actor-runs?tag={tenantId} and sums usageTotalUsd.
// Runs before 2026-04-05 (pre-tagging) fall back to pro-rata attribution.
export async function runApifyActor(
  apifyToken: string,
  actorId: string,
  input: object,
  waitSecs = 45,
  memoryMbytes = 256,
  tenantTag?: string,
): Promise<{ items: any[]; errorType: string | null }> {
  const safeActorId = actorId.replace('/', '~')
  const tagParam    = tenantTag ? `&tag=${encodeURIComponent(tenantTag)}` : ''
  const url =
    `https://api.apify.com/v2/acts/${safeActorId}/run-sync-get-dataset-items` +
    `?token=${apifyToken}&timeout=${waitSecs}&memory=${memoryMbytes}${tagParam}`

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
  tenantTag?: string,
): Promise<any[]> {
  console.log(`[scan] ${label}: attempt 1 (timeout=${primaryOpts.waitSecs}s, memory=${primaryOpts.memoryMbytes}MB)`)
  const first = await runApifyActor(
    apifyToken, actorId, primaryInput,
    primaryOpts.waitSecs, primaryOpts.memoryMbytes, tenantTag,
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
    retryOpts.waitSecs, retryOpts.memoryMbytes, tenantTag,
  )

  if (second.items.length > 0) {
    console.log(`[scan] ${label}: attempt 2 succeeded — ${second.items.length} items`)
  } else {
    console.log(`[scan] ${label}: both attempts returned 0 items (errorType: ${second.errorType || 'none'})`)
  }

  return second.items
}

// ── Post normalizers ──────────────────────────────────────────────────────────
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

// ── NEW A2: Post deduplication ──────────────────────────────────────────────
// Query Captured Posts table for this tenant, return a Set of post URLs.
//
// Two-layer deduplication:
//   Layer 1 — Recent posts (last 30 days): prevents re-capture of any post
//             recently seen, regardless of whether the user acted on it.
//   Layer 2 — All skipped posts (no age limit): posts explicitly skipped by
//             the user are permanently excluded from re-capture. Without this,
//             a skipped post would reappear in the inbox after 30 days whenever
//             the Apify actor surfaced it again — creating a ghost inbox problem.
//
// Bug fixed April 2026: original query only had layer 1. Layer 2 was missing.
async function getExistingPostUrls(tenantId: string): Promise<Set<string>> {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysAgoIso = thirtyDaysAgo.toISOString()

  // OR: recent posts from last 30 days OR any explicitly skipped post (permanent exclusion)
  const formula = `AND(${tenantFilter(tenantId)},OR(IS_AFTER({Captured At},'${thirtyDaysAgoIso}'),{Action}='Skipped'))`

  const url = new URL(`https://api.airtable.com/v0/${SHARED_BASE}/${encodeURIComponent('Captured Posts')}`)
  url.searchParams.set('filterByFormula', formula)
  url.searchParams.append('fields[]', 'Post URL')
  url.searchParams.append('fields[]', 'Action')
  url.searchParams.set('pageSize', '100')
  
  const records: any[] = []
  let offset: string | undefined
  
  do {
    if (offset) url.searchParams.set('offset', offset)
    else url.searchParams.delete('offset')

    const res = await airtableFetch(url.toString(), {
      headers: { Authorization: `Bearer ${PROV_TOKEN}`, 'Content-Type': 'application/json' },
    })
    if (!res.ok) {
      console.warn('[scan] Failed to fetch existing post URLs, skipping dedup:', res.status)
      break
    }
    
    const data = await res.json()
    records.push(...(data.records || []))
    offset = data.offset
  } while (offset)
  
  const skippedCount = records.filter(r => r.fields['Action'] === 'Skipped').length
  if (skippedCount > 0) {
    console.log(`[scan] Dedup: ${records.length} existing URLs (${skippedCount} permanently skipped)`)
  }
  return new Set(records.map(r => r.fields['Post URL'] as string).filter(Boolean))
}

// ── NEW A3: Post age filtering ──────────────────────────────────────────────
// Filter posts to only recent ones (last 7 days) to save on scoring calls
function filterPostsByAge(posts: any[], maxAgeDay = 7): any[] {
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - maxAgeDay)
  
  return posts.filter(post => {
    const postDate = new Date(
      post.publishedAt || 
      post.date || 
      post.createdAt || 
      post.capturedAt || 
      new Date()
    )
    return postDate >= sevenDaysAgo
  })
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
      max_tokens: 4096,  // raised from 2000 — prevents JSON truncation on 25+ post batches
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    console.error(`[scorePosts] Claude API error ${res.status}: ${errBody.slice(0, 400)}`)
    return posts.map(p => ({ ...p, score: 5, reason: '' }))
  }

  const data = await res.json()
  const text = data.content?.[0]?.text || '[]'
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    const scores: any[] = jsonMatch ? JSON.parse(jsonMatch[0]) : []
    return posts.map((p, idx) => {
      // Match by post_id first; fall back to array index in case of URL truncation
      const s = scores.find(x => x.post_id === (p.id || p.postId)) || scores[idx]
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
    console.error('[saveScoredPosts] Batch create failed, falling back to individual creates:', error)

    // Rate-limit guard: if the batch failed due to a sustained 429 (after airtableFetch
    // exhausted all retries), immediately firing 10 individual creates would amplify the
    // load up to 40× (10 records × up to 4 attempts each). A 2 s pause gives Airtable's
    // per-second quota time to recover before the fallback adds more pressure.
    await new Promise(resolve => setTimeout(resolve, 2_000))

    // Fallback: individual creates — airtableCreate has its own retry via airtableFetch
    let saved = 0
    for (const record of recordsToSave) {
      try {
        await airtableCreate('Captured Posts', tenantId, record.fields)
        saved++
      } catch { /* skip record — likely duplicate or persistent 429 */ }
    }
    if (saved < recordsToSave.length) {
      console.warn(`[saveScoredPosts] Individual fallback: saved ${saved}/${recordsToSave.length} records`)
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
  const res = await airtableFetch(url.toString(), {
    headers: { Authorization: `Bearer ${PROV_TOKEN}`, 'Content-Type': 'application/json' },
  })
  return res.json()
}

// ── LinkedIn scanning ─────────────────────────────────────────────────────────
async function scanLinkedIn(
  apifyToken: string,
  icpProfiles: string[],
  linkedinTerms: string[],
  fallbackTerm: string,
  tenantTag?: string,         // passed through to tag Apify runs for cost attribution
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
      tenantTag,
    )
    return { source: 'icp_profiles', posts: items.map(normalizeLinkedInIcpPost) }
  }

  // Run keyword terms in parallel — each is an independent API-based actor call.
  // Hard cap at 10 terms: beyond this, signal-to-noise degrades and Apify cost grows linearly.
  // The UI enforces MAX_ACTIVE_TERMS=10 already; this is the server-side safety net.
  const MAX_TERMS = 10
  const rawTerms = linkedinTerms.length > 0 ? linkedinTerms : (fallbackTerm ? [fallbackTerm] : [])
  const terms = rawTerms.slice(0, MAX_TERMS)
  if (terms.length === 0) return { posts: [], source: '' }
  if (rawTerms.length > MAX_TERMS) {
    console.warn(`[scan] LinkedIn: ${rawTerms.length} terms configured — capped at ${MAX_TERMS} to control cost`)
  }

  console.log(`[scan] LinkedIn: keyword search for ${terms.length} term(s): ${terms.join(', ')}`)
  const results = await Promise.all(
    terms.map(term =>
      runApifyActorWithRetry(
        apifyToken,
        'apimaestro/linkedin-posts-search-scraper-no-cookies',
        { searchQuery: term, limit: 50, sort_type: 'recent' },
        { waitSecs: 45, memoryMbytes: 256 },
        { searchQuery: term, limit: 25, sort_type: 'recent' },
        { waitSecs: 60, memoryMbytes: 512 },
        `LinkedIn keyword "${term}"`,
        tenantTag,
      ).then(items => items.map(r => normalizeLinkedInKeywordPost(r, term)))
    )
  )
  const posts = results.flat()
  return { source: 'keyword_search', posts }
}

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * Scan pipeline breakdown — shows why postsFound may be 0.
 * Useful for diagnosing "0 new posts" in the UI vs. a broken scan.
 */
export interface ScanBreakdown {
  fetched:        number  // raw posts from Apify
  ageFiltered:    number  // removed: older than 7 days
  deduped:        number  // removed: already in Airtable (last 30d or skipped)
  newToScore:     number  // passed to Claude for scoring
  belowThreshold: number  // scored < 5, not saved
}

export interface ScanResult {
  tenantId:   string
  postsFound: number
  scanned:    number
  scanSource: string
  message:    string
  error?:     string
  breakdown?: ScanBreakdown
}

// apifyTokenOverride: tenant's own Apify key (set by admin for account isolation).
// Falls back to the platform-wide APIFY_API_TOKEN env var for the shared pool.
export async function runScanForTenant(
  tenantId: string,
  apifyTokenOverride?: string,
  plan = 'Trial',
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

    // 2a. LinkedIn ICP profiles — smart selection up to plan's scan slots
    //
    // Two-layer model: users can store up to poolSize profiles, but only
    // scanSlots get fetched each run. Priority order:
    //   1. Profiles with Posts Found > 0, sorted DESC (active posters get priority)
    //   2. Profiles with Posts Found = 0 (new/never-seen), sorted by Added Date DESC
    //      (newest additions get a chance, creating a natural round-robin effect)
    //
    // This ensures hot prospects are never missed while new additions cycle in.
    const { scanSlots, keywords: keywordSlots } = getTierLimits(plan)
    const icpJson      = await atGet(tenantId, 'LinkedIn ICPs', '{Active}=1')
    const allActive    = icpJson.records || []

    const sorted = [...allActive].sort((a, b) => {
      const postsA = Number(a.fields['Posts Found'] || 0)
      const postsB = Number(b.fields['Posts Found'] || 0)
      if (postsB !== postsA) return postsB - postsA           // more posts = higher priority
      const dateA  = String(a.fields['Added Date'] || '')
      const dateB  = String(b.fields['Added Date'] || '')
      return dateB.localeCompare(dateA)                        // newer additions next
    })

    const icpProfiles = sorted
      .slice(0, scanSlots)
      .map((r: any) => r.fields['Profile URL'])
      .filter(Boolean)

    if (allActive.length > 0) {
      console.log(`[scan] LinkedIn ICP: ${icpProfiles.length} of ${allActive.length} active profiles selected (scanSlots=${scanSlots}, plan=${plan})`)
    }

    // 2b. LinkedIn keyword terms (up to plan's keyword limit)
    const sourcesJson   = await atGet(tenantId, 'Sources', '{Active}=1')
    const allSources    = sourcesJson.records || []
    const linkedinTerms = allSources
      .filter((r: any) => r.fields['Type'] === 'linkedin_term')
      .slice(0, keywordSlots)
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
    // Pass tenantId as tag so Apify runs are attributed to this tenant for cost tracking.
    const linkedinResult = await scanLinkedIn(APIFY_TOKEN, icpProfiles, linkedinTerms, fallbackTerm, tenantId)

    let allPosts    = linkedinResult.posts
    const scanSources = linkedinResult.source || 'none'

    const fetchedCount = allPosts.length
    console.log(`[scan] Total: ${fetchedCount} LinkedIn posts before filtering`)

    // A3: Filter to recent posts only
    allPosts = filterPostsByAge(allPosts, 7)
    const ageFilteredCount = fetchedCount - allPosts.length
    console.log(`[scan] After age filter (7 days): ${allPosts.length} posts (removed ${ageFilteredCount} too old)`)

    // A2: Deduplicate against already-captured posts (includes permanently skipped)
    const existingUrls = await getExistingPostUrls(tenantId)
    const newPosts = allPosts.filter(post => !existingUrls.has(post.postUrl || ''))
    const dedupedCount = allPosts.length - newPosts.length
    console.log(`[scan] After deduplication: ${newPosts.length} new posts (removed ${dedupedCount} already seen)`)

    if (!newPosts.length) {
      return {
        tenantId, postsFound: 0, scanned: allPosts.length, scanSource: scanSources,
        message: 'No new posts — all existing or too old.',
        breakdown: {
          fetched:        fetchedCount,
          ageFiltered:    ageFilteredCount,
          deduped:        dedupedCount,
          newToScore:     0,
          belowThreshold: 0,
        },
      }
    }

    // 3. Score
    const scored = await scorePosts(ANTHROPIC_KEY, newPosts, businessContext, customPrompt)
    const qualifying = scored.filter(p => (p.score ?? 5) >= 5)
    const belowThresholdCount = scored.length - qualifying.length

    // 4. Save
    const saved = await saveScoredPosts(tenantId, scored)

    return {
      tenantId,
      postsFound: saved,
      scanned:    newPosts.length,
      scanSource: scanSources,
      message: saved > 0
        ? `Found ${saved} relevant post${saved !== 1 ? 's' : ''}.`
        : 'Scan complete — no posts above threshold.',
      breakdown: {
        fetched:        fetchedCount,
        ageFiltered:    ageFilteredCount,
        deduped:        dedupedCount,
        newToScore:     newPosts.length,
        belowThreshold: belowThresholdCount,
      },
    }
  } catch (e: any) {
    return { tenantId, postsFound: 0, scanned: 0, scanSource: '', message: '', error: e.message }
  }
}
