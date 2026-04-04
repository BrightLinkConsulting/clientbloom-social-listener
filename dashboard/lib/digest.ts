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

interface BriefStats {
  newToday:    number   // posts captured in last 26h scoring ≥5
  linkedin:    number   // breakdown by platform
  facebook:    number
  topScore:    number   // highest score among today's posts
  totalActive: number   // all-time unarchived, not yet replied
  totalEngaged: number  // all-time engaged
  totalReplied: number  // all-time replied
}

async function getBriefStats(tenantId: string): Promise<BriefStats> {
  const since = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString()

  // Query 1 — today's new posts
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

  // Query 2 — pipeline action counts (all-time, not archived)
  const pipelineParams = new URLSearchParams({
    filterByFormula: `AND(
      ${tenantFilter(tenantId)},
      {Engagement Status}!='archived'
    )`,
    'fields[]':  'Action',
    'fields[1]': 'Engagement Status',
    pageSize: '100',
  })

  const [todayResp, pipelineResp] = await Promise.all([
    fetch(`${AIRTABLE_BASE}/${SHARED_BASE}/Captured%20Posts?${todayParams}`, {
      headers: { Authorization: `Bearer ${PROV_TOKEN}` },
    }),
    fetch(`${AIRTABLE_BASE}/${SHARED_BASE}/Captured%20Posts?${pipelineParams}`, {
      headers: { Authorization: `Bearer ${PROV_TOKEN}` },
    }),
  ])

  const [todayData, pipelineData] = await Promise.all([
    todayResp.json(),
    pipelineResp.json(),
  ])

  const todayPosts = todayData.records || []
  let linkedin = 0, facebook = 0, topScore = 0
  for (const r of todayPosts) {
    const platform = (r.fields?.['Platform'] || '').toLowerCase()
    const score    = r.fields?.['Relevance Score'] || 0
    if (platform.includes('facebook')) facebook++
    else linkedin++
    if (score > topScore) topScore = score
  }

  let totalActive = 0, totalEngaged = 0, totalReplied = 0
  for (const r of pipelineData.records || []) {
    const action = r.fields?.['Action'] || 'New'
    const status = r.fields?.['Engagement Status'] || ''
    if (status === 'replied') {
      totalReplied++
    } else if (action === 'Engaged') {
      totalEngaged++
    } else {
      totalActive++
    }
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

  // Platform breakdown line — only show if we actually have posts
  const platformLine = newToday > 0
    ? `↳ ${linkedin} LinkedIn  ·  ${facebook} Facebook${topScore >= 7 ? `  ·  top score *${topScore}/10*` : ''}`
    : null

  // Pipeline line
  const pipelineTotal = totalActive + totalEngaged + totalReplied
  const pipelineLine = pipelineTotal > 0
    ? `*${pipelineTotal} leads* in your pipeline  ·  ${totalEngaged} engaged  ·  ${totalReplied} replied`
    : null

  const newLeadsText = newToday > 0
    ? `*${newToday} new lead${newToday !== 1 ? 's'  : ''}* added to your feed today`
    : `No new leads matched your filters today — your sources are still running`

  const fallback = newToday > 0
    ? `Scout: ${newToday} new leads today. ${pipelineTotal} in pipeline. Open Scout to review.`
    : `Scout: No new leads today. ${pipelineTotal} in pipeline.`

  const blocks: object[] = [
    // Header
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🔍 *Scout Daily Brief*  ·  ${formatDate()}`,
      },
    },
    { type: 'divider' },
    // Today's count
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [newLeadsText, platformLine].filter(Boolean).join('\n'),
      },
    },
  ]

  // Pipeline stats — only show if there's something to show
  if (pipelineLine) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: pipelineLine }],
    })
  }

  // CTA
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
