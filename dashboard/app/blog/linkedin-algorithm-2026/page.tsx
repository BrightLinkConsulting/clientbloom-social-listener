/**
 * Blog Article: The LinkedIn Algorithm in 2026
 * Server-rendered for SEO + GEO
 */

import { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: "The LinkedIn Algorithm in 2026: Timing, Frequency, Consistency, and Comment Structure",
  description: "LinkedIn organic reach dropped 34% in 2025. Here's exactly how the 2026 algorithm works — saves, comment velocity, the 60-minute window, and why 4 links beats 1.",
  keywords: [
    "LinkedIn algorithm 2026",
    "how LinkedIn algorithm works",
    "LinkedIn reach 2026",
    "LinkedIn posting strategy",
    "LinkedIn comment strategy",
    "LinkedIn engagement 2026",
    "LinkedIn content strategy",
    "LinkedIn saves vs likes",
  ],
  openGraph: {
    title: "The LinkedIn Algorithm in 2026: Timing, Frequency, Consistency, and Comment Structure",
    description: "LinkedIn organic reach dropped 34% in 2025. Here's exactly how the 2026 algorithm works — and what you have to do differently.",
    url: "https://scout.clientbloom.ai/blog/linkedin-algorithm-2026",
    type: "article",
    images: [{ url: "https://scout.clientbloom.ai/og-image.png", width: 1200, height: 630, alt: "LinkedIn Algorithm 2026 — Scout by ClientBloom" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "The LinkedIn Algorithm in 2026: What Actually Drives Reach",
    description: "Saves beat likes 5-to-1. Comments beat likes 2-to-1. Replies to comments add a 2.4x multiplier. Here's what to do with that.",
    images: ["https://scout.clientbloom.ai/og-image.png"],
  },
  alternates: { canonical: "https://scout.clientbloom.ai/blog/linkedin-algorithm-2026" },
  other: {
    "article:published_time": "2026-04-13",
    "article:author": "Scout by ClientBloom",
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

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-8 border-l-4 border-[#4F6BFF] bg-[#4F6BFF]/8 rounded-r-xl px-6 py-5 text-slate-200">
      {children}
    </div>
  )
}

function DataTable({ rows }: { rows: [string, string, string][] }) {
  return (
    <div className="my-8 overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#0f1117] border-b border-slate-800">
            {['Content Format', 'Multiplier vs. Baseline', 'Notes'].map(h => (
              <th key={h} className="px-5 py-3 text-left text-slate-400 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([fmt, mult, note], i) => (
            <tr key={i} className={`border-b border-slate-800/60 ${i % 2 === 0 ? 'bg-[#0a0c12]' : 'bg-[#0d0f15]'}`}>
              <td className="px-5 py-3 text-white font-medium">{fmt}</td>
              <td className="px-5 py-3 text-[#4F6BFF] font-bold">{mult}</td>
              <td className="px-5 py-3 text-slate-400">{note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ArticlePage() {
  const TRIAL_URL  = '/sign-up'
  const SIGNIN_URL = '/sign-in'

  const formatData: [string, string, string][] = [
    ['Polls',                    '1.64x',  'Highest algorithmic lift; great for research-based audiences'],
    ['Documents / Carousels',    '1.45x',  'Saves are extremely high; content lives 2-3 weeks'],
    ['Images (native)',          '1.18x',  'Single sharp image outperforms multi-image; no Canva watermarks'],
    ['Video (native, ≤3 min)',   '1.10x',  'Watch time over 60% adds bonus; external YouTube links penalized'],
    ['Text only',                '0.88x',  'Works for high-follower accounts; harder at sub-5k'],
    ['External link in post',    '~0.3x',  'One link = heavy penalty; move links to first comment'],
  ]

  return (
    <div className="min-h-screen bg-[#080a0f] text-slate-200 font-sans">
      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#080a0f]/90 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-2 sm:gap-4">
          <Link href="/" className="flex items-center gap-2.5 min-w-0 shrink-0">
            <ClientBloomMark size={28} />
            <span className="text-white font-bold tracking-tight">Scout <span className="text-slate-400 font-normal text-sm hidden sm:inline">by ClientBloom</span></span>
          </Link>
          <a href={TRIAL_URL} className="shrink-0 whitespace-nowrap bg-[#4F6BFF] hover:bg-[#3D57F5] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            Start Free Trial
          </a>
        </div>
      </nav>

      <div className="pt-32 pb-24 px-6">
        <article className="max-w-3xl mx-auto">

          {/* Article Header */}
          <div className="mb-12">
            <div className="flex items-center gap-2 mb-4 text-slate-500 text-sm">
              <span>April 13, 2026</span>
              <span>•</span>
              <span>12 min read</span>
            </div>
            <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
              The LinkedIn Algorithm in 2026: Timing, Frequency, Consistency, and Comment Structure
            </h1>
            <p className="text-base sm:text-xl text-slate-400 leading-relaxed">
              Organic reach dropped 34% in 2025. Most people are still posting like it&apos;s 2023. Here&apos;s what actually works now.
            </p>
          </div>

          {/* Article Body */}
          <div className="space-y-6 text-slate-300 text-base leading-relaxed">

            <p>
              LinkedIn had a rough 2025. The company overhauled its feed distribution model in a major way, and average organic reach fell roughly 34% across most account categories. Posts that used to reliably hit 2,000 impressions started coming in at 1,200. Accounts that had built real audiences watched their numbers fall with no clear explanation.
            </p>
            <p>
              The change wasn&apos;t random. It followed a deliberate shift in what LinkedIn is optimizing for. Once you understand that shift, the path forward is clear. But if you&apos;re still posting the same way you were two years ago, you&apos;re running the wrong play.
            </p>

            <h2 className="text-3xl font-bold text-white mt-12 mb-6">What LinkedIn is optimizing for now</h2>
            <p>
              LinkedIn&apos;s stated goal has always been &quot;professional knowledge sharing,&quot; but the algorithm has historically rewarded engagement volume above almost everything else. That created a feedback loop: posts optimized for fast likes won. Posts that were genuinely useful but required thought to engage with? They quietly lost.
            </p>
            <p>
              The 2025 update pushed in a different direction. The algorithm now weights engagement quality more heavily than engagement quantity. A post that gets 10 saves and 8 comments will outperform a post that gets 120 likes and nothing else.
            </p>
            <p>
              The signals LinkedIn now values, in rough order of weight:
            </p>

            <Callout>
              <p className="font-semibold text-white mb-3">The 2026 engagement hierarchy</p>
              <ol className="space-y-2 text-sm">
                <li><span className="text-[#4F6BFF] font-bold">1. Saves</span> — weighted approximately 5x a like; signals &quot;I want to return to this&quot;</li>
                <li><span className="text-[#4F6BFF] font-bold">2. Comments</span> — weighted approximately 2x a like; comments with replies amplify further</li>
                <li><span className="text-[#4F6BFF] font-bold">3. Replies to comments</span> — a 2.4x multiplier on the comment&apos;s signal; conversation threads are rewarded</li>
                <li><span className="text-[#4F6BFF] font-bold">4. Dwell time</span> — LinkedIn tracks how long someone reads, not just whether they scroll past</li>
                <li><span className="text-[#4F6BFF] font-bold">5. Likes</span> — still count, but least differentiated signal in the hierarchy</li>
              </ol>
            </Callout>

            <p>
              The implication of that hierarchy changes how you should think about everything: writing, posting time, content format, and especially how you manage comments after publishing.
            </p>

            <h2 className="text-3xl font-bold text-white mt-12 mb-6">The first 60 minutes</h2>
            <p>
              LinkedIn distributes content in waves. When you publish, your post goes to a small test group first — roughly 2-5% of your first-degree connections and followers. What happens in that group in the next 60 minutes is the most consequential window your post will ever have.
            </p>
            <p>
              If that test group engages at a rate LinkedIn considers &quot;good,&quot; the algorithm expands distribution to a wider audience. If it doesn&apos;t, the post is effectively capped. It stays visible to people who specifically visit your profile, but it won&apos;t show up organically in feeds.
            </p>
            <p>
              This has two practical implications. First, when you post matters. Second, what happens in that first hour matters — and you control more of it than you probably realize.
            </p>
            <p>
              After you publish, stay available. Reply to every comment. Leave a &quot;first comment&quot; yourself (which is also where you should put any links you want to share, since links in the post body trigger a distribution penalty — more on that below). If three people comment and you reply to all three, you&apos;ve effectively tripled the signal volume of that comment thread.
            </p>

            <h2 className="text-3xl font-bold text-white mt-12 mb-6">When to post</h2>
            <p>
              The best time to post on LinkedIn is when the people you&apos;re trying to reach are actively scrolling. That sounds obvious, but it&apos;s worth being specific about.
            </p>
            <p>
              The data for 2025-2026 consistently points to three windows that outperform everything else:
            </p>
            <ul className="list-disc list-inside space-y-3 text-slate-300 my-4">
              <li><span className="text-white font-medium">Tuesday through Thursday, 7:30-9:00 AM</span> in your target audience&apos;s timezone. Morning scroll before the workday fills in. This is the highest-traffic window on desktop.</li>
              <li><span className="text-white font-medium">Tuesday through Thursday, 12:00-1:00 PM</span>. Lunch break is reliably the second-best window. Mobile traffic spikes here.</li>
              <li><span className="text-white font-medium">Tuesday through Thursday, 5:00-6:00 PM</span>. End-of-day scroll, before people fully disconnect. Performs better for longer, more reflective content.</li>
            </ul>
            <p>
              Monday and Friday are notably weaker. Monday is reactive (people are catching up). Friday is exit-mode. Saturday and Sunday see engagement but very low fresh posting from the accounts your audience follows, which sounds like an opportunity — and sometimes is — but the professional context that makes LinkedIn work tends to soften on weekends.
            </p>
            <p>
              One important nuance: these are population-level averages. Your specific audience may behave differently. If you&apos;re targeting founders in early-stage companies, they&apos;re often more active at unusual hours. Test your own data for 6-8 weeks before assuming the averages apply.
            </p>

            <h2 className="text-3xl font-bold text-white mt-12 mb-6">Frequency: how often to post</h2>
            <p>
              The research on this was fairly consistent throughout 2025 and into 2026. The sweet spot for most professional accounts is 3 to 5 posts per week.
            </p>
            <p>
              Below 3, you lose the consistency signals that drive algorithmic momentum. The algorithm rewards accounts that post regularly — not because frequency is directly rewarded, but because consistent publishing trains your audience to engage, which trains the algorithm to distribute.
            </p>
            <p>
              Above 5, you start experiencing audience fatigue and post cannibalization. If you publish twice in one day, your first post&apos;s distribution window is often cut short as the algorithm pivots toward the newer content. The posts compete with each other.
            </p>

            <Callout>
              <p className="font-semibold text-white mb-2">The consistency penalty is a myth</p>
              <p className="text-sm text-slate-300">
                A lot of LinkedIn advice says &quot;you lose momentum if you miss a day.&quot; This isn&apos;t true anymore. Taking a week off does not damage your algorithmic standing. What matters is the sustained pattern over weeks and months. If you post 3x/week for three months, a single gap week changes almost nothing. LinkedIn&apos;s distribution model has gotten smarter about separating short-term and long-term signals.
              </p>
            </Callout>

            <h2 className="text-3xl font-bold text-white mt-12 mb-6">Content format: what the algorithm actually prefers</h2>
            <p>
              Not all content types are treated equally. LinkedIn has clear preferences, and they&apos;ve shifted over the past two years. Here&apos;s the current state:
            </p>

            <DataTable rows={formatData} />

            <p>
              A few things worth calling out from that table:
            </p>
            <p>
              Carousels (document posts) are powerful for a specific reason: they generate saves at a high rate. When someone saves a carousel, they&apos;re signaling &quot;I want to come back to this later.&quot; That&apos;s the highest-quality signal in the hierarchy. Carousels that teach something concrete — a framework, a process, a ranked list — tend to earn disproportionate saves.
            </p>
            <p>
              Text-only posts are underrated for accounts with existing audiences but difficult for smaller accounts. They&apos;re the most likely format to feel genuinely human, but they need to earn dwell time through the quality of the writing, and there&apos;s nothing structural (a visual, a chart) to slow the scroll. If you&apos;re under 5,000 followers, pair your stronger ideas with a single image or a carousel.
            </p>
            <p>
              Polls are algorithmically strong but strategically narrow. They work when the question is genuinely interesting to your audience, not just a mechanism for engagement. &quot;Which is more important, X or Y?&quot; polls feel cheap fast. Use polls to collect real data you can reference later, or to open debates that have no clean answer.
            </p>

            <h2 className="text-3xl font-bold text-white mt-12 mb-6">The link paradox</h2>
            <p>
              LinkedIn penalizes external links in post bodies. This has been true for a few years now, but the penalty has gotten steeper. A post with one external link in the copy typically reaches 40-60% fewer people than the same post without it.
            </p>
            <p>
              Here&apos;s the part most people miss: it&apos;s not links per se. It&apos;s the ratio.
            </p>
            <p>
              Posts with four or more external links in the body actually see 3-5x higher reach than posts with a single link. The theory: LinkedIn&apos;s algorithm reads four links as &quot;resource compilation&quot; content and treats it differently than &quot;here&apos;s my article, click it.&quot; A single link reads as promotional. Four links read as a curated roundup.
            </p>
            <p>
              The most reliable approach remains: leave links out of the post body entirely. Put them in the first comment. This is common practice now. Most of your audience knows to look there, and the posts get full distribution without the penalty.
            </p>

            <h2 className="text-3xl font-bold text-white mt-12 mb-6">Comment structure that amplifies reach</h2>
            <p>
              This is the most underutilized lever in the 2026 algorithm, and the one where intentional behavior pays off most clearly.
            </p>
            <p>
              Comments aren&apos;t just social feedback anymore. They&apos;re active distribution signals. LinkedIn reads comment quality (word count, substance, the presence of additional comments on that comment) as an indicator of how valuable a post is. A post that generates a real conversation is algorithmically treated differently from a post that generates emoji reactions.
            </p>
            <p>
              The structure that works:
            </p>
            <p>
              <span className="text-white font-semibold">Write comments that invite response.</span> &quot;Great post!&quot; is a dead end. &quot;I&apos;ve been testing this with enterprise accounts and seeing the opposite — have you found it scales differently at senior levels?&quot; opens a thread. The algorithm rewards threads.
            </p>
            <p>
              <span className="text-white font-semibold">Reply quickly.</span> The first hour matters most. When you comment on someone&apos;s post within the first 60 minutes of publishing, your comment gets included in the initial distribution wave. Comments that arrive after the wave don&apos;t affect the first-round reach, but they do influence whether LinkedIn expands distribution in round two.
            </p>
            <p>
              <span className="text-white font-semibold">Reply to replies.</span> That 2.4x multiplier on comment signals? It comes from depth. A comment with two nested replies is worth substantially more than two separate comments. When you comment on someone&apos;s post and someone replies to your comment, get back in and continue the thread. Every reply is a data point LinkedIn uses.
            </p>
            <p>
              <span className="text-white font-semibold">Make your first comment count.</span> After you post, your own first comment shapes the frame for what follows. Drop a link there if you have one. Add context you left out of the post. Ask a question that you actually want answered. This immediately signals to the algorithm that something is happening in the comment section — which prompts LinkedIn to distribute slightly more aggressively in the first round.
            </p>

            <h2 className="text-3xl font-bold text-white mt-12 mb-6">What hashtags do (and don&apos;t do) in 2026</h2>
            <p>
              LinkedIn deprecated hashtag following in October 2024. Users can no longer follow hashtags in a way that drives feed content. The discovery function hashtags served for years is effectively gone.
            </p>
            <p>
              Adding hashtags to your posts in 2026 does not meaningfully increase reach. It also doesn&apos;t seem to hurt. The safest approach is to treat hashtags as metadata — if they&apos;re relevant, include two or three. Don&apos;t stuff them, don&apos;t rely on them, and don&apos;t spend energy selecting them carefully. That time is better spent on the first comment.
            </p>

            <h2 className="text-3xl font-bold text-white mt-12 mb-6">Content lifespan: 2 to 3 weeks</h2>
            <p>
              One of the clearest shifts in the 2025-2026 algorithm is extended content lifespan. Where posts used to peak within 48 hours and fade, the current algorithm actively resurfaces posts that continue to accumulate engagement over a longer window.
            </p>
            <p>
              Carousels and documents are the primary beneficiaries. A carousel that earns consistent saves over two weeks will continue receiving distribution boosts throughout that window. This changes how you should think about the ROI of high-effort content.
            </p>
            <p>
              A long, well-structured carousel that takes 4 hours to build might outperform 10 text posts written in 4 hours total, because it compounds. Each new save restarts a mini-distribution event. Each comment reactivates the thread&apos;s signal value. The posts that age well are ones built around durable frameworks, not news-of-the-moment observations.
            </p>

            <h2 className="text-3xl font-bold text-white mt-12 mb-6">The reach problem has a relationship layer</h2>
            <p>
              Here&apos;s something the algorithm obsessives miss: reach matters, but reach to whom matters more.
            </p>
            <p>
              LinkedIn&apos;s distribution logic has a significant preference for your first-degree connections. If you comment on your prospects&apos; posts consistently, those interactions become signals that LinkedIn uses to decide whether to show your content to those people. Engagement creates reciprocity in the feed in a very literal, algorithmic sense.
            </p>
            <p>
              This is why the people who perform best on LinkedIn in 2026 aren&apos;t necessarily the ones with the best content strategy. They&apos;re the ones who combine a reasonable content strategy with systematic prospect engagement. They show up in their target accounts&apos; feeds both as content creators and as commenters. That dual presence is harder to build at scale — but the combination is what separates the accounts that generate real pipeline from the accounts that just have good numbers.
            </p>

            <h2 className="text-3xl font-bold text-white mt-12 mb-6">Putting it together: a practical system</h2>
            <p>
              A weekly rhythm that reflects everything above:
            </p>
            <ol className="list-decimal list-inside space-y-4 text-slate-300 my-4">
              <li className="pl-1">
                <span className="text-white font-medium">Plan Monday evening (15 minutes).</span> Decide what you&apos;re posting Tuesday-Thursday and in which format. Don&apos;t improvise day-of — you make worse decisions under the pressure of the blank page.
              </li>
              <li className="pl-1">
                <span className="text-white font-medium">Post at 7:30-8:30 AM in your audience&apos;s timezone.</span> Stay available for the first 60 minutes. Reply to every comment. Drop your first comment with any supporting link and a framing question.
              </li>
              <li className="pl-1">
                <span className="text-white font-medium">Comment on 3-5 target prospect posts per day.</span> Not just any posts. The ones where your comment adds something real and positions you as someone worth following. Time the comments for morning or early afternoon to catch the distribution window.
              </li>
              <li className="pl-1">
                <span className="text-white font-medium">One carousel or document per week.</span> This is your save-driver. Build it around a framework, a ranked list, or a how-to that people will want to revisit. The other 2-4 posts can be text + image or text only.
              </li>
              <li className="pl-1">
                <span className="text-white font-medium">Review your data biweekly.</span> Not to obsess over numbers, but to identify which posts triggered the second-wave distribution. Look for patterns: topic, format, time of day, length of first comment. Then do more of what extended the lifespan.
              </li>
            </ol>

            <h2 className="text-3xl font-bold text-white mt-12 mb-6">Why this is harder than it sounds</h2>
            <p>
              Reading the above, it might seem manageable. Post three times a week, comment on some prospects, reply quickly, use carousels. Fine.
            </p>
            <p>
              The friction shows up when you try to do this at scale with a real prospect list. If you have 50 or 100 target accounts, manually checking whether they posted something today, deciding whether that post is worth commenting on, drafting a comment that&apos;s actually useful, and doing this consistently five days a week while running your business — it compounds fast. Most people make it 3 weeks before it quietly stops happening.
            </p>
            <p>
              The accounts that execute this consistently are the ones that have a monitoring layer. Something that surfaces relevant activity automatically. Something that scores posts so you&apos;re not making judgment calls cold, at 7 AM, on whether this particular post is worth your time. Something that helps you draft a comment that sounds like you, not like a template.
            </p>
            <p>
              That&apos;s not a sales pitch. That&apos;s just where the bottleneck is for anyone who has tried to do this at real scale. The strategy isn&apos;t the hard part. The execution is.
            </p>

          </div>

          {/* Dual CTA Block */}
          <div className="mt-16 space-y-4">
            {/* Primary: non-customers */}
            <div className="p-8 bg-[#0f1117] border border-slate-800 rounded-xl text-center">
              <h3 className="text-2xl font-bold text-white mb-4">See who in your prospect list posted today</h3>
              <p className="text-slate-400 mb-6 max-w-lg mx-auto">
                Scout monitors your target accounts and keyword searches twice daily, scores every post for engagement value, and helps you draft comments in 10 seconds. Start free for 7 days.
              </p>
              <a
                href={TRIAL_URL}
                className="inline-flex items-center justify-center gap-2 w-full sm:w-auto whitespace-nowrap bg-[#4F6BFF] hover:bg-[#3D57F5] text-white font-semibold px-8 py-4 rounded-xl transition-all hover:scale-[1.02] shadow-lg shadow-[#4F6BFF]/25"
              >
                Start Your Free 7-Day Trial
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </a>
            </div>

            {/* Secondary: existing users */}
            <div className="p-5 bg-[#0a0c12] border border-slate-800/60 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-slate-400 text-sm text-center sm:text-left">
                Already using Scout? Your Inbox has everything you need to execute this framework today.
              </p>
              <a
                href={SIGNIN_URL}
                className="shrink-0 text-sm font-medium text-[#4F6BFF] hover:text-white border border-[#4F6BFF]/50 hover:border-[#4F6BFF] hover:bg-[#4F6BFF] px-5 py-2.5 rounded-lg transition-all whitespace-nowrap"
              >
                Sign In to Scout
              </a>
            </div>
          </div>

          {/* Back link */}
          <div className="mt-10">
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
