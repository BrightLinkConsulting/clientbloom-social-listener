---
name: Scout — UI component reference and design patterns
description: Key components, design decisions, and data flows — current as of HEAD 29b9bef (April 14 2026)
type: project
---

## Design System

Dark theme throughout. Background: `#0a0c10` / `#080a0f`. Cards: `#12151e`. Borders: `slate-700/50` to `slate-800/60`. Accent brand blue: `#4F6BFF`. Action buttons: `blue-600`.

Full design system reference (typography, color, spacing, callout patterns): `docs/ux-design-system.md` in the repo.

---

## ClientBloom Logo — NEVER Replace With "CB" Text Square

```tsx
function ClientBloomMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="21" rx="24" ry="13" fill="#F7B731" />
      <ellipse cx="20" cy="52" rx="13" ry="25" fill="#E91E8C" />
      <ellipse cx="80" cy="52" rx="13" ry="25" fill="#00B96B" />
      <ellipse cx="50" cy="79" rx="24" ry="13" fill="#7C3AED" />
      <circle cx="50" cy="50" r="13" fill="#7C3AED" />
    </svg>
  )
}
```

Defined locally in both `page.tsx` and `settings/page.tsx` — it is NOT a shared import. If it shows as "CB" text square in the nav, it was overwritten.

---

## Feed Navigation

Nav bar: "Scout by ClientBloom" · ClientBloom bloom mark SVG · "Last scan: Xh ago" · Feed / Settings links

Feed-only users (team members): Settings link hidden. Direct nav to `/settings` redirects to `/`.

---

## Feed Tabs (ActionFilter)

Types: `'New' | 'Engaged' | 'Replied' | 'Skipped' | 'CRM' | 'all'`
Labels: Inbox, Engaged, Replied, Skipped, In CRM, All

Default sort: **date-desc** (newest first) — changed from score-desc in commit 29b9bef.

---

## Trial Countdown Banners (page.tsx)

Added post-bd63e93. These must be preserved in any `page.tsx` edit.

- **Days 1-4:** indigo banner — "X days left in your trial"
- **Day 5:** amber banner with upgrade link
- **Days 6-7:** pulsing amber banner with upgrade link
- **Day 8+ (expired):** full upgrade wall — blurs the entire feed, blocks all action buttons, shows upgrade CTA

Trial status comes from the session JWT (`session.user.plan === 'Trial'` + `session.user.trialEndsAt`).

---

## AI Agent Buttons (page.tsx + settings/page.tsx)

Added post-bd63e93. Two entry points:
- **Inbox agent** — accessible from the feed (inbox context: current posts, engagement state, user profile)
- **Settings agent** — accessible from settings page (helps users configure LinkedIn sources, scoring prompt, Slack)

Both use the Agent Behavior Framework. Agents never quote pricing; they direct pricing questions to `info@clientbloom.ai`.

---

## PostCard Engagement States

```
isEngaged     = action === 'Engaged' && engStatus === ''
isReplied     = action === 'Engaged' && engStatus === 'replied'
isActiveEngage = isEngaged || isReplied
```

**Engaged state engagement zone:**
- Single editable notes textarea
- Attribution on save: "Saved Apr 4, 2:14 PM · mike" (displayName strips domain from email)
- Compact CRM push in action row (if CRM connected)

**Replied state engagement zone:**
- "Activity log" heading
- Legacy Notes shown as first entry if Reply Log is empty
- Append-only log cards (read-only, each showing text + "Apr 4 · mike")
- New entry textarea + "Add note" button
- CRM push section below log with description + no-CRM fallback

---

## Reply Log Data Format

Stored as JSON string in Airtable. Each entry:
```json
{ "text": "...", "by": "mike@clientbloom.ai", "at": "2026-04-04T20:00:00.000Z" }
```

`displayName(email)` — strips domain, returns just username portion.
`parseReplyLog(raw)` — JSON.parse with try/catch fallback to `[]`.

---

## NextScanCountdown (feed footer)

`getNextScanMs()` — ms until next scan (6 AM and 6 PM PDT = 13:00 and 01:00 UTC).
`formatCountdown(ms)` — "7h 25m" or "25m 10s" or "10s".
`NextScanCountdown` — ticks every 1 second. Rendered in feed footer bar.

---

## MomentumWidget + MomentumSparkline (page.tsx)

`MomentumWidget` renders the engagement momentum panel above the feed.

**Props:** `{ actionCounts: Record<string, number>; history: DaySnapshot[] }`

Relationship Score formula: `Math.min(100, Math.round(((engaged + replied*2) / Math.max(1, surfaced)) * 150))`

**Four momentum tiers:** 70-100 emerald, 35-69 blue, 10-34 amber, 0-9 slate.

`DaySnapshot` interface:
```typescript
interface DaySnapshot {
  date:     string   // YYYY-MM-DD LA timezone (en-CA locale)
  surfaced: number
  engaged:  number
  replied:  number
  crm:      number
}
```

`MomentumSparkline` renders a 14-bar SVG chart of daily engagement deltas.

**Key constants:** DAYS=14, BAR_W=10, BAR_GAP=3, H=44

**Delta computation:**
- `idx === 0`: absolute `engaged + replied*2` (first snapshot, no previous day)
- `idx > 0`: `max(0, (cur.engaged - prev.engaged) + (cur.replied - prev.replied)*2 + (cur.crm - prev.crm))`

**SVG visual tiers:**
- `pct >= 0.6`: high — emerald gradient + glow-bar-strong filter
- `pct >= 0.2`: mid — blue gradient + glow-bar filter
- today: purple gradient
- default: slate-600, no glow

Renders when `history.length >= 1`. Data from `/api/engagement-history`. Snapshot synced once per session via `historySyncedRef`.

---

## Settings Page

**Tabs (current):** Profile, LinkedIn, AI & Scoring, System, Account, Team

Facebook tab removed. Nav header: "Scout by ClientBloom".

**SIGNAL_OPTIONS (conversation entry points):**
`asking_for_help, industry_discussion, growing_team, shopping_alternatives, milestone, thought_leadership`

**TERM_SUGGESTIONS (4 categories):** Questions & community input / Debates & hot takes / Tool & vendor decisions / Growth & milestones

**ICP_JOB_TITLES:** 20 broad-market titles (Founder, CEO, VP Sales, VP Marketing, COO, Consultant, etc.)

**System tab:** Scanner, LinkedIn, Daily Digest status cards. Slack Integration section below grid (not a status card).

**Account tab:** Email, Company, Plan (reads from session). Password change form → POST `/api/change-password`.

**Team tab (Agency plan only):** Up to 5 members. Invite → POST `/api/team/invite`. List → GET `/api/team/members`. Remove → DELETE `/api/team/remove`. Does NOT write `Invited By` to Airtable (field does not exist).

---

## FeedPage Session Wiring

```tsx
const { data: session } = useSession()
const userEmail = (session?.user as any)?.email || ''
// ...
<PostCard userEmail={userEmail} ... />
```

`userEmail` flows FeedPage → PostCard → note attribution and `handleAddReplyEntry`.

Plan and trial state also read from session: `session.user.plan`, `session.user.trialEndsAt`.
