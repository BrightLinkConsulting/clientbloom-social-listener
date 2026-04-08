'use client'

const POSTS = [
  {
    score: 9,
    name: 'Jennifer R.',
    title: 'Agency Owner · ICP Profile',
    platform: 'LinkedIn',
    text: 'Scaling from 12 to 20 clients this quarter. Mostly excited, a little terrified. Anyone else find the systems that worked at 10 clients completely break at 20?',
    tag: 'ICP Active',
    tagColor: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  },
  {
    score: 8,
    name: 'Marcus T.',
    title: 'Marketing Consultant',
    platform: 'LinkedIn',
    text: "Hot take: The agencies that survive the next 3 years will be the ones who got proactive about client communication, not reactive. Who's doing this well right now?",
    tag: 'Discussion Starter',
    tagColor: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  },
  {
    score: 9,
    name: 'Rachel D.',
    title: 'Founder · B2B SaaS',
    platform: 'LinkedIn',
    text: "We just let our third agency of the year go. Honestly tired of re-onboarding people to our business. Is anyone actually solving this?",
    tag: 'ICP Active',
    tagColor: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  },
  {
    score: 7,
    name: 'Sarah K.',
    title: 'VP of Sales',
    platform: 'LinkedIn',
    text: 'Three consultants pitched us this week on AI tools. Different packaging, same promises. How do you actually evaluate vendors when everyone sounds identical?',
    tag: 'Conversation Hook',
    tagColor: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  },
  {
    score: 8,
    name: 'Derek W.',
    title: 'Director of Growth · Mid-Market',
    platform: 'LinkedIn',
    text: "Open to conversations with consultants who specialize in revenue operations. DMs open — please no cold pitches, just genuine convos.",
    tag: 'Discussion Starter',
    tagColor: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  },
  {
    score: 9,
    name: 'Priya B.',
    title: 'CMO · E-commerce Brand',
    platform: 'LinkedIn',
    text: "The agency we hired six months ago still doesn't understand our customer. Thinking hard about bringing everything in-house before Q3.",
    tag: 'ICP Active',
    tagColor: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  },
  {
    score: 7,
    name: 'Tom K.',
    title: 'CEO · Digital Agency',
    platform: 'LinkedIn',
    text: "We're evaluating three new vendors this quarter. Would love honest recommendations from people who've actually made the switch recently.",
    tag: 'Conversation Hook',
    tagColor: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  },
  {
    score: 8,
    name: 'Nina L.',
    title: 'Chief Revenue Officer',
    platform: 'LinkedIn',
    text: 'We hit our Q1 number but burned the team out doing it. Time to rethink how we run outbound before Q2 kicks off.',
    tag: 'Discussion Starter',
    tagColor: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  },
]

function scoreStyle(score: number) {
  if (score >= 9) return 'bg-emerald-900/40 text-emerald-400'
  if (score >= 7) return 'bg-amber-900/40 text-amber-400'
  return 'bg-slate-800 text-slate-400'
}

export function AnimatedFeed() {
  const posts = [...POSTS, ...POSTS] // duplicate for seamless loop

  return (
    <div className="mt-16 relative max-w-2xl mx-auto">

      {/* Card shell */}
      <div className="bg-[#0f1117] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header — static */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
          <span className="text-xs text-slate-400">Live intelligence feed — updated twice daily</span>
          <span className="ml-auto text-xs text-[#4F6BFF] font-medium">14 new posts</span>
        </div>

        {/* Scrolling rows */}
        <div className="relative" style={{ height: 340 }}>

          {/* Bottom fade — stronger than top since it covers the CTA below */}
          <div
            className="absolute inset-x-0 bottom-0 z-10 h-20 pointer-events-none"
            style={{ background: 'linear-gradient(to top, #0f1117 0%, transparent 100%)' }}
          />
          <div
            className="absolute inset-x-0 top-0 z-10 h-10 pointer-events-none"
            style={{ background: 'linear-gradient(to bottom, #0f1117 0%, transparent 100%)' }}
          />

          {/* Scrolling list */}
          <div
            style={{
              animation: 'feedScrollUp 32s linear infinite',
              willChange: 'transform',
            }}
          >
            {posts.map((post, i) => (
              <div
                key={i}
                className={`flex gap-3 px-4 py-3 ${i % POSTS.length < POSTS.length - 1 ? 'border-b border-slate-800/50' : ''}`}
              >
                {/* Score badge */}
                <div
                  className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${scoreStyle(post.score)}`}
                >
                  {post.score}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-slate-300 text-xs font-medium">{post.name}</span>
                    <span className="text-slate-600 text-xs">·</span>
                    <span className="text-slate-500 text-xs">{post.title}</span>
                    <span className="text-slate-600 text-xs">·</span>
                    <span className="text-slate-600 text-xs">{post.platform}</span>
                    <span
                      className={`ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded border ${post.tagColor}`}
                    >
                      {post.tag}
                    </span>
                  </div>
                  <p className="text-slate-400 text-xs leading-relaxed line-clamp-2">{post.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Page-level fade from hero into next section */}
      <div
        className="absolute inset-x-0 bottom-0 h-24 pointer-events-none"
        style={{
          background: 'linear-gradient(to top, #080a0f 0%, transparent 100%)',
          bottom: '-1px',
        }}
      />

      <style>{`
        @keyframes feedScrollUp {
          0%   { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
      `}</style>
    </div>
  )
}
