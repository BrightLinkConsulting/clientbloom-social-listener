# GHL Pipeline + Slack Alert Integration

**Deployed:** April 2026  
**Repo:** BrightLinkConsulting/clientbloom-social-listener  
**Relates to:** `lib/ghl-platform.ts`, `lib/notify.ts`, `app/api/trial/start/route.ts`, `app/api/webhooks/stripe/route.ts`, `app/api/cron/trial-check/route.ts`, `app/api/admin/tenants/route.ts`, `app/api/admin/csm-agent/route.ts`

---

## Overview

Every Scout user lifecycle event is mirrored to two places automatically:

1. **GHL Pipeline** — "SCOUT by ClientBloom" pipeline in Mike's ClientBloom GHL sub-account. Each tenant has one contact + one opportunity in this pipeline, moving through stages as their status changes.
2. **Slack** — `#AIOS` admin channel. Alerts fire on trial signup and purchase/conversion.

Both integrations are non-fatal: if GHL or Slack is unreachable, Scout operations (signup, billing, cron) are not blocked.

---

## GHL Pipeline

**Location ID:** `hz6swxxqV8ZMTuyTG0hP` (ClientBloom sub-account)  
**Pipeline ID:** `5xyEuDU0n5Fgq5n6BoKf`  
**API Key env var:** `SCOUT_GHL_API_KEY` (Private Integration token)  
**Base URL:** `https://services.leadconnectorhq.com`  
**API Version header:** `2021-07-28`

### Stage IDs

| Stage | ID | Trigger |
|-------|----|---------|
| Trial User | `df3a8ce5-b1b9-458e-8dc6-29a5171e529b` | Trial signup (`/api/trial/start`) |
| Paid Subscriber | `acdbc33a-3a44-4e57-84bb-2406b848f930` | Purchase or trial-to-paid conversion (Stripe webhook) |
| Expired Trial | `69aef152-bd86-4b54-9d73-8e29cc2fa03f` | Trial expiry (`/api/cron/trial-check`) |
| Archived | `652e9e98-c9f9-4cc8-85a5-bdf9ec650c7c` | Admin archive (admin panel or CSM agent) |

### ID Persistence (Airtable-backed)

GHL's `/opportunities/search?contact_id=...` endpoint does not return results for newly created pipelines — it is non-functional for our use case. All GHL IDs are therefore stored in the Tenants Airtable table at creation time and read back for all subsequent stage moves.

**Fields added to Tenants table (appZWp7QdPptIOUYB / tblKciy1tqPmBJHmT):**

| Field | Airtable Field ID | Type | Purpose |
|-------|------------------|------|---------|
| GHL Contact ID | `fldWIqRlFMggKxUUH` | singleLineText | GHL contact record ID (`ctt_...`) |
| GHL Opportunity ID | `fldvHqFL3aIWHzQGI` | singleLineText | GHL opportunity record ID (`opp_...`) |

Every stage move uses this fast path:
1. Read `GHL Opportunity ID` from Airtable
2. Call `PUT /opportunities/{oppId}` with the new `pipelineStageId`

If the stored ID is missing (user signed up before integration was deployed, or Airtable write failed at creation), the slow path runs: upsert the GHL contact, create a new opportunity at the target stage, then store the new IDs.

### Public API (lib/ghl-platform.ts)

All functions are awaited at call sites — never fire-and-forget.

```typescript
// Trial signup
ghlAddTrialUser(email: string, name: string, airtableRecordId: string): Promise<void>

// Purchase or trial→paid conversion
ghlMoveToPaid(email: string, name: string, plan: string, airtableRecordId: string): Promise<void>

// Trial expiry (called by trial-check cron)
ghlMoveToExpired(email: string, airtableRecordId: string): Promise<void>

// Admin archive
ghlMoveToArchived(email: string, airtableRecordId: string): Promise<void>

// Admin unarchive — moves to Paid Subscriber for paid plans, Trial User for Trial
ghlRestoreFromArchived(email: string, plan: string, airtableRecordId: string): Promise<void>
```

`airtableRecordId` is always the `rec...` Airtable record ID from the Tenants table row.

### Call Sites

| File | Function | When it fires |
|------|----------|---------------|
| `app/api/trial/start/route.ts` | `ghlAddTrialUser` | Every new no-CC trial signup |
| `app/api/webhooks/stripe/route.ts` | `ghlMoveToPaid` (×2) | Trial-to-paid conversion + direct purchase |
| `app/api/cron/trial-check/route.ts` | `ghlMoveToExpired` | Each trial expiry event (runs every 6h) |
| `app/api/admin/tenants/route.ts` | `ghlMoveToArchived` / `ghlRestoreFromArchived` | Admin panel archive/unarchive PATCH |
| `app/api/admin/csm-agent/route.ts` | `ghlMoveToArchived` / `ghlRestoreFromArchived` | CSM agent archive/unarchive actions |

### Duplicate Guard

`ghlAddTrialUser` checks for an existing `GHL Opportunity ID` in Airtable before creating. If already present (retry or duplicate webhook), it skips creation. This makes signup safe to retry.

### Environment Variables Required

| Var | Source | Purpose |
|-----|--------|---------|
| `SCOUT_GHL_API_KEY` | GHL Private Integration token | Authenticates all GHL API calls |
| `PLATFORM_AIRTABLE_TOKEN` | Airtable | Read/write GHL IDs in Tenants table |
| `PLATFORM_AIRTABLE_BASE_ID` | Airtable | `appZWp7QdPptIOUYB` |

If `SCOUT_GHL_API_KEY` is not set, all GHL functions no-op silently (no error, no crash).

---

## Slack Alerts

**Webhook env var:** `SLACK_WEBHOOK_URL`  
**Channel ID:** `C0866581X1S` (#AIOS admin channel)  
**Implementation:** `lib/notify.ts` → `lib/slack.ts`

### Alert Templates

**New trial signup** (fires from `/api/trial/start`):
```
🎉 *New Scout Trial* — {name}
Email: `{email}`
<https://scout.clientbloom.ai|Open Scout Admin>
```

**New purchase / conversion** (fires from Stripe webhook):
```
💰 *New Scout Subscriber* — {name} on *{plan}*
Email: `{email}`
<https://scout.clientbloom.ai|Open Scout Admin>
```

### Functions

```typescript
// lib/notify.ts
sendTrialSignupAlert(email: string, name: string): Promise<void>
sendPurchaseAlert(email: string, name: string, plan: string): Promise<void>
```

Both are called inside `Promise.allSettled([...])` alongside the GHL calls so neither can block the other or crash the parent function.

---

## Architecture Notes

### Why Promise.allSettled

GHL and Slack calls are paired with `Promise.allSettled` in Vercel serverless functions. This pattern ensures:
- Both calls are awaited before the function returns (Vercel terminates in-flight fetches after response is sent)
- A failure in one does not prevent the other from running
- Neither can throw an unhandled rejection that kills the parent handler

### What "non-fatal" means

All GHL functions catch and log errors internally. `ghlMoveToArchived` and similar return `void` — callers additionally `.catch()` them for defensive logging. A GHL outage will never surface as a 500 to the user.

### Platform GHL vs. Tenant GHL

This is the **platform-level** GHL integration — it mirrors Scout's own user management into Mike's GHL account. It is completely separate from the **per-tenant Agency CRM integration** that Agency-tier customers configure via their own GHL keys in Settings → CRM. The two systems do not interact.

---

## Testing

To verify the integration end-to-end:

1. **Trial signup:** Create a new trial account at `/sign-up`. Check GHL pipeline for new contact + opportunity in "Trial User" stage. Check Airtable Tenants row for populated `GHL Contact ID` and `GHL Opportunity ID` fields. Check Slack for 🎉 alert.

2. **Purchase:** Complete a Stripe checkout. Check GHL for opportunity moved to "Paid Subscriber". Check Slack for 💰 alert.

3. **Trial expiry:** Trigger the trial-check cron (`GET /api/cron/trial-check` with `Authorization: Bearer $CRON_SECRET`). Check GHL for expired tenant moved to "Expired Trial".

4. **Archive:** Archive a tenant from the admin panel or CSM agent. Check GHL for opportunity moved to "Archived".

5. **Unarchive:** Unarchive. Check GHL for opportunity moved to "Paid Subscriber" (paid plan) or "Trial User" (Trial plan).

---

## Known Limitations

- **Users who signed up before April 2026** have no stored GHL IDs. Their first lifecycle event after deployment will trigger the slow path (upsert contact + create new opportunity) and store the IDs going forward. Subsequent events use the fast path.
- **GHL search API** (`/opportunities/search?contact_id=...`) is non-functional for newly created pipelines and is not used anywhere in this integration.
- **Slack webhook** is a single inbound webhook URL — there is no per-message delivery confirmation. If the webhook URL rotates, update `SLACK_WEBHOOK_URL` in Vercel.
