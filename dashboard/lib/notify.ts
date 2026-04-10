/**
 * lib/notify.ts
 *
 * Platform alert helpers. Sends via Resend (email) + Slack webhook.
 *
 * ── sendScanAlert ─────────────────────────────────────────────────────────────
 * Called by the scan worker when a scan errors out or returns 0 raw posts.
 * Fires an email to ADMIN_EMAIL + optionally posts to Slack.
 *
 * ── sendMissedScanAlert ───────────────────────────────────────────────────────
 * Called by the watchdog when one or more tenants have a stale scan.
 * This fires even when the scan pipeline itself never ran — catching the
 * case where Vercel's cron scheduler silently skipped an invocation.
 *
 * ── sendServiceFlagEmail ──────────────────────────────────────────────────────
 * Called by the service-check cron for each tenant with new actionable flags.
 * Sends a customer-facing email via Resend to the tenant's email address.
 * Uses templates from lib/emails.ts. Subject + content are flag-specific.
 * 24h dedup + per-code dedup prevent spam — the cron manages state tracking.
 *
 * ── sendCriticalFlagSlackAlert ────────────────────────────────────────────────
 * Called by the service-check cron once per run when any tenant has a new
 * critical flag. Batches all critical alerts into a single Slack message so
 * Mike gets one digest per cron run, not one Slack ping per tenant.
 *
 * ── Slack ─────────────────────────────────────────────────────────────────────
 * Set SLACK_WEBHOOK_URL in Vercel env vars to enable Slack notifications.
 * Create an Incoming Webhook at https://api.slack.com/apps → Incoming Webhooks.
 * If the env var is not set, Slack notifications are silently skipped.
 *
 * NOTE: "0 qualifying posts saved" is NOT alerted — good keyword filtering
 * is expected to discard most raw posts. We only alert when the pipeline
 * itself produces nothing (broken actor / misconfigured source) or when
 * the watchdog detects a scan that never ran at all.
 */

const RESEND_KEY    = process.env.RESEND_API_KEY       || ''
const ADMIN_EMAIL   = process.env.ADMIN_EMAIL           || 'twp1996@gmail.com'
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL     || ''
// Use NEXT_PUBLIC_BASE_URL when set; fall back to the production domain — never the old staging URL
const BASE_URL      = (process.env.NEXT_PUBLIC_BASE_URL || 'https://scout.clientbloom.ai').replace(/\/$/, '')
const FROM          = 'Scout Alerts <info@clientbloom.ai>'

// ── Shared Slack helper ───────────────────────────────────────────────────────
async function postToSlack(text: string): Promise<void> {
  if (!SLACK_WEBHOOK) return
  try {
    const res = await fetch(SLACK_WEBHOOK, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text }),
    })
    if (!res.ok) console.error(`[notify] Slack error ${res.status}: ${await res.text().catch(() => '')}`)
  } catch (e: any) {
    console.error('[notify] Failed to post to Slack:', e.message)
  }
}

// ── Shared Resend email helper ────────────────────────────────────────────────
async function sendEmail(subject: string, html: string): Promise<void> {
  if (!RESEND_KEY) {
    console.warn('[notify] RESEND_API_KEY not set — skipping email alert')
    return
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ from: FROM, to: [ADMIN_EMAIL], subject, html }),
    })
    if (!res.ok) {
      const body = await res.text()
      console.error(`[notify] Resend error ${res.status}: ${body.slice(0, 200)}`)
    } else {
      console.log(`[notify] Alert sent to ${ADMIN_EMAIL} — "${subject}"`)
    }
  } catch (e: any) {
    console.error('[notify] Failed to send alert email:', e.message)
  }
}

// ── sendScanAlert ─────────────────────────────────────────────────────────────

export interface ScanAlertPayload {
  tenantId:   string
  email:      string
  error?:     string
  scanned:    number
  scanSource: string
  elapsed:    string
}

export async function sendScanAlert(payload: ScanAlertPayload): Promise<void> {
  const { tenantId, email, error, scanned, scanSource, elapsed } = payload
  const timestamp = new Date().toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  const isError  = !!error
  const subject  = isError
    ? `[Scout Alert] Scan error — ${email}`
    : `[Scout Alert] Scan returned 0 posts — ${email}`
  const headline = isError
    ? 'Scan failed with an error'
    : 'Scan completed but returned 0 raw posts'
  const color    = isError ? '#ef4444' : '#f59e0b'
  const guidance = isError
    ? 'This usually means an Apify actor failed, a token expired, or Airtable is unreachable. Check the Vercel function logs for the full stack trace.'
    : 'No posts came back from any source. This can mean an actor silently returned empty results or LinkedIn sources are misconfigured. Check your ICP profiles and keyword terms in Scout settings.'

  const html = `
    <div style="font-family:sans-serif;max-width:540px;margin:0 auto;color:#1a1a1a">
      <div style="background:${color};padding:20px 28px;border-radius:12px 12px 0 0">
        <p style="color:#fff;font-size:16px;font-weight:700;margin:0">Scout Scan Alert</p>
      </div>
      <div style="background:#f9f9f9;padding:28px 32px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none">
        <h2 style="margin:0 0 6px;font-size:18px">${headline}</h2>
        <p style="color:#777;margin:0 0 24px;font-size:13px">${timestamp} &nbsp;·&nbsp; ${email}</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px">
          <tr style="border-bottom:1px solid #eee">
            <td style="padding:9px 0;color:#888;width:130px">Tenant ID</td>
            <td style="padding:9px 0;font-weight:500">${tenantId}</td>
          </tr>
          <tr style="border-bottom:1px solid #eee">
            <td style="padding:9px 0;color:#888">Scan source</td>
            <td style="padding:9px 0;font-weight:500">${scanSource || 'none configured'}</td>
          </tr>
          <tr style="border-bottom:1px solid #eee">
            <td style="padding:9px 0;color:#888">Raw posts</td>
            <td style="padding:9px 0;font-weight:500">${scanned} returned from Apify</td>
          </tr>
          <tr style="${error ? 'border-bottom:1px solid #eee;' : ''}">
            <td style="padding:9px 0;color:#888">Duration</td>
            <td style="padding:9px 0;font-weight:500">${elapsed}</td>
          </tr>
          ${error ? `
          <tr>
            <td style="padding:9px 0;color:#888;vertical-align:top">Error</td>
            <td style="padding:9px 0;color:#ef4444;font-family:monospace;font-size:12px;word-break:break-all;line-height:1.5">${error}</td>
          </tr>` : ''}
        </table>
        <p style="font-size:13px;color:#555;margin:0 0 20px;line-height:1.6">${guidance}</p>
        <a href="${BASE_URL}"
           style="display:inline-block;background:#4F6BFF;color:#fff;font-weight:600;padding:10px 22px;border-radius:8px;text-decoration:none;font-size:14px">
          Open Scout Dashboard →
        </a>
        <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0 16px" />
        <p style="font-size:12px;color:#aaa;margin:0">
          This alert fires when a scheduled scan returns 0 raw posts or encounters an error.
          It does not fire when posts are scanned but scored below threshold — that is normal filtering behavior.
        </p>
      </div>
    </div>
  `

  const slackText = isError
    ? `:red_circle: *Scout scan error* — \`${email}\`\n>${error?.slice(0, 200)}`
    : `:warning: *Scout scan returned 0 posts* — \`${email}\`\nSource: ${scanSource || 'none'}`

  await Promise.all([
    sendEmail(subject, html),
    postToSlack(slackText),
  ])
}

// ── sendMissedScanAlert ───────────────────────────────────────────────────────

export interface MissedScanPayload {
  staleTenants: { tenantId: string; lastScanAt: string | null; status: string }[]
  triggered:    boolean
  detectedAt:   string
}

export async function sendMissedScanAlert(payload: MissedScanPayload): Promise<void> {
  const { staleTenants, triggered, detectedAt } = payload

  const timestamp = new Date(detectedAt).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  const count   = staleTenants.length
  const subject = `[Scout Watchdog] Missed scan detected — ${count} tenant${count !== 1 ? 's' : ''} overdue`

  const recoveryMsg = triggered
    ? 'The watchdog automatically triggered a recovery scan. Posts should appear within a few minutes.'
    : 'The watchdog attempted to trigger a recovery scan but could not reach the scan endpoint. Manual intervention may be required.'

  const tenantRows = staleTenants
    .map(t => {
      const lastScan = t.lastScanAt
        ? new Date(t.lastScanAt).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'short', timeStyle: 'short' })
        : 'Never'
      return `<tr style="border-bottom:1px solid #eee">
        <td style="padding:8px 0;font-family:monospace;font-size:12px">${t.tenantId}</td>
        <td style="padding:8px 0;font-size:12px;color:#888">${lastScan}</td>
        <td style="padding:8px 0;font-size:12px;color:#888">${t.status}</td>
      </tr>`
    })
    .join('')

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
      <div style="background:#f59e0b;padding:20px 28px;border-radius:12px 12px 0 0">
        <p style="color:#fff;font-size:16px;font-weight:700;margin:0">Scout Scan Watchdog</p>
      </div>
      <div style="background:#f9f9f9;padding:28px 32px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none">
        <h2 style="margin:0 0 6px;font-size:18px">Missed scan detected</h2>
        <p style="color:#777;margin:0 0 20px;font-size:13px">Detected at ${timestamp}</p>
        <p style="font-size:14px;color:#333;margin:0 0 20px;line-height:1.6">
          ${count} tenant${count !== 1 ? 's have' : ' has'} not been scanned in over 14 hours,
          meaning at least one scheduled scan window was missed. This is typically caused by a
          Vercel cron scheduler issue.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px">
          <thead>
            <tr style="border-bottom:2px solid #e5e5e5">
              <th style="padding:8px 0;text-align:left;color:#888;font-weight:500">Tenant ID</th>
              <th style="padding:8px 0;text-align:left;color:#888;font-weight:500">Last Scan (PT)</th>
              <th style="padding:8px 0;text-align:left;color:#888;font-weight:500">Status</th>
            </tr>
          </thead>
          <tbody>${tenantRows}</tbody>
        </table>
        <div style="background:${triggered ? '#f0fdf4' : '#fef2f2'};border:1px solid ${triggered ? '#bbf7d0' : '#fecaca'};border-radius:8px;padding:14px 18px;margin-bottom:20px">
          <p style="margin:0;font-size:13px;color:${triggered ? '#166534' : '#991b1b'};line-height:1.6">
            ${triggered ? '✅' : '❌'} ${recoveryMsg}
          </p>
        </div>
        <a href="${BASE_URL}"
           style="display:inline-block;background:#4F6BFF;color:#fff;font-weight:600;padding:10px 22px;border-radius:8px;text-decoration:none;font-size:14px">
          Open Scout Dashboard →
        </a>
        <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0 16px" />
        <p style="font-size:12px;color:#aaa;margin:0">
          This alert is from the hourly scan watchdog (/api/cron/scan-watchdog).
          Check Vercel function logs if the issue persists.
        </p>
      </div>
    </div>
  `

  const slackText = triggered
    ? `:warning: *Scout Watchdog: Missed scan — auto-recovered* | ${count} tenant${count !== 1 ? 's' : ''} overdue. Recovery scan triggered. _${timestamp}_`
    : `:rotating_light: *Scout Watchdog: Missed scan — RECOVERY FAILED* | ${count} tenant${count !== 1 ? 's' : ''} overdue. Could not trigger recovery. Manual check needed. _${timestamp}_`

  await Promise.all([
    sendEmail(subject, html),
    postToSlack(slackText),
  ])
}

// ── sendServiceFlagEmail ──────────────────────────────────────────────────────

import { buildServiceFlagEmail, type ServiceFlagEmailFlag } from '@/lib/emails'

const CUSTOMER_FROM = 'Scout <info@clientbloom.ai>'

export interface ServiceFlagEmailPayload {
  to:          string                  // tenant email address
  flags:       ServiceFlagEmailFlag[]  // new flags to notify about
}

/**
 * Send a customer-facing service flag notification via Resend.
 *
 * The caller (service-check cron) is responsible for 24h dedup + per-code
 * dedup. This function only builds the email and sends it.
 *
 * Returns true if the email was sent successfully, false on any error.
 */
export async function sendServiceFlagEmail(payload: ServiceFlagEmailPayload): Promise<boolean> {
  if (!RESEND_KEY) {
    console.warn('[notify] RESEND_API_KEY not set — skipping service flag email')
    return false
  }
  if (!payload.to || !payload.flags.length) return false

  const appUrl = BASE_URL
  const { subject, html } = buildServiceFlagEmail({ appUrl, flags: payload.flags, flagCount: payload.flags.length })

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ from: CUSTOMER_FROM, to: [payload.to], subject, html }),
    })
    if (!res.ok) {
      const body = await res.text()
      console.error(`[notify] Resend service flag email error ${res.status}: ${body.slice(0, 200)}`)
      return false
    }
    console.log(`[notify] Service flag email sent to ${payload.to} — "${subject}"`)
    return true
  } catch (e: any) {
    console.error('[notify] Failed to send service flag email:', e.message)
    return false
  }
}

// ── sendCriticalFlagSlackAlert ────────────────────────────────────────────────

export interface CriticalFlagAlert {
  email:     string
  flagCodes: string[]
  messages:  string[]
}

/**
 * Send a single batched Slack alert for all new critical flags found in one
 * service-check cron run. Only fires if SLACK_WEBHOOK_URL is set.
 *
 * Batching: the cron accumulates critical alerts during its tenant loop, then
 * calls this once at the end. One Slack message per cron run = no alert spam.
 */
export async function sendCriticalFlagSlackAlert(alerts: CriticalFlagAlert[], adminUrl: string): Promise<void> {
  if (!alerts.length) return

  const timestamp = new Date().toLocaleString('en-US', {
    timeZone:  'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  const lines = alerts.map(a => {
    const codes = a.flagCodes.map(c => `\`${c}\``).join(', ')
    const msg   = a.messages[0]?.slice(0, 100) || ''
    return `• *${a.email}* — ${codes}\n  _${msg}_`
  })

  const header = alerts.length === 1
    ? `:rotating_light: *Scout Service Alert* — new critical flag on \`${alerts[0].email}\``
    : `:rotating_light: *Scout Service Alert* — ${alerts.length} accounts have new critical flags`

  const text = `${header}\n${lines.join('\n')}\n_${timestamp}_ | <${adminUrl}|View Admin Panel>`

  await postToSlack(text)
}
