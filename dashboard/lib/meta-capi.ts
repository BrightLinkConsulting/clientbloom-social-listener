/**
 * Meta Conversions API (CAPI) helper — server-side counterpart to the
 * client-side Pixel in lib/meta-pixel.ts.
 *
 * Why CAPI exists:
 * Browser-based Pixel events get lost to ad blockers, iOS 14+ tracking
 * restrictions, and browser privacy settings — roughly 20-40% of events
 * never reach Meta. CAPI bypasses the browser entirely by POSTing events
 * server-to-server. When the same event fires via both Pixel and CAPI
 * with a matching event_id, Meta de-duplicates them and attribution
 * quality improves dramatically.
 *
 * This file is imported by app/api/meta/capi-event/route.ts, which is
 * the auth-gated API route that client components call to mirror their
 * fbq() events server-side.
 *
 * Environment:
 *   META_CAPI_ACCESS_TOKEN — long-lived system user token from Meta
 *     Events Manager → Settings → Conversions API → Generate access token.
 *     Stored in Vercel env vars. Not in the repo.
 */

import crypto from 'crypto'

const PIXEL_ID = '1499602704618597'
const API_VERSION = 'v19.0'
const ENDPOINT = `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events`

export interface CapiEventInput {
  /** Meta standard or custom event name, e.g. 'Lead', 'SubmitApplication', 'Purchase' */
  eventName: string
  /** UUID shared with the client Pixel fire for de-duplication */
  eventId: string
  /** Full page URL where the event originated — used by Meta for attribution */
  eventSourceUrl: string
  /** Raw email — will be SHA256-hashed before send (Meta requirement) */
  email?: string
  /** Client IP from x-forwarded-for — helps Meta match the event to ad clicks */
  clientIpAddress?: string
  /** Client user agent — same matching purpose */
  clientUserAgent?: string
  /** Facebook browser ID from the fbp cookie, if available */
  fbp?: string
  /** Facebook click ID from the fbc cookie, if available */
  fbc?: string
  /** Optional event-specific fields (content_name, value, currency, etc.) */
  customData?: Record<string, unknown>
  /** Optional test event code for Events Manager Test Events routing */
  testEventCode?: string
}

/**
 * POST a single event to Meta's Conversions API.
 *
 * Silently no-ops (with a warn) if META_CAPI_ACCESS_TOKEN is not set — so
 * the rest of the app keeps working in local/dev environments where the
 * token isn't configured. Logs any Meta API error to the server console;
 * never throws into the caller so one failed CAPI ping never breaks the
 * user-facing flow.
 */
export async function sendCapiEvent(input: CapiEventInput): Promise<void> {
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN
  if (!accessToken) {
    console.warn('[Meta CAPI] META_CAPI_ACCESS_TOKEN not set — skipping server-side event', input.eventName)
    return
  }

  const userData: Record<string, unknown> = {}
  if (input.email) {
    userData.em = [sha256Hex(input.email.trim().toLowerCase())]
  }
  if (input.clientIpAddress) userData.client_ip_address = input.clientIpAddress
  if (input.clientUserAgent) userData.client_user_agent = input.clientUserAgent
  if (input.fbp) userData.fbp = input.fbp
  if (input.fbc) userData.fbc = input.fbc

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: input.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: input.eventId,
        event_source_url: input.eventSourceUrl,
        action_source: 'website',
        user_data: userData,
        custom_data: input.customData || {},
      },
    ],
  }
  if (input.testEventCode) {
    payload.test_event_code = input.testEventCode
  }

  try {
    const res = await fetch(`${ENDPOINT}?access_token=${encodeURIComponent(accessToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const text = await res.text()
      console.error('[Meta CAPI] non-OK response', res.status, text)
    }
  } catch (err) {
    console.error('[Meta CAPI] fetch failed', err)
  }
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex')
}
