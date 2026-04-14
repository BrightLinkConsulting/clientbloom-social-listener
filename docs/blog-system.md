# Scout Blog System

## Last updated: April 2026

---

## Overview

The Scout blog lives at `https://scout.clientbloom.ai/blog` and is built as static
Next.js App Router pages. There is no CMS — each post is a standalone `.tsx` file.
All pages are server-rendered for full SEO and GEO (Generative Engine Optimization)
compatibility.

The blog serves two purposes:
1. **Organic search and AI discoverability** — long-form tactical content that ranks
   for LinkedIn strategy keywords and surfaces in AI-generated answers (ChatGPT, Perplexity,
   Claude, etc.)
2. **Email funnel support** — Email 4 of the trial sequence links to `/blog/linkedin-algorithm-2026`
   as a value-add for the timing education angle

---

## Directory Structure

```
dashboard/app/blog/
├── page.tsx                          ← Blog index (lists all articles)
├── linkedin-algorithm-2026/
│   └── page.tsx                      ← "The LinkedIn Algorithm in 2026" article
└── warm-up-linkedin-prospects/
    └── page.tsx                      ← "How to Warm Up LinkedIn Prospects" article
```

Each article lives in its own folder named after its URL slug. The folder name IS the
slug — `app/blog/my-article/page.tsx` maps to `/blog/my-article`.

---

## Adding a New Blog Post

### 1. Create the folder and file

```bash
mkdir dashboard/app/blog/your-article-slug
touch dashboard/app/blog/your-article-slug/page.tsx
```

### 2. Use the article template

```typescript
/**
 * Blog Article: [Title]
 * Server-rendered for SEO + GEO
 */

import { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: "[Full article title]",
  description: "[150–160 character description. Lead with the key insight — not 'In this article we...' — answer the user's question in the description itself.]",
  keywords: [
    "primary keyword phrase",
    "secondary keyword phrase",
    // 6–10 total — specific long-tail phrases, not single words
  ],
  openGraph: {
    title: "[Full article title]",
    description: "[Same as description, or a slightly punchier version]",
    url: "https://scout.clientbloom.ai/blog/your-article-slug",
    type: "article",
    images: [{ url: "https://scout.clientbloom.ai/og-image.png", width: 1200, height: 630, alt: "[Alt text]" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "[Twitter-optimized title — shorter, punchier]",
    description: "[One sharp line with the key data point or claim]",
    images: ["https://scout.clientbloom.ai/og-image.png"],
  },
  alternates: { canonical: "https://scout.clientbloom.ai/blog/your-article-slug" },
  other: {
    "article:published_time": "YYYY-MM-DD",
    "article:author": "Scout by ClientBloom",
  },
}

export default function YourArticlePage() {
  return (
    <div className="min-h-screen bg-[#0a0c10]">
      {/* Nav */}
      <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          {/* ClientBloomMark SVG + Scout text */}
        </Link>
        <div className="flex gap-3">
          <Link href="/sign-in" className="text-sm text-white/60 hover:text-white transition-colors">Sign in</Link>
          <Link href="/trial/start" className="text-sm bg-[#7C3AED] hover:bg-[#6D28D9] text-white px-4 py-1.5 rounded-lg transition-colors font-medium">Start free trial</Link>
        </div>
      </nav>

      {/* Article */}
      <article className="max-w-2xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-12">
          <p className="text-[#7C3AED] text-sm font-semibold mb-4">CATEGORY · Month YYYY</p>
          <h1 className="text-4xl font-bold text-white leading-tight mb-6">[Article Title]</h1>
          <p className="text-xl text-white/70 leading-relaxed">[1-2 sentence lede that delivers the core promise]</p>
        </div>

        {/* Body — use prose styling */}
        {/* ... */}

        {/* Dual CTA — required on every article */}
        <div className="mt-16 border border-white/10 rounded-2xl p-8 bg-white/[0.02]">
          <h2 className="text-2xl font-bold text-white mb-3">Put this into practice with Scout</h2>
          <p className="text-white/60 mb-6">
            Scout scans LinkedIn daily and surfaces the posts where your ideal clients are
            most active. Timing, ICP targeting, and comment angle — all in one feed.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/trial/start"
              className="inline-flex items-center justify-center gap-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold px-6 py-3 rounded-xl transition-colors"
            >
              Start your free 7-day trial
            </Link>
            <Link
              href="/sign-in"
              className="inline-flex items-center justify-center gap-2 border border-white/20 hover:border-white/40 text-white/70 hover:text-white font-medium px-6 py-3 rounded-xl transition-colors"
            >
              Sign in to Scout
            </Link>
          </div>
          <p className="text-white/30 text-sm mt-4">No credit card required · Cancel anytime</p>
        </div>
      </article>
    </div>
  )
}
```

### 3. Add the article to the blog index (`app/blog/page.tsx`)

Add a new entry at the **top** of the `articles` array (newest first):

```typescript
const articles = [
  {
    title: 'Your New Article Title',
    excerpt: 'One sentence that delivers the article\'s core value. Lead with the insight.',
    url: '/blog/your-article-slug',
    date: 'YYYY-MM-DD',
    readTime: 'X min read',
  },
  // ... existing articles
]
```

---

## SEO and GEO Requirements

Every article must include:

**Required metadata fields:**
- `title` — full article title, 50–60 characters ideal for SEO
- `description` — 150–160 characters, leads with the key data or claim
- `keywords` — 6–10 specific long-tail phrases (not single words)
- `openGraph.url` — full canonical URL
- `openGraph.type: "article"`
- `alternates.canonical` — same as openGraph.url
- `article:published_time` — ISO date string

**GEO optimization rules (for AI discoverability):**
- Use concrete data points with specific numbers where possible (e.g. "saves count 5x more than likes" not "saves matter a lot")
- Include a clear H1 that directly answers the query someone would type into an AI
- Structure content with scannable H2 subheadings so AI can extract individual facts
- Avoid vague "best practices" language — AI summarizers prefer factual, specific claims

---

## Dual CTA Rule

**Every article must include a dual CTA block near the bottom.**

The dual CTA serves two audiences:
- Visitors who have never heard of Scout → `/trial/start` (primary)
- Existing trial or paid users who land from an email → `/sign-in` (secondary)

Do not use a single CTA pointing only to the trial. Existing users who click a link from
an email (e.g. Email 4 links to the algorithm article) should be able to get back into
their account without having to navigate.

---

## Style Guide

**Tone:** Direct, data-first, practitioner-to-practitioner. No motivational fluff. Lead
with the insight, then explain it. Scout's blog is not a marketing blog — it's a
tactical reference for people who are already trying to build LinkedIn authority.

**Structure:**
- Short lede (1-2 sentences) that delivers the promise
- Body organized by H2 subheadings (not walls of text)
- Data tables for comparisons where applicable (`DataTable` component pattern from the algorithm article)
- Callout boxes for key insights (`Callout` component)
- Dual CTA at the end

**Copy rules (same as email copy):**
- No em-dashes in body copy — use periods, commas, or colons
- No "consultant" as a stand-in for all users — Scout's TAM is broad
- No filler phrases like "In this article, we'll explore..."

---

## Current Articles

| Slug | Title | Published | Linked from email |
|------|-------|-----------|-------------------|
| `linkedin-algorithm-2026` | The LinkedIn Algorithm in 2026: Timing, Frequency, Consistency, and Comment Structure | 2026-04-13 | Email 4 (Day 4 trial email) |
| `warm-up-linkedin-prospects` | How to Warm Up LinkedIn Prospects | (check page.tsx for date) | Not currently linked |

---

## Deployment

Blog pages deploy automatically with the main app. No separate build step. Pages are
server-rendered (not static-exported) so metadata is always fresh.

The blog is part of the `dashboard` Next.js app on Vercel. Publishing a new article =
push to `main` → Vercel auto-deploys.
