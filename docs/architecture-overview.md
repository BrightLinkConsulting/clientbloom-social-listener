# Scout — Architecture Overview

## Last updated: April 2026

---

## 1. What Scout does

Scout monitors LinkedIn for high-value conversations — posts from saved ICP profiles and keyword-matched searches — scores each post with Claude AI, and delivers a daily Slack digest so sales teams engage before competitors do.

---

## 2. System map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  External services                                                           │
│  ┌────────┐  ┌─────────┐  ┌──────────────┐  ┌────────┐  ┌───────────────┐ │
│  │ Apify  │  │ Claude  │  │   Airtable   │  │ Stripe │  │    Resend     │ │
│  │        │  │ (Haiku) │  │  (database)  │  │        │  │    (email)    │ │
│  └────────┘  └─────────┘  └──────────────┘  └────────┘  └───────────────┘ │
└──────┬────────────┬───────────────┬──────────────┬──────────────┬──────────┘
       │            │               │              │              │
┌──────▼────────────▼───────────────▼──────────────▼──────────────▼──────────┐
│  Vercel (Next.js 14 App Router — scout.clientbloom.ai)                       │
│                                                                              │
│  Pages (SSR)              API Routes                  Cron Jobs             │
│  ─────────────            ──────────────────────      ────────────────────  │
│  /                 ◄──    /api/auth/*                 /api/cron/scan        │
│  /sign-in          ◄──    /api/admin/*     (isAdmin)  /api/cron/scan-retry  │
│  /sign-up          ◄──    /api/billing/*              /api/cron/digest      │
│  /onboarding       ◄──    /api/sources                /api/cron/usage-sync  │
│  /dashboard        ◄──    /api/linkedin-icps          /api/cron/trial-check │
│  /settings         ◄──    /api/posts                  /api/cron/scan-watchd │
│  /upgrade          ◄──    /api/trigger-scan           /api/cron/archive-pos │
│  /welcome          ◄──    /api/webhooks/stripe                              │
│  /admin            ◄──    /api/trial/start                                  │
│                           /api/health                                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Database — Airtable

Scout uses **one shared Airtable base** for all tenant data. Row-level isolation is enforced by a `Tenant ID` field present on every table.

### Tables

| Table | Purpose | Key fields |
|-------|---------|-----------|
| `Tenants` | One record per customer account | Tenant ID, Email, Password Hash, Plan, Status, Trial Ends At, Is Admin, Is Feed Only |
| `Captured Posts` | Scored LinkedIn posts | Tenant ID, Post URL, Score, Comment Approach, Source Type, Captured At |
| `Sources` | Keyword search terms | Tenant ID, Keyword |
| `LinkedIn ICPs` | ICP profiles to monitor | Tenant ID, Profile URL, Pool slot, Added Date |
| `Business Profile` | Company info + custom AI scoring prompt | Tenant ID, Company Name, Custom Prompt |
| `Scan Health` | Per-tenant scan status | Tenant ID, Last Scan At, Last Scan Status, Last Error |
| `CRM Settings` | GoHighLevel webhook config | Tenant ID, Webhook URL |

### Why shared base

All tenant data is in one Airtable base — not one base per tenant. This keeps Airtable costs linear and makes cross-tenant admin operations possible without API key proliferation. The trade-off is strict enforcement of tenant isolation at the query layer.

### Tenant isolation (critical)

```typescript
// EVERY Airtable read must include this filter
tenantFilter(tenantId)   // from lib/airtable.ts
// → AND({Tenant ID}='t_a3f8c2d9')

// EVERY write that accepts a record ID from user input must verify ownership
verifyRecordTenant(recordId, tenantId, tableName)
// → fetches record, checks Tenant ID matches — returns 404 if not
```

These two guards prevent IDOR attacks. Never skip them.

---

## 4. Authentication flow

```
POST /api/auth/signin (NextAuth CredentialsProvider)
  │
  ├── Rate limit check (in-memory, per-IP + per-email)
  │
  ├── Airtable query: find Tenants record by Email
  │     PLATFORM_AIRTABLE_TOKEN + PLATFORM_AIRTABLE_BASE_ID
  │
  ├── bcrypt.compare(password, record['Password Hash'])
  │
  └── On success → JWT payload:
        { tenantId, email, plan, trialEndsAt, isAdmin, isFeedOnly,
          airtableToken, airtableBaseId, onboarded }

JWT is HttpOnly cookie, 24h expiry, signed with NEXTAUTH_SECRET.
```

Full details: [`auth-and-sessions.md`](./auth-and-sessions.md)

---

## 5. Request lifecycle — authenticated API route

```
Request → middleware.ts
  │
  ├── Public route? (see matcher in middleware.ts) → pass through
  │
  └── Protected route?
        │
        └── No valid JWT? → 302 redirect to /sign-in
              │
              └── Valid JWT → route handler
                    │
                    ├── getTenantConfig()  → reads session, returns TenantConfig
                    │                         (returns null if no session)
                    │
                    ├── tenantFilter(tenantId) on all Airtable reads
                    │
                    ├── getTierLimits(plan) for any plan-based gate
                    │
                    └── verifyRecordTenant() before any write with user-supplied ID
```

---

## 6. Scan pipeline

The scan pipeline runs on two Vercel Cron triggers (1:00 AM and 1:00 PM UTC) and has these stages:

```
/api/cron/scan  (orchestrator)
  │
  ├── Verify CRON_SECRET
  ├── Fetch all Active tenants from Airtable
  ├── Filter: skip tenants that scanned within last 12h (Starter/Trial: 1/day)
  ├── Stagger dispatch: random 0–5s jitter per tenant to desync Airtable calls
  │
  └── For each eligible tenant → POST /api/cron/scan-tenant?tenantId=…
        │
        ├── Fetch tenant config + limits from Airtable
        ├── Fetch Sources (keyword terms)
        ├── Fetch LinkedIn ICPs (prioritized: posts found DESC → date DESC)
        │
        ├── Apify actor: harvestapi/linkedin-profile-posts (ICP scan)
        ├── Apify actor: apimaestro/linkedin-posts-search-scraper (keyword scan)
        │
        ├── Deduplicate against existing Captured Posts (30-day window)
        ├── Score new posts with Claude Haiku (1–10, with comment angle)
        │
        └── Batch-write to Airtable Captured Posts
              (airtableBatchCreate with individual fallback on rate limit)

/api/cron/scan-watchdog  (every 30 min)
  └── Find tenants stuck in 'scanning' for > 20 min → reset to 'success'

/api/cron/scan-retry  (20 min after main scan)
  └── Retry tenants that errored in the main scan window
```

---

## 7. Trial lifecycle

```
User signs up at /sign-up
  └── POST /api/trial/start
        ├── Create Tenants record (plan='Trial', trialEndsAt=now+7days)
        ├── provisionNewTenant() → generate Tenant ID
        └── Send Day 1 welcome email (lib/emails.ts → buildTrialDay1Email)

During trial (days 1–7):
  └── /api/cron/trial-check (every 6h)
        ├── Find Trial tenants whose Trial Email Day < today's day number
        └── Send drip email for that day (Days 2–7)

Trial expires:
  └── /api/cron/trial-check
        ├── Set Status='trial_expired' in Airtable
        └── User sees upgrade wall on next page load

Admin-granted trial:
  └── POST /api/admin/grant-access (isAdmin required)
        ├── Create Tenants record (plan='Trial', trialEndsAt=now+7days)
        ├── Generate temp password + bcrypt hash
        ├── Send custom welcome email (lib/emails.ts → buildGrantAccessEmail)
        └── User receives credentials and trial expiry date
```

---

## 8. Billing flow

```
User clicks "Upgrade"
  └── GET /api/billing/upgrade?tier=starter|pro|agency
        ├── Auth check
        ├── Guard: active subscriber → redirect to Billing Portal (no duplicate sub)
        └── stripe.checkout.sessions.create → redirect to Stripe hosted page

Stripe webhook fires (payment confirmed):
  └── POST /api/webhooks/stripe
        ├── constructEvent() — verify STRIPE_WEBHOOK_SECRET signature
        ├── customer.subscription.created / updated:
        │     planFromPriceId(priceId) → plan name
        │     Update Airtable: plan, status='Active', trialEndsAt=null
        └── customer.subscription.deleted:
              Update Airtable: plan='Trial', status='trial_expired'
```

Full details: [`stripe-billing.md`](./stripe-billing.md)

---

## 9. Key libraries

| Library | File | Role |
|---------|------|------|
| `airtableFetch` | `lib/airtable.ts` | Fetch wrapper with exponential-backoff retry on 429/5xx |
| `escapeAirtableString` | `lib/airtable.ts` | Formula injection prevention |
| `tenantFilter` | `lib/airtable.ts` | Row-level isolation for all Airtable reads |
| `verifyRecordTenant` | `lib/airtable.ts` | IDOR prevention for writes |
| `getTenantConfig` | `lib/tenant.ts` | Auth entry point for API routes |
| `getTierLimits` | `lib/tier.ts` | Single source of truth for plan limits |
| `isPaidPlan` | `lib/tier.ts` | Feature-access gate (includes Owner + Complimentary) |
| `isStripeBilledPlan` | `lib/tier.ts` | Billing UI gate (excludes Owner + Complimentary) |
| `planFromPriceId` | `lib/tier.ts` | Stripe price ID → plan name mapping |
| `provisionNewTenant` | `lib/provision.ts` | Tenant ID generation on new account creation |
| `buildTrialDay1Email` etc. | `lib/emails.ts` | All email templates — never write inline HTML |

---

## 10. Environment variables

All env vars are documented with descriptions in `dashboard/.env.example`.

**Critical — production fails without these:**
- `STRIPE_WEBHOOK_SECRET`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `CRON_SECRET`
- `PLATFORM_AIRTABLE_TOKEN`
- `PLATFORM_AIRTABLE_BASE_ID`

**Stripe price IDs (all three required for billing to work):**
- `STRIPE_PRICE_STARTER` → $49/mo
- `STRIPE_PRICE_PRO` → $99/mo
- `STRIPE_PRICE_AGENCY` → $249/mo

---

## 11. Deployment

- **Host:** Vercel (Fluid Compute)
- **Auto-deploy:** every push to `main` triggers a production deploy
- **Cron:** defined in `dashboard/vercel.json` — Vercel manages scheduling
- **No build step needed** for content-only changes (docs, CLAUDE.md)

The production URL is `https://scout.clientbloom.ai`. The `NEXTAUTH_URL` env var must match this exactly.

---

*See [`docs/README.md`](./README.md) for the full documentation index.*
