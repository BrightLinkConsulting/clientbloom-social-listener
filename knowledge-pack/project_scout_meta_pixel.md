# Scout — Meta Pixel & Conversion Tracking (Session 19 Summary)

**Detailed developer doc:** `docs/meta-pixel-tracking.md` (read that for full reference)

This knowledge-pack entry is the quick-read summary for future Claude sessions.
The canonical source is `docs/meta-pixel-tracking.md` — refer to it before
touching anything Pixel-related.

---

## What's wired

Meta Pixel **and** Conversions API (CAPI) installed on
`scout.clientbloom.ai`. Pixel ID `1499602704618597` (ClientBloom dataset
in Meta Events Manager).

Events firing on `/onboarding` mount:
- `PageView` — automatic on every route, including Next.js client-side nav (Pixel only)
- `SubmitApplication` — Pixel + CAPI with shared event_id (feeds SCOUT Trial Signup Custom Conversion)
- `Lead` — Pixel + CAPI with shared event_id (stronger Meta optimization signal)
- `ScoutOnboardingReached` — custom event, Pixel only

CAPI access token in Vercel env var `META_CAPI_ACCESS_TOKEN`. If missing,
CAPI silently disables (logs warning) but client Pixel still works.

## Files that matter

- `app/layout.tsx` — Pixel base code, `beforeInteractive` strategy
- `app/components/MetaPixelTracker.tsx` — route-change PageView tracker
- `lib/meta-pixel.ts` — `trackStandardEvent`/`trackCustomEvent` helpers with retry + optional `eventId` for dedup
- `lib/meta-capi.ts` — `sendCapiEvent` server helper (SHA256 email, IP/UA/fbp/fbc, POST to graph.facebook.com)
- `app/api/meta/capi-event/route.ts` — auth-gated bridge that browser POSTs to
- `app/onboarding/page.tsx` — generates UUIDs, fires Pixel + CAPI for SubmitApplication and Lead
- `middleware.ts` — `/api/meta/**` in passthrough list so route returns 401 JSON instead of redirecting fetch
- `next.config.js` — CSP with Meta domains allowed (CRITICAL)

## CSP is load-bearing — do not tighten without updating

Meta domains in `next.config.js` headers:
- `script-src` must include `https://connect.facebook.net`
- `connect-src` must include `https://www.facebook.com`
- `frame-src` must include `https://www.facebook.com`

If someone tightens CSP and removes these, the Pixel silently breaks.
Only the noscript `<img>` PageView fallback will still fire — all custom
events will be dropped. Custom Conversions will report zero activity.
See `docs/meta-pixel-tracking.md` Section 6, Bug 6.

## Six bugs we already made — DO NOT REPEAT

1. Fired `SubmitApplication` on `/sign-up` — URL didn't match Custom Conversion rule. Fix: fire on `/onboarding` instead.
2. PageView didn't fire on Next.js client-side navigation — Pixel base code only runs on full page load. Fix: `MetaPixelTracker` component listens to pathname changes.
3. (Red herring) `afterInteractive` Script strategy vs useEffect race. Fix: switched to `beforeInteractive` and added retry loop. Kept as defensive.
4. Silent failures persisting after multiple fixes — should have instrumented with console.log earlier.
5. Misread the noscript `<img>` PageView fallback as proof the Pixel was working. It wasn't — PageViews came from the image, not the JS.
6. **CSP was blocking `fbevents.js`** — the actual root cause. Look here FIRST when a third-party script "isn't working" in this codebase.

## Optimization strategy — Lead first, then Custom Conversion

Phase 1 (< 50 conversions/week): optimize ads for **Lead**. Meta has massive
training data on the Lead event across advertisers, so new campaigns reach
learning-phase exit faster.

Phase 2 (50+ conversions/week consistently): switch to the **SCOUT Trial
Signup** Custom Conversion. More precise signal usually wins on CPA once
Meta has enough Scout-specific data.

Recommend creating a second Custom Conversion called "SCOUT Lead" (event =
Lead, URL contains = onboarding) in Events Manager for Phase 1.

## Test Events vs Live Events

Test Events panel only shows events tagged via the "Open Website" handshake
from Events Manager. Opening an incognito window directly → events go to
live data, not Test Events. That's correct behavior for production.

For ad optimization, the Custom Conversion "Activity in last 24 hours"
counter is the source of truth.

## Compliance

Footer on landing page has both LinkedIn AND Meta trademark disclaimers
(commit `e4de62d`). Required for Meta ad policy. Do not remove.

## Future work still open

- `Purchase` event on Stripe trial-to-paid webhook (highest-value optimization signal)
- Second Custom Conversion "SCOUT Lead" (event = Lead, URL contains = onboarding) for Phase 1 ad optimization
