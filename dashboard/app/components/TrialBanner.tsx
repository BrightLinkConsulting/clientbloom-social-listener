'use client'

/**
 * TrialBanner — A narrow, glowing purple strip at the very top of every page
 * that is ONLY visible during an active 7-day free trial. Disappears the
 * moment the user upgrades to any paid plan or the trial expires.
 */

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

interface DaysLeftResult {
  daysLeft: number | null  // full calendar days remaining (Math.floor); 0 = expires today
  hoursLeft: number        // remaining hours after stripping full days (0–23)
  expired:  boolean        // true only when the trial timestamp has actually passed
}

function useDaysLeft(trialEndsAt: string | null): DaysLeftResult {
  const [result, setResult] = useState<DaysLeftResult>({ daysLeft: null, hoursLeft: 0, expired: false })

  useEffect(() => {
    if (!trialEndsAt) { setResult({ daysLeft: null, hoursLeft: 0, expired: false }); return }

    function compute() {
      const msLeft   = new Date(trialEndsAt!).getTime() - Date.now()
      const expired  = msLeft <= 0
      // Math.floor: if 6 days 22 hours remain, show "6d 22h left" not "7 days left".
      const daysLeft  = expired ? 0 : Math.floor(msLeft / 86_400_000)
      const hoursLeft = expired ? 0 : Math.floor((msLeft % 86_400_000) / 3_600_000)
      setResult({ daysLeft, hoursLeft, expired })
    }

    compute()
    // Recompute once per hour so the countdown stays fresh across long sessions
    const id = setInterval(compute, 60 * 60 * 1000)
    return () => clearInterval(id)
  }, [trialEndsAt])

  return result
}

export default function TrialBanner() {
  const { data: session, status } = useSession()

  if (status !== 'authenticated') return null

  const user        = session?.user as any
  const plan        = user?.plan        || ''
  const trialEndsAt = user?.trialEndsAt || null

  const isTrial = plan === 'Trial'
  if (!isTrial) return null

  return <TrialBannerInner trialEndsAt={trialEndsAt} />
}

/** Separate inner component so the hook always runs in the same call order */
function TrialBannerInner({ trialEndsAt }: { trialEndsAt: string | null }) {
  const { daysLeft, hoursLeft, expired } = useDaysLeft(trialEndsAt)

  // Hide only when the trial timestamp has genuinely passed, not on the last day
  // (daysLeft === 0 means < 24h remain — still show hours countdown)
  if (expired) return null

  const label =
    daysLeft === null ? 'Free Trial'                    :
    daysLeft === 0    ? `${hoursLeft}h left`            :
                       `${daysLeft}d ${hoursLeft}h left`

  return (
    <div
      aria-label="Free trial countdown"
      style={{
        boxShadow: '0 0 12px 2px rgba(139, 92, 246, 0.35), inset 0 -1px 0 rgba(139, 92, 246, 0.2)',
      }}
      className="
        sticky top-0 z-30 w-full
        bg-gradient-to-r from-violet-950/95 via-purple-900/95 to-violet-950/95
        border-b border-violet-700/40
        backdrop-blur-sm
        flex items-center justify-center gap-3
        px-4 py-1.5
        text-xs tracking-wide
      "
    >
      {/* Pulsing dot */}
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-60" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-violet-400" />
      </span>

      <span className="text-violet-200 font-medium">
        Free Trial
      </span>

      <span className="text-violet-500 select-none">·</span>

      <span className="text-violet-300/80">
        {label}
      </span>

      <Link
        href="/upgrade"
        className="
          ml-1 text-violet-300 font-semibold
          underline underline-offset-2 decoration-violet-500/50
          hover:text-white hover:decoration-white
          transition-colors duration-150
        "
      >
        Upgrade
      </Link>
    </div>
  )
}
