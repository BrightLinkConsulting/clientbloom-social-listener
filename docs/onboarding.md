# Scout Onboarding — Living Documentation

> **This document is the single source of truth for the Scout onboarding experience.**
> Every version change, UX decision, and technical detail is recorded here.
> Update this file whenever the onboarding flow changes — before merging to main.

---

## Overview

The onboarding wizard is the first experience a new Scout user has with the product. It runs once per account and is gated by the `onboarded` flag on the Tenant record in Airtable. Once marked complete, users are redirected to the feed on every subsequent login.

**Critical principle:** The onboarding wizard has a direct, measurable impact on Day 1 inbox results. Users who complete onboarding with strong keywords and ICP profiles see posts in their feed faster. Users who don't, see an empty inbox and churn. Every version of onboarding should be evaluated against this metric.

---

## File Locations

| File | Purpose |
|------|---------|
| `dashboard/app/onboarding/page.tsx` | Wizard UI — all steps live here |
| `dashboard/app/api/onboarding/complete/route.ts` | Marks `Onboarded: true` in Airtable |
| `dashboard/app/api/business-profile/route.ts` | Saves industry, idealClient, problemSolved |
| `dashboard/app/api/trigger-scan/route.ts` | Fires the first LinkedIn scan |
| `dashboard/app/api/linkedin-icps/discover/route.ts` | Discover ICPs — Apify-powered profile search |
| `dashboard/lib/tier.ts` | All plan limits — single source of truth |
| `dashboard/middleware.ts` | Redirects non-onboarded users to `/onboarding` |

---

## Current Version: v2.0

**Git tag:** `onboarding-v2.0`
**Merged:** April 2026
**Branch:** `feature/discover-icps-trial-unlock`

### What changed from v1.0

- **Discover ICPs unlocked for Trial.** Trial users now have `discoverRunsPerDay: 1` and `discoverMaxPerRun: 10` (previously both were `0`, fully locked). Trial users can run one discovery per day and fill their 10-profile pool in a single session.
- **Arbitrary profile count picker removed from Settings.** The "Max Profiles to Add" button group (which generated confusing numbers like 250/500/749/999 based on plan fractions) has been removed entirely. The API now automatically uses `tierLimits.discoverMaxPerRun` as the cap, with no user input required.
- **Plan-aware context copy added.** Below the Run Discovery button in Settings → LinkedIn, users now see: *"Adds up to X profiles per run · Y run(s) per day"* — dynamically pulled from tier limits and accurate for every plan.
- **Trial info strip updated.** The footer of the ICP pool card now includes Discover run info for Trial users.

### Why this matters for onboarding

Discover ICPs is the fastest path to a populated ICP pool. A Trial user who runs discovery during setup can have 10 real LinkedIn profiles tracked before their first scan runs. That directly improves Day 1 inbox results and reduces the empty-inbox churn pattern.

---

## Wizard Flow — v2.0

> The wizard flow itself (step order and UI) is unchanged from v1.0. The change in v2.0 is that Discover ICPs is now accessible to Trial users from the Settings panel, which will be incorporated into the wizard UI in v3.0.

```
Step 0: Business Info
  → User enters: Business Name, Industry/Niche*, Ideal Client*, Value Delivered
  → Validation: Industry and Ideal Client required before advancing
  → API: none at this step

Step 1: Signal Types (optional selection)
  → User selects: which conversation types Scout should prioritize
  → All 6 types pre-listed; user can select any combination
  → Empty selection = all types (default behavior in scan logic)

Step 2: Keywords
  → User loads an industry starter pack and/or adds custom keywords
  → Minimum 1 keyword required to advance
  → Plan limit enforced: Trial = 6 keywords max

Step 3: Launch Scan
  → Saves business profile to /api/business-profile
  → Marks onboarding complete via /api/onboarding/complete
  → Fires first scan via /api/trigger-scan
  → Races scan against 12-second client timeout
  → Redirects: /?firstScan=1 (timeout), /?firstScan=0 (scan ran, zero results), / (posts found)
```

---

## Plan Limits Reference (as of v2.0)

| Plan | Pool Size | Scan Slots/Run | Discover Runs/Day | Max Discovered/Run | Keywords |
|------|-----------|----------------|-------------------|--------------------|----------|
| Trial | 10 | 5 | **1** | **10** | 6 |
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
- First run: no cooldown (lastAt is null)

**Empty result behavior:** If no profiles are found, the API returns `200 { added: 0, profiles: [] }` with a message. The `Last ICP Discovery At` timestamp is NOT stamped on empty results, so users can refine their job titles and retry immediately.

---

## Rollback Instructions

Every version is tagged in git. To revert production to any prior version:

```bash
# View all onboarding version tags
git tag -l "onboarding-*"

# Roll back to v1.0 (creates a revert commit — does NOT rewrite history)
git revert onboarding-v2.0..HEAD --no-edit
git push origin main

# Or to restore a specific file to a tagged version
git checkout onboarding-v1.0 -- dashboard/app/onboarding/page.tsx
git checkout onboarding-v1.0 -- dashboard/lib/tier.ts
git commit -m "revert: restore onboarding to v1.0"
git push origin main
```

> Always revert with a new commit — never force-push to main.

---

## Testing Protocol

Before any onboarding change goes to main:

1. **Feature branch first.** All onboarding changes must be developed on a named branch (e.g., `feature/onboarding-v3`) — never commit directly to main.
2. **Preview deployment.** Vercel auto-deploys every pushed branch as a preview URL. Test on the preview URL before merging.
3. **Test account.** Use a dedicated trial account (not a real user or the owner account) to walk through the full wizard end-to-end.
4. **Checklist:**
   - [ ] All wizard steps advance and back-navigate correctly
   - [ ] Business profile saves to Airtable on Step 3 (check record directly)
   - [ ] At least 1 keyword is required before advancing past Keywords step
   - [ ] First scan fires and redirects correctly (test all three outcomes: posts found, zero results, timeout)
   - [ ] Onboarded flag is set in Airtable after completion
   - [ ] Returning to `/onboarding` after completion redirects to `/` immediately
   - [ ] Discover ICPs works for Trial (1 run, up to 10 profiles, blocks on second run within 24h)
5. **Get explicit approval** from Mike Walker before merging to main.
6. **Tag the release** immediately after merge (`git tag onboarding-vX.X`).
7. **Update this document** before or alongside the merge commit.

---

## Version History

### v1.0 — Original wizard
**Git tag:** `onboarding-v1.0`
**Status:** Stable, tagged revert point

4-step wizard:
- Step 0: Business Info
- Step 1: Signal Types (6 options, any combination, empty = all)
- Step 2: Keywords (industry starter pack + custom terms, min 1 required)
- Step 3: Launch Scan (saves profile, marks complete, fires scan, races 12s timeout)

Discover ICPs locked for Trial. Settings had an arbitrary "Max Profiles to Add" button group generating plan-fraction numbers (e.g., 250/500/749/999 for Owner account).

---

### v2.0 — Discover ICPs unlocked for Trial
**Git tag:** `onboarding-v2.0`
**Status:** Current production

Wizard flow: unchanged from v1.0.

Settings changes:
- Trial users can now run Discover ICPs (1 run/day, up to 10 profiles)
- Arbitrary profile count picker removed from Settings → LinkedIn → Discover ICPs panel
- Plan-aware context copy added below Run Discovery button
- Trial info strip updated to include Discover run info

See [What changed from v1.0](#what-changed-from-v10) above for full detail.

---

### v3.0 — Planned
**Status:** In design

Key goals:
- Incorporate Discover ICPs directly into the onboarding wizard as a dedicated step
- Remove Signal Types step (auto-select all — users don't differentiate these meaningfully)
- Save business profile to API on Step 0 advance (cross-device persistence, currently only saved at Step 3)
- AI keyword enhancement — let users type a rough keyword and get AI-tuned phrase variations
- Update Launch Scan summary card to show ICP pool count alongside keyword count
- Evaluation metric: % of new users with at least 1 post in inbox within 24h of completing onboarding

> v3.0 will be developed on `feature/onboarding-v3`, tested on preview deployment, and requires Mike's explicit approval before merging to main.
