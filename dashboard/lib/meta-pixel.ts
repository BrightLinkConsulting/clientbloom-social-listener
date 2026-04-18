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
 * Fire a Meta standard event (SubmitApplication, CompleteRegistration,
 * Purchase, Lead, etc). See https://developers.facebook.com/docs/meta-pixel/reference
 */
export function trackStandardEvent(eventName: string, params?: EventParams) {
  if (typeof window === 'undefined') return
  if (!window.fbq) return
  if (params) {
    window.fbq('track', eventName, params)
  } else {
    window.fbq('track', eventName)
  }
}

/**
 * Fire a Meta custom event. Use this for events outside Meta's standard
 * taxonomy. Custom Conversions in Ads Manager can target these by name.
 */
export function trackCustomEvent(eventName: string, params?: EventParams) {
  if (typeof window === 'undefined') return
  if (!window.fbq) return
  if (params) {
    window.fbq('trackCustom', eventName, params)
  } else {
    window.fbq('trackCustom', eventName)
  }
}
