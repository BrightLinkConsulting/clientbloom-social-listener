# Zero-Streak Reengagement System

**Status:** Live in production  
**Merged:** April 2026  
**Feature:** Proposal A — No-Posts-Found User Reengagement

---

## Problem

A user configures Scout, gets results for the first few scans, then LinkedIn changes keyword result delivery or their ICP contacts go quiet. From the user's perspective: Scout stopped working. Without feedback, they churn.

The `consecutiveZeroScans` counter (added in ee4c44c) already tracks this — but was only visible in the dashboard empty state. This system adds proactive in-app guidance and a single reengagement email.

---

## Architecture: Three Layers

### Layer 1 — Dashboard nudge (ee4c44c, already live)

`consecutiveZeroScans >= 3` → 🔍 empty state + "Review ICP settings →" link.

### Layer 2 — Settings diagnostic banner (this feature, Phase 1)

**Component:** `ZeroStreakBanner` in `dashboard/app/settings/page.tsx`

Renders inside the LinkedIn tab when:
- `consecutiveZeroScans >= 3`
- `lastScanAt !== null` (user has run at least one scan — not a new account)

The component fetches from `/api/scan-status` internally (no props needed). Fail-open — if the fetch fails, the banner doesn't render. Amber color scheme to signal "attention needed, not broken."

**Copy:**
- Heading: "Scout hasn't found new posts in N recent scans"
- Three bulleted reasons: ICP profiles quiet / keyword refresh needed / fully caught up
- Actionable suggestion: add 2–3 new ICP profiles
- No CTA button — user is already on the settings page

### Layer 3 — Reengagement email (this feature, Phase 2)

**Trigger:** `consecutiveZeroScans >= 5`

Why 5 instead of 3:
- Trial (1 scan/day): fires after 5 days
- Pro (2 scans/day): fires after 2.5 days
- Threshold is higher than the dashboard nudge to ensure users have already seen the in-app signal before the email

**Cooldown:** 14 days. Tracked via `Zero Streak Email Sent At` field on Tenants table (`fldbHbRNyohhn5cCi`). Email does not resend until 14 days after last send, even if streak grows.

**One email, not a sequence.** Avoids harassing users who are having a normal quiet period.

---

## Airtable Fields

**Tenants table** (`tblKciy1tqPmBJHmT`):
- `Zero Streak Email Sent At` — `fldbHbRNyohhn5cCi` — `dateTime` (America/Los_Angeles)

**Scan Health table** (already existed):
- `Consecutive Zero Scans` — `fld9OfrG6hQD3Kyxo` — `number`

---

## Cron: `/api/cron/zero-streak-check`

**Schedule:** `0 10 * * *` (daily at 10:00 UTC / 3 AM PDT)

**Flow:**
1. Fetch all `Status=Active` tenants with email, plan, `Email Opted Out`, `Zero Streak Email Sent At`
2. Filter: remove opted-out tenants + those within 14-day cooldown
3. Fetch ALL Scan Health records (full-table read, not OR formula — avoids URL length limit)
4. For each eligible tenant with `consecutiveZeroScans >= 5`: send email, write timestamp
5. Returns `{checked, eligible, sent, skipped, elapsed}` for logging

**Why full-table Scan Health fetch (not OR formula):** Building `OR({Tenant ID}='...', ...)` for 50+ tenants produces URLs that exceed Airtable's GET request limit. The Scan Health table has exactly one record per tenant, so fetching all records is fast and safe at any scale.

---

## Email Template: `buildZeroStreakEmail()`

Location: `dashboard/lib/emails.ts`

```typescript
buildZeroStreakEmail(
  email: string,
  consecutiveZeroScans: number,
  plan: string,
  opts: { appUrl: string; settingsUrl: string; unsubUrl: string }
): EmailTemplate
```

- Subject: "Scout hasn't found new posts for you recently"
- Uses `logoHeader()` + `BRAND_PURPLE` CTA
- Body: N-scan count, 3 numbered reasons, infoBox with "fastest fix" (add ICP profiles)
- CTA: "Review my ICP settings →" → `/settings?tab=linkedin`
- Scan frequency derived from plan (1×/day vs 2×/day)
- CAN-SPAM compliant: unsubscribe link in footer

---

## Metrics to Watch

- Email open rate (should be high — these are engaged users wondering why Scout is quiet)
- CTR from email to `/settings?tab=linkedin`
- `consecutiveZeroScans` reset after email send (did user add profiles/keywords?)
- Churn correlation with max streak length (helps tune the 5-scan threshold)

---

## Edge Cases Handled

| Case | Behavior |
|---|---|
| New user (no scans yet) | `lastScanAt === null` → banner doesn't render |
| User opted out of email | `Email Opted Out === true` → skipped in cron |
| Email sent within 14 days | `Zero Streak Email Sent At` within cooldown → skipped |
| Actor failure streak (not user fault) | `consecutiveZeroScans` not incremented on errors — only on `scanned > 0 && postsFound === 0` |
| Resend key not set | Logs intended send, returns false, does NOT write `Zero Streak Email Sent At` |
| Airtable PATCH fails after send | Logged but non-fatal — worst case: duplicate email on next daily run |
