/**
 * lib/digest.ts — Daily digest generator for Scout
 *
 * Fetches top posts from the last 26 hours for a tenant, formats them
 * as a rich Slack Block Kit message, and sends via the tenant's bot token.
 * No extra AI call needed — Score Reason + Comment Approach are already
 * stored on each post from the original scoring step.
 */

import { SHARED_BASE, PROV_TOKEN, tenantFilter } from '@/lib/airtable'
import { postSlackMessage } from '@/lib/slack'

const AIRTABLE_BASE = 'https://api.airtable.com/v0'
const MIN_DIGEST_SCORE = 6   // only include posts scoring 6+ in the digest
const MAX_DIGEST_POSTS = 5   // max posts shown in a single digest
const DASHBOARD_URL    = process.env.NEXT_PUBLIC_BASE_URL || 'https://cb-dashboard-xi.vercel.app'

export interface DigestResult {
  sent:       boolean
  postCount:  number
  tenantId:   string
  error?:     string
  skipped?:   string   // reason digest was not sent (no posts, no slack config, etc.)
}

// ─── Airtable helpers ────────────────────────────────────────────────────────

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
  if (!rec || !rec['Slack Bot Token']) return null
  return {
    botToken:    rec['Slack Bot Token'],
    channelId:   rec['Slack Channel ID']   || '',
    channelName: rec['Slack Channel Name'] || '',
  }
}

async function getTopPosts(tenantId: string): Promise<any[]> {
  // Last 26 hours — gives a comfortable buffer around the 24h scan cycle
  const since = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString()

  const formula = `AND(
    ${tenantFilter(tenantId)},
    {Relevance Score}>=${MIN_DIGEST_SCORE},
    IS_AFTER({Captured At}, '${since}'),
    {Engagement Status}!='archived'
  )`

  const params = new URLSearchParams({
    filterByFormula:      formula,
    'sort[0][field]':     'Relevance Score',
    'sort[0][direction]': 'desc',
    'sort[1][field]':     'Captured At',
    'sort[1][direction]': 'desc',
    pageSize:             String(MAX_DIGEST_POSTS),
    'fields[]':   'Post Text',
    'fields[1]':  'Author Name',
    'fields[2]':  'Platform',
    'fields[3]':  'Relevance Score',
    'fields[4]':  'Score Reason',
    'fields[5]':  'Comment Approach',
    'fields[6]':  'Post URL',
    'fields[7]':  'Group Name',
    'fields[8]':  'Captured At',
  })

  const r = await fetch(`${AIRTABLE_BASE}/${SHARED_BASE}/Captured%20Posts?${params}`, {
    headers: { Authorization: `Bearer ${PROV_TOKEN}` },
  })
  const data = await r.json()
  return data.records || []
}

// ─── Message formatting ───────────────────────────────────────────────────────

function scoreEmoji(score: number): string {
  if (score >= 9) return '🔥'
  if (score >= 7) return '⚡'
  return '✅'
}

function platformEmoji(platform: string): string {
  return platform?.toLowerCase().includes('facebook') ? '👥' : '💼'
}

function truncate(text: string, max: number): string {
  if (!text) return ''
  const clean = text.replace(/\n+/g, ' ').trim()
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles'
  })
}

function buildSlackBlocks(posts: any[]): object[] {
  const blocks: object[] = []

  // ── Header ──
  blocks.push({
    type: 'header',
    text: { type: 'plain_text', text: `🔍 Scout Daily Digest`, emoji: true },
  })
  blocks.push({
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text: `*${formatDate()}*  ·  ${posts.length} post${posts.length !== 1 ? 's' : ''} matched your filters`,
    }],
  })
  blocks.push({ type: 'divider' })

  // ── Posts ──
  for (const rec of posts) {
    const f            = rec.fields || {}
    const score        = f['Relevance Score'] || 0
    const platform     = f['Platform']        || 'LinkedIn'
    const author       = f['Author Name']     || 'Unknown'
    const text         = f['Post Text']       || ''
    const postUrl      = f['Post URL']        || ''
    const groupName    = f['Group Name']      || ''
    const comment      = f['Comment Approach']|| ''
    const reason       = f['Score Reason']    || ''

    const sourceLabel = groupName ? `${platformEmoji(platform)} ${groupName}` : `${platformEmoji(platform)} ${platform}`

    // Post card
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          `${scoreEmoji(score)} *Score ${score}/10*  ·  ${sourceLabel}  ·  ${author}`,
          `_"${truncate(text, 280)}"_`,
        ].join('\n'),
      },
      ...(postUrl ? {
        accessory: {
          type: 'button',
          text: { type: 'plain_text', text: 'View post', emoji: true },
          url:  postUrl,
          action_id: `view_post_${rec.id}`,
        },
      } : {}),
    })

    // Comment angle
    if (comment) {
      blocks.push({
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: `💬 *Comment angle:* ${truncate(comment, 200)}`,
        }],
      })
    } else if (reason) {
      blocks.push({
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: `💡 *Why it scored high:* ${truncate(reason, 200)}`,
        }],
      })
    }

    blocks.push({ type: 'divider' })
  }

  // ── Footer ──
  blocks.push({
    type: 'actions',
    elements: [{
      type: 'button',
      text: { type: 'plain_text', text: '📥 Open Scout Dashboard', emoji: true },
      url:  DASHBOARD_URL,
      style: 'primary',
      action_id: 'open_dashboard',
    }],
  })
  blocks.push({
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text: `Scout by ClientBloom  ·  Showing top ${posts.length} post${posts.length !== 1 ? 's' : ''} scored ${MIN_DIGEST_SCORE}+ from the last 24 hours`,
    }],
  })

  return blocks
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function sendDailyDigest(tenantId: string): Promise<DigestResult> {
  // 1. Get Slack config
  const slack = await getSlackConfig(tenantId)
  if (!slack) {
    return { sent: false, postCount: 0, tenantId, skipped: 'no_slack_config' }
  }
  if (!slack.channelId) {
    return { sent: false, postCount: 0, tenantId, skipped: 'no_channel_id' }
  }

  // 2. Fetch top posts
  const posts = await getTopPosts(tenantId)
  if (posts.length === 0) {
    // Send a brief "quiet day" notice so the digest stays habitual
    const quietResult = await postSlackMessage(
      slack.botToken,
      slack.channelId,
      '🔍 Scout Daily Digest — No new posts matched your filters today.',
      [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*🔍 Scout Daily Digest — ${formatDate()}*\n\nNo posts scored ${MIN_DIGEST_SCORE}+ from the last 24 hours. Your sources are still running — check back after the next scan.`,
          },
        },
        {
          type: 'actions',
          elements: [{
            type: 'button',
            text: { type: 'plain_text', text: '📥 Open Scout Dashboard', emoji: true },
            url:  DASHBOARD_URL,
            action_id: 'open_dashboard_quiet',
          }],
        },
      ]
    )
    return {
      sent:      quietResult.ok,
      postCount: 0,
      tenantId,
      error:     quietResult.ok ? undefined : quietResult.error,
      skipped:   quietResult.ok ? 'sent_quiet_notice' : undefined,
    }
  }

  // 3. Build and send the full digest
  const fallbackText = `Scout Daily Digest — ${posts.length} post${posts.length !== 1 ? 's' : ''} matched your filters today. View them in the Scout dashboard.`
  const blocks  = buildSlackBlocks(posts)
  const result  = await postSlackMessage(slack.botToken, slack.channelId, fallbackText, blocks)

  return {
    sent:      result.ok,
    postCount: posts.length,
    tenantId,
    error:     result.ok ? undefined : result.error,
  }
}
