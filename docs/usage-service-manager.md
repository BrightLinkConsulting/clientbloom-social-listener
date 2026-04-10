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

## Service Flag Email Notification System (Recommended Design)

### The problem

Service flags appear in the admin panel. But:
- Admins don't check the panel constantly
- Users don't know something is misconfigured until they wonder why Scout isn't delivering value

### Recommended architecture

**Tenant-facing emails (user gets these):**

| Flag | Email trigger | Goal |
|---|---|---|
| `nothing_to_scan` | First occurrence after 24h account age | "Your account isn't configured to scan yet" — links directly to ICP setup + keyword setup |
| `paid_zero_posts` | 48h after account becomes paid with 0 posts | "Your scans are running but not capturing anything" — check LinkedIn ICP URLs are valid |
| `scan_failed` | Within 4h of flag detection | "Your last scan hit an error" — auto-clears when next scan succeeds |
| `paid_no_scan_48h` | 48h mark | "Scans haven't run in 2 days" — escalation from scan_failed |
| `trial_expiring_48h` | Already handled by trial-check cron | Upgrade nudge |

**Admin Slack alerts (Mike gets these):**

Rather than checking the panel manually, a Slack webhook call from the `service-check` cron when any new critical flag is detected would surface the issue immediately. The Slack message would include: tenant email, flag code, message, and a deep link to the admin Usage tab.

### Airtable fields required

| Field | Type | Purpose |
|---|---|---|
| `Service Flag Email Sent At` | DateTime | Prevents re-sending the same flag email within 24h |
| `Last Flag Codes Emailed` | Long text | JSON array of flag codes already emailed (prevents duplicate emails for same flag) |

### Email cadence rules

1. Only send for `warning` and `critical` severity — not `info`
2. Check `Service Flag Email Sent At` before sending — skip if sent within last 24h
3. Store the flag codes emailed in `Last Flag Codes Emailed` — skip codes already sent
4. Reset `Last Flag Codes Emailed` when all flags are cleared
5. Never send email for `isAdmin` accounts or `Suspended` accounts
6. Never send for `trial_expired` accounts

### Implementation location

Add email-sending logic to the `service-check` cron (`app/api/cron/service-check/route.ts`) immediately after `patchTenantFlags()` writes the flags. Use `lib/emails.ts` for HTML templates consistent with brand standards.

---

## Airtable Schema (Tenants table fields used by this system)

| Field | Type | Written by | Read by |
|---|---|---|---|
| `Post Count` | Number | usage-sync cron | Usage tab |
| `Est Cost` | Number | usage-sync cron | (legacy display) |
| `Usage Synced At` | DateTime | usage-sync cron | Usage tab overdue indicator |
| `Service Flags` | Long text (JSON) | service-check cron | Usage tab, admin/usage API |
| `Service Checked At` | DateTime | service-check cron | Usage tab lastChecked |
