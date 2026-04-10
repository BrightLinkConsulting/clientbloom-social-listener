# Scout by ClientBloom

**AI-powered LinkedIn relationship intelligence for B2B sales teams.**

Scout monitors LinkedIn for high-value conversations — posts from your ICP profiles and tracked keywords — scores them with Claude, and delivers a daily digest to Slack so your team can engage the right people before your competitors do.

---

## Documentation

**Start here → [`docs/README.md`](./docs/README.md)**

The `docs/` folder is the complete developer knowledge base. It covers architecture, authentication, billing, email, scanning, and every API route.

| Document | What it covers |
|----------|----------------|
| [`docs/README.md`](./docs/README.md) | Documentation index — start here |
| [`docs/architecture-overview.md`](./docs/architecture-overview.md) | System map, request lifecycle, data flow |
| [`docs/auth-and-sessions.md`](./docs/auth-and-sessions.md) | NextAuth, JWT, session refresh, rate limiting |
| [`docs/admin-panel.md`](./docs/admin-panel.md) | Super admin panel — tenant management, trial grants |
| [`docs/api-reference.md`](./docs/api-reference.md) | Every API route, auth requirements, params |
| [`docs/stripe-billing.md`](./docs/stripe-billing.md) | Checkout flow, webhook handler, cancellation |
| [`docs/email-system.md`](./docs/email-system.md) | Centralized email templates, brand constants, CAN-SPAM |
| [`docs/scan-health-and-watchdog.md`](./docs/scan-health-and-watchdog.md) | Scan state machine, watchdog, stuck-scan detection |
| [`docs/linkedin-icp-pool.md`](./docs/linkedin-icp-pool.md) | Two-layer ICP model (poolSize vs scanSlots) |
| [`docs/linkedin-keyword-search.md`](./docs/linkedin-keyword-search.md) | Keyword source management, Apify actor, deduplication |
| [`docs/airtable-rate-limit-resilience.md`](./docs/airtable-rate-limit-resilience.md) | Rate-limit math, retry strategy, jitter |
| [`docs/v2-roadmap.md`](./docs/v2-roadmap.md) | Planned v2 features |
| [`SETUP.md`](./SETUP.md) | Local dev setup, environment variables, deploy to Vercel |

---

## What it does

- **LinkedIn scanning** — monitors ICP profile posts and keyword-matched conversations via Apify
- **AI scoring** — Claude scores each post 1–10 for relationship-building conversation value
- **Daily digest** — top-scoring posts delivered to Slack every morning with suggested comment angles
- **Multi-tenant** — fully isolated per-customer data via shared Airtable base + Tenant ID row filtering
- **Billing** — Stripe Checkout + webhooks with three paid tiers and a 7-day no-credit-card trial

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router), TypeScript strict mode |
| Auth | NextAuth.js v4, JWT strategy, bcryptjs (12 rounds) |
| Database | Airtable (multi-tenant, shared base) |
| Scraping | Apify (LinkedIn only — 2 actors) |
| AI | Anthropic Claude (`claude-haiku-4-5-20251001`) |
| Email | Resend |
| Billing | Stripe (Checkout + webhooks) |
| Deployment | Vercel (Fluid Compute, cron via `vercel.json`) |

---

## Repository structure

```
clientbloom-social-listener/
├── docs/                       # Developer documentation (start here)
│   ├── README.md               # Documentation index
│   ├── architecture-overview.md
│   ├── auth-and-sessions.md
│   ├── admin-panel.md
│   ├── api-reference.md
│   ├── stripe-billing.md
│   ├── email-system.md
│   ├── scan-health-and-watchdog.md
│   ├── linkedin-icp-pool.md
│   ├── linkedin-keyword-search.md
│   ├── airtable-rate-limit-resilience.md
│   └── v2-roadmap.md
├── dashboard/                  # All application code
│   ├── app/
│   │   ├── api/                # API routes (Next.js App Router)
│   │   │   ├── auth/           # Login, forgot/reset password
│   │   │   ├── cron/           # Scheduled jobs (scan, digest, usage-sync, etc.)
│   │   │   ├── admin/          # Super admin routes (isAdmin gate)
│   │   │   ├── billing/        # Stripe checkout, portal, cancel, status
│   │   │   └── webhooks/       # Stripe webhook handler
│   │   ├── (auth pages)        # sign-in, sign-up, onboarding, settings, etc.
│   │   └── layout.tsx
│   ├── lib/
│   │   ├── airtable.ts         # Shared Airtable helpers + IDOR guards + retry wrapper
│   │   ├── auth.ts             # NextAuth configuration + rate limiting
│   │   ├── tenant.ts           # getTenantConfig() — auth entry point for all routes
│   │   ├── tier.ts             # Plan limits, isPaidPlan(), isStripeBilledPlan(), planFromPriceId()
│   │   ├── emails.ts           # All email templates — centralized, no inline HTML in routes
│   │   ├── scan.ts             # Core scan + scoring logic
│   │   ├── scan-health.ts      # Per-tenant scan health tracking
│   │   ├── digest.ts           # Daily Slack digest builder
│   │   ├── provision.ts        # New tenant provisioning (Tenant ID generation)
│   │   ├── slack.ts            # Slack webhook delivery
│   │   └── notify.ts           # Resend email helpers
│   ├── components/             # Shared UI components
│   ├── middleware.ts            # Auth-based route protection
│   └── vercel.json             # Cron job schedule (9 jobs)
├── CLAUDE.md                   # Engineering standards + session rules for AI-assisted dev
├── SETUP.md                    # Developer setup guide
└── README.md                   # This file
```

---

## Plans and limits

| Plan | Keywords | ICP Pool | Scan Slots/Run | Scans/Day | Comment Credits |
|------|----------|----------|----------------|-----------|----------------|
| Trial (7-day) | 3 | 10 profiles | 3 | 1 | 10 total |
| Scout Starter | 3 | 50 profiles | 10 | 1 | 30/mo |
| Scout Pro | 10 | 150 profiles | 25 | 2 | Unlimited |
| Scout Agency | 20 | 500 profiles | 50 | 2 | Unlimited |
| Owner (internal) | Unlimited | Unlimited | Unlimited | 2 | Unlimited |

All limits are defined in `lib/tier.ts` via `getTierLimits(plan)` — the single source of truth. Never hardcode limit values anywhere else.

**ICP two-layer model:** pool size = total profiles that can be saved (storage cap). Scan slots = profiles actually fetched from Apify per scan run (cost driver). See [`docs/linkedin-icp-pool.md`](./docs/linkedin-icp-pool.md).

---

## Security model

**Tenant isolation** — All Airtable queries use `tenantFilter(tenantId)` to scope to the authenticated tenant. Every write that accepts a record ID from user input calls `verifyRecordTenant()` to prevent IDOR attacks.

**Formula injection** — All user values inserted into Airtable formula strings pass through `escapeAirtableString()` which escapes `\` and `'`.

**Auth brute-force protection** — Login has per-IP and per-email sliding-window rate limiting (in-memory, 15-minute window).

**Cron protection** — All cron routes fail-closed: they verify `Authorization: Bearer <CRON_SECRET>` before any execution. The check is always the first line of the handler.

**Stripe webhooks** — Verified via `Stripe.webhooks.constructEvent` with `STRIPE_WEBHOOK_SECRET`. Handler rejects any request that fails signature verification.

**Trial expiry** — Enforced server-side on every scan request. Expired trial sessions cannot trigger scans regardless of whether their session cookie is still valid.

**Email HTML** — All email templates live in `lib/emails.ts`. Route files never contain inline HTML. This ensures consistent brand, CAN-SPAM compliance, and a single place to audit email content.

---

## Getting started

See [`SETUP.md`](./SETUP.md) for full local setup and production deployment instructions.

---

## Key invariants

These are non-negotiable across the entire codebase:

```
All Airtable reads       → tenantFilter(tenantId)
All Airtable writes      → verifyRecordTenant() before using user-supplied record IDs
All cron routes          → CRON_SECRET check first, before any business logic
All plan limits          → getTierLimits(plan) from lib/tier.ts
All email templates      → lib/emails.ts — never inline HTML in route files
All formula user values  → escapeAirtableString() before inserting into filterByFormula
Created At timestamps    → new Date().toISOString() — never date-only .split('T')[0]
```

---

## Codebase conventions

- `lib/tenant.ts` — call `getTenantConfig()` at the top of every authenticated route; return `tenantError()` immediately on null
- `lib/tier.ts` — import `getTierLimits(plan)` for any plan-based gate; `isPaidPlan()` for feature access; `isStripeBilledPlan()` for billing UI
- `lib/airtable.ts` — use `airtableList`, `airtableCreate`, `airtableUpdate`, `airtableDelete` helpers; never build raw Airtable URLs in route files
- `lib/emails.ts` — import builder functions; never write HTML strings in route files
- Cron routes: `CRON_SECRET` check must be the first statement in the handler
- Every `any` cast must have an inline justification comment

---

*Built by BrightLink Consulting for ClientBloom.ai*
*Contact: Mike Walker — twp1996@gmail.com*
