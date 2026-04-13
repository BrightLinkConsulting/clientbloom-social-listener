/**
 * Scout vs. LinkedIn Sales Navigator Comparison Page
 * Server-rendered for SEO
 */

import { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: "Scout vs. LinkedIn Sales Navigator: Which Tool Wins for LinkedIn Pipeline? (2026)",
  description: "Sales Navigator is great at finding prospects. Scout turns those prospects into warm pipeline — by showing you exactly when they post about the problem you solve, and writing the comment that gets you noticed first.",
  keywords: "scout vs sales navigator, linkedin sales navigator alternative, linkedin engagement tool, linkedin relationship intelligence, warm linkedin outreach, linkedin post monitoring",
  openGraph: {
    title: "Scout vs. LinkedIn Sales Navigator (2026)",
    description: "Sales Navigator finds prospects. Scout tells you exactly when and how to engage them — every day, automatically. See the full breakdown.",
    type: "website",
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Scout by ClientBloom' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Scout vs. LinkedIn Sales Navigator (2026)",
    description: "Sales Navigator finds prospects. Scout turns them into warm pipeline. See why serious LinkedIn sellers use both.",
    images: ['/og-image.png'],
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
      feature: 'Monitors ICP posts automatically — twice daily',
      scout: true, salesnav: false,
      note: 'Scout runs morning and evening scans across every profile and keyword you configure. Sales Navigator requires you to log in and manually check your feed.',
    },
    {
      feature: 'AI post scoring (1–10 by ICP relevance)',
      scout: true, salesnav: false,
      note: 'Every post is scored against your ICP and a reason is written. You see your top 3 opportunities each morning — not 50 raw posts.',
    },
    {
      feature: 'Keyword monitoring (organic LinkedIn posts)',
      scout: true, salesnav: false,
      note: '"Evaluating vendors," "switching CRM," "struggling with churn" — Scout surfaces those posts the same day, before your competitors see them.',
    },
    {
      feature: 'AI-generated comment starters',
      scout: true, salesnav: false,
      note: 'One-click personalized comment angles written against the post, your ICP, and your scoring rationale. Sales Navigator has no equivalent.',
    },
    {
      feature: 'Searchable post history archive',
      scout: true, salesnav: false,
      note: 'LinkedIn\'s feed disappears. Scout keeps a permanent archive of every post your prospects have published, organized by score and engagement.',
    },
    {
      feature: 'Custom AI scoring prompt per account',
      scout: true, salesnav: false,
      note: 'Tune exactly what "a high-value post" means for your ICP. Sales Navigator has no scoring — you see everything.',
    },
    {
      feature: 'Prospect profile monitoring',
      scout: true, salesnav: true,
      note: null,
    },
    {
      feature: 'CRM push (GoHighLevel, HubSpot)',
      scout: true, salesnav: true,
      note: 'Scout (Agency plan): pushes engaged contacts with post context and notes. Sales Nav: syncs contact data, not engagement history.',
    },
    {
      feature: 'Agency / multi-client workspace',
      scout: true, salesnav: false,
      note: 'Scout Agency supports 5 seats and extended limits across multiple client campaigns from one dashboard.',
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
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 min-w-0 shrink-0">
            <ClientBloomMark size={28} />
            <span className="text-white font-bold tracking-tight">Scout <span className="text-slate-400 font-normal text-sm hidden sm:inline">by ClientBloom</span></span>
          </Link>
          <a href={CHECKOUT_URL} className="shrink-0 whitespace-nowrap bg-[#4F6BFF] hover:bg-[#3D57F5] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
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
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-5 leading-tight">
              Scout vs. LinkedIn<br className="hidden md:block" /> Sales Navigator
            </h1>
            <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
              Sales Navigator helps you find and store the right people.
              Scout shows you exactly when those people are ready to engage — and hands you the opening line that actually gets a response.
            </p>
          </div>

          {/* Scout wins callout */}
          <div className="bg-[#0f1117] border border-[#4F6BFF]/40 rounded-xl p-6 mb-10">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#4F6BFF]/20 flex items-center justify-center shrink-0 mt-0.5">
                <svg className="w-5 h-5 text-[#4F6BFF]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-white text-base mb-1">Scout wins for LinkedIn engagement. It's not close.</p>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Sales Navigator is a database tool — it helps you find people, filter by title and industry, and send InMail. It does nothing to help you engage those people once you've found them. Scout is purpose-built for exactly that: catching the moment a prospect publicly signals buying intent and putting the right words in your hands while your competitors are still cold-pitching.
                </p>
              </div>
            </div>
          </div>

          {/* Quick verdict cards */}
          <div className="grid sm:grid-cols-2 gap-4 mb-12">
            <div className="bg-[#0f1117] border border-slate-700/60 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <p className="font-semibold text-white">Sales Navigator</p>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                Strong at building a precise list of target prospects, filtering by company size and role, and reaching out via InMail. It's LinkedIn's own database — unmatched for finding and organizing who you want to target.
              </p>
              <p className="text-xs text-slate-500 mt-3 font-medium uppercase tracking-wide border-t border-slate-800 pt-3">Best for: finding and storing prospects • from $99/mo</p>
            </div>
            <div className="bg-[#0f1117] border border-[#4F6BFF]/40 rounded-xl p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-[#4F6BFF]/10 w-32 h-32 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl pointer-events-none" />
              <div className="absolute top-3 right-3">
                <span className="bg-[#4F6BFF]/20 text-[#4F6BFF] text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">Recommended</span>
              </div>
              <div className="flex items-center gap-3 mb-3">
                <ClientBloomMark size={32} />
                <p className="font-semibold text-white">Scout</p>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                Runs twice daily to catch your prospects posting about the exact problems you solve. Scores each post 1–10 for engagement opportunity, writes the comment for you, and keeps a searchable archive — all automatically.
              </p>
              <p className="text-xs text-[#4F6BFF] mt-3 font-medium uppercase tracking-wide border-t border-[#4F6BFF]/20 pt-3">Best for: LinkedIn engagement + warm pipeline • from $49/mo</p>
            </div>
          </div>

          {/* Comparison Table */}
          <div className="bg-[#0f1117] border border-slate-800 rounded-xl overflow-hidden mb-12">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px]">
                <thead>
                  <tr className="border-b border-slate-800 bg-[#0a0c10]">
                    <th className="text-left px-4 sm:px-6 py-4 font-semibold text-white text-sm">Feature</th>
                    <th className="text-center px-4 sm:px-6 py-4 font-semibold text-white text-sm w-24 sm:w-28">
                      <div className="flex flex-col items-center gap-1">
                        <ClientBloomMark size={20} />
                        <span>Scout</span>
                      </div>
                    </th>
                    <th className="text-center px-4 sm:px-6 py-4 font-semibold text-slate-400 text-sm w-24 sm:w-28">
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
                          <td className="px-4 sm:px-6 py-4 text-slate-300 text-sm">Monthly cost</td>
                          <td className="text-center px-4 sm:px-6 py-4 text-white text-sm font-semibold">from $49/mo</td>
                          <td className="text-center px-4 sm:px-6 py-4 text-slate-400 text-sm">from $99/mo</td>
                        </tr>
                      )
                    }
                    if (row.feature === 'FREE_TRIAL') {
                      return (
                        <tr key={i} className={i % 2 ? 'bg-[#0a0c10]' : ''}>
                          <td className="px-4 sm:px-6 py-4 text-slate-300 text-sm">Free trial</td>
                          <td className="text-center px-4 sm:px-6 py-4 text-[#4F6BFF] text-sm font-semibold">7 days</td>
                          <td className="text-center px-4 sm:px-6 py-4 text-slate-400 text-sm">30 days</td>
                        </tr>
                      )
                    }
                    return (
                      <tr key={i} className={`border-b border-slate-800 ${i % 2 ? 'bg-[#0a0c10]' : ''}`}>
                        <td className="px-4 sm:px-6 py-4 text-sm">
                          <span className="text-slate-300">{row.feature}</span>
                          {row.note && (
                            <p className="text-xs text-slate-600 mt-0.5 max-w-xs leading-relaxed">{row.note}</p>
                          )}
                        </td>
                        <td className="text-center px-4 sm:px-6 py-4">
                          {row.scout ? <CheckIcon /> : <DashIcon />}
                        </td>
                        <td className="text-center px-4 sm:px-6 py-4">
                          {row.salesnav ? <CheckIcon /> : <DashIcon />}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* The real distinction */}
          <div className="bg-[#0f1117] border border-slate-800 rounded-xl p-6 sm:p-8 mb-12">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-6">Where Sales Navigator falls short</h2>
            <div className="space-y-5 text-slate-300 text-sm sm:text-base leading-relaxed">
              <p>
                Sales Navigator is LinkedIn's own prospecting database. It's excellent at what it does: filtering millions of professionals by title, company, geography, and seniority. If you're building outbound sequences or running high-volume InMail campaigns, it has a place in your stack.
              </p>
              <p>
                The problem is what happens after you've built your prospect list. Sales Navigator saves the lead and goes quiet. There's no monitoring system, no signal detection, no way to know that your best prospect just posted "we're evaluating vendors for Q3 and our current solution isn't cutting it." You have to discover that yourself — manually scrolling a chaotic LinkedIn feed — or you miss it entirely.
              </p>
              <p>
                That moment? That's the window. A prospect publicly stating their problem is a warm conversation waiting to happen. Scout catches it within hours of the post going live, scores it against your ICP, tells you exactly why it matters, and generates a comment that sounds like you — not like a template from a sales tool.
              </p>
              <p>
                The sellers who build warm pipeline on LinkedIn aren't better at cold outreach. They show up consistently in the right conversations. Scout makes that consistent presence automatic.
              </p>
            </div>
          </div>

          {/* What Scout does that nothing else does */}
          <div className="mb-14">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-6 text-center">What Scout does that Sales Navigator can't</h2>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                {
                  icon: (
                    <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  ),
                  title: 'AI scoring that filters the noise',
                  body: 'Every post your prospects publish gets a 1–10 ICP relevance score with a reason. Your best 3 opportunities surface at the top. You never wade through 50 irrelevant posts again.',
                },
                {
                  icon: (
                    <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                  ),
                  title: 'Comment starters in your voice',
                  body: 'AI-written, personalized to the post, your ICP, and the score rationale. Short, natural, nothing like a template. Paste and post in under 10 seconds.',
                },
                {
                  icon: (
                    <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                  ),
                  title: 'Keyword monitoring for intent signals',
                  body: 'Track phrases your buyers post — not just who they are. Get alerted the same day someone mentions the exact problem you solve. Sales Navigator has no equivalent.',
                },
              ].map((card, i) => (
                <div key={i} className="bg-[#0f1117] border border-slate-800/80 rounded-xl p-5">
                  <div className="mb-3">{card.icon}</div>
                  <p className="text-sm font-semibold text-white mb-2">{card.title}</p>
                  <p className="text-xs text-slate-500 leading-relaxed">{card.body}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Pricing context */}
          <div className="bg-[#0f1117] border border-emerald-500/20 rounded-xl p-5 sm:p-6 mb-12">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-white text-sm mb-1">Scout starts at $49/mo. Sales Navigator starts at $99/mo.</p>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Even if you use both, Scout pays for itself the first time a prospect reaches out because they already recognize your name from consistent, relevant comments. That's a different outcome than InMail — and it compounds every week you stay consistent.
                </p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="text-center">
            <a
              href={CHECKOUT_URL}
              className="inline-flex items-center justify-center gap-2 bg-[#4F6BFF] hover:bg-[#3D57F5] text-white font-semibold px-8 py-4 rounded-xl text-base sm:text-lg transition-all hover:scale-[1.02] shadow-xl shadow-[#4F6BFF]/25 mb-4 w-full sm:w-auto whitespace-nowrap"
            >
              Try Scout Free for 7 Days
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
            <Link href="/" className="text-slate-600 hover:text-slate-400 text-sm transition-colors">Home</Link>
            <Link href="/sign-in" className="text-slate-600 hover:text-slate-400 text-sm transition-colors">Sign In</Link>
            <a href="mailto:info@clientbloom.ai" className="text-slate-600 hover:text-slate-400 text-sm transition-colors">Contact</a>
            <span className="text-slate-700 text-sm">© 2026 ClientBloom.ai</span>
          </div>
        </div>
      </footer>

    </div>
  )
}
