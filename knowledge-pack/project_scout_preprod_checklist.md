---
name: Scout — Pre-Production Checklist
description: Status of all 7 pre-production items as of April 14 2026 — 5 done or resolved, 1 partially resolved, 1 still open
type: project
originSessionId: ac3e2f31-3506-419e-91e9-d5fda3ecea98
---
Updated April 14, 2026 (session 5). Original 7 items from knowledge pack + verified current status.

**Why:** These were flagged April 6, 2026. How to apply — review with Mike at start of any Scout session and ask if any remaining items should be addressed before feature work.

## Status of All 7 Items

### 1. Manual scan cooldown — DONE
30-minute per-tenant cooldown enforced in /api/trigger-scan with 429 response. Also enforces trial expiry — expired trial users receive a 403 with upgrade prompt.

### 2. JWT maxAge for suspended tenants — DONE
session: { strategy: 'jwt', maxAge: 24 * 60 * 60 } confirmed live in lib/auth.ts.

### 3. Email injection in Airtable auth queries — DONE
lib/auth.ts applies .replace(/'/g, "\\'") before injecting email into the Airtable formula string.

### 4. Stripe webhook secret verification — VERIFIED LIVE (manual confirmation still ideal)
Stripe account confirmed live mode. All three price IDs resolve correctly against live ClientBloom account (acct_1QoRpDBMxo6z9NZA). The STRIPE_WEBHOOK_SECRET value itself cannot be read via API (Stripe security design). A human should open Stripe Dashboard > Developers > Webhooks, reveal signing secret for the Scout endpoint, and confirm it matches the Vercel env var. Low-risk given live payments are processing successfully.

### 5. Shared Apify pool concurrency — PARTIALLY RESOLVED
Agency tier customers now use per-tenant Apify keys via resolveApifyToken(), isolating their quota. Trial, Starter, and Pro still share the platform pool. Monitor Scan Health table for RATE_LIMIT error entries as tenant count grows. Plan to upgrade Apify plan or require per-tenant keys at ~40 active tenants.

### 6. Custom domain DNS — DONE
Production is https://scout.clientbloom.ai (not app.clientbloom.ai). DNS resolved April 7, 2026. NEXTAUTH_URL updated accordingly.

### 7. Dead Facebook code — STILL PARTIALLY PRESENT
References remain in lib/scan.ts, lib/cascade-delete.ts, and lib/scan-health.ts. No functional impact — no Facebook scanning runs. Low priority cosmetic cleanup.

## Previously Completed (from original checklist)

- In-memory rate limiting on sign-in — commit aff10f9
- Facebook tab removed from Settings — commit 939320d
- Railway Python agent disabled — commit 125089c
- Facebook scraping removed from scan engine — commit a571763
