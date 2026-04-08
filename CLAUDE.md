# Scout - Engineering Standards
# scout.clientbloom.ai | ClientBloom.ai
# Last updated: April 2026

## Project Overview
Scout is a B2B SaaS lead intelligence tool built by ClientBloom.ai. Low-ticket broad market offer. The founder directs builds in plain language. Production quality is non-negotiable.

## Tech Stack — Do Not Change Without Explicit Approval
- Frontend: Next.js + React + TypeScript (TSX)
- Backend: Next.js API routes
- Database: Airtable (primary data store — TWO bases: shared tenant data + platform base)
- Auth: NextAuth.js (credentials provider, JWT, 24h session)
- Job scheduling: Vercel Cron (8 active jobs in dashboard/vercel.json)
- Email: Resend (domain clientbloom.ai, all senders via info@clientbloom.ai)
- Scraping: Apify — LinkedIn ONLY (2 actors: harvestapi/linkedin-profile-posts, apimaestro/linkedin-posts-search-scraper-no-cookies)
- AI Scoring: Anthropic Claude API (claude-haiku-4-5-20251001)
- Rate limiting: In-memory (module-level, per Vercel instance) — no Upstash
- Deployment: Vercel (auto-deploy on push to main)
- Payments: Stripe (Checkout + webhooks, metadata.tier for plan detection)
- Facebook scraping: PERMANENTLY REMOVED (commit b906384, April 8 2026)

## Current Phase: Phase 2 (as of April 2026)
Work is organized into four tracks from Scout_Phase2_Locked_Plan.md.
Always check this file before starting new work to avoid duplicating or conflicting with locked decisions.

### Track 1 — Launch Blockers (highest priority)
Still open:
- Live Stripe webhook secret (STRIPE_WEBHOOK_SECRET in production env)
- NEXTAUTH_URL set correctly in production
- JWT maxAge set to 24h
- End-to-end signup validation

Completed (do not re-implement):
- Formula injection fix in auth.ts
- CRON_SECRET enforcement
- Trial messaging on landing page
- Resend domain verification

### Track 2 — Hardening (do after Track 1)
Still open:
- Manual scan cooldown
- Batch Airtable writes
- Usage-sync rewrite
- Onboarding state moved server-side (currently uses localStorage — do not add more localStorage)
- /api/health endpoint
- Security headers in next.config.js
- Weekly digest cron route (triggers digest.ts across all tenants)
- Monthly reset cron for scan/post counters
- Upgrade gate modal for trial_expired users

### Track 3 — SEO/Conversion
- Server-render landing page, metadata, JSON-LD, sitemap, social proof, comparison pages, blog

### Track 4 — Architecture/Cost
- Post deduplication, last-seen timestamps, scan frequency tiering, per-tenant Apify tracking, post age cutoff

## Session Behavior

### Before writing any code:
1. Check Scout_Phase2_Locked_Plan.md — confirm the work isn't already planned or completed
2. Confirm the request is fully specified — ask if anything is ambiguous
3. Identify which systems are touched: auth, data, API, billing, cron, email
4. Flag any security implications before writing anything
5. State the recommended approach with one clear reason
6. Confirm any schema or data model changes before proceeding

### After generating code, run this review:
- SECURITY: auth on all routes, CRON_SECRET enforced on all cron routes, no hardcoded secrets, Stripe webhook signature verified
- DATA: Airtable writes batched where possible, formula injection not possible, per-tenant data isolation enforced
- API: auth check + authorization check on every route, public routes (trial/start, checkout) are intentionally unauthenticated
- BILLING: Stripe webhook handler verifies signature, trial_expired state handled correctly, upgrade flow works
- UX: error states exist, loading states exist, mobile responsive, no localStorage for important state

### Output format when issues are found:
SECURITY STATUS: CLEAR / WARNING / CRITICAL
DATA STATUS: CLEAR / WARNING / CRITICAL
RECOMMENDED ACTION: [what to do before shipping]
FOR RICK: [specific technical instructions if dev handoff needed]

## Security Rules — Never Allow
- Hardcoded secrets or API keys in any file — environment variables only
- CRON_SECRET missing from any cron route
- Unverified Stripe webhooks
- Formula injection in Airtable writes (always sanitize user input before writing)
- User input rendered as HTML without sanitization
- API endpoint returning one tenant's data to another tenant
- Wildcard CORS in production

## Critical Environment Variables (must exist in Vercel, never in code)
- STRIPE_WEBHOOK_SECRET
- NEXTAUTH_URL
- NEXTAUTH_SECRET
- CRON_SECRET
- Resend API key
- Apify API key
- Airtable API key + base ID

## What Never Changes Without Asking First
- NextAuth configuration
- Stripe billing flow
- Airtable schema (adding fields affects all existing records)
- Cron route structure
- Trial/subscription state machine

## Known Patterns Already Established — Follow These
- Trial expiration: handled via trial-check cron route
- Password reset: 4-file pattern (2 API routes, 2 UI pages)
- Digest email: digest.ts handles content, cron route triggers across tenants
- Scan limits: enforced per-tenant via Apify tracking
