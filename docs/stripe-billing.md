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

## Known Gaps

| Gap | Impact | Priority |
|-----|--------|----------|
| No Stripe webhook retry deduplication beyond Stripe's own retries | If `/api/webhooks/stripe` crashes after partial work (e.g., Airtable write succeeded but provisioning failed), Stripe retries may attempt duplicate provisioning | P2 |
| `invoice.payment_succeeded` reactivation doesn't update plan name | If a suspended tenant has a corrected plan name after reactivation, the plan field won't be refreshed | P3 |
| No Stripe customer portal link | Subscribers can't self-manage billing (cancel, update card) without contacting admin | P2 |
| Welcome email in webhook uses inline HTML | Should use `lib/emails.ts` templates for consistency. Currently a separate inline template inside the webhook route. | P3 |
| No webhook event log in admin | Admin has no visibility into recent Stripe events beyond the live activity feed (which only shows events tied to known customers) | P3 |
