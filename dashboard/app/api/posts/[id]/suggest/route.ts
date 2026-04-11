/**
 * POST /api/posts/[id]/suggest
 *
 * Generates a "Comment Approach" for a single post on demand.
 *
 * Flow:
 *   1. Verify tenant session and plan limits (commentCredits gate)
 *   2. Verify tenant owns the record
 *   3. Fetch post text + author from Airtable
 *   4. Fetch business profile for context
 *   5. Call Claude Haiku to generate a 2-sentence comment approach
 *   6. Save back to Airtable and increment the tenant's usage counter
 *   7. Return { commentApproach, creditsUsed, creditsLimit }
 *
 * Credit enforcement:
 *   - Reads "Suggestions Used" from the Tenants table (shared Platform base)
 *   - Checks against plan's commentCredits limit before calling Claude
 *   - Increments "Suggestions Used" after a successful generation
 *   - Infinite plans (Pro, Agency, Owner) bypass the counter entirely
 */

import { NextRequest, NextResponse }  from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import { verifyRecordTenant, airtableUpdate, SHARED_BASE, PROV_TOKEN, tenantFilter } from '@/lib/airtable'
import { getTierLimits } from '@/lib/tier'

const TABLE          = 'Captured Posts'
const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''

// ── Credit helpers (Platform Tenants table) ───────────────────────────────────

interface CreditRecord {
  recordId: string
  used: number
}

async function getTenantCreditRecord(tenantId: string): Promise<CreditRecord | null> {
  if (!PLATFORM_TOKEN || !PLATFORM_BASE) return null
  try {
    const filter = tenantId === 'owner'
      ? `OR({Tenant ID}='owner',{Tenant ID}='')`
      : `{Tenant ID}='${tenantId}'`
    const url = new URL(`https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent('Tenants')}`)
    url.searchParams.set('filterByFormula', filter)
    url.searchParams.set('fields[]', 'Suggestions Used')
    url.searchParams.set('maxRecords', '1')
    const resp = await fetch(url.toString(), { headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` } })
    if (!resp.ok) return null
    const data = await resp.json()
    const rec  = data.records?.[0]
    if (!rec) return null
    return { recordId: rec.id, used: Number(rec.fields?.['Suggestions Used'] || 0) }
  } catch { return null }
}

async function incrementCreditCounter(recordId: string, currentUsed: number): Promise<void> {
  if (!PLATFORM_TOKEN || !PLATFORM_BASE) return
  try {
    await fetch(`https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent('Tenants')}/${recordId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${PLATFORM_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { 'Suggestions Used': currentUsed + 1 } }),
    })
  } catch (e) {
    console.error('[suggest] Failed to increment Suggestions Used:', e)
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()

  const { id } = params
  const { commentCredits: creditLimit } = getTierLimits(tenant.plan)

  // ── Comment credit gate (skip for unlimited plans) ────────────────────────
  let creditRecord: CreditRecord | null = null
  if (isFinite(creditLimit)) {
    creditRecord = await getTenantCreditRecord(tenant.tenantId)
    const used = creditRecord?.used ?? 0
    if (used >= creditLimit) {
      return NextResponse.json(
        {
          error:        `You've used all ${creditLimit} comment idea credits included in your plan.`,
          creditsUsed:  used,
          creditsLimit: creditLimit,
          action:       'upgrade',
        },
        { status: 429 }
      )
    }
  }

  // ── Ownership check ───────────────────────────────────────────────────────
  const owned = await verifyRecordTenant(TABLE, id, tenant.tenantId)
  if (!owned) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) {
    console.error('[suggest] ANTHROPIC_API_KEY is not set in environment')
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })
  }

  // ── Fetch post text via filter query (PROV_TOKEN lacks per-record GET scope) ─
  let postText   = ''
  let authorName = ''
  try {
    const postUrl = new URL(`https://api.airtable.com/v0/${SHARED_BASE}/${encodeURIComponent(TABLE)}`)
    postUrl.searchParams.set('filterByFormula', `RECORD_ID()='${id}'`)
    postUrl.searchParams.set('fields[]', 'Post Text')
    postUrl.searchParams.append('fields[]', 'Author Name')
    postUrl.searchParams.set('maxRecords', '1')
    const postResp = await fetch(postUrl.toString(), { headers: { Authorization: `Bearer ${PROV_TOKEN}` } })
    if (postResp.ok) {
      const postData = await postResp.json()
      const rec  = postData.records?.[0]?.fields || {}
      postText   = rec['Post Text']   || ''
      authorName = rec['Author Name'] || ''
    }
  } catch {}

  if (!postText) {
    return NextResponse.json({ error: 'Could not fetch post text.' }, { status: 422 })
  }

  // ── Fetch business profile for context ────────────────────────────────────
  let businessContext = ''
  try {
    const profileUrl = new URL(`https://api.airtable.com/v0/${SHARED_BASE}/${encodeURIComponent('Business Profile')}`)
    profileUrl.searchParams.set('filterByFormula', tenantFilter(tenant.tenantId))
    profileUrl.searchParams.set('maxRecords', '1')
    const profileResp = await fetch(profileUrl.toString(), { headers: { Authorization: `Bearer ${PROV_TOKEN}` } })
    if (profileResp.ok) {
      const profileData = await profileResp.json()
      const pf = profileData.records?.[0]?.fields || {}
      businessContext = [
        pf['Business Name'] && `Business: ${pf['Business Name']}`,
        pf['Industry']      && `Industry: ${pf['Industry']}`,
        pf['Ideal Client']  && `Ideal client: ${pf['Ideal Client']}`,
        pf['Problem Solved']&& `We solve: ${pf['Problem Solved']}`,
      ].filter(Boolean).join('\n')
    }
  } catch {}

  // ── Generate LinkedIn comment via Claude ──────────────────────────────────
  //
  // System prompt enforces hard behavioral rules that must not be overridden
  // by post content (prompt injection) or business context bleed-through.
  // User message provides the post and context only.
  //
  // Key design decisions:
  //   - "Write the comment itself" framing prevents coaching-instruction output
  //   - Em-dash prohibition is explicit — Claude Haiku's top AI tell on LinkedIn
  //   - AI-isms blacklist prevents hollow vocabulary
  //   - Business context is framed as perspective-only, not to be mentioned
  //   - No surrounding quotes in output — UI already wraps in display quotes
  const SYSTEM_PROMPT = `You write LinkedIn comments for B2B professionals. Every output must be the actual comment text — copy-paste ready, not coaching instructions or directions.

HARD RULES — never break these:
1. Write the comment itself. Never write instructions such as "Share a specific insight..." or describe what angle to take or how to respond. The text you return IS the comment the user will paste into LinkedIn.
2. First-person voice. The user pastes this directly as their own comment.
3. 2 to 3 sentences maximum. Keep each sentence short enough to read comfortably on a phone.
4. Never open with a compliment: no "Great post", "Love this", "This is so true", "This resonates", "Well said", "Spot on", "Brilliant", "Powerful".
5. Never use em dashes (—). Replace with a comma, a period, or rewrite the sentence.
6. Never use these words or phrases: "certainly", "absolutely", "I'd love to", "fantastic", "delve", "leverage" as a verb, "game-changer", "paradigm shift", "in conclusion", "at the end of the day", "it's important to note", "I completely agree", "groundbreaking", "transformative", "kudos".
7. Never mention the user's business, company name, or services in the comment — use the business context only to understand their perspective.
8. Do not prepend any label: no "Comment:", "Here's the comment:", "Suggested comment:", or similar.
9. Return raw text only — no surrounding quotes, no asterisks, no markdown formatting.
10. Sound like a real professional who read the post carefully and has something genuine to contribute.`

  const userMessage = `${authorName || 'Someone'} posted this on LinkedIn:

${postText.slice(0, 800)}
${businessContext ? `\n[Your context — for perspective only, never mention it directly]:\n${businessContext}` : ''}

Write the LinkedIn comment. Return only the comment text.`

  // Fallback — no system prompt, minimal framing, used if primary returns empty
  const fallbackMessage = `LinkedIn post by ${authorName || 'someone'}:

"${postText.slice(0, 400)}"

Write a short 2-sentence LinkedIn comment in first person, ready to copy and paste. No em dashes. No compliments. No AI phrases. Return only the comment text.`

  async function callClaude(sysPrompt: string | null, userPrompt: string): Promise<string> {
    const body: Record<string, unknown> = {
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages:   [{ role: 'user', content: userPrompt }],
    }
    if (sysPrompt) body.system = sysPrompt
    const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': anthropicKey!, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!aiResp.ok) {
      const errBody = await aiResp.text().catch(() => '')
      console.error(`[suggest] Claude API non-ok ${aiResp.status}: ${errBody.slice(0, 400)}`)
      return ''
    }
    const aiData = await aiResp.json()
    const text = (aiData.content?.[0]?.text || '').trim()
    if (!text) {
      console.error('[suggest] Claude returned ok but empty text. stop_reason:', aiData.stop_reason, 'content_len:', aiData.content?.length ?? 0)
    }
    return text
  }

  let commentApproach = ''
  try {
    commentApproach = await callClaude(SYSTEM_PROMPT, userMessage)
    if (!commentApproach) {
      console.warn('[suggest] Primary prompt returned empty — retrying with fallback')
      commentApproach = await callClaude(null, fallbackMessage)
    }
  } catch (err: any) {
    console.error('[suggest] Claude API fetch exception:', err?.message)
  }

  // Post-process: strip any residual outer quotes Claude might still return
  // and trim whitespace
  if (commentApproach) {
    commentApproach = commentApproach
      .replace(/^["'\u201C\u2018]+/, '')  // strip leading quotes
      .replace(/["'\u201D\u2019]+$/, '')  // strip trailing quotes
      .trim()
  }

  if (!commentApproach) {
    return NextResponse.json(
      { error: 'Could not generate a comment approach right now. Please try again in a moment.' },
      { status: 503 }
    )
  }

  // ── Save back to Airtable ─────────────────────────────────────────────────
  try {
    await airtableUpdate(TABLE, id, { 'Comment Approach': commentApproach })
  } catch {}

  // ── Increment credit counter (non-fatal) ──────────────────────────────────
  if (isFinite(creditLimit) && creditRecord) {
    await incrementCreditCounter(creditRecord.recordId, creditRecord.used)
  }

  return NextResponse.json({
    commentApproach,
    creditsUsed:  isFinite(creditLimit) ? (creditRecord?.used ?? 0) + 1 : null,
    creditsLimit: isFinite(creditLimit) ? creditLimit : null,
  })
}
