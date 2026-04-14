---
name: Scout — Features Built Post-bd63e93 (April 2026)
description: Comprehensive reference for all major features added after the knowledge pack's baseline commit — trial system, email nurture, AI agents, admin hardening, mobile, blog, compare, and more
type: project
---

## Context

The original knowledge pack (sessions 1-4) was accurate through commit `bd63e93`. A significant body of work was completed between bd63e93 and the current HEAD (`29b9bef`). All features listed here are live in production and must be treated as existing, working functionality — do not remove or work around them.

The GitHub repo's `/docs/` folder has developer-level documentation for each of these systems. The sections below are the Claude-session orientation layer — enough context to understand what exists before touching any code.

---

## 1. Trial System

**The 14-day Stripe-managed trial is dead. The $79/mo single tier is dead.**

Scout now runs a 7-day no-credit-card trial managed entirely in-house.

### Provisioning

`/api/trial/start` — provisions the Tenants record with:
- `Plan = 'Trial'`
- `Trial Ends At = now + 7 days`
- `Status = 'Active'`
- Auto-signs the user in and redirects to `/onboarding`

No Stripe involvement at trial start. Stripe is only triggered when the user upgrades.

### Trial Enforcement

`/api/cron/trial-check` runs every 6 hours and:
- Sends the daily nurture email for the current trial day (enforces a 20-hour gap via `Trial Last Email Sent At`)
- Sets `Status = 'trial_expired'` when `Trial Ends At` has passed
- Trial expiry is also enforced server-side in `/api/trigger-scan` — expired trial users receive a 403 with an upgrade prompt

### In-App Countdown UI

Countdown banners in `page.tsx` (preserved across any edits):
- Days 1-4: indigo banner — "X days left in your trial"
- Day 5: amber banner with upgrade link
- Days 6-7: pulsing amber banner with upgrade link
- Day 8+ (expired): full upgrade wall — blurs the entire feed, blocks all action buttons, shows upgrade CTA pointing to `/upgrade`

### Relevant Airtable Fields (Tenants table)

`Trial Ends At` (date), `Trial Last Email Sent At` (datetime), `Trial Email Day` (number)

---

## 2. Multi-Tier Pricing

Three Stripe-billed paid tiers replaced the legacy $79/mo product.

| Plan | Price | Stripe Price ID |
|---|---|---|
| Scout Starter | $49/mo | price_1TJlOdBMxo6z9NZAtPMGKrmS |
| Scout Pro | $99/mo | price_1TJlP5BMxo6z9NZAMCTKvap8 |
| Scout Agency | $249/mo | price_1TJlPTBMxo6z9NZA0H9Srguv |

All confirmed live against Stripe account `acct_1QoRpDBMxo6z9NZA`.

Env vars required: `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_AGENCY`.
Dead env var: `STRIPE_PRICE_ID` (old single-tier), `STRIPE_TRIAL_DAYS` — do not reference.

Upgrade flow: `/api/billing/upgrade`. Upgrade page: `/upgrade`.

All plan limits are defined in `lib/tier.ts` via `getTierLimits(plan)` — single source of truth. Never hardcode limit values anywhere else.

---

## 3. Email Nurture System

Full 7-email trial nurture sequence plus post-trial emails. All templates in `lib/emails.ts`. No inline HTML in route files.

### Trial Sequence (dispatched by /api/cron/trial-check)

| Day | Email focus |
|---|---|
| Day 1 | Welcome + what Scout does |
| Day 2 | How to set up your ICP profiles |
| Day 3 | How keyword search works |
| Day 4 | Blog article: LinkedIn algorithm 2026 (dual CTA into upgrade) |
| Day 5 | "You have X posts waiting" — urgency + inbox CTA |
| Day 6 | Social proof / results framing |
| Day 7 | Final day — strongest upgrade push |

### Post-Trial Emails

- **Trial expired** — sent when `Status` is set to `trial_expired`
- **Win-back** — configurable re-engagement (admin-triggered or cron)

### Key Rules

- All emails from `info@clientbloom.ai` via Resend
- 20-hour gap enforced via `Trial Last Email Sent At` field (prevents duplicate sends if cron runs during a slow Airtable response)
- `Trial Email Day` field tracks which day's email was last sent
- Email 4 links to the LinkedIn algorithm 2026 blog article — do not remove that article

---

## 4. AI Agents (Inbox + Settings)

Two Scout AI agents built on the Agent Behavior Framework.

### /api/inbox-agent

Context: current posts in the feed, user's engagement state, their profile and plan.

Capabilities:
- Answers questions about posts ("why did this score an 8?")
- Suggests comment angles for posts in the inbox
- Explains engagement strategy
- Proactively coaches on consistency when momentum drops

### /api/settings-agent

Context: user's current settings (LinkedIn sources, scoring prompt, Slack config, ICP profiles).

Capabilities:
- Helps users configure keyword sources and ICP profiles
- Guides custom AI scoring prompt creation
- Explains how settings affect scan results
- Suggests improvements based on their industry/ICP

### Agent Behavior Rules (apply to both agents)

- Never quote pricing. Direct all pricing questions to `info@clientbloom.ai`
- Both agents include trial email sequence awareness — agent tone shifts based on trial day
- Full CLIENTBLOOM context section is included in both system prompts
- Agent Behavior Framework applied: Rule 0 status review, confidence tiers, clarifying questions, scope management, hostile/misuse protocol, usage-aware upgrade logic

---

## 5. Admin Hardening Sprint (commit 9cbb9c3 merge)

### Cascade Delete

When a tenant is deleted from the admin panel, all associated Airtable records across all tables are removed in sequence (Sources, Captured Posts, Business Profile, LinkedIn ICPs, Scan Health). Prevents orphaned data.

### Archive / Reactivate Flows

Tenants can be archived (preserves data, suspends access) or reactivated from the admin panel. `Status = 'Archived'`, `Archived At` field set on archive. Reactivation clears `Archived At` and restores `Status = 'Active'`.

### CSM Agent

Admin-facing AI agent for customer success management tasks. Reads tenant health data, scan history, engagement momentum, and plan status to support customer check-ins.

### Full Audit Log

All admin actions (delete, archive, reactivate, plan changes, trial grants) are written to an audit log. Supports accountability and debugging.

### Super Admin Protection

`twp1996@gmail.com` is protected as the super admin. This account cannot be deleted or archived through the admin UI.

### 4 Stress-Test Bug Fixes

Four bugs found during adversarial/stress testing were patched in this sprint. See `docs/adversarial-test-findings.md` and `docs/adversarial-test-results.md` in the repo for details.

---

## 6. Onboarding v2

The 4-step onboarding wizard was rebuilt using ClientBloom brand purple (`violet-600`) for all progress dots and primary CTAs. Merged from `onboarding-v2` branch, April 2026.

Full onboarding flow documentation: `docs/onboarding-first-scan-ux.md` in the repo.

---

## 7. Mobile-First Polish Sprint

- Landing page: full mobile layout pass
- Compare page: mobile-optimised
- Feed controls (Filter/Sort bar): mobile-responsive
- Blog: mobile layout
- Horizontal scroll bugs fixed throughout
- OG metadata added for social sharing previews
- SEO and LLM discoverability improvements (structured data, semantic HTML, meta descriptions)

---

## 8. Blog System

Blog infrastructure is live. Current article: "LinkedIn Algorithm 2026" — includes dual CTAs wired into Email 4 of the trial nurture sequence. Do not remove this article or change its URL without updating the email template in `lib/emails.ts`.

How to add a new blog post: `docs/blog-system.md` in the repo.

---

## 9. Compare Page

Rewritten compare page live at `/compare`. Full competitive positioning for Scout vs. alternatives.

---

## 10. Vercel Watchdog + notify.ts Overhaul

Scan errors and zero-result scans now post to the **#AIOS Slack channel** in addition to email alerts.

- Env var: `SLACK_WEBHOOK_URL`
- Slack app: Scout Alerts (app ID `A0ARAS7RTGE`)

Full watchdog documentation: `docs/scan-health-and-watchdog.md` in the repo.

---

## 11. Default Sort Change (commit 29b9bef)

The default inbox sort changed from `score-desc` to `date-desc` (newest first). This is reflected in:
- The feed page initial sort state
- Both agent system prompts
- Relevant docs

Do not revert this without explicit instruction.

---

## 12. Agency Apify Isolation

`resolveApifyToken()` in `lib/scan.ts` checks the tenant's record for a custom Apify key first. If found, uses it (isolated quota). If not found, falls back to the shared platform `APIFY_API_TOKEN`.

Result: Agency tier customers have isolated Apify quotas. Trial, Starter, and Pro still share the platform pool. Monitor Scan Health table for `RATE_LIMIT` error entries as tenant count grows.

---

## 13. Usage API

`/api/stats` excludes `Archived` and `Suspended` tenants from usage counts. The admin Usage tab shows per-tenant post counts, cost attribution, and a collapsible service banner.

Full documentation: `docs/usage-service-manager.md` in the repo.
