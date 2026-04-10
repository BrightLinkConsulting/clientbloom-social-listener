# Scout Documentation

> **scout.clientbloom.ai** — AI-powered LinkedIn relationship intelligence for B2B sales teams.
> Built by BrightLink Consulting for ClientBloom.ai.

This folder is the developer knowledge base for Scout. Start here.

---

## Documentation Index

### Getting started
| Document | What it covers |
|----------|----------------|
| [`/README.md`](../README.md) | Project overview, tech stack, security model, plans |
| [`/SETUP.md`](../SETUP.md) | Local dev setup, environment variables, Airtable schema, deploy to Vercel |

### Architecture
| Document | What it covers |
|----------|----------------|
| [`architecture-overview.md`](./architecture-overview.md) | System map, request lifecycle, data flow, component relationships |
| [`auth-and-sessions.md`](./auth-and-sessions.md) | NextAuth configuration, JWT strategy, session refresh, rate limiting |

### Features and subsystems
| Document | What it covers |
|----------|----------------|
| [`admin-panel.md`](./admin-panel.md) | Super admin panel — tenant management, trial grants, action semantics |
| [`email-system.md`](./email-system.md) | Centralized email architecture, all templates, brand constants, CAN-SPAM |
| [`stripe-billing.md`](./stripe-billing.md) | Checkout flow, webhook handler, cancellation, billing portal |
| [`scan-health-and-watchdog.md`](./scan-health-and-watchdog.md) | Scan state machine, watchdog cron, stuck-scan detection |
| [`linkedin-icp-pool.md`](./linkedin-icp-pool.md) | Two-layer ICP pool model (poolSize vs scanSlots), Discover ICPs, prioritization |
| [`linkedin-keyword-search.md`](./linkedin-keyword-search.md) | Keyword source management, Apify actor, scan deduplication |
| [`airtable-rate-limit-resilience.md`](./airtable-rate-limit-resilience.md) | Rate-limit math, `airtableFetch` retry strategy, jitter |

### Roadmap
| Document | What it covers |
|----------|----------------|
| [`v2-roadmap.md`](./v2-roadmap.md) | Planned v2 features, usage tracker, per-tenant Apify, Redis rate limiter |

### AI context (not for humans)
| Document | What it covers |
|----------|----------------|
| [`/CLAUDE.md`](../CLAUDE.md) | Engineering standards, security rules, session rules for AI-assisted development |

---

## Quick orientation

**Two things every developer must understand first:**

**1. Tenant isolation** — All customer data lives in one shared Airtable base. Row-level isolation is enforced via the `Tenant ID` field. Every Airtable query passes through `tenantFilter(tenantId)` from `lib/airtable.ts`. Every write that accepts a record ID from user input calls `verifyRecordTenant()`. Never bypass these — they are the primary IDOR defence.

**2. Plan limits** — `getTierLimits(plan)` from `lib/tier.ts` is the only source of plan limits in the entire codebase. Never hardcode limit values in route files, UI pages, or anywhere else. Server-side enforcement is required — UI gates alone are insufficient.

---

## Where to look for what

| Question | Where to look |
|----------|--------------|
| How do I add a new API route? | [`auth-and-sessions.md`](./auth-and-sessions.md) → "Authenticated route pattern" |
| How do billing plan upgrades work? | [`stripe-billing.md`](./stripe-billing.md) |
| What does a cron job need? | [`/SETUP.md`](../SETUP.md) → "Cron jobs" |
| What email does a trial user receive on day 3? | [`email-system.md`](./email-system.md) |
| What happens when a trial expires? | [`scan-health-and-watchdog.md`](./scan-health-and-watchdog.md) + [`stripe-billing.md`](./stripe-billing.md) |
| How do I grant a trial from the admin panel? | [`admin-panel.md`](./admin-panel.md) → "Grant 7-Day Trial" |
| Why is Airtable returning 429 errors? | [`airtable-rate-limit-resilience.md`](./airtable-rate-limit-resilience.md) |
| What plan does this user have? | Check `session.user.plan` (set in `lib/auth.ts` JWT callback) |
| How do ICP scan slots differ from pool size? | [`linkedin-icp-pool.md`](./linkedin-icp-pool.md) |
| Full list of API routes with auth requirements | [`api-reference.md`](./api-reference.md) |

---

## Key invariants (never violate)

```
All Airtable reads   → tenantFilter(tenantId) in lib/airtable.ts
All Airtable writes  → verifyRecordTenant() before record ID is used
All cron routes      → CRON_SECRET header check FIRST, before any logic
All plan limits      → getTierLimits(plan) from lib/tier.ts
All email HTML       → lib/emails.ts — never inline HTML in route files
All user Airtable    → escapeAirtableString() on all formula-injected values
Created At fields    → new Date().toISOString() — never date-only split('T')[0]
```

---

*Last updated: April 2026 — Scout Phase 2*
