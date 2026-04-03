import { NextResponse } from 'next/server'

export const maxDuration = 30

// POST — take guided answers, call Claude, return a high-quality scoring prompt
export async function POST(req: Request) {
  try {
    const { idealClient, problemSolved, highValueSignals, lowValueSignals, commentStyle } = await req.json()

    if (!idealClient || !problemSolved) {
      return NextResponse.json({ error: 'idealClient and problemSolved are required' }, { status: 400 })
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY
    if (!anthropicKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
    }

    const metaPrompt = `You are an expert at writing AI scoring prompts for social listening tools.

A user has answered a few questions about their business. Use their answers to write a high-quality, structured scoring prompt that their AI will use to evaluate social media posts and decide which ones are worth engaging with.

USER'S ANSWERS:
- Ideal client: ${idealClient}
- Problem they solve: ${problemSolved}
- High-value post signals: ${highValueSignals || 'Not specified — infer from above'}
- What to filter out: ${lowValueSignals || 'Not specified — infer from above'}
- Comment style preference: ${commentStyle || 'Peer-to-peer, 2–3 sentences, non-salesy'}

Write a scoring prompt that:
1. Opens with a 2-sentence role description for the AI (who it's supporting, what that person sells, what their goal is)
2. Has a "WHAT MAKES A HIGH-SCORE POST (7–10)" section with 4–6 specific bullet points based on their answers
3. Has a "WHAT MAKES A LOW-SCORE POST (1–4)" section with 4–5 bullet points
4. Has a "SCORING SCALE" section defining 9–10, 7–8, 5–6, and 1–4 bands
5. Has a "COMMENT APPROACH RULES" section with 4–5 rules for how to engage with qualifying posts
6. Ends with the line: "Return ONLY a JSON array. No markdown, no explanation, no preamble."

Write the prompt in second person to the AI. Be specific — use the user's actual industry language, not generic placeholders.
Output only the prompt text itself, no explanation, no wrapper.`

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        messages: [{ role: 'user', content: metaPrompt }],
      }),
    })

    if (!resp.ok) {
      const err = await resp.text()
      return NextResponse.json({ error: err }, { status: 500 })
    }

    const data = await resp.json()
    const prompt = data.content?.[0]?.text?.trim() || ''

    return NextResponse.json({ prompt })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
