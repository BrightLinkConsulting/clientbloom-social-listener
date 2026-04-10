# Scout Email System

## Last updated: April 2026

---

## 1. Architecture Overview

All email HTML lives in **`dashboard/lib/emails.ts`** — the single source of truth for
every template Scout sends. Route files never contain inline HTML. They import a builder
function, call it, and pass the result to Resend.

### Why centralized

Previously, email HTML was scattered across multiple route files (`trial/start`,
`trial-check`, `webhooks/stripe`). This produced:
- Duplicated styles with no consistent brand colors
- Missing unsubscribe links (CAN-SPAM violation risk)
- No way to update a template without hunting down every copy
- Name personalization bugs (see section 4)

### Call pattern

```typescript
import { buildTrialDay2Email } from '@/lib/emails'

const unsubUrl = `${BASE_URL}/api/unsubscribe?email=${encodeURIComponent(email)}`
const { subject, html } = buildTrialDay2Email({ appUrl: BASE_URL, unsubUrl })

await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ from: FROM, to: [email], subject, html }),
})
```

---

## 2. Brand Constants

```typescript
const BRAND_BLUE   = '#4F6BFF'   // Non-trial transactionals only (password reset, billing)
const BRAND_PURPLE = '#7C3AED'   // All trial emails — header + CTA buttons
const BRAND_PINK   = '#E91E8C'   // Agency plan accent (Days 5–7 body elements only)
const BRAND_DARK   = '#0a0c10'   // Expiry + win-back headers (darker tone = urgency)
```

**Rule (updated April 2026):** ALL trial day emails (Days 1–7) use `logoHeader()` with
`BRAND_PURPLE` header background and `BRAND_PURPLE` CTA buttons. `BRAND_BLUE` is reserved
for non-trial transactionals only (password reset, billing alerts, admin emails).
Days 5–7 body elements (infoBox border, table column header, CTA button) still use
`planCopy.color` for plan-specific urgency styling — but the email header itself is
always `logoHeader()` regardless of plan.

---

## 3. Layout Helpers

`lib/emails.ts` provides composable helper functions so templates stay readable:

| Helper | Signature | Purpose |
|--------|-----------|---------|
| `header(text, color?)` | `string → string` | Standard colored header bar with text |
| `logoHeader(color?)` | `string → string` | All trial day headers (Days 1–7) — ClientBloom mark + "Scout / by ClientBloom" stacked text. Default color: `BRAND_PURPLE`. |
| `footer(unsubUrl)` | `string → string` | CAN-SPAM footer with physical address and unsubscribe link |
| `wrap(header, body, footerHtml)` | `string → string` | Outer container div (max-width 540px) |
| `cta(label, href, color?)` | `string → string` | Styled call-to-action button |
| `infoBox(content, borderColor?)` | `string → string` | Highlighted box with left border |
| `calloutBox(title, items[], color?)` | `string → string` | Numbered/bulleted callout section |
| `p(content, style?)` | `string → string` | Paragraph with standard body styling |
| `h2(content)` | `string → string` | Section heading |

### `logoHeader()` implementation note

The Day 1 header includes the ClientBloom mark (three-ellipse SVG in yellow, pink, and
green) alongside stacked "Scout / by ClientBloom" text. It uses a `<table>` layout
instead of flexbox for maximum email-client compatibility (Outlook and some mobile clients
ignore CSS flexbox):

```typescript
function logoHeader(color: string = BRAND_PURPLE): string {
  return `<div style="background:${color};padding:18px 28px;border-radius:12px 12px 0 0">
    <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
      <tr>
        <td style="vertical-align:middle;padding-right:10px">
          <svg width="28" height="28" viewBox="0 0 100 100" fill="none" ...>
            <ellipse cx="50" cy="21" rx="24" ry="13" fill="#F7B731"/>
            <ellipse cx="20" cy="52" rx="13" ry="25" fill="#E91E8C"/>
            <ellipse cx="80" cy="52" rx="13" ry="25" fill="#00B96B"/>
          </svg>
        </td>
        <td style="vertical-align:middle">
          <p style="color:#fff;font-size:16px;font-weight:700;margin:0;line-height:1.2">Scout</p>
          <p style="color:rgba(255,255,255,0.65);font-size:11px;...">by ClientBloom</p>
        </td>
      </tr>
    </table>
  </div>`
}
```

The SVG uses the same three ellipses as the `ClientBloomMark` React component in
`app/sign-in/page.tsx` — inline because email clients cannot load external SVG files.

---

## 4. No-Name Personalization Policy

**Scout does not use recipient names in any trial or post-trial email.**

### Why

1. Sign-up collects only email and password — no name field exists on the form.
2. The Airtable `Company Name` field is populated by auto-provision, not user input,
   and may contain an email address (e.g. `Info@brightlinkconsulting.com`) or a business
   name that reads awkwardly as a greeting.
3. Attempting to derive a first name from these values produces broken output:
   `"Welcome, Info@brightlinkconsulting.com"` or `"Welcome, BrightLink Consulting"`.

### What to use instead

Remove greeting lines entirely. Headlines carry the opening weight:

```
Day 2: The one comment framework that works on LinkedIn

Most people comment the same three ways: "Great point!" · "So true!" · ...
```

Day 1 uses a declarative statement for the headline:
```
Your 30-Day LinkedIn Authority Challenge starts today.
```

**Do not add personalization back** unless the sign-up form is explicitly updated to
collect a validated first name field.

---

## 5. CAN-SPAM Compliance

All marketing/nurture emails include a `footer()` call with a working unsubscribe link
and physical address. Transactional emails (password reset, team invite, billing receipts)
are exempt from the unsubscribe requirement.

### Footer output

```
You're receiving this because you signed up for a Scout by ClientBloom trial.
ClientBloom · 1234 Innovation Way · San Bernardino, CA 92401
[Unsubscribe from trial emails]
```

The physical address constant is `PHYSICAL_ADDR` in `lib/emails.ts`. Update it there
if the business address changes — it propagates to all templates automatically.

### Unsubscribe endpoint

`GET /api/unsubscribe?email=...`

- Finds the tenant record in Airtable by email
- Sets `Email Opted Out = true`
- Returns an HTML confirmation page (no login required)
- Returns "success" even for unknown emails (privacy/idempotency)
- Only opts out of marketing/trial emails — transactional emails continue

### Opted-out check in trial-check cron

```typescript
const optedOut = !!record.fields['Email Opted Out']
if (optedOut) { results.optedOut++; continue }
```

This check happens before any send attempt. The `'Email Opted Out'` field must be
included in `fetchTrialTenants()` field list — it is.

### Footer signature

```typescript
function footer(unsubUrl: string): string
```

The footer does **not** accept a `recipientEmail` parameter. Earlier versions passed
`firstName` as the email argument by mistake, producing nonsensical output in the footer
text. The current version says "because you signed up" without naming the address.

---

## 6. Trial Email Sequence

| Day | Builder function | Sent by | Subject |
|-----|-----------------|---------|---------|
| 1 | `buildTrialDay1Email(opts)` | `app/api/trial/start/route.ts` (on signup) | "Welcome — your 30-Day LinkedIn Authority Challenge starts today" |
| 2 | `buildTrialDay2Email(opts)` | `app/api/cron/trial-check/route.ts` | "Day 2: The comment that gets you remembered (copy-paste ready)" |
| 3 | `buildTrialDay3Email(opts)` | trial-check cron | "Day 3: How to tell if it's working (look for these 3 things)" |
| 4 | `buildTrialDay4Email(opts)` | trial-check cron | "Day 4: When you comment matters more than what you say" |
| 5 | `buildTrialDay5Email(opts)` | trial-check cron | "Day 5: What 30 days of this actually looks like (your trial ends in 2 days)" |
| 6 | `buildTrialDay6Email(opts)` | trial-check cron | "Day 6: Tomorrow your trial ends — here's exactly what stops at day 7" |
| 7 | `buildTrialDay7Email(opts)` | trial-check cron | "Your Scout trial ends tonight — you're 23% of the way there" |
| Expiry | `buildTrialExpiredEmail(opts)` | trial-check cron | "Your Scout trial has ended — your leads are waiting" |
| Win-back (3-day) | `buildTrialWinBackEmail(opts)` | (manual / future cron) | "One last thing about your Scout trial" |
| Reactivation (30-day) | `buildTrialReactivationEmail(opts)` | Admin panel — POST /api/admin/send-reactivation | "Your Scout account is still here, {name}" |

### `opts` shape by email type

**Day 1** (`trial/start/route.ts`):
```typescript
buildTrialDay1Email({ appUrl: string; unsubUrl: string })
```

**Days 2–4** (no upgrade CTA):
```typescript
buildTrialDay2Email({ appUrl: string; unsubUrl: string })
// same shape for Days 3 and 4
```

**Days 5–7** (upgrade CTA, plan-aware color):
```typescript
buildTrialDay5Email({ appUrl: string; upgradeUrl: string; unsubUrl: string; plan?: RecommendedPlan })
// Day 6 and 7 don't have appUrl (no "open feed" CTA at this stage)
buildTrialDay6Email({ upgradeUrl: string; unsubUrl: string; plan?: RecommendedPlan })
buildTrialDay7Email({ upgradeUrl: string; unsubUrl: string; plan?: RecommendedPlan })
```

**Expiry and win-back**:
```typescript
buildTrialExpiredEmail({ upgradeUrl: string; unsubUrl: string })
buildTrialWinBackEmail({ upgradeUrl: string; unsubUrl: string })
```

**30-day reactivation** (admin-triggered from `/admin` → send-reactivation button):
```typescript
buildTrialReactivationEmail({
  companyName: string  // HTML-escaped via safe() — may be an email address
  email:       string  // used in subject line fallback and unsubscribe URL
  upgradeUrl:  string  // /upgrade
  unsubUrl:    string  // /api/unsubscribe?email=...
})
```
Note: `companyName` is always run through `safe()` inside the builder — XSS-safe even if the field contains user-supplied HTML.

### Day dispatcher (for cron use)

```typescript
buildTrialDayEmail(day: number, opts: {
  appUrl: string; upgradeUrl: string; unsubUrl: string; plan?: RecommendedPlan
}): EmailTemplate | null
```

The `trial-check` cron uses `buildEmailForDay(day, email)` (a local wrapper that builds
the `opts` object and calls `buildTrialDayEmail`). Day 1 is excluded from the cron — it
is always sent at signup time.

---

## 7. Plan-Aware Upgrade CTAs (Days 5–7)

Days 5, 6, and 7 include a plan recommendation based on `opts.plan`:

| Value | Label | Price | Body accent color | ICP highlight copy |
|-------|-------|-------|-------------------|--------------------|
| `'starter'` | "Continue with Starter →" | $49/month | `BRAND_PURPLE` | "3 keyword searches, 10 ICP profiles scanned (50-profile pool), 1 daily scan" |
| `'pro'` | "Continue with Pro →" | $99/month | `BRAND_PURPLE` | "10 keyword searches, 25 ICP profiles scanned (150-profile pool), 2 daily scans, Slack digest" |
| `'agency'` | "Continue with Agency →" | $249/month | `BRAND_PINK` | "20 keyword searches, 50 ICP profiles scanned (500-profile pool), 2 daily scans, up to 5 user seats" |

Default is `'pro'` when no plan is specified. The trial-check cron currently does not
pass a plan — this is a future improvement (matching the recommended plan to usage data).

---

## 8. Transactional Emails

These are in `lib/emails.ts` but are exempt from unsubscribe requirements:

| Builder | Trigger | Notes |
|---------|---------|-------|
| `buildPurchaseWelcomeEmail(opts)` | Stripe webhook (new purchase, no existing account) | Contains temp password; no unsubscribe link |
| `buildTeamInviteEmail(opts)` | Team invite route | No unsubscribe link |
| `buildPasswordResetEmail(opts)` | Forgot-password route | 1-hour expiry token; no unsubscribe link |

Admin alert builders (`buildAdminNewTrialEmail`, `buildAdminPurchaseEmail`, etc.) are
also in `lib/emails.ts` and sent to the `ADMIN_EMAIL` env var.

---

## 8a. Service Flag Emails (Health Alerts)

Deployed April 2026. These are customer-facing transactional alerts sent by the
`service-check` cron when a tenant's account has actionable health issues.

**Builder:** `buildServiceFlagEmail(opts: ServiceFlagEmailOpts)`

**From:** `Scout <info@clientbloom.ai>`
**To:** Tenant's email address (from Airtable)
**Sent by:** `lib/notify.ts` → `sendServiceFlagEmail()` → called from `app/api/cron/service-check/route.ts`

### Flag email content map

| Flag code | Subject fragment | Header color | CTA link |
|-----------|-----------------|--------------|----------|
| `nothing_to_scan` | "Scout isn't scanning yet" | amber | /settings |
| `paid_zero_posts` | "Scout isn't finding content" | amber | /settings |
| `scan_failed` | "your last scan hit an error" | red | /dashboard |
| `paid_no_scan_48h` | "scans haven't run in 2 days" | red | /dashboard |
| `trial_no_setup` | "get more from your Scout trial" | amber | /settings |
| `paid_no_scan_ever` | "let's run your first scan" | amber | /dashboard |

Single-flag emails: subject is `"Scout alert: {subjectFragment}"`.
Multi-flag emails: subject is `"Action needed on your Scout account (N issues)"` for 3+ flags, or `"A quick note about your Scout account"` for 2. Header color is red if any critical flag is present, amber otherwise.

### `ServiceFlagEmailOpts` shape

```typescript
interface ServiceFlagEmailFlag {
  code:     string
  severity: 'critical' | 'warning' | 'info'
  message:  string
}

interface ServiceFlagEmailOpts {
  appUrl:   string               // e.g. 'https://scout.clientbloom.ai'
  flags:    ServiceFlagEmailFlag[]
}
```

### Dedup rules (enforced in the cron, not in the builder)

`buildServiceFlagEmail` is a pure builder — it does not check dedup state. All dedup
logic lives in `dispatchNotifications()` in `service-check/route.ts`:

1. **24h cooldown** (`Service Flag Email Sent At` in Airtable): No email within 24 hours of the last send, regardless of which flags are present.
2. **Per-code tracking** (`Last Flag Codes Emailed` in Airtable): Once a flag code has been emailed, it is never emailed again for the same account — even after the cooldown resets. Only codes not yet in this list trigger a send.

On recovery (all actionable flags clear), `Last Flag Codes Emailed` is reset to `[]` so the next occurrence triggers a fresh email. `Service Flag Email Sent At` is deliberately NOT reset — this preserves flapping protection so a heal/break cycle within 24 hours does not immediately re-notify.

### No-unsubscribe policy

Service flag emails do not include an unsubscribe link. They are operational alerts about
account health, not marketing. Opted-out (`Email Opted Out = true`) accounts still receive
service flag emails.

### Adding a new flag email

1. Add a `[code]: { subjectFragment, message, ctaText, ctaPath }` entry to the `FLAG_CONTENT` record in `lib/emails.ts`
2. Add the code to `CUSTOMER_EMAIL_CODES` in `app/api/cron/service-check/route.ts`
3. Update the flag reference table in `docs/service-manager.md` and the email flag table in `docs/usage-service-manager.md`

---

## 9. Post-Payment Welcome Page + Session Refresh

When a user upgrades from a trial, Stripe redirects to `/welcome?upgraded=1&tier=starter|pro|agency`.

The welcome page (`app/welcome/page.tsx`) handles two distinct flows:

**Flow A — New account purchase** (no `?upgraded` param): Shows "check your email"
instructions. No session manipulation needed.

**Flow B — Trial → paid upgrade** (`?upgraded=1`):
1. Calls `GET /api/session/refresh` (authenticated) — re-reads `Plan` and `Trial Ends At`
   from Airtable
2. Calls `session.update({ plan, trialEndsAt })` from NextAuth to update the JWT
3. Starts a 5-second countdown, then auto-redirects to `/` (feed)
4. Shows a tier-specific celebration UI (Starter = blue, Pro = purple, Agency = pink)

### Session refresh endpoint

`GET /api/session/refresh` — requires auth, reads from Airtable (not JWT), returns
`{ plan: string, trialEndsAt: string | null }`.

### JWT update security (auth.ts)

`session.update()` in NextAuth v4 is callable from the client. The `jwt()` callback
in `lib/auth.ts` whitelists the only valid paid-plan values before accepting an update:

```typescript
const VALID_PAID_PLANS = new Set([
  'Scout Starter', 'Scout Pro', 'Scout Agency', 'Owner',
])
const incomingPlan = (sessionUpdate as any).plan
if (incomingPlan !== undefined && VALID_PAID_PLANS.has(incomingPlan)) {
  token.plan = incomingPlan
}
```

**Why this matters:** Without the whitelist, a trial user could call
`session.update({ plan: 'Scout Agency' })` from the browser console and bypass
`isPaidPlan()` checks and `getTierLimits()` comment credit limits. The whitelist
rejects any plan string that isn't a known paid plan — a trial user's `plan === 'Trial'`
would never pass the `VALID_PAID_PLANS.has()` check.

---

## 10. Adding a New Email Template

1. Add a builder function to `lib/emails.ts` following the existing pattern:
   - Accept `opts` (no `firstName` — see section 4)
   - Call `wrap(header(...), body, '')` where `body` includes `${footer(opts.unsubUrl)}`
     for any marketing email
   - Return `{ subject: string, html: string }`
2. Export it
3. Import in the route that sends it
4. Test locally with `RESEND_API_KEY` unset — the cron routes log "would send" instead
   of actually sending

---

## 11. Known Gaps / Future Work

| Gap | Priority | Notes |
|-----|----------|-------|
| Win-back email (3-day) has no automated trigger — must be sent manually | P2 | Needs a win-back cron (e.g. runs 3 days after trial_expired status is set) |
| Reactivation email (30-day) has no automated trigger — admin clicks manually | P3 | Could be automated: cron fires 30d after trialEndsAt when plan is still Trial and no Stripe subscription exists |
| Days 5–7 don't receive a plan recommendation — all default to 'pro' | P3 | Could key off usage (keyword count, ICP count) to recommend starter vs. pro |
| No open/click tracking on trial emails | P3 | Resend supports webhooks for open/click events |
| `buildPurchaseWelcomeEmail` still uses `companyName.split(' ')[0]` for greeting | P2 | Same name-extraction risk as the trial emails — revisit when purchase flow adds a name field |
