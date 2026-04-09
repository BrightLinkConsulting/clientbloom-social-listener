# Airtable Rate-Limit Resilience

## Problem

Airtable enforces a shared rate limit of **5 requests/second per base** across ALL
tenants. Scout runs on a single shared base (`PLATFORM_AIRTABLE_BASE_ID`), which
means every concurrent scan run competes for the same quota.

### Burst math at scale

| Active tenants scanning | Airtable calls per burst | Time to drain at 5 req/s |
|------------------------|--------------------------|--------------------------|
| 10                     | ~120                     | ~24 s                    |
| 50                     | ~600                     | ~120 s                   |
| 100                    | ~1,200                   | ~240 s (4 min)           |
| 200                    | ~2,400                   | ~480 s (8 min)           |

Without retry logic, a burst at the 100+ tenant scale causes cascading HTTP 429
errors. Workers fail silently, `scan-retry` and `scan-watchdog` then pile on more
calls — multiplying the load 2–3x and making the product look broken to every
trial user evaluating it at the same time.

---

## Three-layer solution (all implemented April 2026)

### Layer 1: `airtableFetch` — retry-with-backoff at the call site

`lib/airtable.ts` exports `airtableFetch()` — a drop-in replacement for `fetch()`
for all Airtable API calls. It wraps every outbound call with:

- **Up to 3 retries** after the first 429 or transient 5xx
- **Exponential backoff**: 1 s → 2 s → 4 s (doubles each attempt)
- **Retry-After header respected**: if Airtable says "wait 2 s", we honour it
- **+/-20% random jitter**: desynchronises simultaneous workers
- **10 s hard cap per wait**: total retry budget max ~21 s (safe for all function budgets)
- **No retry on non-transient 4xx**: 400, 401, 403, 404, 422 return immediately

Cap rationale: `trigger-scan` has a 90 s Vercel budget. Old cap was 30 s — three
retries at 30 s each would consume 100% of the budget in waits alone before any
Apify or Claude work could start. New 10 s cap leaves at least 60 s for actual work.

### Layer 2: 2 s guard before batch→individual fallback in `saveScoredPosts`

When `airtableBatchCreate` fails (after all retries), `saveScoredPosts` falls back
to individual `airtableCreate` calls per record. Without a pause, this fallback fires
10 individual creates immediately after a sustained 429 — generating up to 40 more
Airtable calls (10 records × 4 possible attempts each) and amplifying the problem.

The 2 s delay inserted before the fallback loop gives Airtable's quota time to reset
before adding more pressure. The fallback also now logs a warning when it saves fewer
records than expected, making partial-save events visible in Vercel logs.

### Layer 3: Staggered cron dispatch in `cron/scan/route.ts`

`airtableFetch` backoff addresses failures reactively. The root cause of the thundering
herd is that all workers start at the same millisecond. Staggered dispatch solves this
proactively.

Each tenant dispatch is preceded by a random sleep in `[0, DISPATCH_JITTER_MAX_MS]`
(currently 5 s). Effect on 200 simultaneous tenants:

| Approach | Peak Airtable call rate | Backoff needed? |
|---------|------------------------|-----------------|
| No stagger | ~2,400 req/burst | Yes, always |
| 5 s stagger | ~40 req/s average | Rarely |

Workers still run fully in parallel — only the start time is staggered. The
orchestrator's 300 s budget absorbs the 5 s overhead comfortably.

To tune: increase `DISPATCH_JITTER_MAX_MS` in `cron/scan/route.ts` if Airtable
rate-limit warnings continue to appear in logs at higher tenant counts.

---

## Coverage: files where `airtableFetch` is used

| File | Calls wrapped |
|------|--------------|
| `lib/airtable.ts` | `airtableList`, `airtableCreate`, `airtableBatchCreate`, `airtableUpdate`, `airtableDelete`, `verifyRecordTenant` |
| `lib/scan.ts` | `atGet` (business profile, ICP profiles, sources), `getExistingPostUrls` (dedup) |
| `app/api/cron/scan/route.ts` | `getActiveTenants` (tenant list fetch) |
| `app/api/trigger-scan/route.ts` | `getTenantRow`, `recordScanTimestamp` |

### What is NOT wrapped

The worker-dispatch `fetch` call in `cron/scan/route.ts` (which calls
`/api/cron/scan-tenant`) is intentionally NOT wrapped — it is a Vercel-to-Vercel
HTTP call, not an Airtable API call, and has its own timeout/retry semantics.

Several lower-traffic routes (`cron/digest`, `cron/trial-check`, `cron/archive-posts`,
`billing/cancel`, `auth/*`, etc.) still use bare `fetch` against Airtable. These hit
low-frequency paths and are not burst sources. Migrating them to `airtableFetch` is
a P2 cleanup task.

---

## Airtable schema additions (April 2026)

Two new fields were added to the **Tenants** table (`tblKciy1tqPmBJHmT`) in the
`ClientBloom Social Listener` base (`appZWp7QdPptIOUYB`):

| Field name | Type | Field ID | Purpose |
|-----------|------|----------|---------|
| `Suggestions Used` | Number (precision 0) | `fldHIlV3UszXvftqf` | Running count of AI comment suggestions. Enforces `commentCredits` tier limit in `/api/posts/[id]/suggest`. |
| `Last ICP Discovery At` | DateTime (ISO, America/New_York) | `fldBYAgZlMEfjitHk` | Timestamp of last ICP discovery run. Enforces cooldown in `/api/linkedin-icps/discover` (60 min trial / 15 min paid). |

---

## Remaining open gaps

| Priority | Item | File | Notes |
|---------|------|------|-------|
| P1 | Redis-backed IP rate limiter | `middleware.ts` | In-memory limiter resets on Vercel cold start |
| P1 | Manual scan daily cap | `trigger-scan/route.ts` | 30-min cooldown exists; no daily total cap |
| P2 | Migrate remaining routes to `airtableFetch` | `cron/digest`, `cron/trial-check`, `billing/cancel`, `auth/*` | Low-frequency paths, not burst sources |
| P2 | `dedupSucceeded` in ScanResult | `lib/scan.ts` | Dedup silently skips on 429 exhaustion; useful for observability |
| P3 | Per-invocation Airtable circuit breaker | `lib/airtable.ts` | After first exhausted retry, skip remaining calls fast |

---

## Testing the retry behaviour

To simulate a 429, use a mock server that returns:
```
HTTP/1.1 429 Too Many Requests
Retry-After: 1
Content-Type: application/json

{}
```

Confirm the following log sequence:
```
[airtable] HTTP 429 — attempt 1/3, waiting ~987ms
[airtable] HTTP 429 — attempt 2/3, waiting ~2041ms
[airtable] HTTP 429 — attempt 3/3, waiting ~4118ms
# 4th call (if still 429): returns 429 to caller without further retry

# On recovery:
[airtable] Recovered after 2 retry(ies) — status 200
```

To test staggered dispatch, check `[cron/scan]` logs for the orchestrator start time
vs individual `[scan-tenant]` invocation start times — they should be spread across
a ~5 s window rather than all showing the same timestamp.

To test the batch→individual fallback, check for:
```
[saveScoredPosts] Batch create failed, falling back to individual creates: ...
[saveScoredPosts] Individual fallback: saved X/Y records
```

---

## Constants reference

| Constant | File | Value | Purpose |
|---------|------|-------|---------|
| `RETRY_MAX` | `lib/airtable.ts` | `3` | Max additional retries after first attempt |
| `RETRY_BASE_MS` | `lib/airtable.ts` | `1_000` | Base delay for exponential backoff (ms) |
| `RETRY_CAP_MS` | `lib/airtable.ts` | `10_000` | Max wait per retry attempt (ms) |
| `DISPATCH_JITTER_MAX_MS` | `cron/scan/route.ts` | `5_000` | Max random stagger before each tenant dispatch (ms) |
| Batch fallback guard | `lib/scan.ts` | `2_000` | Fixed delay before individual-create fallback (ms) |
