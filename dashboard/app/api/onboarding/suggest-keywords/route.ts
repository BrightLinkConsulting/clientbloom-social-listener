/**
 * POST /api/onboarding/suggest-keywords
 *
 * Given a user's business profile and an existing keyword, returns 3–5
 * AI-enhanced keyword phrase variations tuned for LinkedIn search.
 *
 * Used during onboarding to help new users turn vague custom keywords
 * into high-signal 2–4 word phrases that match how their ICP actually posts.
 *
 * Access: authenticated users only (no plan gate — this improves data quality
 * for all plans).
 */

import { NextResponse }                 from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'

export const maxDuration = 20

export async function POST(req: Request) {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) {
    return NextResponse.json({ error: 'Keyword suggestions unavailable.' }, { status: 500 })
  }

  try {
    const { keyword, industry, idealClient, problemSolved } = await req.json()

    if (!keyword?.trim()) {
      return NextResponse.json({ error: 'keyword is required' }, { status: 400 })
    }

    const prompt = `You are a LinkedIn search keyword specialist. A user is setting up a LinkedIn monitoring tool and wants to track posts about a topic they care about.

Their business context:
- Industry/niche: ${industry || 'not specified'}
- Ideal client: ${idealClient || 'not specified'}
- Value they deliver: ${problemSolved || 'not specified'}

The user typed this keyword: "${keyword.trim()}"

Your job: Return 4 keyword phrase variations that will surface posts their ideal clients actually write on LinkedIn. These phrases will be used to search for public LinkedIn posts — so they need to match how real professionals phrase these topics organically.

Rules:
- Each phrase must be 2–5 words (single words are too broad, 6+ words are too narrow)
- Use natural language that a professional would type in a LinkedIn post, not marketing copy
- Vary the angle: include the original concept, a related pain point, a strategic version, and a question angle people ask
- Return ONLY a JSON array of 4 strings, no explanation, no markdown
- Example for "client retention": ["client retention", "losing a client", "retainer model", "client churn"]`

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         anthropicKey,
        'anthropic-version': '2023-06-01',
        'Content-Type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!resp.ok) {
      return NextResponse.json({ error: 'Suggestion service unavailable.' }, { status: 502 })
    }

    const data  = await resp.json()
    const raw   = data?.content?.[0]?.text?.trim() || '[]'

    // Parse JSON array safely — fall back to empty array if malformed
    let suggestions: string[] = []
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        suggestions = parsed
          .filter((s: unknown) => typeof s === 'string' && s.trim().length > 0)
          .map((s: string) => s.trim())
          .slice(0, 5)
      }
    } catch {
      // Non-fatal: return empty array so UI degrades gracefully
    }

    return NextResponse.json({ suggestions })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Unknown error' }, { status: 500 })
  }
}
