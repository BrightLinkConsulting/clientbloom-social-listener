# Usage & Service Manager

The **Usage & Service Manager** is the admin panel tab at `scout.clientbloom.ai/admin` (Usage tab). It gives you a real-time view of every tenant's activity, Apify cost attribution, scan health, and automated service flags — all in one place without manual investigation.

---

## What it shows

| Column | Source | Notes |
|---|---|---|
| Health dot | Computed from Service Flags | Green = clean, amber = warnings, red = critical |
| Tenant / Email | Tenants table | Company name + email |
| Plan | Tenants table `Plan` field | Color-coded badge |
| Role | `Is Admin` + `Is Feed Only` fields | Super Admin / Feed Only / Primary |
| Status | Tenants table `Status` field | Active / Suspended / Expired |
| Last Scan | Scan Health table | Time + pass/fail from last scan run |
| Posts | `Post Count` (cache) or live Airtable count | See Post Count section |
| Cache | `Usage Synced At` field | Amber + ⚠ when stale >90min |
| Apify cost | Apify API (tagged runs > pro-rata) | See Cost Attribution section |

---

## Post Count: cache vs. live

**Cache-first:** The `usage-sync` cron runs every hour and writes each tenant's current month post count to the `Post Count` field in the Tenants table. The admin Usage tab reads this cached value for instant page loads.

**Live fallback:** If `Post Count` is null (never synced, or new tenant), the route calls `liveFetchSharedBase(tenantId)` — a live Airtable query on the `Captured Posts` table filtered by `Tenant ID` and current month. This is labeled **live** in the Cache column (no timestamp shown).

**Post count shown as "—":** Tenant has no Tenant ID field populated.

**Fetch error:** `liveFetchSharedBase()` threw (Airtable auth error, malformed formula, timeout). Check Vercel function logs for the full error.

---

## Cache Sync Indicator

The top-right of the Usage tab shows two distinct timestamps:

| Indicator | Meaning |
|---|---|
| `Cache sync: Xm ago` | When `usage-sync` cron last wrote to Airtable |
| `Page data: HH:MM` | When you last clicked Refresh in the browser |

**OVERDUE** (in red): Cache sync exceeds 75 minutes. This means the `usage-sync` cron hasn't run successfully. Check Vercel → Logs → cron for the `usage-sync` route. Common causes: Airtable auth error, rate limit cascade, Vercel cron timeout.

The overdue threshold is 75 minutes to account for cron scheduling drift and Vercel cold-start delays.

---

## Apify Cost Attribution

Three-tier system, most accurate wins:

| Source | Label | How |
|---|---|---|
| Own Apify key | `own key` (blue) | Tenant supplied their own key → queried from their own Apify account |
| Tagged run | `exact` (green) | Run had `&tag={tenantId}` → direct attribution from Apify API |
| Pro-rata | `pro-rata` (amber) | `(tenant posts / total unattributed posts) × unattributed spend` |

The Apify account card at the top always shows the full billing cycle total from `/v2/users/me/usage/monthly` — this is authoritative regardless of per-tenant attribution accuracy.

---

## Service Alert Banner

The banner appears at the top when any tenant has critical or warning flags. It is **collapsed by default** (single-line summary) and expands on click to show each flagged account with their flag counts.

**Design for scale:** At hundreds of tenants, the banner stays compact as a single header row showing total counts and number of accounts affected. Expanding shows a compact list (one row per account) with pill badges showing critical/warning counts. The full flag detail is in the inline sub-row beneath each flagged tenant in the table.

When no flags exist: a green "All accounts healthy" strip shows with the last checked timestamp.

---

## Inline Flag Sub-rows

Flagged tenants have a sub-row immediately below their table row showing each flag as a colored pill:

- **Red** = critical flag
- **Amber** = warning flag

Info-level flags are shown in the table dot tooltip only (not in sub-rows) to keep the list scannable.

---

## Known Bugs Fixed (April 2026)

These bugs were found and fixed through adversarial testing:

### 1. Double URL-encoding of Airtable filterByFormula
**Symptom:** "Fetch error" in the Posts column for all shared-platform tenants; "OVERDUE" cache indicator stuck permanently.  
**Root cause:** Both `liveFetchSharedBase()` and `countTenantPostsThisMonth()` called `encodeURIComponent()` on the Airtable formula string, then passed it to `url.searchParams.set()` which encodes again. Result: `{Tenant ID}` became `%257BTenant%2520ID%257D`, causing Airtable to return a 422 on every query.  
**Fix:** Removed `encodeURIComponent()` from both functions. `URLSearchParams.set()` handles encoding automatically.  
**Files:** `app/api/admin/usage/route.ts`, `app/api/cron/usage-sync/route.ts`

### 2. `searchParams.set()` for multi-value fields[] (silently drops all but last field)
**Symptom:** usage-sync returned "No Tenant ID" for all tenants; Scan Health column blank for all tenants; Usage Synced At never updated despite cron running.  
**Root cause:** `url.searchParams.set('fields[]', value)` called multiple times *replaces* the key on each call — only the last value survives in the URL. The Tenants fetch only sent `fields[]=Status` (last set); the Scan Health fetch only sent `fields[]=Last Posts Found` (last set). No Tenant ID was returned → cron skipped all tenants.  
**Fix:** Changed to `url.searchParams.append('fields[]', value)` for all multi-field blocks. `append()` adds a new key-value pair without replacing existing ones.  
**Files:** `app/api/admin/usage/route.ts`, `app/api/cron/usage-sync/route.ts`

### 3. Missing escapeAirtableString in usage-sync
**Symptom:** None observable (tenant IDs are UUIDs), but a formula-injection vector existed.  
**Fix:** Added `import { escapeAirtableString } from '@/lib/airtable'` and applied it to the `Tenant ID` filter in `countTenantPostsThisMonth()`, consistent with `liveFetchSharedBase()`.

### 4. React Fragment missing key prop in sortedUsage.map
**Symptom:** React console warning "Each child in a list should have a unique key prop"; potential row mismatches on re-sort.  
**Fix:** Changed `<>` → `<Fragment key={u.id}>` in the sortedUsage.map return.

### 5. patchTenantFlags silent error swallowing (service-check)
**Symptom:** If Airtable fields `Service Flags` or `Service Checked At` didn't exist, the cron reported success while writing nothing.  
**Fix:** Added `resp.ok` check + `console.error` with a 422-specific hint about missing Airtable fields.

---

## Cron Jobs

| Cron | Schedule | What it does |
|---|---|---|
| `usage-sync` | Every hour `:00` | Counts posts per tenant, writes Post Count + Est Cost + Usage Synced At |
| `service-check` | Every 4 hours `:00` | Evaluates health rules, writes Service Flags + Service Checked At |

Both require `Authorization: Bearer <CRON_SECRET>`. Trigger manually:

```bash
curl -X GET https://scout.clientbloom.ai/api/cron/usage-sync \
  -H "Authorization: Bearer $CRON_SECRET"

curl -X GET https://scout.clientbloom.ai/api/cron/service-check \
  -H "Authorization: Bearer $CRON_SECRET"
```

---

## Service Flag Email Notification System

Deployed April 2026. The `service-check` cron now sends customer-facing emails when new actionable flags appear, and posts a batched admin Slack alert when any tenant gains a new critical flag.

### Customer-facing emails

Emails send FROM `Scout <info@clientbloom.ai>` TO the tenant's email address using templates in `lib/emails.ts` (`buildServiceFlagEmail`).

| Flag | Email? | Subject fragment |
|---|---|---|
| `nothing_to_scan` | Yes | "Scout isn't scanning yet" |
| `paid_zero_posts` | Yes | "Scout isn't finding content" |
| `scan_failed` | Yes | "your last scan hit an error" |
| `paid_no_scan_48h` | Yes | "scans haven't run in 2 days" |
| `trial_no_setup` | Yes | "get more from your Scout trial" |
| `paid_no_scan_ever` | Yes | "let's run your first scan" |
| `trial_expiring_48h` | **No** | Handled by trial-check cron |
| `trial_billing_mismatch` | **No** | Admin Slack only |
| `scan_stalled` | **No** | Transient — not worth emailing |
| `no_icps_configured` | **No** | Info-level only |
| `no_keywords` | **No** | Info-level only |

Multiple flags can appear in a single email. Subject becomes "Action needed on your Scout account (N issues)" when more than one flag is included.

### Cadence and dedup rules

Two dedup mechanisms prevent spam — both must clear for an email to send:

1. **24h cooldown** (`Service Flag Email Sent At`): No email within 24 hours of the last send, regardless of flags.
2. **Per-code tracking** (`Last Flag Codes Emailed`): Once a flag code is emailed, it is never emailed again for the same account — even after the cooldown passes. Only codes not yet in this list trigger new emails.

**On account recovery:** When all actionable flags clear, `Last Flag Codes Emailed` is reset to `[]` so the next occurrence of a flag triggers a fresh email. `Service Flag Email Sent At` is intentionally **not** reset — this preserves the flapping protection so a heal/break cycle within 24 hours doesn't re-notify immediately.

**Never emails:** admin accounts (`Is Admin = true`), suspended accounts, `trial_expired` accounts.

### Admin Slack alerts

One batched Slack message per cron run (not per tenant). Fires when any tenant gains a new critical flag not already in `Last Flag Codes Emailed`. Critical codes that trigger Slack: `paid_no_scan_48h`, `scan_failed`, `trial_billing_mismatch`.

Requires `SLACK_WEBHOOK_URL` in Vercel env vars. If not set, Slack is silently skipped (emails still send).

### Cron response fields

```json
{
  "ok": true,
  "checkedAt": "ISO timestamp",
  "total": 6,
  "flagged": 2,
  "emailed": 0,
  "slackAlerts": 0,
  "errors": 0,
  "results": [
    { "id": "rec...", "email": "user@co.com", "flags": 3, "emailedCodes": [] }
  ]
}
```

`emailed`: tenants where an email was actually sent in this run (dedup suppressed = 0, new codes found = N).
`emailedCodes`: flag codes actually emailed in this run per tenant (empty = dedup blocked or no eligible flags).

### Bugs found and fixed during implementation (April 2026)

**Bug 6: patchNotificationState sentinel value**
Symptom: `patchNotificationState(null)` on account reset cleared `Service Flag Email Sent At` in Airtable (null !== undefined is true, bypassing the guard). Flapping accounts would get re-notified on every heal/break cycle.
Fix: Changed type from `string | null` to `string | undefined`. `undefined` = don't touch the field. The reset call now passes `undefined` to preserve the cooldown timestamp.

**Bug 7: Misleading `emailed` metric**
Symptom: `emailed` in cron response counted tenants with actionable codes, not tenants where an email was actually sent in this run. Dedup-blocked runs reported `emailed: 2` even when no emails fired.
Fix: `dispatchNotifications` now returns `{ criticalAlert, sentCodes }` where `sentCodes` contains only codes emailed in this run. Results are populated from that return value.

**Bug 8: Import statement buried mid-file**
Symptom: `import { buildServiceFlagEmail }` was placed in the middle of `notify.ts` after function bodies. Syntactically valid in TypeScript (imports hoist) but violates lint conventions and can confuse bundlers.
Fix: Moved to top of file with all other imports.

---

## Airtable Schema (Tenants table fields used by this system)

| Field | Type | Written by | Read by |
|---|---|---|---|
| `Post Count` | Number | usage-sync cron | Usage tab |
| `Est Cost` | Number | usage-sync cron | (legacy display) |
| `Usage Synced At` | DateTime | usage-sync cron | Usage tab overdue indicator |
| `Service Flags` | Long text (JSON) | service-check cron | Usage tab, admin/usage API |
| `Service Checked At` | DateTime | service-check cron | Usage tab lastChecked |
| `Service Flag Email Sent At` | DateTime | service-check cron | 24h email cooldown |
| `Last Flag Codes Emailed` | Long text (JSON) | service-check cron | Per-code email dedup |
