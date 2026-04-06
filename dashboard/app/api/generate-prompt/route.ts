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

    const metaPrompt = `You are an expert at writing AI scoring prompts for LinkedIn relationship intelligence tools.

A user has answered questions about their business. Use their answers to write a scoring prompt their AI will use to identify LinkedIn posts worth engaging with — not to find people in pain, but to find the right moments to show up, add value, and become a familiar, trusted face to their ideal clients.

USER'S ANSWERS:
- Ideal client: ${idealClient}
- Value they deliver: ${problemSolved}
- Conversation types to prioritize: ${highValueSignals || 'Not specified — infer from above'}
- What to filter out: ${lowValueSignals || 'Not specified — infer from above'}
- Comment style preference: ${commentStyle || 'Peer-to-peer, 2–3 sentences, non-salesy'}

Write a scoring prompt that:
1. Opens with a 2-sentence role description for the AI: who it is supporting, what that person sells, and that the goal is relationship-building through genuine, valuable engagement — not identifying pain or pitching solutions.
2. Has a "HIGH-VALUE CONVERSATION ENTRIES (7–10)" section with 4–6 specific bullet points. Focus on: questions, debates, opinions, milestones, evaluations, thought leadership the user can add to — all tuned to this user's specific ICP and industry language.
3. Has a "LOW-VALUE / SKIP (1–4)" section with 3–4 bullets: pure broadcast content, irrelevant posts, promotional posts, no natural comment angle.
4. Has a "SCORING SCALE" section defining 9–10, 7–8, 5–6, and 1–4 bands.
5. Has a "COMMENT APPROACH RULES" section with 4–5 rules. Rules must emphasize: adding specific insight the post didn't cover, sharing a counterintuitive perspective, asking one genuinely curious follow-up question. Explicitly state: no pitching, no "I can help with that," no offering services. The goal is to be someone they want to know.
6. Ends with: "Return ONLY a JSON array: [{post_id, score, reason, comment_approach}]. No markdown, no explanation, no preamble."

Write the prompt in second person to the AI. Be specific — use the user's actual industry language and the names of their ICP roles, not generic placeholders.
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
