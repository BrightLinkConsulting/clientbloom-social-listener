# Engagement Momentum Widget

## What It Does

The Engagement Momentum widget lives at the top of the feed section. Its job is to answer one question: **"Am I showing up consistently enough to build real relationships on LinkedIn?"**

It tracks four metrics (Surfaced, Engaged, Replied, Rate), shows a relationship score progress bar, displays a consistency streak, and renders a per-day activity chart for the selected time window. Every piece of data is derived from the user's own action history — nothing is estimated or inferred.

---

## Architecture

### Data Model

Engagement data is stored as a **cumulative snapshot** in the `Business Profile` Airtable table under a field called `Momentum History`. This is a JSON array of `DaySnapshot` objects:

```typescript
interface DaySnapshot {
  date:     string  // YYYY-MM-DD in America/Los_Angeles timezone
  surfaced: number  // cumulative posts ever surfaced (excludes archived)
  engaged:  number  // cumulative posts with Action='Engaged'
  replied:  number  // cumulative posts with Engagement Status='replied'
  crm:      number  // cumulative posts with Action='CRM'
}
```

The array is trimmed to a maximum of 30 entries. Older entries are dropped when new ones are added.

### Why Cumulative Instead of Per-Day?

Storing cumulative totals allows the snapshot to be written at any point during the day and remain correct. If a snapshot were written on a per-action basis, a missed write would lose that day's count. With cumulative totals, any snapshot written during the day captures everything up to that moment. The chart derives **daily deltas** by subtracting consecutive snapshots.

### Files

| File | Role |
|------|------|
| `dashboard/app/page.tsx` | `MomentumWidget`, `MomentumSparkline`, `calcEngagementActivity` components |
| `dashboard/app/api/engagement-history/route.ts` | GET/POST endpoint for reading and writing daily snapshots |
| `dashboard/app/api/posts/route.ts` | Builds `actionCounts` used as the widget's live data source |

---

## How It Works — Step by Step

### 1. Page Load

When `FeedPage` mounts, two things happen concurrently:

- `fetchPosts()` is called, which hits `/api/posts` and returns `actionCounts` — a full paginated count of every post by status (`New`, `Engaged`, `Replied`, `Skipped`, `CRM`, `Archived`).
- A `GET /api/engagement-history` request loads the `Momentum History` JSON array from Airtable. This populates `momentumHistory` state, which drives the sparkline chart.

### 2. Live Data vs Historical Data

The widget uses **two separate data sources**:

- **Live stats row** (Surfaced, Engaged, Replied, Rate): derived directly from `actionCounts`, which is the real-time database count. Updated every 5 minutes via silent refresh, and immediately after every user action via optimistic UI updates.
- **Sparkline chart**: derived from the `momentumHistory` array — a 30-day rolling history of cumulative snapshots. This shows trends over time.

### 3. Snapshot Sync (Debounced)

Whenever `actionCounts` changes, a **debounced sync** (5-second delay) writes today's snapshot to `/api/engagement-history`. The delay prevents flooding the API when a user rapidly engages with multiple posts. Key behaviors:

- **On first load**: snapshot is written 5 seconds after data arrives.
- **After each engagement**: if the user's engaged/replied/crm counts change, a new sync fires 5 seconds after the last action.
- **On API failure**: the last-synced ref is NOT updated, so the next change will retry automatically.
- **On unmount**: the pending debounce timer is cancelled cleanly.

This fixes a previous bug where the snapshot was only written once per page session, causing a "one-day attribution lag" where today's activity appeared on the next day's bar.

### 4. Metric Calculations

```
totalSurfaced = New + Engaged + Replied + Skipped + CRM
               (Archived is explicitly EXCLUDED — those posts are dismissed)

totalActed    = Engaged + Replied + CRM

Rate          = round(totalActed / totalSurfaced * 100)%

RelationshipScore = min(100, round(((Engaged + Replied×2) / totalSurfaced) × 150))
                    (Replied counts double — conversation started)
```

### 5. Momentum Tier

The tier label (top-right of widget) is determined by the Relationship Score:

| Score Range | Label | Color |
|-------------|-------|-------|
| 0–9 | Ready to engage | Gray |
| 10–34 | Getting started | Amber |
| 35–69 | Building momentum | Blue |
| 70–100 | Strong momentum | Emerald |

### 6. Consistency Streak

`calcEngagementActivity(history)` computes:

- **`streakDays`**: number of consecutive calendar days (ending today, LA timezone) where the daily delta for engaged + replied + crm was > 0.
- **`activeLast7`**: distinct active days in the last 7 calendar days.

The streak indicator shows amber dots (max 7, with "+N" overflow) when `streakDays > 0`, or "Active X of last 7 days" when there is recent but non-consecutive activity. The row is hidden when there is no history or no activity.

### 7. Sparkline Chart

`MomentumSparkline` renders a bar chart for the selected period (7D / 14D / 30D):

- Each bar represents one calendar day. Height is proportional to that day's engagement delta, normalized against the period's peak day.
- **Bar color**: peak bar = green/teal gradient; high activity (≥60% of peak) = blue/green; moderate (≥20%) = blue/indigo; empty bars = dark slate at 35% opacity; today's bar = violet/indigo gradient; hovered bar = white gradient.
- **Active days counter** (top-right of chart): shows "X/Y active" in color — emerald if ≥60% of days were active, medium gray if 30–59%, dark gray if below 30%.
- **Trend %**: compares current period total to previous period of same length. Hidden when there's no prior-period data.
- **Tooltip**: appears on bar hover, shows date + breakdown of engaged/replied/crm actions. Tooltip position is clamped to [8%, 92%] of container width to prevent edge clipping.

---

## User Action Data Flow

This section describes how each user action affects the widget.

### Engage with a post

- `Action` → `'Engaged'`, `Engagement Status` → `''`
- `actionCounts.New -= 1`, `actionCounts.Engaged += 1`
- `totalSurfaced` unchanged, `totalActed += 1`, Rate improves
- Debounced snapshot sync fires after 5s

### Mark as "They Replied"

- `Action` stays `'Engaged'`, `Engagement Status` → `'replied'`
- `actionCounts.Engaged -= 1`, `actionCounts.Replied += 1`
- `totalActed` unchanged (Replied replaces Engaged in the count)
- Rate unchanged — but RelationshipScore improves (Replied counts 2×)

### Push to CRM

- `Action` → `'CRM'`, `Engagement Status` → `''`
- `actionCounts.Engaged -= 1`, `actionCounts.CRM += 1`
- `totalSurfaced` and `totalActed` both unchanged
- Rate unchanged

### Skip a post

- `Action` → `'Skipped'`
- `actionCounts.New -= 1`, `actionCounts.Skipped += 1`
- `totalSurfaced` unchanged, `totalActed` unchanged, Rate unchanged

### Restore from Skipped

- `Action` → `'New'`
- `actionCounts.Skipped -= 1`, `actionCounts.New += 1`
- Net effect: zero — `totalSurfaced` and Rate return to pre-skip state

### Archive a post

- `Engagement Status` → `'archived'`
- `actionCounts[previousStatus] -= 1`, `actionCounts.Archived += 1`
- **`totalSurfaced` decreases by 1** (archived posts excluded from denominator)
- If archiving an Engaged post, `totalActed` also decreases

### Scan completes (new posts added)

- `fetchPosts` runs on the 5-minute silent refresh timer
- `actionCounts.New` increases by the number of new posts
- `totalSurfaced` increases
- Rate decreases temporarily (more posts in denominator, same acted count)
- Debounced sync fires to update today's snapshot

---

## Security Model

### Server-Side Validation (`/api/engagement-history` POST)

All inputs are sanitized before writing:

```typescript
const safeInt = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0
}
```

- **Infinity / NaN / non-finite**: clamped to 0
- **Negative numbers**: clamped to 0
- **Floats**: rounded to integer
- **Non-numeric strings, null, undefined**: default to 0
- **Impossible state** (`engaged + replied + crm > surfaced`): rejected with 400

### Tenant Isolation

The history is stored in the `Business Profile` table, which is scoped by `tenantId`. All Airtable reads/writes use `tenantFilter(tenantId)` so one tenant cannot read or write another tenant's history.

---

## Known Limitations

| Limitation | Impact | Notes |
|-----------|--------|-------|
| First-ever snapshot uses cumulative total as "day 1 delta" | First bar in chart may look artificially high | Expected behavior — no pre-history data available |
| Streak resets at midnight LA time | A user active at 11:59 PM and 12:01 AM could see a streak break | By design — calendar day boundaries |
| Replied tracking requires explicit action in Scout UI | LinkedIn replies not auto-detected | User must click "They Replied" in the post card |
| Archive from Engaged decrements both totalSurfaced and totalActed | Rate could worsen after archiving an engaged post | Product tradeoff — archived posts fully excluded |

---

## Round 1 + Round 2 Test Results (Session 6)

### Round 1 — Data Flow Adversarial Tests (40/40 passed)
- Rate denominator correctly excludes Archived posts
- All action transitions (skip, restore, engage, reply, CRM, archive) produce correct count changes
- Streak calculation handles consecutive days, gaps, negative deltas, single snapshots, empty history
- Server validation blocks Infinity, NaN, negative numbers, and impossible states (acted > surfaced)
- Debounced sync correctly detects meaningful changes and skips no-op syncs

### Round 2 — UX/UI Design Tests (43/43 passed)
- Streak pluralization correct (singular/plural)
- Tooltip clamped to [8%, 92%] across all three period modes (7D/14D/30D) — no edge clipping
- Tier thresholds correct at all boundary scores
- Rate color transition at 20% threshold confirmed
- Active days color thresholds confirmed for 7D, 14D, 30D windows
- Streak indicator visibility conditions correct
- Streak dot overflow display correct (max 7 dots + "+N")
- RelationshipScore capped at 100, progress bar minimum 2% width confirmed

---

## Session Changelog

### Session 6 (2026-04-10)

#### Bugs Fixed
- **BUG-1 (Critical)**: History snapshot only synced once per session → engagements during the session appeared on the NEXT day's bar (one-day lag). Fixed by replacing `historySyncedRef` (boolean) with a debounced re-sync that fires whenever `actionCounts` changes meaningfully.
- **BUG-2**: `lastSyncedCountsRef` was updated before the API write completed → a failed write silently marked data as synced. Fixed by moving the ref update to inside `.then()` callback.
- **BUG-3**: No cleanup for debounce timer on component unmount → timer could fire after unmount. Fixed by returning a cleanup function from the `useEffect`.
- **BUG-4 (Security)**: `Infinity` passed through server-side validation unchanged. Fixed with `safeInt()` helper using `Number.isFinite()`.
- **UX-BUG-1**: Streak pluralization broken — `{streakDays !== 1 ? '' : ''}` both branches returned empty string. Fixed to `{streakDays !== 1 ? 's' : ''}`.
- **UX-BUG-2**: Tooltip clipped at left/right chart edges. Fixed by clamping tooltip X position to [8%, 92%].

#### Features Added
- **Consistency streak indicator**: amber dots + "N days straight" label below the progress bar. Shows "Active N of last 7 days" when there is recent but non-consecutive activity.
- **Active-days counter in sparkline header**: "X/Y active" with color-coded thresholds (emerald ≥60%, medium 30–59%, gray <30%).
- **Last-refresh timestamp**: "· as of H:MM AM" displayed next to the widget title, showing when the post data was last fetched.
- **`calcEngagementActivity()` helper**: standalone function that derives streak + activity data from cumulative snapshot history.
- **Input validation in `/api/engagement-history` POST**: `safeInt()` function guards all four numeric inputs against Infinity, NaN, negatives, and floats.

#### UX Improvements
- Moved "as of" timestamp to left side of header (next to title) so the tier label stands alone on the right.
- Redesigned sparkline header: active days shown first (primary), trend % shown as secondary with separator dot. Removed verbose "vs prev" suffix in favor of up/down arrow glyphs.
- Changed "consistency builds credibility" copy to "consistency = credibility" for visual compactness.
- Separator dot in streak row upgraded from nearly invisible `text-slate-700` to `text-slate-600`.

#### Files Changed
- `dashboard/app/page.tsx`
- `dashboard/app/api/engagement-history/route.ts`
