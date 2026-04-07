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

interface BriefStats {
  newToday:      number
  topScore:      number
  totalActive:   number   // inbox count — excludes skipped/archived, matches dashboard Inbox tab
  momentumTrend: 'up' | 'flat' | 'down' | 'new'
}

async function getBriefStats(tenantId: string): Promise<BriefStats> {
  const since = todayMidnightUTC()

  // Query 1 — today's new posts (since midnight PDT, paginated)
  const todayParams = new URLSearchParams({
    filterByFormula: `AND(
      ${tenantFilter(tenantId)},
      {Relevance Score}>=${MIN_SCORE},
      IS_AFTER({Captured At}, '${since}'),
      {Engagement Status}!='archived'
    )`,
    'fields[]': 'Relevance Score',
    pageSize: '100',
  })

  // Query 2 — active pipeline only (excludes skipped + archived so counts match the dashboard inbox view)
  const pipelineParams = new URLSearchParams({
    filterByFormula: `AND(
      ${tenantFilter(tenantId)},
      {Engagement Status}!='archived',
      {Action}!='Skip'
    )`,
    'fields[]':  'Action',
    'fields[1]': 'Engagement Status',
    pageSize: '100',
  })

  const [todayPosts, pipelinePosts] = await Promise.all([
    fetchAllRecords('Captured Posts', todayParams),
    fetchAllRecords('Captured Posts', pipelineParams),
  ])

  let topScore = 0
  for (const r of todayPosts) {
    const score = r.fields?.['Relevance Score'] || 0
    if (score > topScore) topScore = score
  }

  // Count inbox posts only (skipped/archived excluded by pipelineParams query)
  // 'replied' and 'Engaged' are still in the result set so we can derive totalActive accurately
  let totalActive = 0
  for (const r of pipelinePosts) {
    const action = r.fields?.['Action'] || 'New'
    const status = r.fields?.['Engagement Status'] || ''
    // Only count posts sitting in the inbox — not yet engaged or replied
    if (status !== 'replied' && action !== 'Engaged') totalActive++
  }

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
    topScore,
    totalActive,
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
  const {
    newToday, topScore,
    totalActive, momentumTrend,
  } = stats

  // ── New posts line ─────────────────────────────────────────────────────────
  // Primary hook: did something new surface today?
  let newPostsText: string
  if (newToday > 0) {
    const noun = newToday !== 1 ? 'conversations' : 'conversation'
    const scoreHint = topScore >= 7 ? ` — top match scored *${topScore}/10*` : ''
    newPostsText = `*${newToday} new ${noun}* surfaced in your feed today${scoreHint}`
  } else {
    newPostsText = `No new posts matched your filters today — your sources are still running`
  }

  // ── Momentum / inbox line ──────────────────────────────────────────────────
  // Drive urgency without exposing confusing all-time metrics.
  // totalActive now excludes skipped posts, matching the dashboard Inbox count.
  const trendIcon = momentumTrend === 'up'   ? '📈'
                  : momentumTrend === 'down' ? '⚠️'
                  : momentumTrend === 'flat' ? '→'
                  : '🚀'

  const trendMsg = momentumTrend === 'up'
    ? 'Engagement is building — keep it going'
    : momentumTrend === 'down'
    ? 'Engagement has dipped — a good time to catch up'
    : momentumTrend === 'flat'
    ? 'Engagement is steady — keep showing up'
    : 'Your feed is live and ready'

  const inboxHint = totalActive > 0
    ? `  ·  *${totalActive}* ${totalActive !== 1 ? 'posts' : 'post'} waiting in your inbox`
    : ''

  const momentumLine = `${trendIcon}  ${trendMsg}${inboxHint}`

  // ── Fallback (plain-text for notifications / accessibility) ───────────────
  const fallback = newToday > 0
    ? `Scout: ${newToday} new ${newToday !== 1 ? 'conversations' : 'conversation'} today. ${totalActive > 0 ? `${totalActive} posts in your inbox.` : ''}`
    : `Scout: No new posts today. ${totalActive > 0 ? `${totalActive} posts in your inbox.` : 'All caught up.'}`

  // ── Blocks ─────────────────────────────────────────────────────────────────
  const blocks: object[] = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `🔍 *Scout Daily Brief*  ·  ${formatDate()}` },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: newPostsText },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: momentumLine },
    },
    { type: 'divider' },
    {
      type: 'actions',
      elements: [{
        type:      'button',
        style:     'primary',
        text:      { type: 'plain_text', text: 'Open Scout →', emoji: true },
        url:       DASHBOARD_URL,
        action_id: 'open_scout',
      }],
    },
  ]

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
