/**
 * Meta Pixel helper — thin wrapper around the global fbq() installed
 * by the base code in app/layout.tsx.
 *
 * Safe to call from any client component. Every helper no-ops when the
 * Pixel hasn't loaded yet (SSR, ad blockers, pre-install state) so
 * callers never have to guard.
 *
 * Pixel ID: 1499602704618597 (Scout / ClientBloom Meta dataset)
 */

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
  }
}

export const META_PIXEL_ID = '1499602704618597'

type EventParams = Record<string, unknown>

/**
 * Attempt to fire a pixel call now. Retry with a short polling loop if
 * window.fbq isn't yet defined — covers the race between React hydration
 * and the Pixel base script initialization. Gives up after ~3 seconds
 * so we never leak intervals.
 */
function fireWithRetry(callArgs: unknown[]) {
  if (typeof window === 'undefined') return

  const attempt = () => {
    if (!window.fbq) return false
    window.fbq(...callArgs)
    return true
  }

  if (attempt()) return

  let attempts = 0
  const interval = setInterval(() => {
    attempts++
    if (attempt() || attempts >= 30) {
      clearInterval(interval)
    }
  }, 100)
}

/**
 * Fire a Meta standard event (SubmitApplication, CompleteRegistration,
 * Purchase, Lead, etc). See https://developers.facebook.com/docs/meta-pixel/reference
 *
 * Pass `eventId` to de-duplicate with a matching server-side CAPI event.
 * Meta recommends a UUID shared between the browser fbq call and the
 * server-to-server CAPI POST for the same user action.
 */
export function trackStandardEvent(eventName: string, params?: EventParams, eventId?: string) {
  const args: unknown[] = params
    ? ['track', eventName, params]
    : ['track', eventName]
  if (eventId) args.push({ eventID: eventId })
  fireWithRetry(args)
}

/**
 * Fire a Meta custom event. Use this for events outside Meta's standard
 * taxonomy. Custom Conversions in Ads Manager can target these by name.
 */
export function trackCustomEvent(eventName: string, params?: EventParams, eventId?: string) {
  const args: unknown[] = params
    ? ['trackCustom', eventName, params]
    : ['trackCustom', eventName]
  if (eventId) args.push({ eventID: eventId })
  fireWithRetry(args)
}
