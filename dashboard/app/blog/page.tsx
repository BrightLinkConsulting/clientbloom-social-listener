/**
 * Blog Index Page
 * Server-rendered for SEO
 */

import { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: "Scout Blog — LinkedIn Relationship Intelligence Insights",
  description: "Tactical guides on LinkedIn relationship building, warm outreach, and AI-powered prospect engagement from the Scout team.",
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

export default function BlogPage() {
  const CHECKOUT_URL = '/sign-up'

  const articles = [
    {
      title: 'How to Warm Up LinkedIn Prospects Before You Pitch (The Relationship-First Method)',
      excerpt: 'The relationship-first outreach method that gets 2-3x higher reply rates than cold LinkedIn messages — and how to scale it with AI monitoring.',
      url: '/blog/warm-up-linkedin-prospects',
      date: '2026-04-06',
      readTime: '5 min read'
    }
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
          <div className="mb-16">
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">Scout Blog</h1>
            <p className="text-xl text-slate-400">Tactical guides on LinkedIn relationship building, warm outreach, and AI-powered prospect engagement.</p>
          </div>

          {/* Articles Grid */}
          <div className="space-y-8">
            {articles.map((article, i) => (
              <Link key={i} href={article.url}>
                <div className="bg-[#0f1117] border border-slate-800 rounded-xl p-8 hover:border-[#4F6BFF]/50 hover:bg-[#1a1e2e] transition-all cursor-pointer">
                  <div className="flex items-start justify-between mb-4">
                    <h2 className="text-2xl font-bold text-white flex-1 pr-4">{article.title}</h2>
                  </div>
                  <p className="text-slate-400 text-base leading-relaxed mb-4">{article.excerpt}</p>
                  <div className="flex items-center gap-4 text-slate-500 text-sm">
                    <span>{new Date(article.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                    <span>•</span>
                    <span>{article.readTime}</span>
                  </div>
                </div>
              </Link>
            ))}
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
