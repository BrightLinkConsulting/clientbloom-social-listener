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

### Design and UX
| Document | What it covers |
|----------|----------------|
| [`ux-design-system.md`](./ux-design-system.md) | Typography scale, color system, spacing patterns, callout components, interactive states — source of truth for all UI decisions |

### Features and subsystems
| Document | What it covers |
|----------|----------------|
| [`scout-agent.md`](./scout-agent.md) | Scout Agent architecture — dual-agent pattern (inbox + settings), system prompts, security model, action types, conversation state, proactive coaching logic |
| [`admin-panel.md`](./admin-panel.md) | Super admin panel — tenant management, trial grants, action semantics |
| [`email-system.md`](./email-system.md) | Centralized email architecture, all templates, brand constants, CAN-SPAM |
| [`stripe-billing.md`](./stripe-billing.md) | Checkout flow, webhook handler, cancellation, billing portal |
| [`scan-health-and-watchdog.md`](./scan-health-and-watchdog.md) | Scan state machine, watchdog cron, stuck-scan detection |
| [`linkedin-icp-pool.md`](./linkedin-icp-pool.md) | Two-layer ICP pool model (poolSize vs scanSlots), Discover ICPs, prioritization |
| [`linkedin-keyword-search.md`](./linkedin-keyword-search.md) | Keyword source management, Apify actor, scan deduplication |
| [`airtable-rate-limit-resilience.md`](./airtable-rate-limit-resilience.md) | Rate-limit math, `airtableFetch` retry strategy, jitter |
| [`apify-integration.md`](./apify-integration.md) | Actor IDs, run tagging, per-tenant cost attribution, rate limits, debugging |
| [`service-manager.md`](./service-manager.md) | Automated health checks, all flag codes and severity, Airtable schema, cron details |
| [`usage-service-manager.md`](./usage-service-manager.md) | Admin Usage tab — columns, post count cache vs live, cost attribution, service banner, all bugs fixed April 2026 |
| [`onboarding-first-scan-ux.md`](./onboarding-first-scan-ux.md) | 4-step onboarding wizard, fire-and-redirect scan, `?firstScan` URL states, polling banner, empty-state UX |
| [`engagement-momentum.md`](./engagement-momentum.md) | Engagement Momentum widget — streak logic, score aggregation, visual states |

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
| How does per-tenant Apify cost attribution work? | [`apify-integration.md`](./apify-integration.md) → "Per-Tenant Cost Attribution" |
| What does a service flag mean? How do I add a new one? | [`service-manager.md`](./service-manager.md) → "Flag Reference" |
| A paid customer has no posts — where do I look? | [`service-manager.md`](./service-manager.md) → `paid_zero_posts` flag |
| What font size should this text be? | [`ux-design-system.md`](./ux-design-system.md) → "Typography Scale" |
| What color should this score/status use? | [`ux-design-system.md`](./ux-design-system.md) → "Color System" |
| How do I build a callout/info box? | [`ux-design-system.md`](./ux-design-system.md) → "Callout / Info Box Patterns" |
| How does Scout Agent work (inbox)? | [`scout-agent.md`](./scout-agent.md) → "Architecture Overview" |
| How does Scout Agent work (settings)? | [`scout-agent.md`](./scout-agent.md) → "Settings Agent" |
| How do I add a new inbox action type? | [`scout-agent.md`](./scout-agent.md) → "Adding New Action Types" |
| What does the settings agent know? When should I update its knowledge? | [`scout-agent.md`](./scout-agent.md) → "Settings Agent" + "Updating the knowledge base" |
| How does Scout's scoring and filtering model work? | [`scout-agent.md`](./scout-agent.md) → "Scoring Model — Canonical Reference" |
| What score does a post need to appear in the inbox? Slack digest? Get priority badge? | [`scout-agent.md`](./scout-agent.md) → "Scoring Model — The filtering model" |
| A threshold or digest timing changed — what do I update? | [`scout-agent.md`](./scout-agent.md) → "Scoring Model — Keeping both agents in sync" |
| How does the onboarding wizard work end to end? | [`onboarding-first-scan-ux.md`](./onboarding-first-scan-ux.md) |
| What does `?firstScan=1` or `?firstScan=0` mean in the feed URL? | [`onboarding-first-scan-ux.md`](./onboarding-first-scan-ux.md) → "URL States" |

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

*Last updated: April 2026 — Scout Phase 2 (Session 8: Settings Agent, dual-agent pattern documented)*
