/**
 * Scout vs. LinkedIn Sales Navigator Comparison Page
 * Server-rendered for SEO
 */

import { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: "Scout vs. LinkedIn Sales Navigator: Which Tool Wins for Warm LinkedIn Outreach? (2026)",
  description: "Scout and LinkedIn Sales Navigator solve different problems. See which tool is right for building pipeline through organic LinkedIn engagement — and why most serious sellers need both.",
  keywords: "scout vs sales navigator, linkedin sales navigator alternative, linkedin engagement tool, linkedin relationship intelligence, warm linkedin outreach",
  openGraph: {
    title: "Scout vs. LinkedIn Sales Navigator (2026)",
    description: "Sales Navigator finds prospects. Scout tells you exactly when and how to engage them. See the full breakdown.",
    type: "website",
  },
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

function CheckIcon() {
  return (
    <svg className="w-5 h-5 text-emerald-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  )
}

function DashIcon() {
  return <span className="text-slate-700 text-xl font-light mx-auto block text-center">—</span>
}

export default function ComparePage() {
  const CHECKOUT_URL = '/sign-up'

  const features = [
    {
      feature: 'AI post scoring (1–10 by ICP relevance)',
      scout: true, salesnav: false,
      note: 'Scout reads every post through the lens of your ICP and scores it — so you see your top 3 opportunities each morning, not 50 raw posts.',
    },
    {
      feature: 'Keyword monitoring (organic LinkedIn posts)',
      scout: true, salesnav: false,
      note: 'Track phrases your buyers actually use — "switching CRM," "struggling with churn," "need a vendor." Scout surfaces those posts the same day.',
    },
    {
      feature: 'Prospect profile monitoring',
      scout: true, salesnav: true,
      note: null,
    },
    {
      feature: 'AI-generated comment starters',
      scout: true, salesnav: false,
      note: 'One-click personalized comment angles written against the post, your ICP, and your scoring rationale.',
    },
    {
      feature: 'Custom AI scoring prompt per account',
      scout: true, salesnav: false,
      note: null,
    },
    {
      feature: 'CRM push (GHL, HubSpot)',
      scout: true, salesnav: true,
      note: null,
    },
    {
      feature: 'Agency / multi-client workspace',
      scout: true, salesnav: false,
      note: 'Scout Agency supports 5 seats and extended limits across multiple client campaigns from a single dashboard.',
    },
    {
      feature: 'InMail / direct LinkedIn messaging',
      scout: false, salesnav: true,
      note: null,
    },
    {
      feature: 'Advanced prospect search & filtering',
      scout: false, salesnav: true,
      note: null,
    },
    {
      feature: 'Shared team lead lists',
      scout: false, salesnav: true,
      note: null,
    },
    { feature: 'PRICING',    scout: false, salesnav: false, note: null },
    { feature: 'FREE_TRIAL', scout: false, salesnav: false, note: null },
  ]

  return (
    <div className="min-h-screen bg-[#080a0f] text-slate-200 font-sans">

      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#080a0f]/90 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <ClientBloomMark size={28} />
            <span className="text-white font-bold tracking-tight">Scout <span className="text-slate-400 font-normal text-sm">by ClientBloom</span></span>
          </Link>
          <a href={CHECKOUT_URL} className="bg-[#4F6BFF] hover:bg-[#3D57F5] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            Start Free Trial
          </a>
        </div>
      </nav>

      <div className="pt-32 pb-24 px-6">
        <div className="max-w-4xl mx-auto">

          {/* Header */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 rounded-full px-4 py-1.5 text-xs text-violet-300 font-medium mb-6">
              Tool Comparison · 2026
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-5 leading-tight">
              Scout vs. LinkedIn<br className="hidden md:block" /> Sales Navigator
            </h1>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
              Sales Navigator helps you find and store the right people.
              Scout tells you exactly when those people are ready to hear from you — and gives you the words to make it count.
            </p>
          </div>

          {/* Quick verdict cards */}
          <div className="grid md:grid-cols-2 gap-4 mb-12">
            <div className="bg-[#0f1117] border border-slate-800 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <p className="font-semibold text-white">Sales Navigator</p>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                Best for building a precise list of target prospects, filtering by company size and role, and reaching out cold via InMail. It's LinkedIn's own database — nothing beats it for prospecting coverage.
              </p>
              <p className="text-xs text-slate-600 mt-3 font-medium uppercase tracking-wide">Best for: Finding prospects</p>
            </div>
            <div className="bg-[#0f1117] border border-[#4F6BFF]/30 rounded-xl p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-[#4F6BFF]/10 w-32 h-32 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl pointer-events-none" />
              <div className="flex items-center gap-3 mb-3">
                <ClientBloomMark size={32} />
                <p className="font-semibold text-white">Scout</p>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                Best for knowing when your prospects are posting about a problem you solve — and showing up with a thoughtful comment before your competitor does. Turns passive monitoring into warm pipeline.
              </p>
              <p className="text-xs text-[#4F6BFF] mt-3 font-medium uppercase tracking-wide">Best for: Engaging at the right moment</p>
            </div>
          </div>

          {/* Comparison Table */}
          <div className="bg-[#0f1117] border border-slate-800 rounded-xl overflow-hidden mb-12">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800 bg-[#0a0c10]">
                    <th className="text-left px-6 py-4 font-semibold text-white text-sm">Feature</th>
                    <th className="text-center px-6 py-4 font-semibold text-white text-sm w-28">
                      <div className="flex flex-col items-center gap-1">
                        <ClientBloomMark size={20} />
                        <span>Scout</span>
                      </div>
                    </th>
                    <th className="text-center px-6 py-4 font-semibold text-slate-400 text-sm w-28">
                      <div className="flex flex-col items-center gap-1">
                        <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                        </svg>
                        <span>Sales Nav</span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {features.map((row, i) => {
                    if (row.feature === 'PRICING') {
                      return (
                        <tr key={i} className={`border-b border-slate-800 ${i % 2 ? 'bg-[#0a0c10]' : ''}`}>
                          <td className="px-6 py-4 text-slate-300 text-sm">Pricing</td>
                          <td className="text-center px-6 py-4 text-slate-300 text-sm font-medium">from $49/mo</td>
                          <td className="text-center px-6 py-4 text-slate-400 text-sm">from $99/mo</td>
                        </tr>
                      )
                    }
                    if (row.feature === 'FREE_TRIAL') {
                      return (
                        <tr key={i} className={i % 2 ? 'bg-[#0a0c10]' : ''}>
                          <td className="px-6 py-4 text-slate-300 text-sm">Free trial</td>
                          <td className="text-center px-6 py-4 text-slate-300 text-sm font-medium">7 days</td>
                          <td className="text-center px-6 py-4 text-slate-400 text-sm">30 days</td>
                        </tr>
                      )
                    }
                    return (
                      <tr key={i} className={`border-b border-slate-800 ${i % 2 ? 'bg-[#0a0c10]' : ''}`}>
                        <td className="px-6 py-4 text-sm">
                          <span className="text-slate-300">{row.feature}</span>
                          {row.note && (
                            <p className="text-xs text-slate-600 mt-0.5 max-w-xs leading-relaxed">{row.note}</p>
                          )}
                        </td>
                        <td className="text-center px-6 py-4">
                          {row.scout ? <CheckIcon /> : <DashIcon />}
                        </td>
                        <td className="text-center px-6 py-4">
                          {row.salesnav ? <CheckIcon /> : <DashIcon />}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-[#0f1117] border border-slate-800 rounded-xl p-8 mb-12">
            <h2 className="text-2xl font-bold text-white mb-6">Why these tools aren't actually competitors</h2>
            <div className="space-y-5 text-slate-300 text-base leading-relaxed">
              <p>
                Sales Navigator is LinkedIn's own prospecting tool. Nobody beats it for finding, filtering, and saving leads at scale. If you're building outbound sequences or running high-volume InMail campaigns, Sales Navigator belongs in your stack.
              </p>
              <p>
                Scout solves a different problem: what happens after you've identified your prospects. Most reps save a lead in Sales Navigator and then wait — hoping to catch them in their feed, or sending a cold InMail into a crowded inbox. Scout monitors those leads daily, scores everything they post against your ICP, and flags the moments when they're publicly talking about the exact problem you solve.
              </p>
              <p>
                That's the window. A prospect posting "we're evaluating new vendors for X" is a warm conversation waiting to happen. Sales Navigator won't tell you it happened. Scout surfaces it within hours, explains why it matters, and gives you a comment starter that sounds nothing like everyone else's InMail.
              </p>
              <p>
                If you already use Sales Navigator, Scout is the engagement layer on top of it. If you don't, Scout gets you further — faster — for a fraction of the price.
              </p>
            </div>
          </div>

          {/* Feature highlight callout */}
          <div className="grid md:grid-cols-3 gap-4 mb-14">
            {[
              {
                icon: (
                  <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                ),
                title: 'AI post scoring',
                body: 'Every post your prospects publish gets a 1–10 ICP relevance score with a reason. You see your top opportunities each morning — not a raw firehose.',
              },
              {
                icon: (
                  <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                  </svg>
                ),
                title: 'Comment starters',
                body: 'AI-written comment angles personalized to the post, your ICP, and your scoring rationale. No more staring at a blank comment box wondering what to say.',
              },
              {
                icon: (
                  <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                ),
                title: 'Keyword monitoring',
                body: 'Track phrases your buyers post about — not just who they are. Get alerted the same day someone publishes a post that mentions the exact problem you solve.',
              },
            ].map((card, i) => (
              <div key={i} className="bg-[#0f1117] border border-slate-800/80 rounded-xl p-5">
                <div className="mb-3">{card.icon}</div>
                <p className="text-sm font-semibold text-white mb-2">{card.title}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{card.body}</p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="text-center">
            <a
              href={CHECKOUT_URL}
              className="inline-flex items-center gap-2 bg-[#4F6BFF] hover:bg-[#3D57F5] text-white font-semibold px-10 py-5 rounded-xl text-lg transition-all hover:scale-[1.02] shadow-xl shadow-[#4F6BFF]/25 mb-4"
            >
              Start Your Free 7-Day Trial
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </a>
            <p className="text-slate-500 text-sm">No credit card required. Set up in under 10 minutes.</p>
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
