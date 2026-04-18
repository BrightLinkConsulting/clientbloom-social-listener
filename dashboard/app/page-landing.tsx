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

const CHECKOUT_URL = '/sign-up'

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

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Does Scout need access to my LinkedIn account?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. Scout never touches your LinkedIn login or password. We search LinkedIn on your behalf using our own infrastructure — your account is never involved, never at risk, and LinkedIn never sees Scout activity associated with your profile.',
      },
    },
    {
      '@type': 'Question',
      name: 'How does Scout find the right conversations?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'You tell Scout two things: which people you want to watch, and which topics or keywords matter to your work. Twice a day, Scout scans all of that activity, pulls every post worth seeing, and ranks them by how strong an opening each one creates for you.',
      },
    },
    {
      '@type': 'Question',
      name: 'What does the AI scoring actually mean?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Every post gets a 1–10 conversation score based on how natural an entry point it creates for you. A 9–10 means someone is asking a question, announcing something, kicking off a debate, or sharing a perspective you can genuinely add to. Anything below a 5 does not surface. The score is never about whether someone is struggling — it\'s about whether you can say something worth saying.',
      },
    },
    {
      '@type': 'Question',
      name: 'What if I\'m not totally sure who I want to target yet?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'You don\'t need a polished list to get started. Most users begin with a few people they already know matter to them, a couple of industry keywords, and a topic or two they talk about in their own work. Scout gets sharper the more specific you are, but you don\'t need to have it figured out on day one.',
      },
    },
    {
      '@type': 'Question',
      name: 'Will Scout make me look spammy or robotic on LinkedIn?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'That\'s exactly what it\'s designed to prevent. Every suggestion starts from a real post by a specific person you\'ve chosen to follow. Comment suggestions are short, specific, and written in first person from your business angle. We\'ve built hard rules against everything that makes AI writing obvious. The goal is a comment you could paste, post, and no one would guess it didn\'t come directly from you.',
      },
    },
    {
      '@type': 'Question',
      name: 'How is this different from just searching LinkedIn manually?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Manual scrolling catches maybe 5–10% of relevant conversations. Scout watches the people and topics you care about continuously and surfaces everything, sorted by how strong an opportunity each one is. More importantly: it\'s consistent. You also keep a full history of every post you\'ve engaged with — something a disappearing feed can never give you.',
      },
    },
    {
      '@type': 'Question',
      name: 'What\'s actually included in the free trial?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The full product — no feature gates, no watered-down trial tier. You get 7 days to set up Scout, watch your first batch of conversations come in, use the AI comment suggestions, and decide for yourself. No credit card required to start.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I connect my CRM?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes — on the Agency plan. Scout integrates with GoHighLevel and HubSpot. When you find a prospect worth pursuing, one click creates a contact in your CRM and attaches your notes. CRM integration is included in the Agency plan at $249/mo.',
      },
    },
    {
      '@type': 'Question',
      name: 'Who built this? Is ClientBloom a real company?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'ClientBloom is built by Mike Walker — two-time Amazon #1 bestselling author, 25+ years in client-facing service businesses. Scout grew out of what he built for himself to find and engage with the right people on LinkedIn. This isn\'t a side project — it\'s infrastructure we run ourselves every day.',
      },
    },
    {
      '@type': 'Question',
      name: 'What if I want to cancel?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Cancel from your account settings anytime. No notice period, no cancellation fees, no "please call us to cancel." Monthly subscription. Simple.',
      },
    },
  ],
}

export default function LandingPage() {
  const faqItems = [
    {
      q: 'Does Scout need access to my LinkedIn account?',
      a: 'No. Scout never touches your LinkedIn login or password. We search LinkedIn on your behalf using our own infrastructure — your account is never involved, never at risk, and LinkedIn never sees Scout activity associated with your profile. You set up Scout with the people and topics you care about, and we do the rest.'
    },
    {
      q: 'How does Scout find the right conversations?',
      a: 'You tell Scout two things: which people you want to watch (up to a few dozen LinkedIn profiles depending on your plan), and which topics or keywords matter to your work. Twice a day, Scout scans all of that activity, pulls every post worth seeing, and ranks them by how strong an opening each one creates for you. No manual scrolling. No missed moments.'
    },
    {
      q: 'What does the AI scoring actually mean?',
      a: 'Every post gets a 1–10 conversation score based on how natural an entry point it creates for you. A 9–10 means someone is asking a question, announcing something, kicking off a debate, or sharing a perspective you can genuinely add to — and showing up in that moment builds real recognition. Anything below a 5 doesn\'t surface. The score is never about whether someone is struggling — it\'s about whether you can say something worth saying.'
    },
    {
      q: 'What if I\'m not totally sure who I want to target yet?',
      a: 'You don\'t need a polished list to get started. Most users begin with 3–5 people they already know matter to them, a couple of industry keywords, and a topic or two they talk about in their own work. Your feed shows you what\'s actually resonating within the first few days — and you refine as you go. Scout gets sharper the more specific you are, but you don\'t need to have it figured out on day one.'
    },
    {
      q: 'Will Scout make me look spammy or robotic on LinkedIn?',
      a: 'That\'s exactly what it\'s designed to prevent. Every suggestion starts from a real post by a specific person you\'ve chosen to follow — not a mass-blast template. Comment suggestions are short, specific, and written in first person from your business angle. We\'ve built hard rules against everything that makes AI writing obvious: no hollow openers, no filler phrases, nothing that reads like a template. The goal is a comment you could paste, post, and no one would guess it didn\'t come directly from you.'
    },
    {
      q: 'How is this different from just searching LinkedIn manually?',
      a: 'Manual scrolling catches maybe 5–10% of relevant conversations — the ones that happen to surface when you happen to be online. Scout watches the people and topics you care about continuously and surfaces everything, sorted by how strong an opportunity each one is. More importantly: it\'s consistent. The people who build real presence on LinkedIn show up repeatedly, not occasionally. Scout makes that consistency automatic. You also keep a full history of every post you\'ve engaged with — something a disappearing feed can never give you.'
    },
    {
      q: 'What\'s actually included in the free trial?',
      a: 'The full product — no feature gates, no watered-down trial tier. You get 7 days to set up Scout, watch your first batch of conversations come in, use the AI comment suggestions, and decide for yourself whether this belongs in your weekly routine. No credit card required to start. If you want to continue, pick a plan. If not, nothing happens.'
    },
    {
      q: 'Can I customize how Scout scores posts?',
      a: 'Yes. Scout uses a default AI scoring approach, but you can write a custom prompt that describes exactly what a high-value post looks like for your specific work. The more specific you are — the type of person, the kind of conversation, the topics you actually know well — the sharper Scout\'s judgment becomes over time.'
    },
    {
      q: 'How does the suggested comment actually work — does it sound like AI?',
      a: 'We spent a lot of time on this. Scout generates comments in first person from your specific business angle, and we\'ve built in hard rules against everything that makes AI writing obvious: no em-dashes, no "at the end of the day," no hollow phrases like "I completely understand your situation." Comments are kept short, casual, and a little imperfect on purpose — because that\'s what reads as human in a LinkedIn comment thread. The goal is something you could paste, post, and nobody would guess it didn\'t come directly from you.'
    },
    {
      q: 'Can I connect my CRM?',
      a: 'Yes — on the Agency plan. Scout integrates with GoHighLevel and HubSpot. When you find a prospect worth pursuing, one click creates a contact in your CRM and attaches your notes. No copy-paste, no context lost. CRM integration is included in the Agency plan ($249/mo).'
    },
    {
      q: 'Who built this? Is ClientBloom a real company?',
      a: 'ClientBloom is built by Mike Walker — two-time Amazon #1 bestselling author, 25+ years in client-facing service businesses. Scout grew out of what he built for himself to find and engage with the right people on LinkedIn. It\'s now available as a product. This isn\'t a side project — it\'s infrastructure we run ourselves every day.'
    },
    {
      q: 'What if I want to cancel?',
      a: 'Cancel from your account settings anytime. No notice period, no cancellation fees, no "please call us to cancel." Monthly subscription. Simple.'
    }
  ]

  return (
    <div className="min-h-screen bg-[#080a0f] text-slate-200 font-sans overflow-x-hidden">
      {/* FAQ structured data for search engines and LLMs */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      {/* ─── NAV ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#080a0f]/90 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0 shrink-0">
            <ClientBloomMark size={28} />
            <span className="text-white font-bold tracking-tight">Scout <span className="text-slate-400 font-normal text-sm hidden sm:inline">by ClientBloom</span></span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <a href="#how-it-works" className="text-slate-400 hover:text-slate-200 text-sm transition-colors hidden md:block">How it works</a>
            <a href="#pricing" className="text-slate-400 hover:text-slate-200 text-sm transition-colors hidden md:block">Pricing</a>
            <Link href="/sign-in" className="text-slate-400 hover:text-slate-200 text-sm transition-colors shrink-0">Sign in</Link>
            <NeonButton href={CHECKOUT_URL} variant="solid" size="sm" className="shrink-0 whitespace-nowrap">
              <span className="sm:hidden">Free Trial</span>
              <span className="hidden sm:inline">Start Free Trial</span>
            </NeonButton>
          </div>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section className="pt-32 pb-24 px-6">
        <div className="max-w-5xl mx-auto text-center">

          <div className="inline-flex items-center gap-2 bg-[#4F6BFF]/10 border border-[#4F6BFF]/20 rounded-full px-4 py-1.5 mb-10">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4F6BFF] animate-pulse" />
            <AnimatedTextCycle
              words={['Profile Monitoring', 'Comment Generation', 'Prospect Intelligence']}
              interval={4500}
              className="text-[#4F6BFF] text-xs font-medium tracking-wide uppercase"
            />
          </div>

          <p className="text-slate-500 text-base sm:text-xl mb-3">Prospecting Just Got a Whole Lot Easier...</p>

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
              >Your Next Client</span>
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

          <p
            className="text-slate-400 max-w-4xl mx-auto leading-snug mb-10"
            style={{ fontSize: 'clamp(11px, 2.7vw, 28px)' }}
          >
            <em className="font-semibold">Social listening assistant</em> that helps you show up in<br /> the <em className="font-semibold">conversations your ideal clients are already having</em>,<br /> when it matters most - and <em className="font-semibold">hands you the perfect thing to say</em>
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <NeonButton href={CHECKOUT_URL} variant="solid" size="lg" className="w-full sm:w-auto whitespace-nowrap">
              Start Your Free 7-Day Trial
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </NeonButton>
            <a href="#how-it-works" className="text-slate-400 hover:text-slate-200 text-sm transition-colors flex items-center gap-1.5">
              See how it works
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </a>
          </div>

          <p className="text-slate-600 text-sm mt-6">Instant Access. No Credit Card Required</p>

          {/* Animated feed preview */}
          <AnimatedFeed />
        </div>
      </section>

      {/* ─── PROBLEM ─── */}
      <section className="py-24 px-6 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4">The conversation is happening.<br />You're just not in it.</h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">Your ideal clients are on LinkedIn every day — posting, discussing, asking questions, sharing opinions. The people who build the deepest relationships show up in those moments consistently. You can't do that manually.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: '🔎',
                title: 'You\'re missing daily entry points',
                body: 'When someone you want to reach posts a question, shares a milestone, or kicks off an industry debate — that\'s a natural opening. It expires in 24 hours. Manual scrolling catches maybe 5% of them.'
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
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white text-center mb-16">Three-part system.<br />Just works.</h2>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: '1',
                title: 'Monitor',
                body: 'Tell Scout which LinkedIn profiles, keywords, and topics matter to your business. Scout runs twice daily, scanning for all activity matching your criteria.'
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

      {/* ─── WHO THIS IS FOR ─── */}
      <section className="py-24 px-6 border-t border-slate-800/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4">Scout is for anyone building on LinkedIn.</h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">If your next client, customer, or partner is on LinkedIn — Scout is how you reach them.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: '🎯',
                title: 'Coaches & advisors',
                body: 'Your reputation is built before the conversation starts. Scout keeps you visible in the spaces your future clients are already watching — so when you do reach out, they already feel like they know you.',
              },
              {
                icon: '🚀',
                title: 'Founders & entrepreneurs',
                body: "You're great at what you do. Selling yourself on LinkedIn is a different skill. Scout puts you in the right conversations consistently so your expertise speaks before you ever pitch.",
              },
              {
                icon: '📈',
                title: 'Sales professionals',
                body: "Cold outreach reply rates are at a 10-year low. Scout builds the familiarity that makes your eventual message feel like a warm introduction instead of one more pitch nobody asked for.",
              },
              {
                icon: '🏢',
                title: 'Agency owners',
                body: "You're running client work and doing BD at the same time. Scout gives you a daily brief of the highest-value conversations to engage with so business development doesn't get deprioritized when delivery gets busy.",
              },
              {
                icon: '🤝',
                title: 'Service & relationship-driven professionals',
                body: 'Real estate, financial services, recruiting, legal — trust is your product. Scout helps you build it at scale, one relevant and genuine conversation at a time.',
              },
              {
                icon: '💼',
                title: 'Solo consultants & fractional executives',
                body: "You're building pipeline from your personal brand. Scout turns your LinkedIn presence into a consistent system so you're always in the right conversations, not just the ones you stumble across.",
              },
            ].map((item, i) => (
              <div key={i} className="bg-[#0f1117] border border-slate-800 rounded-xl p-6">
                <div className="text-2xl mb-3">{item.icon}</div>
                <h3 className="text-white font-semibold text-base mb-2">{item.title}</h3>
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
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4">
              "Isn't this just Sales Navigator?"
            </h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              Sales Navigator finds people. Scout finds what those people are saying — and hands you the perfect moment to join the conversation.
            </p>
          </div>

          {/* Comparison table — with ambient glow */}
          <div className="relative">
            {/* Glow layer behind the table — desktop only */}
            <div
              className="hidden md:block absolute inset-0 rounded-2xl pointer-events-none"
              style={{
                boxShadow: '0 0 70px 14px rgba(79,107,255,0.11), 0 0 140px 28px rgba(124,58,237,0.06)',
                zIndex: 0,
              }}
            />
            {/* Mobile scroll hint */}
            <p className="md:hidden text-center text-xs text-slate-600 mb-3 flex items-center justify-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" /></svg>
              Swipe to compare
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </p>
          <div className="overflow-x-auto rounded-2xl">
          <div className="relative grid grid-cols-4 min-w-[560px] gap-0 rounded-2xl overflow-hidden border border-slate-800" style={{ zIndex: 1 }}>

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
              <p className="text-[#4F6BFF] text-xs mt-0.5 font-medium">from $49/mo</p>
            </div>

            {(() => {
              const rows = [
                {
                  feature: 'Monitors target prospect posts automatically',
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
                  note: 'Agency plan only. Sales Nav syncs contact data, not engagement context.',
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
              <p className="text-white text-sm font-bold">from $49/mo</p>
              <p className="text-[#4F6BFF] text-xs mt-0.5">7-day free trial</p>
            </div>
          </div>
          </div>{/* close overflow-x-auto */}

          </div>{/* close glow wrapper */}

          <p className="text-center text-slate-600 text-xs mt-6">
            ~ = partial support with significant limitations
          </p>

          {/* Post-comparison CTA — high-intent moment */}
          <div className="mt-12 flex flex-col items-center gap-4">
            <NeonButton href={CHECKOUT_URL} variant="solid" size="lg" className="w-full sm:w-auto whitespace-nowrap">
              Start Your Free 7-Day Trial
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
          title="Trusted by business owners and teams"
          subtitle="Real results from people who show up consistently in the right conversations."
          badgeText="Trusted by business owners & agencies"
          testimonials={TESTIMONIALS}
        />
        <div className="max-w-4xl mx-auto px-6 pb-24">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            {[
              { stat: '3.2x', label: 'higher reply rates vs. cold outreach' },
              { stat: '60%+', label: 'connection acceptance from monitored prospects' },
              { stat: '7 days', label: 'free trial — see results in your first week' },
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
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4">Simple, transparent pricing.</h2>
          <p className="text-slate-400 text-lg mb-12">Start free for 7 days — no credit card required. Pick the plan that fits when you're ready.</p>

          {/* 3-tier grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
            {/* Starter */}
            <div className="rounded-2xl bg-[#0f1117] border border-slate-700/50 p-6 flex flex-col text-left">
              <div className="mb-4">
                <p className="text-white font-bold text-xl">Starter</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-3xl font-bold text-white">$49</span>
                  <span className="text-slate-500 text-sm">/mo</span>
                </div>
                <p className="text-slate-500 text-xs mt-2 leading-relaxed">For individuals getting started with LinkedIn presence and relationship building.</p>
              </div>
              <ul className="space-y-2 flex-1 mb-6">
                {['3 LinkedIn keyword searches','10 target profiles monitored · 50-profile pool','1 scan per day','30 AI comment suggestions/mo','30-day post history','1 user seat'].map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-slate-300">
                    <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    {f}
                  </li>
                ))}
              </ul>
              <NeonButton href={CHECKOUT_URL} variant="outline" size="sm">Start free trial</NeonButton>
            </div>

            {/* Pro — highlighted */}
            <div className="rounded-2xl bg-[#12151e] border-2 border-[#4F6BFF]/60 shadow-[0_0_40px_8px_rgba(79,107,255,0.1)] p-6 flex flex-col text-left relative">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#4F6BFF] text-white text-xs font-semibold px-3 py-1 rounded-full">Most Popular</span>
              <div className="mb-4">
                <p className="text-white font-bold text-xl">Pro</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-3xl font-bold text-white">$99</span>
                  <span className="text-slate-500 text-sm">/mo</span>
                </div>
                <p className="text-slate-500 text-xs mt-2 leading-relaxed">The full product. Everything you need to build pipeline from LinkedIn.</p>
              </div>
              <ul className="space-y-2 flex-1 mb-6">
                {['10 LinkedIn keyword searches','25 target profiles monitored · 150-profile pool','2 scans per day (morning + evening)','Unlimited AI comment suggestions','Unlimited post history','Slack daily digest','1 user seat'].map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-slate-300">
                    <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    {f}
                  </li>
                ))}
              </ul>
              <NeonButton href={CHECKOUT_URL} variant="solid" size="sm">Start free trial</NeonButton>
            </div>

            {/* Agency */}
            <div className="rounded-2xl bg-[#0f1117] border border-slate-700/50 p-6 flex flex-col text-left relative">
              <span className="absolute -top-3 left-6 bg-purple-900/60 border border-purple-700/40 text-purple-300 text-xs font-semibold px-3 py-1 rounded-full">Best Value</span>
              <div className="mb-4">
                <p className="text-white font-bold text-xl">Agency</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-3xl font-bold text-white">$249</span>
                  <span className="text-slate-500 text-sm">/mo</span>
                </div>
                <p className="text-slate-500 text-xs mt-2 leading-relaxed">For teams and agencies managing LinkedIn intelligence for multiple clients or seats.</p>
              </div>
              <ul className="space-y-2 flex-1 mb-6">
                {['20 LinkedIn keyword searches','50 target profiles monitored · 500-profile pool','2 scans per day','Unlimited AI comment suggestions','Unlimited post history','CRM integration (GHL + HubSpot)','Slack daily digest','Up to 5 user seats'].map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-slate-300">
                    <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    {f}
                  </li>
                ))}
              </ul>
              <NeonButton href={CHECKOUT_URL} variant="outline" size="sm">Start free trial</NeonButton>
            </div>
          </div>

          <p className="text-xs text-slate-600">All plans billed monthly · Cancel anytime · No setup fees · Your trial data is preserved</p>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="py-24 px-6 border-t border-slate-800/50">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white text-center mb-12">Straight answers.</h2>
          <FaqAccordion items={faqItems} />
        </div>
      </section>

      {/* ─── FINAL CTA ─── */}
      <section className="py-24 px-6 border-t border-slate-800/50 bg-gradient-to-b from-[#0a0c10] to-[#0d1020]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
            The conversations are<br />already happening.
          </h2>
          <p className="text-slate-400 text-base sm:text-xl mb-4">
            Your ideal clients are on LinkedIn every day — posting, discussing, asking, sharing. The ones who win their business aren't the ones who cold pitch the loudest. They're the ones who showed up consistently in the right places.
          </p>
          <p className="text-slate-300 text-base sm:text-xl mb-10">
            Scout automates that presence. Plans start at $49/month — it pays for itself the first time a prospect reaches out because they already know who you are.
          </p>

          <NeonButton href={CHECKOUT_URL} variant="solid" size="lg" className="text-lg px-10 py-5 w-full sm:w-auto whitespace-nowrap">
            Start Your Free 7-Day Trial
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
