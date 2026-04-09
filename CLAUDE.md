# Scout — Engineering Standards
# scout.clientbloom.ai | ClientBloom.ai
# Last updated: April 2026

## Project Overview
Scout is a multi-tenant B2B SaaS for LinkedIn relationship intelligence, built by ClientBloom.ai.
Production quality is non-negotiable. The founder (Mike Walker) directs work in plain language.

## Tech Stack — Do Not Change Without Explicit Approval
- Framework: Next.js 14 App Router + TypeScript (strict mode)
- Backend: Next.js API routes
- Database: Airtable (single shared base — all tenant data, row-level isolation via Tenant ID)
- Auth: NextAuth.js v4, credentials provider, JWT, 24h session
- Cron: Vercel Cron (6 active jobs defined in dashboard/vercel.json)
- Email: Resend (sender: info@clientbloom.ai)
- Scraping: Apify — LinkedIn ONLY
  - ICP profiles: harvestapi/linkedin-profile-posts
  - Keywords: apimaestro/linkedin-posts-search-scraper-no-cookies
- AI Scoring: Anthropic Claude (claude-haiku-4-5-20251001)
- Rate limiting: In-memory (module-level Map, per Vercel instance) — no Redis/Upstash yet
- Deployment: Vercel Fluid Compute (auto-deploy on push to main)
- Payments: Stripe (Checkout + webhooks, metadata.tier for plan routing)
- Facebook scraping: PERMANENTLY REMOVED (commit b906384, April 2026)

## Current Phase: Phase 2 (April 2026)
Work is organized into four tracks. Check this file before starting new work.

### Track 1 — Launch Blockers
Completed (do not re-implement):
- ✅ Formula injection fix (escapeAirtableString in lib/airtable.ts)
- ✅ CRON_SECRET enforcement on all 6 cron routes
- ✅ Trial messaging on landing page
- ✅ Resend domain verification
- ✅ NEXTAUTH_URL — must be set correctly in production Vercel env
- ✅ JWT maxAge set to 24h
- ✅ STRIPE_WEBHOOK_SECRET — must be set in production Vercel env before going live

### Track 2 — Hardening
Completed:
- ✅ Manual scan cooldown (30-minute, enforced in trigger-scan route)
- ✅ Batch Airtable writes (airtableBatchCreate in lib/airtable.ts)
- ✅ Onboarding state moved server-side (JWT trigger='update' pattern)
- ✅ /api/health endpoint
- ✅ Server-side trial expiry enforcement on trigger-scan
- ✅ Server-side keyword source limit enforcement on POST /api/sources
- ✅ Digest cron eligibility filter (paid + active trial only)
- ✅ IP rate limiting on forgot-password and trial/start routes
- ✅ IDOR prevention on all 4 resource routes (sources, posts, linkedin-icps, crm-push)

Still open:
- Security headers in next.config.js (X-Frame-Options, CSP, etc.)
- Monthly reset cron for scan/post counters
- Upgrade gate modal for trial_expired users
- Atomic Running Scan Count (needed before scaling to 20+ tenants — see usage-sync)

### Track 3 — SEO/Conversion
- Server-render landing page metadata, JSON-LD, sitemap
- Social proof section, comparison pages, blog
- Open Graph images

### Track 4 — Architecture/Cost
- Per-tenant Apify usage tracking
- Scan frequency tiering (Pro scans more often than Starter)
- Post deduplication window (currently 30 days — make configurable)
- Redis-backed rate limiter when multi-instance becomes a concern

---

## Session Rules

### Before writing any code
1. Confirm the request is fully specified — ask if anything is ambiguous
2. Identify which systems are touched (auth, data, API, billing, cron, email)
3. Flag any security implications before writing
4. State the recommended approach with one clear reason

### Post-generation review checklist
- SECURITY: auth on all routes, CRON_SECRET on all cron routes, no hardcoded secrets
- DATA: tenantFilter() on every Airtable read, verifyRecordTenant() on every write, escapeAirtableString() on all user values in formulas
- API: auth check first, public routes (trial/start, checkout) are intentionally unauthenticated
- BILLING: Stripe webhook verifies signature, trial_expired state handled, upgrade flow works
- UX: error states, loading states, mobile responsive

### Output format when issues are found
```
SECURITY STATUS: CLEAR / WARNING / CRITICAL
DATA STATUS: CLEAR / WARNING / CRITICAL
RECOMMENDED ACTION: [what to do before shipping]
```

---

## Security Rules — Never Allow
- Hardcoded secrets or API keys — environment variables only
- Any cron route without CRON_SECRET verification
- Stripe webhook handler without constructEvent signature verification
- Airtable formula with user input that hasn't passed through escapeAirtableString()
- API endpoint that can return one tenant's data to another tenant
- Any Airtable update/delete that accepts a record ID from user input without verifyRecordTenant()
- Wildcard CORS in production

## Environment Variables (must exist in Vercel — never in code)
See .env.example in dashboard/ for the complete list with descriptions.

Critical ones that block production launch if missing:
- STRIPE_WEBHOOK_SECRET
- NEXTAUTH_URL
- NEXTAUTH_SECRET
- CRON_SECRET
- PLATFORM_AIRTABLE_TOKEN + PLATFORM_AIRTABLE_BASE_ID

## What Never Changes Without Asking First
- NextAuth configuration (lib/auth.ts)
- Stripe billing flow (webhooks/stripe/route.ts)
- Airtable schema (adding fields affects all existing records)
- Cron route structure (vercel.json schedule + route handler pattern)
- Trial/subscription state machine

## Established Patterns — Follow These Exactly
- Plan limits: getTierLimits(plan) from lib/tier.ts — never hardcode
- Trial expiry: isPaidPlan() || (plan==='Trial' && trialEndsAt && now <= new Date(trialEndsAt))
- Password reset: 4-file pattern (forgot-password route, reset-password route, 2 UI pages)
- Digest eligibility: getEligibleTenants() in cron/digest/route.ts
- Session refresh: trigger='update' in jwt() callback (lib/auth.ts)
- Tenant data access: always via lib/airtable.ts helpers, never raw fetch inside route files
