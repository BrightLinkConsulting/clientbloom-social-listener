/**
 * POST /api/inbox-agent
 *
 * Scout Agent — conversational AI assistant for inbox management.
 *
 * The agent has read access to the user's inbox state (counts, score
 * distribution, top posts) and interprets natural language commands into
 * structured actions that the frontend then executes via /api/posts/bulk.
 *
 * Request body:
 * {
 *   message: string              — user's natural language message
 *   context: {
 *     inboxCount:   number       — total posts in inbox (Action='New')
 *     skippedCount: number       — posts in Skipped tab
 *     topPosts: Array<{          — top 10 posts for agent context
 *       id:     string
 *       author: string
 *       score:  number
 *       text:   string (first 200 chars)
 *     }>
 *     scoreDistribution: {       — count of posts by score bracket
 *       high: number             — score 8-10
 *       mid:  number             — score 6-7
 *       low:  number             — score 0-5
 *     }
 *   }
 *   history?: Array<{            — prior messages in this session (max 6)
 *     role: 'user' | 'assistant'
 *     content: string
 *   }>
 * }
 *
 * Response:
 * {
 *   reply:    string             — agent's message to display
 *   action?:  {                  — optional action for frontend to execute
 *     type:   'bulk_skip'        — skip posts matching filter
 *           | 'bulk_archive'     — archive posts matching filter
 *           | 'bulk_restore'     — restore skipped to inbox
 *           | 'set_min_score'    — apply score filter in UI
 *           | 'none'
 *     filter?: {
 *       maxScore?:     number
 *       currentAction?: string
 *     }
 *     minScore?: number          — for set_min_score
 *     confirm:  boolean          — whether to ask user to confirm before executing
 *     summary:  string           — human-readable description of what will happen
 *   }
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ''

// ── System prompt for Scout Agent ────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Scout Agent, an AI inbox assistant embedded in Scout by ClientBloom.
Scout is a LinkedIn intelligence tool that surfaces posts from ideal clients (ICPs) and keyword searches.
The user's feed has tabs: Inbox (new posts to review), Engaged, Replied, Skipped, and In CRM.
Posts have a Relevance Score (1-10) — higher scores mean a stronger conversation entry point.

Your role is to help the user manage their inbox conversationally — sorting through it, clearing low-value posts, and surfacing what matters most.

You can take the following ACTIONS (only suggest these when appropriate):
- bulk_skip: Skip posts matching a score filter (removes from inbox, adds to Skipped tab)
- bulk_archive: Archive posts (hidden from all tabs, for cleanup)
- bulk_restore: Restore skipped posts back to inbox
- set_min_score: Filter the inbox to show only posts above a score threshold
- none: Just respond conversationally (no action needed)

RULES:
1. Always confirm before taking destructive bulk actions (skipping/archiving many posts).
2. Be direct and concise — the user is busy. 2-3 sentences max in your reply.
3. If asked "what should I engage with?", suggest top 2-3 posts from context by author name and score.
4. For score thresholds: score 8+ = engage today, score 6-7 = engage when inspired, score 5 and below = skip.
5. Never hallucinate post details — only reference posts from the context provided.
6. If the inbox is overwhelming (>200 posts), proactively suggest "clear noise below score 6".

Return a JSON object ONLY, no markdown:
{
  "reply": "your message to the user",
  "action": {
    "type": "bulk_skip" | "bulk_archive" | "bulk_restore" | "set_min_score" | "none",
    "filter": { "maxScore": N, "currentAction": "New" },
    "minScore": N,
    "confirm": true | false,
    "summary": "human-readable description of what will happen"
  }
}
If no action is needed, set action.type to "none" and confirm to false.`

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()

  if (!ANTHROPIC_KEY) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
  }

  let body: {
    message:  string
    context?: {
      inboxCount?:        number
      skippedCount?:      number
      topPosts?:          { id: string; author: string; score: number; text: string }[]
      scoreDistribution?: { high: number; mid: number; low: number }
    }
    history?: { role: 'user' | 'assistant'; content: string }[]
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { message, context = {}, history = [] } = body

  if (!message?.trim()) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  // Build context summary for the agent
  const inboxCount  = context.inboxCount  ?? 0
  const skippedCount = context.skippedCount ?? 0
  const dist        = context.scoreDistribution ?? { high: 0, mid: 0, low: 0 }
  const topPosts    = (context.topPosts ?? []).slice(0, 10)

  const contextBlock = [
    `INBOX STATE:`,
    `- ${inboxCount} posts in inbox`,
    `- ${skippedCount} posts in skipped tab`,
    `- Score breakdown: ${dist.high} high (8-10), ${dist.mid} mid (6-7), ${dist.low} low (0-5)`,
    topPosts.length > 0
      ? `TOP POSTS:\n${topPosts.map(p => `  • Score ${p.score}/10 | ${p.author}: "${p.text.slice(0, 120)}..."`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n')

  // Build message history (max 6 prior turns)
  const priorMessages = history.slice(-6).map(m => ({
    role:    m.role as 'user' | 'assistant',
    content: m.content,
  }))

  const messages = [
    ...priorMessages,
    {
      role:    'user' as const,
      content: `${contextBlock}\n\nUSER MESSAGE: ${message.trim()}`,
    },
  ]

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system:     SYSTEM_PROMPT,
        messages,
      }),
    })

    if (!res.ok) {
      const err = await res.text().catch(() => '')
      console.error(`[inbox-agent] Claude error ${res.status}: ${err.slice(0, 200)}`)
      return NextResponse.json({ error: 'Agent unavailable' }, { status: 503 })
    }

    const data = await res.json()
    const rawText = data.content?.[0]?.text || '{}'

    // Parse agent response — extract JSON
    let agentResponse: { reply: string; action?: any } = { reply: 'Something went wrong. Try again.' }
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (jsonMatch) agentResponse = JSON.parse(jsonMatch[0])
    } catch {
      // Fallback: treat raw text as reply with no action
      agentResponse = { reply: rawText.slice(0, 500), action: { type: 'none', confirm: false } }
    }

    return NextResponse.json({
      reply:  agentResponse.reply   || 'Done.',
      action: agentResponse.action  || { type: 'none', confirm: false },
    })
  } catch (e: any) {
    console.error('[inbox-agent] Unexpected error:', e.message)
    return NextResponse.json({ error: 'Agent error' }, { status: 500 })
  }
}
