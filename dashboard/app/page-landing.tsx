/**
 * Scout by ClientBloom — Sales Landing Page
 * Publicly accessible. Shown to unauthenticated visitors at the root URL.
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'

const CHECKOUT_URL = '/api/checkout' // Stripe checkout redirect

export default function LandingPage() {
  const [faqOpen, setFaqOpen] = useState<number | null>(null)

  return (
    <div className="min-h-screen bg-[#080a0f] text-slate-200 font-sans">

      {/* ─── NAV ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#080a0f]/90 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#4F6BFF] flex items-center justify-center text-white font-bold text-xs">CB</div>
            <span className="text-white font-semibold tracking-tight">Scout <span className="text-slate-500 font-normal text-sm">by ClientBloom</span></span>
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
        <div className="max-w-4xl mx-auto text-center">

          <div className="inline-flex items-center gap-2 bg-[#4F6BFF]/10 border border-[#4F6BFF]/20 rounded-full px-4 py-1.5 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4F6BFF] animate-pulse" />
            <span className="text-[#4F6BFF] text-xs font-medium tracking-wide uppercase">AI-Powered Prospect Intelligence</span>
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-[1.08] tracking-tight mb-6">
            Your ideal clients are<br />
            posting about their<br />
            <span className="text-[#4F6BFF]">problems right now.</span>
          </h1>

          <p className="text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed mb-10">
            Scout monitors LinkedIn and Facebook for your exact ICPs —
            then AI scores every post so you know who to engage, what to say,
            and when to show up. Before your competitors even see it.
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
                { score: 9, platform: 'LinkedIn', name: 'Jennifer R.', title: 'Agency Owner', text: 'Spending 3+ hours a week manually reviewing client accounts. Has to be a better way. Anyone using AI for this?', tag: 'Pain Signal', tagColor: 'text-red-400 bg-red-400/10' },
                { score: 8, platform: 'Facebook', name: 'Marcus T.', title: 'Marketing Consultant', text: 'My team keeps dropping the ball on client onboarding. Third time this quarter. Considering switching our entire ops stack.', tag: 'Decision Mode', tagColor: 'text-amber-400 bg-amber-400/10' },
                { score: 7, platform: 'LinkedIn', name: 'Sarah K.', title: 'Business Coach', text: 'Lost two clients this month I thought were happy. Zero warning signs. How are you actually tracking client health?', tag: 'Retention Pain', tagColor: 'text-orange-400 bg-orange-400/10' },
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
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">Every day, your ideal clients are posting about the exact problems you solve. On LinkedIn. In Facebook groups. Public and visible — but invisible to you because there's no system watching.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: '🔎',
                title: 'You\'re missing buying signals',
                body: 'When someone posts "I\'m overwhelmed with client work and need a system" — that\'s an invitation. It expires in 24 hours. Manual scrolling catches maybe 5% of them.'
              },
              {
                icon: '⏰',
                title: 'Timing is everything in social selling',
                body: 'The first credible, helpful voice in a conversation wins. Your competitors aren\'t faster because they\'re smarter — they just have a system. You don\'t. Yet.'
              },
              {
                icon: '📊',
                title: 'No system means no consistency',
                body: 'You engage when you remember. You forget to follow up. You have no record of who said what, when. Every week starts from zero.'
              }
            ].map((item, i) => (
              <div key={i} className="bg-[#0f1117] border border-slate-800 rounded-xl p-6">
                <div className="text-3xl mb-4">{item.icon}</div>
                <h3 className="text-white font-semibold mb-2">{item.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 bg-gradient-to-r from-[#4F6BFF]/10 to-transparent border border-[#4F6BFF]/20 rounded-2xl p-8">
            <p className="text-slate-300 text-lg leading-relaxed">
              Here's the math nobody talks about. If your average client is worth $3,000–$10,000 — and you're missing 10–15 high-signal conversations a week — that's conservatively
              <span className="text-white font-bold"> $150,000–$500,000 in pipeline you're walking past.</span>
              <br /><br />
              Not because the opportunity wasn't there. Because you didn't have eyes on it.
            </p>
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section id="how-it-works" className="py-24 px-6 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Your market intelligence,<br />automated.</h2>
            <p className="text-slate-400 text-lg max-w-xl mx-auto">Scout runs in the background — no scrolling, no setup, no maintenance. You wake up to a curated list of conversations worth joining.</p>
          </div>

          <div className="space-y-4">
            {[
              {
                step: '01',
                title: 'Tell Scout who you\'re looking for',
                body: 'Add your LinkedIn search terms and Facebook groups. If you sell to marketing agency owners, Scout watches where they hang out. Takes five minutes.',
                detail: 'Configure once. Scout watches permanently.'
              },
              {
                step: '02',
                title: 'AI scores every post for engagement opportunity',
                body: 'Scout runs twice daily, pulling posts from your sources. Each one gets a 1–10 relevance score and a reason — "agency owner describing exact pain point you solve" — so you know exactly why it\'s worth your time.',
                detail: 'Only the highest-opportunity posts surface in your inbox.'
              },
              {
                step: '03',
                title: 'Your intelligence feed stays organized',
                body: 'Posts flow into a clean feed — sorted by score, filtered by platform, tagged by status. New, Engaged, Replied, Archived. You can see every conversation you\'re in at a glance.',
                detail: 'It\'s a social feed, built for actual sales intent.'
              },
              {
                step: '04',
                title: 'Take notes, track status, push to your CRM',
                body: 'Write notes on any post. Track whether you engaged, got a reply, or moved to a call. One click sends the contact and your notes straight into GoHighLevel or HubSpot.',
                detail: 'No more copy-pasting. No more context lost between tabs.'
              }
            ].map((item, i) => (
              <div key={i} className="flex gap-6 bg-[#0f1117] border border-slate-800 rounded-xl p-6 hover:border-slate-700 transition-colors">
                <div className="text-4xl font-bold text-slate-800 flex-shrink-0 w-10 text-right">{item.step}</div>
                <div>
                  <h3 className="text-white font-semibold text-lg mb-2">{item.title}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed mb-2">{item.body}</p>
                  <p className="text-[#4F6BFF] text-xs font-medium">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section className="py-24 px-6 border-t border-slate-800/50 bg-[#0a0c10]">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Everything included.<br />Nothing to configure.</h2>
            <p className="text-slate-400 text-lg max-w-xl mx-auto">Scout is a complete system, not a raw data tool. It's already set up to work.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {[
              { icon: '🎯', title: 'AI-Scored Intelligence Feed', desc: 'Every post gets a 1–10 engagement opportunity score with reasoning. You see why it matters, not just that it does.' },
              { icon: '👤', title: 'ICP Profile Monitoring', desc: 'Add specific LinkedIn profiles you\'re tracking. Scout watches their activity and surfaces high-signal posts from people already on your radar.' },
              { icon: '📝', title: 'Engagement Workflow', desc: 'Notes with timestamps. Status tracking (New → Engaged → Replied). A full history of every conversation you\'ve been in.' },
              { icon: '🔗', title: 'CRM Integration', desc: 'One click pushes a contact and your notes to GoHighLevel or HubSpot. No switching tabs. No copy-paste. The context goes with them.' },
              { icon: '📡', title: 'Slack Daily Digest', desc: 'Each morning, the highest-opportunity posts land in your Slack. You know what\'s worth your attention before you open a browser.' },
              { icon: '🤖', title: 'ICP Discovery Engine', desc: 'Drop in a job title and keywords. Scout finds matching LinkedIn profiles automatically and adds them to your monitoring list.' },
              { icon: '📊', title: 'Source Management', desc: 'Full control over which LinkedIn search terms and Facebook groups Scout watches. Add, pause, or remove anytime.' },
              { icon: '⚙️', title: 'Custom AI Scoring Prompt', desc: 'Train the scoring AI on your specific ICP. Tell it exactly what a high-value post looks like for your business. It learns your criteria.' },
            ].map((f, i) => (
              <div key={i} className="bg-[#0f1117] border border-slate-800 rounded-xl p-5 flex gap-4 hover:border-slate-700 transition-colors">
                <span className="text-2xl flex-shrink-0">{f.icon}</span>
                <div>
                  <h3 className="text-white font-medium mb-1">{f.title}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── WHO IT'S FOR ─── */}
      <section className="py-24 px-6 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Built for operators<br />who sell on relationships.</h2>
            <p className="text-slate-400 text-lg max-w-xl mx-auto">Scout is for service businesses where one client conversation can mean $5,000–$50,000. Not vanity metrics. Real revenue conversations.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { title: 'Marketing Agencies', desc: 'Your potential clients are complaining about ad performance, bad agencies, and wasted budgets. In public. Daily. Scout finds them the moment they say it.' },
              { title: 'Coaches & Consultants', desc: 'Your ICPs describe the exact transformation you offer — in words you could have written yourself — and nobody from your world is in the conversation. Scout puts you there first.' },
              { title: 'B2B Service Providers', desc: 'If your business runs on long-term client relationships and referrals, Scout is the front of your pipeline. It fills the top with warm, pre-qualified conversations.' },
            ].map((item, i) => (
              <div key={i} className="bg-[#0f1117] border border-slate-800 rounded-xl p-6 hover:border-[#4F6BFF]/30 transition-colors">
                <h3 className="text-white font-semibold text-lg mb-3">{item.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 grid md:grid-cols-2 gap-6">
            <div className="bg-[#0f1117] border border-emerald-800/30 rounded-xl p-6">
              <h4 className="text-emerald-400 font-semibold mb-3 text-sm uppercase tracking-wide">Scout is for you if:</h4>
              <ul className="space-y-2">
                {[
                  'You close 1–5 new clients per month',
                  'Your average client value is $2,000+',
                  'You sell a service, not a product',
                  'Your business runs on relationships and trust',
                  'You want a system that works while you sleep'
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-slate-300 text-sm">
                    <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-[#0f1117] border border-slate-800 rounded-xl p-6">
              <h4 className="text-slate-500 font-semibold mb-3 text-sm uppercase tracking-wide">Scout is probably not for you if:</h4>
              <ul className="space-y-2">
                {[
                  'You sell physical or digital products',
                  'You\'re looking for a generic content scheduler',
                  'Your clients don\'t use LinkedIn or Facebook',
                  'You want vanity metrics, not real pipeline',
                  'You close 100+ clients a month at low ticket'
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-slate-500 text-sm">
                    <svg className="w-4 h-4 text-slate-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ─── PRICING ─── */}
      <section id="pricing" className="py-24 px-6 border-t border-slate-800/50 bg-[#0a0c10]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-4">One plan. Everything included.</h2>
          <p className="text-slate-400 text-lg mb-12">No tiers to confuse you. No features locked behind paywalls. Everything Scout does is available from day one.</p>

          <div className="bg-[#0f1117] border border-[#4F6BFF]/30 rounded-2xl p-8 shadow-xl shadow-[#4F6BFF]/5">
            <div className="text-slate-400 text-sm font-medium uppercase tracking-wide mb-2">Scout by ClientBloom</div>
            <div className="flex items-end justify-center gap-2 mb-2">
              <span className="text-6xl font-bold text-white">$79</span>
              <span className="text-slate-400 text-lg mb-2">/month</span>
            </div>
            <p className="text-slate-500 text-sm mb-8">Billed monthly. Cancel anytime.</p>

            <ul className="text-left space-y-3 mb-8 max-w-xs mx-auto">
              {[
                'AI-scored intelligence feed',
                'LinkedIn + Facebook monitoring',
                'ICP profile tracking',
                'Engagement workflow with notes',
                'GoHighLevel + HubSpot sync',
                'Daily Slack digest',
                'ICP auto-discovery',
                'Custom AI scoring prompts',
                'Full dashboard access',
                'Fully managed — zero infrastructure',
              ].map((feature, i) => (
                <li key={i} className="flex items-center gap-3 text-slate-300 text-sm">
                  <svg className="w-4 h-4 text-[#4F6BFF] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  {feature}
                </li>
              ))}
            </ul>

            <a
              href={CHECKOUT_URL}
              className="block w-full bg-[#4F6BFF] hover:bg-[#3D57F5] text-white font-semibold py-4 rounded-xl text-center transition-all hover:scale-[1.01] shadow-lg shadow-[#4F6BFF]/25"
            >
              Get Scout — Start Today
            </a>
            <p className="text-slate-600 text-xs mt-3">No setup required. Your dashboard is ready in minutes.</p>
          </div>

          <div className="mt-8 grid grid-cols-3 gap-4 text-center">
            {[
              { label: 'Setup time', value: 'Under 10 min' },
              { label: 'Contract', value: 'None' },
              { label: 'Guarantee', value: 'Cancel anytime' },
            ].map((item, i) => (
              <div key={i} className="bg-[#0f1117] border border-slate-800 rounded-xl p-4">
                <div className="text-white font-semibold text-sm">{item.value}</div>
                <div className="text-slate-500 text-xs mt-0.5">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="py-24 px-6 border-t border-slate-800/50">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-4xl font-bold text-white text-center mb-12">Straight answers.</h2>

          <div className="space-y-3">
            {[
              {
                q: 'Do I need to set up Airtable, Railway, or any technical infrastructure?',
                a: 'No. Scout is fully managed — we handle every piece of infrastructure on our end. You log in, configure your sources and ICP, and start receiving intelligence. No accounts to create, no APIs to configure, no engineers needed.'
              },
              {
                q: 'How does Scout actually find the posts?',
                a: 'Scout\'s backend agent runs twice daily, scanning your configured LinkedIn search terms and Facebook groups using dedicated APIs. Results are AI-scored for engagement opportunity and delivered to your dashboard. The whole process is automated.'
              },
              {
                q: 'What does the AI scoring actually mean?',
                a: 'Every post gets a 1–10 relevance score based on how strong of an engagement opportunity it represents for your specific business. A 9–10 means someone is describing an exact pain point or situation where you can add clear, genuine value. A 5–6 is possible but tangential. Anything below 5 doesn\'t show up.'
              },
              {
                q: 'Can I connect my CRM?',
                a: 'Yes. Scout natively integrates with GoHighLevel and HubSpot. When you find a prospect worth pursuing, one click creates a contact in your CRM and attaches your notes. No copy-paste, no context lost.'
              },
              {
                q: 'How is this different from just searching LinkedIn manually?',
                a: 'Manual searching catches maybe 5–10% of relevant conversations — the ones that happen to appear when you happen to be scrolling. Scout watches your sources 24/7 and surfaces everything, sorted by opportunity. It\'s also persistent: you have a searchable record of every conversation, not a disappearing feed.'
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
              }
            ].map((item, i) => (
              <div key={i} className="bg-[#0f1117] border border-slate-800 rounded-xl overflow-hidden">
                <button
                  className="w-full text-left px-6 py-4 flex items-center justify-between gap-4"
                  onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                >
                  <span className="text-white font-medium text-sm">{item.q}</span>
                  <svg
                    className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${faqOpen === i ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {faqOpen === i && (
                  <div className="px-6 pb-5 border-t border-slate-800/50">
                    <p className="text-slate-400 text-sm leading-relaxed pt-4">{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FINAL CTA ─── */}
      <section className="py-24 px-6 border-t border-slate-800/50 bg-gradient-to-b from-[#0a0c10] to-[#0d1020]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-5xl font-bold text-white mb-6 leading-tight">
            The conversations are<br />already happening.
          </h2>
          <p className="text-slate-400 text-xl mb-4">
            Your ideal clients are posting about their problems, their frustrations, and their search for a solution — right now, today, in public.
          </p>
          <p className="text-slate-300 text-xl mb-10">
            Scout puts you in those conversations. At $79/month, it pays for itself the first time you close a client who came in through a social engagement instead of a cold outreach.
          </p>

          <a
            href={CHECKOUT_URL}
            className="inline-flex items-center gap-2 bg-[#4F6BFF] hover:bg-[#3D57F5] text-white font-semibold px-10 py-5 rounded-xl text-lg transition-all hover:scale-[1.02] shadow-xl shadow-[#4F6BFF]/25"
          >
            Get Scout — $79/month
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </a>
          <p className="text-slate-600 text-sm mt-4">Setup takes under 10 minutes. Your dashboard is live today.</p>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-slate-800/50 py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-[#4F6BFF] flex items-center justify-center text-white font-bold text-[9px]">CB</div>
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
