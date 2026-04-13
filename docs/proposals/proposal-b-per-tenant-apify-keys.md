# Proposal B — Per-Tenant Apify Key Admin UI

**Status:** ✅ Implemented — April 2026 (merged to main, revised to Scout-owned multi-pool architecture)  
**Urgency:** Ship before 20 active tenants  
**Scope:** Admin panel UI to assign per-tenant Apify API keys; isolates each tenant's
scraping quota from the shared pool

---

## The Risk

Currently all tenants run through the shared `APIFY_API_TOKEN` (a single Apify account).
The inflight counter soft-caps at 24 concurrent runs (80% of Starter plan's 32-run limit),
but if 20 tenants all run cron scans simultaneously:

- 20 concurrent Apify runs against one account
- Apify Starter plan: 32 max concurrent, $49/mo
- At 20 tenants: each tenant gets ~1.6 runs of headroom → very tight
- One slow run (actor timeout, retry chain) and the ceiling is hit → other tenants' scans
  degrade or fail silently

The infrastructure to assign per-tenant keys already exists:
- Airtable Tenants field: `Apify API Key` (field `fld37tNIB5YHvFecP`)
- `trigger-scan/route.ts`: reads this field and passes it to `runScanForTenant()`
- `cron/scan/route.ts`: passes `apifyKey` to scan-tenant worker

What's missing: there is no admin UI to actually set this field. You have to go into
Airtable directly to assign a key, which doesn't scale.

---

## How Per-Tenant Keys Work

When a tenant has their own Apify key set in the `Apify API Key` field:
- Their scans run against their own Apify account, not the shared pool
- Their quota (concurrent runs, monthly compute units) is entirely separate
- They cannot deplete the shared pool even if their scan runs long
- If their key is invalid or rate-limited, only their account is affected

Agency plan customers in particular should each have their own key because they
may have large ICP pools (500 profiles) that generate heavy Apify usage.

---

## Implementation

### Minimal viable: Admin form field (2–3 hours)

The simplest approach: add an "Apify API Key" text input to the existing admin tenant
edit form. When saved, it PATCHes the `Apify API Key` field on the Tenants table.

**Files to change:**

1. `dashboard/app/admin/page.tsx`
   - Add `apifyKey` state variable to the edit form
   - Add text input (masked/password type) in the admin form modal
   - Add label: "Apify API Key" with helper: "Leave blank to use shared pool"

2. `dashboard/app/api/admin/update-tenant/route.ts` (or wherever the admin PATCH lives)
   - Add `apifyKey` to the allowed fields in the update handler
   - PATCH `Apify API Key` field on the tenant record

3. Admin panel tenant list
   - Show a small indicator (e.g., 🔑 or "Custom key") next to tenants that have their
     own Apify key assigned, so at a glance you can see which tenants are isolated

### Medium: Self-service settings page (4–6 hours additional)

Allow Agency plan tenants to add their own Apify key from their Settings page.
This removes the manual admin step entirely.

**Files to change:**
- `dashboard/app/settings/page.tsx` — add "Integrations" tab or section
- New route: `POST /api/settings/apify-key` — validates key format (starts with `apify_`),
  writes to Tenants table via PLATFORM_AIRTABLE_TOKEN
- Gate: Agency plan only (per the plan's infrastructure isolation value prop)

---

## Recommended rollout

**Phase 1 (do before 20 tenants):** Admin form field. 2–3 hours. Gives you the ability to
manually assign keys as you onboard customers. You do it once per Agency customer during
setup.

**Phase 2 (week 2–3):** Self-service for Agency customers. Let them paste their own key in
Settings → reduces your manual admin work as you scale.

---

## What to charge / communicate

Per-tenant Apify keys are an operational detail users don't need to know about unless
they're on Agency. For Starter/Pro tenants on the shared pool, no communication needed.

For Agency customers, the value prop is: "Your scanning quota is completely isolated from
other accounts — your heavy usage never affects other users and vice versa." This is a
genuine infrastructure advantage worth mentioning in Agency onboarding.

If an Agency customer doesn't have their own Apify account, they can sign up at
apify.com for ~$49/mo (Starter plan) or ~$99/mo (Scale plan). The Scout monthly fee
plus their own Apify account gives them full independence at the infrastructure layer.

---

## Airtable field reference

- Table: Tenants (`tblKciy1tqPmBJHmT`)
- Field: `Apify API Key` (`fld37tNIB5YHvFecP`)
- Type: `singleLineText`
- Already in use: yes (cron and trigger-scan routes read it already)

---

## Monitoring note

Once per-tenant keys are in use, the admin panel's health strip should show two
things for each tenant:

1. Whether they're using their own key or the shared pool
2. For shared-pool tenants: current global inflight count vs. the 24-run ceiling

The global inflight count is already available in the Scan Health table
(`_platform` tenant row, `Last Posts Found` field). Adding a read of this to the
admin health strip is a 30-minute task and gives real-time visibility into pool
saturation before it becomes a problem.
