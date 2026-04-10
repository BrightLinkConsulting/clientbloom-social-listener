# Scout — Authentication and Sessions

## Last updated: April 2026

---

## 1. Overview

Scout uses **NextAuth.js v4** with a **Credentials Provider** and **JWT session strategy**. There are no OAuth providers. All tenant credentials are stored in the Platform Airtable base (`PLATFORM_AIRTABLE_BASE_ID`).

Source files:
- `dashboard/lib/auth.ts` — NextAuth configuration, rate limiting, JWT callbacks
- `dashboard/lib/tenant.ts` — `getTenantConfig()` helper for API routes
- `dashboard/middleware.ts` — route protection (auth guard)

---

## 2. Sign-in flow

```
POST /api/auth/callback/credentials
  │
  │  Input: { email, password }
  │
  ├── 1. Rate limit check (before Airtable)
  │       - Per-email: 5 failures in 15 min → locked
  │       - Per-IP: 20 failures in 15 min → locked
  │       - Returns null (→ NextAuth returns generic 401)
  │
  ├── 2. Airtable lookup
  │       findTenantByEmail(email)
  │       → GET PLATFORM_AIRTABLE_BASE_ID/Tenants?filterByFormula={Email}='...'
  │       Returns null if no record found
  │
  ├── 3. Status check
  │       If record.fields['Status'] === 'Suspended' → reject
  │
  ├── 4. Password verification
  │       bcrypt.compare(password, record.fields['Password Hash'])
  │       12 bcrypt rounds — hashing happens at account creation
  │
  └── 5. On success → return user object:
            {
              id, email, name (company name),
              airtableToken, airtableBaseId,  ← per-tenant overrides (unused in current setup)
              isAdmin, isFeedOnly, tenantId,
              plan, trialEndsAt, onboarded
            }
```

### Single-tenant fallback

If `PLATFORM_AIRTABLE_BASE_ID` is not set, auth falls back to comparing `ADMIN_EMAIL` and `ADMIN_PASSWORD` env vars. This was used in the original Mike deployment before multi-tenancy. Do not rely on this in production.

---

## 3. JWT structure

NextAuth stores the session as an HttpOnly JWT cookie (`next-auth.session-token`). The JWT contains:

| Field | Type | Source |
|-------|------|--------|
| `email` | string | Airtable record |
| `tenantId` | string | Airtable record (`Tenant ID` field) |
| `plan` | string | Airtable record (`Plan` field) |
| `trialEndsAt` | string \| null | Airtable record (`Trial Ends At`) |
| `isAdmin` | boolean | Airtable record (`Is Admin`) |
| `isFeedOnly` | boolean | Airtable record (`Is Feed Only`) |
| `onboarded` | boolean | Airtable record (`Onboarded`) |
| `airtableToken` | string | Airtable record (per-tenant override) |
| `airtableBaseId` | string | Airtable record (per-tenant override) |

**JWT maxAge:** 24 hours. Users are re-authenticated after 24h.

**Important:** Plan, trial status, and all access flags come from the JWT — not a live Airtable query on each request. This means changes to a tenant record in Airtable take effect on the user's next sign-in (or after a client-side session update — see section 5).

---

## 4. Session object in API routes

```typescript
import { getTenantConfig, tenantError } from '@/lib/tenant'

export async function GET(req: Request) {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()  // returns 401 JSON

  // tenant is now:
  // {
  //   tenantId: string,       // Row-level isolation key
  //   isAdmin: boolean,
  //   email: string,
  //   plan: string,
  //   trialEndsAt: string | null,
  //   airtableToken: string,
  //   airtableBaseId: string,
  // }
}
```

`getTenantConfig()` calls `getServerSession(authOptions)` internally. It returns `null` if the session is missing, expired, or invalid. Always return `tenantError()` immediately on `null` — do not continue with undefined tenant data.

---

## 5. Client-side session updates (session.update())

Some operations need to update the session immediately without requiring a sign-out and sign-back-in. NextAuth v4 supports this via `session.update()` on the client and a `trigger === 'update'` check in the `jwt()` callback.

**Currently used for:**

### Onboarding completion

```typescript
// Client (onboarding page)
await update({ onboarded: true })

// JWT callback (lib/auth.ts)
if (trigger === 'update' && sessionUpdate?.onboarded !== undefined) {
  token.onboarded = sessionUpdate.onboarded
}
```

After the onboarding wizard completes, this clears the redirect guard so the user lands on the dashboard.

### Post-payment plan upgrade

```typescript
// Client (welcome page, after Stripe checkout)
await fetch('/api/session/refresh')  // re-reads plan from Airtable
await update({ plan: 'Scout Pro', trialEndsAt: null })

// JWT callback (lib/auth.ts)
const VALID_PAID_PLANS = new Set(['Scout Starter', 'Scout Pro', 'Scout Agency', 'Owner'])
if (trigger === 'update' && VALID_PAID_PLANS.has(sessionUpdate?.plan)) {
  token.plan = sessionUpdate.plan
}
```

**Security note:** `session.update()` is callable from the client. The JWT callback whitelists only the four valid paid plan values. A client calling `session.update({ plan: 'Scout Agency' })` without actually paying would set a JWT field — but the Stripe webhook handler is what writes the plan to Airtable, and the next sign-in would revert the JWT to whatever Airtable actually says. The whitelist prevents privilege escalation through client-side JWT manipulation during the current session window.

---

## 6. Rate limiting

Rate limiting is in-memory, implemented in `lib/auth.ts`. It persists within a Vercel function instance but resets if the instance recycles.

| Limit | Threshold | Window |
|-------|-----------|--------|
| Per email | 5 failures | 15 minutes |
| Per IP | 20 failures | 15 minutes |

On a successful login, the per-email bucket is cleared. Per-IP bucket is not cleared (prevents credential-stuffing by cycling through emails on the same IP).

**Limitation:** This is per-instance. At 100+ concurrent users, multiple Vercel instances run in parallel — a determined attacker can exceed these limits by distributing requests across instances. The v2 upgrade is a Redis-backed rate limiter (Upstash) — see `docs/v2-roadmap.md`.

---

## 7. Route protection (middleware)

`dashboard/middleware.ts` wraps the NextAuth default middleware with a route matcher:

**Public routes** (no auth required):
```
/               — landing page
/welcome        — post-checkout confirmation
/sign-in        — login
/sign-up        — no-CC trial signup
/about          — about page
/blog/**        — blog
/compare/**     — competitor comparison
/terms          — terms of service
/privacy-policy — privacy policy
/forgot-password
/reset-password
/api/auth/**    — NextAuth endpoints
/api/trial/start — trial account creation
/api/webhooks/** — Stripe (signed, not session-based)
/api/cron/**    — cron jobs (CRON_SECRET protected)
/api/debug      — debug
/api/health     — health check
/_next/**       — Next.js assets
/favicon.ico
/robots.txt
/sitemap.xml
```

All other routes require a valid JWT session. Unauthenticated requests redirect to `/sign-in`.

**Note:** Trial expiry enforcement (redirect to `/upgrade` when `status === 'trial_expired'`) happens at the page level, not in middleware. Middleware only handles the unauthenticated case.

---

## 8. Password reset flow

Four files implement password reset:

| File | Role |
|------|------|
| `app/forgot-password/page.tsx` | UI — user enters email |
| `app/api/auth/forgot-password/route.ts` | Generates token, sends email |
| `app/reset-password/page.tsx` | UI — user enters new password with token |
| `app/api/auth/reset-password/route.ts` | Validates token, updates hash |

The reset token is a SHA-256 hash stored in `Password Reset Token` field. It expires after 1 hour (stored in `Password Reset Expires At`). The raw token is sent in the email URL and never stored — only its hash is in Airtable.

---

## 9. Pattern: adding a new authenticated API route

```typescript
import { NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import { getTierLimits } from '@/lib/tier'
import { tenantFilter, airtableList } from '@/lib/airtable'

export async function GET(req: Request) {
  // 1. Auth check — always first
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()

  // 2. Admin gate (only if admin-only)
  if (!tenant.isAdmin) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }

  // 3. Plan gate (only if plan-restricted)
  const limits = getTierLimits(tenant.plan)
  if (limits.keywords === 0) {
    return NextResponse.json({ error: 'Plan does not support this feature.' }, { status: 403 })
  }

  // 4. Data access — always scoped to tenant
  const records = await airtableList('YourTable', tenantFilter(tenant.tenantId))

  return NextResponse.json({ records })
}
```

Never access Airtable without `tenantFilter()`. Never hardcode plan limits — always use `getTierLimits(tenant.plan)`.

---

*See [`docs/README.md`](./README.md) for the full documentation index.*
