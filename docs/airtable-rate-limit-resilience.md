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

## Solution: `airtableFetch` (added April 2026)

`lib/airtable.ts` exports `airtableFetch()` — a drop-in replacement for `fetch()`
for all Airtable API calls. It wraps every outbound call with:

- **Up to 3 retries** after the first 429 or transient 5xx
- **Exponential backoff**: 1 s → 2 s → 4 s (doubles each attempt)
- **Retry-After header respected**: if Airtable says "wait 2 s", we honour it
- **+/-20% random jitter**: desynchronises simultaneous workers to prevent thundering-herd
- **30 s hard cap** per wait: prevents hanging long-running Vercel functions
- **No retry on non-transient 4xx**: 400, 401, 403, 404, 422 are client errors
  and will not succeed on retry — they return immediately

### Coverage

Every Airtable API call now flows through `airtableFetch`:

| File | Calls wrapped |
|------|--------------|
| `lib/airtable.ts` | `airtableList`, `airtableCreate`, `airtableBatchCreate`, `airtableUpdate`, `airtableDelete`, `verifyRecordTenant` |
| `lib/scan.ts` | `atGet` (business profile, ICP profiles, sources), `getExistingPostUrls` (dedup) |
| `app/api/cron/scan/route.ts` | `getActiveTenants` (tenant list fetch) |
| `app/api/trigger-scan/route.ts` | `getTenantApifyKey`, `getTenantRecord`, `updateTenantLastScan` |

### What is NOT wrapped

The worker-dispatch `fetch` call in `cron/scan/route.ts` (which calls
`/api/cron/scan-tenant`) is intentionally NOT wrapped — it is a Vercel-to-Vercel
HTTP call, not an Airtable API call, and has its own timeout/retry semantics.

---

## Remaining open gaps (P1 — future work)

1. **Other route files** — Several lower-traffic routes (`cron/digest`, `cron/trial-check`,
   `cron/archive-posts`, `billing/cancel`, `auth/*`, etc.) still use bare `fetch` against
   Airtable. These hit low-frequency paths and are not burst sources, but should be
   migrated to `airtableFetch` incrementally for consistency and completeness.

2. **Redis-backed IP rate limiter** — The in-memory rate limiter resets on Vercel cold
   starts. Migrate to Upstash Redis for persistence across function instances.

3. **Staggered cron dispatch** — At 200+ tenants, add a random jitter (0-5 s) before
   each `dispatchTenantScan` call so workers do not all hit Airtable simultaneously
   at scan start.

---

## Airtable schema additions (April 2026)

Two new fields were added to the **Tenants** table (`tblKciy1tqPmBJHmT`) in the
`ClientBloom Social Listener` base (`appZWp7QdPptIOUYB`):

| Field name | Type | Field ID | Purpose |
|-----------|------|----------|---------|
| `Suggestions Used` | Number (precision 0) | `fldHIlV3UszXvftqf` | Running count of AI comment suggestions. Enforces `commentCredits` tier limit in `/api/posts/[id]/suggest`. |
| `Last ICP Discovery At` | DateTime (ISO, America/New_York) | `fldBYAgZlMEfjitHk` | Timestamp of last ICP discovery run. Enforces cooldown in `/api/linkedin-icps/discover` (60 min trial / 15 min paid). |

---

## Testing the retry behaviour locally

To simulate a 429, temporarily replace the Airtable URL in a test with a mock server
that returns `HTTP/1.1 429 Too Many Requests` with a `Retry-After: 1` header.
Confirm that:

1. The first call returns 429 — `[airtable] HTTP 429 — attempt 1/3, waiting ~1000ms` logged
2. Second call (after wait) returns 429 — `[airtable] HTTP 429 — attempt 2/3, waiting ~2000ms` logged
3. Third call (after wait) returns 429 — `[airtable] HTTP 429 — attempt 3/3, waiting ~4000ms` logged
4. Fourth call (if still 429) — 429 returned to caller without further retry
5. On eventual 200 recovery — `[airtable] Recovered after N retry(ies)` logged

### Expected log output during a rate-limit event (200 tenants)

```
[airtable] HTTP 429 — attempt 1/3, waiting 987ms
[airtable] HTTP 429 — attempt 1/3, waiting 1043ms
[airtable] HTTP 429 — attempt 2/3, waiting 2201ms
[airtable] Recovered after 2 retry(ies) — status 200
[airtable] Recovered after 1 retry(ies) — status 200
```

Workers that fail after 3 retries will log their specific error upstream
(e.g., `[scan] Failed to fetch existing post URLs, skipping dedup: 429`),
and the scan will continue with deduplication skipped rather than crashing entirely.
