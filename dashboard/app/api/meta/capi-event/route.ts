/**
 * POST /api/meta/capi-event
 *
 * Auth-gated bridge from client-side Pixel events to Meta's Conversions
 * API. Browser components fire fbq() locally AND post to this route with
 * a matching event_id; this route mirrors the event server-side for
 * de-duplication. See lib/meta-capi.ts for the underlying helper and
 * docs/meta-pixel-tracking.md Section 9 for full architecture.
 *
 * Security:
 *   - Auth required (NextAuth session). Without auth, no events fire.
 *     Prevents anyone on the internet from manufacturing fake conversions
 *     against our Pixel.
 *   - Email comes from the server-side session, never from the request
 *     body. Client cannot spoof which user the event belongs to.
 *
 * Request body:
 *   {
 *     eventName: 'Lead' | 'SubmitApplication' | 'Purchase' | string,
 *     eventId: string,           // UUID matching the client fbq eventID
 *     customData?: object        // optional event-specific fields
 *   }
 *
 * Response: { ok: true } on success, { error } with 4xx/5xx on failure.
 * Failures are logged server-side but do not block the client; the
 * client Pixel event still fires regardless.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sendCapiEvent } from '@/lib/meta-capi'

export async function POST(req: NextRequest) {
  // Auth gate — only signed-in users can fire CAPI events
  const session = (await getServerSession(authOptions as any)) as any
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const { eventName, eventId, customData } = body || {}
  if (!eventName || typeof eventName !== 'string') {
    return NextResponse.json({ error: 'eventName_required' }, { status: 400 })
  }
  if (!eventId || typeof eventId !== 'string') {
    return NextResponse.json({ error: 'eventId_required' }, { status: 400 })
  }

  // Headers for matching quality
  const eventSourceUrl = req.headers.get('referer') || ''
  const clientUserAgent = req.headers.get('user-agent') || undefined

  // Vercel forwards real client IP via x-forwarded-for (first entry)
  const xff = req.headers.get('x-forwarded-for') || ''
  const clientIpAddress = xff.split(',')[0]?.trim() || undefined

  // Facebook click/browser cookies for attribution accuracy when present
  const cookieHeader = req.headers.get('cookie') || ''
  const fbp = parseCookie(cookieHeader, '_fbp')
  const fbc = parseCookie(cookieHeader, '_fbc')

  await sendCapiEvent({
    eventName,
    eventId,
    eventSourceUrl,
    email: session.user.email,
    clientIpAddress,
    clientUserAgent,
    fbp,
    fbc,
    customData: customData && typeof customData === 'object' ? customData : undefined,
  })

  return NextResponse.json({ ok: true })
}

function parseCookie(header: string, name: string): string | undefined {
  const m = header.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return m ? decodeURIComponent(m[1]) : undefined
}
