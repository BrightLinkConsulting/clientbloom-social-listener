---
name: Scout — Cost Model and Viability Analysis
description: Economics updated for multi-tier pricing (Starter $49/Pro $99/Agency $249) — ~98% gross margin still holds; LinkedIn-only COGS unchanged
type: project
originSessionId: ac3e2f31-3506-419e-91e9-d5fda3ecea98
---
## Current State (April 14, 2026)

LinkedIn-only architecture. COGS ~$0.83-1.03/tenant/month regardless of plan tier. Pricing is now multi-tier.

## Current Pricing Tiers

- Starter: $49/mo
- Pro: $99/mo
- Agency: $249/mo
- Trial: No CC, 7 days (then converts to paid or expires)

The old single $79/mo tier is completely dead.

## COGS Per Tenant Per Month (unchanged from LinkedIn-only migration)

- LinkedIn keyword (4 terms × 2 runs × 30 days): ~$0.24
- LinkedIn ICP (8 profiles × 2 runs × 30 days): ~$0.48
- Claude Haiku scoring: ~$0.10-0.30
- Vercel serverless: ~$0.01
- Total: ~$0.83-1.03/month

Margins remain near 98% at scale across all paid tiers, even at Starter ($49).

## Shared Apify Pool Risk

Agency tier now uses per-tenant Apify keys via resolveApifyToken() — their scan quota is isolated. Trial/Starter/Pro still share platform pool. Monitor Scan Health for RATE_LIMIT errors. Upgrade Apify plan or require per-tenant keys at ~40 active tenants.

## What Was Fixed (historical)

Root cause of $21.39/4-day crisis (April 6, 2026): Railway Python agent running browser-based Facebook actor (~$3-5/day) simultaneously with Vercel cron. All Facebook posts scored below 5 — zero value.

Fixes: Railway disabled (sys.exit(0)), Facebook removed, LinkedIn limits expanded (ICP 3→8 profiles, keywords 2→4 terms, posts 5→10 per profile).
