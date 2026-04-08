/**
 * Scout vs. Extrovert Comparison Page
 * Server-rendered for SEO
 */

import { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: "Scout vs. Extrovert: Which LinkedIn Engagement Tool Is Right for You? (2026)",
  description: "Comparing Scout and Extrovert for LinkedIn relationship building. See which tool wins on AI scoring, keyword monitoring, agency features, and price.",
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

export default function ComparePage() {
  const CHECKOUT_URL = '/sign-up'

  const features = [
    { feature: 'AI post scoring (1–10 by ICP relevance)', scout: true, extrovert: false },
    { feature: 'Keyword monitoring (track topics, not just people)', scout: true, extrovert: false },
    { feature: 'Profile / prospect monitoring', scout: true, extrovert: true },
    { feature: 'Custom scoring prompts per account', scout: true, extrovert: false },
    { feature: 'Agency plan (5 seats, extended limits)', scout: true, extrovert: false },
    { feature: 'AI-generated comment starters', scout: true, extrovert: true },
    { feature: 'CRM integrations', scout: true, extrovert: true },
    { feature: 'Pricing', scout: false, extrovert: false },
    { feature: 'Free trial', scout: false, extrovert: false },
    { feature: 'Platforms', scout: false, extrovert: false },
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
          <div className="flex items-center gap-4">
            <a href={CHECKOUT_URL} className="bg-[#4F6BFF] hover:bg-[#3D57F5] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              Start Free Trial
            </a>
          </div>
        </div>
      </nav>

      <div className="pt-32 pb-24 px-6">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-16">
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">Scout vs. Extrovert</h1>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto">
              Both tools help you build LinkedIn relationships before you pitch. Here's what separates them.
            </p>
          </div>

          {/* Comparison Table */}
          <div className="bg-[#0f1117] border border-slate-800 rounded-xl overflow-hidden mb-12">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left px-6 py-4 font-semibold text-white">Feature</th>
                    <th className="text-center px-6 py-4 font-semibold text-white">Scout</th>
                    <th className="text-center px-6 py-4 font-semibold text-white">Extrovert</th>
                  </tr>
                </thead>
                <tbody>
                  {features.map((row, i) => {
                    if (row.feature === 'Pricing') {
                      return (
                        <tr key={i} className={`border-b border-slate-800 ${i % 2 ? 'bg-[#0a0c10]' : ''}`}>
                          <td className="px-6 py-4 text-slate-300">{row.feature}</td>
                          <td className="text-center px-6 py-4 text-slate-300 font-medium">from $49/month</td>
                          <td className="text-center px-6 py-4 text-slate-300 font-medium">$75–$99/month</td>
                        </tr>
                      )
                    } else if (row.feature === 'Free trial') {
                      return (
                        <tr key={i} className={`border-b border-slate-800 ${i % 2 ? 'bg-[#0a0c10]' : ''}`}>
                          <td className="px-6 py-4 text-slate-300">{row.feature}</td>
                          <td className="text-center px-6 py-4 text-slate-300 font-medium">7 days</td>
                          <td className="text-center px-6 py-4 text-slate-300 font-medium">14 days</td>
                        </tr>
                      )
                    } else if (row.feature === 'Platforms') {
                      return (
                        <tr key={i} className={i % 2 ? 'bg-[#0a0c10]' : ''}>
                          <td className="px-6 py-4 text-slate-300">{row.feature}</td>
                          <td className="text-center px-6 py-4 text-slate-300 font-medium">LinkedIn</td>
                          <td className="text-center px-6 py-4 text-slate-300 font-medium">LinkedIn</td>
                        </tr>
                      )
                    } else {
                      return (
                        <tr key={i} className={`border-b border-slate-800 ${i % 2 ? 'bg-[#0a0c10]' : ''}`}>
                          <td className="px-6 py-4 text-slate-300">{row.feature}</td>
                          <td className="text-center px-6 py-4">
                            {row.scout ? (
                              <span className="text-emerald-400 text-2xl">✓</span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="text-center px-6 py-4">
                            {row.extrovert ? (
                              <span className="text-emerald-400 text-2xl">✓</span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    }
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-[#0f1117] border border-slate-800 rounded-xl p-8 mb-12">
            <h2 className="text-2xl font-bold text-white mb-6">Why the difference matters</h2>
            
            <div className="space-y-6 text-slate-300 text-base leading-relaxed">
              <p>
                Both Scout and Extrovert are built for relationship-led outreach on LinkedIn — showing up in your prospects' feeds before you ever pitch. The core difference is intelligence. Extrovert surfaces LinkedIn activity. Scout tells you which activity actually matters.
              </p>

              <p>
                Scout's AI scoring layer reads each post through the lens of your ideal customer profile and gives it a 1–10 relevance score with a reason. Instead of reading through 50 posts each morning, you see your top 3 opportunities — ranked, explained, and ready for action.
              </p>

              <p>
                Extrovert doesn't monitor keywords. If a prospect posts about exactly the problem you solve, Extrovert shows you the post. Scout flags it as a 10/10 and tells you why it's your best opportunity this week.
              </p>

              <p>
                If you run an agency or manage LinkedIn outreach for multiple clients, Scout is the only option built for that model. Extrovert is a single-account tool.
              </p>
            </div>
          </div>

          {/* CTA */}
          <div className="text-center">
            <a
              href={CHECKOUT_URL}
              className="inline-flex items-center gap-2 bg-[#4F6BFF] hover:bg-[#3D57F5] text-white font-semibold px-10 py-5 rounded-xl text-lg transition-all hover:scale-[1.02] shadow-xl shadow-[#4F6BFF]/25 mb-4"
            >
              Start 14-Day Free Trial
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </a>
            <p className="text-slate-500 text-sm">No credit card required. Set up in 10 minutes.</p>
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
