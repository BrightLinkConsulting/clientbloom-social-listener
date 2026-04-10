# Scout v2 — Feature Roadmap
## Ideas deferred from v1 launch | Last updated: April 2026

This document tracks intentionally deferred features — ideas that were scoped, considered, and consciously removed or deprioritized for the v1 launch. Each entry explains what was removed, why, and what a proper v2 implementation would look like.

---

## 1. Live Usage Tracking (Plan & Billing)

**Status:** Removed from v1 intentionally  
**Removed from:** `app/settings/page.tsx` — `PlanBillingSection`  
**Commit:** see April 2026 session history

### What was removed

The Plan & Billing settings tab previously included a "Usage" section with progress bars showing:

- LinkedIn keyword searches (used / limit)
- ICP profiles monitored (used / limit)
- AI comment suggestions this month (used / limit)

The bars were rendered using a `GaugeBar` component that color-coded by utilization percentage (blue → amber → red at 70%/85% thresholds).

### Why it was removed

The "used" values were hardcoded to `0` — the component had no live data source wired up. Limits were read from `getTierLimits(plan)` (accurate), but actual usage counts were never fetched from Airtable or computed server-side. The result was a section that looked functional but always showed `0 / 3`, `0 / 5`, etc., regardless of real activity. This was misleading to users and created false confidence that limits weren't being approached.

Rather than ship a broken UI, the section was removed for launch. Limits are still enforced server-side — users just don't get a self-service view of their current consumption.

### What a proper v2 implementation requires

**Data layer:**
- Airtable fields to track per-billing-cycle usage: `Keywords Used This Cycle`, `Profiles Active`, `Suggestions Used This Cycle`
- Or a lightweight serverless store (Redis / Upstash) for real-time increment counters — avoids hammering Airtable on every suggest/scan call
- A monthly reset cron (already on the open task list in CLAUDE.md) to zero `*_Used_This_Cycle` fields at billing renewal

**API:**
- `GET /api/billing/usage` → returns `{ keywords: { used, limit }, profiles: { used, limit }, suggestions: { used, limit } }`
- Called on mount in `PlanBillingSection` (similar to the existing `/api/billing/status` pattern)
- Must be auth-gated and tenant-scoped

**UI:**
- Restore `GaugeBar` component (or replace with a more polished design)
- Optimistic update: increment suggestions count locally when the suggest route returns success
- Empty/loading state while the fetch is in-flight
- Show `Unlimited` for any limit that is `Infinity` (Pro / Agency for suggestions)
- Color zones: blue (< 70%), amber (70–85%), red (> 85%), pulsing at 100%

**Accuracy considerations:**
- Keyword "searches" = number of distinct active keyword sources, not API call count (limit is enforced by source count cap in the sources route)
- ICP profiles = number of active ICP profile records in tenant's Airtable base
- AI suggestions = `Suggestions Used` field already tracked in Tenants table (see `lib/emails.ts` and suggest route) — just needs to be surfaced here and reset monthly

**Priority:** Medium — users want visibility into their limits as they approach them. High value for upsell (show them they're at 100% of Starter and serve an upgrade prompt inline).

---

## 2. [Add future v2 ideas here]

*(Document deferred features as they come up. Follow the format above: what was removed/deferred, why, and what the proper implementation looks like.)*
