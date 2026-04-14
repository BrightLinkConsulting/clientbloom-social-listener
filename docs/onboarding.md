# Scout Onboarding — Living Documentation

> **This document is the single source of truth for the Scout onboarding experience.**
> Every version change, UX decision, and technical detail is recorded here.
> Update this file whenever the onboarding flow changes — before merging to main.

---

## Overview

The onboarding wizard is the first experience a new Scout user has with the product. It runs once per account and is gated by the `onboarded` flag on the Tenant record in Airtable. Once marked complete, users are redirected to the feed on every subsequent login.

**Critical principle:** The onboarding wizard has a direct, measurable impact on Day 1 inbox results. Users who complete onboarding with strong keywords and ICP profiles see posts in their feed faster. Users who don't, see an empty inbox and churn. Every version of onboarding must be evaluated against this metric.

---

## File Locations

| File | Purpose |
|------|---------|
| `dashboard/app/onboarding/page.tsx` | Wizard UI — all steps live here |
| `dashboard/app/page.tsx` | Feed page — empty state / firstScan banner logic |
| `dashboard/app/api/onboarding/complete/route.ts` | Marks `Onboarded: true` in Airtable |
| `dashboard/app/api/business-profile/route.ts` | Saves industry, idealClient, problemSolved |
| `dashboard/app/api/trigger-scan/route.ts` | Fires the first LinkedIn scan |
| `dashboard/app/api/linkedin-icps/discover/route.ts` | Discover ICPs — Apify-powered profile search |
| `dashboard/lib/tier.ts` | All plan limits — single source of truth |
| `dashboard/middleware.ts` | Redirects non-onboarded users to `/onboarding` |

---

## Current Version: v2.0

**Git branch:** `onboarding-v2`
**Status:** Production — confirmed working
**Merged:** April 2026
**Production test:** April 11, 2026 — 14 posts in inbox after first onboarding run ✓
**Previous rollback point:** `onboarding-v1.0` tag

### What changed from v1.0

**Brand colors updated throughout wizard:**
- All progress indicator dots changed from `blue-500` to `violet-600` (ClientBloom brand purple)
- All main CTA buttons (Continue, Load keyword pack to continue, Run my first scan) changed from `bg-blue-600` to `bg-violet-600`
- Industry/Niche and Ideal Client required-field asterisks changed to `text-violet-400`
- Secondary action buttons (Load pack, Add) remain blue — intentional distinction

**Step 0 (Business Info) improvements:**
- Added contextual helper text under "Who is your ideal client?" label: "Be specific — include their job title, company type, size, and what they typically post about."
- Expanded "What value do you deliver for them?" textarea from `rows={2}` to `rows={3}` — prevents internal scroll for typical answers
- Focus ring colors updated to match violet theme

**Step 2 (Keywords) improvements:**
- Added helper text near the manual entry button: "You can also type your own phrases — or skip the pack and add them all manually." Makes dual-path input explicit

**Step 3 (You're almost live) — major addition:**
- **Embedded Discover ICPs panel** added to the idle state, above "Run my first scan"
- Panel includes: job title suggestion chips (8 quick-add options from `ICP_JOB_TITLES`), custom title input, narrowing keywords input, "Run Discovery" violet button
- Calls `/api/linkedin-icps/discover` (same endpoint as Settings)
- Discovery result count updates summary card in real time: "ICPs: 10 profiles added" appears as a new row
- "Run my first scan" disabled during discovery to prevent race condition (profiles still being added when scan fires)
- `icpCount` state tracked and passed through `onComplete` callback → appended to redirect URL as `&icps=N`
- "Results appear within about 60 seconds" copy removed (omitted from onboarding panel to avoid confusion during setup)
- Summary card shows discovered ICP count after successful discovery run
- Copy rewritten: "One last step — tell Scout who to watch on LinkedIn. Then run your first scan and posts will be waiting in your inbox."

**Step 3 done state (0 posts found) — rewritten:**
- Energetic copy: "You're in. [N] people are being monitored." (with ICP count if discovered)
- References ICP count directly so user knows their pool is populated and ready
- Scan breakdown breakdown only shows if `fetched > 0` (hidden when LinkedIn returned nothing at all)
- "Two things that will help immediately" section replaced with "What happens next" — explains 6 AM / 6 PM scan schedule
- "Go to my feed →" button now violet

**Feed page empty state rewritten:**
- Removed "Trigger another scan now / Refresh feed →" item — this functionality did not exist (dead button)
- Updated "Scout is getting started" copy to reference ICP pool and explain the scan schedule
- Numbered item color changed from blue to violet
- Heading updated: "Your feed is live — posts are on the way"

---

## Wizard Flow — v2.0

```
Step 0: Business Info (Screen 1)
  → User enters: Business Name (optional), Industry/Niche*, Ideal Client*, Value Delivered
  → Helper text guides specificity of Ideal Client description
  → Validation: Industry and Ideal Client required before advancing (Continue disabled if empty)
  → API: none at this step (profile saved at Step 3)

Step 1: Signal Types (Screen 2)
  → User selects: which conversation types Scout should prioritize
  → All 6 types listed; any combination allowed
  → Empty selection = all types (default behavior in scan scoring)

Step 2: Keywords (Screen 3)
  → User loads an industry starter pack and/or adds custom keywords manually
  → Minimum 1 keyword required to advance (Continue disabled if empty)
  → Plan limit enforced: Trial = 3 keywords max (matches Starter — no keyword downgrade on conversion)
  → Helper text makes manual entry path explicit

Step 3: You're Almost Live (Screen 4)
  → Summary card: Business, Industry, Signals, Keywords (+ ICPs once discovered)
  → Discover ICPs panel (new in v2.0):
     - Select job titles from chips or custom input
     - Add narrowing keywords (optional)
     - Click "Run Discovery" → calls /api/linkedin-icps/discover
     - Up to 10 profiles added per run (Trial) — fills pool in one session
     - "Run my first scan" disabled while discovery is in progress
  → Click "Run my first scan":
     - Saves business profile to /api/business-profile
     - Marks onboarding complete via /api/onboarding/complete (before scan)
     - Fires first scan via /api/trigger-scan
     - Races scan against 12-second client timeout
     - Redirect outcomes:
         posts found  → / (straight to inbox)
         timeout      → /?firstScan=1&icps=N (scan still running server-side)
         zero posts   → /?firstScan=0&icps=N (show energetic "posts on the way" state)
```

---

## Why ICP Discovery in Onboarding Matters

The root cause of empty-inbox churn was identified via testing: Scout's keyword search (Apify Google Search) finds public posts from anyone on LinkedIn. The ICP pool (specific monitored profiles) finds posts from known people. Without profiles in the pool, the first scan runs keyword-only — and keyword results are lower volume and lower precision on day 1.

By adding Discover ICPs directly into the wizard, users exit onboarding with:
- Keywords set (from pack or manual)
- 10 specific LinkedIn profiles already being monitored
- A completed first scan that has both sources to pull from

This directly addresses the pattern where new users completed the wizard and saw an empty inbox.

---

## Plan Limits Reference (as of v2.0)

| Plan | Pool Size | Scan Slots/Run | Discover Runs/Day | Max Discovered/Run | Keywords |
|------|-----------|----------------|-------------------|--------------------|----------|
| Trial | 10 | 5 | 1 | 10 | 3 |
| Starter | 50 | 10 | 1 | 10 | 3 |
| Pro | 150 | 25 | 3 | 25 | 10 |
| Agency | 500 | 50 | Unlimited | 50 | 20 |
| Owner | 999 | 999 | Unlimited | 999 | 999 |

> Source of truth: `dashboard/lib/tier.ts` — never hardcode plan limits anywhere else.

---

## Discover ICPs — Technical Notes

**Endpoint:** `POST /api/linkedin-icps/discover`

**How it works:**
1. Builds Google search queries from job titles + keywords: `site:linkedin.com/in "Agency Owner" "client retention"`
2. Runs Apify `google-search-scraper` actor (waitForFinish=120s)
3. Extracts LinkedIn profile URLs from organic results
4. Deduplicates against existing profiles in Airtable (paginated, tenant-scoped)
5. Saves new profiles as `source: 'discovered'` records
6. Stamps `Last ICP Discovery At` on the Tenant record for cooldown enforcement

**Rate limiting (server-side, cannot be bypassed from client):**
- Hard cooldown: 15 minutes between any two runs, all plans
- Daily frequency: `24h / discoverRunsPerDay` window between runs
- Pool cap: blocks if `existingCount >= poolSize`
- First run: no cooldown (lastAt is null) — designed for onboarding use

**Empty result behavior:** If no profiles are found, the API returns `200 { added: 0, profiles: [] }` with a message. The `Last ICP Discovery At` timestamp is NOT stamped on empty results, so users can refine their job titles and retry immediately.

**Onboarding-specific behavior:** Discovery in the wizard uses the same endpoint as Settings. Profiles added during onboarding persist to Settings → LinkedIn → ICP Pool. The pool is pre-populated when the user first visits Settings.

---

## Adversarial Test Cases (v2.0 verified)

| Test | Expected result | Status |
|------|----------------|--------|
| Step 0: Continue with empty Industry | Continue button disabled | ✓ |
| Step 0: Continue with only businessName | Continue button disabled (industry+idealClient required) | ✓ |
| Step 0: 500+ chars in idealClient | maxLength enforced | ✓ |
| Step 2: Continue with 0 keywords | Continue disabled | ✓ |
| Step 2: Load pack twice same industry | Deduplication prevents double-adding | ✓ |
| Step 2: Duplicate custom keyword | Error shown, not added | ✓ |
| Step 3: Run Discovery with no titles | Button disabled, title count = 0 | ✓ |
| Step 3: Run Discovery → then Run Scan | Scan waits until discovery finishes (scan disabled during discovery) | ✓ |
| Step 3: Run Discovery chips (+ Founder) | Title added, chip hidden from suggestion list | ✓ |
| Step 3: Duplicate chip click | Not added (filter prevents duplicate) | ✓ |
| Step 3: Discovery API error | Red error shown, button re-enabled | ✓ |
| Step 3: Discovery 0 added | "Added 0 profiles" shown, user can retry | ✓ |
| Step 3: icpCount updates in summary card | After successful discovery, "ICPs: N profiles added" row appears | ✓ |
| Step 3: Scan timeout (>12s) | Redirect to /?firstScan=1&icps=N | ✓ |
| Step 3: Scan 0 posts found | Energetic done state with icpCount in heading | ✓ |
| Step 3: Scan N>0 posts | Redirect to / (inbox) | ✓ |
| Step 3: Run Scan double-click | Button disabled after first click | ✓ |
| Already-onboarded user visits /onboarding | Redirect to / | ✓ |
| Back from Step 3 to Step 2 | Keywords list reloads from server | ✓ |
| Back from Step 2 to Step 1 | Signal selections preserved in parent state | ✓ |
| Feed empty state (firstScan=0) | New copy, no dead "Refresh feed" button | ✓ |
| Feed empty state "Go to ICP Profiles" link | Routes to /settings?tab=linkedin | ✓ |
| Email sequencing (trial nurture) | Unchanged — no cron or email code touched | ✓ |
| End-to-end production test (owner account, April 11 2026) | 14 posts in inbox after first scan | ✓ CONFIRMED |

---

## Rollback Instructions

```bash
# Roll back to onboarding v1.0 (original wizard — creates a revert commit)
git checkout onboarding-v1.0 -- dashboard/app/onboarding/page.tsx
git checkout onboarding-v1.0 -- dashboard/app/page.tsx
git commit -m "revert: restore onboarding to v1.0"
git push origin main

# View all onboarding version tags
git tag -l "onboarding-*"
```

> Always revert with a new commit — never force-push to main.

---

## Testing Protocol

Before any onboarding change goes to main:

1. **Feature branch first.** All onboarding changes must be developed on a named branch (e.g., `onboarding-v2`) — never commit directly to main.
2. **Adversarial test.** Run through the full checklist above on the branch before merging.
3. **Test account.** Use a dedicated trial account (not a real user or the owner account) to walk through the full wizard end-to-end.
4. **Checklist:**
   - [ ] All wizard steps advance and back-navigate correctly
   - [ ] Business profile saves to Airtable on Step 3 (check record directly)
   - [ ] At least 1 keyword is required before advancing past Keywords step
   - [ ] Discover ICPs panel loads, accepts titles, runs discovery, updates summary card
   - [ ] "Run my first scan" disabled while discovery is in progress
   - [ ] First scan fires and redirects correctly (test all three outcomes: posts found, zero results, timeout)
   - [ ] Onboarded flag is set in Airtable after completion
   - [ ] Returning to `/onboarding` after completion redirects to `/` immediately
   - [ ] Feed empty state shows updated copy, no dead "Refresh feed" button
5. **Get explicit approval** from Mike Walker before merging to main.
6. **Tag the release** immediately after merge (`git tag onboarding-v2.0`).
7. **Update this document** before or alongside the merge commit.

---

## Version History

### v1.0 — Original wizard
**Git tag:** `onboarding-v1.0`
**Status:** Stable rollback point

4-step wizard (Steps 0–3). Blue progress dots and CTA buttons. No ICP discovery in wizard — users had to visit Settings separately. Discover ICPs was locked for Trial users. Feed empty state showed a dead "Trigger another scan now / Refresh feed" button that had no backend.

---

### v2.0 — Discover ICPs embedded in wizard
**Git branch:** `onboarding-v2`
**Status:** Current production — confirmed working
**Merged:** April 2026
**Production verified:** April 11, 2026 — owner account test produced 14 posts in inbox on first onboarding run

Key changes:
- **ClientBloom brand colors** applied throughout (violet-600 progress dots, CTA buttons)
- **ICP Discovery panel** embedded in Step 3, before "Run my first scan"
- **Trial users** get 1 discovery run per day, up to 10 profiles — fills pool in one onboarding session
- **"Run my first scan" blocked during discovery** to prevent race condition
- **icpCount tracked and passed to URL** after scan (`&icps=N`) for analytics
- **Feed empty state rewritten** — removed dead "Refresh feed" button, new energetic copy referencing ICP pool
- **Helper text added** on Step 0 (ideal client field) and Step 2 (manual keyword entry)
- **Textarea sizing fixed** on Step 0 (value delivered: rows 2→3)

---

### v2.1 — Post-deploy polish (April 14, 2026)
**Status:** Production — confirmed working
**Commits:** `89c3d06`, `237bea5`

Three targeted fixes applied after live user testing:

- **Keyword pack truncation message**: removed dead "Upgrade to add all 7 terms" CTA (upgrade isn't available mid-wizard). Replaced with: "To swap in one of these, remove an active keyword above first." Gives users an actionable path instead of a dead end.
- **Run Discovery button disabled after success**: after a successful discovery run (green banner appears), the "Run Discovery" button now disables itself (`disabled={... || !!discResult}`). "Run my first scan" is already the only active CTA at that point. Also adds `disabled:cursor-not-allowed` to the discovery button.
- **First-click bounce from Option B "Set up AI Scoring" link**: `router.replace('/', {scroll:false})` was called synchronously in a `useEffect` which could fire while a concurrent link-click navigation was in progress, overriding it and returning the user to `/`. Fixed by wrapping in `setTimeout(500ms)` with cleanup — if user navigates away before timer fires, cleanup cancels the replace so `?firstScan` stays in the URL and the redirect-guard bypass remains active.

---

### v3.0 — Planned
**Status:** Ideas / backlog

Potential improvements:
- AI keyword enhancement — let users type a rough keyword and get AI-tuned phrase variations
- Auto-detect industry from business name during onboarding
- Save business profile to API on Step 0 advance (cross-device persistence, currently only saved at Step 3)
- Option to add LinkedIn profiles manually (Add Profile) in addition to Discover ICPs
