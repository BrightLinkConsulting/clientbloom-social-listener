---
name: Scout by ClientBloom — Social Listener Project
description: Multi-tenant SaaS relationship-intelligence product — current HEAD 29b9bef, multi-tier pricing, 7-day no-CC trial, live at scout.clientbloom.ai
type: project
originSessionId: ac3e2f31-3506-419e-91e9-d5fda3ecea98
---
## Status: PRODUCTION — Last updated April 14, 2026 (session 5)

Scout by ClientBloom is a fully deployed, multi-tenant SaaS. Live at https://scout.clientbloom.ai (DNS resolved April 7, 2026). The old URLs are dead — do not reference cb-dashboard-xi.vercel.app or app.clientbloom.ai in code or docs.

**GitHub:** BrightLinkConsulting/clientbloom-social-listener
**PAT for push access:** ghp_YOUR_PAT_HERE
**Working clone path:** /tmp/sl-check
**Production URL:** https://scout.clientbloom.ai (ONLY correct URL)

## Current HEAD Commit: 29b9bef

"Update sort default references to date-desc across agent prompt and docs"

Prior key commits (still apply for architecture): bd63e93, 51603ee, etc. (see knowledge pack for full history back to session 4)

## Pricing — Multi-Tier (REPLACES single $79/mo — that is dead)

| Plan | Price | Keywords | ICP Profiles | Scans/day | AI Suggestions | Seats |
|---|---|---|---|---|---|---|
| Trial | No CC, 7 days | 3 | 2 | — | 30 | 1 |
| Starter | $49/mo | 3 | 2 | 1 | 30 | 1 |
| Pro | $99/mo | 10 | 5 | 2 | unlimited | 1 |
| Agency | $249/mo | 20 | 15 | 2 | unlimited | 5 |
| Owner | Internal | unlimited | unlimited | unlimited | unlimited | unlimited |

Stripe live price IDs (confirmed against acct_1QoRpDBMxo6z9NZA):
- Starter: price_1TJlOdBMxo6z9NZAtPMGKrmS ($49.00)
- Pro: price_1TJlP5BMxo6z9NZAMCTKvap8 ($99.00)
- Agency: price_1TJlPTBMxo6z9NZA0H9Srguv ($249.00)

Required env vars: STRIPE_PRICE_STARTER, STRIPE_PRICE_PRO, STRIPE_PRICE_AGENCY.
Upgrade flow: /api/billing/upgrade. Upgrade page: /upgrade.

## Trial System — 7-Day No-Credit-Card (REPLACES 14-day Stripe trial — that is dead)

STRIPE_TRIAL_DAYS env var is dead. Remove from understanding entirely.

- /api/trial/start — provisions Tenants record with Plan='Trial', Trial Ends At=now+7days, Status='Active', auto-signs user into /onboarding
- /api/cron/trial-check — runs every 6 hours. Sends daily nurture email (Days 1-7), sets Status='trial_expired' when Trial Ends At has passed
- In-app countdown banners: days 1-4 indigo; day 5 amber with upgrade link; days 6-7 pulsing; day 8+ full upgrade wall (blurs feed, blocks all actions)
- Trial expiry enforcement also in /api/trigger-scan — expired trial users get 403 with upgrade prompt

## Features Built Since bd63e93

**AI Agents**
- /api/inbox-agent and /api/settings-agent — full Agent Behavior Framework
- Both include trial email sequence awareness and CLIENTBLOOM context in system prompts
- Agents never quote pricing; direct pricing questions to info@clientbloom.ai

**Email System**
- Full 7-email trial nurture sequence (Days 1-7) + trial-expired + win-back emails
- All in lib/emails.ts
- Cron dispatcher in /api/cron/trial-check sends correct email each day with 20-hour gap enforced via 'Trial Last Email Sent At' field
- All emails from info@clientbloom.ai via Resend
- Email 4 wired into LinkedIn algorithm 2026 blog article dual CTAs

**Onboarding v2**
- Rebuilt using ClientBloom brand purple (violet-600) for progress dots and CTAs
- Merged from branch onboarding-v2, April 2026

**Admin Hardening Sprint (commit 9cbb9c3 merge)**
- Cascade delete, archive/reactivate flows, CSM agent, full audit log
- Super admin protection for twp1996@gmail.com
- 4 stress-test bug fixes

**Mobile-First Polish Sprint**
- Landing page, compare page, feed controls, blog — all mobile-optimised
- OG metadata and SEO/LLM discoverability improvements
- Horizontal scroll bugs fixed

**Blog System**
- Blog infrastructure live
- LinkedIn algorithm 2026 article with dual CTAs wired into Email 4

**Compare Page**
- Rewritten at /compare

**Vercel Watchdog + notify.ts Overhaul**
- Scan errors and zero-result scans post to #AIOS Slack channel (in addition to email alerts)
- Uses SLACK_WEBHOOK_URL env var (Scout Alerts app, app ID A0ARAS7RTGE)

**Sort Default Changed (commit 29b9bef)**
- Default inbox sort is now date-desc (newest first), not score-desc
- Reflected across feed, agent prompts, and docs

**Usage API**
- /api/stats excludes Archived and Suspended tenants from usage counts

**Agency Apify Isolation**
- resolveApifyToken() checks for custom Apify key on Agency tier first, falls back to shared platform pool for Trial/Starter/Pro

## What Is Working (Do Not Break)

Everything from knowledge pack still applies plus:
- Engage/Reply/Skip/CRM action flows — action state machine unchanged
- Optimistic UI updates, error banner (51603ee)
- MomentumWidget + sparkline
- Slack daily digest
- Parallel scan architecture, 5-layer reliability
- ClientBloom SVG bloom mark in both page.tsx and settings/page.tsx
- NextScanCountdown in feed footer
- Settings tabs: Profile, LinkedIn, AI & Scoring, System, Account, Team
- Team invite, password change, rate limiting
- Trial countdown banners + upgrade wall
- AI agents (inbox + settings)
- 7-email nurture sequence
- Blog, compare page, mobile-optimised UI

## Action State Machine (Unchanged from knowledge pack)

| User clicks | Airtable writes | Tab |
|---|---|---|
| Engage | Action='Engaged', Engagement Status='' | Engaged |
| Reply | Action='Engaged', Engagement Status='replied' | Replied |
| Skip | Action='Skipped', Engagement Status='' | Skipped |
| CRM push | Action='CRM', Engagement Status='' | In CRM |
| Archive | Engagement Status='archived' (Action unchanged) | hidden |

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend + API | Next.js 14, App Router, TypeScript |
| Hosting | Vercel (production at scout.clientbloom.ai) |
| Data | Airtable (base: appZWp7QdPptIOUYB) |
| Scraping | Apify — LinkedIn-only (two actors); Agency tier uses per-tenant keys |
| AI scoring | Anthropic Claude Haiku |
| Auth | NextAuth JWT strategy (maxAge: 86400) |
| Billing | Stripe multi-tier (Starter $49, Pro $99, Agency $249) |
| Email | Resend (from info@clientbloom.ai) |
| Notifications | Slack (per-tenant webhook + #AIOS Scout Alerts) |
| Style | Tailwind CSS, dark theme |
