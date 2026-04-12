# Apify Resilience Plan
## Scout — Concentration Risk Mitigation

**Status:** `feature/apify-resilience` branch — pre-production  
**Last Updated:** April 2026 (Session 15)  
**Owner:** Mike Walker / BrightLink Consulting  
**Related docs:** `docs/apify-knowledge-base.md`, `docs/adversarial-test-results.md`

---

## Why This Document Exists

Scout's entire feed depends on two third-party Apify actors it does not own, control, or have contractual guarantees on:

- `harvestapi/linkedin-profile-posts` — ICP profile scanning
- `apimaestro/linkedin-posts-search-scraper-no-cookies` — keyword term scanning

If either actor changes its output schema, raises prices, goes offline, or gets blocked by LinkedIn, Scout's core product fails with zero fallback. This document records the full remediation: risk identification, fix strategy, adversarial test design, bug findings, and the pre-production validation checklist that must be passed before any of this goes live.

**Executive standard:** Nothing in this document is declared fixed unless it has been verified to pass a named test scenario. Opinions about whether something "should work" are not accepted as evidence.

---

## Risk Register

| # | Risk | Severity | Category |
|---|------|----------|----------|
| R1 | Zero fallback actors — primary failure = total outage | CRITICAL | Concentration |
| R2 | Synchronous blocking run pattern — Vercel slot exhaustion at scale | CRITICAL | Architecture |
| R3 | Memory hardcoded at 256MB — browser actors may silently fail | HIGH | Configuration |
| R4 | No output schema validation — actor schema changes write blank records silently | HIGH | Data Integrity |
| R5 | Shared API key across all tenants — concurrent run limit competition | HIGH | Scalability |

---

## Fix Specifications

### Fix 1 — Fallback Actor Chain (addresses R1)

**Implementation file:** `dashboard/lib/scan.ts`

A `FALLBACK_ACTORS` constant maps each primary actor ID to a fallback configuration object:

```typescript
{
  actorId: string,      // fallback actor from a DIFFERENT vendor family
  waitSecs: number,     // longer timeout — fallbacks are slower
  schema: ActorSchema,  // field definitions for this specific actor's output
}
```

`runApifyActorWithRetry()` is extended with a third attempt using the fallback config if both primary retries return 0 items with a retriable error type.

**Critical constraint:** The fallback actor must use a different scraping strategy than the primary. If the primary uses cookie-less proxy rotation and the fallback also uses cookie-less proxy rotation, a LinkedIn platform-level block takes out both simultaneously. Vendor family diversity is required, not just actor ID diversity.

**Fallback waitSecs:** 90 seconds (separate from primary's 30s). This handles the case where the fallback actor is inherently slower.

**Schema definitions:** Each actor ID — primary and fallback — maps to a `fieldMap` that normalizes that actor's specific field names to Scout's canonical field names (`text`, `authorName`, `authorUrl`, `postUrl`). Normalization happens at transform time, so all downstream code sees Scout canonical fields regardless of which actor ran.

---

### Fix 2 — Concurrency Lock with Token + Expiry (addresses R2)

**Implementation file:** `dashboard/lib/scan-health.ts`

Two new Airtable fields added to the `Scan Health` table:
- `Scan Lock Token` — UUID written when a scan begins, cleared when it ends
- `Scan Lock Expires At` — timestamp set to `now + 120 seconds` on lock acquisition

**Lock acquisition logic:**
1. Read current lock token and expiry for the tenant
2. If token is set AND expiry is in the future: scan already running, abort
3. If token is set BUT expiry is in the past: stale lock, proceed (crashed scan recovery)
4. If token is empty: acquire lock, write new UUID + expiry, proceed with scan

**Lock release:** On scan completion OR failure, clear both fields (set to null/empty).

**Race condition acknowledgment:** This is not perfectly atomic. Two Vercel instances firing within Airtable's write latency window (~200ms) can both see an empty token and both proceed. The mitigation is the scan stagger (15 seconds between tenants in the cron loop), which makes sub-200ms races statistically unlikely. A truly atomic distributed lock would require Redis or a dedicated locking service — documented as a 90-day architectural improvement.

---

### Fix 3 — Per-Tenant Memory Override (addresses R3)

**Implementation file:** `dashboard/lib/scan.ts`

A new `Scan Memory MB` field on the `Tenants` Airtable table. The scan function reads this field and uses it if set; falls back to the global default (256MB) if null.

This allows memory to be tuned per-tenant without a code deploy and avoids a blanket cost regression by only increasing memory for tenants where it is demonstrated to be necessary.

**Pre-launch test required:** Run a memory comparison test on a real tenant (256MB vs 1024MB, same inputs, compare result counts). Document findings. If counts are identical, 256MB is confirmed sufficient for current actors and the global default is not changed. If counts differ, document which actors need higher memory and update accordingly.

---

### Fix 4 — Schema Validator with Field Normalization (addresses R4)

**Implementation file:** `dashboard/lib/scan.ts`

`validateActorOutput(actorId, items[])`:
- Checks first, middle (floor(length/2)), and last item in the returned array
- Each item is validated against the actor's registered schema (required fields, non-null check)
- If any sampled item fails validation: scan aborts, `Last Scan Status` set to `failed`, `Last Error` set to `schema_mismatch:{actorId}`
- If validation passes: field normalization runs via the actor's `fieldMap` before any data is written to Airtable

**Schema is per-actor-ID**, not global. This means: when a fallback actor runs, its schema definition is used for validation and normalization — not the primary actor's schema. A fallback with different field names does not fail validation erroneously.

**Post-write sanity check:** After writing records to Airtable, count records with blank `Post Text`. If >30% are blank, flag scan as `degraded` in Scan Health. This catches heterogeneous datasets where early items passed sampling but later items were malformed.

---

### Fix 5 — Global Inflight Counter with Watchdog (addresses R5)

**Implementation file:** `dashboard/lib/scan-health.ts`

A new `Global Inflight Count` field on a shared Scan Health record (tenant ID = `_platform`).

- Incremented by 1 at scan start
- Decremented by 1 at scan end (success or fail)
- If count exceeds 24 (80% of 32-run Starter plan limit): new scan start is delayed 60 seconds and retried
- **Watchdog:** Any `Global Inflight Count > 0` with no scan activity for >10 minutes is reset to 0 (prevents crash-induced drift from blocking all future scans)

**Why not query Apify's API:** The `/v2/actor-runs?status=RUNNING` query approach was rejected because (a) it adds 200-500ms latency to every scan start, (b) the check-then-start is not atomic and creates the exact race condition it was designed to prevent, and (c) querying Apify's management API in a hot path adds a dependency that doesn't exist today.

---

## Adversarial Test Design

Tests are executed by `scripts/adversarial-test.ts` against `lib/apify-mock.ts`. No live Apify calls are made during the adversarial phase. This allows deterministic failure injection without CU cost and without rate-limiting risk.

### Failure Scenarios

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| A1 | Primary actor returns actor_error, fallback succeeds with valid output | Posts written, scan status = success, log shows fallback used |
| A2 | Primary actor returns actor_error, fallback has DIFFERENT field schema | Posts written with normalized fields via fallback fieldMap, no blank records |
| A3 | Primary actor returns actor_error, fallback ALSO returns actor_error | Scan status = failed, 0 posts written, error logged |
| A4 | Primary actor returns 0 items with NO error code (silent empty) | Triggers fallback (treated as retriable), fallback result used |
| A5 | Primary actor succeeds but returns schema-broken output (renamed fields) | Validation fails, schema_mismatch error logged, 0 records written |
| A6 | Primary succeeds, first/last items valid, middle item malformed | schema_mismatch detected (middle sample catches it), 0 records written |
| A7 | Primary succeeds, all items valid but 35% have empty text after normalization | Post-write sanity check triggers, scan flagged as degraded |
| A8 | Two scan requests fire within 200ms for same tenant | Only one proceeds; second aborts with "scan in progress" |
| A9 | Scan crashes mid-execution leaving stale lock (expiry in past) | Next scan detects stale lock, proceeds normally |
| A10 | Global Inflight Count = 26 (above soft ceiling of 24) | New scan waits 60s before starting |
| A11 | Global Inflight Count stuck at 8 for >10 minutes | Watchdog resets counter to 0 |
| A12 | AUTH error on primary actor | No fallback triggered (AUTH is non-retriable), scan fails with auth error |
| A13 | Primary timeout (TIMEOUT error), fallback succeeds | Fallback used, scan succeeds |
| A14 | All terms in keyword scan fail (multi-term parallel failure) | All term results = empty, scan reports 0 posts, no crash |
| A15 | Fallback actor timeout > fallback waitSecs | Fallback times out, scan fails cleanly with TIMEOUT error |

---

## Pre-Production Validation Checklist

Each item must be verified with evidence (log output, Airtable field value, or test script output). Nothing is checked off based on belief.

### Validation Gate 1 — Fallback Actor Chain
- [ ] A1 passes: fallback fires after primary actor_error
- [ ] A2 passes: fallback with different schema writes correctly-normalized records
- [ ] A3 passes: double failure produces clean failure, not a crash
- [ ] A4 passes: silent empty result triggers fallback
- [ ] A13 passes: primary timeout correctly escalates to fallback
- [ ] Fallback actors confirmed to be from different vendor families than primaries
- [ ] Both fallback actors manually verified to return parseable output in Apify console

### Validation Gate 2 — Schema Validator
- [ ] A5 passes: schema-broken primary output blocked before Airtable write
- [ ] A6 passes: malformed middle item caught by sampling
- [ ] A7 passes: post-write sanity check triggers on >30% blank text
- [ ] Validator correctly uses fallback actor's schema (not primary's) when fallback runs
- [ ] Normalization fieldMap confirmed working for all 4 actor IDs (2 primary, 2 fallback)

### Validation Gate 3 — Concurrency Lock
- [ ] A8 passes: simultaneous requests for same tenant, only one proceeds
- [ ] A9 passes: stale lock (expired) does not block future scans
- [ ] Lock token and expiry fields cleared correctly after scan completion
- [ ] Lock token and expiry fields cleared correctly after scan failure

### Validation Gate 4 — Inflight Counter
- [ ] A10 passes: scan throttled when inflight > 24
- [ ] A11 passes: watchdog resets stuck counter after 10 minutes
- [ ] Counter increments/decrements correctly across 5 simultaneous test tenant scans

### Validation Gate 5 — Error Categorization
- [ ] A12 passes: AUTH error is non-retriable, no fallback triggered
- [ ] A14 passes: full keyword term failure produces 0 posts, no crash
- [ ] A15 passes: fallback timeout produces clean TIMEOUT failure

### Final Sign-Off
- [ ] All 15 adversarial scenarios pass
- [ ] docs/adversarial-test-results.md populated with actual test output (not expected output)
- [ ] Memory comparison test completed and documented
- [ ] TypeScript compiles without errors on the branch (`npx tsc --noEmit`)
- [ ] No console errors in Vercel function logs on a manual scan of a test tenant
- [ ] Live integration test: one real scan on test tenant using production Apify token, confirms end-to-end flow works with actual LinkedIn data

---

## Open Risks (Not Addressed by This Branch)

These risks are real and documented. They are NOT addressed in this branch because they require architectural changes outside the scope of a pre-launch resilience hardening sprint.

**R2 partial — Async run pattern:** The synchronous `run-sync-get-dataset-items` pattern is mitigated by the concurrency lock and stagger, but not eliminated. A true async queue (start run → poll for completion → write results) is the correct long-term fix. Target: 90-day roadmap item.

**Actor ToS and LinkedIn ToS risk:** Both actors scrape LinkedIn. LinkedIn's ToS prohibits automated scraping. If LinkedIn takes legal action against Apify or specific actors, no technical resilience fix protects Scout. This is a business/legal risk, not an engineering risk. Documented; no code fix available.

**Single Apify platform dependency:** All fixes in this branch assume Apify is operational. If Apify itself has a platform outage, Scout's feed stops regardless of how many fallback actors are configured. Mitigation requires a second scraping platform (e.g., Bright Data, ScraperAPI) as a parallel path — a larger architectural addition.

---

*This document is updated at the end of each session where Apify resilience work occurs. Do not mark risks as resolved unless the corresponding validation gate has been passed and logged in `docs/adversarial-test-results.md`.*
