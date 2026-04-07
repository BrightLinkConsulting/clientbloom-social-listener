/**
 * lib/digest.ts — Daily brief generator for Scout
 *
 * Sends a concise summary to Slack — enough to show value and drive
 * people into the platform. Deliberately does NOT list posts or expose
 * content. The goal is stickiness, not inbox replacement.
 */

import { SHARED_BASE, PROV_TOKEN, tenantFilter } from '@/lib/airtable'
import { postSlackMessage } from '@/lib/slack'

const AIRTABLE_BASE  = 'https://api.airtable.com/v0'
const MIN_SCORE      = 5
// Never fall back to the old staging URL — use production domain
const DASHBOARD_URL  = (process.env.NEXT_PUBLIC_BASE_URL || 'https://scout.clientbloom.ai').replace(/\/$/, '')

export interface DigestResult {
  sent:      boolean
  postCount: number
  tenantId:  string
  error?:    string
  skipped?:  string
}

// ─── Airtable helpers ─────────────────────────────────────────────────────────

async function getSlackConfig(tenantId: string): Promise<{ botToken: string; channelId: string; channelName: string } | null> {
  const params = new URLSearchParams({
    filterByFormula: tenantFilter(tenantId),
    'fields[]':  'Slack Bot Token',
    'fields[1]': 'Slack Channel ID',
    'fields[2]': 'Slack Channel Name',
    pageSize: '1',
  })
  const r = await fetch(`${AIRTABLE_BASE}/${SHARED_BASE}/Business%20Profile?${params}`, {
    headers: { Authorization: `Bearer ${PROV_TOKEN}` },
  })
  const data = await r.json()
  const rec = data.records?.[0]?.fields
  if (!rec?.['Slack Bot Token']) return null
  return {
    botToken:    rec['Slack Bot Token'],
    channelId:   rec['Slack Channel ID']   || '',
    channelName: rec['Slack Channel Name'] || '',
  }
}

/**
 * Paginate through all Airtable records matching a formula.
 * Airtable caps each response at 100 — without this, counts silently truncate.
 */
async function fetchAllRecords(table: string, params: URLSearchParams): Promise<any[]> {
  const records: any[] = []
  let offset: string | undefined

  do {
    if (offset) params.set('offset', offset)
    else params.delete('offset')

    const r = await fetch(
      `${AIRTABLE_BASE}/${SHARED_BASE}/${encodeURIComponent(table)}?${params}`,
      { headers: { Authorization: `Bearer ${PROV_TOKEN}` } }
    )
    const data = await r.json()
    records.push(...(data.records || []))
    offset = data.offset
  } while (offset)

  return records
}

/**
 * Returns midnight today in PDT/PST as an ISO string.
 * PDT = UTC-7 (Mar–Nov), PST = UTC-8 (Nov–Mar).
 * Using a fixed UTC-7 offset is safe for the 7 AM PDT cron window.
 */
function todayMidnightUTC(): string {
  const now = new Date()
  // LA is UTC-7 during PDT (most of the year when digest runs)
  const laOffsetHours = 7
  const midnightUTC = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    // if current UTC time is before 7 AM (i.e., still "yesterday" in LA), use yesterday's date
    now.getUTCHours() < laOffsetHours ? now.getUTCDate() - 1 : now.getUTCDate(),
    laOffsetHours, 0, 0, 0  // 07:00 UTC = midnight PDT
  ))
  return midnightUTC.toISOString()
}

interface TopPost {
  authorName: string
  subtitle:   string   // cleaned role/company from Group Name (e.g. "Head of CS @ Notion")
  text:       string   // first sentence, max ~120 chars
  score:      number
  postUrl:    string   // LinkedIn post URL for the View Post button
}

interface BriefStats {
  newToday:      number
  topPosts:      TopPost[]   // up to 5, sorted by score desc
  momentumTrend: 'up' | 'flat' | 'down' | 'new'
}

async function getBriefStats(tenantId: string): Promise<BriefStats> {
  const since = todayMidnightUTC()

  // Query — today's new posts, sorted by score desc, with all card fields
  // Paginated. Count = newToday; top 3 become the Slack post cards.
  const todayParams = new URLSearchParams({
    filterByFormula: `AND(
      ${tenantFilter(tenantId)},
      {Relevance Score}>=${MIN_SCORE},
      IS_AFTER({Captured At}, '${since}'),
      {Engagement Status}!='archived'
    )`,
    'fields[]':  'Relevance Score',
    'fields[1]': 'Author Name',
    'fields[2]': 'Post Text',
    'fields[3]': 'Group Name',
    'fields[4]': 'Post URL',
    'sort[0][field]':     'Relevance Score',
    'sort[0][direction]': 'desc',
    pageSize: '100',
  })

  const todayPosts = await fetchAllRecords('Captured Posts', todayParams)

  // Build top-3 cards (Airtable already sorted by score desc)
  const topPosts: TopPost[] = todayPosts.slice(0, 3).map(r => {
    // Subtitle: strip "LinkedIn ICP: " prefix and anything after " | "
    const groupRaw = (r.fields?.['Group Name'] || '') as string
    const subtitle = groupRaw.startsWith('LinkedIn ICP: ')
      ? groupRaw.slice('LinkedIn ICP: '.length).split(' | ')[0].trim()
      : ''

    // First sentence, capped at 120 chars
    const raw  = (r.fields?.['Post Text'] || '') as string
    const sentenceMatch = raw.match(/^.+?[.!?](?=\s|$)/)
    const sentence = sentenceMatch ? sentenceMatch[0] : raw
    const text = sentence.length > 120 ? sentence.slice(0, 120).trimEnd() + '…' : sentence

    return {
      authorName: (r.fields?.['Author Name'] || 'Unknown') as string,
      subtitle,
      text,
      score:   (r.fields?.['Relevance Score'] || 0) as number,
      postUrl: (r.fields?.['Post URL']         || '') as string,
    }
  })

  // Read stored momentum history to determine trend
  let momentumTrend: BriefStats['momentumTrend'] = 'new'
  try {
    const bpParams = new URLSearchParams({
      filterByFormula: tenantFilter(tenantId),
      'fields[]': 'Momentum History',
      pageSize: '1',
    })
    const bpRes  = await fetch(`${AIRTABLE_BASE}/${SHARED_BASE}/Business%20Profile?${bpParams}`, {
      headers: { Authorization: `Bearer ${PROV_TOKEN}` },
    })
    const bpData = await bpRes.json()
    const raw    = bpData.records?.[0]?.fields?.['Momentum History'] || '[]'
    const history: { date: string; engaged: number; replied: number; surfaced: number }[] = JSON.parse(raw)
    if (history.length >= 2) {
      // Compare last 3 days vs the 3 days before that
      const recent = history.slice(-3)
      const prior  = history.slice(-6, -3)
      const recentAct = recent.reduce((s, d) => s + d.engaged + d.replied * 2, 0)
      const priorAct  = prior.reduce( (s, d) => s + d.engaged + d.replied * 2, 0)
      if (prior.length === 0)       momentumTrend = 'new'
      else if (recentAct > priorAct * 1.1) momentumTrend = 'up'
      else if (recentAct < priorAct * 0.7) momentumTrend = 'down'
      else                                  momentumTrend = 'flat'
    }
  } catch { /* non-fatal */ }

  return {
    newToday: todayPosts.length,
    topPosts,
    momentumTrend,
  }
}

// ─── Message formatting ───────────────────────────────────────────────────────

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles',
  })
}

function buildBriefBlocks(stats: BriefStats): { blocks: object[]; fallback: string } {
  const { newToday, topPosts, momentumTrend } = stats

  const dateStr = formatDate()

  // ── Momentum line ──────────────────────────────────────────────────────────
  const trendIcon = momentumTrend === 'up'   ? '📈'
                  : momentumTrend === 'down' ? '⚠️'
                  : momentumTrend === 'flat' ? '→'
                  : '🚀'
  const trendMsg  = momentumTrend === 'up'
    ? 'Engagement is building — keep it going'
    : momentumTrend === 'down'
    ? 'Engagement has dipped — good time to catch up'
    : momentumTrend === 'flat'
    ? 'Engagement is steady — keep showing up'
    : 'Your feed is live and ready'

  // ── Fallback plain text ────────────────────────────────────────────────────
  const fallback = newToday > 0
    ? `Scout: ${newToday} new ${newToday !== 1 ? 'conversations' : 'conversation'} in your feed today. Open Scout to engage.`
    : `Scout Daily Brief: No new posts today — your sources are still running.`

  // ── Blocks ─────────────────────────────────────────────────────────────────
  const blocks: object[] = [
    // Header
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `🔍 *Scout Daily Brief*  ·  ${dateStr}` },
    },
    { type: 'divider' },
  ]

  if (newToday > 0 && topPosts.length > 0) {
    // Intro line
    const noun = newToday !== 1 ? 'conversations' : 'conversation'
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${newToday} new ${noun}* in your feed today — here are a few waiting for you:`,
      },
    })

    // Post cards — one section per post with View Post button as accessory
    for (let i = 0; i < topPosts.length; i++) {
      const p = topPosts[i]
      blocks.push({ type: 'divider' })

      // Card body: bold name + score, subtitle on line 2, excerpt on line 3
      const nameLine     = `*${p.authorName}*  _(${p.score}/10)_`
      const subtitleLine = p.subtitle ? `_${p.subtitle}_` : null
      const excerptLine  = p.text     ? `"${p.text}"`     : null
      const cardText     = [nameLine, subtitleLine, excerptLine].filter(Boolean).join('\n')

      const card: any = {
        type: 'section',
        text: { type: 'mrkdwn', text: cardText },
      }

      // Only add the button if we have a valid post URL
      if (p.postUrl) {
        card.accessory = {
          type:      'button',
          text:      { type: 'plain_text', text: 'View Post →', emoji: false },
          url:       p.postUrl,
          action_id: `view_post_${i}`,
        }
      }

      blocks.push(card)
    }

    blocks.push({ type: 'divider' })
  } else {
    // No posts today
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `No new posts matched your filters today — your sources are still running`,
      },
    })
    blocks.push({ type: 'divider' })
  }

  // Momentum line + CTA
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `${trendIcon}  ${trendMsg}` },
  })
  blocks.push({ type: 'divider' })
  blocks.push({
    type: 'actions',
    elements: [{
      type:      'button',
      style:     'primary',
      text:      { type: 'plain_text', text: 'Open Scout →', emoji: true },
      url:       DASHBOARD_URL,
      action_id: 'open_scout',
    }],
  })

  return { blocks, fallback }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function sendDailyDigest(tenantId: string): Promise<DigestResult> {
  const slack = await getSlackConfig(tenantId)
  if (!slack)           return { sent: false, postCount: 0, tenantId, skipped: 'no_slack_config' }
  if (!slack.channelId) return { sent: false, postCount: 0, tenantId, skipped: 'no_channel_id'   }

  const stats = await getBriefStats(tenantId)
  const { blocks, fallback } = buildBriefBlocks(stats)
  const result = await postSlackMessage(slack.botToken, slack.channelId, fallback, blocks)

  return {
    sent:      result.ok,
    postCount: stats.newToday,
    tenantId,
    error:     result.ok ? undefined : result.error,
  }
}
