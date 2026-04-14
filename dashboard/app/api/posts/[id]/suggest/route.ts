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
  // GHOSTWRITER MODE — every rule is anchored to prevent the specific failure
  // pattern observed in production: Haiku outputting meta-coaching prefixes
  // ("Extend the insight:", "Possible angle:", "Deepen the insight:") instead
  // of writing the comment itself. Positive example at the end acts as the
  // strongest anchor — LLMs follow demonstrated format more reliably than
  // abstract rules alone.
  const SYSTEM_PROMPT = `You are a ghostwriter for LinkedIn comments. Your output is the finished comment text — the exact words the user will paste into LinkedIn and post as their own. You never output anything other than the comment itself.

HARD RULES:

1. Output ONLY the comment text. Never prepend a label, direction, or meta-commentary. The following are ALL wrong — never produce output that starts like any of these:
   WRONG: "Extend the insight: In your experience..."
   WRONG: "Possible angle: Ask about..."
   WRONG: "Deepen the insight: If ownership is..."
   WRONG: "Build on this: ..."
   WRONG: "Challenge the premise: ..."
   WRONG: "Here's a comment: ..."
   WRONG: "Suggested comment: ..."
   WRONG: "Comment: ..."
   WRONG: "You could ask about..."
   WRONG: "Share a specific insight..."
   WRONG: "Validate the tension and offer a counterintuitive take: Agency leaders often find their voice faster..."
   WRONG: "Offer a reframe: The ownership gap usually shows up..."
   WRONG: "Lean into the vulnerability: Most founders feel this..."
   Your output starts with the first word of the comment — nothing before it.

2. First-person voice. Write as the user. "I've noticed...", "In my experience...", "Curious whether...", "Have you found that..."

3. 2 to 3 sentences maximum. Short sentences that read on a phone.

4. Never open with a compliment: no "Great post", "Love this", "This is so true", "This resonates", "Well said", "Spot on", "Brilliant", "Powerful".

5. No em dashes (—). Use a comma, a period, or rewrite.

6. Never use: "certainly", "absolutely", "I'd love to", "fantastic", "delve", "leverage" as a verb, "game-changer", "paradigm shift", "in conclusion", "at the end of the day", "it's important to note", "I completely agree", "groundbreaking", "transformative", "kudos".

7. Never mention the user's business, company name, or services. Business context is background perspective only.

8. No surrounding quotes, asterisks, or markdown.

9. Sound like a real professional who read this post and has something genuine to say.

CORRECT OUTPUT EXAMPLE:
The ownership gap usually shows up fastest in handoff moments, when marketing throws leads over the fence and nobody tracks what happens next. Have you seen that pattern get worse at a certain team size?

That is the format. Write the comment. Start immediately with the first word.`

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

  // Post-process: runtime backstop for meta-coaching prefixes that survive the
  // system prompt. Pattern: "Label word(s): rest of text" where the label is a
  // ghostwriting direction rather than the start of the actual comment.
  // This is a safety net — the system prompt is the primary control.
  // [^:]* (not .*?) — greedy-up-to-colon so the full directive phrase is captured
  // before the ": " separator. .*? stops at the first whitespace, leaving partial
  // phrases like "and offer a counterintuitive take:" unstripped.
  // Require an actual colon (:\s*) not [:\s]+ — the latter matches spaces
  // between words in legitimate comments (e.g. "Flip the script on X and see results"
  // would be falsely stripped at the space before a word). The colon is always
  // present in meta-coaching prefix patterns and is the correct separator to require.
  const META_PREFIX_RE = /^(extend the insight|possible angle|deepen the insight|build on this|challenge the premise|add context|try this|here'?s? (a |an )?comment|suggested comment|comment|approach|angle|option \d+|validate the tension[^:]*|offer a (reframe|counterintuitive|perspective)[^:]*|lean into the[^:]*|acknowledge the[^:]*|push back on[^:]*|reframe the[^:]*|flip the[^:]*|challenge this[^:]*):\s*/i
  if (commentApproach) {
    commentApproach = commentApproach
      .replace(META_PREFIX_RE, '')          // strip ghostwriter meta-prefix
      .replace(/^["'\u201C\u2018]+/, '')    // strip leading quotes
      .replace(/["'\u201D\u2019]+$/, '')    // strip trailing quotes
      .trim()
    // Re-capitalize after strip
    if (commentApproach.length > 0) {
      commentApproach = commentApproach[0].toUpperCase() + commentApproach.slice(1)
    }
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
