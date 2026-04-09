# Scan Health, Watchdog, and Trial UX

## Last updated: April 2026

---

## 1. Scan Health State Machine

The **Scan Health** Airtable table (`Scan Health`) tracks the live status of each
tenant's scan pipeline. One row per tenant, keyed by `Tenant ID`.

### Fields used

| Field | Type | Written by | Purpose |
|-------|------|-----------|---------|
| `Tenant ID` | Text | orchestrator | Identifies the tenant row |
| `Last Scan At` | DateTime | `scan-tenant` (success) | Timestamp the last scan completed |
| `Last Scan Status` | Single-select | orchestrator + `scan-tenant` | Current state (see below) |
| `Last Error` | Text | `scan-tenant` (fail) | Human-readable error for debugging |

### Status values

| Value | Set by | Meaning |
|-------|--------|---------|
| `scanning` | `cron/scan/route.ts` (orchestrator) | Scan dispatched; worker running |
| `success` | `scan-tenant` route + watchdog reset | Last scan completed normally |
| `failed` | `scan-tenant` route | Scan completed with unrecoverable error |
| `pending_fb` | (legacy) | Facebook scan leg running — **no longer occurs** (FB removed April 2026) |

### State transition diagram

```
[orchestrator fires]
        │
        ▼
  status = 'scanning'
        │
        ├─── scan-tenant skips (< 12h since last scan, trial/starter daily limit)
        │         └─── status reset to 'success' (scan-tenant, commit cb7c4c0)
        │
        ├─── scan-tenant completes normally
        │         └─── status = 'success', lastScanAt = now
        │
        ├─── scan-tenant throws, upsertScanHealth fails silently (graceful degradation)
        │         └─── status stays at 'scanning' ← STUCK STATE
        │                   │
        │                   ├── client detects after 10 min (STUCK_SCANNING_MS)
        │                   │      → shows "Last scan: Xh ago" instead of spinner
        │                   │
        │                   └── watchdog detects after 1h (STUCK_SCANNING_THRESHOLD_H)
        │                          → patches status to 'failed' via direct Airtable PATCH
        │
        └─── scan-tenant throws, upsertScanHealth writes 'failed'
                  └─── status = 'failed', lastScanAt = previous value
```

---

## 2. Stuck-Scanning Bug (Root Cause and Fix)

### What causes it

`lib/scan-health.ts` — `upsertScanHealth()` silently swallows all exceptions:

```typescript
// Inside upsertScanHealth:
} catch (e) {
  // Graceful degradation — never crash the caller over a status write
  console.error('[scan-health] Failed to upsert:', e)
}
```

If Airtable returns a 429 (rate-limit exhausted after all retries), the status write
fails and `status` stays permanently at `'scanning'`. The scan itself completed and
the posts are in Airtable — only the status field is wrong.

### Why the watchdog didn't fix it (prior to April 2026)

`cron/scan-watchdog/route.ts` had an explicit skip for scanning tenants:

```typescript
// OLD — BUG:
if (t.status === 'scanning') return false  // Skips stuck tenants forever
```

This was written to avoid re-triggering active scans but had the side effect of
making stuck states permanent — the watchdog would never reset them.

### Fix: watchdog now detects and resets stuck states

**Threshold:** `STUCK_SCANNING_THRESHOLD_H = 1` hour.

Since `scan-tenant` has `maxDuration = 300s` (5 minutes), any scan still showing
`'scanning'` after 1 hour is definitively stuck. The watchdog now:

1. Identifies stuck tenants: `status === 'scanning'` AND (`lastScanAt` is null OR
   `lastScanAt` is more than 1 hour old)
2. Resets each one to `'failed'` via a direct Airtable PATCH (not via
   `upsertScanHealth`, which goes through the shared rate-limit path)
3. Re-runs the stale tenant check — if `lastScanAt` is also old enough, the
   orchestrator is triggered to schedule a new scan

### Also fixed: skipped scans left status at 'scanning'

Before `commit cb7c4c0`, when `scan-tenant` skipped a scan (trial/starter cooldown:
< 12h since last scan), it returned early without resetting the `'scanning'` status
the orchestrator had set. Fix: add `upsertScanHealth(tenantId, { lastScanStatus: 'success' })`
before the early return.

---

## 3. Client-Side Stall Detection (ScanStatusPill + NextScanCountdown)

Because the watchdog only fires hourly, the UI has its own independent defense.

**Constant:** `STUCK_SCANNING_MS = 10 * 60 * 1000` (10 minutes)

`ScanStatusPill` logic when `status === 'scanning'`:

```typescript
const isStuck = scanAt
  ? (Date.now() - new Date(scanAt).getTime()) > STUCK_SCANNING_MS
  : false

if (isStuck) {
  // Fall through to normal success rendering: "Last scan: Xh ago"
  // Do NOT show amber "stalled" — the scan completed, only the write failed
} else {
  return <span>Scanning…</span>
}
```

**Key decision:** When stuck, render the **success state** (green "Last scan: Xh ago"),
not an error or warning. Rationale: the scan did complete and the data is current.
The only broken thing is a backend status field that the watchdog will fix within the
hour. Surfacing this as an alarm to the user creates confusion without providing any
actionable information.

`NextScanCountdown` applies the same guard — it falls through to the normal countdown
when stuck so the user sees when to expect the next real scan, rather than
"Scan running · new posts appear automatically" indefinitely.

---

## 4. Plan-Aware Scan Status UX

### Scan cadence by plan

| Plan | Scans/day | Cron fires | Cooldown check |
|------|-----------|-----------|----------------|
| Trial | 1 | 6 AM + 6 PM PDT | Skipped if < 12h since last |
| Starter | 1 | 6 AM + 6 PM PDT | Skipped if < 12h since last |
| Pro | 2 | 6 AM + 6 PM PDT | No skip |

The cron fires twice daily for all plans. Single-scan plans (Trial/Starter) skip the
second invocation via the 12h cooldown check in `scan-tenant`.

### Overdue threshold (plan-aware)

`ScanStatusPill` shows an amber "Scan overdue" warning when the last scan is older
than the plan's expected interval plus a grace period.

```typescript
function scanOverdueMs(plan: string): number {
  const isSingleScanPlan = plan === 'Trial' || plan === 'Starter'
  return isSingleScanPlan
    ? 26 * 60 * 60 * 1000  // 24h interval + 2h grace
    : 14 * 60 * 60 * 1000  // 12h interval + 2h grace
}
```

**Why this matters:** Before this change, a Trial user whose 6 AM scan completed
successfully would see "Scan overdue" at 8 PM the same day (14h later). This was a
false alarm — 12h is the correct interval for single-scan plans.

### Countdown cadence note

`NextScanCountdown` adds a plan context note for Trial and Starter users:

```
Next scan: today at 6:00 PM · 11h 5m · Trial plan · 1 scan/day
```

This directly answers "why is the next scan so far away?" without the user needing
to know what plan they're on or read any documentation.

### `ScanStatusPill` props

```typescript
function ScanStatusPill({
  health,
  lastScannedAt,
  plan = '',
}: {
  health: ScanHealth | null
  lastScannedAt: string | null
  plan?: string   // ← required for correct overdue threshold; defaults to '' (Pro behavior)
})
```

Always pass `plan` from the session when rendering this component. The `Nav` component
reads it from `(session?.user as any)?.plan`.

### Post count in ScanStatusPill (April 2026)

The success state now shows `lastPostsFound` from the `ScanHealth` record:

```
Last scan: 1h ago · 3 new posts
Last scan: 2h ago · 0 new posts
Last scan: 4h ago               ← (no label when health?.lastPostsFound is null)
```

This directly answers "did anything get found?" without requiring users to check the feed.
The `null` guard prevents the label from appearing if the field hasn't been written yet
(e.g. older scan records pre-dating this field).

### `NextScanCountdown` props

```typescript
interface NextScanCountdownProps {
  scanStatus?: string | null
  lastScanAt?: string | null   // for stuck detection
  plan?: string                // for cadence note
}
```

---

## 5. Trial Banner

`app/components/TrialBanner.tsx` and the matching inline banner in `app/page.tsx`
(inside `Nav`) show countdown for active Trial users.

### Countdown format

| Time remaining | Display |
|----------------|---------|
| ≥ 1 day | `6d 14h left` |
| < 1 day | `14h left` |
| Expired | Banner hidden |

**Implementation detail:** Uses `Math.floor` throughout — never `Math.ceil`. `Math.ceil`
was the prior bug: on the second day of a trial (6.91 days remaining), it showed
"7 days left".

```typescript
const daysLeft  = Math.floor(msLeft / 86_400_000)
const hoursLeft = Math.floor((msLeft % 86_400_000) / 3_600_000)
```

The banner renders as long as the trial timestamp has not passed (`expired === false`).
On the last day (`daysLeft === 0`, `expired === false`) it shows `"Xh left"` rather
than hiding.

---

## 6. Watchdog Constants Reference

| Constant | File | Value | Purpose |
|---------|------|-------|---------|
| `STALE_THRESHOLD_H` | `cron/scan-watchdog/route.ts` | `14` | Hours since last scan before we consider it missed |
| `STUCK_SCANNING_THRESHOLD_H` | `cron/scan-watchdog/route.ts` | `1` | Hours a scan can appear 'scanning' before the watchdog resets it |
| `STUCK_SCANNING_MS` | `app/page.tsx` | `10 * 60 * 1000` | Client-side stall detection threshold (10 min) |
| `scanOverdueMs(plan)` | `app/page.tsx` | 26h (single-scan) / 14h (Pro) | When to show amber "overdue" pill in UI |

---

## 7. Watchdog Response Shape

`GET /api/cron/scan-watchdog` now returns:

```json
{
  "ok": true,
  "stuck": 1,
  "stale": 0,
  "triggered": false,
  "stuckTenants": [
    { "tenantId": "tenant_abc", "lastScanAt": "2026-04-09T06:00:00.000Z" }
  ]
}
```

| Field | Description |
|-------|-------------|
| `stuck` | Number of tenants reset from 'scanning' to 'failed' |
| `stale` | Number of tenants with lastScanAt > 14h (triggered orchestrator recovery) |
| `triggered` | Whether the scan orchestrator was re-fired |
| `stuckTenants` | List of tenants that were stuck-scanned and reset |
| `staleTenants` | List of tenants that triggered orchestrator re-fire (if any) |

---

## 8. Known Remaining Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| `scan-health.ts` still uses bare `fetch` (not `airtableFetch`) | Medium | If Airtable is rate-limited during status write, the write fails silently and watchdog cleans up within 1h |
| Watchdog fires hourly — stuck status visible for up to 60 min | Low | Client-side stuck detection (10 min) prevents perpetual spinner |
| No "scan started at" timestamp — watchdog uses lastScanAt as proxy | Low | Conservative: any scan still 'scanning' after 1h is definitively done |
| `upsertScanHealth` still swallows exceptions | By design | Graceful degradation: scan pipeline must not fail because of a status write |

---

## 9. Root Cause: Zero New Posts (April 2026)

### Symptom

`Last Scan At` updated correctly (scan was running), but the feed showed no new posts for
4+ days despite confirmed hourly/twice-daily scans.

### Root cause

`lib/scan.ts` keyword search used `sort_type: 'relevance'` in the Apify
`apimaestro/linkedin-posts-search-scraper-no-cookies` actor:

```typescript
// BEFORE (bug):
{ searchQuery: term, limit: 25, sort_type: 'relevance' }
```

LinkedIn's relevance algorithm surfaces the same high-engagement posts on every query —
older viral content that keeps accumulating reactions. After the first scan captures these
posts, every subsequent scan fetches identical URLs that are already in the 30-day dedup
window and are silently dropped by `getExistingPostUrls()`.

### Fix (commit 058bb87, April 2026)

```typescript
// AFTER (fix):
{ searchQuery: term, limit: 50, sort_type: 'recent' }
// retry opts:
{ searchQuery: term, limit: 25, sort_type: 'recent' }
```

`sort_type: 'recent'` returns posts sorted by publish time, so each scan surfaces
genuinely new content. The limit was also increased (25→50 primary, 15→25 retry) to
compensate for the age filter (`filterPostsByAge(posts, 7)`) dropping older results.

### Never revert this

Do not change `sort_type` back to `'relevance'` for any reason. Relevance sort is
unsuitable for a feed that runs on a cadence — it is only appropriate for one-time
"find the best posts" queries.
