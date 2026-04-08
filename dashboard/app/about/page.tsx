/**
 * About Scout Page
 * Server-rendered for SEO
 */

import { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: "About Scout by ClientBloom — LinkedIn Relationship Intelligence",
  description: "Scout is a LinkedIn relationship intelligence platform built by ClientBloom to help consultants and GTM teams build warm pipeline through consistent, AI-guided engagement.",
}

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

export default function AboutPage() {
  const CHECKOUT_URL = '/sign-up'

  return (
    <div className="min-h-screen bg-[#080a0f] text-slate-200 font-sans">
      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#080a0f]/90 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <ClientBloomMark size={28} />
            <span className="text-white font-bold tracking-tight">Scout <span className="text-slate-400 font-normal text-sm">by ClientBloom</span></span>
          </Link>
          <div className="flex items-center gap-4">
            <a href={CHECKOUT_URL} className="bg-[#4F6BFF] hover:bg-[#3D57F5] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              Start Free Trial
            </a>
          </div>
        </div>
      </nav>

      <div className="pt-32 pb-24 px-6">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="mb-16">
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-8">Built for the way relationships actually close deals</h1>
          </div>

          {/* Content */}
          <div className="space-y-8 text-slate-300 text-lg leading-relaxed">
            <p>
              Scout is a LinkedIn relationship intelligence platform built by ClientBloom. It exists because cold outreach is broken, and most sellers know it.
            </p>

            <p>
              The problem isn't LinkedIn. The problem is timing and volume. You can't monitor 50 prospects manually, read every post, and show up consistently — not while running a business. Scout does that for you.
            </p>

            <p>
              Every day, Scout monitors the LinkedIn profiles and keyword searches you care about. It reads every post through the lens of your ICP, scores it 1–10 for relevance, and tells you exactly which ones are worth your time and what to say. You engage with context, with consistency, and with the kind of presence that makes the eventual pitch feel like a natural next step.
            </p>

            <p>
              Scout is built on Claude, Anthropic's AI, and runs on a custom scoring architecture that lets you tune exactly what "a high-relevance opportunity" means for your specific market.
            </p>

            <p>
              It's built by ClientBloom — a consulting firm that has spent years helping B2B companies build pipeline and retain clients. Scout is what we built when we got tired of explaining to clients why their LinkedIn strategy wasn't working.
            </p>

            {/* Who it's for */}
            <div className="border-t border-slate-800 pt-8 mt-8">
              <h2 className="text-2xl font-bold text-white mb-6">Who Scout is for</h2>
              <ul className="space-y-4">
                <li className="flex gap-4">
                  <span className="text-[#4F6BFF] flex-shrink-0 font-bold">•</span>
                  <span>Fractional executives and independent consultants who build pipeline on LinkedIn</span>
                </li>
                <li className="flex gap-4">
                  <span className="text-[#4F6BFF] flex-shrink-0 font-bold">•</span>
                  <span>B2B agency owners managing relationship programs for multiple clients</span>
                </li>
                <li className="flex gap-4">
                  <span className="text-[#4F6BFF] flex-shrink-0 font-bold">•</span>
                  <span>Small GTM teams that need to stay visible with prospects without a full SDR function</span>
                </li>
                <li className="flex gap-4">
                  <span className="text-[#4F6BFF] flex-shrink-0 font-bold">•</span>
                  <span>Founders who close deals through relationships, not cold email blasts</span>
                </li>
              </ul>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-16 text-center">
            <a
              href={CHECKOUT_URL}
              className="inline-flex items-center gap-2 bg-[#4F6BFF] hover:bg-[#3D57F5] text-white font-semibold px-10 py-5 rounded-xl text-lg transition-all hover:scale-[1.02] shadow-xl shadow-[#4F6BFF]/25 mb-4"
            >
              Start 14-Day Free Trial
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </a>
            <p className="text-slate-500 text-sm">No credit card required. See results in your first week.</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-800/50 py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ClientBloomMark size={20} />
            <span className="text-slate-500 text-sm">Scout by ClientBloom.ai</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/sign-in" className="text-slate-600 hover:text-slate-400 text-sm transition-colors">Sign In</Link>
            <a href="mailto:info@clientbloom.ai" className="text-slate-600 hover:text-slate-400 text-sm transition-colors">Contact</a>
            <span className="text-slate-700 text-sm">© 2026 ClientBloom.ai</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
