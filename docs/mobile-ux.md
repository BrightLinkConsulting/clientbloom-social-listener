# Scout Mobile UX — Standards, Known Issues, and Patterns

**Status:** Live in production  
**Last updated:** April 13, 2026  
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

2. **"Start Free Trial" button still cropped after `shrink-0` fix (second root cause)** — The comparison table further down the page had `min-w-[560px]` with no `overflow-x-hidden` on the page wrapper. This made the entire viewport scrollable sideways, which made the nav *appear* cropped — the button was actually rendered off the right edge of the visible area. Fix: added `overflow-x-hidden` to the outermost div in `page-landing.tsx`. The table itself remains scrollable via its own `overflow-x-auto` inner wrapper. This is the correct separation: the table scrolls within its container; the viewport never shifts.

3. **"Sign in" was incorrectly hidden on mobile during CTA fix attempt** — An early fix removed "Sign in" on mobile (`hidden sm:inline`) to make room for the CTA button. Reverted: "Sign in" must always be visible since users need to log in from their phone. Correct solution: use responsive text spans on the CTA button (`<span className="sm:hidden">Free Trial</span><span className="hidden sm:inline">Start Free Trial</span>`) so the label is shorter on mobile without hiding any navigation.

4. **4-column comparison table was completely broken on mobile** — The `grid-cols-4` grid had no overflow constraint. Fix: added `overflow-x-auto` wrapper inside the existing glow container div, plus `min-w-[560px]` on the grid itself, plus a swipe hint (`← Swipe to compare →`) visible only on mobile (`md:hidden`). Glow div now has `hidden md:block` since box-shadow isn't visible when content scrolls.

5. **All `text-4xl` section headings overflowed on small screens** — Fix: changed all `text-4xl` headings to `text-2xl sm:text-3xl md:text-4xl` throughout the page. Final CTA h2 was `text-5xl` — changed to `text-3xl sm:text-4xl md:text-5xl`.

6. **Hero subheadline `text-xl` too large on mobile** — Fix: `text-base sm:text-xl`.

7. **CTA button text wrapping** — "Start Your Free 7-Day Trial" + arrow icon would split across two lines on mobile. Fix: added `w-full sm:w-auto whitespace-nowrap` to all hero CTA NeonButtons.

8. **Hero H1 copy** — Capitalised "Next" and "Client" in the hero headline (`Your Next Client`) to match brand intent. No other copy changes.

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

For nav buttons (small, inline) with responsive label shortening:
```jsx
<NeonButton
  href={url}
  variant="solid"
  size="sm"
  className="shrink-0 whitespace-nowrap"
>
  <span className="sm:hidden">Free Trial</span>
  <span className="hidden sm:inline">Start Free Trial</span>
</NeonButton>
```

### Compare page (`/compare`)

**Fixed:**
1. **Nav CTA button** — same `shrink-0 whitespace-nowrap` fix as landing page
2. **CTA button at bottom** — added `w-full sm:w-auto whitespace-nowrap justify-center`
3. **Table** — already had `overflow-x-auto` wrapper, added `min-w-[480px]` on the `<table>` and reduced `px-6` cell padding to `px-4 sm:px-6`
4. **Verdict cards** — changed `md:grid-cols-2` to `sm:grid-cols-2` so they stack on phones and go side-by-side at 640px
5. **Viewport-level horizontal scroll** — added `overflow-x-hidden` to the outermost page div (same root cause as landing page; any wide child without proper containment leaks scroll to the whole viewport)

**Copy rewrite:** The compare page was rewritten to more clearly highlight Scout's superiority for LinkedIn engagement while remaining factually honest. Key changes: added "Scout wins. It's not close." callout card, renamed "Why these tools aren't actually competitors" section to "Where Sales Navigator falls short," added pricing context card showing Scout starts at $49 vs Sales Nav at $99.

### About page (`/about`) and Blog page (`/blog`)

**Fixed:**
1. **Nav** — same fix as landing page (shrink-0, hidden sm:inline for "by ClientBloom")
2. **CTA button on about page** — changed `px-10 py-5` to `px-8 py-4`, added `w-full sm:w-auto whitespace-nowrap`

### Blog article page (`/blog/warm-up-linkedin-prospects`)

**Fixed:**
1. **Nav** — same `shrink-0 whitespace-nowrap`, `px-4 sm:px-6`, `hidden sm:inline` fixes as all other public pages
2. **H1 `text-5xl md:text-6xl`** — had no mobile size, rendering at 3rem on a 375px phone. Changed to `text-3xl sm:text-5xl md:text-6xl`
3. **Subheadline `text-xl`** — changed to `text-base sm:text-xl`
4. **Article CTA button** — added `w-full sm:w-auto whitespace-nowrap justify-center` so it doesn't clip on narrow screens
5. **OG metadata and canonical** — added full `openGraph`, `twitter`, and `alternates.canonical` metadata

**Rule for future blog articles:** any new article page must follow the same nav pattern and font-size scale as the existing article. Copy the nav block and heading classes from `/blog/warm-up-linkedin-prospects/page.tsx` as the starting template.

### Privacy Policy (`/privacy-policy`) and Terms (`/terms`)

These pages use simple navs with just "Scout by ClientBloom" text and a "Sign in" link — no buttons, no overflow issues. No mobile fixes required.

---

## Authenticated Pages — Mobile Fixes (April 2026)

### Trial banner — pulse animation

**Fixed:** The ping dot in the trial banner was animating at Tailwind's default 1 second, which felt aggressive and distracting on mobile where users spend more time with the banner in view. Slowed to 2.5s using the arbitrary property class `[animation-duration:2.5s]` on the ping element. Inner dot color softened to `bg-violet-400/80` and box-shadow reduced in intensity. The effect is now a slow, ambient pulse — visible but not attention-demanding.

```jsx
<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-40 [animation-duration:2.5s]" />
```

### Dashboard feed — filter bar (`/`)

**Fixed:** The feed control bar (search + sort + score + Select + Refresh) was broken on mobile. The single-row `flex items-center` layout caused elements to overlap and the "Select" button to be cropped off-screen.

Rebuilt as a two-row layout on mobile, collapsing to a single row at `sm:`:

```jsx
<div className="flex flex-col sm:flex-row sm:items-center gap-2">
  {/* Row 1: Search — full width on mobile */}
  <div className="relative flex-1 min-w-0">...</div>

  {/* Row 2: Controls — sort, score, select, refresh */}
  <div className="flex items-center gap-2 shrink-0">
    <div className="relative flex-1 sm:flex-none">  {/* Sort select */}
    <div className="relative flex-1 sm:flex-none">  {/* Score select */}
    {/* Select button: icon always + label hidden sm:inline */}
    {/* Refresh button: icon always + label hidden sm:inline */}
  </div>
</div>
```

Key patterns used:
- `flex-1 sm:flex-none` on the sort and score selects — they share available row width on mobile, revert to natural width on desktop
- `w-full` on the `<select>` elements themselves (fills the `flex-1` parent)
- `max-h-[200px]` on the collapsible container — bumped from `max-h-[60px]` to accommodate the taller two-row layout
- Icon-only buttons on mobile, icon + label on `sm:` (`<span className="hidden sm:inline">Label</span>`)

This fix was applied to all five tabs that share the filter bar component: **Inbox, Engage, Replied, CRM, and Skipped**.

Adversarial tests confirmed: full-width search, dropdowns sharing row, Select/Refresh accessible, collapse/expand animation works, selection action bar scrolls correctly on narrow screens.

### Testimonial cards — animated testimonials

**Fixed:** The testimonial card author name and avatar were rendering outside the card boundary on mobile. Root cause: cards used `absolute inset-0` inside a parent div with a fixed `min-h-[280px]`. When a quote exceeded 280px of height on mobile, the content overflowed the container and the author section appeared below the card's visible box.

Replaced with CSS grid stacking:

```jsx
// Container — no fixed height, grows to content
<div className="relative" style={{ display: 'grid' }}>
  {cards.map((card, i) => (
    // Each card occupies the same grid cell; container height = tallest card
    <div style={{ gridArea: '1/1', zIndex: ... }}>
      <div className="p-6 rounded-2xl ...">
        {/* quote */}
        {/* author row — always inside the card */}
      </div>
    </div>
  ))}
</div>
```

This pattern should be used any time multiple elements need to occupy the same visual space in a stack (card carousels, fade transitions, overlapping panels). Do not use `absolute inset-0` + fixed `min-h` for content whose height varies.

### Dashboard feed — settings (`/settings`)

**Fixed — Discover ICPs panel: "Add" buttons outside card boundary**

The job title and keywords input rows inside the Discover ICPs settings panel had `flex-1` on the `<input>` without `min-w-0`. Browsers assign a default intrinsic minimum width to `<input>` elements (~180–200px based on `size=20`). Without `min-w-0`, the input cannot shrink below that intrinsic minimum in a flex container, which pushes the "Add" button outside the right edge of the card.

Fix applied to all affected inputs throughout `settings/page.tsx`:

| Location | Input fix | Button fix |
|---|---|---|
| Discover ICPs — job title | `flex-1 min-w-0` | `shrink-0` on Add button |
| Discover ICPs — keywords | `flex-1 min-w-0` | `shrink-0` on Add button |
| Keyword monitoring — term input | `flex-1 min-w-0` | n/a (no adjacent button overflow) |
| Team invite — email input | `flex-1 min-w-0` | `shrink-0` on Send invite button |

**Rule:** any `<input>` or `<textarea>` inside a flex row must have `min-w-0` if it also has `flex-1` or `flex-grow`. This is one of the most common flex layout bugs in the codebase and will recur anywhere a new input row is added without it.

**Previously fixed:**
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
- [ ] Nav CTA button has `shrink-0 whitespace-nowrap` and uses responsive label spans if needed
- [ ] "Sign in" link is always visible (never hidden on mobile)
- [ ] All `text-4xl+` headings have responsive prefixes (`text-2xl sm:text-3xl md:text-4xl`)
- [ ] Primary CTA buttons have `w-full sm:w-auto whitespace-nowrap`
- [ ] Any table or multi-column grid is wrapped in `overflow-x-auto` or has responsive column counts
- [ ] Hero subheadlines are `text-base sm:text-xl` (not raw `text-xl`)
- [ ] No fixed-width containers wider than the viewport (`w-[Xpx]` exceeding 375px without `sm:` qualifier)
- [ ] Outermost page div has `overflow-x-hidden` if any child could be wider than the viewport

### Authenticated pages
- [ ] Any fixed-right drawer uses `w-full sm:w-[Xpx]`
- [ ] Stat grids use `grid-cols-2 sm:grid-cols-N` when N ≥ 4
- [ ] Header nav labels truncate gracefully at 375px width
- [ ] Post cards and feed items use `min-w-0` on flex children to prevent overflow
- [ ] Every `flex-1 <input>` has `min-w-0` to prevent intrinsic-width overflow
- [ ] Animated card stacks use CSS grid stacking (`gridArea: '1/1'`), not `absolute inset-0` + fixed `min-h`
- [ ] Filter bars with multiple controls use `flex-col sm:flex-row` with `max-h` accounting for two-row height

---

## OG Image / Social Sharing (April 2026)

### Status

✅ **Complete.** `dashboard/public/og-image.png` (1200×630px) has been generated and committed. When someone shares any Scout URL on Slack, iMessage, LinkedIn, or Twitter/X, the social preview will show the ClientBloom mark, "Scout by ClientBloom" wordmark, and tagline on the Scout dark background.

### Middleware fix required for social crawlers

Social crawlers (Slack, Circle, LinkedIn, iMessage) fetch the OG image directly via HTTP GET. NextAuth middleware was intercepting all unmatched routes and redirecting them to `/sign-in`, which meant crawlers received an HTML redirect instead of the PNG — causing broken/missing preview images.

Fix: added image extension exclusions to the middleware matcher in `dashboard/middleware.ts`:

```ts
// Before (image requests intercepted by auth)
'/((?!$|welcome|sign-in|...|sitemap\\.xml).*)'

// After (image extensions excluded from auth)
'/((?!$|welcome|sign-in|...|sitemap\\.xml|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.gif|.*\\.svg|.*\\.ico|.*\\.webp).*)'
```

**Rule:** whenever a new static asset type needs to be publicly accessible (fonts, JSON manifests, etc.), add its extension to the middleware exclusion list.

### About the OG image format

The ClientBloom logo is square. A raw square logo does not work for OG images — social platforms expect 1200×630 (1.91:1 landscape). Pasting a square logo directly would produce pillarboxing on most platforms and cropping on others.

The correct approach (implemented here) is to compose a 1200×630 canvas:
- **Background:** Scout brand dark (`#080a0f`) with subtle centre glow
- **Left-centre group:** ClientBloom mark (160×160px) + "Scout" wordmark + "by ClientBloom" subtitle
- **Below the mark:** tagline in slate-400
- **Bottom edge:** 4px `#4F6BFF` accent line

Source: generated via Python/Pillow + cairosvg from the `ClientBloomMark` SVG already in the codebase. If you need to regenerate (e.g. to update the tagline or add `.ai` to the wordmark), the script is in the session history.

### Pages with OG images
- `/` — inherited from `layout.tsx`
- `/compare` — explicit `openGraph.images`
- `/about` — explicit `openGraph.images`
- `/blog` — explicit `openGraph.images`
- `/blog/warm-up-linkedin-prospects` — explicit `openGraph.images`
- `/privacy-policy` — explicit `openGraph.images`
- `/terms` — explicit `openGraph.images`

### Adding OG to future pages

Every new public page should include:
```ts
export const metadata: Metadata = {
  // ... title, description
  openGraph: {
    title: "...",
    description: "...",
    url: 'https://scout.clientbloom.ai/YOUR-PATH',
    images: [{ url: 'https://scout.clientbloom.ai/og-image.png', width: 1200, height: 630, alt: 'Scout by ClientBloom' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: "...",
    description: "...",
    images: ['https://scout.clientbloom.ai/og-image.png'],
  },
  alternates: { canonical: 'https://scout.clientbloom.ai/YOUR-PATH' },
}
```

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
| Nav CTA button: label on mobile | Shows "Free Trial" (short form) | ✅ Fixed |
| Comparison table on landing page | Horizontally scrollable, swipe hint visible | ✅ Fixed |
| Comparison table causing viewport scroll | Page never shifts sideways | ✅ Fixed |
| CTA button "Start Your Free 7-Day Trial" | Single line, no wrap | ✅ Fixed |
| Section heading "The conversations are already happening." | 3 lines max at `text-3xl` | ✅ Fixed |
| ICP profile detail drawer on settings | Full-screen slide-in | ✅ Fixed |
| Engagement Momentum 4 stats | 2×2 grid, readable | ✅ Fixed |
| Compare page table | Horizontally scrollable, min-w-[480px] | ✅ Fixed |
| Blog article nav at 375px | Logo + CTA button both visible, not clipped | ✅ Fixed |
| Blog article h1 | 3 lines max, readable at `text-3xl` | ✅ Fixed |
| Trial banner pulse animation | Slow ambient pulse (2.5s), not jarring | ✅ Fixed |
| Testimonial card — long quote | Author/avatar stays inside card border | ✅ Fixed |
| Feed filter bar: search + dropdowns + buttons at 375px | Two-row layout, all controls accessible | ✅ Fixed |
| Feed filter bar: "Select" button accessible | Visible and tappable, not cropped | ✅ Fixed |
| Feed filter bar: all 5 tabs (Inbox/Engage/Replied/CRM/Skipped) | Consistent two-row layout on all | ✅ Fixed |
| Feed filter bar: collapse animation | max-h-[200px] accommodates two-row height | ✅ Fixed |
| Settings Discover ICPs: job title "Add" button | Inside card boundary | ✅ Fixed |
| Settings Discover ICPs: keywords "Add" button | Inside card boundary | ✅ Fixed |
| Settings keyword monitoring term input | Doesn't push button outside boundary | ✅ Fixed |
| Settings invite: "Send invite" button | Inside card boundary | ✅ Fixed |
| OG image accessible to social crawlers | Returns PNG, not redirect to sign-in | ✅ Fixed |
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

7. **Never omit `overflow-x-hidden` on page wrappers that contain wide children** — even a properly scrollable child table can cause the entire viewport to shift sideways if the page wrapper has no overflow constraint. Always add `overflow-x-hidden` to the outermost div of any page that includes tables, grids, or other wide content.

8. **Never use `flex-1` on an `<input>` without also adding `min-w-0`** — browsers give `<input>` elements an intrinsic minimum width (~180–200px). Without `min-w-0`, the input will refuse to shrink and push sibling elements (like "Add" or "Send" buttons) outside the card boundary.

9. **Never use `absolute inset-0` + fixed `min-h` for animated card stacks** — when card content varies in height, cards with more content will overflow the container. Use CSS grid stacking (`gridArea: '1/1'`) instead so the container height grows to the tallest card.

10. **Never hide nav links on mobile to make room for buttons** — if a user can only access your product from desktop, the mobile nav is broken. Shorten button labels with responsive spans instead of removing navigation items.

---

## Future Mobile Improvements (Not Yet Implemented)

1. **Admin panel** — the admin panel (`/admin`) is currently desktop-only and not optimized for mobile. Given that it's an operator tool, this is acceptable for now. If mobile access becomes needed, the main panels (tenants list, health strip, ApifyPanel) will need responsive layout work.

2. **Onboarding step indicators** — step dots at the top of onboarding may benefit from a horizontal progress bar on very small screens.

3. **CRM push modal** — the CRM push confirmation modal inside the feed uses fixed-width positioning that could be reviewed for very narrow screens.

4. **Future blog articles** — use `/blog/warm-up-linkedin-prospects/page.tsx` as the template. Nav block, heading scale, and OG metadata pattern are all correct there. Do not start from scratch.
