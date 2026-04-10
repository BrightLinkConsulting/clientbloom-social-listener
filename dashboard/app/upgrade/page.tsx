'use client'

import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { getTierLimits, isPaidPlan, isStripeBilledPlan } from '@/lib/tier'

function ClientBloomMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="21" rx="24" ry="13" fill="#F7B731" />
      <ellipse cx="20" cy="52" rx="13" ry="25" fill="#E91E8C" />
      <ellipse cx="80" cy="52" rx="13" ry="25" fill="#00B96B" />
      <ellipse cx="50" cy="79" rx="24" ry="13" fill="#7C3AED" />
      <circle cx="50" cy="50" r="13" fill="#7C3AED" />
    </svg>
  )
}

const TIERS = [
  {
    key:         'starter',
    name:        'Starter',
    price:       '$49',
    description: 'For solo consultants getting started with LinkedIn intelligence.',
    features: [
      '3 LinkedIn keyword searches',
      '10 ICP profiles scanned · 50-profile pool',
      '1 scan per day',
      '30 AI comment suggestions/mo',
      '30-day post history',
      '1 user seat',
    ],
    cta:        'Start with Starter',
    highlight:  false,
    badge:      null,
  },
  {
    key:         'pro',
    name:        'Pro',
    price:       '$99',
    description: 'The full product. Everything you need to build pipeline from LinkedIn.',
    features: [
      '10 LinkedIn keyword searches',
      '25 ICP profiles scanned · 150-profile pool',
      '2 scans per day (morning + evening)',
      'Unlimited AI comment suggestions',
      'Unlimited post history',
      'Slack daily digest',
      '1 user seat',
    ],
    cta:        'Get Pro',
    highlight:  true,
    badge:      'Most Popular',
  },
  {
    key:         'agency',
    name:        'Agency',
    price:       '$249',
    description: 'For consultants managing LinkedIn intelligence for multiple clients.',
    features: [
      '20 LinkedIn keyword searches',
      '50 ICP profiles scanned · 500-profile pool',
      '2 scans per day',
      'Unlimited AI comment suggestions',
      'Unlimited post history',
      'CRM integration (GHL + HubSpot)',
      'Slack daily digest',
      'Up to 5 user seats',
    ],
    cta:        'Get Agency',
    highlight:  false,
    badge:      'Best Value',
  },
]

const CHECK_ICON = (
  <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
  </svg>
)

export default function UpgradePage() {
  const { data: session, status } = useSession()
  const router  = useRouter()
  const [postCount, setPostCount]   = useState<number | null>(null)
  const [checking, setChecking]     = useState(true)
  const [upgrading, setUpgrading]   = useState<string | null>(null)

  const user          = session?.user as any
  const plan          = user?.plan || ''
  const paidPlan      = isPaidPlan(plan)
  const isStripePlan  = isStripeBilledPlan(plan)  // already has active Stripe subscription
  const trialEndsAt   = user?.trialEndsAt || null
  const trialMsLeft   = trialEndsAt ? new Date(trialEndsAt).getTime() - Date.now() : null
  const trialExpired  = !!trialEndsAt && new Date() > new Date(trialEndsAt)
  const daysLeft      = trialMsLeft !== null && !trialExpired
    ? Math.floor(trialMsLeft / 86_400_000)
    : null
  const hoursLeft     = trialMsLeft !== null && !trialExpired
    ? Math.floor((trialMsLeft % 86_400_000) / 3_600_000)
    : 0

  // Portal handler for active paid subscribers who navigate to /upgrade
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalError,   setPortalError]   = useState('')

  async function handleOpenPortal() {
    setPortalLoading(true)
    setPortalError('')
    try {
      const res  = await fetch('/api/billing/portal')
      const data = await res.json()
      if (!res.ok || !data.url) {
        setPortalError(data.error || 'Could not open billing portal. Please try again.')
        return
      }
      window.location.href = data.url
    } catch {
      setPortalError('Network error — please try again.')
    } finally {
      setPortalLoading(false)
    }
  }

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'unauthenticated') { router.replace('/sign-in'); return }
    setChecking(false)
  }, [status, router])

  // Auto-open portal when redirected here from /api/billing/upgrade with portal=1
  // (happens when an active subscriber tried to hit the upgrade route directly)
  useEffect(() => {
    if (checking || !isStripePlan) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('portal') === '1') handleOpenPortal()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, isStripePlan])

  useEffect(() => {
    if (checking) return
    fetch('/api/posts?action=all&limit=1')
      .then(r => r.json())
      .then(d => {
        if (d.actionCounts) {
          const total = Object.values(d.actionCounts as Record<string, number>).reduce((s, n) => s + n, 0)
          setPostCount(total)
        } else {
          setPostCount(d.records?.length ?? null)
        }
      })
      .catch(() => {})
  }, [checking])

  function handleUpgrade(tier: string) {
    setUpgrading(tier)
    window.location.href = `/api/billing/upgrade?tier=${tier}`
  }

  if (status === 'loading' || checking) {
    return <div className="min-h-screen bg-[#080a0f]" />
  }

  return (
    <div className="min-h-screen bg-[#080a0f] text-white flex flex-col">

      {/* Minimal nav */}
      <header className="border-b border-slate-800/60 bg-[#0a0c10]/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ClientBloomMark size={28} />
            <span className="text-sm font-semibold text-white">Scout by ClientBloom</span>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/sign-in' })}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 px-6 py-14">
        <div className="max-w-5xl mx-auto space-y-10">

          {/* Banner for active paid subscribers who land here */}
          {isStripePlan && (
            <div className="rounded-2xl bg-blue-900/15 border border-blue-700/30 px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <p className="text-sm font-semibold text-blue-300">You already have an active subscription</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  To upgrade, downgrade, or change your plan, use the billing portal — your proration is handled automatically.
                </p>
              </div>
              <button
                onClick={handleOpenPortal}
                disabled={portalLoading}
                className="shrink-0 bg-[#4F6BFF] hover:bg-[#3d5aee] text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
              >
                {portalLoading ? 'Opening…' : 'Open billing portal →'}
              </button>
            </div>
          )}

          {/* Portal error (for paid subscribers) */}
          {portalError && (
            <div className="rounded-xl bg-red-900/20 border border-red-800/30 px-4 py-3">
              <p className="text-xs text-red-400">{portalError}</p>
            </div>
          )}

          {/* Status badge */}
          <div className="text-center space-y-3">
            {trialExpired ? (
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-900/30 border border-red-700/40 text-red-400 text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                Trial expired
              </div>
            ) : daysLeft !== null ? (
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-900/30 border border-amber-700/40 text-amber-400 text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                {daysLeft === 0 ? `${hoursLeft}h left` : `${daysLeft}d ${hoursLeft}h left`}
              </div>
            ) : null}

            <h1 className="text-3xl font-bold text-white tracking-tight">
              {trialExpired ? 'Your trial has ended' : 'Choose your plan'}
            </h1>
            <p className="text-slate-400 max-w-xl mx-auto">
              {trialExpired
                ? 'Subscribe to unlock your captured leads and resume daily scanning.'
                : 'All plans include your trial data, no setup required. Cancel anytime.'}
            </p>
          </div>

          {/* FOMO card */}
          {postCount !== null && postCount > 0 && (
            <div className="max-w-md mx-auto rounded-2xl bg-[#12151e] border border-slate-700/50 p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-300">{postCount.toLocaleString()} leads</p>
                <p className="text-sm text-slate-400">captured during your trial — ready the moment you subscribe</p>
              </div>
            </div>
          )}

          {/* 3-tier pricing grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {TIERS.map((tier) => (
              <div
                key={tier.key}
                className={`rounded-2xl p-6 flex flex-col space-y-5 transition-all ${
                  tier.highlight
                    ? 'bg-[#12151e] border-2 border-[#4F6BFF]/60 shadow-[0_0_40px_8px_rgba(79,107,255,0.1)]'
                    : 'bg-[#0f1117] border border-slate-700/50'
                }`}
              >
                {/* Badge */}
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    tier.highlight ? 'bg-[#4F6BFF]/20 text-[#4F6BFF]' :
                    tier.badge    ? 'bg-purple-900/30 text-purple-400' :
                    'opacity-0'
                  }`}>
                    {tier.badge || 'x'}
                  </span>
                </div>

                {/* Tier info */}
                <div>
                  <p className="text-white font-bold text-xl">{tier.name}</p>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-3xl font-bold text-white">{tier.price}</span>
                    <span className="text-slate-500 text-sm">/mo</span>
                  </div>
                  <p className="text-slate-500 text-xs mt-2 leading-relaxed">{tier.description}</p>
                </div>

                {/* Features */}
                <ul className="space-y-2 flex-1">
                  {tier.features.map(feat => (
                    <li key={feat} className="flex items-start gap-2.5 text-sm text-slate-300">
                      {CHECK_ICON}
                      {feat}
                    </li>
                  ))}
                </ul>

                {/* CTA — active paid subscribers use the Billing Portal to change tiers */}
                {isStripePlan && plan !== `Scout ${tier.name}` ? (
                  <button
                    onClick={handleOpenPortal}
                    disabled={portalLoading}
                    className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {portalLoading ? 'Opening…' : 'Manage subscription →'}
                  </button>
                ) : (
                  <button
                    onClick={() => handleUpgrade(tier.key)}
                    disabled={upgrading !== null || plan === `Scout ${tier.name}` || plan === 'Owner' || isStripePlan}
                    className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                      tier.highlight
                        ? 'bg-[#4F6BFF] hover:bg-[#3d5aee] text-white'
                        : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                    }`}
                  >
                    {upgrading === tier.key
                      ? 'Redirecting to Stripe…'
                      : plan === `Scout ${tier.name}` || (plan === 'Owner' && tier.key === 'agency')
                      ? 'Current Plan'
                      : tier.cta}
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Fine print */}
          <div className="text-center space-y-2">
            <p className="text-xs text-slate-600">All plans billed monthly · Cancel anytime · No setup fees · Your trial data is preserved</p>
            <p className="text-xs text-slate-600">
              Questions?{' '}
              <a href="mailto:info@clientbloom.ai" className="text-slate-500 hover:text-slate-300 underline underline-offset-2 transition-colors">
                Reach out directly
              </a>
            </p>
          </div>

        </div>
      </main>
    </div>
  )
}
