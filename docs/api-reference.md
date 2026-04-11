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
| `/api/scan-status` | GET | Session | Current scan status for the tenant from Scan Health table. Now includes `lastScanBreakdown` (see below). |
| `/api/posts` | GET | Session | List captured posts. Query: `?page=&limit=&status=`. Scoped to tenant. |
| `/api/posts/[id]` | GET | Session | Get single post. Verifies tenant ownership. |
| `/api/posts/[id]` | PATCH | Session | Update post fields (e.g. `status`). Verifies tenant ownership. |
| `/api/posts/[id]/suggest` | POST | Session | Generate a ready-to-paste LinkedIn comment for a post via Claude. Uses system prompt with hard behavioral rules (no em dashes, no AI-isms, first-person, 2-3 sentences). Checks `commentCredits` limit. Returns `{ commentApproach, creditsUsed, creditsLimit }`. |
| `/api/posts/bulk` | POST | Session | Bulk skip / archive / restore multiple posts in one call. See full spec below. |
| `/api/inbox-agent` | POST | Session | Conversational AI inbox assistant (Scout Agent — inbox). Interprets natural language into inbox management actions. See full spec below. |
| `/api/settings-agent` | POST | Session | Conversational AI settings guide (Scout Agent — settings). Advisory only; no action execution. See full spec below. |
| `/api/engagement-history` | GET | Session | List engagement history records for the tenant. |
| `/api/stats` | GET | Session | Scan stats (post count, last scan time, next scan window). |
| `/api/generate-prompt` | POST | Session | Generate a custom AI scoring prompt from business profile. |

---

### POST /api/posts/bulk

Bulk action endpoint for the inbox management system. Applies a single action to multiple posts in one request.

**Request body:**
```json
{
  "action": "skip" | "archive" | "restore",
  "recordIds": ["recXXX", "recYYY"],
  "filter": {
    "maxScore": 5,
    "currentAction": "New"
  }
}
```

Provide either `recordIds` (explicit list) or `filter` (server-side lookup), not both. Maximum 500 IDs per call.

**Action → Airtable field mapping:**

| Action | Effect |
|--------|--------|
| `skip` | `Action = 'Skipped'`, `Engagement Status = ''` |
| `archive` | `Engagement Status = 'archived'` |
| `restore` | `Action = 'New'`, `Engagement Status = ''` |

**Response:**
```json
{ "ok": true, "affected": 47, "errors": 0 }
```

**Notes:**
- Airtable PATCH is chunked at 10 records per batch (Airtable API limit)
- Filter mode always includes `tenantId` in the Airtable formula for tenant isolation
- For large inboxes (>50 posts), prefer `filter` mode over explicit `recordIds`
- `affected` = number successfully updated; `errors` = number of failed Airtable batches

---

### POST /api/inbox-agent

Conversational AI inbox assistant. Interprets a natural-language message into a structured action the frontend can execute via `/api/posts/bulk`.

**Request body:**
```json
{
  "message": "Skip everything below score 5",
  "context": {
    "inboxCount": 148,
    "skippedCount": 52,
    "topPosts": [
      { "id": "recXXX", "author": "Jane Smith", "score": 9, "text": "We're struggling with..." }
    ],
    "scoreDistribution": { "high": 12, "mid": 28, "low": 108 }
  },
  "history": [
    { "role": "user", "content": "What should I engage with?" },
    { "role": "assistant", "content": "Top 3 posts to engage..." }
  ]
}
```

`history` is optional; capped at last 6 turns internally.

**Response:**
```json
{
  "reply": "You have 108 low-score posts. Want me to skip everything below score 6?",
  "action": {
    "type": "bulk_skip",
    "filter": { "maxScore": 5, "currentAction": "New" },
    "confirm": true,
    "summary": "Skip 108 posts with score ≤ 5 in your inbox"
  }
}
```

**Action types:**

| Type | Description |
|------|-------------|
| `bulk_skip` | Skip posts matching filter |
| `bulk_archive` | Archive posts matching filter |
| `bulk_restore` | Restore skipped posts to inbox |
| `set_min_score` | Client-side score filter (no Airtable write) |
| `none` | Conversational reply only |

`confirm: true` means the frontend should show a confirmation dialog before executing. `confirm: false` is safe to auto-execute.

---

---

### POST /api/settings-agent

Conversational AI settings guide. Advisory only — returns a plain text reply. Never executes actions or modifies data.

**Request body:**
```json
{
  "message": "How do I connect Slack?",
  "context": {
    "plan": "Trial",
    "activeTab": "system",
    "businessProfileComplete": false,
    "businessName": "Acme Corp",
    "industry": "B2B SaaS",
    "keywordCount": 3,
    "icpCount": 0,
    "hasCustomPrompt": false,
    "hasSlack": false,
    "hasCrm": false
  },
  "history": [
    { "role": "assistant", "content": "You haven't connected Slack yet..." },
    { "role": "user", "content": "How do I connect Slack?" }
  ]
}
```

`context` is required. `history` is optional; capped at last 6 turns internally.

**Context fields:**

| Field | Type | Description |
|-------|------|-------------|
| `plan` | string | User's current plan (`'Trial'`, `'Starter'`, `'Scout Pro'`, `'Scout Agency'`) |
| `activeTab` | string | The settings tab currently visible (`'profile'`, `'linkedin'`, `'ai'`, `'system'`, `'billing'`, `'account'`, `'team'`) |
| `businessProfileComplete` | boolean | Whether Business Name + Industry + Ideal Client are all filled in |
| `businessName` | string | From Business Profile table |
| `industry` | string | From Business Profile table |
| `keywordCount` | number | Number of active keyword sources |
| `icpCount` | number | Number of profiles in the ICP pool |
| `hasCustomPrompt` | boolean | Whether the tenant has a non-empty Scoring Prompt |
| `hasSlack` | boolean | Whether a Slack Bot Token is saved |
| `hasCrm` | boolean | Whether a GHL CRM API key is saved (Agency plan only) |

**Response:**
```json
{
  "reply": "To connect Slack, go to System in your settings. You'll need a Slack Bot Token — here's how to create one..."
}
```

The `reply` field is the only output. No `action` field is returned. The frontend appends the reply directly to the conversation thread.

**Constraints:**
- `message` max 1000 characters (server returns `400` if exceeded)
- `history` entries with invalid roles are dropped silently
- Max 512 output tokens (Haiku) — answers are concise by design
- `maxDuration: 30` (Vercel Fluid Compute)

**What the agent knows:**
The agent's system prompt contains the complete settings knowledge base: every field in every settings tab, plan limits, what each feature does, how to set up Slack and CRM, how scoring works, what ICP Pool and Discover ICPs do, trial vs paid plan differences, upgrade paths, and support contact. Full details: [`scout-agent.md`](./scout-agent.md) → "Settings Agent" section.

**Proactive coaching:**
The UI generates a tab-aware opening message client-side (`buildSettingsOpening()` in `settings/page.tsx`) — no extra API call. The agent is called only when the user types a message.

---

### GET /api/scan-status — `lastScanBreakdown`

When the last scan found 0 new posts (normal in mature accounts), `lastScanBreakdown` explains why:

```json
{
  "lastScanAt": "2026-04-10T13:01:00.000Z",
  "lastScanStatus": "success",
  "lastPostsFound": 0,
  "lastScanBreakdown": {
    "fetched": 47,
    "ageFiltered": 12,
    "deduped": 31,
    "newToScore": 4,
    "belowThreshold": 4
  }
}
```

`fetched` = total posts Apify returned; `ageFiltered` = too old (>7 days); `deduped` = already in the tenant's database; `newToScore` = sent to Claude for scoring; `belowThreshold` = scored but below the save threshold (score < 5).

This breakdown is stored in the Airtable `Last Error` field as a JSON string when `postsFound = 0` and there is no actual error. `scan-health.ts` detects JSON by checking if the string starts with `{` and parses it into `lastScanBreakdown`, setting `lastError` to `null` in that case.

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
| `/api/cron/service-check` | Every 4 hours :00 | CRON_SECRET | Service Manager: evaluates health rules for every tenant; writes `Service Flags` + `Service Checked At` to Airtable; sends customer alert emails for new actionable flags; posts batched Slack alert to `#clientbloom-support` for new critical flags. See [service-manager.md](./service-manager.md) for full flag reference and [usage-service-manager.md](./usage-service-manager.md) for notification details. |
| `/api/cron/admin-digest` | 17:00 daily (9 AM PT) | CRON_SECRET | Daily admin Slack digest: lists accounts that still have active service flags 72+ hours after their initial alert email — these need personal admin outreach. Posts "all clear" to `#clientbloom-support` when no accounts are lingering. Requires `SLACK_WEBHOOK_URL`. |

**Testing cron routes locally:**
```bash
curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/scan
```

**`service-check` response shape:**

```json
{
  "ok": true,
  "checkedAt": "2026-04-10T12:00:00.000Z",
  "total": 42,
  "flagged": 3,
  "emailed": 1,
  "slackAlerts": 2,
  "errors": 0,
  "results": [
    { "id": "rec...", "email": "user@co.com", "flags": 2, "emailedCodes": ["scan_failed"] },
    { "id": "rec...", "email": "other@co.com", "flags": 0, "emailedCodes": [] }
  ]
}
```

`emailed`: number of tenants where an email was sent in this run (dedup-blocked = 0, new codes found = increments by 1 per tenant that received an email).
`slackAlerts`: number of tenants that had new critical flags and contributed to the Slack batch message.
`emailedCodes`: flag codes actually emailed to this tenant in this run. Empty array means dedup blocked the send or there were no eligible flags.

Requires `SLACK_WEBHOOK_URL` env var for Slack alerts. If unset, Slack is silently skipped and `slackAlerts` will always be 0.

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
