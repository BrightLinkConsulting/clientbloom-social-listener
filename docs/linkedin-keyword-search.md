# LinkedIn Keyword Search — Feature Documentation

## Overview

Scout searches LinkedIn for public posts matching user-configured keyword phrases and surfaces them in the feed. Keywords are stored as `linkedin_term` source records in Airtable.

---

## Plan limits

| Plan | Keyword limit |
|------|--------------|
| Trial | 3 |
| Scout Starter | 3 |
| Scout Pro | 10 |
| Scout Agency | 20 |
| Owner | 999 |

Limits are defined in `lib/tier.ts` via `getTierLimits(plan).keywords`.

## Scan frequency

- **Trial / Scout Starter**: 1× daily
- **Scout Pro / Scout Agency / Owner**: 2× daily

The UI always shows the plan-accurate frequency. Any component that displays scan frequency must derive it from the user's plan — never hardcode "2× daily".

---

## Enforcement architecture

Keyword limits are enforced at two layers:

### Server-side (authoritative)
`POST /api/sources` calls `countKeywordSources(tenantId)` before creating a record. This counts **all** `linkedin_term` records including paused ones. Returns HTTP 429 with `{ error, limit, current }` if at cap.

### Client-side (UX guard)
The UI pre-checks `terms.length >= planLimit` before making a POST request. **`terms.length` — not `activeCount`** — must be used to match the server-side enforcement. Using `activeCount` creates a mismatch where a user with paused terms sees the UI as "not at cap" but the API returns 429.

---

## API response shape

`POST /api/sources` returns:

```json
{
  "source": {
    "id": "recXXXXXXXX",
    "name": "client retention",
    "type": "linkedin_term",
    "value": "client retention",
    "active": true,
    "priority": "high"
  }
}
```

The record ID is at `data.source.id`. Do NOT use `data.record.id` or `data.id`.

---

## Adversarial stress test — bugs found and fixed

The following bugs were identified during an adversarial stress test and resolved before production deployment.

### Bug #1 — CRITICAL: Wrong API response path for record ID
**Location:** `app/onboarding/page.tsx` — `StepKeywords`, both `addTerm` and `loadPack`

**Symptom:** All terms added during onboarding get temporary `tmp-${Date.now()}` IDs because the code read `data?.record?.id || data?.id` but the API returns `{ source: { id } }`. Terms with tmp- IDs cannot be deleted from the onboarding step (the DELETE call is skipped for tmp- prefixed IDs).

**Fix:** Changed both reads to `data?.source?.id` with `tmp-${Date.now()}` as the only fallback.

---

### Bug #2 — HIGH: `atCap` used active count; API enforces total count
**Location:** `app/settings/page.tsx` — `LinkedInTermsSection`

**Symptom:** A user with 2 active + 1 paused terms (3 total, at the Trial/Starter limit) saw the UI allow adding a new term — Browse suggestions and Add custom term showed as available — but the API returned 429 on the POST.

**Fix:** Changed `atCap = activeCount >= planLimit` to `atCap = terms.length >= planLimit`. Also updated the `addTerm` guard and `loadIndustryPack` loop guard from `activeCount` to `terms.length`. The section description was updated from `X of Y terms active` to `X of planLimit keywords used · Y active` to make the limit visible.

---

### Bug #3 — HIGH: Raw JSON error strings shown to user
**Location:** `app/settings/page.tsx` and `app/onboarding/page.tsx` — error throw paths

**Symptom:** When the API returned an error (e.g. 429 Too Many Requests), the error banner showed the raw JSON string: `{"error":"Keyword limit reached","limit":3,"current":3}` — not a readable message.

**Fix:** Added `parseApiError(resp)` helper in both files. It attempts `JSON.parse(text).error` and falls back to the raw string if parsing fails.

```ts
const parseApiError = async (resp: Response): Promise<string> => {
  try {
    const text = await resp.text()
    const parsed = JSON.parse(text)
    return parsed.error || text
  } catch {
    return 'Something went wrong — try again.'
  }
}
```

---

### Bug #4 — HIGH: Back-navigation unmounts StepKeywords, clears saved terms
**Location:** `app/onboarding/page.tsx` — `StepKeywords`

**Symptom:** If a user added keywords in Step 3, navigated back to Step 2, then returned to Step 3, the `terms` state reset to `[]`. The terms were already saved in Airtable, but the UI showed an empty list, making the user think their work was lost.

**Fix:** Added a `useEffect` on mount that fetches `/api/sources` and initializes `terms` from any existing `linkedin_term` records. A `loadingTerms` boolean shows a brief spinner while fetching so the UI doesn't flash empty before populating.

---

### Bug #5 — MEDIUM: Duplicate term addition was silently ignored
**Location:** `app/onboarding/page.tsx` — `StepKeywords.addTerm`

**Symptom:** If a user tried to add a term that already existed, `addTerm` returned early with no feedback. The user had no idea whether their action failed, the term was filtered, or the input was broken.

**Fix:** Changed the silent `return` to `setError(\`"${t}" is already in your keyword list.\`)`.

---

### Bug #6 — MEDIUM: Starter pack loaded 0 terms with no feedback
**Location:** `app/onboarding/page.tsx` — `StepKeywords.loadPack`

**Symptom:** If a user selected an industry pack where all terms were already in their list (or they were at cap), `loadPack` would complete silently — the pack picker would close, nothing would change, and the user had no idea what happened.

**Fix:** Before iterating `toAdd`, check if `toAdd.length === 0` and set a `packInfo` message explaining why: either "All terms from this pack are already in your list" or "You're at your X-keyword limit." The blue info banner is separate from the red error banner so it doesn't look like a failure.

---

### Bug #7 — MEDIUM: Load Pack button disabled with no explanation when at cap
**Location:** `app/onboarding/page.tsx` — `StepKeywords` starter pack panel

**Symptom:** When the user was at their keyword cap, the Load Pack button became `disabled` but showed no label change or tooltip. Users couldn't tell why the button wasn't working.

**Fix:**
- Added `title` attribute with the cap explanation (native browser tooltip on hover)
- Changed button label from `'Load pack'` to `atCap ? 'At limit' : 'Load pack'`
- Added inline amber helper text below the picker: "Remove a term above to free up a slot before loading a pack"
- Removed `disabled` condition for `atCap` from the button itself — the `loadPack` function handles it gracefully via Bug #6 fix

---

### Bug #8 — LOW: "0 of 0 terms active" shown when no terms configured
**Location:** `app/onboarding/page.tsx` — `StepKeywords`

**Symptom:** Before any terms were added, the plan limit pill showed "0 / 3 keywords used" and the section rendered nothing else — it looked like a broken state.

**Fix:** Added an explicit empty-state message below the plan pill: "No keyword searches added yet — use a starter pack or add your own below." This only shows when `terms.length === 0`.

---

## Settings page copy rules

### Section description
Format: `{total} of {planLimit} keywords used · {activeCount} active · Scout searches LinkedIn {scanFreq} daily`

Total is what the limit tracks. Active count is shown so users can see which terms are currently running.

### Limit-reached banner copy

| Plan | Message |
|------|---------|
| Trial / Scout Starter | "Pause or remove a term to swap in a different one. Pro includes 10 searches · Agency includes 20. [Upgrade →]" |
| Scout Pro | "Pause or remove a term to swap in a different one. Agency includes 20 searches. [Upgrade →]" |
| Scout Agency / Owner | "Pause or remove a term to swap in a different one. Keeping 6–10 tightly focused terms tends to surface higher-quality conversations." |

### Add custom term button (when at cap)
Label changes to: "At limit — pause a term to add"
Button is `disabled` when at cap (opening an input field that can't submit is worse UX than blocking entry).

### Browse suggestions / Starter packs (when at cap)
These buttons remain **always clickable**. Browsing is useful even when full. The limit is enforced inside `addTerm` — the user sees a clear error if they try to add when at cap.

---

## Onboarding wizard integration

Step 3 of the 4-step onboarding wizard is `StepKeywords`. It saves terms immediately to Airtable via `POST /api/sources` on each add — not batched at the end. This ensures terms persist if the user abandons onboarding after Step 3.

Key behaviors:
- Terms are fetched from `/api/sources` on mount to restore state after back-navigation
- Continue button shows "Continue →" when terms exist, "Skip for now →" when empty
- Starter pack picker and Add custom term are always visible during onboarding (not gated behind `atCap` boolean for the picker — the button label and inline message communicate the cap state)
