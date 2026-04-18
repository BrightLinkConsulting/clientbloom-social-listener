'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
  }
}

/**
 * Meta Pixel route-change tracker.
 *
 * The Pixel base code in app/layout.tsx fires a single PageView when the
 * Pixel library first loads. Next.js App Router uses client-side
 * navigation for subsequent transitions, which does NOT re-execute the
 * base code. Without this component, only the initial landing page
 * registers a PageView — downstream routes like /onboarding, /welcome,
 * /upgrade, etc. register nothing in Meta.
 *
 * We skip the very first render so we don't double-fire the initial
 * PageView that the base code already sent. Subsequent pathname changes
 * each fire one PageView, which is exactly what URL-based Custom
 * Conversions in Meta Ads Manager key off.
 */
export function MetaPixelTracker() {
  const pathname = usePathname()
  const hasMountedRef = useRef(false)

  useEffect(() => {
    if (!hasMountedRef.current) {
      // Initial render — base code already fired PageView. Skip.
      hasMountedRef.current = true
      return
    }
    if (typeof window === 'undefined' || !window.fbq) return
    window.fbq('track', 'PageView')
  }, [pathname])

  return null
}
