'use client'

/**
 * TrialBanner — A narrow, glowing purple strip at the very top of every page
 * that is ONLY visible during an active 7-day free trial. Disappears the
 * moment the user upgrades to any paid plan or the trial expires.
 */

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

function useDaysLeft(trialEndsAt: string | null): number | null {
  const [daysLeft, setDaysLeft] = useState<number | null>(null)

  useEffect(() => {
    if (!trialEndsAt) { setDaysLeft(null); return }

    function compute() {
      const msLeft = new Date(trialEndsAt!).getTime() - Date.now()
      setDaysLeft(msLeft <= 0 ? 0 : Math.ceil(msLeft / 86_400_000))
    }

    compute()
    // Recompute once per hour so the label stays fresh across long sessions
    const id = setInterval(compute, 60 * 60 * 1000)
    return () => clearInterval(id)
  }, [trialEndsAt])

  return daysLeft
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
  const daysLeft = useDaysLeft(trialEndsAt)

  if (daysLeft !== null && daysLeft <= 0) return null // trial expired — app shows its own gate

  const label =
    daysLeft === null  ? 'Free Trial'         :
    daysLeft === 1     ? '1 day left'         :
    daysLeft <= 7      ? `${daysLeft} days left` :
                        `${daysLeft} days left`

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
