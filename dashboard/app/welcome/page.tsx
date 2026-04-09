/**
 * /welcome — Post-checkout landing page
 *
 * Two distinct flows land here:
 *
 * A) NEW ACCOUNT PURCHASE (no ?upgraded param)
 *    Stripe redirects here after a brand-new purchase.
 *    The user has no account yet — shows "check your email" instructions.
 *
 * B) EXISTING TRIAL UPGRADE (?upgraded=1&tier=starter|pro|agency)
 *    An already-logged-in trial user completed Stripe checkout.
 *    The page calls /api/session/refresh, updates the JWT via session.update(),
 *    and shows a tier-specific celebration before redirecting to the feed.
 *
 * Also handles ?checkout=cancelled for abandoned checkouts.
 */

'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useSession }  from 'next-auth/react'
import { Suspense } from 'react'

// ── Plan display config ───────────────────────────────────────────────────────

const PLAN_META: Record<string, { label: string; color: string; tagline: string }> = {
  starter: {
    label:   'Starter',
    color:   '#4F6BFF',
    tagline: 'Daily scans, AI comment suggestions, and your ICP feed — ready to go.',
  },
  pro: {
    label:   'Pro',
    color:   '#7C3AED',
    tagline: 'Twice-daily scans, CRM sync, and Slack digest. Your full pipeline, automated.',
  },
  agency: {
    label:   'Agency',
    color:   '#E91E8C',
    tagline: 'Multiple seats, full limits, and your team working the same lead feed.',
  },
}

// ── Main content ──────────────────────────────────────────────────────────────

function WelcomeContent() {
  const params     = useSearchParams()
  const router     = useRouter()
  const { data: session, update: updateSession, status } = useSession()

  const cancelled  = params.get('checkout') === 'cancelled'
  const upgraded   = params.get('upgraded')  === '1'
  const tierParam  = (params.get('tier') || 'pro').toLowerCase()
  const planMeta   = PLAN_META[tierParam] || PLAN_META.pro

  const [show,       setShow]      = useState(false)
  const [refreshed,  setRefreshed] = useState(false)
  const [countdown,  setCountdown] = useState(5)
  const [refreshErr, setRefreshErr] = useState(false)

  // Subtle fade-in
  useEffect(() => { setTimeout(() => setShow(true), 80) }, [])

  // ── Upgrade flow: refresh session then auto-redirect ──────────────────────
  useEffect(() => {
    if (!upgraded || refreshed) return
    if (status === 'loading') return   // wait for session to resolve

    async function refreshPlan() {
      try {
        const res  = await fetch('/api/session/refresh')
        const data = res.ok ? await res.json() : null

        if (data?.plan) {
          // Immediately update the JWT so the main feed shows the new plan
          await updateSession({ plan: data.plan, trialEndsAt: data.trialEndsAt })
        }
      } catch {
        // Non-fatal — user can still navigate to the feed manually
        setRefreshErr(true)
      } finally {
        setRefreshed(true)
      }
    }

    refreshPlan()
  }, [upgraded, status, refreshed, updateSession])

  // ── Countdown timer after session refreshed ───────────────────────────────
  useEffect(() => {
    if (!upgraded || !refreshed) return
    if (countdown <= 0) { router.push('/'); return }
    const id = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(id)
  }, [upgraded, refreshed, countdown, router])

  // ── Cancelled checkout ────────────────────────────────────────────────────
  if (cancelled) {
    return (
      <div className="min-h-screen bg-[#080a0f] flex items-center justify-center px-6">
        <div
          className="max-w-md w-full text-center space-y-6 transition-opacity duration-500"
          style={{ opacity: show ? 1 : 0 }}
        >
          <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto">
            <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">No problem.</h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              Your checkout was cancelled — nothing was charged.
              Come back when you're ready.
            </p>
          </div>
          <Link
            href="/"
            className="inline-block bg-[#4F6BFF] hover:bg-[#3D57F5] text-white font-medium px-6 py-3 rounded-xl text-sm transition-colors"
          >
            Back to Scout
          </Link>
        </div>
      </div>
    )
  }

  // ── Existing-user upgrade flow ────────────────────────────────────────────
  if (upgraded) {
    const isReady = refreshed   // show full content once session refresh has run

    return (
      <div className="min-h-screen bg-[#080a0f] flex items-center justify-center px-6">
        <div
          className="max-w-md w-full text-center space-y-7 transition-opacity duration-500"
          style={{ opacity: show ? 1 : 0 }}
        >
          {/* Animated checkmark */}
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto border"
            style={{
              background: `${planMeta.color}18`,
              borderColor: `${planMeta.color}40`,
            }}
          >
            <svg className="w-9 h-9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              style={{ color: planMeta.color }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <div>
            <div
              className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-3"
              style={{ background: `${planMeta.color}20`, color: planMeta.color }}
            >
              {planMeta.label} Plan
            </div>
            <h1 className="text-3xl font-bold text-white mb-3">
              You're upgraded.
            </h1>
            <p className="text-slate-300 text-sm leading-relaxed">
              {planMeta.tagline}
            </p>
          </div>

          {isReady ? (
            <>
              <div className="bg-[#0e1117] border border-slate-800 rounded-2xl p-5 text-left">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
                  Your account is live right now
                </p>
                <p className="text-slate-300 text-sm leading-relaxed">
                  Your feed, scan schedule, and all your settings carry over automatically.
                  No setup needed.
                </p>
                {refreshErr && (
                  <p className="text-amber-400 text-xs mt-3">
                    Heads up: we couldn't auto-refresh your session. Your plan will show
                    correctly after you sign out and back in.
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <Link
                  href="/"
                  className="block text-white font-semibold px-6 py-3.5 rounded-xl text-sm transition-colors"
                  style={{ background: planMeta.color }}
                >
                  Go to my feed →
                </Link>
                <p className="text-slate-600 text-xs">
                  Redirecting in {countdown}s…
                </p>
              </div>
            </>
          ) : (
            // Loading state while session refreshes
            <div className="flex items-center justify-center gap-2 text-slate-500 text-sm py-4">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Activating your plan…
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── New account purchase flow (original) ──────────────────────────────────
  return (
    <div className="min-h-screen bg-[#080a0f] flex items-center justify-center px-6">
      <div
        className="max-w-md w-full text-center space-y-7 transition-opacity duration-500"
        style={{ opacity: show ? 1 : 0 }}
      >
        {/* Checkmark */}
        <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto">
          <svg className="w-9 h-9 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        {/* Headline */}
        <div>
          <h1 className="text-3xl font-bold text-white mb-3">You're in.</h1>
          <p className="text-slate-300 text-sm leading-relaxed">
            Your Scout account is being set up right now.
            <br />
            Check your inbox — your login credentials are on the way.
          </p>
        </div>

        {/* What happens next */}
        <div className="bg-[#0e1117] border border-slate-800 rounded-2xl p-6 text-left space-y-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">What happens next</p>
          {[
            { step: '1', text: 'Check your email for your username and temporary password.' },
            { step: '2', text: 'Sign in and complete your 2-minute setup — tell Scout who you\'re looking for.' },
            { step: '3', text: 'Hit "Scan Now" and see your first leads in about 30 seconds.' },
          ].map(({ step, text }) => (
            <div key={step} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-[#4F6BFF]/20 border border-[#4F6BFF]/30 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[10px] font-bold text-[#4F6BFF]">{step}</span>
              </div>
              <p className="text-slate-300 text-sm leading-relaxed">{text}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="space-y-3">
          <Link
            href="/sign-in"
            className="block bg-[#4F6BFF] hover:bg-[#3D57F5] text-white font-semibold px-6 py-3.5 rounded-xl text-sm transition-colors"
          >
            Go to sign in
          </Link>
          <p className="text-slate-600 text-xs">
            Didn't get an email? Check your spam folder, or{' '}
            <a href="mailto:support@clientbloom.ai" className="text-slate-400 hover:text-white transition-colors underline underline-offset-2">
              contact us
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  )
}

export default function WelcomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#080a0f]" />}>
      <WelcomeContent />
    </Suspense>
  )
}
