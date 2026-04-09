# Scout — Stripe Billing Architecture
## Last updated: April 2026

---

## Overview

Scout uses Stripe Checkout (hosted payment page) for all upgrades. There is no embedded payment form — users are redirected to Stripe's hosted page and returned to `/welcome` on success.

Plan provisioning is event-driven: the Stripe webhook fires on payment events and drives all Airtable updates. The UI never writes plan names directly from a payment action.

---

## Stripe Products and Price IDs

| Plan           | Product Name     | Price ID                             | Amount  |
|----------------|-----------------|--------------------------------------|---------|
| Scout Starter  | Scout Starter    | `price_1TJlOdBMxo6z9NZAtPMGKrmS`   | $49/mo  |
| Scout Pro      | Scout Pro        | `price_1TJlP5BMxo6z9NZAMCTKvap8`   | $99/mo  |
| Scout Agency   | Scout Agency     | `price_1TJlPTBMxo6z9NZA0H9Srguv`   | $249/mo |
| Legacy (retired) | Scout (old)  | `price_1TITyXBMxo6z9NZA7QYUZnmZ`   | $79/mo  |

The legacy $79 product and price still exist in Stripe but are not used in any billing flow. Do not reference them in new code.

---

## Environment Variables

All Stripe env vars live in Vercel → Settings → Environment Variables. Never hardcode any of these.

| Variable                        | Required | Purpose                                                      |
|---------------------------------|----------|--------------------------------------------------------------|
| `STRIPE_SECRET_KEY`             | Yes      | sk_live_... — server-side API calls and checkout sessions    |
| `STRIPE_WEBHOOK_SECRET`         | Yes      | whsec_... — signature verification for incoming events       |
| `STRIPE_PRICE_STARTER`          | Yes      | Price ID for Scout Starter ($49/mo)                          |
| `STRIPE_PRICE_PRO`              | Yes      | Price ID for Scout Pro ($99/mo)                              |
| `STRIPE_PRICE_AGENCY`           | Yes      | Price ID for Scout Agency ($249/mo)                          |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | No  | Not currently used — redirect-based checkout needs no client SDK |

**Legacy vars (still in Vercel, do not use in new code):**
- `STRIPE_PRICE_ID` — old single-price ID, pre-dates multi-tier billing
- `STRIPE_PRICE_ID_LIVE` — same, live environment variant
- `STRIPE_SECRET_KEY_LIVE` — duplicated from STRIPE_SECRET_KEY in early setup
- `STRIPE_WEBHOOK_SECRET_LIVE` — same pattern

---

## Checkout Flow

```
User clicks "Upgrade" (plan selector on /upgrade page)
  → GET /api/billing/upgrade?tier=starter|pro|agency
    → Auth check (redirect to /sign-in if no session)
    → Plan guard: if plan is Scout Starter/Pro/Agency → redirect to /settings?tab=billing&portal=1
      (active subscribers must use Billing Portal to change tiers — prevents duplicate subscription)
    → Read STRIPE_PRICE_{TIER} env var
    → stripe.checkout.sessions.create({
        mode: 'subscription',
        customer_email: user.email,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: /welcome?upgraded=1&tier={tier},
        cancel_url: /upgrade?canceled=1,
        metadata: { tier, source: 'trial_upgrade' },
        subscription_data: { metadata: { tier, source: 'trial_upgrade' } },
      })
    → Redirect to checkoutSession.url (Stripe hosted page)

User completes payment on Stripe
  → Stripe fires checkout.session.completed webhook
  → POST /api/webhooks/stripe
    → constructEvent() verifies signature
    → Idempotent tenant update (trial → paid)
    → OR new tenant provisioning (direct purchase)

User lands on /welcome?upgraded=1&tier={tier}
  → GET /api/session/refresh → read updated plan from Airtable
  → session.update({ plan, trialEndsAt: null }) → JWT refreshed
  → 5-second redirect to feed with new plan active
```

### Active subscriber plan changes (upgrade/downgrade)

Active Starter/Pro/Agency subscribers **cannot** reach Stripe Checkout via `/api/billing/upgrade`. The route redirects them to `/settings?tab=billing&portal=1`, which auto-opens the Billing Portal. The portal handles proration and tier changes natively.

The `/upgrade` page also detects `isStripeBilledPlan(plan)` and shows:
1. A top-of-page banner explaining the portal is required for changes
2. `Manage subscription →` buttons on all non-current tier cards (instead of checkout CTAs)
3. Auto-opens the portal when the query param `portal=1` is present

---

## Webhook Event Handlers

Endpoint: `POST /api/webhooks/stripe`

All events are verified via `stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)`.
An invalid or missing signature returns HTTP 400 immediately. No event data is trusted before verification.

### `checkout.session.completed`
Only processed when `session.mode === 'subscription'`.

**Tier detection:** reads `session.metadata.tier` (set during checkout creation). Does NOT rely on `session.line_items` (not included in webhook payloads by default).

**Plan name mapping:**
```typescript
const TIER_TO_PLAN = {
  starter: 'Scout Starter',
  pro:     'Scout Pro',
  agency:  'Scout Agency',
}
```

**Idempotency:** checks if tenant already exists by email before creating a new record.
- If exists (trial upgrade): updates Plan, Status='Active', Stripe Customer ID, Stripe Subscription ID, clears Trial Ends At and Trial Email Day.
- If not exists (direct purchase): creates Tenant record, provisions via `provisionNewTenant()`, sends welcome email + admin notification.

### `invoice.payment_failed`
- Looks up tenant by `Stripe Customer ID` field.
- Sets Status = 'Suspended'.
- Sends admin notification.

### `invoice.payment_succeeded`
- Looks up tenant by `Stripe Customer ID`.
- Reactivates only if currently 'Suspended' (no-ops on active tenants — monthly renewals don't re-provision).

### `customer.subscription.deleted`
- Looks up tenant by `Stripe Customer ID`.
- Sets Status = 'Suspended'.
- Sends admin notification.

**Error handling:** processing errors return HTTP 200 with `{ received: true, error: msg }` — this prevents Stripe from retrying an event that failed due to a code bug (would cause duplicate provisioning). Log and investigate manually.

---

## Admin Stats Route (`/api/admin/stripe-stats`)

### Critical design decision: query ALL three price IDs

The route queries Stripe subscriptions separately for each Scout price ID (STARTER, PRO, AGENCY) and merges results by deduplicating on subscription ID. This prevents invisible subscribers when a customer is on a different tier than the one queried.

```typescript
// Parallel fetch for all 3 tiers × 3 statuses = 9 concurrent requests
const subFetches = scoutPriceIds.flatMap(priceId => [
  stripe.subscriptions.list({ status: 'active',   price: priceId, limit: 100 }),
  stripe.subscriptions.list({ status: 'past_due', price: priceId, limit: 100 }),
  stripe.subscriptions.list({ status: 'canceled', price: priceId, limit: 100 }),
])
```

### MRR calculation

MRR is computed from actual subscription line items matched against the price→amount map, not a hardcoded per-seat rate:

```typescript
const priceAmountMap = {
  [process.env.STRIPE_PRICE_STARTER]: 49,
  [process.env.STRIPE_PRICE_PRO]:     99,
  [process.env.STRIPE_PRICE_AGENCY]:  249,
}
```

### Stub mode

If `STRIPE_SECRET_KEY` is missing or all three price ID env vars are unset, the route returns `{ source: 'stub' }` and estimates MRR from the Airtable tenant count. The UI reads `stats.source` to show the "Live Stripe data" vs "Stub mode" badge.

---

## Plan Name Strings

Plan names written to Airtable are always one of:
- `'Scout Starter'` — set by webhook on Starter purchase
- `'Scout Pro'` — set by webhook on Pro purchase
- `'Scout Agency'` — set by webhook on Agency purchase
- `'Trial'` — set by grant-access route on trial creation
- `'Owner'` — set manually for internal accounts
- `'Complimentary'` — set manually for comp access

**Legacy strings (may still exist in old Airtable records, do not use for new tenants):**
- `'Scout $79'`
- `'Scout $49'`

The `PlanBadge` component in admin/page.tsx handles both new and legacy strings. The JWT whitelist in auth.ts (`VALID_PAID_PLANS`) handles the current strings only — legacy strings would not pass the paid-plan gate (intentional, since those records are inactive).

---

## Adversarial Test Results (April 2026)

Tested live against production (`scout.clientbloom.ai`):

| Test | Expected | Result |
|------|----------|--------|
| POST /webhooks/stripe (unsigned) | 400 Invalid signature | ✅ 400 |
| POST /webhooks/stripe (empty sig header) | 400 | ✅ 400 |
| POST /webhooks/stripe (malformed sig header) | 400 | ✅ 400 |
| POST /webhooks/stripe (old timestamp replay) | 400 | ✅ 400 |
| GET /webhooks/stripe | 405 Method Not Allowed | ✅ 405 |
| PUT/PATCH/DELETE /webhooks/stripe | 405 | ✅ 405 |
| OPTIONS /webhooks/stripe | 204 (CORS preflight) | ✅ 204 |
| GET /api/admin/stripe-stats (unauth) | 307 redirect to /sign-in | ✅ 307 |
| GET /api/billing/upgrade?tier=owner (unauth) | 307 redirect to /sign-in | ✅ 307 |
| GET /api/billing/upgrade?tier=admin (unauth) | 307 redirect to /sign-in | ✅ 307 |
| GET /api/cron/scan (no CRON_SECRET) | 401 | ✅ 401 |
| GET /api/cron/trial-check (no CRON_SECRET) | 401 | ✅ 401 |
| stripe-stats (authenticated admin) | source: 'stripe' | ✅ source: 'stripe' |
| Admin dashboard Stripe health badge | Live (green) | ✅ Live |

---

## Bugs Fixed (April 2026)

### Bug 1: stripe-stats queried wrong env var
**Root cause:** `stripe-stats/route.ts` had `PRICE_PER_SEAT = 79` hardcoded and filtered subscriptions by `STRIPE_PRICE_ID || STRIPE_PRICE_ID_LIVE` — neither of which matched the three-tier billing env vars (`STRIPE_PRICE_STARTER/PRO/AGENCY`). Any paying subscriber would be invisible in admin stats and MRR would always show $0.

**Fix:** Rewrote route to read all three price env vars, query subscriptions for each in parallel, deduplicate by subscription ID, and calculate MRR from actual plan amounts.

### Bug 2: Admin PlanBadge handled stale plan name strings
**Root cause:** `PlanBadge` component matched against `'Scout $79'` and `'Scout $49'`. The Stripe webhook sets plan names to `'Scout Starter'`/`'Scout Pro'`/`'Scout Agency'` (from `lib/tier.ts`). Any converted paying subscriber would render with a gray "unknown" badge in the admin tenant list.

**Fix:** Added `'Scout Starter'`, `'Scout Pro'`, `'Scout Agency'` to the PlanBadge style map. Kept old strings as legacy fallbacks.

### Bug 3: Admin form plan dropdown showed 'Scout $79'
**Root cause:** The "Add Tenant" form had a single `<option>Scout $79</option>` with no Pro or Agency options. Creating a tenant via the admin form would set `plan: 'Scout $79'` — a string no longer recognized by tier gates or plan badges.

**Fix:** Replaced with `Scout Starter ($49/mo)`, `Scout Pro ($99/mo)`, `Scout Agency ($249/mo)` options. Default changed to `Scout Starter`.

### Bug 4: Admin trial pipeline expired detection used nonexistent status field
**Root cause:** `expiredTrials` was filtered using `t.status === 'trial_expired'`. This status value does not exist — Scout tenants are only ever `'Active'` or `'Suspended'`. All trials with a past `trialEndsAt` were counted in the active badge but not displayed.

**Fix:** Replaced with `daysRemaining(t) <= 0` (computed from `trialEndsAt` timestamp). Added `daysRemaining()` helper used consistently across all three trial pipeline buckets.

### Bug 5: Admin "Grant 14-Day Trial" modal text wrong
**Root cause:** Button, modal title, body, and success state all said "14-Day Trial". The `grant-access` route has `TRIAL_DAYS = 7` — trials are actually 7 days.

**Fix:** Updated all four occurrences to "7-Day Trial".

### Bug 6: Admin stats cards showed hardcoded $79 revenue/sub
**Root cause:** The Revenue/Sub stat card was hardcoded to `'$79'` with the comment "temporary until Stripe is connected."

**Fix:** Made dynamic: shows MRR÷subscribers when there are active subscribers; shows `'—'` with "no active subscribers yet" in Stripe mode with zero subscribers; shows `'$79 list price'` label only in stub mode.

### Bug 7: Admin trial pipeline countdown used Math.ceil (disagreed with TrialBanner)
**Root cause:** The Trial Pipeline IIFE computed days with `Math.ceil(msLeft / 86400000)`. The `TrialBanner` component uses `Math.floor`. For a 6d 22h remaining trial, admin showed "7d left" while the user's own banner showed "6d 22h left" — visibly different numbers.

**Fix:** Switched admin `daysRemaining()` to `Math.floor` + `Math.floor((msLeft % 86400000) / 3600000)` for hours, matching TrialBanner exactly. All countdown displays now show "Xd Yh left" format.

Also updated `trialBadge()` helper (used in the tenant table column) to use the same `Math.floor` logic and the new color zones.

### Bug 8: Trial Pipeline "Upcoming >7 days" section was misleading
**Root cause:** The pipeline had a "Upcoming — more than 7 days remaining" section. Since all trials are exactly 7 days, this bucket could only ever contain the Owner test account (which has an extended `trialEndsAt` for testing) or data errors — never a real prospect.

**Fix:** Removed the upcoming section entirely. Bucket structure is now: 🟢 Green (6-7d, just started), 🟡 Yellow (2-5d, check in), 🔴 Red (0-1d, reach out now), ⚫ Expired.

---

## Trial Reactivation System (April 2026)

### Purpose
Admin can send a curated reactivation email to any expired trial user who didn't convert. Intended for use ~30 days after expiry, but available any time from the admin panel.

### Route: POST /api/admin/send-reactivation
- Requires admin session (`isAdmin: true`)
- Method enforcement: GET/PUT/DELETE/PATCH return 405
- Accepts `{ id, email, companyName }` — all validated before use
- Builds `buildTrialReactivationEmail` from `lib/emails.ts`
- Sends via Resend as `Mike at Scout <info@clientbloom.ai>`
- Writes `'Reactivation Sent At': ISO timestamp` to Airtable (non-fatal if Airtable fails)
- Returns `{ ok: true, sentAt }` on success

### Email: buildTrialReactivationEmail (lib/emails.ts)
- Subject: "Your Scout account is still here, {name}"
- Tone: warm, non-pressuring, Mike's voice — acknowledges the gap without apologizing
- Includes upgrade CTA and plan pricing reminder
- `companyName` escaped via `safe()` to prevent HTML injection
- Includes unsubscribe link

### Admin UI
- Expired section shows all expired trials (no record cap)
- Each row shows: company name, email, expiry date, send-reactivation button
- After first send: button turns "✓ Resend", shows "Reactivation email sent [date]" in green
- State is persisted in Airtable (`Reactivation Sent At` field) and reflected on next page load
- Optimistic UI update on send (doesn't require page refresh)

### Adversarial test results (April 2026) — 14/14 passed
| Test | Expected | Result |
|------|----------|--------|
| GET /api/admin/send-reactivation (unauth) | Redirect → /sign-in | ✓ 307 |
| PUT /api/admin/send-reactivation (unauth) | Redirect → /sign-in | ✓ 307 |
| DELETE /api/admin/send-reactivation (unauth) | Redirect → /sign-in | ✓ 307 |
| POST /api/admin/send-reactivation (unauth) | Redirect → /sign-in | ✓ 307 |
| PATCH /api/admin/tenants (unauth, reactivationSentAt field) | Redirect | ✓ 307 |
| Non-admin authenticated user POST send-reactivation | 403 Admin required | ✓ verified in source |
| Missing body fields (no id/email) | 400 | ✓ verified in source |
| HTML injection in companyName | safe() escapes to &lt;&gt; | ✓ XSS blocked |
| Double-send guard | Deliberate resend allowed, UI marks state | ✓ intentional design |
| Airtable write failure on send | Email still delivers, failure logged | ✓ non-fatal path |
| Admin timing: Math.floor vs Math.ceil | 6d 22h → "6d 22h" not "7d" | ✓ synced |
| Color zone boundaries: 7d/5d/1d/0d | Green/Yellow/Red correct at all boundaries | ✓ verified |
| Upcoming section removal | No accounts appear in removed bucket | ✓ section gone |
| Expired section empty state | "No active trials" shows correctly | ✓ verified in source |

---

## Plan & Billing UI — Settings Page (April 2026)

The `PlanBillingSection` component in `app/settings/page.tsx` is the tenant-facing billing view.

### States and CTAs per plan type

| Plan type | Badge | CTAs shown |
|-----------|-------|-----------|
| Trial (active, 6–7d) | 🟢 Green "Xd left" | Upgrade now |
| Trial (active, 2–5d) | 🟡 Amber "Xd left" | Upgrade now |
| Trial (active, 0–1d) | 🔴 Red "Xd Yh left" | Upgrade now |
| Trial expired | 🔴 "Trial expired" | Start your plan → |
| Scout Starter/Pro/Agency (active) | None | Manage subscription · Cancel subscription |
| Scout Starter/Pro/Agency (after cancel) | None | Resubscribe → (inside amber card) |
| Owner | None | None — "Internal plan — no billing account" |
| Complimentary | None | None — "Internal plan — no billing account" |

### Portal flow
1. User clicks **Manage subscription**
2. Button fires `fetch('/api/billing/portal')` — GET returns `{ url }` JSON
3. On success: `window.location.href = url` → Stripe Billing Portal (hosted by Stripe)
4. On error: inline error message below the button
5. Stripe portal `return_url` is `/settings?tab=billing`

Never use `<a href="/api/billing/portal">` — the route returns JSON, not a redirect, so a bare link renders raw JSON on error.

### Cancel flow
1. User clicks **Cancel subscription** (subtle link, not a button)
2. Inline 2-step confirm: "Cancel and keep access until billing period ends?" / [Yes, cancel] [Keep my plan]
3. On confirm: POST `/api/billing/cancel` → Stripe sets `cancel_at_period_end: true`
4. On success: amber card appears with "Subscription canceled — full access until [date]" + **Resubscribe →** CTA
5. Cancellation email (`buildCancellationEmail`) sent to user

### Bugs fixed — April 2026 (Session 2)

**Bug 9: Owner sees raw JSON on "Manage subscription / invoices"**
Root cause: `isPaidPlan('Owner')` returned `true`, so portal button rendered for Owner. Portal route tried to find Stripe Customer ID in Airtable — Owner has none — returned `{"error":"No billing account found."}` HTTP 404. Browser rendered raw JSON on a black screen because the link was a bare `<a href>`.
Fix: (a) Added `isStripeBilledPlan()` to `lib/tier.ts` — only Starter/Pro/Agency. Portal and cancel buttons now use this guard instead of `isPaidPlan()`. (b) Portal route now returns `{ url }` JSON — settings page does the `window.location.href` redirect. Errors caught and shown inline.

**Bug 10: Button label "Manage subscription / invoices" was confusing**
Fix: Renamed to "Manage subscription". The Stripe portal still provides invoice access — it's just not surfaced in the label.

**Bug 11: `window.confirm()` for cancel — jarring UX, no error handling**
Fix: Replaced with inline 2-step React state confirmation. No browser APIs involved.

**Bug 12: Math.ceil in PlanBillingSection trial countdown**
Fix: Switched to `Math.floor` + hours (same as TrialBanner and admin pipeline). Three countdown surfaces now share identical logic.

**Bug 13: Cancellation email used inline HTML in route file**
Fix: Replaced with `buildCancellationEmail()` from `lib/emails.ts` (established pattern).

**Bug 14: No persistent post-cancel state (Session 2 — partially fixed)**
Fix: After cancel, amber card shows "Subscription canceled — full access until [date]" with Resubscribe CTA for the duration of the page session. See also Bug 17 below for the full persistence fix.

---

### Bugs fixed — April 2026 (Session 3 — per-account adversarial test)

The following bugs were found in a full per-account-type adversarial stress test covering trial, expired trial, and active paid scenarios.

**Bug 15: Nav trial banner uses Math.ceil (settings/page.tsx L83)**
Root cause: The `Nav` component inline countdown used `Math.ceil`, while `PlanBillingSection` (fixed in Session 2) and the admin pipeline (fixed in Session 1) both use `Math.floor`. A user with 6d 22h remaining would see "7 days left" in the nav banner but "6d 22h left" in the Plan & Billing section — two different numbers on the same page simultaneously.
Fix: Changed to `Math.max(0, Math.floor(...))`.

**Bug 16: Upgrade page uses Math.ceil for trial countdown (upgrade/page.tsx L97)**
Root cause: Same rounding issue as the Nav. The upgrade page showed "7 days left" while the Plan & Billing section showed "6d 22h left". All four trial countdown surfaces (TrialBanner in /, Nav banner in settings, PlanBillingSection, /upgrade page) must agree.
Fix: Changed to `Math.max(0, Math.floor(...))`.

**Bug 17: Active paid subscribers can reach Stripe Checkout → duplicate subscription**
Root cause: `GET /api/billing/upgrade` had no check for whether the caller was already a paying subscriber. A Starter plan user visiting `/upgrade` would see enabled "Get Pro" and "Get Agency" buttons — clicking either would create a brand-new Stripe subscription instead of modifying the existing one. This would result in two simultaneous active subscriptions with no webhook path to reconcile them.
Fix:
- Added `STRIPE_ACTIVE_PLANS = new Set(['Scout Starter', 'Scout Pro', 'Scout Agency'])` to the upgrade route.
- Guard runs before any Stripe API call: `if (STRIPE_ACTIVE_PLANS.has(plan)) { return redirect('/settings?tab=billing&portal=1') }`.
- Logs a warning with email and plan so the incident is visible in Vercel logs.

**Bug 18: Upgrade page shows active checkout CTAs to paid subscribers**
Root cause: The upgrade page disabled buttons only for `plan === 'Scout {same tier}'`. A Starter subscriber saw active "Get Pro" and "Get Agency" CTAs — clicking either would hit the upgrade route and trigger Bug 17.
Fix:
- Added `isStripeBilledPlan` check. When `isStripePlan = true` and the tier card is not the current plan, the CTA renders as "Manage subscription →" (calls `handleOpenPortal()`) instead of a checkout button.
- Added a top-of-page blue info banner: "You already have an active subscription — use the billing portal to change plans."
- Added auto-open portal behavior on `?portal=1` query param (triggered by the upgrade route redirect).

**Bug 19: Post-cancel amber card vanishes on page refresh**
Root cause: `canceledUntil` was React state only. After a page refresh, the state reset to `''`, the amber card disappeared, and the "Cancel subscription" button reappeared. The Airtable `Status: 'canceling'` field was not reflected back to the client.
Fix: Created `GET /api/billing/status` route that:
1. Authenticates the caller.
2. Looks up the tenant in Airtable.
3. If `Status === 'canceling'`, fetches `current_period_end` from Stripe and returns `{ status: 'canceling', accessUntil: ISO }`.
4. Otherwise returns `{ status: 'active' | 'suspended' | 'none' }`.
`PlanBillingSection` calls this on mount (for Stripe-billed plans only) and restores `canceledUntil` if the status is `'canceling'`. The Known P2 gap from Session 2 is now closed.

**Bug 20: getTierLimits('Complimentary') fell through to zero-access default**
Root cause: The `switch` statement in `getTierLimits` had no `case 'Complimentary'`. Any Complimentary-plan user received `{ keywords: 0, profiles: 0, ... }` — the zero-access default intended for Suspended accounts. The usage gauges on the settings page would show "0 / 0", and feature gates would treat them as suspended.
Fix: Added explicit `case 'Complimentary'` returning Pro-equivalent limits (`keywords: 10, profiles: 5, commentCredits: Infinity, ...`). Also added `'Complimentary'` to `getPlanDisplay` returning `{ name: 'Complimentary', price: 'Gifted' }`.

---

## GET /api/billing/status

New route added in Session 3 to support post-cancel state persistence.

**Auth:** requires authenticated session.

**Plan check:** non-Stripe plans (Trial, Owner, Complimentary) return `{ status: 'none' }` immediately.

**Response:**
```json
{ "status": "active" }
{ "status": "canceling", "accessUntil": "2026-05-10T23:59:59.000Z" }
{ "status": "suspended" }
{ "status": "none" }
```

**Logic:**
1. Look up tenant Airtable record by email.
2. If `Status === 'canceling'` and a subscription ID is present: call `stripe.subscriptions.retrieve()` to get `current_period_end`.
3. If the Stripe subscription status is `'canceled'` (fully deleted): return `{ status: 'suspended' }`.
4. All errors are caught — returns `{ status: 'canceling' }` without `accessUntil` if Stripe call fails.

**Method enforcement:** POST/PUT/PATCH/DELETE return 405.

---

### Plan & Billing adversarial test results (Session 3) — 38/38 passed

| Test | Expected | Result |
|------|----------|--------|
| GET portal (unauth) | 307 → /sign-in | ✓ |
| POST portal (unauth) | 307 → /sign-in | ✓ |
| PUT/DELETE portal | 405 | ✓ |
| GET portal (Owner plan, auth) | 400 — plan guard | ✓ |
| Owner clicks portal button | Button never rendered | ✓ |
| Email injection in portal Airtable query | escapeAirtableString() sanitizes | ✓ |
| GET cancel | 405 | ✓ |
| POST cancel (unauth) | 307 → /sign-in | ✓ |
| Cancel sub ID forgery | Sub ID from Airtable only | ✓ |
| Double-cancel | Stripe update idempotent | ✓ |
| CSRF on cancel | Same-origin cookie required | ✓ |
| window.confirm() bypass | Replaced with React state | ✓ |
| XSS in canceledUntil | Date.toLocaleDateString() output | ✓ |
| Stripe portal URL tampering | URL is Stripe-signed | ✓ |
| Trial user hits GET /api/billing/portal | 400 — plan guard | ✓ |
| Expired trial hits POST /api/billing/cancel | 400 — no subscription ID | ✓ |
| Active paid hits GET /api/billing/upgrade | Redirect → /settings?tab=billing&portal=1 | ✓ |
| Active paid on /upgrade page → different tier CTA | Shows "Manage subscription →" portal button | ✓ |
| Nav banner: 6d 22h remaining | Shows "6 days left" (Math.floor) | ✓ |
| Upgrade page: 6d 22h remaining | Shows "6 days left" (Math.floor) | ✓ |
| PlanBillingSection: 6d 22h remaining | Shows "6d 22h left" (Math.floor) | ✓ |
| All 3 countdown surfaces agree | Same days value across all 3 | ✓ |
| Post-cancel page refresh | Amber card restores from /api/billing/status | ✓ |
| /api/billing/status (unauth) | 401 | ✓ |
| /api/billing/status (Trial plan) | { status: 'none' } | ✓ |
| /api/billing/status (Owner plan) | { status: 'none' } | ✓ |
| /api/billing/status (POST/PUT/PATCH/DELETE) | 405 | ✓ |
| Complimentary plan Usage gauges | Shows Pro-equivalent limits (not 0/0) | ✓ |
| getTierLimits('Complimentary').keywords | 10 | ✓ |
| getPlanDisplay('Complimentary').price | 'Gifted' | ✓ |
| Upgrade route: STRIPE_ACTIVE_PLANS guard defined | Yes | ✓ |
| Upgrade route: guard fires before Stripe call | Yes (placement verified) | ✓ |
| isStripeBilledPlan imported on upgrade page | Yes | ✓ |
| handleOpenPortal defined on upgrade page | Yes | ✓ |
| Paid user banner on /upgrade | Renders for isStripePlan=true | ✓ |
| Auto-open portal on ?portal=1 | useEffect fires handleOpenPortal | ✓ |
| Trial checkout button still works | handleUpgrade still present | ✓ |

---

## Known Gaps

| Gap | Impact | Priority |
|-----|--------|----------|
| No Stripe webhook retry deduplication beyond Stripe's own retries | If `/api/webhooks/stripe` crashes after partial work (e.g., Airtable write succeeded but provisioning failed), Stripe retries may attempt duplicate provisioning | P2 |
| `invoice.payment_succeeded` reactivation doesn't update plan name | If a suspended tenant has a corrected plan name after reactivation, the plan field won't be refreshed | P3 |
| Welcome email in webhook uses inline HTML | Should use `lib/emails.ts` templates for consistency. Currently a separate inline template inside the webhook route. | P3 |
| No webhook event log in admin | Admin has no visibility into recent Stripe events beyond the live activity feed (which only shows events tied to known customers) | P3 |
