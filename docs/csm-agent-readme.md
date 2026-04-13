# Scout Platform Bible — CSM Agent & Full System Reference

**Last updated:** April 2026
**Maintained by:** Mike Walker, BrightLink Consulting / ClientBloom.ai
**Context system:** Mem0 (userId: `mike-walker`) — all architectural decisions are stored there

This document is the authoritative reference for the Scout platform. It covers the full system architecture, every Airtable table, all API routes, the CSM Agent, cron jobs, plan tiers, deployment, rollback, and developer handoff. Keep it current whenever the system changes.

---

## 1. What Scout is

Scout is a B2B SaaS platform that monitors LinkedIn and Facebook groups for high-intent leads matching each customer's ICP (Ideal Customer Profile). Posts are scraped via Apify, scored by Claude AI for relevance, and surfaced to customers as actionable prospects with suggested engagement copy.

Built by Mike Walker (owner, BrightLink Consulting / ClientBloom.ai). Productized from a single-tenant Python script on Railway into a fully multi-tenant Next.js 14 App Router SaaS on Vercel.

**Live URL:** https://scout.clientbloom.ai
**Old Vercel subdomain:** cb-dashboard-xi.vercel.app (still resolves, but all env vars reference the custom domain)

---

## 2. Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 App Router (TypeScript strict) |
| Hosting | Vercel Pro |
| Database | Airtable (single base, row-isolated by Tenant ID) |
| Scraping | Apify (LinkedIn Actor + Facebook Groups Actor) |
| AI scoring | Claude Haiku 4.5 (post scoring, keyword suggestions) |
| AI agent | Claude Opus 4.6 (CSM Agent) |
| Billing | Stripe (subscriptions, webhooks) |
| Email | Resend (transactional + drip sequences) |
| Admin alerts | Slack webhook (#clientbloom-support) |
| Auth | NextAuth.js (credentials provider, JWT sessions, 24h maxAge) |
| Repo | BrightLink Consulting/clientbloom-social-listener (GitHub) |
| Vercel project | cb-dashboard (prj_ST1V7wsPjRbwhnRwIwJ6hJ5z2blK) |

---

## 3. Airtable architecture

**Single base:** `appZWp7QdPptIOUYB` — "ClientBloom Social Listener"

All tenants share this base. Row-level isolation is enforced by a `Tenant ID` field (UUID) in every shared table.

**Two API tokens:**
- `PLATFORM_AIRTABLE_TOKEN` — platform-level operations (Tenants, Scan Health, Admin Audit Log)
- `AIRTABLE_PROVISIONING_TOKEN` — shared data tables (Captured Posts, Sources, LinkedIn ICPs, Business Profile, Facebook Keywords, Target Groups)

### 3.1 Tenants table — `tblKciy1tqPmBJHmT`

Primary registry. One row per customer account.

| Field | Type | Notes |
|-------|------|-------|
| Email | Email | Primary field. Login identifier. |
| Password Hash | singleLineText | bcrypt hash (cost 12) |
| Company Name | singleLineText | Display name |
| Airtable Base ID | singleLineText | Legacy per-tenant base (no longer used for data) |
| Airtable API Token | singleLineText | Legacy per-tenant token (never exposed in API responses) |
| Status | singleLineText | Active \| Suspended \| Archived \| trial_expired \| deleted |
| Plan | singleLineText | See plan tiers section |
| Is Admin | checkbox | true = Mike's owner account |
| Is Feed Only | checkbox | true = sub-account sharing primary's Tenant ID |
| Tenant ID | singleLineText | UUID. Row isolation key across all shared tables. |
| Apify API Key | singleLineText | Client-owned key; blank = shared Scout pool |
| Apify Pool | number | 0=default, 1=Pool 1, 2=Pool 2 |
| Stripe Customer ID | singleLineText | |
| Stripe Subscription ID | singleLineText | |
| Stripe Price ID | singleLineText | |
| Created At | singleLineText | ISO 8601 |
| Trial Ends At | singleLineText | ISO 8601 |
| Trial Type | singleLineText | |
| Trial Email Day | number | Current position in trial drip sequence |
| Trial Last Email Sent At | dateTime | Prevents double-sends in trial-check cron |
| Email Opted Out | checkbox | Unsubscribed from trial sequence; transactional emails unaffected |
| Onboarded | checkbox | Completed onboarding wizard |
| Post Count | number | Cached monthly count from usage-sync cron |
| Est Cost | number | Estimated Apify cost for this month |
| Usage Synced At | dateTime | When usage-sync last ran for this tenant |
| Last Manual Scan At | dateTime | Admin-triggered scan timestamp |
| Last ICP Discovery At | dateTime | Cooldown enforcement: 60min trial, 15min paid |
| Suggestions Used | number | Count of AI comment suggestions (enforces commentCredits limit) |
| Service Flags | multilineText | JSON array of ServiceFlag objects |
| Service Checked At | dateTime | When service-check cron last evaluated this tenant |
| Service Flag Email Sent At | dateTime | Throttle: skip flag email if sent < 24h ago |
| Last Flag Codes Emailed | multilineText | JSON array of flag codes already emailed (dedup) |
| Password Reset Token | singleLineText | One-time token for password reset flow |
| Password Reset Expires At | dateTime | |
| Reactivation Sent At | singleLineText | ISO 8601, set when reactivation email sent |
| Zero Streak Email Sent At | dateTime | When consecutive-zero-scans notification was sent |
| Archived At | singleLineText | ISO 8601, set on archive, cleared on unarchive. Accounts with archivedAt > 12 months are stale cleanup candidates. |

### 3.2 Scan Health table — `tblyHCFjjhpnJEDno`

One row per tenant. Tracks scraper run state.

| Field | Type | Notes |
|-------|------|-------|
| Tenant ID | singleLineText | Row isolation key |
| Last Scan At | dateTime | |
| Last Scan Status | singleLineText | success \| partial \| failed \| pending_fb \| no_results \| scanning |
| Last Posts Found | number | |
| Last Scan Source | singleLineText | linkedin \| facebook_groups \| linkedin+facebook_groups \| none |
| Last Error | multilineText | Error message if scan failed |
| FB Run ID | singleLineText | Apify run ID for in-flight async Facebook scan |
| FB Run At | dateTime | |
| FB Dataset ID | singleLineText | Apify dataset ID to fetch results from |
| Consecutive Zero Scans | number | Reset to 0 on any successful scan |
| Last Scan Degraded | checkbox | true when R4 blank Post Text warning triggered |

### 3.3 Admin Audit Log table — `tbl83Jr5oqLD24xwa`

Immutable admin action trail. Created April 2026. Written by `lib/audit-log.ts` (non-fatal).

| Field | Type | Notes |
|-------|------|-------|
| Event Type | singleLineText | archive_tenant \| unarchive_tenant \| hard_delete_tenant \| grant_access \| password_reset \| plan_change \| status_change \| csm_agent_action |
| Admin Email | email | |
| Target Email | email | |
| Target Tenant ID | singleLineText | |
| Target Record ID | singleLineText | Airtable rec… ID |
| Notes | multilineText | JSON — cascade stats, field changes, source: 'csm_agent', etc. |
| Timestamp | dateTime | America/New_York |

### 3.4 Captured Posts table — `tblvhgibBTXtAvWpi`

Scored lead posts. Fields: Post ID, Platform, Group Name, Author Name, Author Profile URL, Post Text, Post URL, Keywords Matched, Relevance Score, Score Reason, Comment Approach, Captured At, Action, Engagement Status, CRM Pushed At, CRM Contact ID, Tenant ID.

### 3.5 Sources table — `tbllcd92zZn8HIk6D`

Facebook groups and LinkedIn search terms monitored by the scraper. Fields: Name, Type (facebook_group | linkedin_term), Value (URL or search term), Active, Priority, Tenant ID.

### 3.6 LinkedIn ICPs table — `tblCu0UiUXKAijGVt`

ICP profiles to monitor. Fields: Name, Profile URL, Job Title, Company, Industry, Active, Source, Notes, Added Date, Last Scraped, Posts Found, Tenant ID.

### 3.7 Business Profile table — `tblxoKaCyy28yzbFE`

Single-record AI scoring config per tenant. Fields: Business Name, Industry, Ideal Client, Problem Solved, Signal Types, Scoring Prompt, CRM Type, CRM API Key, CRM Pipeline ID, Slack Bot Token, Slack Channel ID, Slack Channel Name, CRM Location ID (GHL), Momentum History, Updated At, Tenant ID.

### 3.8 Facebook Keywords table — `tblHPXqKhduxmS0cS`

Pre-filter keywords for Facebook group posts. Fields: Keyword, Category, Active, Tenant ID.

### 3.9 Target Groups table — `tblCCNZNbAmYx9q3O`

Facebook group targets per tenant. Fields: Group Name, Platform, Group URL, Active, Priority, Notes, Tenant ID.
Env var: `AIRTABLE_TARGET_GROUPS_TABLE_ID=tblCCNZNbAmYx9q3O`

---

## 4. Plan tiers and pricing

| Plan | Keywords | ICP Profiles | Scans/day | Comment Credits | Price |
|------|----------|-------------|-----------|-----------------|-------|
| Trial | 3 | 2 | 1 | 10 | Free, 7 days |
| Scout Starter | 3 | 2 | 1 | 30 | $49/mo |
| Scout Pro | 10 | 5 | 2 | Unlimited | $99/mo |
| Scout Agency | 20 | 15 | 2 | Unlimited | $249/mo |
| Owner | Unlimited | Unlimited | Unlimited | Unlimited | Mike's account |
| Complimentary | 10 | 5 | 2 | Unlimited | Gifted (Pro-equivalent) |
| Scout $79 (legacy) | Pro-equivalent | 5 | 2 | Unlimited | Grandfathered |
| Scout $49 (legacy) | 3 | 2 | 1 | 30 | Grandfathered |

Stripe price env vars: `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_AGENCY`

Defined in `dashboard/lib/tier.ts`.

---

## 5. Tenant statuses

| Status | Login | Cron jobs | Description |
|--------|-------|-----------|-------------|
| Active | ✓ | ✓ | Fully operational |
| Suspended | ✗ | ✓ | Manually disabled by admin |
| Archived | ✗ | ✗ | Soft-deleted. Data preserved. archivedAt set. Excluded from ALL crons. Reversible. |
| trial_expired | ✓ (upgrade page only) | ✗ for usage-sync | Trial ended, auto-set by trial-check cron |
| deleted | ✗ | ✗ | Hard-deleted. Cascade wipe complete. Should not appear in tenant list. |

Auth blocks login for: Suspended, Archived, trial_expired, deleted (BLOCKED_STATUSES set in `lib/auth.ts`).

**12-month stale detection:** Archived accounts where `archivedAt` is > 12 months old are surfaced with an amber stale chip in the admin panel. These are cleanup candidates for hard delete.

---

## 6. Cron job system

All crons are secured by `CRON_SECRET` header. Vercel cron schedule is in `vercel.json`.

| Route | Schedule | Purpose | Excludes |
|-------|----------|---------|---------|
| `/api/cron/scan` | Every 4h | LinkedIn/Facebook scrapes for active tenants | Archived, deleted |
| `/api/cron/service-check` | Every 4h | Health flags + customer emails + Slack admin alerts | Archived, deleted, trial_expired |
| `/api/cron/usage-sync` | Hourly | Post count cache + cost estimate | Archived, deleted, trial_expired |
| `/api/cron/trial-check` | Daily | Trial expiration, drip email sequence, sets trial_expired | Archived, deleted |

### Service flag codes

| Code | Severity | Meaning |
|------|----------|---------|
| paid_no_scan_48h | CRITICAL | Active paid account — no successful scan in 48h |
| scan_failed | CRITICAL | Last scan ended with an error |
| trial_billing_mismatch | CRITICAL | Trial expired in Airtable but status not updated |
| trial_expiring_48h | WARNING | Trial ends in < 48h |
| paid_zero_posts | WARNING | Paid account with 0 posts this month |
| trial_no_setup | WARNING | Trial > 24h old, onboarding incomplete |
| scan_stalled | WARNING | Scan Health shows 'scanning' > 30 min |
| paid_no_scan_ever | WARNING | Paid account > 48h old, never scanned |
| nothing_to_scan | WARNING | No ICPs AND no keywords |
| no_icps_configured | INFO | No ICP profiles saved |
| no_keywords | INFO | No keyword sources configured |

Flag emails are sent to customers for: nothing_to_scan, paid_zero_posts, scan_failed, paid_no_scan_48h, trial_no_setup, paid_no_scan_ever. 24h throttle + per-code dedup.

Admin Slack alerts (batched per cron run, not per tenant) for any new CRITICAL flags.

---

## 7. Apify pool system

Scout uses multiple Apify accounts to distribute scraping load and avoid rate limits:

| Pool | Env var | Notes |
|------|---------|-------|
| Default shared | `APIFY_API_TOKEN` | Most tenants |
| Pool 1 | `APIFY_TOKEN_POOL_1` | High-volume tenants |
| Pool 2 | `APIFY_TOKEN_POOL_2` | High-volume tenants |
| Client-owned | Stored in Tenant record `Apify API Key` | Client uses their own account |

Pool assignment is set via `Apify Pool` field (0, 1, 2) or `Apify API Key` for client-owned.

---

## 8. Cascade delete architecture

When hard-deleting a tenant, `lib/cascade-delete.ts` executes in this order:

1. **Stripe cancellation** — cancel active subscription (non-fatal; won't block if Stripe is down)
2. **Shared data tables** (AIRTABLE_PROVISIONING_TOKEN) — delete all rows where Tenant ID matches: Captured Posts, Sources, LinkedIn ICPs, Business Profile, Facebook Keywords, Target Groups
3. **Scan Health** (PLATFORM_AIRTABLE_TOKEN) — delete the tenant's health record
4. **Sub-accounts** (PLATFORM_AIRTABLE_TOKEN) — delete Tenants rows for Is Feed Only=true accounts sharing this Tenant ID (shared data already wiped in step 2)
5. **Tenants row** (PLATFORM_AIRTABLE_TOKEN) — deleted LAST so partial failures leave the record intact and the operation can be retried

Batch size: 10 records per Airtable DELETE request (API limit). Rate-limit pauses: 250ms between batches, 200ms between tables.

Sub-accounts can be deleted independently (pass `deletePrimary=false`) without affecting the primary.

---

## 9. Admin panel features (April 2026 hardening sprint)

### Archive vs. hard delete

| | Archive | Hard Delete |
|-|---------|------------|
| Data | Preserved | Permanently wiped |
| Reversible | Yes (unarchive) | No |
| Login | Blocked | N/A |
| Cron jobs | Excluded | N/A |
| Stripe | Active | Cancelled before wipe |
| archivedAt | Set | N/A |
| Audit log | Yes | Yes |

### Admin Audit Log

Every admin action (archive, unarchive, delete, status change, plan change, password reset, CSM agent action) writes a record to the Admin Audit Log table (non-fatal). Written by `lib/audit-log.ts`.

### Auth hardening

`BLOCKED_STATUSES` in `lib/auth.ts` blocks login for: Suspended, Archived, trial_expired, deleted.
In-memory rate limiter: 5 failed attempts per email / 20 per IP within 15-minute sliding window.

### Duplicate email guard

Both `POST /api/admin/tenants` (create) and `POST /api/admin/grant-access` check if the email already exists before creating, returning 409 if it does.

### Owner protection

Admin accounts (`Is Admin=true`) cannot be deleted or have status changed via the admin UI. Revoke admin access first.

### Self-delete guard

Admins cannot delete their own account (email comparison in DELETE handler).

---

## 10. CSM Agent

### What it is

An AI-powered Customer Success Manager (`claude-opus-4-6`) built into the admin panel. Floating amber button in the bottom-right corner. Gives Mike a conversational interface for portfolio management.

**Route:** `POST /api/admin/csm-agent`
**File:** `dashboard/app/api/admin/csm-agent/route.ts`
**UI component:** `CsmAgentPanel` in `dashboard/app/admin/page.tsx`

### Read capabilities

- Full tenant portfolio (plan, status, trial timeline, service flags, post counts)
- Account health summary across the portfolio
- Trial pipeline status
- Per-tenant deep dives on demand

### Write capabilities (all require Mike's confirmation)

| Action type | What it does |
|-------------|-------------|
| `archive_tenant` | Status=Archived + archivedAt timestamp |
| `unarchive_tenant` | Status=Active + clears archivedAt |
| `update_status` | Active ↔ Suspended |
| `update_plan` | Any valid plan change |
| `send_password_reset` | Generates temp password, updates hash, sends email via Resend |
| `send_reactivation` | Sends reactivation email to trial_expired account (inline logic — not delegated via HTTP) |

### What it cannot do

- Hard delete (use admin UI Delete button — requires cascade modal)
- Create new trial accounts (use admin UI Grant Access form — requires provisioning)
- Act on Is Admin=true accounts
- Execute any write without confirmation

### Confirmation flow

1. Mike types a request
2. Agent returns plain-English description + JSON action block at end of reply
3. Frontend strips JSON block, renders amber confirmation banner
4. Mike clicks Confirm
5. Frontend POSTs `{ confirm: true, pendingAction: <action> }`
6. Server validates action type against whitelist and executes
7. Writes Admin Audit Log entry with `source: 'csm_agent'`
8. Result appears in chat

### Security architecture

- **Admin-only:** `getTenantConfig()` + `isAdmin=true` check on every request
- **Confirmation gate:** server-enforced — cannot be bypassed in system prompt
- **Prompt injection defense:** Tenant data arrives in JSON between `[TENANT_DATA_START count=N]` / `[TENANT_DATA_END]` markers; system prompt instructs Claude to treat this as data, not instructions
- **Action type whitelist:** `executeAction()` switch only handles known action types; unknown types return error
- **No hard delete:** explicitly excluded from agent capabilities by design
- **Audit trail:** every confirmed write logged to Admin Audit Log

### Dependencies

```
lib/audit-log.ts       — audit log writes on confirmed actions
lib/tenant.ts          — getTenantConfig() for admin auth
lib/emails.ts          — buildTrialReactivationEmail()
Anthropic Claude API   — claude-opus-4-6
Resend                 — password reset + reactivation emails
Airtable               — direct PATCH calls for write actions
```

### Required env vars

| Var | Purpose |
|-----|---------|
| `ANTHROPIC_API_KEY` | Claude API access |
| `PLATFORM_AIRTABLE_TOKEN` | Write access to Tenants table |
| `PLATFORM_AIRTABLE_BASE_ID` | Platform base ID |
| `RESEND_API_KEY` | Email delivery |
| `NEXT_PUBLIC_BASE_URL` | Base URL for email links |

### Extending the agent

To add a new write capability:
1. Add the `type` to `executeAction()` switch in `route.ts`
2. Add it to the system prompt's "What you can do" section
3. Add a new `AuditEventType` to `lib/audit-log.ts` if needed
4. Update this README

Keep actions simple: type, tenantRecordId, tenantEmail, payload, summary.

---

## 11. Environment variables (full list)

All set in Vercel project `cb-dashboard` (prj_ST1V7wsPjRbwhnRwIwJ6hJ5z2blK).

| Variable | Purpose |
|----------|---------|
| `NEXTAUTH_URL` | https://scout.clientbloom.ai |
| `NEXTAUTH_SECRET` | JWT signing secret |
| `NEXT_PUBLIC_BASE_URL` | https://scout.clientbloom.ai |
| `PLATFORM_AIRTABLE_TOKEN` | Platform base read/write |
| `PLATFORM_AIRTABLE_BASE_ID` | appZWp7QdPptIOUYB |
| `AIRTABLE_PROVISIONING_TOKEN` | Shared data tables write |
| `AIRTABLE_PROVISIONING_BASE_ID` | appZWp7QdPptIOUYB (defaults in code if not set) |
| `AIRTABLE_BASE_ID` | Legacy single-tenant base ID |
| `AIRTABLE_API_TOKEN` | Legacy single-tenant token |
| `AIRTABLE_POSTS_TABLE` | Legacy posts table reference |
| `AIRTABLE_TARGET_GROUPS_TABLE_ID` | tblCCNZNbAmYx9q3O |
| `ANTHROPIC_API_KEY` | Claude API (scoring + CSM agent) |
| `APIFY_API_TOKEN` | Default shared Apify pool |
| `APIFY_TOKEN_POOL_1` | Apify Pool 1 |
| `APIFY_TOKEN_POOL_2` | Apify Pool 2 |
| `APIFY_WEBHOOK_SECRET` | Validates async Apify webhook callbacks |
| `STRIPE_SECRET_KEY` | Stripe test key |
| `STRIPE_SECRET_KEY_LIVE` | Stripe live key |
| `STRIPE_PRICE_ID` | Legacy single price ID |
| `STRIPE_PRICE_ID_LIVE` | Legacy live price ID |
| `STRIPE_PRICE_STARTER` | Scout Starter price ID |
| `STRIPE_PRICE_PRO` | Scout Pro price ID |
| `STRIPE_PRICE_AGENCY` | Scout Agency price ID |
| `STRIPE_WEBHOOK_SECRET` | Test webhook validation |
| `STRIPE_WEBHOOK_SECRET_LIVE` | Live webhook validation |
| `RESEND_API_KEY` | Transactional email delivery |
| `RESEND_FROM_EMAIL` | From address |
| `CRON_SECRET` | Secures all cron endpoints (no trailing newline — causes 401) |
| `ADMIN_EMAIL` | Legacy single-tenant admin email |
| `ADMIN_PASSWORD` | Legacy single-tenant admin password |
| `SLACK_WEBHOOK_URL` | Admin alerts → #clientbloom-support |

---

## 12. Key API routes

### Admin routes (all require isAdmin=true)

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/admin/tenants` | List all tenants |
| POST | `/api/admin/tenants` | Create tenant (duplicate email guard) |
| PATCH | `/api/admin/tenants` | Update tenant; action=archive\|unarchive for soft-delete |
| DELETE | `/api/admin/tenants` | Cascade hard delete (Stripe cancel → shared data → Scan Health → sub-accounts → Tenants row) |
| POST | `/api/admin/grant-access` | Create provisioned trial account (Tenant ID + welcome email) |
| POST | `/api/admin/send-reactivation` | Send reactivation email + record timestamp |
| POST | `/api/admin/send-reset` | Send password reset email |
| GET | `/api/admin/usage` | Tenant usage data with Scan Health |
| GET | `/api/admin/stripe-stats` | MRR, ARR, revenue chart from Stripe |
| POST | `/api/admin/csm-agent` | CSM Agent (see section 10) |

### Tenant routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/tenant` | Fetch caller's tenant config |
| PATCH | `/api/tenant` | Update tenant settings |
| GET | `/api/posts` | Fetch captured posts (paginated, filtered) |
| POST | `/api/posts/[id]/suggest` | AI comment suggestion (increments Suggestions Used) |
| POST | `/api/trigger-scan` | Manual scan trigger |
| GET | `/api/scan-status` | Poll scan status from Scan Health |
| POST | `/api/linkedin-icps/discover` | ICP discovery (cooldown enforced) |
| GET/POST | `/api/billing/status` | Stripe subscription status |
| POST | `/api/unsubscribe` | Email opt-out |

### Cron routes (CRON_SECRET required)

| Route | Schedule |
|-------|----------|
| `/api/cron/scan` | Every 4h |
| `/api/cron/service-check` | Every 4h |
| `/api/cron/usage-sync` | Hourly |
| `/api/cron/trial-check` | Daily |

---

## 13. Deployment and rollback

### Deploying

Pushes to `main` auto-deploy to production via GitHub → Vercel integration (connected 2026-04-03).

To manually trigger a deploy:
```bash
curl -X POST "https://api.vercel.com/v13/deployments" \
  -H "Authorization: Bearer <VERCEL_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"gitSource":{"type":"github","repoId":"<REPO_ID>","ref":"main"},"forceNew":1}'
```

### Rollback

**Vercel instant rollback:** Go to Vercel dashboard → Deployments → click "..." on a previous deployment → "Promote to Production". Zero downtime. This is the fastest option.

**Git rollback (creates new commits, no force-push needed):**
```bash
git revert <commit-hash>  # creates a revert commit
git push origin main      # auto-deploys the revert
```

**Current rollback checkpoint:**
- `main` before admin hardening: commit `e4f5191`
- Admin hardening commits: `ceb7580` (feat), `bc9e4b8` (fix — 4 stress-test bugs)

---

## 14. Memory and context continuity (Mem0)

All architectural decisions are stored in Mem0 under `userId: "mike-walker"`. When a development session starts or context is lost, the Cowork assistant searches Mem0 for relevant context before continuing work.

Key memory topics stored:
- Airtable base IDs, table IDs, and field schemas
- Vercel project ID and deployment token
- Sprint decisions (admin hardening, cascade delete, Apify pool system, service-check cron, auth hardening)
- Plan tiers and pricing
- Stripe price IDs
- Bug fixes and architectural decisions made across sessions

When adding significant new features, always add a memory with: what was built, key architectural decisions, file locations, and any non-obvious design choices. This is how context survives across sessions.

---

## 15. Developer handoff guide

If you're inheriting this codebase:

1. **Auth** — `dashboard/lib/auth.ts`. Multi-tenant credentials provider. `PLATFORM_AIRTABLE_TOKEN` required. Falls back to single-tenant `ADMIN_EMAIL/ADMIN_PASSWORD` if platform vars not set.

2. **Tenant isolation** — Every shared table has a `Tenant ID` field (UUID). All queries filter by this. Never return data across tenants.

3. **Two Airtable tokens** — `PLATFORM_AIRTABLE_TOKEN` for Tenants/Scan Health/Audit Log. `AIRTABLE_PROVISIONING_TOKEN` for everything else. Don't mix them.

4. **Cascade delete** — `dashboard/lib/cascade-delete.ts`. Tenants row is always deleted LAST for safe retries. Stripe before Airtable.

5. **Audit log** — `dashboard/lib/audit-log.ts`. Non-fatal. Never throws. Always call it after admin mutations.

6. **CSM Agent** — `dashboard/app/api/admin/csm-agent/route.ts`. Admin-only. Confirmation before any write. See section 10. Do NOT add hard delete capability without explicit product approval.

7. **Cron security** — All crons validate `Authorization: Bearer ${CRON_SECRET}`. No trailing newline on `CRON_SECRET` (causes 401). Set in Vercel env vars.

8. **TypeScript** — Strict mode. Run `npx tsc --noEmit` before committing. Never bypass type errors.

9. **Airtable rate limits** — `lib/airtable.ts` has `airtableFetch()` with exponential backoff (RETRY_MAX=3, RETRY_BASE_MS=1000, RETRY_CAP_MS=10000, ±20% jitter). Use it for all Airtable calls.

10. **Behavior rules** — Always confirm with Mike before: deleting Airtable records, changing Stripe pricing/webhooks, adding env vars, making architectural changes that affect paying customers.

---

## 16. Documentation index

| File | Purpose |
|------|---------|
| `docs/csm-agent-readme.md` | This file — full platform bible |
| `docs/admin-panel.md` | Admin panel feature reference |
| `docs/copy-strategy.md` | Audience, ICP terminology, FAQ, trial standards |
| `docs/scan-health-and-watchdog.md` | Scan state machine and reliability system |
| `docs/airtable-rate-limit-resilience.md` | Rate limit handling architecture |
| `docs/linkedin-keyword-search.md` | LinkedIn keyword search feature spec |
| `dashboard/CLAUDE.md` | Development guidelines for AI assistants |
