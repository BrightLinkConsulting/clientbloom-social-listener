/**
 * Scout by ClientBloom — Sales Landing Page
 * Server-rendered for SEO, with interactive FAQ in a client component.
 */

import Link from 'next/link'
import { FaqAccordion } from './_components/FaqAccordion'

const CHECKOUT_URL = '/api/checkout'

/** ClientBloom logo mark — SVG recreation of the 5-petal bloom icon */
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

export default function LandingPage() {
  const faqItems = [
    {
      q: 'Do I need to set up Airtable, Railway, or any technical infrastructure?',
      a: 'No. Scout is fully managed — we handle every piece of infrastructure on our end. You log in, configure your sources and ICP, and start receiving intelligence. No accounts to create, no APIs to configure, no engineers needed.'
    },
    {
      q: 'How does Scout actually find the posts?',
      a: 'Scout runs twice daily, scanning your configured LinkedIn search terms and ICP profiles using LinkedIn\'s API. Results are AI-scored for engagement opportunity and delivered to your Scout feed. The whole process is automated — no LinkedIn login, no manual searching.'
    },
    {
      q: 'What does the AI scoring actually mean?',
      a: 'Every post gets a 1–10 conversation score based on how strong of a natural entry point it creates for you. A 9–10 means someone is asking a question, starting a discussion, announcing a milestone, or sharing an opinion you can genuinely add to — and showing up there will be remembered. A 5–6 is tangentially relevant but not compelling. Anything below 5 doesn\'t surface. The score is never about whether someone is in pain — it\'s about whether you can say something worth saying.'
    },
    {
      q: 'Can I connect my CRM?',
      a: 'Yes. Scout natively integrates with GoHighLevel and HubSpot. When you find a prospect worth pursuing, one click creates a contact in your CRM and attaches your notes. No copy-paste, no context lost.'
    },
    {
      q: 'How is this different from just searching LinkedIn manually?',
      a: 'Manual scrolling catches maybe 5–10% of relevant conversations — the ones that happen to surface when you happen to be online. Scout watches your ICP profiles and keyword topics continuously and surfaces everything, sorted by conversation quality. More importantly: it\'s consistent. The people who win on LinkedIn show up repeatedly, not occasionally. Scout makes that consistency automatic. You also keep a full history of every post you\'ve engaged with — something a disappearing feed can\'t give you.'
    },
    {
      q: 'Who built this? Is ClientBloom a real company?',
      a: 'ClientBloom is built by Mike Walker — two-time Amazon #1 bestselling author, 25+ years in client-facing service businesses. Scout grew out of what he built for himself to find and engage with prospects, and it\'s now available as a product. This isn\'t a side project or an experiment — it\'s infrastructure we\'re using ourselves.'
    },
    {
      q: 'What if I want to cancel?',
      a: 'Cancel from your account settings anytime. No notice period, no cancellation fees, no "please call us to cancel." It\'s a monthly subscription — the math is simple.'
    },
    {
      q: 'Can I customize how Scout scores posts?',
      a: 'Yes. Scout uses a default AI scoring prompt, but you can write a custom one that describes exactly what a high-value post looks like for your business. The more specific you are, the sharper the scoring becomes over time.'
    },
    {
      q: 'How does the suggested comment actually work — does it sound like AI?',
      a: 'We spent a lot of time on this. Scout generates comments in first person from your specific business angle, and we\'ve built in hard rules against everything that makes AI writing obvious: no em-dashes, no "at the end of the day," no hollow phrases like "I completely understand your situation." Comments are kept short, casual, and a little imperfect on purpose — because that\'s what reads as human in a LinkedIn comment thread. The goal is something you could paste, post, and nobody would guess it didn\'t come directly from you.'
    }
  ]

  return (
    <div className="min-h-screen bg-[#080a0f] text-slate-200 font-sans">

      {/* ─── NAV ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#080a0f]/90 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ClientBloomMark size={28} />
            <span className="text-white font-bold tracking-tight">Scout <span className="text-slate-400 font-normal text-sm">by ClientBloom</span></span>
          </div>
          <div className="flex items-center gap-4">
            <a href="#how-it-works" className="text-slate-400 hover:text-slate-200 text-sm transition-colors hidden md:block">How it works</a>
            <a href="#pricing" className="text-slate-400 hover:text-slate-200 text-sm transition-colors hidden md:block">Pricing</a>
            <Link href="/sign-in" className="text-slate-400 hover:text-slate-200 text-sm transition-colors">Sign in</Link>
            <a href={CHECKOUT_URL} className="bg-[#4F6BFF] hover:bg-[#3D57F5] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              Start for $79/mo
            </a>
          </div>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section className="pt-32 pb-24 px-6">
        <div className="max-w-5xl mx-auto text-center">

          <div className="inline-flex items-center gap-2 bg-[#4F6BFF]/10 border border-[#4F6BFF]/20 rounded-full px-4 py-1.5 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4F6BFF] animate-pulse" />
            <span className="text-[#4F6BFF] text-xs font-medium tracking-wide uppercase">LinkedIn Relationship Intelligence</span>
          </div>

          <h1 className="font-bold tracking-tight mb-4">
            <span
              className="block text-white leading-[1.05]"
              style={{ fontSize: 'clamp(20px, 7.3vw, 81px)' }}
            >
              Your next client is on
            </span>
            <span
              className="block text-white leading-[1.05]"
              style={{ fontSize: 'clamp(23px, 8.4vw, 94px)' }}
            >
              LinkedIn right now.
            </span>
            <span
              className="block text-[#4F6BFF] whitespace-nowrap leading-[1.2] mt-2"
              style={{ fontSize: 'clamp(14px, 5vw, 56px)' }}
            >
              Scout puts you in front of them.
            </span>
          </h1>

          <p className="text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed mb-10">
            Sales Navigator helps you interrupt the right people. Scout shows up in the conversations your buyers are already having — and hands you the perfect thing to say. Build real relationships before anyone asks you to pitch.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href={CHECKOUT_URL}
              className="inline-flex items-center gap-2 bg-[#4F6BFF] hover:bg-[#3D57F5] text-white font-semibold px-8 py-4 rounded-xl text-base transition-all hover:scale-[1.02] shadow-lg shadow-[#4F6BFF]/25"
            >
              Get Scout — $79/month
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </a>
            <a href="#how-it-works" className="text-slate-400 hover:text-slate-200 text-sm transition-colors flex items-center gap-1.5">
              See how it works
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </a>
          </div>

          <p className="text-slate-600 text-sm mt-6">No contracts. No setup fees. Cancel anytime.</p>

          {/* Mock feed preview */}
          <div className="mt-16 relative">
            <div className="absolute inset-0 bg-gradient-to-t from-[#080a0f] via-transparent to-transparent z-10 pointer-events-none" style={{top: '60%'}} />
            <div className="bg-[#0f1117] border border-slate-800 rounded-2xl p-4 text-left max-w-2xl mx-auto shadow-2xl">
              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-800">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-slate-400">Live intelligence feed — updated twice daily</span>
                <span className="ml-auto text-xs text-[#4F6BFF] font-medium">14 new posts</span>
              </div>
              {[
                { score: 9, platform: 'LinkedIn', name: 'Jennifer R.', title: 'Agency Owner · ICP Profile', text: 'Scaling from 12 to 20 clients this quarter. Mostly excited, a little terrified. Anyone else find the systems that worked at 10 clients completely break at 20?', tag: 'ICP Active', tagColor: 'text-blue-400 bg-blue-400/10' },
                { score: 8, platform: 'LinkedIn', name: 'Marcus T.', title: 'Marketing Consultant', text: 'Hot take: The agencies that survive the next 3 years will be the ones who got proactive about client communication, not reactive. Who\'s doing this well right now?', tag: 'Discussion Starter', tagColor: 'text-amber-400 bg-amber-400/10' },
                { score: 7, platform: 'LinkedIn', name: 'Sarah K.', title: 'VP of Sales', text: 'Three consultants pitched us this week on AI tools. Different packaging, same promises. How do you actually evaluate vendors when everyone sounds identical?', tag: 'Conversation Hook', tagColor: 'text-emerald-400 bg-emerald-400/10' },
              ].map((post, i) => (
                <div key={i} className={`flex gap-3 py-3 ${i < 2 ? 'border-b border-slate-800/50' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                    post.score >= 9 ? 'bg-emerald-900/40 text-emerald-400' :
                    post.score >= 7 ? 'bg-amber-900/40 text-amber-400' :
                    'bg-slate-800 text-slate-400'
                  }`}>{post.score}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-slate-300 text-xs font-medium">{post.name}</span>
                      <span className="text-slate-600 text-xs">·</span>
                      <span className="text-slate-500 text-xs">{post.title}</span>
                      <span className="text-slate-600 text-xs">·</span>
                      <span className="text-slate-600 text-xs">{post.platform}</span>
                      <span className={`ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded ${post.tagColor}`}>{post.tag}</span>
                    </div>
                    <p className="text-slate-400 text-xs leading-relaxed truncate">{post.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── PROBLEM ─── */}
      <section className="py-24 px-6 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">The conversation is happening.<br />You're just not in it.</h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">Your ICP is on LinkedIn every day — posting, discussing, asking questions, sharing opinions. The people who build the deepest relationships show up in those moments consistently. You can't do that manually.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: '🔎',
                title: 'You\'re missing daily entry points',
                body: 'When an ICP posts a question, shares a milestone, or kicks off an industry debate — that\'s a natural opening. It expires in 24 hours. Manual scrolling catches maybe 5% of them.'
              },
              {
                icon: '⏰',
                title: 'Familiarity is built through repetition',
                body: 'Buyers choose people they recognize. The first credible voice that shows up consistently in their feed wins. Your competitors aren\'t smarter — they just have a system. You don\'t. Yet.'
              },
              {
                icon: '📊',
                title: 'No system means no momentum',
                body: 'You engage when you remember. You lose track of who you\'ve already talked to. There\'s no record, no momentum, no sense that it\'s working. Every week starts from zero.'
              }
            ].map((item, i) => (
              <div key={i} className="bg-[#0f1117] border border-slate-800 rounded-xl p-6">
                <div className="text-3xl mb-4">{item.icon}</div>
                <h3 className="text-white font-semibold text-lg mb-2">{item.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section id="how-it-works" className="py-24 px-6 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold text-white text-center mb-16">Three-part system.<br />Just works.</h2>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: '1',
                title: 'Monitor',
                body: 'Tell Scout which LinkedIn profiles, keywords, and topics matter to your ICP. Scout runs twice daily, scanning for all activity matching your criteria.'
              },
              {
                icon: '2',
                title: 'Score',
                body: 'Every post Scout finds gets a 1–10 conversation score. A 9–10 is pure gold — a natural opening that\'ll be remembered. Anything below 5 doesn\'t surface. You see the winners, not the noise.'
              },
              {
                icon: '3',
                title: 'Engage',
                body: 'Scout generates a comment starter in your voice. You edit if you want (takes 10 seconds) or just post it. Either way, you\'re in the right conversation, consistently, every week.'
              }
            ].map((item, i) => (
              <div key={i} className="text-center">
                <div className="w-14 h-14 rounded-full bg-[#4F6BFF]/20 border border-[#4F6BFF]/40 flex items-center justify-center mx-auto mb-6 text-2xl font-bold text-[#4F6BFF]">
                  {item.icon}
                </div>
                <h3 className="text-white font-semibold text-lg mb-3">{item.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── SOCIAL PROOF ─── */}
      <section className="py-24 px-6 border-t border-slate-800/50 bg-gradient-to-b from-[#0a0c10] to-[#0f1117]/50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Trusted by consultants and GTM teams closing warmer, faster</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-12">
            {[
              {
                quote: 'I engaged with 3 prospects this week who were already aware of me from my LinkedIn comments. Two of them booked calls before I ever pitched.',
                author: 'Sarah M.',
                title: 'Fractional CMO'
              },
              {
                quote: 'Scout replaced cold outreach entirely for my firm. I\'m closing deals with people who already feel like they know me.',
                author: 'David K.',
                title: 'B2B Consultant'
              },
              {
                quote: 'My connection acceptance rate jumped in the first two weeks. Being visible before the ask changes everything.',
                author: 'Rachel T.',
                title: 'Agency Owner'
              }
            ].map((item, i) => (
              <div key={i} className="bg-[#0f1117] border border-slate-800 rounded-xl p-8">
                <div className="text-[#4F6BFF] text-3xl mb-4">"</div>
                <p className="text-slate-300 text-base leading-relaxed mb-6 italic">{item.quote}</p>
                <div>
                  <p className="text-white font-semibold text-sm">{item.author}</p>
                  <p className="text-slate-500 text-xs">{item.title}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-3 gap-8 text-center">
            {[
              { stat: '3.2x', label: 'higher reply rates vs. cold outreach' },
              { stat: '60%+', label: 'connection acceptance from monitored prospects' },
              { stat: '14 days', label: 'free trial — see results in your first week' }
            ].map((item, i) => (
              <div key={i}>
                <div className="text-3xl font-bold text-[#4F6BFF] mb-2">{item.stat}</div>
                <p className="text-slate-400 text-sm">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PRICING ─── */}
      <section id="pricing" className="py-24 px-6 border-t border-slate-800/50">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-4">One price. No hidden fees.</h2>
          <p className="text-slate-400 text-lg mb-12">Scout starts at $79 per month for individuals and teams. Everything included. 14-day free trial — no credit card required.</p>

          <div className="bg-[#0f1117] border border-[#4F6BFF]/20 rounded-2xl p-12 text-center mb-6">
            <div className="text-5xl font-bold text-white mb-2">$79<span className="text-xl text-slate-400 font-normal">/month</span></div>
            <p className="text-slate-400 text-sm mb-8">2 monitored topics, 1 monitored persona, unlimited post history.</p>

            <a
              href={CHECKOUT_URL}
              className="inline-flex items-center gap-2 bg-[#4F6BFF] hover:bg-[#3D57F5] text-white font-semibold px-8 py-4 rounded-xl transition-all hover:scale-[1.02] shadow-lg shadow-[#4F6BFF]/25"
            >
              Start 14-Day Free Trial
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </a>

            <div className="mt-8 space-y-3 text-left text-slate-400 text-sm">
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                LinkedIn profile monitoring (2 profiles)
              </div>
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Keyword / topic search monitoring (2 searches)
              </div>
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                AI post scoring (1–10 by ICP relevance)
              </div>
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                AI comment suggestions (customizable)
              </div>
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                CRM integration (GoHighLevel, HubSpot)
              </div>
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Full post history and notes
              </div>
            </div>
          </div>

          <p className="text-slate-500 text-sm">Want to manage Scout for multiple clients? <Link href="/compare" className="text-[#4F6BFF] hover:underline">See our agency plan.</Link></p>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="py-24 px-6 border-t border-slate-800/50">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-4xl font-bold text-white text-center mb-12">Straight answers.</h2>
          <FaqAccordion items={faqItems} />
        </div>
      </section>

      {/* ─── FINAL CTA ─── */}
      <section className="py-24 px-6 border-t border-slate-800/50 bg-gradient-to-b from-[#0a0c10] to-[#0d1020]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-5xl font-bold text-white mb-6 leading-tight">
            The conversations are<br />already happening.
          </h2>
          <p className="text-slate-400 text-xl mb-4">
            Your ideal clients are on LinkedIn every day — posting, discussing, asking, sharing. The ones who win their business aren't the ones who cold pitch the loudest. They're the ones who showed up consistently in the right places.
          </p>
          <p className="text-slate-300 text-xl mb-10">
            Scout automates that presence. At $79/month, it pays for itself the first time a prospect reaches out because they already know who you are.
          </p>

          <a
            href={CHECKOUT_URL}
            className="inline-flex items-center gap-2 bg-[#4F6BFF] hover:bg-[#3D57F5] text-white font-semibold px-10 py-5 rounded-xl text-lg transition-all hover:scale-[1.02] shadow-xl shadow-[#4F6BFF]/25"
          >
            Get Scout — $79/month
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </a>
          <p className="text-slate-600 text-sm mt-4">Setup takes under 10 minutes. Your Scout feed is live today.</p>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
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
