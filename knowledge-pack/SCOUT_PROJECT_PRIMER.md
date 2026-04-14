# Scout by ClientBloom — Project Primer for New Sessions

## READ THIS FIRST — BEFORE TOUCHING ANY CODE

This document is the complete, authoritative orientation for Scout as of April 14, 2026 (HEAD commit a25de39). It supersedes the original knowledge pack (which was accurate through bd63e93). The overrides for trial mechanics, pricing, domain, and pre-production checklist status were all confirmed in session 5. Session 6 additions: cascade delete fix for legacy 'owner' tenantId accounts, upgrade confirmation email for trial-to-paid conversions. Session 7 additions: GHL Scout pipeline integration (Airtable-backed ID persistence), Slack admin alerts for trial signup + purchase.

---

## What You Are Working On

Scout by ClientBloom is a live, paying-customer SaaS deployed at `https://scout.clientbloom.ai`. It is a LinkedIn relationship intelligence tool that scans LinkedIn for posts from tracked profiles and search terms, scores them with Claude Haiku, and presents them in a feed where users can engage, reply, skip, or push to CRM.

**GitHub:** `BrightLinkConsulting/clientbloom-social-listener`
**PAT for push access:** `ghp_YOUR_PAT_HERE`
**Working clone path:** `/tmp/sl-check`
**Production URL:** `https://scout.clientbloom.ai` — the ONLY correct URL. Do not reference `cb-dashboard-xi.vercel.app` or `app.clientbloom.ai` anywhere.

---

## How to Orient Yourself (Do This Every Session)

### Step 1 — Read the knowledge files in this order:
1. `MEMORY.md` — the index
2. `project_social_listener.md` — full architecture, features, routes, credentials, commit history
3. `feedback_scout_airtable_schema.md` — what fields exist and don't exist in Airtable (critical)
4. `feedback_scout_action_flows.md` — how Engage/Reply/Skip/CRM actions work end-to-end
5. `feedback_scout_session_continuity.md` — rules for not regressing features
6. `feedback_scout_git_regression.md` — how to safely edit and push code
7. `project_scout_preprod_checklist.md` — open items before full-scale growth push
8. `project_scout_ui_components.md` — component reference, design patterns, data flows

### Step 2 — Sync the codebase before any edit:
```bash
cd /tmp/sl-check && git stash && git pull --rebase origin main && git stash pop
```
If `/tmp/sl-check` doesn't exist:
```bash
git clone https://ghp_YOUR_PAT_HERE@github.com/BrightLinkConsulting/clientbloom-social-listener.git /tmp/sl-check
cd /tmp/sl-check && git config user.email "twp1996@gmail.com" && git config user.name "Mike Walker"
```

### Step 3 — Read the specific file you will edit AFTER the pull (never use a stale read)

### Step 4 — Make targeted edits using the Edit tool (find/replace) — never rewrite large files from memory

### Step 5 — Commit immediately with a HEREDOC message + Co-Authored-By: Claude Sonnet 4.6 footer

---

## The Single Most Important Rule

**The files in this knowledge pack represent ground truth. The GitHub repo is also ground truth. Your understanding of what "should be" in a file is NOT ground truth — always verify against a fresh file read.**

Previous sessions lost working features (CRM tab, Team tab, ClientBloom SVG logo, countdown timer, action flow logic) because edits were made based on a reconstructed mental model rather than a fresh read. Every regression cost a full session to fix.

---

## Pricing (Multi-Tier — $79 single tier is dead)

| Plan | Price | Keywords | ICP Profiles | Scans/day | AI Suggestions | Seats |
|---|---|---|---|---|---|---|
| Trial | No CC, 7 days | 3 | 2 | — | 30 | 1 |
| Starter | $49/mo | 3 | 2 | 1 | 30 | 1 |
| Pro | $99/mo | 10 | 5 | 2 | unlimited | 1 |
| Agency | $249/mo | 20 | 15 | 2 | unlimited | 5 |
| Owner | Internal | unlimited | unlimited | unlimited | unlimited | unlimited |

**Stripe live price IDs (confirmed against acct_1QoRpDBMxo6z9NZA):**
- Starter: `price_1TJlOdBMxo6z9NZAtPMGKrmS`
- Pro: `price_1TJlP5BMxo6z9NZAMCTKvap8`
- Agency: `price_1TJlPTBMxo6z9NZA0H9Srguv`

Required env vars: `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_AGENCY`

---

## Trial System (7-Day No-Credit-Card — 14-day Stripe trial is dead)

`STRIPE_TRIAL_DAYS` env var is obsolete. Do not reference it.

- `/api/trial/start` — provisions Tenants record with Plan='Trial', Trial Ends At=now+7days, Status='Active', auto-signs user into /onboarding
- `/api/cron/trial-check` — runs every 6 hours. Sends daily nurture email (Days 1-7), sets Status='trial_expired' when Trial Ends At has passed
- In-app countdown banners: days 1-4 indigo; day 5 amber with upgrade link; days 6-7 pulsing; day 8+ full upgrade wall (blurs feed, blocks all actions)
- `/api/trigger-scan` enforces trial expiry — expired trial users get 403 with upgrade prompt

---

## What Is Currently Working (Do Not Break)

As of HEAD commit `874aca2`:

- **Engage button** — posts move to Engaged tab (fixed bd63e93)
- **Reply flow** — posts move to Replied tab
- **Skip flow** — posts move to Skipped tab
- **CRM flow** — posts move to In CRM tab
- **Optimistic UI updates** — posts visually transition before server confirms (51603ee)
- **Error banner** — red dismissable banner surfaces Airtable API errors (51603ee)
- **MomentumWidget** — relationship score, sparkline chart, 14-day history
- **Slack daily digest** — relationship score + trend + inbox count (7 AM PST cron)
- **Slack scan alerts** — errors and zero-result scans post to #AIOS channel (SLACK_WEBHOOK_URL, app ID A0ARAS7RTGE)
- **Parallel scan architecture** — all tenants scan in parallel
- **5-layer scan reliability** — timeout fallback → async → webhook → 15-min collect → 20-min retry
- **ClientBloom SVG bloom mark** — in both page.tsx and settings/page.tsx nav
- **NextScanCountdown** — live ticking countdown in feed footer
- **Settings tabs** — Profile, LinkedIn, AI & Scoring, System, Account, Team
- **Team invite** — feed-only teammate access
- **Password change** — Settings > Account
- **Rate limiting** — 30-min per-tenant cooldown on manual scan; in-memory per-email + per-IP on sign-in; session maxAge 24hr
- **Stripe billing** — multi-tier, upgrade flow at /api/billing/upgrade
- **Trial system** — 7-day no-CC, countdown banners, upgrade wall
- **AI agents** — /api/inbox-agent and /api/settings-agent with full Agent Behavior Framework
- **7-email nurture sequence** — Days 1-7 + expired + win-back, dispatched by trial-check cron
- **Onboarding v2** — violet-600 brand purple, merged from onboarding-v2 branch
- **Blog system** — live including LinkedIn algorithm 2026 article
- **Compare page** — /compare
- **Mobile-optimised UI** — landing, compare, feed, blog; OG metadata + SEO/LLM discoverability
- **Admin hardening** — cascade delete, archive/reactivate, CSM agent, audit log, super admin protection (twp1996@gmail.com)
- **Default sort** — date-desc (newest first), confirmed in commit 29b9bef
- **Agency Apify isolation** — resolveApifyToken() uses per-tenant key for Agency tier
- **GHL Scout pipeline** — every lifecycle event (trial signup, purchase, expiry, archive, unarchive) mirrored to "SCOUT by ClientBloom" pipeline in GHL (lib/ghl-platform.ts). Airtable-backed ID persistence: GHL Contact ID + GHL Opportunity ID stored in Tenants table at creation, used for all stage moves via direct PUT. No GHL search API used (it's broken for newly created pipelines).
- **Slack admin alerts** — 🎉 trial signup and 💰 purchase/conversion alerts to #AIOS channel (lib/notify.ts sendTrialSignupAlert / sendPurchaseAlert)

---

## What Is NOT Working / Known Open Issues

1. Stripe webhook secret — live payments processing, but a human should manually verify STRIPE_WEBHOOK_SECRET in Vercel matches the Stripe dashboard signing secret for the Scout endpoint
2. Shared Apify pool for Trial/Starter/Pro — Agency is isolated; others share. Monitor Scan Health for RATE_LIMIT errors at ~40 active tenants
3. Dead Facebook code still in lib/scan.ts, lib/cascade-delete.ts, lib/scan-health.ts — no functional impact, cosmetic cleanup only

## Fixes / Features in Session 7 (April 14, 2026)

**GHL Scout pipeline + Slack admin alerts (commit a25de39)**

Full lifecycle mirroring to GHL "SCOUT by ClientBloom" pipeline (pipeline ID 5xyEuDU0n5Fgq5n6BoKf, location hz6swxxqV8ZMTuyTG0hP). Stage IDs: Trial User df3a8ce5, Paid Subscriber acdbc33a, Expired Trial 69aef152, Archived 652e9e98. Auth: SCOUT_GHL_API_KEY env var.

Critical architecture note: GHL's /opportunities/search?contact_id=... is broken for newly created pipelines (always returns 0 results). Solution: store GHL Contact ID (fldWIqRlFMggKxUUH) and GHL Opportunity ID (fldvHqFL3aIWHzQGI) in Airtable at creation; all stage moves use stored opp ID via direct PUT. Implemented in lib/ghl-platform.ts with Airtable read/write helpers.

All 8 call sites updated to pass airtableRecordId (3rd or 4th param): trial/start, stripe webhook (×2 — existing.id and tenantRecord.id), trial-check cron, admin/tenants archive/unarchive, csm-agent archive/unarchive (guarded with && action.tenantRecordId check for TypeScript narrowing).

Slack alerts: sendTrialSignupAlert and sendPurchaseAlert in lib/notify.ts. Both paired with GHL calls inside Promise.allSettled to prevent Vercel fire-and-forget termination.

Documentation: docs/ghl-slack-integration.md added to repo.
Mem0: 4 memories added under userId mike-walker.

---

## Fixes Applied in Session 6 (April 14, 2026)

**Cascade delete for legacy 'owner' tenantId accounts (commit f794816)**
Old seed/test accounts provisioned with `Tenant ID = 'owner'` (a non-UUID placeholder) would throw "Invalid tenantId" when deleted from the admin panel. The API route's early-exit guard only caught empty tenantId, not the string `'owner'`. Fixed in `/api/admin/tenants` DELETE handler — `!tenantId || tenantId === 'owner'` now bypasses cascade and deletes only the Tenants row, which is correct since these accounts have no shared data.

**Upgrade confirmation email for trial-to-paid conversions (commit 874aca2)**
Trial users who upgraded via Stripe checkout received no Scout email — only Stripe's generic receipt. The `checkout.session.completed` webhook handler had two paths: existing tenant (trial upgrade) hit `break` with no email; brand new user got a welcome email. Fixed by adding `buildUpgradeConfirmationEmail` to `lib/emails.ts` and wiring it into the trial upgrade path of the webhook. Now sends:
- Upgrade confirmation to the subscriber (subject: "You're now on Scout [Plan] — welcome aboard")
- Admin purchase notification to ADMIN_EMAIL (same template as direct purchases)
`ADMIN_EMAIL` env var confirmed set in Vercel (Production + Preview).

---

## Airtable — The Most Common Source of Silent Failures

Before writing any new field to Airtable, verify it exists. Airtable returns `UNKNOWN_FIELD_NAME` (HTTP 422) and the entire record update fails silently.

**Captured Posts — fields that do NOT exist:**
- `Engaged By` — DO NOT add back.

**Tenants — fields that do NOT exist:**
- `Invited By` — DO NOT add back.

**Tenants — new fields added April 2026:**
- `Trial Ends At` (date)
- `Trial Last Email Sent At` (datetime)
- `Trial Email Day` (number)
- `Archived At` (date)
- `GHL Contact ID` (singleLineText) — field ID fldWIqRlFMggKxUUH
- `GHL Opportunity ID` (singleLineText) — field ID fldvHqFL3aIWHzQGI

**Tenants — Plan values:** Trial, Scout Starter, Scout Pro, Scout Agency, Owner
**Tenants — Status values:** Active, trial_expired, Suspended, Archived

---

## Action State Machine (Critical Reference)

| User clicks | Airtable writes | Post appears in tab |
|---|---|---|
| Engage | Action='Engaged', Engagement Status='' | Engaged |
| Reply | Action='Engaged', Engagement Status='replied' | Replied |
| Skip | Action='Skipped', Engagement Status='' | Skipped |
| CRM push | Action='CRM', Engagement Status='' | In CRM |
| Archive | Engagement Status='archived' (Action unchanged) | hidden |

---

## Commit History (Most Recent First)

| Hash | Description |
|---|---|
| `a25de39` | Feat: GHL + Slack integration — Airtable-backed ID persistence, all call sites wired |
| `021a124` | Feat: Slack alerts + GHL Scout pipeline wiring for trial and purchase events |
| `874aca2` | Feat: send upgrade confirmation email on trial-to-paid conversion |
| `f794816` | Fix: cascade delete fails for old accounts with Tenant ID = 'owner' |
| `d481e03` | Add knowledge-pack: fully current Claude session context files (April 14 2026) |
| `29b9bef` | Update sort default references to date-desc across agent prompt and docs |
| `9cbb9c3` | Admin hardening sprint merge: cascade delete, audit log, CSM agent, super admin, bug fixes |
| `bd63e93` | Fix: remove Engaged By field write — field does not exist in Airtable |
| `51603ee` | Fix: correct optimistic updates + surface action errors in feed |
| `f237cce` | Fix: show sparkline from day 1 |
| `418dddb` | Engagement momentum: 14-day sparkline + Slack digest upgrade |
| `6d47810` | Settings page: full broad-market overhaul |
| `c09df38` | Relationship-first reposition: landing page, onboarding, AI scoring, gamification |

---

## Tech Stack Quick Reference

| Layer | Technology |
|---|---|
| Frontend + API | Next.js 14, App Router, TypeScript |
| Hosting | Vercel (production at scout.clientbloom.ai) |
| Data | Airtable (base: appZWp7QdPptIOUYB) |
| Scraping | Apify — LinkedIn-only; Agency tier uses per-tenant keys via resolveApifyToken() |
| AI scoring + agents | Anthropic Claude Haiku |
| Auth | NextAuth JWT strategy (maxAge: 86400) |
| Billing | Stripe multi-tier (Starter $49, Pro $99, Agency $249) |
| Email | Resend (from info@clientbloom.ai) |
| Notifications | Slack (per-tenant webhook + SLACK_WEBHOOK_URL for #AIOS alerts); GHL CRM pipeline (SCOUT_GHL_API_KEY) |
| Style | Tailwind CSS, dark theme |

---

## Environment Variables (All Set in Vercel)

`PLATFORM_AIRTABLE_TOKEN`, `PLATFORM_AIRTABLE_BASE_ID`, `AIRTABLE_PROVISIONING_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_AGENCY`, `STRIPE_WEBHOOK_SECRET` (verify LIVE key), `RESEND_API_KEY`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `CRON_SECRET`, `APIFY_API_TOKEN`, `APIFY_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `SLACK_WEBHOOK_URL`, `ADMIN_EMAIL` (confirmed set — receives purchase + payment failure notifications), `SUPER_ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SCOUT_GHL_API_KEY` (GHL Private Integration token — set April 2026)

Dead env vars (do not reference): `STRIPE_TRIAL_DAYS`, `STRIPE_PRICE_ID`
