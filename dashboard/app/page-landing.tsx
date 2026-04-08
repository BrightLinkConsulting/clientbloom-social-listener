/**
 * Scout by ClientBloom — Sales Landing Page
 * Server-rendered for SEO, with interactive FAQ in a client component.
 */

import Link from 'next/link'
import { FaqAccordion } from './_components/FaqAccordion'
import { AnimatedFeed } from './_components/AnimatedFeed'
import { NeonButton } from '@/components/ui/neon-button'
import AnimatedTextCycle from '@/components/ui/animated-text-cycle'
import { GradientText } from '@/components/ui/gradient-text'
import { AnimatedTestimonials, type Testimonial } from '@/components/blocks/animated-testimonials'

const CHECKOUT_URL = '/api/checkout'

const TESTIMONIALS: Testimonial[] = [
  {
    id: 1,
    name: 'Sarah M.',
    role: 'Fractional CMO',
    company: 'Independent Consultant',
    content: 'I engaged with 3 prospects this week who were already aware of me from my LinkedIn comments. Two of them booked calls before I ever pitched.',
    rating: 5,
    initials: 'SM',
    accentColor: 'linear-gradient(135deg, #4F6BFF, #7C3AED)',
  },
  {
    id: 2,
    name: 'David K.',
    role: 'B2B Consultant',
    company: 'DK Consulting',
    content: "Scout replaced cold outreach entirely for my firm. I'm closing deals with people who already feel like they know me.",
    rating: 5,
    initials: 'DK',
    accentColor: 'linear-gradient(135deg, #00B96B, #4F6BFF)',
  },
  {
    id: 3,
    name: 'Rachel T.',
    role: 'Agency Owner',
    company: 'Growth Agency',
    content: 'My connection acceptance rate jumped in the first two weeks. Being visible before the ask changes everything.',
    rating: 5,
    initials: 'RT',
    accentColor: 'linear-gradient(135deg, #E91E8C, #7C3AED)',
  },
]

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
            <NeonButton href={CHECKOUT_URL} variant="solid" size="sm">
              Start for $79/mo
            </NeonButton>
          </div>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section className="pt-32 pb-24 px-6">
        <div className="max-w-5xl mx-auto text-center">

          <div className="inline-flex items-center gap-2 bg-[#4F6BFF]/10 border border-[#4F6BFF]/20 rounded-full px-4 py-1.5 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4F6BFF] animate-pulse" />
            <AnimatedTextCycle
              words={['Post Scoring', 'Profile Monitoring', 'Comment Generation', 'ICP Intelligence']}
              interval={3000}
              className="text-[#4F6BFF] text-xs font-medium tracking-wide uppercase"
            />
          </div>

          <h1 className="font-bold tracking-tight mb-4">
            <span
              className="block leading-[1.05]"
              style={{ fontSize: 'clamp(20px, 7.3vw, 81px)' }}
            >
              <span
                style={{
                  background: 'linear-gradient(90deg, #4F6BFF 0%, #7C3AED 50%, #E91E8C 100%)',
                  backgroundSize: '200% auto',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  animation: 'gradientShift 5s ease-in-out infinite alternate',
                  display: 'inline',
                }}
              >Your next client</span>
              <span className="text-white"> is on</span>
              <style>{`@keyframes gradientShift{0%{background-position:0% center}100%{background-position:100% center}}`}</style>
            </span>
            <span
              className="block text-white leading-[1.05]"
              style={{ fontSize: 'clamp(23px, 8.4vw, 94px)' }}
            >
              LinkedIn right now.
            </span>
            <span
              className="block whitespace-nowrap leading-[1.2] mt-2"
              style={{ fontSize: 'clamp(14px, 5vw, 56px)' }}
            >
              <GradientText className="text-white font-bold tracking-tight">
                Scout puts you in front of them
              </GradientText>
            </span>
          </h1>

          <p className="text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed mb-10">
            Scout helps you show up in the conversations your buyers are already having when it matters most and hands you the perfect thing to say to build real relationships before ever making your pitch.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <NeonButton href={CHECKOUT_URL} variant="solid" size="lg">
              Get Scout — $79/month
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </NeonButton>
            <a href="#how-it-works" className="text-slate-400 hover:text-slate-200 text-sm transition-colors flex items-center gap-1.5">
              See how it works
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </a>
          </div>

          <p className="text-slate-600 text-sm mt-6">No contracts. No setup fees. Cancel anytime.</p>

          {/* Animated feed preview */}
          <AnimatedFeed />
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

      {/* ─── COMPARISON ─── */}
      <section className="py-24 px-6 border-t border-slate-800/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 bg-[#4F6BFF]/10 border border-[#4F6BFF]/20 rounded-full px-3 py-1 mb-6">
              <span className="text-[#4F6BFF] text-xs font-medium tracking-wide uppercase">How Scout compares</span>
            </div>
            <h2 className="text-4xl font-bold text-white mb-4">
              "Isn't this just Sales Navigator?"
            </h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              Sales Navigator finds people. Scout finds what those people are saying — and hands you the perfect moment to join the conversation.
            </p>
          </div>

          {/* Comparison table — with ambient glow */}
          <div className="relative">
            {/* Glow layer behind the table */}
            <div
              className="absolute inset-0 rounded-2xl pointer-events-none"
              style={{
                boxShadow: '0 0 70px 14px rgba(79,107,255,0.11), 0 0 140px 28px rgba(124,58,237,0.06)',
                zIndex: 0,
              }}
            />
          <div className="relative grid grid-cols-4 gap-0 rounded-2xl overflow-hidden border border-slate-800" style={{ zIndex: 1 }}>

            {/* Column headers */}
            <div className="bg-[#0a0c10] px-5 py-5 border-b border-slate-800 border-r border-slate-800">
              <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest">Feature</p>
            </div>

            {/* LinkedIn Manual */}
            <div className="bg-[#0a0c10] px-5 py-5 border-b border-slate-800 border-r border-slate-800 text-center">
              <p className="text-slate-400 text-sm font-semibold">LinkedIn</p>
              <p className="text-slate-600 text-xs mt-0.5">Manual scrolling</p>
            </div>

            {/* Sales Navigator */}
            <div className="bg-[#0a0c10] px-5 py-5 border-b border-slate-800 border-r border-slate-800 text-center">
              <p className="text-slate-400 text-sm font-semibold">Sales Navigator</p>
              <p className="text-slate-600 text-xs mt-0.5">~$99–$149/mo</p>
            </div>

            {/* Scout — highlighted */}
            <div className="bg-[#4F6BFF]/8 px-5 py-5 border-b border-[#4F6BFF]/30 text-center relative"
              style={{ background: 'rgba(79,107,255,0.06)' }}>
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#4F6BFF] to-[#7C3AED]" />
              <p className="text-white text-sm font-bold">Scout</p>
              <p className="text-[#4F6BFF] text-xs mt-0.5 font-medium">$79/mo</p>
            </div>

            {(() => {
              const rows = [
                {
                  feature: 'Monitors ICP posts automatically',
                  manual: false,
                  salenav: 'partial',
                  scout: true,
                  note: 'Sales Nav sends some alerts, but misses most posts',
                },
                {
                  feature: 'AI scores each post by conversation opportunity',
                  manual: false,
                  salenav: false,
                  scout: true,
                },
                {
                  feature: 'Suggests what to comment — in your voice',
                  manual: false,
                  salenav: false,
                  scout: true,
                },
                {
                  feature: 'Consistent daily coverage (works while you sleep)',
                  manual: false,
                  salenav: 'partial',
                  scout: true,
                  note: 'Sales Nav requires you to check manually',
                },
                {
                  feature: 'Searchable post history',
                  manual: false,
                  salenav: false,
                  scout: true,
                },
                {
                  feature: 'CRM sync (GoHighLevel, HubSpot)',
                  manual: false,
                  salenav: 'partial',
                  scout: true,
                  note: 'Sales Nav syncs contact data, not engagement context',
                },
                {
                  feature: 'Built for engagement — not cold outreach',
                  manual: false,
                  salenav: false,
                  scout: true,
                },
                {
                  feature: 'Setup in under 10 minutes',
                  manual: true,
                  salenav: false,
                  scout: true,
                },
              ]

              const Check = () => (
                <div className="flex items-center justify-center">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/15 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
              )

              const Cross = () => (
                <div className="flex items-center justify-center">
                  <div className="w-6 h-6 rounded-full bg-red-500/10 flex items-center justify-center">
                    <svg className="w-3 h-3 text-red-500/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                </div>
              )

              const Partial = () => (
                <div className="flex items-center justify-center">
                  <div className="w-6 h-6 rounded-full bg-amber-500/10 flex items-center justify-center">
                    <span className="text-amber-400/80 text-xs font-bold leading-none">~</span>
                  </div>
                </div>
              )

              const cell = (val: boolean | string) => {
                if (val === true) return <Check />
                if (val === 'partial') return <Partial />
                return <Cross />
              }

              return rows.map((row, i) => {
                const isLast = i === rows.length - 1
                const borderB = isLast ? '' : 'border-b border-slate-800/70'
                return (
                  <>
                    <div key={`f-${i}`} className={`bg-[#0d0f14] px-5 py-4 ${borderB} border-r border-slate-800`}>
                      <p className="text-slate-300 text-sm">{row.feature}</p>
                      {row.note && <p className="text-slate-600 text-xs mt-1 leading-snug">{row.note}</p>}
                    </div>
                    <div key={`m-${i}`} className={`bg-[#0d0f14] px-5 py-4 ${borderB} border-r border-slate-800 flex items-center justify-center`}>
                      {cell(row.manual)}
                    </div>
                    <div key={`s-${i}`} className={`bg-[#0d0f14] px-5 py-4 ${borderB} border-r border-slate-800 flex items-center justify-center`}>
                      {cell(row.salenav)}
                    </div>
                    <div key={`sc-${i}`} className={`px-5 py-4 ${borderB} flex items-center justify-center`}
                      style={{ background: 'rgba(79,107,255,0.04)' }}>
                      {cell(row.scout)}
                    </div>
                  </>
                )
              })
            })()}

            {/* Price row */}
            <div className="bg-[#0a0c10] px-5 py-5 border-r border-slate-800">
              <p className="text-slate-400 text-sm font-semibold">Monthly cost</p>
            </div>
            <div className="bg-[#0a0c10] px-5 py-5 border-r border-slate-800 text-center">
              <p className="text-slate-400 text-sm">Free</p>
              <p className="text-slate-600 text-xs mt-0.5">Your time isn't</p>
            </div>
            <div className="bg-[#0a0c10] px-5 py-5 border-r border-slate-800 text-center">
              <p className="text-slate-400 text-sm">$99–$149/mo</p>
              <p className="text-slate-600 text-xs mt-0.5">Per seat</p>
            </div>
            <div className="px-5 py-5 text-center" style={{ background: 'rgba(79,107,255,0.06)' }}>
              <p className="text-white text-sm font-bold">$79/mo</p>
              <p className="text-[#4F6BFF] text-xs mt-0.5">14-day free trial</p>
            </div>
          </div>

          </div>{/* close glow wrapper */}

          <p className="text-center text-slate-600 text-xs mt-6">
            ~ = partial support with significant limitations
          </p>

          {/* Post-comparison CTA — high-intent moment */}
          <div className="mt-12 flex flex-col items-center gap-4">
            <NeonButton href={CHECKOUT_URL} variant="solid" size="lg">
              Start Your Free 14-Day Trial
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </NeonButton>
            <p className="text-slate-600 text-sm">No credit card required. Setup takes under 10 minutes.</p>
          </div>

        </div>
      </section>

      {/* ─── SOCIAL PROOF ─── */}
      <div className="border-t border-slate-800/50 bg-gradient-to-b from-[#0a0c10] to-[#0f1117]/50">
        <AnimatedTestimonials
          title="Trusted by consultants and GTM teams"
          subtitle="Real results from scouts who show up consistently in the right conversations."
          badgeText="Trusted by consultants & agencies"
          testimonials={TESTIMONIALS}
        />
        <div className="max-w-4xl mx-auto px-6 pb-24">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            {[
              { stat: '3.2x', label: 'higher reply rates vs. cold outreach' },
              { stat: '60%+', label: 'connection acceptance from monitored prospects' },
              { stat: '14 days', label: 'free trial — see results in your first week' },
            ].map((item, i) => (
              <div key={i}>
                <div className="text-3xl font-bold text-[#4F6BFF] mb-2">{item.stat}</div>
                <p className="text-slate-400 text-sm">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── PRICING ─── */}
      <section id="pricing" className="py-24 px-6 border-t border-slate-800/50">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-4">One price. No hidden fees.</h2>
          <p className="text-slate-400 text-lg mb-12">Scout starts at $79 per month for individuals and teams. Everything included. 14-day free trial — no credit card required.</p>

          <div className="bg-[#0f1117] border border-[#4F6BFF]/20 rounded-2xl p-12 text-center mb-6">
            <div className="text-5xl font-bold text-white mb-2">$79<span className="text-xl text-slate-400 font-normal">/month</span></div>
            <p className="text-slate-400 text-sm mb-8">2 monitored topics, 1 monitored persona, unlimited post history.</p>

            <NeonButton href={CHECKOUT_URL} variant="solid" size="lg">
              Start 14-Day Free Trial
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </NeonButton>

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

          <NeonButton href={CHECKOUT_URL} variant="solid" size="lg" className="text-lg px-10 py-5">
            Get Scout — $79/month
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </NeonButton>
          <p className="text-slate-600 text-sm mt-4">Setup takes under 10 minutes. Your Scout feed is live today.</p>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-slate-800/50 pt-16 pb-10 px-6">
        <div className="max-w-5xl mx-auto">

          {/* Top: logo + nav columns */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-10 mb-14">

            {/* PRODUCT */}
            <div>
              <p className="text-slate-500 text-xs font-semibold tracking-widest uppercase mb-5">Product</p>
              <ul className="space-y-3">
                <li><a href="#how-it-works" className="text-slate-400 hover:text-white text-sm transition-colors">How It Works</a></li>
                <li><a href="#pricing" className="text-slate-400 hover:text-white text-sm transition-colors">Pricing</a></li>
                <li><Link href="/sign-in" className="text-slate-400 hover:text-white text-sm transition-colors">Sign In</Link></li>
                <li><a href={CHECKOUT_URL} className="text-slate-400 hover:text-white text-sm transition-colors">Get Started</a></li>
              </ul>
            </div>

            {/* COMPARE */}
            <div>
              <p className="text-slate-500 text-xs font-semibold tracking-widest uppercase mb-5">Compare</p>
              <ul className="space-y-3">
                <li><Link href="/compare" className="text-slate-400 hover:text-white text-sm transition-colors">Scout vs. Alternatives</Link></li>
                <li><Link href="/about" className="text-slate-400 hover:text-white text-sm transition-colors">About Scout</Link></li>
                <li><Link href="/blog" className="text-slate-400 hover:text-white text-sm transition-colors">Blog</Link></li>
              </ul>
            </div>

            {/* LEGAL */}
            <div>
              <p className="text-slate-500 text-xs font-semibold tracking-widest uppercase mb-5">Legal</p>
              <ul className="space-y-3">
                <li><Link href="/privacy-policy" className="text-slate-400 hover:text-white text-sm transition-colors">Privacy Policy</Link></li>
                <li><Link href="/terms" className="text-slate-400 hover:text-white text-sm transition-colors">Terms of Service</Link></li>
              </ul>
            </div>

            {/* COMPANY */}
            <div>
              <p className="text-slate-500 text-xs font-semibold tracking-widest uppercase mb-5">Company</p>
              <ul className="space-y-3">
                <li><a href="mailto:info@clientbloom.ai" className="text-slate-400 hover:text-white text-sm transition-colors">Contact</a></li>
                <li><a href="https://clientbloom.ai" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white text-sm transition-colors">ClientBloom.ai</a></li>
              </ul>
            </div>

          </div>

          {/* Divider */}
          <div className="border-t border-slate-800/50 pt-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <ClientBloomMark size={18} />
                <span className="text-slate-500 text-sm font-medium">Scout by ClientBloom</span>
              </div>
              <p className="text-slate-600 text-xs text-center sm:text-right max-w-lg leading-relaxed">
                Scout is an independent product of BrightLink Consulting and is not affiliated with, endorsed by, or sponsored by LinkedIn Corporation. LinkedIn® is a registered trademark of LinkedIn Corporation.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-5">
              <span className="text-slate-700 text-xs">© 2026 Scout by ClientBloom. All rights reserved.</span>
              <div className="flex items-center gap-5">
                <Link href="/privacy-policy" className="text-slate-700 hover:text-slate-400 text-xs transition-colors">Privacy</Link>
                <Link href="/terms" className="text-slate-700 hover:text-slate-400 text-xs transition-colors">Terms</Link>
                <a href="mailto:info@clientbloom.ai" className="text-slate-700 hover:text-slate-400 text-xs transition-colors">info@clientbloom.ai</a>
              </div>
            </div>
          </div>

        </div>
      </footer>

    </div>
  )
}
