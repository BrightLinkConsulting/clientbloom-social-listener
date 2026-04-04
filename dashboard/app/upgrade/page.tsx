'use client'

import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function UpgradePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [postCount, setPostCount] = useState<number | null>(null)
  const [checking, setChecking] = useState(true)

  const user       = session?.user as any
  const plan       = user?.plan || ''
  const isPaidPlan = plan === 'Scout $79' || plan === 'Owner'
  const trialEndsAt = user?.trialEndsAt || null
  const trialExpired = !!trialEndsAt && new Date() > new Date(trialEndsAt)
  const daysLeft   = trialEndsAt
    ? Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000)
    : null

  // Redirect paid users back to the feed — they don't belong here
  useEffect(() => {
    if (status === 'loading') return
    if (status === 'unauthenticated') { router.replace('/sign-in'); return }
    if (isPaidPlan) { router.replace('/'); return }
    setChecking(false)
  }, [status, isPaidPlan, router])

  // Fetch post count for FOMO messaging
  useEffect(() => {
    if (checking) return
    fetch('/api/posts?action=all&limit=1')
      .then(r => r.json())
      .then(d => {
        // Sum across all action buckets for a total captured count
        if (d.actionCounts) {
          const total = Object.values(d.actionCounts as Record<string, number>)
            .reduce((sum, n) => sum + n, 0)
          setPostCount(total)
        } else {
          setPostCount(d.records?.length ?? null)
        }
      })
      .catch(() => {})
  }, [checking])

  if (status === 'loading' || checking) {
    return <div className="min-h-screen bg-[#080a0f]" />
  }

  return (
    <div className="min-h-screen bg-[#080a0f] text-white flex flex-col">
      {/* Minimal nav */}
      <header className="border-b border-slate-800/60 bg-[#0a0c10]/80 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-xs">
              CB
            </div>
            <span className="text-sm font-semibold text-white">ClientBloom Scout</span>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/sign-in' })}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-lg w-full space-y-8 text-center">

          {/* Status indicator */}
          {trialExpired ? (
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-900/30 border border-red-700/40 text-red-400 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              Trial expired
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-900/30 border border-amber-700/40 text-amber-400 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Trial ending soon — {daysLeft} day{daysLeft === 1 ? '' : 's'} left
            </div>
          )}

          {/* Headline */}
          <div className="space-y-3">
            <h1 className="text-3xl font-bold text-white tracking-tight">
              {trialExpired
                ? 'Your trial has ended'
                : 'Upgrade to keep your feed running'}
            </h1>
            <p className="text-slate-400 text-base leading-relaxed">
              {trialExpired
                ? 'Subscribe to unlock your captured leads and resume daily scanning.'
                : `Subscribe before your trial ends to keep everything running without interruption.`}
            </p>
          </div>

          {/* FOMO card — only show if we have posts */}
          {postCount !== null && postCount > 0 && (
            <div className="rounded-2xl bg-[#12151e] border border-slate-700/50 p-6 text-left space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">Your data is safe — for now</p>
                  <p className="text-slate-500 text-xs">Locked until you subscribe</p>
                </div>
              </div>
              <div className="rounded-xl bg-blue-950/40 border border-blue-800/30 px-5 py-4">
                <p className="text-4xl font-bold text-blue-300 mb-1">{postCount.toLocaleString()}</p>
                <p className="text-sm text-slate-400">
                  lead{postCount === 1 ? '' : 's'} captured during your trial{trialExpired ? '' : ' so far'} — ready to work the moment you subscribe.
                </p>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Your ICP settings, captured posts, and engagement history are all preserved. Subscribing picks up exactly where your trial left off.
              </p>
            </div>
          )}

          {/* Pricing card */}
          <div className="rounded-2xl bg-[#12151e] border border-[#4F6BFF]/30 p-6 text-left space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-white font-semibold text-sm">Scout</p>
                <p className="text-slate-500 text-xs mt-0.5">Full access, no setup required</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-white">$79<span className="text-sm font-normal text-slate-500">/mo</span></p>
              </div>
            </div>

            <ul className="space-y-2.5">
              {[
                'LinkedIn + Facebook scanning, twice daily',
                'AI relevance scoring on every post',
                'Comment angle suggestions for each lead',
                'GHL / CRM push integration',
                'All captured data and history preserved',
              ].map(feat => (
                <li key={feat} className="flex items-start gap-2.5 text-sm text-slate-300">
                  <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  {feat}
                </li>
              ))}
            </ul>

            <a
              href="/api/checkout"
              className="block w-full text-center bg-[#4F6BFF] hover:bg-[#3d5aee] text-white font-semibold py-3.5 rounded-xl transition-colors text-sm"
            >
              Subscribe and unlock my leads →
            </a>
            <p className="text-xs text-slate-600 text-center">
              Billed monthly · Cancel anytime · No setup fees
            </p>
          </div>

          {/* Talk to Mike */}
          <p className="text-xs text-slate-600">
            Questions?{' '}
            <a href="mailto:mike@clientbloom.ai" className="text-slate-500 hover:text-slate-300 underline underline-offset-2 transition-colors">
              Reach out directly
            </a>
          </p>
        </div>
      </main>
    </div>
  )
}
