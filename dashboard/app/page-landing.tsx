/**
 * Scout by ClientBloom — Sales Landing Page
 * Publicly accessible. Shown to unauthenticated visitors at the root URL.
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'

const CHECKOUT_URL = '/api/checkout' // Stripe checkout redirect

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
  const [faqOpen, setFaqOpen] = useState<number | null>(null)

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
        <div className="max-w-4xl mx-auto text-center">

          <div className="inline-flex items-center gap-2 bg-[#4F6BFF]/10 border border-[#4F6BFF]/20 rounded-full px-4 py-1.5 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4F6BFF] animate-pulse" />
            <span className="text-[#4F6BFF] text-xs font-medium tracking-wide uppercase">LinkedIn Relationship Intelligence</span>
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-[1.08] tracking-tight mb-6">
            Your next client is on<br />
            LinkedIn right now.<br />
            <span className="text-[#4F6BFF]">Scout puts you in front of them.</span>
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
                <h3 className="text-white font-semibold mb-2">{item.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 bg-gradient-to-r from-[#4F6BFF]/10 to-transparent border border-[#4F6BFF]/20 rounded-2xl p-8">
            <p className="text-slate-300 text-lg leading-relaxed">
              Here's what actually drives inbound from LinkedIn. It's not volume of cold messages. It's recognizability — showing up in the right conversations often enough that when someone needs what you do, you're the first name they think of. Scout builds that surface area for you, automatically, every single day.
              <br /><br />
              <span className="text-white font-bold">That's the compounding advantage manual scrolling will never give you.</span>
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
                title: 'Tell Scout who you want to be visible to',
                body: 'Add the LinkedIn profiles of specific people you want to build relationships with, plus keyword terms around topics your ICP discusses. Scout watches their activity continuously — not for pain signals, but for any moment worth showing up in.',
                detail: 'Configure once. Scout watches permanently.'
              },
              {
                step: '02',
                title: 'AI scores every post and writes your opener',
                body: 'Scout runs twice daily, pulling posts from your sources. Each one gets a 1–10 conversation score, a reason it\'s worth your time, and a ready-to-paste comment written in first person from your business perspective. Not a template. The actual words — tuned to the specific post and your voice.',
                detail: 'Only the highest-opportunity posts surface in your feed.'
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

      {/* ─── COMMENT GENERATION ─── */}
      <section className="py-24 px-6 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-emerald-400 text-xs font-medium tracking-wide uppercase">The part that saves you</span>
            </div>
            <h2 className="text-4xl font-bold text-white mb-4">Not just what to read.<br />Exactly what to say.</h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">Spotting the right post is step one. Knowing how to respond — in your voice, from your angle, in a way that makes them want to know who you are — is where most people freeze. Scout handles that part too.</p>
          </div>

          {/* Demo card */}
          <div className="bg-[#0f1117] border border-slate-800 rounded-2xl overflow-hidden mb-12">
            {/* Post */}
            <div className="p-6 border-b border-slate-800">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#4F6BFF]/30 to-[#1a2235] flex items-center justify-center text-xs font-bold text-[#4F6BFF]">SK</div>
                <div>
                  <div className="text-white text-sm font-medium">Sarah K.</div>
                  <div className="text-slate-500 text-xs">VP of Sales · LinkedIn</div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-[11px] font-bold text-emerald-400 bg-emerald-900/30 border border-emerald-800/40 px-2 py-0.5 rounded-md">9/10</span>
                  <span className="text-[10px] text-slate-500 bg-slate-800/60 px-2 py-0.5 rounded">LinkedIn ICP</span>
                </div>
              </div>
              <p className="text-slate-300 text-sm leading-relaxed">Three consultants pitched us this week on AI tools. Different packaging, same promises. How do you actually evaluate vendors when everyone sounds identical and every case study looks the same?</p>
            </div>

            {/* Suggested comment */}
            <div className="p-6 bg-[#0b0e18]">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-3.5 h-3.5 text-[#4F6BFF]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                <span className="text-[#4F6BFF] text-xs font-medium">Suggested comment — ready to paste</span>
                <button className="ml-auto text-slate-500 hover:text-slate-300 text-xs flex items-center gap-1 transition-colors">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  Copy
                </button>
              </div>
              <p className="text-slate-200 text-sm leading-relaxed italic">
                "We started asking vendors to show us one thing that went wrong on a client account and exactly how they handled it. Filters out most of the pitch decks pretty fast. What does the biggest gap look like between what they're promising and what you actually need?"
              </p>
              <p className="text-slate-600 text-xs mt-3">Tuned to your business profile. Sounds human. No em-dashes. No marketing speak.</p>
            </div>
          </div>

          {/* Three pillars */}
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: '🎯',
                title: 'Written from your angle',
                body: 'Scout knows your business, your industry, and the clients you serve. Every suggested comment is written from that lens — not generic. Not templated. Yours.'
              },
              {
                icon: '🤝',
                title: 'Sounds like a person, not a pitch',
                body: 'Scout strips out every AI tell: no em-dashes, no "at the end of the day," no "I completely understand your situation." Comments read like something you actually typed. Because that\'s what gets replies.'
              },
              {
                icon: '⚡',
                title: 'One click from conversation',
                body: 'Copy the comment. Open the post. Paste and post. The whole workflow from spotting an opportunity to being in the conversation takes under 60 seconds.'
              }
            ].map((item, i) => (
              <div key={i} className="bg-[#0f1117] border border-slate-800 rounded-xl p-6 hover:border-slate-700 transition-colors">
                <div className="text-3xl mb-4">{item.icon}</div>
                <h3 className="text-white font-semibold mb-2">{item.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{item.body}</p>
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
              { icon: '💬', title: 'Ready-to-Paste Comment Starters', desc: 'Every post comes with a suggested comment written in first person from your business angle. No pitch. No AI speak. Just a natural opener you can post immediately.' },
              { icon: '👤', title: 'ICP Profile Monitoring', desc: 'Add specific LinkedIn profiles you\'re tracking. Scout watches their activity and surfaces high-signal posts from people already on your radar.' },
              { icon: '📝', title: 'Engagement Workflow', desc: 'Notes with timestamps. Status tracking (New → Engaged → Replied). A full history of every conversation you\'ve been in.' },
              { icon: '🔗', title: 'CRM Integration', desc: 'One click pushes a contact and your notes to GoHighLevel or HubSpot. No switching tabs. No copy-paste. The context goes with them.' },
              { icon: '📡', title: 'Slack Daily Digest', desc: 'Each morning, the highest-opportunity posts land in your Slack. You know what\'s worth your attention before you open a browser.' },
              { icon: '🤖', title: 'ICP Discovery Engine', desc: 'Drop in a job title and keywords. Scout finds matching LinkedIn profiles automatically and adds them to your monitoring list.' },
              { icon: '📊', title: 'Source Management', desc: 'Full control over which LinkedIn search terms and ICP profiles Scout monitors. Add, pause, or remove anytime.' },
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
              { title: 'Marketing Agencies', desc: 'Your potential clients are on LinkedIn every day — discussing strategy, sharing lessons, asking questions. Scout surfaces those moments and puts the right response in your hands before anyone else shows up.' },
              { title: 'Coaches & Consultants', desc: 'Your business runs on trust and recognizability. Scout builds both — consistently putting you in conversations with exactly the right people until they know your name before you ever pitch them.' },
              { title: 'B2B Service Providers', desc: 'If your business runs on long-term client relationships and referrals, Scout is the front of your pipeline. It fills the top with warm, pre-qualified conversations — not cold introductions.' },
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
                  'Your clients aren\'t active on LinkedIn',
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
                'Ready-to-paste comment starters',
                'LinkedIn ICP & keyword monitoring',
                'ICP profile tracking',
                'Engagement workflow with notes',
                'GoHighLevel + HubSpot sync',
                'Daily Slack digest',
                'ICP auto-discovery',
                'Custom AI scoring prompts',
                'Full Scout feed access',
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
            <p className="text-slate-600 text-xs mt-3">No setup required. Your Scout feed is live in minutes.</p>
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
