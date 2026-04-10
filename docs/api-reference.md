# Scout — API Reference

## Last updated: April 2026

---

## Reading this document

**Auth column legend:**
- `Public` — no authentication required
- `Session` — valid NextAuth JWT required (any authenticated user)
- `Admin` — `session.user.isAdmin === true` required
- `CRON_SECRET` — `Authorization: Bearer <CRON_SECRET>` header required (Vercel Cron or manual curl)

All `Session` and `Admin` routes return `401 { error: 'Unauthorized' }` if no session exists, and `403 { error: 'Admin access required.' }` if a non-admin session hits an admin route.

---

## Authentication routes

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/auth/[...nextauth]` | GET / POST | Public | NextAuth handler — sign-in, sign-out, session |
| `/api/auth/forgot-password` | POST | Public | Send password reset email. Body: `{ email }` |
| `/api/auth/reset-password` | POST | Public | Reset password with token. Body: `{ token, password }` |

---

## Trial routes

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/trial/start` | POST | Public | Create a no-CC trial account. Body: `{ email, password }`. Rate-limited per IP. |
| `/api/unsubscribe` | GET | Public | Unsubscribe from emails. Query: `?email=...`. Sets `Email Opted Out = true` in Airtable. |

---

## Admin routes

All require `isAdmin === true`.

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/admin/tenants` | GET | Admin | List all tenant records from Airtable |
| `/api/admin/tenants` | POST | Admin | Create a tenant record. Body: `{ email, password, companyName, plan, isAdmin? }` |
| `/api/admin/tenants` | PATCH | Admin | Update tenant fields. Body: `{ id, ...fields }` |
| `/api/admin/tenants` | DELETE | Admin | Delete a tenant record. Body: `{ id }` |
| `/api/admin/grant-access` | POST | Admin | Provision 7-day trial account + send welcome email. Body: `{ email, companyName }` |
| `/api/admin/send-reactivation` | POST | Admin | Send reactivation email to expired trial. Body: `{ email, tenantRecordId }` |
| `/api/admin/send-reset` | POST | Admin | Send password reset email to any address. Body: `{ email }` |
| `/api/admin/stripe-stats` | GET | Admin | Revenue stats: subscriber count + MRR per plan from Stripe |
| `/api/admin/usage` | GET | Admin | Per-tenant usage data (post counts, scan activity) |

**`grant-access` side effects:**
- Creates Airtable record with `plan='Trial'`, `trialEndsAt=now+7days`, `Created At=now.toISOString()`
- Calls `provisionNewTenant()` to assign a unique Tenant ID
- Generates 12-char temp password, bcrypt-hashed before writing
- Sends welcome email via Resend (template: `buildGrantAccessEmail` in `lib/emails.ts`)

---

## Billing routes

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/billing/upgrade` | GET | Session | Create Stripe Checkout session. Query: `?tier=starter|pro|agency`. Redirects to Stripe hosted page. Guard: active subscribers are redirected to billing portal instead. |
| `/api/billing/portal` | GET | Session | Redirect to Stripe Customer Portal (manage subscription, cancel). |
| `/api/billing/cancel` | POST | Session | Initiate subscription cancellation via Stripe API. Sends cancellation email. |
| `/api/billing/status` | GET | Session | Re-read subscription status from Stripe. Used post-cancel to restore "Cancellation pending" UI state on refresh. |
| `/api/checkout` | GET | Public | Legacy Stripe checkout redirect — pre-dates multi-tier billing. Do not use in new code. |
| `/api/webhooks/stripe` | POST | Public (signed) | Stripe event receiver. Verifies `STRIPE_WEBHOOK_SECRET` signature via `constructEvent()`. Handles: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. |

**Webhook events and their effects:**

| Event | Airtable update |
|-------|----------------|
| `subscription.created` | Plan = planFromPriceId(priceId), Status = 'Active', Trial Ends At = null |
| `subscription.updated` | Same as above (handles plan changes) |
| `subscription.deleted` | Plan = 'Trial', Status = 'trial_expired' |

---

## Scan and post routes

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/trigger-scan` | POST | Session | Manually trigger a scan for the current tenant. 30-minute cooldown enforced. Checks scan eligibility (plan, trial status). |
| `/api/scan-status` | GET | Session | Current scan status for the tenant from Scan Health table. |
| `/api/posts` | GET | Session | List captured posts. Query: `?page=&limit=&status=`. Scoped to tenant. |
| `/api/posts/[id]` | GET | Session | Get single post. Verifies tenant ownership. |
| `/api/posts/[id]` | PATCH | Session | Update post fields (e.g. `status`). Verifies tenant ownership. |
| `/api/posts/[id]/suggest` | POST | Session | Generate or regenerate a comment approach for a post via Claude. Checks `commentCredits` limit. |
| `/api/engagement-history` | GET | Session | List engagement history records for the tenant. |
| `/api/stats` | GET | Session | Scan stats (post count, last scan time, next scan window). |
| `/api/generate-prompt` | POST | Session | Generate a custom AI scoring prompt from business profile. |

---

## Sources (keyword) routes

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/sources` | GET | Session | List keyword sources for the tenant. |
| `/api/sources` | POST | Session | Add a keyword source. Enforces `getTierLimits(plan).keywords` limit. Body: `{ keyword }`. |
| `/api/sources/[id]` | DELETE | Session | Delete a keyword source. Verifies tenant ownership via `verifyRecordTenant()`. |

---

## LinkedIn ICP routes

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/linkedin-icps` | GET | Session | List ICP profiles in the tenant's pool. |
| `/api/linkedin-icps` | POST | Session | Add an ICP profile. Enforces `getTierLimits(plan).poolSize` limit. Body: `{ profileUrl }`. |
| `/api/linkedin-icps/[id]` | DELETE | Session | Delete an ICP profile. Verifies tenant ownership. |
| `/api/linkedin-icps/discover` | POST | Session | Run Discover ICPs (Apify actor). Gated: `discoverRunsPerDay > 0`. Enforces daily frequency window and 15-min hard cooldown. |

---

## Business profile and settings routes

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/business-profile` | GET | Session | Get tenant business profile. |
| `/api/business-profile` | POST / PATCH | Session | Save business profile fields. |
| `/api/slack-settings` | GET | Session | Get Slack webhook URL and channel. |
| `/api/slack-settings` | POST | Session | Save Slack settings. |
| `/api/slack-test` | POST | Session | Send a test message to the tenant's Slack webhook. |
| `/api/crm-settings` | GET | Session | Get GHL CRM webhook config. Gated: Agency+Owner only. |
| `/api/crm-settings` | POST | Session | Save CRM settings. Gated: Agency+Owner only. |
| `/api/crm-push` | POST | Session | Push a post to GHL CRM. Gated: Agency+Owner only. Verifies tenant ownership of post. |
| `/api/change-password` | POST | Session | Change password. Body: `{ currentPassword, newPassword }`. Verifies current password before updating. |

---

## Team routes

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/team` | GET | Session | List team members (accounts sharing the same tenantId). |
| `/api/team/invite` | POST | Session | Invite a team member. Creates a feed-only account with the same tenantId. |
| `/api/team/members` | GET | Session | Alias for `/api/team`. |
| `/api/team/remove` | POST | Session | Remove a team member. Verifies the caller has authority. |

---

## Onboarding and session routes

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/onboarding` | POST | Session | Mark onboarding complete. Updates `Onboarded = true` in Airtable. |
| `/api/session/refresh` | GET | Session | Re-reads plan and trial data from Airtable. Used by the welcome page after Stripe checkout completes. Returns `{ plan, trialEndsAt }`. |

---

## Cron routes

All require `Authorization: Bearer <CRON_SECRET>`. Return `401` immediately if header is missing or incorrect. Triggered by Vercel Cron on the schedules in `dashboard/vercel.json`.

| Route | Schedule (UTC) | Auth | Description |
|-------|---------------|------|-------------|
| `/api/cron/scan` | 13:00 + 01:00 daily | CRON_SECRET | Orchestrator: fetches eligible tenants, dispatches scan-tenant with jitter |
| `/api/cron/scan-retry` | 13:20 + 01:20 daily | CRON_SECRET | Retry tenants that errored in the main scan window |
| `/api/cron/scan-tenant` | Internal only | CRON_SECRET | Per-tenant scan worker: Apify + Claude scoring + Airtable write |
| `/api/cron/digest` | 15:00 daily | CRON_SECRET | Send daily Slack digest to eligible tenants (paid + active trial) |
| `/api/cron/usage-sync` | Every hour :00 | CRON_SECRET | Sync post counts + estimated cost to Tenants records |
| `/api/cron/trial-check` | Every 6 hours | CRON_SECRET | Send drip emails for active trials; expire overdue trials |
| `/api/cron/scan-watchdog` | Every 30 min :30 | CRON_SECRET | Detect tenants stuck in 'scanning' > 20 min; reset to 'success' |
| `/api/cron/archive-posts` | 03:00 Sunday | CRON_SECRET | Archive posts older than `postHistoryDays` limit per plan |

**Testing cron routes locally:**
```bash
curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/scan
```

---

## Utility routes

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/health` | GET | Public | Health check. Returns `{ status: 'ok', timestamp }`. Used for uptime monitoring. |
| `/api/debug` | GET | Public | Debug endpoint — do not expose sensitive data here. |
| `/api/trigger-digest` | POST | Session | Manually trigger digest for the current tenant (testing only). |
| `/api/facebook-keywords` | — | — | DEPRECATED — Facebook scraping permanently removed (commit b906384, April 2026). Route may still exist but does nothing. |

---

## Response conventions

**Success:**
```json
{ "data": ..., "count": N }   // list responses
{ "record": { ... } }         // single record responses
{ "ok": true }                // action confirmations
```

**Error:**
```json
{ "error": "Human-readable message" }
```
HTTP status codes follow standard conventions (400 bad request, 401 unauthenticated, 403 forbidden, 404 not found, 429 rate limited, 500 server error).

---

*See [`docs/README.md`](./README.md) for the full documentation index.*
