# Scout — Meta Pixel & Conversion Tracking

## Last updated: April 18, 2026 (Session 19 — Pixel install + CSP fix)

---

## 1. What is wired

Scout has the Meta (Facebook) Pixel installed for ad attribution and conversion
tracking on Meta ad campaigns driving traffic to `scout.clientbloom.ai`. The
install is **client-side only** as of Session 19. Server-side CAPI
(Conversions API) is **not yet wired** — that's a future enhancement.

| Component | Status | Notes |
|---|---|---|
| Client Pixel base code | ✅ Live | In `app/layout.tsx` head, `beforeInteractive` strategy |
| `PageView` event | ✅ Auto on every route | Including Next.js client-side navigations |
| `SubmitApplication` event | ✅ Fires on `/onboarding` mount | Feeds the SCOUT Trial Signup Custom Conversion |
| `Lead` event | ✅ Fires on `/onboarding` mount | Stronger Meta optimization signal |
| `ScoutOnboardingReached` custom event | ✅ Fires on `/onboarding` mount | Probe for future custom conversions |
| CSP whitelist | ✅ `connect.facebook.net` + `www.facebook.com` | In `next.config.js` |
| Server-side CAPI | ❌ Not yet wired | Token stored, route not built |
| Meta Pixel Helper extension | ✅ Verified working | `scout.clientbloom.ai` shows the pixel as Active |

---

## 2. Pixel and dataset identifiers

- **Pixel ID (a.k.a. Dataset ID):** `1499602704618597`
- **Dataset name in Events Manager:** ClientBloom (updated)
- **CAPI Access Token:** stored in 1Password (or wherever Mike keeps secrets).
  Begins with `EAAGONig3sToBR...`. **Not** in the repo or in any env var yet.
  Will go into Vercel as `META_CAPI_ACCESS_TOKEN` when CAPI is wired.

The Pixel ID is **public-safe** — it's exposed in the page HTML once installed.
It is hardcoded in two places:
- `app/layout.tsx` — `META_PIXEL_ID` constant used by the inline base code
- `lib/meta-pixel.ts` — `META_PIXEL_ID` exported constant for any future helper

If the Pixel ID ever changes, both files need to be updated together.

---

## 3. Custom Conversions in Meta Ads Manager

| Name | Event | URL Rule | Purpose |
|---|---|---|---|
| SCOUT Trial Signup | Submit application | URL contains `onboarding` | Optimize and report on completed signups |

The "Submit application" UI label maps to the Meta standard event name
`SubmitApplication` (camelCase). Custom Conversions evaluate event AND URL
**simultaneously** — the event must fire while the user is on a URL that
matches the rule. If we fire `SubmitApplication` from `/sign-up` before the
redirect, the event fires but the URL check fails. That was the original
bug. The event now fires from the `/onboarding` page on mount.

**Recommended next custom conversion to create:** "SCOUT Lead" with
event = Lead, URL contains = onboarding. Use this once Lead-based
optimization is preferred (see Section 7).

---

## 4. File map

| File | Role |
|---|---|
| `app/layout.tsx` | Meta Pixel base code (inline `<script>` via `next/script`, `beforeInteractive` strategy). Fires the initial PageView. |
| `app/components/MetaPixelTracker.tsx` | Client component. Listens to pathname changes, fires `PageView` on every Next.js route transition. Skips first render to avoid double-firing the initial PageView. |
| `lib/meta-pixel.ts` | Helper module. Exports `trackStandardEvent(name, params?)` and `trackCustomEvent(name, params?)`. Both internally use `fireWithRetry` which polls for `window.fbq` for up to 3 seconds before giving up. |
| `app/onboarding/page.tsx` | Fires `SubmitApplication`, `Lead`, and `ScoutOnboardingReached` on mount via a `useRef`-guarded `useEffect`. No session/auth gate — middleware already protects this route. |
| `app/sign-up/page.tsx` | No Pixel events fired here. (Was originally where `SubmitApplication` fired — moved in commit 0223115.) |
| `next.config.js` | CSP headers. Must include Meta domains. |

---

## 5. Content Security Policy (CSP) requirements

This is **the single most important thing to preserve** going forward. If
the CSP gets tightened in the future and Meta domains are removed, the
Pixel will silently break and only PageView events will appear (via the
noscript image fallback). Custom events will never fire and Custom
Conversions will report zero activity.

The CSP in `next.config.js` must include:

```js
"script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://vercel.live https://connect.facebook.net"
"connect-src 'self' https://api.stripe.com https://vitals.vercel-insights.com https://www.facebook.com"
"frame-src https://js.stripe.com https://www.facebook.com"
```

`img-src` already permits `https:` globally so no additional allow is needed
for the `/tr` tracking pixel image.

When CAPI is wired server-side, no CSP changes are needed — server-to-server
calls don't go through the browser CSP.

---

## 6. The six bugs we hit while installing this — DO NOT REPEAT

These are the failure modes encountered during Session 19. Every one of them
made the Pixel appear to "work" while silently dropping events. They are
listed in the order we discovered them — not the order they should have
been investigated. The actual root cause was bug #6.

### Bug 1 — Event fired on wrong URL

**Symptom:** Custom Conversion "Activity" stayed at zero even though
`SubmitApplication` was firing in the code.

**Cause:** The event fired in the `/sign-up` `handleSubmit` function, right
before `router.replace('/onboarding')`. At the moment of fire, the URL was
`/sign-up`. The Custom Conversion rule required URL contains `onboarding`,
which failed.

**Fix:** Move the `trackStandardEvent('SubmitApplication')` call into the
`/onboarding` page's `useEffect` so it fires after the URL has changed.
Commit `0223115`.

**Lesson:** Meta Custom Conversions evaluate event AND URL at the same
moment. Always fire on the page that matches the URL rule, not before
navigation.

### Bug 2 — PageView never fires on Next.js client-side navigation

**Symptom:** Even after fixing Bug 1, downstream pages like `/onboarding`,
`/welcome`, `/upgrade` had no PageView in Test Events.

**Cause:** The Pixel base code only runs once per **full page load**.
Next.js App Router uses client-side navigation for transitions like
`router.replace('/onboarding')`. The base code never re-runs, so
`fbq('track', 'PageView')` never re-fires for downstream routes.

**Fix:** Created `app/components/MetaPixelTracker.tsx`, a client component
that listens to `usePathname()` and fires `fbq('track', 'PageView')` on
every transition. Skips the first render via a ref so the initial
PageView from the base code isn't duplicated. Mounted in the root layout
inside `Providers`. Commit `5c77ba2`.

**Lesson:** Any analytics tag or pixel that fires on initial page load
needs an explicit route-change listener in a Next.js App Router app.

### Bug 3 — Pixel script race with React hydration (red herring)

**Symptom:** Same as Bug 2 — events not firing on `/onboarding`. Initially
suspected a race between `next/script strategy="afterInteractive"` and the
React `useEffect` that called `trackStandardEvent`.

**Cause (suspected, never confirmed):** if `useEffect` runs before the
inline Pixel base script has executed, `window.fbq` is undefined and the
helper's `if (!window.fbq) return` guard silently no-ops.

**Fix (defensive, kept in production):** Changed the Pixel `<Script>`
strategy to `beforeInteractive` so the inline base code definitely runs
before any React code. Also added a retry loop inside `lib/meta-pixel.ts`
that polls for `window.fbq` for up to 3 seconds before giving up.
Commit `a828e8f`.

**Lesson:** This wasn't actually the bug, but the defenses are correct
and worth keeping. They protect against ad blockers that delay the load
of `fbevents.js` and against future code paths that might fire events
before hydration completes.

### Bug 4 — Diagnostic console logs were the right move

**Symptom:** Bug 3 fix didn't make events appear. We were out of cheap
hypotheses.

**Cause:** None — this was a process improvement, not a bug.

**Fix:** Added temporary `console.log` statements throughout the firing
path so we could see exactly which step was failing in DevTools.
Commit `7d70d13` (logs added), commit `3a958f8` (logs removed once
working).

**Lesson:** When silent failures persist after multiple "should work"
fixes, instrument the code first instead of patching one more time.

### Bug 5 — Misreading the noscript image fallback

**Symptom:** PageView events kept appearing in Test Events even though
NO custom events did. This made it look like the Pixel was partially
working, which led us down the wrong diagnostic paths.

**Cause:** The Meta Pixel base code includes a `<noscript>` tag with
an `<img>` that pings `facebook.com/tr?id=PIXEL_ID&ev=PageView&noscript=1`.
This image loads regardless of whether `fbevents.js` is blocked,
because it's an image request governed by `img-src` (which allows
`https:`), not `script-src`. The PageView events appearing in Test
Events were coming exclusively from this image, not from the JS Pixel.

**Lesson:** If you see PageView in Test Events but no custom events,
**suspect a CSP issue immediately**. The noscript fallback masks a
broken Pixel by sending a single PageView ping that the rest of your
event setup depends on.

### Bug 6 — CSP was blocking fbevents.js (THE ACTUAL ROOT CAUSE)

**Symptom:** Network panel in DevTools showed `fbevents.js` with status
`(blocked:csp)` on every page load. The Pixel base code defined
`window.fbq` (which queues calls), but `fbevents.js` never loaded to
flush the queue. Every event other than the noscript-image PageView was
queued and dropped on page navigation.

**Cause:** The CSP `script-src` directive in `next.config.js` did not
include `https://connect.facebook.net` (where `fbevents.js` is hosted).
The CSP `connect-src` directive did not include `https://www.facebook.com`
(where the Pixel POSTs event data). Both were blocking the Pixel from
working at all.

**Fix:** Added the Meta domains to the CSP. Commit `57f40bf`. See
Section 5 for the exact directives.

**Lesson:** **CSP is the first thing to check when a third-party script
isn't working.** Open DevTools → Network → look for the script with a
red status. `(blocked:csp)` is unambiguous. The fix is two strings in
`next.config.js`. We spent four commits investigating timing,
hydration, useEffect gates, and event names before checking CSP.

---

## 7. Optimization guidance: Lead vs SCOUT Trial Signup

Both events fire at the same moment (user lands on `/onboarding`). The
choice only affects what Meta's optimization algorithm trains on.

**Phase 1 — first 30-60 days, < 50 conversions/week:** optimize for
**Lead**. Meta has trained its delivery algorithm on hundreds of millions
of Lead events from advertisers across every industry. Brand-new
campaigns reach learning-phase exit faster against Lead than against a
brand-new custom conversion.

**Phase 2 — once you're consistently 50+ trial signups/week:** switch
to optimizing for the **SCOUT Trial Signup** Custom Conversion. At that
volume, Meta's algorithm has enough Scout-specific data to learn the
narrower signal, which usually wins on CPA.

**Setup recommendation:** create a second Custom Conversion called
"SCOUT Lead" with event = Lead, URL contains = onboarding. That gives
you a Lead-based conversion to optimize against in Phase 1 while the
SubmitApplication-based Custom Conversion accumulates data in the
background.

---

## 8. Test Events vs Live Events — common confusion

Meta's **Test Events** panel only shows events tagged with your specific
test event code (e.g. `TEST1912`). That code gets injected into the
browser session via the **Open Website** button in the Test Events
panel — it sets a cookie or URL param that tells the Pixel to tag every
event for test routing.

If you open an incognito window directly without going through the Open
Website button, events flow to your **live data stream** instead of the
test panel. That's the correct outcome for production traffic — it means
conversions will count for real ads. But it can look like "events aren't
firing" if you're expecting them in Test Events.

Two ways to verify:

1. **For Test Events visibility:** in Events Manager → Test Events,
   click the **Open Website** button (NOT just typing the URL into a
   browser). Run the signup in the new tab.
2. **For live event verification:** Events Manager → **Overview** tab.
   Shows all events from the last 24 hours. 5-15 minute delay.

The Custom Conversion's "Activity in last 24 hours" counter under
Events Manager → Custom Conversions is the source of truth for whether
a campaign will be able to optimize against it.

---

## 9. Future enhancements — not yet built

### Server-side CAPI (Conversions API)

Pixel-only tracking loses 20-40% of conversions to ad blockers, ITP,
and iOS opt-outs. The standard fix is server-side CAPI: Scout's API
sends the same conversion events directly to Meta's `graph.facebook.com`
endpoint with a shared `event_id` for de-duplication.

Implementation sketch when we wire this:

1. Add `META_CAPI_ACCESS_TOKEN` env var in Vercel.
2. New file `lib/meta-capi.ts` with a `sendCapiEvent(event, params, eventId)`
   helper that POSTs to
   `https://graph.facebook.com/v19.0/{PIXEL_ID}/events`.
3. In each client-side `trackStandardEvent` call site, generate a UUID
   `event_id`, pass it both to the client `fbq` call (as the `eventID`
   parameter) and to a server-side API route that calls `sendCapiEvent`.
4. Meta de-duplicates events with matching `event_id` across the two
   streams.

Fire CAPI events for at minimum: `Lead` and `SubmitApplication` on
onboarding completion, `Purchase` on Stripe webhook for trial-to-paid
upgrades.

### `Purchase` event on trial-to-paid upgrade

When a trial user upgrades to a paid plan via Stripe, fire a `Purchase`
event with the actual revenue amount (e.g., `value: 49`, `currency: 'USD'`
for Starter). This is the highest-value optimization signal — Meta will
learn to find users who not only sign up but actually convert to paid.

The Stripe webhook in `app/api/webhooks/...` is the natural place. Fire
both client-side (if user is still on `/welcome`) and server-side via
CAPI for redundancy.

### GHL Meta CAPI integration — explicitly NOT relevant for Scout

GoHighLevel has a built-in Meta CAPI integration in its settings. It only
fires for events that happen **inside GHL** — form submissions on GHL-hosted
pages, GHL funnel conversions, GHL checkout purchases. **Scout does not run
on GHL.** Signups happen on `scout.clientbloom.ai`, onboarding happens
there, Stripe handles checkout. None of Scout's conversion events flow
through GHL, so GHL's CAPI integration cannot capture them. CAPI for
Scout must live inside the Scout Next.js app itself.

If you're running ads to GHL-hosted properties (ClientBloom.ai contact
forms, BrightLink funnels), GHL's CAPI integration is the right tool
for those — but configure it in GHL, not in this repo.

---

## 10. Compliance footer

The landing page footer contains both LinkedIn and Meta trademark
disclaimers as required by Meta's ad policies. Combined into a single
paragraph in `app/page-landing.tsx` footer section (commit `e4de62d`):

> Scout is an independent product of BrightLink Consulting and is not
> affiliated with, endorsed by, or sponsored by LinkedIn Corporation.
> LinkedIn® is a registered trademark of LinkedIn Corporation. This site
> is not part of the Facebook website or Facebook Inc. Additionally, this
> site is NOT endorsed by Facebook in any way, shape or form. FACEBOOK is
> a trademark of FACEBOOK, Inc.

Required for Meta ad approval. Do not remove without legal review.

---

## 11. Commit history (Session 19)

| Commit | Change |
|---|---|
| `e4de62d` | Footer: append Facebook/Meta trademark disclaimer |
| `a885805` | Pixel: install base code + initial SubmitApplication on `/sign-up` |
| `5c77ba2` | Pixel: route-change PageView via MetaPixelTracker |
| `0223115` | Pixel: move SubmitApplication firing from `/sign-up` to `/onboarding` |
| `a828e8f` | Pixel: `beforeInteractive` strategy + retry loop in helpers |
| `7d70d13` | Pixel: diagnostic build (Lead, ScoutOnboardingReached, console logs) |
| `57f40bf` | **CSP fix — root cause** — allow Meta domains in `next.config.js` |
| `3a958f8` | Pixel: remove diagnostic console logs |
