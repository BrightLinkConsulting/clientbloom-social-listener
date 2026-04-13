# Scout Mobile UX — Standards, Known Issues, and Patterns

**Status:** Live in production  
**Last updated:** April 2026  
**Scope:** All public-facing pages and authenticated app pages

---

## Summary

Scout targets B2B consultants and GTM professionals who check their feed and engage with prospects throughout the day — often from their phone. Mobile-first UX is not optional; it directly affects trial conversion and daily active usage.

This document captures the mobile strategy, known patterns, resolved bugs, and adversarial test checklist for all pages.

---

## Breakpoints Used

Scout uses standard Tailwind CSS breakpoints:

| Prefix | Min width | Use case |
|---|---|---|
| (none) | 0px | Base mobile styles |
| `sm:` | 640px | Larger phones, small tablets |
| `md:` | 768px | Tablets, landscape phones |
| `lg:` | 1024px | Laptops, desktops |
| `xl:` | 1280px | Wide desktops |

**No custom breakpoints** — all responsive classes use standard Tailwind prefixes.

---

## Public Pages — Mobile Fixes (April 2026)

### Landing page (`/`)

**Fixed:**
1. **Nav CTA button was cropping on narrow screens** — Root cause: no `shrink-0` on the NeonButton and excessive `gap-4` between nav items. Fix: added `shrink-0 whitespace-nowrap` to NeonButton, changed gap to `gap-2 sm:gap-4`, reduced outer padding to `px-4 sm:px-6`, hid "by ClientBloom" text below sm breakpoint (`hidden sm:inline`).

2. **4-column comparison table was completely broken on mobile** — The `grid-cols-4` grid had no overflow constraint. Fix: added `overflow-x-auto` wrapper inside the existing glow container div, plus `min-w-[560px]` on the grid itself, plus a swipe hint (`← Swipe to compare →`) visible only on mobile (`md:hidden`). Glow div now has `hidden md:block` since box-shadow isn't visible when content scrolls.

3. **All `text-4xl` section headings overflowed on small screens** — Fix: changed all `text-4xl` headings to `text-2xl sm:text-3xl md:text-4xl` throughout the page. Final CTA h2 was `text-5xl` — changed to `text-3xl sm:text-4xl md:text-5xl`.

4. **Hero subheadline `text-xl` too large on mobile** — Fix: `text-base sm:text-xl`.

5. **CTA button text wrapping** — "Start Your Free 7-Day Trial" + arrow icon would split across two lines on mobile. Fix: added `w-full sm:w-auto whitespace-nowrap` to all hero CTA NeonButtons.

**Mobile pattern: NeonButton on public pages**

Every NeonButton used as a primary CTA should include:
```jsx
<NeonButton
  href={url}
  variant="solid"
  size="lg"
  className="w-full sm:w-auto whitespace-nowrap"
>
  CTA Text
</NeonButton>
```

For nav buttons (small, inline):
```jsx
<NeonButton
  href={url}
  variant="solid"
  size="sm"
  className="shrink-0 whitespace-nowrap"
>
  Start Free Trial
</NeonButton>
```

### Compare page (`/compare`)

**Fixed:**
1. **Nav CTA button** — same `shrink-0 whitespace-nowrap` fix as landing page
2. **CTA button at bottom** — added `w-full sm:w-auto whitespace-nowrap justify-center`
3. **Table** — already had `overflow-x-auto` wrapper, added `min-w-[480px]` on the `<table>` and reduced `px-6` cell padding to `px-4 sm:px-6`
4. **Verdict cards** — changed `md:grid-cols-2` to `sm:grid-cols-2` so they stack on phones and go side-by-side at 640px

**Copy rewrite:** The compare page was rewritten to more clearly highlight Scout's superiority for LinkedIn engagement while remaining factually honest. Key changes: added "Scout wins. It's not close." callout card, renamed "Why these tools aren't actually competitors" section to "Where Sales Navigator falls short," added pricing context card showing Scout starts at $49 vs Sales Nav at $99.

### About page (`/about`) and Blog page (`/blog`)

**Fixed:**
1. **Nav** — same fix as landing page (shrink-0, hidden sm:inline for "by ClientBloom")
2. **CTA button on about page** — changed `px-10 py-5` to `px-8 py-4`, added `w-full sm:w-auto whitespace-nowrap`

### Privacy Policy (`/privacy-policy`) and Terms (`/terms`)

These pages use simple navs with just "Scout by ClientBloom" text and a "Sign in" link — no buttons, no overflow issues. No mobile fixes required.

---

## Authenticated Pages — Mobile Fixes (April 2026)

### Dashboard feed (`/`)

**Fixed:**
1. **Engagement Momentum widget `grid-cols-4`** — the 4-stat row (Surfaced / Engaged / Replied / Rate) at `text-xl` was tight on a 375px screen. Changed to `grid-cols-2 sm:grid-cols-4` so it renders as a clean 2×2 grid on mobile and expands to a single row on larger screens.

### Settings (`/settings`)

**Fixed:**
1. **ICP profile detail drawer fixed at `w-[340px]`** — on a 375px screen, this left only 35px visible on the left side, making it nearly impossible to dismiss. Changed to `w-full sm:w-[340px]` so it becomes a full-screen sheet on mobile.

**Already mobile-friendly:**
- Tab navigation uses `overflow-x-auto scrollbar-none` — tabs scroll horizontally on mobile
- All section cards use `max-w-3xl mx-auto px-5` — appropriate mobile padding
- The `grid-cols-2` inside the ICP drawer is fine (340px or full-screen, 2 columns remain readable)

### Sign In / Sign Up (`/sign-in`, `/sign-up`)

Already mobile-optimized: uses `flex flex-col lg:flex-row` layout. The form card is full-width on mobile, left panel (animated feed) is `hidden lg:flex`. No fixes required.

### Upgrade (`/upgrade`)

Already mobile-optimized: pricing grid uses `grid-cols-1 md:grid-cols-3`. No fixes required.

### Onboarding (`/onboarding`)

Single-column centered layout with `max-w-2xl`. No mobile issues found.

---

## Mobile Testing Checklist

When making changes to any public or authenticated page, verify:

### Public pages
- [ ] Nav logo + "by ClientBloom" text hides `hidden sm:inline` on narrow screens
- [ ] Nav CTA button has `shrink-0 whitespace-nowrap`
- [ ] All `text-4xl+` headings have responsive prefixes (`text-2xl sm:text-3xl md:text-4xl`)
- [ ] Primary CTA buttons have `w-full sm:w-auto whitespace-nowrap`
- [ ] Any table or multi-column grid is wrapped in `overflow-x-auto` or has responsive column counts
- [ ] Hero subheadlines are `text-base sm:text-xl` (not raw `text-xl`)
- [ ] No fixed-width containers wider than the viewport (`w-[Xpx]` exceeding 375px without `sm:` qualifier)

### Authenticated pages
- [ ] Any fixed-right drawer uses `w-full sm:w-[Xpx]`
- [ ] Stat grids use `grid-cols-2 sm:grid-cols-N` when N ≥ 4
- [ ] Header nav labels truncate gracefully at 375px width
- [ ] Post cards and feed items use `min-w-0` on flex children to prevent overflow

---

## OG Image / Social Sharing (April 2026)

### What was fixed

All public pages now include a consistent OG image (`/og-image.png`, 1200×630px) for clean social sharing previews. When you send the Scout link via Slack, iMessage, LinkedIn, or Twitter, it will show the Scout ClientBloom logo and branding.

**File required:** `/public/og-image.png` — must be 1200×630px. The Scout brand team should create this as a clean brand card with the ClientBloom mark, "Scout by ClientBloom" wordmark, and tagline.

### Pages with OG images
- `/` — inherited from `layout.tsx`
- `/compare` — explicit `openGraph.images`
- `/about` — explicit `openGraph.images`
- `/blog` — explicit `openGraph.images`
- `/privacy-policy` — explicit `openGraph.images`
- `/terms` — explicit `openGraph.images`

---

## JSON-LD Structured Data

### `layout.tsx` — SoftwareApplication schema
The root layout includes `SoftwareApplication` schema with:
- Price corrected to `lowPrice: 49.00` (was incorrectly `79.00`)
- `AggregateOffer` with low/high price range ($49–$249)
- Full feature list including Slack digest and post history archive

### `page-landing.tsx` — FAQPage schema
The landing page includes `FAQPage` JSON-LD with 5 common Scout questions. This improves:
- Google FAQ rich results (expandable Q&A in search results)
- AI crawler comprehension for LLM-powered answers (ChatGPT, Perplexity, etc.)
- Voice search relevance

---

## Adversarial Mobile Test Cases

The following scenarios are verified to work on 375×667px viewport (iPhone SE 3):

| Scenario | Expected | Status |
|---|---|---|
| Nav at 375px: logo + CTA button | Both visible, button not clipped | ✅ Fixed |
| Nav at 375px: "Sign in" + CTA button | Both fit without overlap | ✅ Fixed |
| Comparison table on landing page | Horizontally scrollable, swipe hint visible | ✅ Fixed |
| CTA button "Start Your Free 7-Day Trial" | Single line, no wrap | ✅ Fixed |
| Section heading "The conversations are already happening." | 3 lines max at `text-3xl` | ✅ Fixed |
| ICP profile detail drawer on settings | Full-screen slide-in | ✅ Fixed |
| Engagement Momentum 4 stats | 2×2 grid, readable | ✅ Fixed |
| Compare page table | Horizontally scrollable, min-w-[480px] | ✅ Fixed |
| Settings tab bar (7 tabs) | Horizontally scrollable without cutoff | ✅ Already good |
| Sign-in page form | Full-width card, animated panel hidden | ✅ Already good |
| Pricing section (3-tier grid) | Stacked single-column | ✅ Already good |

---

## Key Anti-Patterns to Avoid

1. **Never use `text-4xl` or larger without a mobile prefix** — always `text-2xl sm:text-3xl md:text-4xl` or similar
2. **Never use raw `flex items-center gap-4` in a nav with a button** — the button will get clipped; use `gap-2 sm:gap-4` and `shrink-0`  
3. **Never use `grid-cols-N` (N≥4) without a mobile fallback** — always `grid-cols-2 sm:grid-cols-N`
4. **Never use `w-[Xpx]` on a fixed panel without `sm:w-[Xpx]`** — the panel will fill/overflow mobile screens
5. **Never put a long CTA button in `inline-flex` without `whitespace-nowrap`** — text will break mid-label
6. **Never wrap a wide table in `overflow-hidden` without `overflow-x-auto`** — the table becomes unreadable and unscrollable

---

## Future Mobile Improvements (Not Yet Implemented)

1. **Admin panel** — the admin panel (`/admin`) is currently desktop-only and not optimized for mobile. Given that it's an operator tool, this is acceptable for now. If mobile access becomes needed, the main panels (tenants list, health strip, ApifyPanel) will need responsive layout work.

2. **Blog article pages** — when individual blog article pages are built, ensure they use `prose` max-width and `text-base` body text (not `text-lg`) on mobile.

3. **Onboarding step indicators** — step dots at the top of onboarding may benefit from a horizontal progress bar on very small screens.

4. **CRM push modal** — the CRM push confirmation modal inside the feed uses fixed-width positioning that could be reviewed for very narrow screens.
