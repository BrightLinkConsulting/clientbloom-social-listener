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
const DASHBOARD_URL  = process.env.NEXT_PUBLIC_BASE_URL || 'https://cb-dashboard-xi.vercel.app'

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
  newToday:     number
  linkedin:     number
  facebook:     number
  topScore:     number
  totalActive:  number
  totalEngaged: number
  totalReplied: number
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
    'fields[]':  'Platform',
    'fields[1]': 'Relevance Score',
    pageSize: '100',
  })

  // Query 2 — full pipeline (paginated — critical for accurate totals)
  const pipelineParams = new URLSearchParams({
    filterByFormula: `AND(
      ${tenantFilter(tenantId)},
      {Engagement Status}!='archived'
    )`,
    'fields[]':  'Action',
    'fields[1]': 'Engagement Status',
    pageSize: '100',
  })

  const [todayPosts, pipelinePosts] = await Promise.all([
    fetchAllRecords('Captured Posts', todayParams),
    fetchAllRecords('Captured Posts', pipelineParams),
  ])

  let linkedin = 0, facebook = 0, topScore = 0
  for (const r of todayPosts) {
    const platform = (r.fields?.['Platform'] || '').toLowerCase()
    const score    = r.fields?.['Relevance Score'] || 0
    if (platform.includes('facebook')) facebook++
    else linkedin++
    if (score > topScore) topScore = score
  }

  let totalActive = 0, totalEngaged = 0, totalReplied = 0
  for (const r of pipelinePosts) {
    const action = r.fields?.['Action'] || 'New'
    const status = r.fields?.['Engagement Status'] || ''
    if (status === 'replied')   totalReplied++
    else if (action === 'Engaged') totalEngaged++
    else totalActive++
  }

  return {
    newToday: todayPosts.length,
    linkedin,
    facebook,
    topScore,
    totalActive,
    totalEngaged,
    totalReplied,
  }
}

// ─── Message formatting ───────────────────────────────────────────────────────

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles',
  })
}

function buildBriefBlocks(stats: BriefStats): { blocks: object[]; fallback: string } {
  const { newToday, linkedin, facebook, topScore, totalActive, totalEngaged, totalReplied } = stats

  const platformLine = newToday > 0
    ? `↳ ${linkedin} LinkedIn  ·  ${facebook} Facebook${topScore >= 7 ? `  ·  top score *${topScore}/10*` : ''}`
    : null

  const pipelineTotal = totalActive + totalEngaged + totalReplied
  const pipelineLine  = pipelineTotal > 0
    ? `*${pipelineTotal} leads* in your pipeline  ·  ${totalEngaged} engaged  ·  ${totalReplied} replied`
    : null

  const newLeadsText = newToday > 0
    ? `*${newToday} new lead${newToday !== 1 ? 's' : ''}* added to your feed today`
    : `No new leads matched your filters today — your sources are still running`

  const fallback = newToday > 0
    ? `Scout: ${newToday} new leads today. ${pipelineTotal} in pipeline. Open Scout to review.`
    : `Scout: No new leads today. ${pipelineTotal} in pipeline.`

  const blocks: object[] = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `🔍 *Scout Daily Brief*  ·  ${formatDate()}` },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: [newLeadsText, platformLine].filter(Boolean).join('\n') },
    },
  ]

  if (pipelineLine) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: pipelineLine }],
    })
  }

  blocks.push({ type: 'divider' })
  blocks.push({
    type: 'actions',
    elements: [{
      type:      'button',
      style:     'primary',
      text:      { type: 'plain_text', text: 'Review in Scout →', emoji: true },
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
