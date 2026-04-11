# Onboarding & First-Scan UX

**File:** `dashboard/app/onboarding/page.tsx` (wizard) + `dashboard/app/page.tsx` (feed landing)  
**Branch introduced:** `feature/onboarding-first-scan-ux`  
**Status:** Production

---

## Why this exists

New Trial users were landing on an empty inbox after completing onboarding. Root causes:

1. Only 3 keyword slots on Trial (too narrow a search net)
2. "Skip for now" on keyword setup → zero keywords → scan finds nothing
3. No ICP profiles on a fresh account → scan is keyword-only with generic coverage
4. Passive empty state ("posts will be waiting at 6 AM") gave no feedback

The redesign addresses all four with an opinionated, sequential onboarding wizard that requires at least one keyword before advancing, fires a first scan immediately, and handles the scan's three possible outcomes gracefully.

---

## The 4-Step Wizard

### Step 1 — Business Info (`Step1`)

Collects: Business Name, Industry/Niche, Ideal Client description, Value proposition.

**Required fields:** Industry + Ideal Client (Continue button disabled until both have content).  
**Field limits:** `businessName` max 100 chars, `industry` max 120 chars, `idealClient`/`problemSolved` max 500 chars each. These prevent Airtable write failures from oversized payloads.

The `industry` free-text value is passed to Step 3 for auto-pack detection.

---

### Step 2 — Signal Types (`Step2`)

Checkboxes for 6 conversation types Scout should prioritize (asking for help, milestone, hiring, etc.). Optional — all types are active by default if nothing is selected.

---

### Step 3 — Keywords (`StepKeywords`)

The most important step for first-scan quality.

**Auto-detection:** `detectIndustryPack(industry)` does substring matching on the Step 1 industry string to pre-select the most likely industry pack in the dropdown. Match logic:

| Keyword in industry string | Pack selected |
|---|---|
| "agency", "marketing agency" | Agency / Marketing Agency |
| "saas", "software as a service" | B2B SaaS |
| "customer success", " cs ", "churn" | Customer Success |
| "sales", "revenue", "bdr", "sdr" | Sales / Revenue |
| "talent", "recruiting", " hr ", "human resource" | HR / Talent |
| "consult" | Consulting |
| "coach", "solopreneur" | Coaching |
| "finance", "cfo", "accounting", "bookkeep" | Finance / CFO |
| "ecomm", "dtc", "e-comm", "direct to consumer" | E-commerce |
| "real estate", "realt", "property" | Real Estate |
| "legal", "law firm", "attorney" | Legal |
| "health", "wellness", "medical", "clinic" | Healthcare |

**Hero pack UI:** The pack loader is the primary CTA (blue-bordered card, not a secondary option). Select an industry → click "Load pack" → all available terms load in one action.

**Keyword gate:** Continue button is disabled (`disabled={terms.length === 0}`) until at least one keyword is active. No "Skip for now" option. Button label changes: `"Load a keyword pack to continue"` (0 keywords) → `"Continue with N keyword(s) →"` (≥1 keyword).

**Trial tier limits:** Trial = 6 keyword slots (up from 3). Every industry pack has exactly 6 terms, so one pack load fills all Trial slots cleanly.

**Keyword count propagated:** `onNext(terms.length)` passes the count to the parent `OnboardingPage`, which passes it to Step 4 for the summary card.

---

### Step 4 — Launch Scan (`Step4`)

Fires the first scan and handles three outcomes.

#### Fire-and-redirect strategy

The scan is triggered via `POST /api/trigger-scan`. A Vercel serverless function runs for up to 90 seconds (scraping LinkedIn + Claude scoring + Airtable writes). The browser client cannot wait 90 seconds — so the scan races against a 12-second client-side timeout:

```
Promise.race([scanFetch, 12s timeout])
```

- **Scan wins (< 12s):** Show exact result (N posts found). User clicks CTA to go to feed.  
- **Timeout wins (12s, scan still running):** Redirect immediately to `/?firstScan=1`. The Vercel function continues server-side even after the client navigates away — this is safe by design.  
- **Scan errors (HTTP 5xx before 12s):** Show retry UI. `scanErrored` flag routes to error state, not to the timeout path.

#### `markOnboardingComplete()` call order

Marks onboarding complete **before** the scan fires. This is critical: if the scan takes >12s and the user is redirected, their JWT must already have `onboarded: true` set, otherwise the feed's redirect guard sends them back to `/onboarding`.

The function:
1. Calls `POST /api/onboarding/complete` (Airtable write), retries once on failure
2. Always calls `updateSession({ onboarded: true })` regardless of Airtable write success

#### Scan outcome routing

| `onComplete(postsFound, scanCompleted)` | Route |
|---|---|
| `(N > 0, true)` | `router.push('/')` — go straight to inbox |
| `(0, false)` | `router.push('/?firstScan=1')` — scan still running, show banner |
| `(0, true)` | `router.push('/?firstScan=0')` — scan done, zero posts, helpful empty state |

---

## Feed Landing After Onboarding

### `?firstScan=1` — Scan in progress

Shown when the 12s timeout fires first. The user arrives at the feed with a blue banner:

> **First scan in progress**  
> Searching LinkedIn for conversations worth joining — posts will appear here automatically in 30–60 seconds.

The banner polls `GET /api/posts?action=New&limit=5` every 5 seconds. When posts appear, the banner dismisses itself and `fetchPosts(true)` is called to load the full list. Auto-dismisses after 2 minutes.

### `?firstScan=0` — Scan done, zero posts

Shown when the scan completed but found nothing. The Inbox tab shows a rich empty state:

> **Scout is getting started**  
> Your first scan searched LinkedIn for relevant conversations. Posts matching your keywords will appear here as Scout continues scanning — usually by end of day.

Two CTAs:
- "Add LinkedIn profiles to track" → `/settings?tab=linkedin`
- "Try scanning again" → triggers another manual scan

### URL cleanup

Both `?firstScan=1` and `?firstScan=0` params are cleaned from the URL immediately via `router.replace('/', { scroll: false })` after being read. This prevents stale state on back-navigation, browser refresh, or sharing the URL.

---

## Technical Implementation Details

### Hydration safety

`firstScanBanner` and `firstScanZero` are initialized to `false` (not from `useSearchParams()`). They are set inside a client-only `useEffect` with empty deps, after reading the URL param. This prevents the SSR/client hydration mismatch that would occur from initializing `useState` directly from `useSearchParams()`.

### Onboarding redirect bypass

The feed's redirect guard (`if (!sessionOnboarded) router.push('/onboarding')`) bypasses when `searchParams?.get('firstScan') !== null`. This prevents the guard from firing during the JWT update propagation window when the user has just finished onboarding.

### Polling active flag

The polling `useEffect` uses an `active` closure boolean that is set to `false` in the cleanup function. Every post-`await` line checks `if (!active) return` before calling any state setter. This prevents stale state updates if the banner is dismissed while a fetch is in flight.

### Race condition guard

The scan race uses three explicit flags:
- `scanWon` — set only in `.then()` success handler, and only if `!timedOut`
- `scanErrored` — set in `.catch()` if `!timedOut`
- `timedOut` — set by the 12s setTimeout

This avoids the 1–2ms ambiguity window where both `scanFetch` and the timeout could resolve "simultaneously" and `timedOut && !scanResult` would give the wrong answer.

### Settings deep-link

`/settings?tab=linkedin` navigates directly to the LinkedIn tab. The settings page reads `window.location.search` in a client-only `useEffect` on mount to set the active tab. Uses `window.location.search` instead of `useSearchParams()` to avoid requiring a `Suspense` boundary on the settings page.

---

## Trial Tier Limits (Updated)

| Field | Before | After | Reason |
|---|---|---|---|
| `keywords` | 3 | 6 | Every industry pack has 6 terms; 3 slots meant 50% of pack was silently dropped |
| `scanSlots` | 3 | 5 | Wider ICP pool coverage per scan for the first impression |

Source of truth: `dashboard/lib/tier.ts` → `case 'Trial'`

---

## Adversarial Issues Fixed (Session 7)

All 18 issues were identified and resolved before production push:

| ID | Severity | Issue | Fix |
|---|---|---|---|
| #3 | CRITICAL | Hydration mismatch: `useState(firstScanParam === '1')` | Initialize to `false`, read in client-only `useEffect` |
| #1 | CRITICAL | Onboarding loop: JWT update race sends user back to `/onboarding` | Bypass redirect guard when `?firstScan` param present |
| #4 | HIGH | Promise.race: `timedOut && !scanResult` ambiguous in 1ms window | Explicit `scanWon` boolean set only in `.then()` |
| #16 | HIGH | Scan 500 treated as timeout → `?firstScan=1` banner never resolves | `scanErrored` flag → error state with retry UI |
| #5 | HIGH | `?firstScan` URL param never cleaned → stale state on back/refresh | `router.replace('/', {scroll:false})` after reading param |
| #6 | HIGH | Banner dismiss doesn't guard in-flight fetch state updates | `active` closure flag in polling `useEffect` |
| #14 | MEDIUM | Banner text "about 30 seconds" inaccurate | Changed to "30–60 seconds" |
| — | MEDIUM | `/settings?tab=icp` links to nonexistent tab | Fixed to `?tab=linkedin`; settings page now reads `?tab=` on mount |
| — | MEDIUM | No `maxLength` on profile text inputs | Added (100/120/500 chars) |
| — | MEDIUM | "Run my first scan" button allows double-click | Disabled when `status !== 'idle'` |
| — | MEDIUM | `markOnboardingComplete` could silently fail | Added retry + `try/catch` on `updateSession` |
| — | MEDIUM | Error state "Go to my feed" sent to `/?firstScan=1` | Fixed to `onComplete(0,true)` → `/?firstScan=0` |
| — | LOW | Stale "skip for now" in keyword error fallback message | Removed |

---

## Changelog

| Date | Change |
|---|---|
| April 2026 | First-scan UX overhaul: 4-step wizard, keyword gate, fire-and-redirect scan, `?firstScan` feed states |
| April 2026 | Trial tier: keywords 3→6, scanSlots 3→5 |
| April 2026 | 18 adversarial issues identified and resolved; build confirmed clean |
