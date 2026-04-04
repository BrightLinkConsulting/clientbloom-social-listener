/**
 * /welcome — Post-checkout landing page
 *
 * Stripe redirects here after a successful purchase:
 *   success_url: /welcome?session_id={CHECKOUT_SESSION_ID}
 *
 * Publicly accessible (no auth required).
 * Tells the new customer to check their email for login credentials.
 */

'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function WelcomeContent() {
  const params    = useSearchParams()
  const cancelled = params.get('checkout') === 'cancelled'
  const [show, setShow] = useState(false)

  useEffect(() => {
    setTimeout(() => setShow(true), 80) // subtle fade-in delay
  }, [])

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
