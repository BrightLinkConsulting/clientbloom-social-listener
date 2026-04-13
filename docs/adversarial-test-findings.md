# Adversarial Test Findings — Post-Merge Production Review

**Date:** April 12, 2026  
**Scope:** Manual adversarial code review of files changed by `feature/apify-resilience` merge  
**Files reviewed:** `lib/scan.ts`, `lib/scan-health.ts`, `app/api/trigger-scan/route.ts`  
**Automated suite result:** 16/16 PASS (`scripts/adversarial-test.ts`)

---

## Summary

Four issues were identified during deep code review. The automated adversarial suite catches
actor failures, fallback chains, and schema validation — but cannot catch logic bugs that only
manifest under specific runtime conditions (partial saves, null data, concurrent Airtable writes).

| ID  | Location               | Severity   | Type                | Status         |
|-----|------------------------|------------|---------------------|----------------|
| B1  | `scan.ts:598-600`      | Minor      | False positive flag  | Fixed (this PR) |
| B2  | `scan.ts:482,794`      | Real bug   | Duplicate accumulation | Fixed (this PR) |
| B3  | `scan-health.ts:183`   | Performance | Double Airtable read | Backlog        |
| B4  | `scan.ts:649`          | UX/Logging | Silent keyword skip  | Backlog        |

---

## B1 — False Positive `degraded=true` on Partial Saves

**File:** `dashboard/lib/scan.ts` — `saveScoredPosts()`, lines 598–600  
**Severity:** Minor (no data loss, misleading metric only)

### What happens

The post-write sanity check (R4) calculates `blankPct` by dividing `blankTextCount` by `saved`:

```typescript
const blankTextCount = recordsToSave.filter(r => !r.fields['Post Text']).length
const blankPct = saved > 0 ? blankTextCount / saved : 0
```

`blankTextCount` is counted against `recordsToSave` (the full array before writing), but
`saved` is the number of records actually written (which can be less than `recordsToSave.length`
when the batch fails and the individual fallback only partially succeeds).

**Example:** 10 records prepared, 4 have blank Post Text, but Airtable saves only 6 (batch fails).
`blankPct = 4 / 6 = 67%` → `degraded=true`. The threshold is 30%, so this triggers a false
alarm even though the 4 blank-text records may be the ones that failed to save.

### Correct behaviour

The blank rate should be measured against the prepared records, not the saved count:

```typescript
const blankPct = recordsToSave.length > 0 ? blankTextCount / recordsToSave.length : 0
```

### Impact

`degraded=true` appears in the API response and scan health logs. Under normal conditions
(batch saves succeed), `saved === recordsToSave.length` and the bug is invisible. It only fires
when Airtable batch creates fail AND the individual fallback is partial — a rare path.

---

## B2 — Empty `postUrl` Bypasses Deduplication (Duplicate Accumulation)

**File:** `dashboard/lib/scan.ts` — `getExistingPostUrls()` (line 482) and dedup filter (line 794)  
**Severity:** Real bug — silent duplicate accumulation on every scan

### What happens

`getExistingPostUrls` filters out empty strings when building the dedup Set:

```typescript
// Line 482
return new Set(records.map(r => r.fields['Post URL'] as string).filter(Boolean))
// filter(Boolean) removes '' from the set — '' is never in existingUrls
```

The dedup check in `runScanForTenant` coerces null/undefined URLs to empty string:

```typescript
// Line 794
const newPosts = allPosts.filter(post => !existingUrls.has(post.postUrl || ''))
// If post.postUrl is null/undefined/'' → existingUrls.has('') → false → treated as NEW every scan
```

Any post returned by an actor without a URL (null or empty `postUrl`) passes dedup on every
scan cycle and gets written to Airtable repeatedly. Over weeks, this creates hundreds of
duplicate blank-URL records that pollute the Captured Posts table.

### Correct behaviour

Posts with no URL have no identity — they cannot be deduped regardless of approach. The fix
is to drop them before the dedup + scoring pipeline rather than letting them accumulate:

```typescript
const newPosts = allPosts.filter(post => post.postUrl && !existingUrls.has(post.postUrl))
```

This also slightly tightens the dedup filter: it no longer relies on the `|| ''` coercion,
which is a cleaner contract.

### Why this matters now

The `apimaestro/linkedin-posts-search-scraper-no-cookies` actor (used in keyword search mode)
occasionally returns records without a `postUrl` field when the LinkedIn post is a reshare
without a standalone permalink. With multiple tenants running keyword scans, this accumulates
silently across every scan cycle with no logging or warning.

---

## B3 — Double Airtable Read Per Lock Acquire (Performance)

**File:** `dashboard/lib/scan-health.ts` — `acquireScanLock()`, line 183  
**Severity:** Performance only — 2× Airtable reads per lock operation

### What happens

`acquireScanLock()` calls `getScanHealth()` directly (1st read), then calls
`upsertScanHealth()` which internally calls `getScanHealth()` again (2nd read) to find
the record ID for the PATCH:

```
acquireScanLock()
  → getScanHealth(tenantId)          ← read 1: check for existing lock
  → upsertScanHealth(...)
      → getScanHealth(tenantId)      ← read 2: find recordId for PATCH
```

This doubles the Airtable API calls for every lock operation. With many tenants running
cron scans, this contributes to rate limit pressure on the shared Airtable base.

### Fix approach (backlog)

Pass the `recordId` from the first `getScanHealth()` call directly into `upsertScanHealth()`:

```typescript
export async function upsertScanHealth(
  tenantId: string,
  fields: Partial<{...}>,
  recordIdHint?: string,  // skip re-read if caller already has it
): Promise<void>
```

Or restructure `acquireScanLock` to call the Airtable PATCH directly when it already has
`health.recordId`. Not urgent — the race condition note in the file header is a larger
concern than the extra read.

---

## B4 — Silent Skip of Keyword Sources When ICP Profiles Exist

**File:** `dashboard/lib/scan.ts` — `scanLinkedIn()`, line 635–649  
**Severity:** UX / Logging — no data loss

### What happens

`scanLinkedIn()` returns immediately after the ICP profile scan without logging that keyword
sources are being skipped:

```typescript
if (icpProfiles.length > 0) {
  // ... runs ICP scan ...
  return { source: 'icp_profiles', posts, actorsUsed }
  // keyword scan code below is unreachable when ICP profiles exist
}
// keywords only run here
```

A tenant who has both ICP profiles AND keyword sources configured will never see keyword
results, with no indication in logs or scan response that keyword sources exist but were skipped.

### Fix approach (backlog)

Add a log line when keyword sources exist but are being bypassed:

```typescript
if (icpProfiles.length > 0) {
  if (linkedinTerms.length > 0) {
    console.log(`[scan] LinkedIn: ICP profiles take priority — ${linkedinTerms.length} keyword source(s) skipped`)
  }
  // ... rest of ICP scan
}
```

This is a design decision (ICP profiles > keywords for quality reasons), but it should be
observable in logs. Consider also surfacing this in the scan response `message` field.

---

## Automated Suite Coverage Gap

The 16-test adversarial suite in `scripts/adversarial-test.ts` is excellent for:
- Actor failures and fallback chain activation
- Schema validation (sampling logic)
- Field normalization (canonical field mapping)
- Lock acquire/release behavior
- Inflight ceiling enforcement

It does NOT cover:
- Partial save scenarios (batch fails + individual fallback saves subset)
- Posts with null/empty URLs flowing through dedup
- Airtable read efficiency (B3)
- Scan source priority logging (B4)

**Recommendation:** Add two test cases to the suite:
1. `saveScoredPosts` with a mocked batch failure and 40% blank-text records in the partial-save set
2. Posts with `postUrl: null` or `postUrl: ''` — confirm they are excluded from the pipeline

---

## Disposition

**Fixed in this session:** B1, B2 (code changes in `scan.ts`)  
**Backlog (low priority):** B3, B4  
**No issues found in:** fallback chain logic, schema validator, concurrency lock token generation,
inflight counter arithmetic, `getTenantRow()` field fetching (`.append()` fix confirmed correct)
