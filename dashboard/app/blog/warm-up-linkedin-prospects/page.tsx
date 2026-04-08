/**
 * Blog Article: How to Warm Up LinkedIn Prospects Before You Pitch
 * Server-rendered for SEO
 */

import { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: "How to Warm Up LinkedIn Prospects Before You Pitch",
  description: "The relationship-first outreach method that gets 2-3x higher reply rates than cold LinkedIn messages — and how to scale it with AI monitoring.",
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

export default function ArticlePage() {
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
        <article className="max-w-3xl mx-auto">
          {/* Article Header */}
          <div className="mb-12">
            <div className="flex items-center gap-2 mb-4 text-slate-500 text-sm">
              <span>April 6, 2026</span>
              <span>•</span>
              <span>8 min read</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
              How to Warm Up LinkedIn Prospects Before You Pitch
            </h1>
            <p className="text-xl text-slate-400">
              The relationship-first outreach method that gets 2–3x higher reply rates than cold LinkedIn messages.
            </p>
          </div>

          {/* Article Body */}
          <div className="prose prose-invert max-w-none space-y-6 text-slate-300 text-base leading-relaxed">
            <h2 className="text-3xl font-bold text-white mt-12 mb-6">Cold outreach is broken</h2>
            <p>
              Your LinkedIn message arrives in the inbox of someone you've never met. They don't recognize your name, haven't seen you in their feed, and don't know who you are. So you're competing for attention with thousands of other first-contact messages, most of which are variations of the same pitch.
            </p>
            <p>
              Connection request acceptance rates on LinkedIn have dropped. InMail response rates are declining. Cold email is harder than it was five years ago. The inboxes are full, and the skepticism is high.
            </p>
            <p>
              Here's what changed: attention became scarce. Everyone noticed the gold rush ended.
            </p>

            <h2 className="text-3xl font-bold text-white mt-12 mb-6">The relationship-first model</h2>
            <p>
              The people who close the most deals on LinkedIn aren't the ones with the slickest pitch or the biggest network. They're the ones who show up repeatedly in their prospects' feeds—thoughtfully, consistently, and before they ever ask for anything.
            </p>
            <p>
              When you eventually pitch someone who's seen your comments on posts 12 times, who knows your take on the industry, and who has watched you provide value for months—the answer changes. It's not "who is this?" anymore. It's "oh, I know them."
            </p>
            <p>
              That's the relationship-first model. You build familiarity before you build the ask. And the numbers show it works.
            </p>

            <h2 className="text-3xl font-bold text-white mt-12 mb-6">The three-step framework</h2>
            <p>
              Getting this right requires a system with three distinct phases:
            </p>
            <p className="text-slate-400 italic">
              1. Monitor — Find where your ICP is having conversations. 2. Engage — Show up consistently in those conversations with real value. 3. Warm — By the time you pitch, they already know you exist.
            </p>
            <p>
              Let's break each one down.
            </p>

            <h3 className="text-2xl font-bold text-white mt-10 mb-4">Phase 1: Monitor</h3>
            <p>
              Start by being crystal clear about who you're trying to reach. Not "B2B SaaS founders"—be specific. "B2B SaaS founders who are scaling from 15 to 50 employees, have raised Series A, and are in the GTM phase."
            </p>
            <p>
              Then, identify where those people show up on LinkedIn. Not in their DMs. Not in their inboxes. In their feeds. They're posting updates, commenting on industry takes, sharing wins, asking questions. That's where the conversation is.
            </p>
            <p>
              Manually scrolling through LinkedIn every morning to find these posts is impractical. You'll catch maybe 10% of them. The people who build the deepest relationships have a system—they use keyword monitoring and prospect list monitoring to surface relevant activity automatically.
            </p>

            <h3 className="text-2xl font-bold text-white mt-10 mb-4">Phase 2: Engage</h3>
            <p>
              Once you've identified a relevant post, the engagement needs to be real. No "Great post! Let me know if you want to chat." That's noise.
            </p>
            <p>
              Your comment should:
            </p>
            <ul className="list-disc list-inside space-y-2 text-slate-300">
              <li>Add something of value—an insight, a relevant experience, or a genuinely helpful question</li>
              <li>Be short. One or two sentences, maybe three if you're adding a specific example</li>
              <li>Sound like you, not like you hired an AI to write it</li>
              <li>Open the door for a real conversation without being needy</li>
            </ul>
            <p>
              Consistency matters more than perfection. Showing up in your ICP's feed once a month won't build familiarity. Showing up 2–3 times per week will.
            </p>

            <h3 className="text-2xl font-bold text-white mt-10 mb-4">Phase 3: Warm</h3>
            <p>
              After you've engaged with someone a handful of times—commented on their posts, been in the conversation—the dynamic shifts. They've seen your name repeatedly. They know your point of view. When you finally send a connection request or a message, it reads differently.
            </p>
            <p>
              The pitch still matters. But now you're not asking them to trust you from zero. You're asking them to continue a conversation they've already been having with you.
            </p>

            <h2 className="text-3xl font-bold text-white mt-12 mb-6">The efficiency problem</h2>
            <p>
              The relationship-first model works. But the problem is scale. You can't manually monitor 50 prospects, read all their posts, pick the golden moments, craft thoughtful comments, and stay consistent—while also running your business.
            </p>
            <p>
              Most people try anyway, get overwhelmed, and fall back to cold outreach.
            </p>
            <p>
              That's where AI monitoring changes the equation. If you had a system that:
            </p>
            <ul className="list-disc list-inside space-y-2 text-slate-300">
              <li>Automatically scanned your prospect profiles and keyword searches twice daily</li>
              <li>Scored every post for conversation quality (1–10)</li>
              <li>Generated a comment starter in 10 seconds</li>
              <li>Kept a full history of who you've engaged with and when</li>
            </ul>
            <p>
              ...then the relationship-first model becomes sustainable. You can monitor 100 prospects instead of 10. You can engage consistently without the manual overhead. You can close deals with people who already feel like they know you.
            </p>

            <h2 className="text-3xl font-bold text-white mt-12 mb-6">The numbers</h2>
            <p>
              Here's what we're seeing with teams that implement this framework consistently:
            </p>
            <ul className="list-disc list-inside space-y-2 text-slate-300">
              <li>3–4x higher reply rates than cold LinkedIn messages</li>
              <li>60%+ connection acceptance from monitored prospects (vs. 25–30% from cold)</li>
              <li>Shorter sales cycle—prospects who recognize you already have context</li>
              <li>Higher deal size—when they accept, they come with intent</li>
            </ul>

            <h2 className="text-3xl font-bold text-white mt-12 mb-6">Getting started</h2>
            <p>
              You don't need to build a complex system. You need:
            </p>
            <ol className="list-decimal list-inside space-y-2 text-slate-300">
              <li>A clear definition of your ICP</li>
              <li>2–5 keyword topics that signal buying intent (not just industry keywords)</li>
              <li>10–20 prospect profiles you're willing to monitor</li>
              <li>A daily check-in: scroll through the feed, find 2–3 opportunities, comment</li>
            </ol>
            <p>
              If you can do that manually for one week, you'll see why consistency wins. If you want to scale it to 50–100 prospects without losing your mind, you need the tool layer.
            </p>

            <h2 className="text-3xl font-bold text-white mt-12 mb-6">Why this works</h2>
            <p>
              Cold outreach fails because it ignores a fundamental truth about how people buy: they choose people they already know and trust.
            </p>
            <p>
              The relationship-first model isn't manipulative. You're not trying to trick anyone. You're just showing up in the conversations where your expertise is relevant and adding value. If you do that consistently, the relationships that form are real.
            </p>
            <p>
              And when someone reaches out six months later and says "I've been seeing your comments on LinkedIn for a few months, and I think we should talk"—that's when you know the system works.
            </p>

            <h2 className="text-3xl font-bold text-white mt-12 mb-6">Next steps</h2>
            <p>
              Start small. Pick your top 5 ICP profiles. Choose 2 keyword topics. Commit to scanning LinkedIn daily for 5 minutes. Comment on 2–3 relevant posts per week.
            </p>
            <p>
              Track it. Note who you're engaging with, what posts you commented on, and when. By week 3, you'll start seeing the patterns that work for your specific market.
            </p>
            <p>
              Once you've proven it works at small scale, you can decide whether to scale manually or automate with a tool that does the monitoring and scoring for you.
            </p>
          </div>

          {/* CTA */}
          <div className="mt-16 p-8 bg-[#0f1117] border border-slate-800 rounded-xl text-center">
            <h3 className="text-2xl font-bold text-white mb-4">Ready to scale this to 50+ prospects?</h3>
            <p className="text-slate-400 mb-6">Scout automates the monitoring and scoring layer. See exactly which posts matter, every day.</p>
            <a
              href={CHECKOUT_URL}
              className="inline-flex items-center gap-2 bg-[#4F6BFF] hover:bg-[#3D57F5] text-white font-semibold px-8 py-4 rounded-xl transition-all hover:scale-[1.02] shadow-lg shadow-[#4F6BFF]/25"
            >
              Start 14-Day Free Trial
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </a>
          </div>

          {/* Back link */}
          <div className="mt-8">
            <Link href="/blog" className="text-[#4F6BFF] hover:underline text-sm">
              Back to all articles
            </Link>
          </div>
        </article>
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
