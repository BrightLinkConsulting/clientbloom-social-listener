# Proposal A — No-Posts-Found User Reengagement System

**Status:** Proposal — pending review  
**Scope:** Email + dashboard guidance when consecutive zero scans trigger  
**Prerequisite:** Degraded scan UX (ee4c44c) — `consecutiveZeroScans` field already live

---

## The Problem

A user signs up, configures their profile, and gets posts the first week. Then LinkedIn
changes how it surfaces keyword results. Or their ICP profiles just aren't posting much
right now. Or their search terms are too broad and scoring drops everything below threshold.

From the user's view: Scout just stopped working. They don't know why. They quietly churn.

The `consecutiveZeroScans` counter now exists in Scan Health. The dashboard nudge
(🔍 + "Review ICP settings" link) fires at 3+ consecutive zeros. That covers in-app.
This proposal covers the proactive email layer and deeper in-app guidance.

---

## Recommended Architecture

### Layer 1 — Dashboard nudge (already live)

`consecutiveZeroScans >= 3` → 🔍 empty state with "Review ICP settings →" link.
No change needed. Already deployed in ee4c44c.

### Layer 2 — In-app settings diagnostic (new)

When a user lands on `/settings?tab=linkedin` after the zero-streak nudge, show a
contextual callout that explains the most common reasons for zero posts and what to do.

**Implementation:** A conditional banner in the LinkedIn settings tab that reads from
`scanHealth.consecutiveZeroScans` passed via the settings page data load.

Copy:
> **Scout hasn't found new posts recently.** The most common reasons:
> - Your ICP profiles haven't posted in the last 7 days (check their LinkedIn directly)
> - Your keyword terms are too broad or too narrow for recent LinkedIn activity
> - All recent posts were already captured in previous scans (this is actually good)
>
> Try adding 2–3 new ICP profiles or refreshing your keyword terms.

This is a UI-only change — no new API needed. Read from existing `scan-status` endpoint.

### Layer 3 — Reengagement email (new)

Fire one email when `consecutiveZeroScans` crosses a threshold. One email, not a sequence.
Keeps it from feeling like harassment.

**Recommended trigger:** `consecutiveZeroScans === 5`
- Trial users (1 scan/day): fires after 5 days of zeros
- Pro users (2 scans/day): fires after 2.5 days of zeros

**Cooldown:** Store `Zero Streak Email Sent At` on the tenant record. Don't resend if
already sent in the last 14 days, even if the streak grows further.

**Email content:**

Subject: `Scout hasn't found new posts for you recently`

> Hey [first name or "there"],
>
> Scout has been scanning but hasn't found relevant new LinkedIn posts for you in the
> last few days. This usually means one of a few things:
>
> 1. **Your ICP profiles are quiet** — check if they've been posting on LinkedIn recently
> 2. **Your keywords need a refresh** — LinkedIn trends shift; terms that worked a month
>    ago may return fewer results now
> 3. **You're fully caught up** — all recent content was already captured in previous scans
>
> The fastest fix is usually adding 2–3 new ICP profiles of people your ideal clients
> follow or engage with.
>
> [Review my ICP settings →] [button]
>
> Scout scans [1×/day / 2×/day] automatically. Your next scan runs [next scan time].

---

## Implementation Plan

### Phase 1 — In-app diagnostic (1–2 hours)

Files to change:
- `dashboard/app/settings/page.tsx` — add zero-streak callout to LinkedIn tab
- `dashboard/app/api/scan-status/route.ts` — already returns `consecutiveZeroScans` ✓
- No new API needed

### Phase 2 — Email trigger (2–3 hours)

New Airtable field on Tenants table:
- `Zero Streak Email Sent At` (dateTime) — timestamp of last reengagement email

New API route: `POST /api/cron/zero-streak-check`
- Called by Vercel Cron (add to `vercel.json`)
- Reads all tenants where `consecutiveZeroScans >= 5` AND (`Zero Streak Email Sent At` is null
  OR more than 14 days ago)
- Sends email via Resend using new template `buildZeroStreakEmail()` in `lib/emails.ts`
- Updates `Zero Streak Email Sent At` to prevent duplicate sends

New email template in `lib/emails.ts`:
- `buildZeroStreakEmail(email, consecutiveZeroScans, plan)` — returns Resend payload
- Use same `logoHeader()` + `BRAND_PURPLE` CTA pattern as other trial emails

### Phase 3 — Settings intelligence (1 hour)

Consider: when `consecutiveZeroScans >= 5`, also surface a `service flag` on the tenant
record (using the existing Service Flags JSON array on Tenants table). This surfaces the
issue in the admin panel alongside the user-facing email, so your team can proactively
reach out.

---

## Metrics to watch post-launch

- Email open rate (expected: high — these are engaged users wondering why Scout is quiet)
- CTR to settings page from email
- `consecutiveZeroScans` reset rate after email send (did the email prompt action?)
- Churn rate correlated with max consecutive zero count (helps tune the threshold)

---

## What this does NOT solve

- Users who configured bad settings from day 1 and never got any posts (first-scan zero)
  → handled by the onboarding "while you wait" state, not this system
- Actor-level failures (LinkedIn blocking) → those are `scanned=0` and excluded from the
  counter by design; they surface via the `failed` scan status instead
- Users on poor-signal industries with few LinkedIn posts → same symptoms, different
  cause; the email copy ("you may be fully caught up") is intentionally non-alarming

---

## Recommendation

Build Phase 1 (settings diagnostic) before launch — it's 1–2 hours and directly
benefits the first cohort. Phase 2 (email) can ship in week 2 — it's meaningful
only once you have tenants who have run 5+ scans, which takes 5+ days on Trial.
