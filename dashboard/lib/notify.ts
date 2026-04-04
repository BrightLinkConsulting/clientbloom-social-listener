/**
 * lib/notify.ts
 *
 * Platform alert helpers. Currently sends via Resend.
 *
 * sendScanAlert — called by the cron when a scan:
 *   (a) errors out, OR
 *   (b) returns 0 raw posts from all sources (actors returned nothing)
 *
 * NOTE: "0 qualifying posts saved" is NOT alerted — good keyword filtering
 * is expected to discard most raw posts. We only alert when the pipeline
 * itself produces nothing, which signals a broken actor or misconfigured source.
 */

const RESEND_KEY  = process.env.RESEND_API_KEY    || ''
const ADMIN_EMAIL = process.env.ADMIN_EMAIL        || 'twp1996@gmail.com'
const BASE_URL    = (process.env.NEXT_PUBLIC_BASE_URL || 'https://cb-dashboard-xi.vercel.app').replace(/\/$/, '')
const FROM        = 'Scout Alerts <noreply@clientbloom.ai>'

export interface ScanAlertPayload {
  tenantId:   string
  email:      string
  error?:     string
  scanned:    number
  scanSource: string
  elapsed:    string
}

export async function sendScanAlert(payload: ScanAlertPayload): Promise<void> {
  if (!RESEND_KEY) {
    console.warn('[notify] RESEND_API_KEY not set — skipping scan alert')
    return
  }

  const { tenantId, email, error, scanned, scanSource, elapsed } = payload
  const timestamp = new Date().toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  const isError   = !!error
  const subject   = isError
    ? `[Scout Alert] Scan error — ${email}`
    : `[Scout Alert] Scan returned 0 posts — ${email}`
  const headline  = isError
    ? 'Scan failed with an error'
    : 'Scan completed but returned 0 raw posts'
  const color     = isError ? '#ef4444' : '#f59e0b'
  const guidance  = isError
    ? 'This usually means an Apify actor failed, a token expired, or Airtable is unreachable. Check the Vercel function logs for the full stack trace.'
    : 'No posts came back from any source. This can mean an actor silently returned empty results, Facebook groups have no recent posts, or LinkedIn sources are misconfigured. Check your Sources and LinkedIn ICPs in Scout settings.'

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
