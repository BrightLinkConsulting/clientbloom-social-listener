# Scout — Super Admin Panel

## Last updated: April 2026 (admin-hardening sprint)

---

## 1. Overview

The super admin panel lives at `/admin` and is gated by `session.user.isAdmin === true`. It is intended for ClientBloom internal use only — it grants full visibility into all tenant accounts, billing data, and scan activity, and allows all account lifecycle operations.

**Access:** Log in as any account whose Airtable `Is Admin` field is `true`. The panel is not linked from any public navigation — navigate directly to `https://scout.clientbloom.ai/admin`.

**Scope:** `isAdmin` grants full super admin access to the `/admin` panel and all `/api/admin/*` routes. Do not grant this to customers.

**Visual distinction:** The admin panel renders with an amber header border and an `ADMIN` badge in the top navigation bar. This is intentional — it makes the admin context visually distinct from customer views.

---

## 2. Panel sections

### System health strip

Three-column status strip at the top of the panel:

| Column | What it shows |
|--------|--------------|
| Stripe | Live mode or Stub mode (based on `STRIPE_SECRET_KEY` prefix: `sk_live_` vs `sk_test_`) |
| Airtable | Total tenant count queried from Airtable in real time |
| Auth & Access | Reminder that `isAdmin` is super admin access, not account settings access |

### Trial pipeline (Overview tab)

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

### Tenant list (Tenants tab)

The main data table. See section 4 for full details.

### CSM Agent (floating panel)

An AI-powered Customer Success Manager assistant accessible from the floating amber button in the bottom-right corner of any admin page. See section 7 and `docs/csm-agent-readme.md` for full details.

---

## 3. Add Tenant form

The "Add Tenant" form creates a record in the Airtable `Tenants` table. It does **not** send any email. It does **not** create a Stripe customer. It is for internal account provisioning only.

**Duplicate email guard:** Creating a tenant with an email that already exists returns a `409 Conflict` error. This applies to both the Add Tenant form and the Grant Trial Access modal.

---

## 4. Tenant list

### Filters

| Filter | Options |
|--------|---------|
| Search | Company name or email |
| Plan | All / Trial / Starter / Pro / Agency / Complimentary |
| Status | All / Active / Suspended / Archived / trial_expired |
| Trial urgency | All / Urgent (0–3d) / Check-in (4–5d) / New (6–7d) / Expired |
| Show archived | Toggle — archived accounts are hidden by default |

**Archive visibility:** Archived accounts are hidden from the tenant list by default to keep the view clean. Click "Show archived" to reveal them. When shown, archived accounts display an amber status badge and a `12mo+` stale flag if they've been archived for over 12 months.

### Sort

Sortable by: Company name, Plan, Role, Status, Trial time remaining, Created date.

### Per-tenant actions (overflow menu)

| Action | What it does |
|--------|-------------|
| Apify — manage | Opens the inline Apify key/pool management panel |
| Reset password | Generates a new temporary password and emails it to the tenant |
| Archive account | Freezes the account (see section 5) |
| Unarchive account | Restores an archived account to Active |
| Hard delete (permanent) | Cascade-deletes all data (see section 6) |

**Admin protection:** Accounts with `isAdmin=true` cannot be archived or hard-deleted from the UI. Revoke admin access first.

---

## 5. Archive

Archive is the preferred way to deactivate an account. It is reversible and preserves all data.

**What archive does:**
- Sets `Status = 'Archived'` on the Tenants record
- Sets `Archived At` timestamp
- Blocks login immediately (JWT blocks on `status === 'Archived'`)
- Excludes the account from all cron jobs: trial-check, service-check, usage-sync
- No emails are sent to an archived tenant by any automated system
- Stripe subscription is **not** cancelled — do this manually if needed

**What archive does NOT do:**
- Delete any data
- Cancel Stripe
- Remove the Tenants row

**When to archive:**
- Customer goes inactive for an extended period
- You want to freeze an account while preserving data for reference

**12-month stale flag:** If an account has been archived for over 12 months, its status badge shows a `12mo+` label. This surfaces cleanup candidates in the admin view.

**Unarchive:** Available from the overflow menu on any archived account. Instantly restores `Status = 'Active'` and clears `Archived At`.

---

## 6. Hard delete (cascade)

Hard delete permanently removes a tenant and all associated data. This is irreversible.

**When to use:** Pre-launch cleanup, GDPR/data deletion requests, or permanent removal of an account that has no business reason to be preserved.

**For normal deactivation, use Archive instead.**

### Cascade delete architecture

Hard delete uses two Airtable tokens because tenant data spans two bases:

| Token | Base | Tables deleted |
|-------|------|----------------|
| `PLATFORM_AIRTABLE_TOKEN` | Platform base | Scan Health, sub-accounts, Tenants row |
| `AIRTABLE_PROVISIONING_TOKEN` | Shared data base (`appZWp7QdPptIOUYB`) | Captured Posts, Sources, LinkedIn ICPs, Business Profile, Facebook Keywords, Target Groups |

**Delete order:**
1. Shared data tables (all 6) — provisioning token
2. Scan Health — platform token
3. Sub-accounts (linked `Is Feed Only = true` accounts) — platform token
4. Tenants row — platform token (last, so retry is possible if step 1–3 fail)

**Stripe cancellation:** If the tenant has `Stripe Subscription ID` set, the subscription is cancelled via Stripe API before the Airtable delete. Non-fatal — a Stripe failure is logged but does not block the delete.

**Sub-account handling:** If the tenant being deleted is a primary account with linked sub-accounts, the confirmation modal shows a warning ("This account has N linked sub-accounts..."). All linked sub-accounts are automatically deleted as part of the cascade.

**Partial failures:** If any table delete fails (Airtable error, rate limit, etc.), the success message shows "X partial error(s) — check audit log." The cascade result is written to the Admin Audit Log for forensic review.

**Admin protection:** Admin accounts (`isAdmin = true`) cannot be hard-deleted from the UI. Revoke admin access first.

### Sub-account independent delete

You can also delete a sub-account independently without affecting the primary tenant. The cascade will delete only the sub-account's data rows (which share the primary's `Tenant ID`) and the sub-account's Tenants row. The primary tenant and their data are unaffected.

---

## 7. Admin Audit Log

An `Admin Audit Log` table in the Platform Airtable base records all significant admin actions.

**Events logged:**
- `archive_tenant` — tenant archived
- `unarchive_tenant` — tenant unarchived
- `hard_delete_tenant` — tenant hard-deleted (includes full cascade result)
- `status_change` — status updated via PATCH
- `plan_change` — plan updated (via CSM Agent)
- `password_reset` — password reset sent (via CSM Agent)
- `csm_agent_action` — generic CSM Agent write action

**Failure behavior:** Audit log writes are non-fatal. A failure to write the log does not roll back or block the primary action.

**Airtable table setup:** Create a table named `Admin Audit Log` in the Platform base with these fields:
- `Event Type` (Single line text)
- `Admin Email` (Email)
- `Target Email` (Single line text)
- `Target Tenant ID` (Single line text)
- `Target Record ID` (Single line text)
- `Notes` (Long text)
- `Timestamp` (Date/time)

---

## 8. Session security

- **Blocked statuses:** Login is blocked for accounts with `Status` in: `Suspended`, `Archived`, `trial_expired`, `deleted`.
- **Session lifetime:** JWT tokens have a 24-hour maxAge. Archiving or suspending an account blocks new logins immediately, but does not invalidate live sessions. Existing sessions expire naturally within their TTL.
- **Rate limiting:** 5 failed attempts per email per 15-minute window; 20 per IP. Successful login clears the email bucket.

---

## 9. Cron job behavior for archived/deleted accounts

| Cron | Behavior |
|------|----------|
| `trial-check` | Only processes `Plan='Trial' AND Status='Active'` — archived accounts are naturally excluded |
| `service-check` | Filters: `Status != 'Archived' AND Status != 'deleted' AND Status != 'trial_expired'` |
| `usage-sync` | Filters: `Status != 'Archived' AND Status != 'deleted'` |
| `scan` | Uses tenant's own API token/pool — archived accounts cannot log in and won't trigger scans |

---

## 10. API reference

| Method | Endpoint | Action |
|--------|---------|--------|
| `GET` | `/api/admin/tenants` | List all tenants |
| `POST` | `/api/admin/tenants` | Create tenant (duplicate email guard) |
| `PATCH` | `/api/admin/tenants` | Update tenant fields; `action='archive'` / `action='unarchive'` |
| `DELETE` | `/api/admin/tenants` | Cascade hard delete |
| `POST` | `/api/admin/grant-access` | Create 7-day trial + send welcome email (duplicate guard) |
| `POST` | `/api/admin/send-reset` | Send temporary password to tenant |
| `POST` | `/api/admin/send-reactivation` | Send reactivation email to expired trial |
| `POST` | `/api/admin/csm-agent` | CSM Agent query + confirmed action execution |

---

## 11. Environment variables required

| Variable | Purpose |
|---------|---------|
| `PLATFORM_AIRTABLE_TOKEN` | Platform base auth (Tenants, Scan Health) |
| `PLATFORM_AIRTABLE_BASE_ID` | Platform base ID |
| `AIRTABLE_PROVISIONING_TOKEN` | Shared data base auth (Posts, Sources, ICPs, Keywords, etc.) |
| `AIRTABLE_PROVISIONING_BASE_ID` | Shared data base ID (default: `appZWp7QdPptIOUYB`) |
| `AIRTABLE_TARGET_GROUPS_TABLE_ID` | Target Groups table ID (optional — skipped if not set) |
| `STRIPE_SECRET_KEY` | Stripe API key for subscription cancellation on hard delete |
| `ANTHROPIC_API_KEY` | Required for CSM Agent |
| `RESEND_API_KEY` | Required for all email sends |
| `CRON_SECRET` | Shared secret for cron job authorization |
| `NEXTAUTH_SECRET` | JWT signing secret |
