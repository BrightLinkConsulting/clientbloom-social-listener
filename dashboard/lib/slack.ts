/**
 * lib/slack.ts — Slack API wrapper for Scout
 * Posts messages to a tenant's configured Slack channel.
 */

export interface SlackPostResult {
  ok: boolean
  error?: string
  ts?: string
}

/**
 * Post a message to a Slack channel using the tenant's bot token.
 * Uses Block Kit blocks when provided; falls back to plain text.
 */
export async function postSlackMessage(
  botToken: string,
  channelId: string,
  text: string,
  blocks?: object[]
): Promise<SlackPostResult> {
  if (!botToken || !channelId) {
    return { ok: false, error: 'missing_credentials' }
  }

  const body: Record<string, any> = {
    channel: channelId,
    text,           // fallback for notifications + accessibility
  }
  if (blocks && blocks.length > 0) body.blocks = blocks

  try {
    const r = await fetch('https://slack.com/api/chat.postMessage', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = await r.json()
    if (!data.ok) return { ok: false, error: data.error || 'slack_error' }
    return { ok: true, ts: data.ts }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}
