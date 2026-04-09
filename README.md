# Scout by ClientBloom

**AI-powered LinkedIn relationship intelligence for B2B sales teams.**

Scout monitors LinkedIn for high-value conversations — posts from your ICP profiles and tracked keywords — scores them with Claude, and delivers a daily digest to Slack so your team can engage the right people before your competitors do.

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
|---|---|
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
├── dashboard/                  # All application code
│   ├── app/
│   │   ├── api/                # API routes (Next.js App Router)
│   │   │   ├── auth/           # Login, forgot/reset password
│   │   │   ├── cron/           # Scheduled jobs (scan, digest, usage-sync, etc.)
│   │   │   ├── admin/          # Internal admin routes (IsAdmin gate)
│   │   │   └── webhooks/       # Stripe webhook handler
│   │   ├── (auth pages)        # sign-in, sign-up, onboarding, settings, etc.
│   │   └── layout.tsx
│   ├── lib/
│   │   ├── airtable.ts         # Shared Airtable helpers + IDOR guards
│   │   ├── auth.ts             # NextAuth configuration + rate limiting
│   │   ├── tenant.ts           # getTenantConfig() — auth entry point for all routes
│   │   ├── tier.ts             # Plan limits, isPaidPlan(), planFromPriceId()
│   │   ├── scan.ts             # Core scan + scoring logic
│   │   ├── scan-health.ts      # Per-tenant scan health tracking
│   │   ├── digest.ts           # Daily Slack digest builder
│   │   ├── provision.ts        # New tenant provisioning (Tenant ID generation)
│   │   ├── slack.ts            # Slack webhook delivery
│   │   └── notify.ts           # Resend email helpers
│   ├── components/             # Shared UI components
│   ├── middleware.ts            # Auth-based route protection
│   └── vercel.json             # Cron job schedule
├── CLAUDE.md                   # Engineering standards + session rules for AI
├── SETUP.md                    # Developer setup guide
└── README.md                   # This file
```

---

## Plans and limits

| Plan | Keywords | ICP Profiles | Scans/Day | Seats |
|---|---|---|---|---|
| Trial (7-day) | 3 | 2 | 1 | 1 |
| Scout Starter | 3 | 2 | 1 | 1 |
| Scout Pro | 10 | 5 | 2 | 1 |
| Scout Agency | 20 | 15 | 2 | 5 |
| Owner (internal) | Unlimited | Unlimited | 2 | Unlimited |

All limits are defined in `lib/tier.ts` — the single source of truth. Never
hardcode limit values anywhere else.

---

## Security model

**Tenant isolation** — All Airtable queries use `tenantFilter(tenantId)` to
scope to the authenticated tenant. Every write that accepts a record ID from
user input calls `verifyRecordTenant()` to prevent IDOR attacks.

**Formula injection** — All user values inserted into Airtable formula strings
pass through `escapeAirtableString()` which escapes `\` and `'`.

**Auth brute-force protection** — Login has per-IP and per-email sliding-window
rate limiting (in-memory). Forgot-password and trial signup have per-IP rate
limiting.

**Cron protection** — All 6 cron routes fail-closed: they verify
`Authorization: Bearer <CRON_SECRET>` before any execution.

**Stripe webhooks** — Verified via `Stripe.webhooks.constructEvent` with
`STRIPE_WEBHOOK_SECRET`. Handler rejects any request that fails signature
verification.

**Trial expiry** — Enforced server-side on every scan request. Expired trial
sessions cannot trigger scans by calling the API directly, regardless of
whether their session cookie is still valid.

---

## Getting started

See [SETUP.md](./SETUP.md) for full local setup and production deployment instructions.

---

## Codebase conventions

- `lib/tenant.ts` — call `getTenantConfig()` at the top of every authenticated route
- `lib/tier.ts` — import `getTierLimits(plan)` for any plan-based gate
- `lib/airtable.ts` — use `airtableList`, `airtableCreate`, `airtableUpdate`, `airtableDelete` helpers; never build raw Airtable URLs in route files
- Cron routes: `CRON_SECRET` check must be the first line of the handler
- Every `any` cast must have an inline justification comment

---

*Built by BrightLink Consulting for ClientBloom.ai*
*Contact: Mike Walker — twp1996@gmail.com*
