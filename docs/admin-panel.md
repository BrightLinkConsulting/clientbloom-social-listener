# Scout — Super Admin Panel

## Last updated: April 2026

---

## 1. Overview

The super admin panel lives at `/admin` and is gated by `session.user.isAdmin === true`. It is intended for ClientBloom internal use only — it grants full visibility into all tenant accounts, billing data, and scan activity, and allows destructive account operations.

**Access:** Log in as any account whose Airtable `Is Admin` field is `true`. The panel is not linked from any public navigation — navigate directly to `https://scout.clientbloom.ai/admin`.

**Scope:** `isAdmin` is not an account-level settings flag. It grants full super admin access to the `/admin` panel and all `/api/admin/*` routes. Do not grant this to customers.

---

## 2. Panel sections

### System health strip

Three-column status strip at the top of the panel:

| Column | What it shows |
|--------|--------------|
| Stripe | Live mode or Stub mode (based on `STRIPE_SECRET_KEY` prefix: `sk_live_` vs `sk_test_`) |
| Airtable | Total tenant count queried from Airtable in real time |
| Auth & Access | Reminder that `isAdmin` is super admin access, not account settings access |

### Trial pipeline (below system health)

Shows all accounts currently on `plan='Trial'`, sorted by urgency. Color-coded by days remaining:

| Badge color | Days remaining | Meaning |
|-------------|---------------|---------|
| Green | 6–7 days | Just started |
| Amber | 2–5 days | Worth a check-in |
| Red | 0–1 days | Urgent — likely to churn |
| Grey (Expired section) | Past expiry | Can send reactivation email |

The "Send Reactivation Email" button is only shown on expired trials. It calls `POST /api/admin/send-reactivation` and records the send timestamp in `Reactivation Sent At`.

### Stripe revenue stats

Queries all three active Stripe price IDs in parallel and computes:

- Active subscriber count per plan
- MRR per plan (using actual amounts: $49 / $99 / $249)
- Total MRR

Source of truth: `GET /api/admin/stripe-stats`

### Tenant list

The main data table. See section 4 for full details.

---

## 3. Add Tenant form

The "Add Tenant" form creates a record in the Airtable `Tenants` table. It does **not** send any email. It does **not** create a Stripe customer. It is for internal account provisioning only.

### Plan dropdown — canonical values

```
Non-billed (recommended for manual add):
  Complimentary — gifted Pro-level access (no Stripe, no expiry)
  Trial         — 7-day access (use Grant Trial button for automated email)
  Owner         — full internal access

Paid plans (no billing created automatically):
  Scout Starter — $49/mo  (Airtable record only — no Stripe customer)
  Scout Pro     — $99/mo  (Airtable record only — no Stripe customer)
  Scout Agency  — $249/mo (Airtable record only — no Stripe customer)
```

**Do not use the paid plan options unless you are manually matching a Stripe customer that already exists.** Setting a record to `Scout Pro` in Airtable does not create a Stripe subscription — it only changes what tier limits the user sees. Billing is driven by Stripe webhook events, not Airtable records.

### Grant admin access checkbox

The "Grant super admin access" checkbox sets `Is Admin = true` on the new account. This gives the account access to `/admin` and all `POST /api/admin/*` routes — the same level of access as the ClientBloom team. It is not a settings-level admin toggle.

The checkbox renders red and displays a live warning when enabled.

---

## 4. Grant 7-Day Trial button

`POST /api/admin/grant-access`

This is the correct way to manually provision a trial account. Unlike "Add Tenant," it:

1. Creates the Airtable Tenants record with `plan='Trial'` and `trialEndsAt` set to 7 days from now
2. Generates a secure temporary password (12-char alphanumeric, bcrypt-hashed)
3. Calls `provisionNewTenant()` to assign a `Tenant ID` (same path as self-signup)
4. Sets `Created At` to full ISO datetime (`new Date().toISOString()`)
5. Sends a welcome email via Resend with:
   - Login credentials (email + temp password)
   - Link to the app
   - Trial expiration date
   - "What happens next" onboarding checklist

**Email branding:** header, CTA button, and info box all use `BRAND_PURPLE (#7C3AED)`. The Scout logo SVG is included in the email header.

**When the trial expires:** the user is redirected to `/upgrade`. Their data (ICPs, captured posts) is preserved and unlocked on payment.

---

## 5. Tenant list — filters and sorting

### Filter controls

| Filter | Options | Notes |
|--------|---------|-------|
| Plan | All / Trial / Starter / Pro / Agency / Complimentary / Owner | Matches Airtable plan value exactly |
| Status | All / Active / Suspended (manually disabled) / trial_expired | Suspended = account manually disabled by admin |
| Trial stage | All / Urgent (0–3d) / Check in (4–5d) / Just started (6–7d) / Trial expired | Only affects accounts with a `trialEndsAt` value |
| Search | Free text | Matches company name or email, case-insensitive |

Filters are combinable — e.g. Plan=Trial + Stage=Urgent shows all trials expiring within 3 days.

A result count badge shows how many accounts match the active filters.

### Sort controls

Clickable column headers act as sort controls. The active sort column shows ↑ (ascending) or ↓ (descending). Inactive columns show ⇅.

| Column | Sort behavior |
|--------|--------------|
| Account | A–Z or Z–A by company name (falls back to email) |
| Plan | Alphabetical by plan name |
| Role | Super Admin → Primary → Feed Only |
| Status | Alphabetical |
| Trial | Soonest expiry first |
| Created | Newest first (default) |

A sort selector dropdown above the table provides the same controls for quick access.

---

## 6. Tenant list — columns

### Account column

Shows company name (or email if no company name). Owner-type accounts show a workspace membership indicator with nested feed-only members.

### Plan column

Color-coded plan badge:

| Plan | Badge color |
|------|------------|
| Scout Agency | Purple |
| Scout Pro | Blue |
| Scout Starter | Indigo |
| Trial | Amber |
| Complimentary | Teal |
| Owner | Red |

### Role column

| Role badge | Condition |
|-----------|-----------|
| Super Admin (red) | `isAdmin === true` |
| Primary (green) | Full access, not admin, not feed-only |
| Feed Only (amber) | `isFeedOnly === true`, standalone account |
| Member (slate) | `isFeedOnly === true`, shares tenantId with an owner account |

### Trial column

Shows days + hours remaining for accounts with an active trial. Color-coded:

- Green: 6–7 days
- Amber: 4–5 days
- Red: 0–3 days
- "Expired" badge: past expiry date

Dash (`—`) for non-trial accounts.

### Status column

| Value | Meaning |
|-------|---------|
| Active | Account can log in and use the product |
| Suspended | Manually disabled by admin — login blocked at auth |
| trial_expired | Trial ended — account sees upgrade wall |

### Actions column

All action icons have hover tooltips that show the current state and what clicking will do.

| Icon | Current state | Click action |
|------|--------------|-------------|
| Feed toggle (monitor) | Feed Only / Full Access | Toggle `Is Feed Only` |
| Suspend toggle (lock/unlock) | Active / Suspended | Toggle account status |
| Delete (trash) | — | Permanently delete account (danger — red tooltip) |

---

## 7. Workspace grouping

Accounts are nested under an "owner" account when two or more Airtable records share the same `Tenant ID`. This only happens via the team-invite flow.

**Standalone accounts** — even if `isFeedOnly=true` — render flat in their sort position. Toggling feed-only on a standalone account does not move it.

### Row kinds

| Kind | Condition |
|------|-----------|
| `standalone` | Account's tenantId appears only once in the dataset |
| `owner` | Account's tenantId appears on 2+ records AND `isFeedOnly=false` |
| `member` | Account's tenantId appears on 2+ records AND `isFeedOnly=true` |

The `sharedTenantIds` Set is computed from the current filtered+sorted data. Only tenantIds with count > 1 trigger owner/member nesting.

---

## 8. Admin API routes

All admin routes require `session.user.isAdmin === true`. They return `403` for authenticated non-admin sessions and `401` for unauthenticated sessions.

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/admin/tenants` | GET | List all tenant records |
| `/api/admin/tenants` | POST | Create a tenant record |
| `/api/admin/tenants` | PATCH | Update a tenant record |
| `/api/admin/tenants` | DELETE | Delete a tenant record |
| `/api/admin/grant-access` | POST | Provision trial + send welcome email |
| `/api/admin/send-reactivation` | POST | Send reactivation email to expired trial |
| `/api/admin/stripe-stats` | GET | Revenue stats from Stripe |
| `/api/admin/usage` | GET | Per-tenant usage data |
| `/api/admin/send-reset` | POST | Send password reset to any email |

---

## 9. What never changes without approval

- The `isAdmin` semantic — always super admin, never account-level
- The `isFeedOnly` semantic — always restricts to feed tab only; never changes tenantId
- The `tenantId` field on a live account — changing this orphans all customer data
- The `Created At` field format — always full ISO datetime (`new Date().toISOString()`). Date-only strings (`2024-04-10`) break trial countdown math and audit logs

---

*See [`docs/README.md`](./README.md) for the full documentation index.*
