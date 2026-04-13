# Degraded Scan UX — Design & Implementation Notes

**Implemented:** April 2026  
**Commit:** ee4c44c  
**Status:** Live in production

---

## Problem

Before this change, three very different scan outcomes all looked identical to users:

| Outcome | User sees |
|---------|-----------|
| Scan succeeded, no relevant posts this cycle | Inbox zero / 0 new posts |
| Scan degraded (actor output had schema gaps, >30% blank text) | Inbox zero / 0 new posts |
| Actor returned nothing (LinkedIn scraping blocked, all posts too old) | Inbox zero / 0 new posts |

Users had no way to know whether Scout was working correctly or degraded. Someone
who had been getting 15 posts/week and suddenly saw 0 couldn't distinguish between
"good week, nothing relevant" and "actor is broken."

---

## Solution

### Backend

Two new signals added to the Scan Health layer:

**`lastScanDegraded` (boolean)**
- Set to `true` when the R4 post-write sanity check fires (>30% of saved records
  have blank Post Text — indicates actor field normalization gap)
- Separate from `lastScanStatus` — a scan can be `success` (posts saved) AND
  degraded (some fields missing due to actor schema shift)
- Written by both cron path (`scan-tenant/route.ts`) and manual path (`trigger-scan/route.ts`)

**`consecutiveZeroScans` (integer)**
- Increments by 1 each time: `scanned > 0 && postsFound === 0 && !error`
- `scanned > 0` guard is critical — only counts when the actor returned posts but
  all were filtered/deduped/below threshold (user settings issue)
- Preserved (not incremented) when: `error` is set (actor failure) or `scanned === 0`
  (actor returned nothing — infrastructure issue, not user's fault)
- Resets to 0 on first scan where `postsFound > 0`

### Counter edge case handling (14 adversarial cases)

| Case | Behavior |
|------|----------|
| `degraded=true` but `postsFound > 0` | `lastScanStatus` stays `success`; `lastScanDegraded=true` is separate flag |
| Cron skip (plan quota hit) | Counter untouched — skip path does not write counter |
| `scanned=0` (actor returned nothing) | Counter preserved — not a zero-scan, it's an actor failure |
| `result.error` set | Counter preserved — actor failure, don't penalize user settings |
| `scanSource === 'none'` | Always implies `scanned=0` — excluded from counter by the `scanned>0` gate |
| Manual scan finds posts | Counter resets — trigger-scan now writes Scan Health post-scan |
| New user (no `lastScanAt`) | All degraded/streak UI gated on `lastScanAt !== null` |

### Airtable fields added

Table: `Scan Health` (`tblyHCFjjhpnJEDno`)

| Field | ID | Type | Notes |
|-------|----|------|-------|
| Consecutive Zero Scans | `fld9OfrG6hQD3Kyxo` | Number (precision 0) | Zero-streak counter |
| Last Scan Degraded | `fldqHKSQpUHbhPCy7` | Checkbox (orange flag) | R4 sanity check result |

---

## Frontend

Three UI surfaces:

### 1. ScanStatusPill (nav bar)

| State | Colour | Text |
|-------|--------|------|
| Normal success | Emerald | `Last scan: 2h ago · 3 new posts` |
| Degraded | Amber | `Last scan: 2h ago · quality warning` |
| Failed | Red | `Scan issue · retrying · 2h ago` |
| Overdue | Amber | `Scan overdue · 26h ago · auto-recovery active` |

Degraded amber only fires when `lastScanDegraded === true`. Tooltip: "Last scan had quality
issues — some posts may have incomplete data. Scout will auto-correct on the next run."

### 2. Zero-new-posts inline notice (shown when inbox HAS posts but last scan returned 0)

| Condition | Background | Copy |
|-----------|------------|------|
| Normal zero | Slate border | "Last scan found no new posts — posts below are from previous scans." |
| Degraded zero | Amber border + warning icon | "Last scan had quality issues — some posts may have incomplete data. Scout will auto-correct on the next run." |

### 3. Established-user empty state (inbox is genuinely empty)

When `consecutiveZeroScans >= 3` and `lastScanAt !== null`:
- Emoji changes from 🎉 to 🔍
- Heading: "No new posts in a few scans"
- Subtext: "Scout has run N scans without finding new relevant posts. Your ICP profiles or
  keywords may need a refresh."
- Link button: "Review ICP settings →" → `/settings?tab=linkedin`

This nudge is intentionally conservative (threshold = 3) to avoid alarming users after a
normal quiet week. Threshold chosen as: Trial/Starter (1 scan/day) → shows after 3 days;
Pro (2 scans/day) → shows after 1.5 days.

---

## Known gaps / backlog

- **B3 (performance)**: `getScanHealthForCounter` adds one Airtable read before each cron scan.
  Combined with the existing double-read in `upsertScanHealth` (B3), this is now 2 reads per
  scan instead of 1. Fix: pass the read-before health record into `upsertScanHealth` to skip
  the internal re-read. Low urgency at current scale.

- **Email notification at threshold**: Currently the zero-streak nudge is dashboard-only.
  The `consecutiveZeroScans` field is available for a future email trigger (see Proposal A
  in docs/proposals/).

- **B4 (silent keyword skip)**: When ICP profiles exist, keyword sources are silently bypassed.
  No log line. Tracked as backlog — add a `console.log` noting keyword skip when both are configured.
