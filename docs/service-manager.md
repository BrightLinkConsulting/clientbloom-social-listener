# Service Manager

Scout's Service Manager is an automated customer health monitoring system. It runs every 4 hours as a background cron job, evaluates every tenant account against a set of health rules, and writes the results back to Airtable as structured flags. The admin **Usage & Service Manager** tab reads those flags and surfaces them as actionable alerts.

The goal: know instantly when a paying customer isn't getting value, without manual oversight.

---

## Architecture

```
vercel.json cron (every 4h)
    └── GET /api/cron/service-check
            ├── Fetch all Tenant records from Airtable
            ├── For each tenant (sequential, 100ms between):
            │       ├── evaluateFlags(record, checkedAt)
            │       │       ├── getScanHealth(tenantId)
            │       │       ├── hasPostsThisMonth(tenantId)
            │       │       ├── hasIcps(tenantId)
            │       │       └── hasKeywords(tenantId)
            │       ├── patchTenantFlags(recordId, flags, checkedAt)
            │       └── dispatchNotifications(record, flags, checkedAt)
            │               ├── 24h cooldown check (Service Flag Email Sent At)
            │               ├── Per-code dedup (Last Flag Codes Emailed)
            │               ├── sendServiceFlagEmail() via Resend → tenant inbox
            │               ├── patchNotificationState() → Airtable
            │               └── Accumulate new critical flags for Slack batch
            └── sendCriticalFlagSlackAlert() — one Slack message per run
            └── Return summary JSON { total, flagged, emailed, slackAlerts, errors }

GET /api/admin/usage
    └── Reads "Service Flags" JSON field from each Tenant record
    └── Returns serviceSummary { critical, warning, info, lastChecked }

admin/page.tsx (Usage tab)
    └── Service alert banner (if critical/warning flags exist)
    └── Green "all healthy" strip (if no flags)
    └── Health dot per tenant row (green / amber / red)
    └── Inline flag sub-rows under flagged tenant rows
```

---

## Cron Schedule

Defined in `dashboard/vercel.json`:

```json
{ "path": "/api/cron/service-check", "schedule": "0 */4 * * *" }
```

Runs at: 00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC.

Secured by `CRON_SECRET` env var — Vercel injects the `Authorization: Bearer {CRON_SECRET}` header on all cron requests. The route rejects any call without a matching header.

`maxDuration = 300` — allows up to 5 minutes for large tenant counts.

---

## Flag Reference

### CRITICAL — requires immediate attention

| Code | Trigger | Meaning |
|---|---|---|
| `paid_no_scan_48h` | Paid account, last scan >48h ago | Scans may be broken; customer is paying for a non-functional product |
| `scan_failed` | `Last Scan Status === 'failed'` | Last scan ended with an error |
| `trial_billing_mismatch` | Trial plan, `Trial Ends At` is past, status ≠ `trial_expired` | trial-check cron has not run or is delayed |

### WARNING — worth monitoring

| Code | Trigger | Meaning |
|---|---|---|
| `trial_expiring_48h` | Active trial, <48h remaining | Churn risk — trial ending soon with no subscription |
| `paid_zero_posts` | Paid account, 0 posts captured this month | Customer probably hasn't configured ICPs or keywords, or scans are failing silently |
| `trial_no_setup` | Trial created >24h ago, `Onboarded` field is false | Customer started a trial but never completed setup |
| `scan_stalled` | `Last Scan Status === 'scanning'` for >30 minutes | Scan appears stuck — Apify run may have hung |
| `paid_no_scan_ever` | Paid account, created >48h ago, no scan on record | Possible onboarding issue |
| `nothing_to_scan` | No ICPs AND no keywords (both missing) | Scans will produce zero results — customer needs configuration guidance |

### INFO — awareness only

| Code | Trigger | Meaning |
|---|---|---|
| `no_icps_configured` | No rows in `LinkedIn ICPs` for this tenant | Account will only scan by keyword |
| `no_keywords` | No rows in `Sources` for this tenant | Account will only scan ICP profiles |

When both `no_icps_configured` AND `no_keywords` fire for the same account, both are upgraded to WARNING severity and `nothing_to_scan` is also added.

---

## Skip Conditions

The evaluator skips certain accounts entirely:

- `Is Admin === true` — internal super admin accounts don't need service checks
- `Status === 'Suspended'` — suspended accounts are already in a known terminal state
- `Status === 'trial_expired'` — only the `trial_billing_mismatch` check applies (to catch cron delays); all other checks are skipped

---

## Airtable Schema Requirements

Two fields must exist on the **Tenants** table before the cron can write results. Add them if missing:

| Field name | Field type | Notes |
|---|---|---|
| `Service Flags` | Long text | Stores a JSON array of ServiceFlag objects |
| `Service Checked At` | Date and time | Timestamp of the last service-check run |

If these fields don't exist and the cron runs, it will log a `422` error with an explicit hint:

```
[service-check] 422 likely means "Service Flags" or "Service Checked At" fields are
missing from the Tenants table. Add them: Service Flags (Long text),
Service Checked At (Date/time).
```

---

## ServiceFlag Object Shape

```typescript
interface ServiceFlag {
  code:       string                       // e.g. 'paid_no_scan_48h'
  severity:   'critical' | 'warning' | 'info'
  message:    string                       // human-readable explanation
  detectedAt: string                       // ISO timestamp of when the flag was set
}
```

The `Service Flags` field stores a JSON-serialized `ServiceFlag[]`. Empty array means healthy. The `GET /api/admin/usage` route deserializes this field for every tenant record and passes it to the frontend.

---

## Rate Limiting and Throughput

The evaluator runs sequentially (one tenant at a time) with a 100ms sleep between tenants. This is intentional:

Each tenant evaluation triggers 4–6 Airtable API calls:
- `getScanHealth` — 1 call
- `hasPostsThisMonth` — 1 call (paid accounts and active trials)
- `hasIcps` — 1 call (accounts >12h old)
- `hasKeywords` — 1 call (accounts >12h old)

At 100 tenants × 5 calls = 500 Airtable calls. Airtable's limit is 5 req/sec. Sequential processing with 100ms gaps gives ~10 tenants/sec, well within budget. At 500 tenants the cron would approach the 5-minute `maxDuration` limit — at that scale, switch to parallel batches of 5 with Airtable rate budgeting.

---

## Admin UI: Usage & Service Manager Tab

The Usage tab in the admin panel (`dashboard/app/admin/page.tsx`) consumes service flag data in three places:

**Service alert banner** (top of tab): Shows when any critical or warning flags exist. Lists each flagged tenant with their flag messages. Color-coded red (critical) or amber (warning).

**"All healthy" strip**: Shown when `serviceSummary.critical === 0 && serviceSummary.warning === 0`. Shows when the service-check last ran.

**Health dot per row**: A 2px colored circle at the left edge of each tenant row:
- Green — no flags
- Amber — warning flags only
- Red — at least one critical flag

**Inline flag sub-rows**: If a tenant has critical or warning flags, a sub-row appears directly below their table row listing each flag as a colored pill. This means you can see the specific issue without navigating away.

---

## How the `serviceSummary` is Computed

`GET /api/admin/usage` computes the summary server-side from all tenant records:

```typescript
const serviceSummary = {
  critical: usageRaw.reduce((n, u) => n + u.serviceFlags.filter(f => f.severity === 'critical').length, 0),
  warning:  usageRaw.reduce((n, u) => n + u.serviceFlags.filter(f => f.severity === 'warning').length, 0),
  info:     usageRaw.reduce((n, u) => n + u.serviceFlags.filter(f => f.severity === 'info').length, 0),
  lastChecked: // max 'Service Checked At' across all tenant records
}
```

Counts are per-flag, not per-tenant. A single tenant with two critical flags contributes 2 to `serviceSummary.critical`.

---

## Adding New Flag Rules

To add a new flag:

1. Define a code string and decide severity (`critical` / `warning` / `info`)
2. Add a check inside `evaluateFlags()` in `app/api/cron/service-check/route.ts`
3. Call `flags.push({ code, severity, message, detectedAt: checkedAt })`
4. Add the new code to the flag reference table in this document
5. If the flag is tenant-specific and actionable, consider adding a visual treatment in the `admin/page.tsx` inline sub-row renderer

No schema changes needed — flags are free-form JSON stored in `Service Flags` (Long text).

---

## Manually Triggering the Cron

To run the service-check outside its schedule (e.g., to initialize flags immediately after adding the Airtable fields):

```bash
curl -X GET https://scout.clientbloom.ai/api/cron/service-check \
  -H "Authorization: Bearer $CRON_SECRET"
```

The response JSON includes:
```json
{
  "ok": true,
  "checkedAt": "2026-04-10T12:00:00.000Z",
  "total": 42,
  "flagged": 3,
  "errors": 0,
  "results": [
    { "id": "rec...", "email": "user@co.com", "flags": 2 },
    ...
  ]
}
```

Errors in `results[].error` indicate tenants where flag evaluation or the Airtable patch failed. Check Vercel function logs for the full error details.
