# Scout Copy Strategy — Public Pages

**Status:** Live in production  
**Last updated:** April 13, 2026  
**Scope:** All public-facing pages: `/`, `/compare`, `/about`, `/blog`, `/blog/*`

---

## Core Positioning

Scout is for **anyone who uses LinkedIn to grow their business and the relationships that drive it.** This is not a consultant-only or B2B-sales-only tool. The audience is any business owner, professional, or team whose next client, customer, or partner is on LinkedIn.

The core value proposition: Scout surfaces the conversations your ideal prospects are already having on LinkedIn, scores them by engagement opportunity, and writes a comment in your voice — automatically, twice a day. You stay consistently visible in the right places without the manual overhead.

---

## Audience Rules

### Who Scout is for (complete list)
Every public page should be written to include all of these personas, not a narrow subset:

1. Solo consultants and fractional executives building personal brand pipeline
2. Founders and entrepreneurs closing through relationships, not cold outreach
3. Agency owners running BD alongside client delivery
4. Sales professionals warming prospects before the first message
5. Coaches and advisors building thought leadership visibility
6. Service professionals in relationship-driven industries (real estate, financial services, recruiting, legal)
7. Small teams needing consistent LinkedIn presence without a full outbound function

### Language rules
- Never use "consultants" as a stand-in for the full audience in visible copy or metadata
- "GTM teams" and "sales professionals" are acceptable as part of a list, not as the sole descriptor
- Preferred inclusive language: "business owners," "professionals," "anyone building on LinkedIn," "anyone whose next client is on LinkedIn"

---

## Terminology Rules

### ICP — do not use in customer-facing copy
"ICP" (Ideal Customer Profile) is a B2B marketing term understood by roughly 20–30% of Scout's potential audience. It does not appear in any public-facing copy.

**Approved replacements:**

| Context | Replacement |
|---|---|
| Prose/body copy | "the people you want to reach," "your ideal clients," "your target prospects" |
| Feature names | "target profiles," "target prospect posts" |
| Scoring descriptions | "engagement opportunity," "engagement quality" |
| Monitoring descriptions | "the people and topics you care about" |
| Pricing feature lists | "target profiles monitored" |
| Hero badge / labels | "Prospect Intelligence" |

If ICP language appears in newly written copy, replace it before publishing.

---

## FAQ Strategy

The FAQ is an objection handler, not a feature explainer. Questions are ordered by conversion priority — the most common reason someone closes the tab comes first.

### Current FAQ order and rationale

1. **Does Scout need access to my LinkedIn account?** — #1 silent fear for any LinkedIn-adjacent tool. Answer it first.
2. **How does Scout find the right conversations?** — Product comprehension. Explains setup and daily function in plain language.
3. **What does the AI scoring mean?** — Builds confidence in the filtering mechanism.
4. **What if I'm not totally sure who I want to target yet?** — Removes onboarding paralysis. Permission to start imperfect.
5. **Will Scout make me look spammy on LinkedIn?** — Reputation objection. Critical for anyone who's seen AI comment tools go wrong.
6. **How is this different from searching LinkedIn manually?** — Comparison objection. Consistency and history are the key differentiators.
7. **What's actually included in the free trial?** — Removes trial anxiety. Full product, no gates, no card required.
8. **Can I customize how Scout scores posts?** — Power-user confidence. Shows depth.
9. **How does the suggested comment work — does it sound like AI?** — Quality objection. One of the strongest closers on the page.
10. **Can I connect my CRM?** — Plan-specific. Agency tier qualification.
11. **Who built this?** — Credibility/trust.
12. **What if I want to cancel?** — Final friction remover.

### Rules for future FAQ additions
- New questions must address a real objection, not demonstrate a feature
- Never open a FAQ with a question that introduces anxiety the user didn't have (e.g., asking about technical infrastructure they never thought about)
- Keep answers under ~80 words where possible — scannable, not exhaustive

---

## Trial Length

**The trial is 7 days, no credit card required.**

This must be consistent across every page. The trial length appears in:
- Main landing page hero and pricing section: "7-day free trial"
- Compare page table: "7 days"
- About page CTA: "Start Your Free 7-Day Trial"
- Blog article CTAs: "Start Your Free 7-Day Trial"

If you update the trial length in Stripe, update all five locations above.

---

## Page-by-Page Status

### `/` — Landing page
**Audience:** Fully broadened. Testimonials, pricing descriptions, and comparison table no longer assume consultant audience.  
**ICP:** Removed from all 12 locations.  
**FAQ:** Complete replacement (April 2026). 12 items, conversion-ordered.  
**Who This Is For section:** Added between How It Works and Comparison table. 6-card grid covering all key personas.

### `/compare`
**Audience:** Twitter meta broadened. Scout "best for" card updated.  
**ICP:** Removed from all 7 feature rows, notes, and body copy references.  
**Trial:** Consistent (7 days in table).

### `/about`
**Audience:** All 3 metadata fields broadened. "Who Scout is for" expanded from 4 to 7 bullets.  
**ICP:** Removed from body copy.  
**Trial:** Corrected from 14-day to 7-day.

### `/blog` (index)
**Status:** Clean. No changes needed. Copy is appropriately broad.

### `/blog/warm-up-linkedin-prospects`
**ICP:** Removed from 4 body copy locations.  
**Trial:** Corrected from 14-day to 7-day.  
**Note:** The article uses "B2B SaaS founders" as a pedagogical example of getting specific with targeting. This is intentional — do not genericize instructional examples. Future articles should use non-B2B examples to diversify the content portfolio.

---

## SEO and Metadata Standards

Every public page must have:
- `metadata.title` — specific, compelling, under 60 chars
- `metadata.description` — audience-inclusive, under 160 chars, no "consultants only" framing
- `openGraph.title` and `.description` — can be slightly shorter/punchier than metadata
- `twitter.card: 'summary_large_image'`
- `alternates.canonical` — full absolute URL

**Do not use these phrases in metadata descriptions:**
- "for consultants" (unless as part of a longer inclusive list)
- "GTM teams" as sole audience descriptor
- "serious LinkedIn sellers" (excludes coaches, founders, service professionals)

---

## Future Blog Articles — Rules

1. Use `/blog/warm-up-linkedin-prospects/page.tsx` as the template (nav, heading scale, OG metadata are all correct)
2. Do not use ICP terminology — use "the people you want to reach," "target profiles," etc.
3. Instructional examples should vary industries across the blog portfolio (not always B2B SaaS)
4. Every article CTA uses: "Start Your Free 7-Day Trial"
5. Add each new article to the `articles` array in `/blog/page.tsx`
