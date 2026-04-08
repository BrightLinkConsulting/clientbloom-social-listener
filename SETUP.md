# Scout — Developer Setup Guide

Scout is a multi-tenant Next.js SaaS. All application code lives in `dashboard/`.
This guide covers first-time local setup and production deployment.

---

## Prerequisites

- Node.js 18+
- A Vercel account (free tier is sufficient)
- An Airtable account
- An Apify account
- An Anthropic API key
- A Stripe account (for billing)
- A Resend account (for transactional email)

---

## 1. Clone and install

```bash
git clone https://github.com/BrightLinkConsulting/clientbloom-social-listener.git
cd clientbloom-social-listener/dashboard
npm install
```

---

## 2. Environment variables

Copy the example file and fill in each value:

```bash
cp .env.example .env.local
```

All required variables are documented inline in `.env.example`.

| Variable | Required for |
|---|---|
| `PLATFORM_AIRTABLE_TOKEN` | All API routes |
| `PLATFORM_AIRTABLE_BASE_ID` | All API routes |
| `NEXTAUTH_SECRET` | Auth |
| `NEXTAUTH_URL` | Auth |
| `RESEND_API_KEY` | Email delivery |
| `APIFY_API_TOKEN` | LinkedIn scanning |
| `ANTHROPIC_API_KEY` | Post scoring |
| `CRON_SECRET` | Cron job protection |
| `STRIPE_*` | Billing (not needed for local dev) |

---

## 3. Airtable setup

Scout uses a single shared Airtable base for all tenant data. The base ID goes in
`PLATFORM_AIRTABLE_BASE_ID`. The following tables must exist in that base.

### Tenants table

One record per customer account.

| Field | Type | Notes |
|---|---|---|
| `Tenant ID` | Single line text | Generated on provisioning (format: `t_xxxxxxxx`) |
| `Email` | Email | Login identifier |
| `Password Hash` | Single line text | bcrypt hash, 12 rounds |
| `Company Name` | Single line text | |
| `Plan` | Single line text | `Trial` \| `Scout Starter` \| `Scout Pro` \| `Scout Agency` \| `Owner` |
| `Status` | Single line text | `Active` \| `Suspended` \| `trial_expired` |
| `Trial Ends At` | Single line text | ISO date string — Trial plan only |
| `Trial Type` | Single line text | `no_cc` |
| `Trial Email Day` | Number | Day counter for drip emails (1–7) |
| `Onboarded` | Checkbox | Set after onboarding wizard completes |
| `Is Admin` | Checkbox | Grants access to `/admin` routes |
| `Is Feed Only` | Checkbox | Restricts session to feed view only |
| `Apify API Key` | Single line text | Per-tenant override; falls back to `APIFY_API_TOKEN` |
| `Slack Webhook URL` | URL | For daily digest delivery |
| `Slack Channel` | Single line text | e.g. `#scout-intel` |
| `Post Count` | Number | Updated hourly by usage-sync cron |
| `Est Cost` | Number | Estimated API cost this month |
| `Usage Synced At` | Date/time | Timestamp of last usage-sync run |
| `Last Manual Scan At` | Date/time | For 30-minute scan cooldown enforcement |
| `Password Reset Token` | Single line text | SHA-256 hash of the active reset token |
| `Password Reset Expires At` | Date/time | Expiry for password reset token (1 hour) |
| `Email Opted Out` | Checkbox | Set on unsubscribe |

### Customer data tables (all require a `Tenant ID` field)

- `Captured Posts` — scored LinkedIn posts
- `Sources` — keyword search terms
- `LinkedIn ICPs` — ICP profile URLs to monitor
- `Business Profile` — company details and custom scoring prompt
- `Scan Health` — per-tenant scan status (Last Scan At, Last Scan Status, Last Posts Found, Last Scan Source, Last Error)
- `CRM Settings` — GoHighLevel webhook configuration

---

## 4. Run locally

```bash
cd dashboard
npm run dev
```

App runs at `http://localhost:3000`.

To test cron routes locally, send a GET request with the correct auth header:

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/scan
```

---

## 5. Deploy to Vercel

```bash
npm install -g vercel
cd dashboard
vercel --prod
```

Set all environment variables in **Vercel → Settings → Environment Variables**.

Additional production-only variables:

| Variable | Where to get it |
|---|---|
| `NEXTAUTH_URL` | Your production URL (e.g. `https://scout.clientbloom.ai`) |
| `NEXT_PUBLIC_BASE_URL` | Same as `NEXTAUTH_URL` |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks |

The `vercel.json` in `dashboard/` defines all cron schedules. No additional
configuration needed after deployment.

---

## 6. Cron jobs

| Route | UTC Schedule | Purpose |
|---|---|---|
| `/api/cron/scan` | 13:00 + 01:00 daily | Scan all active tenants |
| `/api/cron/scan-retry` | 13:20 + 01:20 daily | Retry tenants that errored |
| `/api/cron/digest` | 15:00 daily | Daily Slack digest (paid + active trial) |
| `/api/cron/usage-sync` | Every hour `:00` | Sync post counts to Tenant records |
| `/api/cron/trial-check` | Every 6 hours | Expire overdue trials |
| `/api/cron/scan-watchdog` | Every 30 min `:30` | Detect and flag stalled scans |

All routes fail-closed: they return `401 Unauthorized` if `CRON_SECRET` is
missing or the bearer token does not match.

---

## 7. Architecture patterns every developer must follow

### Tenant isolation
Every Airtable query is scoped to the authenticated tenant via `tenantFilter(tenantId)`
from `lib/airtable.ts`. Before any update or delete that takes a record ID from
user input, call `verifyRecordTenant()` to confirm the record belongs to the caller.
Never skip this check — it is the primary IDOR defence.

### Authenticated routes
Call `getTenantConfig()` from `lib/tenant.ts` at the top of every API route.
It returns `null` if the session is missing or invalid. Return `tenantError()`
immediately on null.

### Plan enforcement
`getTierLimits(plan)` from `lib/tier.ts` is the **only** source of plan limits.
Never hardcode limit values in route files. Server-side enforcement is required —
UI gates alone are not sufficient.

### Formula injection prevention
All values inserted into Airtable `filterByFormula` strings must pass through
`escapeAirtableString()` from `lib/airtable.ts`. This prevents formula injection
via apostrophes and backslashes in tenant IDs or user-supplied input.

### CRON_SECRET enforcement
Every cron route must verify `Authorization: Bearer <CRON_SECRET>` before
executing. The check must be the first statement in the handler, before any
business logic or external calls.

---

*Scout by ClientBloom — Built by BrightLink Consulting*
