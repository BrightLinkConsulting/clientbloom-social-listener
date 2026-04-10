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
- ✅ airtableFetch retry-with-backoff wrapper (lib/airtable.ts — covers all hot-path Airtable calls)
- ✅ Staggered cron dispatch with 0–5s random jitter (cron/scan/route.ts)
- ✅ Batch→individual fallback guard with 2s pause (lib/scan.ts → saveScoredPosts)
- ✅ Stuck-scanning detection and reset in watchdog (cron/scan-watchdog/route.ts)
- ✅ Skipped-scan status reset bug fixed (scan-tenant route)
- ✅ Trial countdown off-by-one fixed (Math.floor, not Math.ceil)
- ✅ Suggestions Used + Last ICP Discovery At fields added to Tenants table (Airtable MCP, April 2026)
- ✅ Email system centralized — all templates in lib/emails.ts, no inline HTML in route files
- ✅ CAN-SPAM compliance — unsubscribe link + physical address in all trial/nurture emails
- ✅ /api/unsubscribe endpoint — sets 'Email Opted Out' in Airtable; respected by trial-check cron
- ✅ Name personalization removed from all trial emails (sign-up collects email+password only)
- ✅ Day 1 email: ClientBloom logoHeader(), BRAND_PURPLE header + CTA
- ✅ Days 2–7 emails: all migrated to logoHeader() + BRAND_PURPLE CTAs (was BRAND_BLUE header())
- ✅ LinkedIn ICP two-layer model: poolSize (storage) vs scanSlots (Apify cost); getTierLimits
  extended with poolSize, scanSlots, discoverRunsPerDay, discoverMaxPerRun; legacy `profiles`
  field kept as deprecated alias for scanSlots
- ✅ Smart profile prioritization in scan.ts: Posts Found DESC → Added Date DESC → round-robin
  (auto-selects top scanSlots profiles per run; no manual priority in v1)
- ✅ Discover ICPs: plan gate (discoverRunsPerDay===0 → 403+upgrade:true), daily frequency window,
  15-min hard cooldown, pool size cap, paginated count + dedup; "Apify" removed from all user copy
- ✅ ICP pool pagination: countAllIcpProfiles(), discover pool count, and discover dedup all paginate
  through all Airtable pages (critical for Agency 500-profile pools)
- ✅ Settings UI LinkedInICPSection rewrite: Add Profile + Discover ICPs moved to top; trial lock
  overlay with tier comparison; scan slot explainer; all limits from getTierLimits
- ✅ Pricing updated: upgrade/page.tsx, page-landing.tsx now show "X profiles scanned · Y-profile pool"
- ✅ JWT plan whitelist — auth.ts rejects session.update({ plan }) unless value is a known paid plan
- ✅ Post-payment welcome page dual-flow wired to /api/session/refresh + session.update()

Completed:
- ✅ Keyword scan sort fixed — sort_type changed from 'relevance' to 'recent'; limit raised to 50
  (primary) / 25 (retry). Relevance returned the same posts every scan; all deduped after first capture.
- ✅ ScanStatusPill now shows lastPostsFound count: "Last scan: 1h ago · 3 new posts"
- ✅ MomentumWidget label corrected: "N posts in queue" instead of "N new posts waiting"
- ✅ suggest/route.ts: retry-then-503 replaces hard 500 when Claude returns empty content
- ✅ Zero-posts informational notice: subtle inline callout when lastPostsFound===0 after a completed scan
- ✅ Admin stripe-stats route rewritten — now queries all 3 price IDs (STRIPE_PRICE_STARTER/PRO/AGENCY)
  in parallel; MRR calculated from actual plan amounts ($49/$99/$249), not hardcoded $79
- ✅ Admin PlanBadge updated — handles 'Scout Starter', 'Scout Pro', 'Scout Agency' (webhook-set values);
  legacy 'Scout $79'/'Scout $49' kept as fallbacks for existing records
- ✅ Admin form plan dropdown updated — Starter/Pro/Agency with dollar amounts; removed 'Scout $79';
  default reset to 'Scout Starter'
- ✅ Admin trial pipeline v2 — countdown synced to TrialBanner (Math.floor + hours display);
  color zones green (6-7d), yellow (2-5d), red (0-1d); "upcoming >7d" section removed
  (max trial is 7d); expired section with reactivation email button + send-date tracking;
  'Reactivation Sent At' field written to Airtable on send; trialBadge() helper also uses Math.floor
- ✅ Reactivation email system — POST /api/admin/send-reactivation; buildTrialReactivationEmail
  in lib/emails.ts; 'Reactivation Sent At' field added to Tenants table; full adversarial test passed
- ✅ Plan & Billing section overhaul (6 bugs fixed) — isStripeBilledPlan() added to tier.ts;
  portal route returns JSON (not redirect); cancel route uses buildCancellationEmail; 2-step cancel
  confirm replaces window.confirm(); Math.floor trial countdown; Owner/Complimentary handled cleanly;
  22/22 adversarial tests passed
- ✅ Admin "Grant 14-Day Trial" corrected to "Grant 7-Day Trial" (TRIAL_DAYS=7 in route)
- ✅ Admin system health strip added — 3-column panel: Stripe (Live/Stub mode), Airtable (tenant count),
  Auth & Access Control behavior note
- ✅ Stripe env vars verified in Vercel — STRIPE_PRICE_STARTER/PRO/AGENCY all set with correct price IDs;
  STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET confirmed set
- ✅ Full adversarial stress test passed — see docs/stripe-billing.md for test results
- ✅ Per-account adversarial stress test (Session 3) — 38/38 tests passed; 6 new bugs found and fixed:
  (a) Nav + upgrade page Math.ceil → Math.floor (countdown mismatch); (b) Upgrade route guard against
  active paid subscribers creating duplicate subscriptions; (c) Upgrade page CTAs replaced with portal
  redirect for paid users; (d) /api/billing/status route created — restores post-cancel amber card on
  page refresh (closes Known P2 gap); (e) getTierLimits + getPlanDisplay handle 'Complimentary' plan;
  full details in docs/stripe-billing.md
- ✅ Usage tracker removed from Plan & Billing (intentional, pre-launch) — the section showed hardcoded
  "0 / N" values with no live data source. Removed GaugeBar component and usage card entirely. Limits
  are still enforced server-side. See docs/v2-roadmap.md for the proper v2 implementation spec.
- ✅ CRM integration gated to Agency-only — previously available on Pro+Agency; now Agency+Owner only.
  Gate enforced at 6 surfaces: UI in page.tsx + settings/page.tsx; server in crm-push + crm-settings
  routes; marketing copy in upgrade/page.tsx, page-landing.tsx, welcome/page.tsx, lib/emails.ts,
  and compare/page.tsx. Plan sweep confirmed zero remaining Pro+CRM references.

Still open:
- Security headers in next.config.js (X-Frame-Options, CSP, etc.)
- Monthly reset cron for scan/post counters
- Upgrade gate modal for trial_expired users
- Atomic Running Scan Count (needed before scaling to 20+ tenants — see usage-sync)
- Migrate scan-health.ts to airtableFetch (currently bare fetch — 429 causes silent stuck-scanning)
- Redis-backed IP rate limiter (in-memory resets on cold start)

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

## Airtable Tenants Schema — Known Fields
Fields that code reads/writes on the Tenants table. Adding new fields is safe (Airtable
returns null for unset fields on existing records) but removing or renaming breaks all
callers — never do this without auditing every reference first.

| Field name | Type | Set by | Purpose |
|---|---|---|---|
| `Email` | text | signup/admin | Tenant login email |
| `Password Hash` | text | signup/admin/reset | bcrypt hash |
| `Company Name` | text | signup/admin | Display name |
| `Tenant ID` | text | provision | UUID — row-level isolation key |
| `Status` | text | admin/webhook | `'Active'` or `'Suspended'` |
| `Is Admin` | checkbox | admin | Grants access to /admin page |
| `Is Feed Only` | checkbox | admin | Restricts to read-only feed |
| `Plan` | text | webhook/admin | `'Scout Starter'`, `'Scout Pro'`, `'Scout Agency'`, `'Trial'`, `'Complimentary'`, `'Owner'` |
| `Trial Ends At` | text (ISO) | grant-access/trial/start | Trial expiry timestamp |
| `Created At` | text (date) | admin POST | Account creation date |
| `Airtable Base ID` | text | admin | Tenant's own Airtable base |
| `Airtable API Token` | text | admin | Tenant's Airtable token |
| `Apify API Key` | text | admin | Custom Apify key (optional) |
| `Stripe Customer ID` | text | webhook | Set on checkout.session.completed |
| `Stripe Subscription ID` | text | webhook | Active subscription ID |
| `Email Opted Out` | checkbox | /api/unsubscribe | Suppresses trial nurture emails |
| `Suggestions Used` | number | suggest route | Tracks AI suggestion credits |
| `Last ICP Discovery At` | text (ISO) | discover route | Rate-limits ICP discovery calls |
| `Reactivation Sent At` | text (ISO) | send-reactivation route | When admin last sent reactivation email |

## What Never Changes Without Asking First
- NextAuth configuration (lib/auth.ts)
- Stripe billing flow (webhooks/stripe/route.ts)
- Airtable schema (adding fields is safe; renaming/removing is NOT — audit all callers first)
- Cron route structure (vercel.json schedule + route handler pattern)
- Trial/subscription state machine

## Established Patterns — Follow These Exactly
- Stripe price IDs: always read from STRIPE_PRICE_STARTER / STRIPE_PRICE_PRO / STRIPE_PRICE_AGENCY
  env vars. Never hardcode a price ID or reference the legacy STRIPE_PRICE_ID variable.
- Stripe MRR/stats: query ALL three Scout price IDs in parallel and deduplicate by subscription ID.
  Never use a single price ID to count subscribers — subscribers will be invisible if they're on a
  different tier than the one queried. See api/admin/stripe-stats/route.ts.
- Plan name strings: 'Scout Starter', 'Scout Pro', 'Scout Agency' (set by webhook). Anywhere that
  checks or displays plan names (PlanBadge, tier gates, JWT whitelist) must handle these strings.
  The old 'Scout $79' string is legacy — do not use for new tenants.
- Stripe webhook: always use stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET).
  Return 400 on signature failure; return 200 even on processing errors (Stripe retries on non-200).
  Never trust user-supplied event data — always verify via constructEvent first.
- Admin stats source field: stripe-stats route returns { source: 'stripe' | 'stub' }. UI should
  check stats.source to determine badge state; never check for presence of individual env vars
  client-side (they are never exposed to the browser).
- Plan limits: getTierLimits(plan) from lib/tier.ts — never hardcode
- Trial expiry: isPaidPlan() || (plan==='Trial' && trialEndsAt && now <= new Date(trialEndsAt))
- Password reset: 4-file pattern (forgot-password route, reset-password route, 2 UI pages)
- Digest eligibility: getEligibleTenants() in cron/digest/route.ts
- Session refresh: trigger='update' in jwt() callback (lib/auth.ts)
- Tenant data access: always via lib/airtable.ts helpers, never raw fetch inside route files
- Airtable calls: always via airtableFetch() — never bare fetch() against api.airtable.com
- Scan cadence: Trial + Starter = 1/day; Pro = 2/day. Cron fires twice daily for all plans;
  scan-tenant skips on < 12h cooldown for single-scan plans
- Scan status: ScanStatusPill and NextScanCountdown require plan prop for correct overdue
  threshold and cadence note. Read plan from (session?.user as any)?.plan.
  ScanStatusPill shows lastPostsFound count from ScanHealth ("Last scan: Xh ago · N new posts").
- Keyword scan sort: always sort_type='recent' in Apify keyword actor. Never 'relevance' —
  relevance returns the same top posts on every scan, all dedup'd after first capture.
- suggest/route.ts: retries once with a shorter fallback prompt if Claude returns empty content.
  Returns 503 (not 500) if both attempts fail — 503 signals transient unavailability.
- Trial countdown: always Math.floor for days/hours — never Math.ceil (off-by-one bug).
  Display format: "Xd Yh left" (or "Yh left" when d=0). Four surfaces must all agree:
  TrialBanner (app/page.tsx), Nav banner (settings/page.tsx), PlanBillingSection
  (settings/page.tsx), and the /upgrade page. Any future change updates ALL FOUR.
- Reactivation email: admin sends via POST /api/admin/send-reactivation. After sending,
  'Reactivation Sent At' is written to Airtable. UI checks t.reactivationSentAt (from
  tenants GET) and local reactivationSent state (optimistic) to show send timestamp.
  Never auto-send — always requires explicit admin click.
- Billing portal: always call GET /api/billing/portal via fetch(), read { url }, then
  window.location.href = url. Never use <a href="/api/billing/portal"> — the route returns
  JSON not a redirect, so a raw link renders JSON in the browser on error.
- Plan guards in billing: use isStripeBilledPlan(plan) (not isPaidPlan) to gate portal
  and cancel buttons. isPaidPlan() includes Owner/Complimentary (feature access); neither
  has a Stripe subscription. The portal route also has a server-side STRIPE_PLANS guard.
- Cancel flow: 2-step inline confirmation (showCancelConfirm state) — never window.confirm().
  After cancel: show persistent amber card with accessUntil date and Resubscribe CTA.
  Cancellation email uses buildCancellationEmail from lib/emails.ts.
  On page load, PlanBillingSection calls GET /api/billing/status to restore the amber card
  if Status='canceling' in Airtable (persists the card across page refreshes).
- Billing status check: GET /api/billing/status → { status, accessUntil? }. Auth required.
  Non-Stripe plans return { status: 'none' }. 'canceling' includes accessUntil from Stripe.
  Call on mount for isStripeBilledPlan users only.
- Upgrade gate for paid subscribers: active Starter/Pro/Agency users must use the Billing
  Portal to change tiers — NOT /api/billing/upgrade. The upgrade route has a
  STRIPE_ACTIVE_PLANS guard that redirects to /settings?tab=billing&portal=1. The /upgrade
  page also detects isStripeBilledPlan and shows portal CTAs instead of checkout buttons.
  Never remove these guards — they prevent duplicate Stripe subscription creation.
- CRM integration is Agency-only (Scout Agency + Owner plans). This is enforced at:
  (a) UI: `crmUnlocked = plan === 'Scout Agency' || plan === 'Owner'` in both app/page.tsx
      and app/settings/page.tsx. Lock screen shows padlock + "Upgrade to Agency to unlock →".
  (b) Server: `CRM_ALLOWED_PLANS = new Set(['Scout Agency', 'Owner'])` constant defined in
      both api/crm-push/route.ts (returns 403) and api/crm-settings/route.ts (POST returns 403;
      GET returns empty config). Pro users cannot bypass the UI gate via direct API calls.
  (c) Marketing: CRM is excluded from all Pro feature lists (upgrade page, landing page pricing,
      welcome page tagline, emails). It appears only in the Agency features list.
  Never re-add CRM to the Pro tier without updating ALL six of these surfaces.
- Keyword atCap enforcement: always use `terms.length >= planLimit` — NOT `activeCount >= planLimit`.
  The API counts ALL linkedin_term records (including paused) via countKeywordSources(). Using
  activeCount creates a mismatch where the UI allows adding a term but the API returns 429. Both
  the settings page and the onboarding StepKeywords component must use terms.length.
- POST /api/sources response shape: `{ source: { id, name, type, value, active, priority } }`.
  The record ID is at `data.source.id`. Never read from `data.record.id` or `data.id`.
- API error display: never throw `new Error(await resp.text())` directly — resp.text() may be a
  JSON object. Use parseApiError(resp) which attempts JSON.parse(text).error before falling back
  to the raw string. This prevents users seeing `{"error":"...","limit":3}` in error banners.
- StepKeywords onboarding: terms are saved immediately to /api/sources on each add — not batched
  at the end. StepKeywords fetches existing terms from /api/sources on mount so back-navigation
  restores state correctly without losing progress.
- Stuck-scanning: treat as success state in the UI (scan completed; only write failed).
  Do not show alarm language. Watchdog resets the backend field within 1h.
- Overdue threshold: 26h for Trial/Starter, 14h for Pro. See scanOverdueMs() in app/page.tsx
- Email templates: all in lib/emails.ts — never write inline HTML in route files. Import
  the builder, call it with opts (no firstName), send the { subject, html } via Resend.
- No name personalization in emails: sign-up only collects email + password. Omit
  greetings entirely rather than derive a name from Company Name (may be an email address).
- Email footer: always call footer(unsubUrl) in marketing/nurture emails. Transactionals
  (password reset, billing) are exempt from the unsubscribe requirement.
- JWT plan updates: only VALID_PAID_PLANS set in auth.ts jwt() callback will be accepted
  from session.update(). Do not remove this whitelist — it prevents plan spoofing.
- Post-payment session refresh: /welcome?upgraded=1 → GET /api/session/refresh →
  session.update({ plan, trialEndsAt }) → JWT reflects new plan without sign-out.

## ICP Pool — Two-Layer Model
The LinkedIn ICP system separates pool (storage) from scan slots (Apify cost). These are distinct.
- `poolSize`: total profiles a tenant can save — counts ALL records (active + paused)
- `scanSlots`: profiles actually fetched per scan run — the real Apify cost driver
- `atPoolCap = total >= poolSize` — always use total (all records), never activeCount
- `GET /api/linkedin-icps` returns `{ profiles, poolSize, scanSlots }` — UI reads limits from here
- Section description: use `sectionDescription` variable — when `total > poolSize` (grandfathered data
  from before pool cap was enforced) show "X profiles saved · Y-profile trial pool limit · ..." to
  avoid the confusing "25 of 10" display. Normal path: "${total} of ${poolSize} in pool · ..."
- Info box: always render "How the ICP Pool works" box (matches keyword section pattern). Trial users
  see inline upgrade comparison: "Starter: 50 pool · 10 scanned · Pro: 150 pool · 25 scanned · Agency: 500 pool · 50 scanned"
- Pool cap pill: show `{total}/{poolSize}` — NOT `{poolSize}/{poolSize}` (would hide over-limit state)
- `runScanForTenant(tenantId, apifyKey?, plan)` — plan param is required; drives slot selection
- Smart sort: Posts Found DESC → Added Date DESC → natural round-robin (no manual priority, v1)
- Discover ICPs: gated (`discoverRunsPerDay === 0` → 403 with `upgrade:true`); daily frequency
  window + 15-min hard cooldown; paginated dedup check; never mentions "Apify" in user copy
- All pool count queries paginate through ALL Airtable pages (Agency has 500-profile pool)
- Never use `profiles` (legacy field) for pool logic — use `poolSize` and `scanSlots` from getTierLimits

## Email Branding (lib/emails.ts)
- ALL trial emails (Day 1–7) use `logoHeader()` — never `header()` for trial sequence
- `logoHeader()` renders ClientBloom mark SVG + "Scout / by ClientBloom" on `BRAND_PURPLE` background
- `header()` is for non-trial transactional emails only (password reset, billing, admin alerts)
- Trial CTA buttons: always pass `BRAND_PURPLE` as third arg to `cta()` — never default blue
- Days 5–7 CTA/infoBox colors still use `planCopy.color` for plan-specific urgency — header stays purple
- PLAN_COPY highlight strings reflect new ICP pool model (e.g., "10 ICP profiles scanned · 50-profile pool")

## Documentation Index
- `docs/airtable-rate-limit-resilience.md` — Rate-limit resilience design, airtableFetch,
  staggered dispatch, schema additions, constants, open gaps
- `docs/scan-health-and-watchdog.md` — Scan Health state machine, stuck-scanning root cause
  and fix, plan-aware UX, trial banner, watchdog response shape
- `docs/email-system.md` — Email architecture (lib/emails.ts), brand constants, layout helpers,
  no-name policy, CAN-SPAM compliance, trial sequence (Days 1–7), win-back (3-day) and
  reactivation (30-day) templates, session refresh flow, JWT plan whitelist, known gaps
- `docs/stripe-billing.md` — Full billing architecture: price IDs, checkout flow, webhook event
  handlers, tenant provisioning, plan name mapping, env var reference, admin stats design,
  trial pipeline v2 design, reactivation system spec, /api/billing/status route spec,
  per-account adversarial test results (38/38 Session 3), known gaps
- `docs/v2-roadmap.md` — Features intentionally deferred from v1 launch. Each entry explains
  what was removed, why, and what the proper v2 implementation requires. Currently contains:
  (1) Live usage tracking (Plan & Billing)
- `docs/linkedin-keyword-search.md` — Keyword search feature spec: plan limits, scan frequency,
  API response shapes, enforcement architecture, 8-bug adversarial test results, UX copy rules
- `docs/linkedin-icp-pool.md` — ICP pool two-layer architecture: poolSize vs scanSlots, tier
  table, smart prioritization algorithm, pool cap enforcement, Discover ICPs rate limiting,
  API response shapes, adversarial test results (April 2026), copy rules
