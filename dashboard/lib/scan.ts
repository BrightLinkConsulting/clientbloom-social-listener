/**
 * lib/scan.ts
 *
 * Core scanning logic — used by both:
 *   - POST /api/trigger-scan  (manual, single tenant from session)
 *   - GET  /api/cron/scan     (automatic, iterates all active tenants)
 *
 * Reliability architecture:
 *   LinkedIn (ICP profiles) → sync, up to 8 profiles, 10 posts each, with retry + fallback
 *   LinkedIn (keyword terms) → sync, up to 4 terms in parallel, 25 posts each, with retry + fallback
 *   Facebook → REMOVED (browser-based actor: high cost, near-zero qualifying posts)
 *
 * Resilience additions (Session 15 — Apify concentration risk mitigation):
 *   R1: FALLBACK_ACTORS — each primary actor has a named backup from a different vendor family.
 *       If both primary retries fail, runApifyActorWithRetry() promotes to the fallback actor.
 *   R3: Per-tenant memory override — Scan Memory MB field on Tenants table, falls back to 256MB.
 *   R4: Schema validation — validateActorOutput() checks first/middle/last item before any write.
 *       fieldMap normalizes actor-specific field names to Scout canonical names.
 *       Post-write sanity check flags scan as 'degraded' if >30% of records have blank Post Text.
 *
 * Error categories logged for each failure:
 *   TIMEOUT         – Apify actor exceeded waitSecs
 *   AUTH            – Bad API token (non-retriable)
 *   RATE_LIMIT      – Too many requests to Apify
 *   RUN_FAILED      – Actor errored on Apify's side
 *   NETWORK         – Connection error before Apify even responded
 *   APIFY_SERVER_ERROR – 5xx from Apify
 *   SCHEMA_MISMATCH – Actor output did not match expected field schema
 *   HTTP_xxx        – Unexpected HTTP status
 *
 * Cost optimizations (A1-A5):
 *   A2: Post deduplication — skip Claude scoring for posts already in Airtable
 *   A3: Post age filtering — only process posts from last 7 days
 *   A4: Apify result limits — cap posts fetched per actor call
 *   A5: Per-tenant usage tracking — track scans/posts processed for billing
 */

import { SHARED_BASE, PROV_TOKEN, tenantFilter, airtableCreate, airtableBatchCreate, airtableFetch } from './airtable'
import { getTierLimits } from './tier'

// ── Actor schema types ────────────────────────────────────────────────────────

/**
 * Describes the expected shape of an actor's output items.
 * required: fields that must be present and non-null for validation to pass.
 * fieldMap: maps actor-specific field names → Scout canonical names.
 *   Scout canonical: text, authorName, authorUrl, postUrl, postId
 */
export interface ActorSchema {
  required: string[]
  fieldMap: Record<string, string>
}

/**
 * Fallback actor configuration.
 * Each primary actor maps to a single backup from a DIFFERENT vendor family.
 * The fallback waitSecs is longer because fallback actors tend to be slower.
 */
export interface FallbackConfig {
  actorId:  string
  waitSecs: number
  schema:   ActorSchema
}

// ── Actor registry ─────────────────────────────────────────────────────────────
// Primary actor schemas (what fields they return and how to normalize them)
export const ACTOR_SCHEMAS: Record<string, ActorSchema> = {
  // harvestapi: returns nested author object, socialContent for URLs
  'harvestapi/linkedin-profile-posts': {
    required: ['content'],
    fieldMap: {
      'content':                    'text',
      'author.name':                'authorName',
      'author.linkedinUrl':         'authorUrl',
      'socialContent.shareUrl':     'postUrl',
      'id':                         'postId',
    },
  },

  // apimaestro: returns flat fields
  'apimaestro/linkedin-posts-search-scraper-no-cookies': {
    required: ['text'],
    fieldMap: {
      'text':             'text',
      'authorName':       'authorName',
      'authorProfileUrl': 'authorUrl',
      'postUrl':          'postUrl',
      'id':               'postId',
    },
  },
}

// Fallback actor registry: primary actor ID → fallback config
// CRITICAL: fallback actors must use a different vendor than primaries.
// Both primaries (harvestapi, apimaestro) use cookie-less proxy rotation.
// Fallbacks are from different vendors so a LinkedIn proxy block doesn't take out both.
//
// LIVE-VERIFIED April 2026: both fallback actors confirmed to exist on Apify Store,
// return data, and produce the field schemas defined below. See docs/live-validation-results.md.
export const FALLBACK_ACTORS: Record<string, FallbackConfig> = {
  // Primary: harvestapi (cookie-less proxy) → Fallback: data-slayer (different vendor)
  // Live-verified fields: text, author.title, author.url, share_url, urn
  // Input format: { profileUrls: [...], maxPosts: N } — same key as primary ✓
  'harvestapi/linkedin-profile-posts': {
    actorId:  'data-slayer/linkedin-profile-posts-scraper',
    waitSecs: 90,
    schema: {
      required: ['text'],
      fieldMap: {
        'text':         'text',        // data-slayer uses 'text' (not 'content' like harvestapi)
        'author.title': 'authorName',  // data-slayer uses author.title (not author.name)
        'author.url':   'authorUrl',   // data-slayer uses author.url (not author.linkedinUrl)
        'share_url':    'postUrl',     // data-slayer uses share_url (not socialContent.shareUrl)
        'urn':          'postId',      // data-slayer uses urn (not id)
      },
    },
  },

  // Primary: apimaestro (cookie-less proxy) → Fallback: powerai (different vendor)
  // Live-verified fields: title (=post text), author.name, author.url, url, id
  // Input format: { searchQuery: "...", limit: N } — same keys as primary ✓
  'apimaestro/linkedin-posts-search-scraper-no-cookies': {
    actorId:  'powerai/linkedin-posts-search-scraper',
    waitSecs: 90,
    schema: {
      required: ['title'],
      fieldMap: {
        'title':       'text',        // powerai uses 'title' for post content (not 'text')
        'author.name': 'authorName',  // powerai uses author.name ✓
        'author.url':  'authorUrl',   // powerai uses author.url (not authorProfileUrl)
        'url':         'postUrl',     // powerai uses 'url' (not 'postUrl')
        'id':          'postId',      // powerai uses 'id' ✓
      },
    },
  },
}

// ── Schema validation ─────────────────────────────────────────────────────────

/**
 * Validates actor output against its registered schema.
 * Samples first, middle, and last item — not just the first.
 * Returns true if valid, false if any sampled item fails.
 *
 * Deliberately does NOT throw — callers check the boolean and decide how to handle.
 */
export function validateActorOutput(actorId: string, items: any[]): boolean {
  if (!items || items.length === 0) return true  // empty result is handled separately, not a schema failure

  const schema = ACTOR_SCHEMAS[actorId] || FALLBACK_ACTORS[
    Object.keys(FALLBACK_ACTORS).find(k => FALLBACK_ACTORS[k].actorId === actorId) || ''
  ]?.schema

  if (!schema) {
    console.warn(`[scan] validateActorOutput: no schema registered for ${actorId}, skipping validation`)
    return true  // unknown actor — can't validate, allow through
  }

  const indicesToCheck = Array.from(new Set([
    0,
    Math.floor(items.length / 2),
    items.length - 1,
  ]))

  for (const idx of indicesToCheck) {
    const item = items[idx]
    for (const field of schema.required) {
      // Support dot-notation for nested fields (e.g., "author.name")
      const value = field.includes('.')
        ? field.split('.').reduce((obj: any, key: string) => obj?.[key], item)
        : item[field]

      if (value === undefined || value === null || value === '') {
        console.error(
          `[scan] Schema validation FAILED for ${actorId}: ` +
          `item[${idx}] missing required field "${field}". ` +
          `Item keys: ${Object.keys(item || {}).join(', ')}`
        )
        return false
      }
    }
  }

  return true
}

/**
 * Applies a fieldMap to a single item, returning Scout canonical field names.
 * Handles dot-notation source paths (e.g., "author.name" → reads item.author.name).
 * Fields not in the fieldMap are passed through unchanged.
 */
export function normalizeWithFieldMap(item: any, fieldMap: Record<string, string>): any {
  const result: any = { ...item }

  for (const [srcPath, destField] of Object.entries(fieldMap)) {
    const value = srcPath.includes('.')
      ? srcPath.split('.').reduce((obj: any, key: string) => obj?.[key], item)
      : item[srcPath]

    if (value !== undefined && value !== null) {
      result[destField] = value
    }
  }

  return result
}

// ── Default scan prompt ───────────────────────────────────────────────────────
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

// ── Retry + Fallback wrapper ──────────────────────────────────────────────────
// Attempt order:
//   1. Primary actor, primary config
//   2. Primary actor, reduced scope (retry)
//   3. Fallback actor (different vendor family), longer timeout — only if FALLBACK_ACTORS registered
//
// AUTH errors are non-retriable and skip directly to failure.
// Schema validation runs on each attempt's output before returning.
// If validation fails, the attempt is treated as a failure and the next attempt is tried.
export async function runApifyActorWithRetry(
  apifyToken: string,
  actorId: string,
  primaryInput: object,
  primaryOpts: { waitSecs: number; memoryMbytes: number },
  retryInput: object,
  retryOpts: { waitSecs: number; memoryMbytes: number },
  label: string,
  tenantTag?: string,
): Promise<{ items: any[]; actorUsed: string; errorType: string | null }> {

  const isRetriable = (errorType: string | null) =>
    !errorType || ['TIMEOUT', 'RUN_FAILED', 'NETWORK', 'APIFY_SERVER_ERROR', 'PARSE_ERROR'].includes(errorType)

  // ── Attempt 1: primary actor, primary config ────────────────────────────
  console.log(`[scan] ${label}: attempt 1 (actor=${actorId}, timeout=${primaryOpts.waitSecs}s, memory=${primaryOpts.memoryMbytes}MB)`)
  const first = await runApifyActor(
    apifyToken, actorId, primaryInput,
    primaryOpts.waitSecs, primaryOpts.memoryMbytes, tenantTag,
  )

  if (first.items.length > 0) {
    // Validate schema before accepting
    if (!validateActorOutput(actorId, first.items)) {
      console.error(`[scan] ${label}: attempt 1 schema validation FAILED — treating as failure, trying retry`)
      // fall through to retry
    } else {
      console.log(`[scan] ${label}: attempt 1 succeeded + validated — ${first.items.length} items`)
      return { items: first.items, actorUsed: actorId, errorType: null }
    }
  }

  // Non-retriable error (e.g., AUTH) — skip all further attempts
  if (!isRetriable(first.errorType)) {
    console.log(`[scan] ${label}: not retrying (error type: ${first.errorType})`)
    return { items: [], actorUsed: actorId, errorType: first.errorType }
  }

  // ── Attempt 2: primary actor, reduced scope ────────────────────────────
  console.log(`[scan] ${label}: attempt 2 (smaller scope, timeout=${retryOpts.waitSecs}s, memory=${retryOpts.memoryMbytes}MB)`)
  const second = await runApifyActor(
    apifyToken, actorId, retryInput,
    retryOpts.waitSecs, retryOpts.memoryMbytes, tenantTag,
  )

  if (second.items.length > 0) {
    if (!validateActorOutput(actorId, second.items)) {
      console.error(`[scan] ${label}: attempt 2 schema validation FAILED — trying fallback actor`)
      // fall through to fallback
    } else {
      console.log(`[scan] ${label}: attempt 2 succeeded + validated — ${second.items.length} items`)
      return { items: second.items, actorUsed: actorId, errorType: null }
    }
  } else {
    console.log(`[scan] ${label}: attempt 2 returned 0 items (errorType: ${second.errorType || 'none'})`)
  }

  // ── Attempt 3: fallback actor (different vendor family) ────────────────
  const fallback = FALLBACK_ACTORS[actorId]
  if (!fallback) {
    console.warn(`[scan] ${label}: no fallback actor registered for ${actorId} — scan failed`)
    return { items: [], actorUsed: actorId, errorType: second.errorType || 'NO_RESULTS' }
  }

  console.log(`[scan] ${label}: attempt 3 — FALLBACK actor ${fallback.actorId} (timeout=${fallback.waitSecs}s)`)
  // Use the same retry input (reduced scope) for the fallback to keep cost controlled
  const third = await runApifyActor(
    apifyToken, fallback.actorId, retryInput,
    fallback.waitSecs, primaryOpts.memoryMbytes, tenantTag,
  )

  if (third.items.length > 0) {
    // Validate against the FALLBACK actor's schema (not the primary's)
    if (!validateActorOutput(fallback.actorId, third.items)) {
      console.error(`[scan] ${label}: fallback actor schema validation FAILED — all 3 attempts exhausted`)
      return { items: [], actorUsed: fallback.actorId, errorType: 'SCHEMA_MISMATCH' }
    }
    console.log(`[scan] ${label}: fallback actor succeeded + validated — ${third.items.length} items`)
    return { items: third.items, actorUsed: fallback.actorId, errorType: null }
  }

  console.error(`[scan] ${label}: all 3 attempts failed (primary ×2 + fallback). errorType: ${third.errorType || 'NO_RESULTS'}`)
  return { items: [], actorUsed: fallback.actorId, errorType: third.errorType || 'NO_RESULTS' }
}

// ── Post normalizers ──────────────────────────────────────────────────────────
// These are now used after field normalization via fieldMap has already run.
// They handle the canonical field names and add Scout-specific metadata.

export function normalizeLinkedInIcpPost(raw: any, actorId: string) {
  // Apply fieldMap normalization first if we have a schema for this actor
  const schema = ACTOR_SCHEMAS[actorId] || FALLBACK_ACTORS[
    Object.keys(FALLBACK_ACTORS).find(k => FALLBACK_ACTORS[k].actorId === actorId) || ''
  ]?.schema
  const normalized = schema ? normalizeWithFieldMap(raw, schema.fieldMap) : raw

  return {
    id:         normalized.postId || normalized.id || normalized.linkedinUrl || String(Math.random()),
    postId:     normalized.postId || normalized.id || normalized.linkedinUrl,
    text:       normalized.text || normalized.content || '',
    content:    normalized.text || normalized.content || '',
    authorName: normalized.authorName || raw.author?.name || '',
    authorUrl:  normalized.authorUrl || raw.author?.linkedinUrl || raw.socialContent?.authorUrl || '',
    postUrl:    normalized.postUrl || raw.socialContent?.shareUrl || raw.linkedinUrl || '',
    platform:   'LinkedIn',
    groupName:  `LinkedIn ICP: ${normalized.authorName || raw.author?.name || 'Profile'}`,
    capturedAt: new Date().toISOString(),
  }
}

export function normalizeLinkedInKeywordPost(raw: any, searchTerm: string, actorId: string) {
  const schema = ACTOR_SCHEMAS[actorId] || FALLBACK_ACTORS[
    Object.keys(FALLBACK_ACTORS).find(k => FALLBACK_ACTORS[k].actorId === actorId) || ''
  ]?.schema
  const normalized = schema ? normalizeWithFieldMap(raw, schema.fieldMap) : raw

  return {
    id:         normalized.postId || normalized.id || normalized.postUrl || String(Math.random()),
    postId:     normalized.postId || normalized.id || normalized.postUrl,
    text:       normalized.text || normalized.content || '',
    content:    normalized.text || normalized.content || '',
    authorName: normalized.authorName || raw.authorName || raw.author?.name || '',
    authorUrl:  normalized.authorUrl || raw.authorProfileUrl || '',
    postUrl:    normalized.postUrl || raw.postUrl || raw.url || '',
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

// ── Scorer ──────────────────────────────────────────────────────────────────
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
      max_tokens: 4096,
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
    return posts.map((p) => {
      // String-coerce both sides: Haiku sometimes returns numeric IDs even when
      // the input post_id was a string, causing strict === to miss. The || scores[idx]
      // positional fallback is intentionally removed — if post_id matching fails,
      // using index order (which Haiku does not guarantee) produces cross-post
      // contamination where one author's score reason bleeds into another's record.
      const s = scores.find(x => String(x.post_id) === String(p.id || p.postId))
      return { ...p, score: s?.score ?? 5, reason: s?.reason ?? '', comment_approach: s?.comment_approach ?? '' }
    })
  } catch { return posts.map(p => ({ ...p, score: 5, reason: '' })) }
}

// ── Save scored posts to Airtable ────────────────────────────────────────────
export async function saveScoredPosts(tenantId: string, scored: any[]): Promise<{ saved: number; degraded: boolean }> {
  const qualifying = scored.filter(p => p.score >= 5)

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
    return { saved: 0, degraded: false }
  }

  let saved = 0
  try {
    await airtableBatchCreate('Captured Posts', tenantId, recordsToSave)
    saved = recordsToSave.length
  } catch (error) {
    console.error('[saveScoredPosts] Batch create failed, falling back to individual creates:', error)
    await new Promise(resolve => setTimeout(resolve, 2_000))

    for (const record of recordsToSave) {
      try {
        await airtableCreate('Captured Posts', tenantId, record.fields)
        saved++
      } catch { /* skip record */ }
    }
    if (saved < recordsToSave.length) {
      console.warn(`[saveScoredPosts] Individual fallback: saved ${saved}/${recordsToSave.length} records`)
    }
  }

  // ── R4: Post-write sanity check ─────────────────────────────────────────
  // If more than 30% of records have blank Post Text, the actor output was degraded
  // (schema mismatch that slipped past sampling, or field normalization gap).
  const blankTextCount = recordsToSave.filter(r => !r.fields['Post Text']).length
  // Divide by recordsToSave.length (not `saved`) so partial-save fallback doesn't
  // inflate the blank rate and trigger a false degraded=true.
  const blankPct = recordsToSave.length > 0 ? blankTextCount / recordsToSave.length : 0
  const degraded = blankPct > 0.3

  if (degraded) {
    console.error(
      `[saveScoredPosts] DEGRADED: ${blankTextCount}/${saved} records (${Math.round(blankPct * 100)}%) ` +
      `have blank Post Text — actor output likely has field normalization gap`
    )
  }

  return { saved, degraded }
}

// ── Filtered Airtable GET ────────────────────────────────────────────────────
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
  memoryMbytes: number,    // R3: per-tenant memory override
  tenantTag?: string,
): Promise<{ posts: any[]; source: string; actorsUsed: string[] }> {
  const actorsUsed: string[] = []

  if (icpProfiles.length > 0) {
    console.log(`[scan] LinkedIn: scanning ${icpProfiles.length} ICP profile(s) (memory=${memoryMbytes}MB)`)
    const result = await runApifyActorWithRetry(
      apifyToken,
      'harvestapi/linkedin-profile-posts',
      { profileUrls: icpProfiles, maxPosts: 10, proxy: { useApifyProxy: true }, scrapeReactions: false, scrapeComments: false },
      { waitSecs: 30, memoryMbytes },
      { profileUrls: icpProfiles.slice(0, 4), maxPosts: 5, proxy: { useApifyProxy: true }, scrapeReactions: false, scrapeComments: false },
      { waitSecs: 60, memoryMbytes },
      'LinkedIn ICP profiles',
      tenantTag,
    )
    actorsUsed.push(result.actorUsed)
    const posts = result.items.map(item => normalizeLinkedInIcpPost(item, result.actorUsed))
    return { source: 'icp_profiles', posts, actorsUsed }
  }

  const MAX_TERMS = 10
  const rawTerms = linkedinTerms.length > 0 ? linkedinTerms : (fallbackTerm ? [fallbackTerm] : [])
  const terms = rawTerms.slice(0, MAX_TERMS)
  if (terms.length === 0) return { posts: [], source: '', actorsUsed }
  if (rawTerms.length > MAX_TERMS) {
    console.warn(`[scan] LinkedIn: ${rawTerms.length} terms configured — capped at ${MAX_TERMS} to control cost`)
  }

  console.log(`[scan] LinkedIn: keyword search for ${terms.length} term(s): ${terms.join(', ')} (memory=${memoryMbytes}MB)`)
  const results = await Promise.all(
    terms.map(term =>
      runApifyActorWithRetry(
        apifyToken,
        'apimaestro/linkedin-posts-search-scraper-no-cookies',
        { searchQuery: term, limit: 50, sort_type: 'recent' },
        { waitSecs: 30, memoryMbytes },
        { searchQuery: term, limit: 25, sort_type: 'recent' },
        { waitSecs: 60, memoryMbytes },
        `LinkedIn keyword "${term}"`,
        tenantTag,
      ).then(result => {
        actorsUsed.push(result.actorUsed)
        return result.items.map(r => normalizeLinkedInKeywordPost(r, term, result.actorUsed))
      })
    )
  )
  const posts = results.flat()
  return { source: 'keyword_search', posts, actorsUsed }
}

// ── Exports ───────────────────────────────────────────────────────────────────

export interface ScanBreakdown {
  fetched:        number
  ageFiltered:    number
  deduped:        number
  newToScore:     number
  belowThreshold: number
}

export interface ScanResult {
  tenantId:   string
  postsFound: number
  scanned:    number
  scanSource: string
  message:    string
  error?:     string
  degraded?:  boolean   // R4: true if post-write sanity check triggered
  actorsUsed?: string[] // which actors actually ran (for monitoring)
  breakdown?: ScanBreakdown
}

// apifyTokenOverride: tenant's own Apify key (set by admin for account isolation).
// Falls back to the platform-wide APIFY_API_TOKEN env var for the shared pool.
export async function runScanForTenant(
  tenantId: string,
  apifyTokenOverride?: string,
  plan = 'Trial',
  memoryMbytesOverride?: number,  // R3: per-tenant memory override
): Promise<ScanResult> {
  const APIFY_TOKEN   = apifyTokenOverride || process.env.APIFY_API_TOKEN || ''
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ''

  // R3: Use per-tenant memory if provided, otherwise default to 256MB
  const memoryMbytes = memoryMbytesOverride || 256

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
    const { scanSlots, keywords: keywordSlots } = getTierLimits(plan)
    const icpJson   = await atGet(tenantId, 'LinkedIn ICPs', '{Active}=1')
    const allActive = icpJson.records || []

    const sorted = [...allActive].sort((a, b) => {
      const postsA = Number(a.fields['Posts Found'] || 0)
      const postsB = Number(b.fields['Posts Found'] || 0)
      if (postsB !== postsA) return postsB - postsA
      const dateA  = String(a.fields['Added Date'] || '')
      const dateB  = String(b.fields['Added Date'] || '')
      return dateB.localeCompare(dateA)
    })

    const icpProfiles = sorted
      .slice(0, scanSlots)
      .map((r: any) => r.fields['Profile URL'])
      .filter(Boolean)

    if (allActive.length > 0) {
      console.log(`[scan] LinkedIn ICP: ${icpProfiles.length} of ${allActive.length} active profiles selected (scanSlots=${scanSlots}, plan=${plan})`)
    }

    // 2b. LinkedIn keyword terms
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

    // ── LinkedIn scan (passes memory override through) ───────────────────────
    const linkedinResult = await scanLinkedIn(
      APIFY_TOKEN, icpProfiles, linkedinTerms, fallbackTerm, memoryMbytes, tenantId
    )

    let allPosts    = linkedinResult.posts
    const scanSources = linkedinResult.source || 'none'
    const actorsUsed  = linkedinResult.actorsUsed

    const fetchedCount = allPosts.length
    console.log(`[scan] Total: ${fetchedCount} LinkedIn posts before filtering`)

    // A3: Filter to recent posts only
    allPosts = filterPostsByAge(allPosts, 7)
    const ageFilteredCount = fetchedCount - allPosts.length
    console.log(`[scan] After age filter (7 days): ${allPosts.length} posts (removed ${ageFilteredCount} too old)`)

    // A2: Deduplicate
    const existingUrls = await getExistingPostUrls(tenantId)
    // Require a non-empty postUrl: posts without one cannot be deduped and would
    // accumulate as duplicates on every scan cycle (B2 fix).
    const newPosts = allPosts.filter(post => post.postUrl && !existingUrls.has(post.postUrl))
    const dedupedCount = allPosts.length - newPosts.length
    console.log(`[scan] After deduplication: ${newPosts.length} new posts (removed ${dedupedCount} already seen)`)

    if (!newPosts.length) {
      return {
        tenantId, postsFound: 0, scanned: allPosts.length, scanSource: scanSources,
        actorsUsed,
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

    // 4. Save (R4 sanity check runs inside saveScoredPosts)
    const { saved, degraded } = await saveScoredPosts(tenantId, scored)

    return {
      tenantId,
      postsFound: saved,
      scanned:    newPosts.length,
      scanSource: scanSources,
      actorsUsed,
      degraded,
      message: saved > 0
        ? `Found ${saved} relevant post${saved !== 1 ? 's' : ''}.${degraded ? ' WARNING: scan degraded — check actor output schema.' : ''}`
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
