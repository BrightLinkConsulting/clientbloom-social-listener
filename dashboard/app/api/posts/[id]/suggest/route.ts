/**
 * POST /api/posts/[id]/suggest
 *
 * Generates a "Comment Approach" for a single post that was saved without one.
 * This handles posts captured before the max_tokens fix (2000 → 4096) which caused
 * JSON truncation and wiped comment_approach from all posts in large batches.
 *
 * Flow:
 *   1. Verify tenant owns this record
 *   2. Fetch the post text + author from Airtable
 *   3. Fetch the tenant's business profile for context
 *   4. Call Claude Haiku to generate a 2-sentence comment approach
 *   5. Save it back to the Airtable record
 *   6. Return { commentApproach: string }
 */

import { NextRequest, NextResponse }  from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import { verifyRecordTenant, airtableUpdate, SHARED_BASE, PROV_TOKEN, tenantFilter } from '@/lib/airtable'

const TABLE = 'Captured Posts'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()

  const { id } = params

  // Ownership check
  const owned = await verifyRecordTenant(TABLE, id, tenant.tenantId)
  if (!owned) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) {
    console.error('[suggest] ANTHROPIC_API_KEY is not set in environment')
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })
  }

  // ── Fetch post text via filter query (PROV_TOKEN lacks per-record GET scope) ─────
  let postText = ''
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
      const rec = postData.records?.[0]?.fields || {}
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

  // ── Generate comment approach via Claude ───────────────────────────────────
  const contextBlock = businessContext ? `BUSINESS CONTEXT:\n${businessContext}\n\n` : ''
  const prompt = `${contextBlock}A LinkedIn user named "${authorName || 'someone'}" posted the following:

"${postText.slice(0, 800)}"

Write a 2-sentence comment approach for this post. The comment should add a specific insight the post didn't cover, share a counterintuitive perspective, or ask one genuinely curious follow-up question. Peer-to-peer tone. No pitching, no offering services. Goal: be someone they want to know.

Return ONLY the comment approach text — no labels, no quotes, no explanation.`

  let commentApproach = ''
  try {
    const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (aiResp.ok) {
      const aiData = await aiResp.json()
      commentApproach = (aiData.content?.[0]?.text || '').trim()
      if (!commentApproach) {
        console.error('[suggest] Claude returned ok but empty text. Response:', JSON.stringify(aiData).slice(0, 400))
      }
    } else {
      const errBody = await aiResp.text().catch(() => '')
      console.error(`[suggest] Claude API non-ok ${aiResp.status}: ${errBody.slice(0, 400)}`)
    }
  } catch (err: any) {
    console.error('[suggest] Claude API fetch exception:', err?.message)
  }

  if (!commentApproach) {
    return NextResponse.json({ error: 'Generation failed.' }, { status: 500 })
  }

  // ── Save back to Airtable ──────────────────────────────────────────────────
  try {
    await airtableUpdate(TABLE, id, { 'Comment Approach': commentApproach })
  } catch {}

  return NextResponse.json({ commentApproach })
}
