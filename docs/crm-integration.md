# CRM Integration — Scout

**Version:** 1.1  
**Last updated:** April 2026  
**Status:** GoHighLevel live · HubSpot coming soon  

---

## Table of Contents

1. [Overview](#overview)
2. [User Setup Guide (GoHighLevel)](#user-setup-guide-gohighlevel)
3. [How the Push Flow Works](#how-the-push-flow-works)
4. [Architecture & Developer Reference](#architecture--developer-reference)
5. [Airtable Schema Requirements](#airtable-schema-requirements)
6. [API Reference](#api-reference)
7. [Error Reference](#error-reference)
8. [Testing the Integration](#testing-the-integration)
9. [Known Limitations](#known-limitations)
10. [HubSpot Roadmap](#hubspot-roadmap)
11. [Version History](#version-history)

---

## Overview

Scout's CRM integration allows users on the **Agency plan** (and the Owner internal account) to push engaged LinkedIn post authors directly into their CRM with one click from the feed. No copy-pasting, no switching tabs to create contacts manually.

**Currently supported:** GoHighLevel (GHL)  
**Coming soon:** HubSpot  
**Plan required:** Scout Agency ($249/mo) or Owner

When a user clicks "Add to GoHighLevel pipeline" on a post:
1. Scout deduplicates against existing GHL contacts using the LinkedIn profile URL
2. Creates or updates the GHL contact with name, LinkedIn URL, tags, and source label
3. Adds a note with the post snippet, engagement notes, and a direct link to the post
4. If a Pipeline ID is configured, creates an Opportunity at the first stage of that pipeline
5. Marks the post as "In CRM" in Scout's feed (moves to the In CRM tab)
6. Returns a direct "View in GoHighLevel" link to the contact record

> **GHL official documentation references used throughout this guide:**
> - [Private Integrations guide](https://help.gohighlevel.com/support/solutions/articles/155000002161-private-integrations)
> - [API Key vs Private Integrations](https://help.gohighlevel.com/support/solutions/articles/155000002449)
> - [GHL API reference (Stoplight)](https://highlevel.stoplight.io/docs/integrations)
> - [Contacts API](https://highlevel.stoplight.io/docs/integrations/0144d92f3e7f2-create-contact)
> - [Opportunities API](https://highlevel.stoplight.io/docs/integrations/d45af89b0e71e-create-opportunity)

---

## User Setup Guide (GoHighLevel)

### What you'll need before starting

- A GoHighLevel account with an active sub-account
- Agency plan in Scout
- About 5 minutes

### Step 1 — Find your Location ID

Log into GHL and navigate to your sub-account (not the agency-level account). Look at the URL in your browser:

```
https://app.gohighlevel.com/v2/location/G43COt3uGbAzymts6uXB/dashboard
```

The **Location ID** is the portion after `/location/` and before the next `/`. In this example it's `G43COt3uGbAzymts6uXB`. Copy it.

> **Common mistake:** Using the agency-level URL. Make sure you're inside a sub-account, not the top-level agency view. The agency-level URL does not contain a Location ID.

### Step 2 — Create a Private Integration token

> ⚠️ **Critical:** You must use a **Private Integration token** — not the legacy API Key. The legacy key (Settings → Integrations → API Key) uses GHL's old v1 API. Scout calls GHL's v2 API, which requires Private Integration tokens. A legacy key will always return "Invalid JWT" errors regardless of what you do.
>
> See GHL's official guide: [Private Integrations](https://help.gohighlevel.com/support/solutions/articles/155000002161-private-integrations) · [API Key vs Private Integrations](https://help.gohighlevel.com/support/solutions/articles/155000002449)

1. In GHL, go to **Settings** (gear icon) → **Integrations** → **Private Integrations**
2. Click **"Create new integration"**
3. Name it **"Scout"** (or anything you'll recognize)
4. Under **Scopes**, enable exactly these three:
   - `contacts.write`
   - `contacts.readonly`
   - `opportunities.write`
5. Click **Create**
6. Copy the **Access Token** shown — it starts with `eyJ...`

> **Keep the token private.** Anyone with it can create contacts in your GHL account. Scout stores it encrypted in your Business Profile record in Airtable.
>
> **Visual check:** Both the legacy API Key and Private Integration tokens start with `eyJ...`. They look identical. The only way to tell them apart is where you copied them from. If you went to Settings → Integrations → API Key, that is the legacy key and it will NOT work.

### Step 3 — Get your Pipeline ID (optional but recommended)

If you want Scout to automatically create an Opportunity in a GHL pipeline when you push a contact:

1. In GHL, go to **Opportunities** → **Pipelines**
2. Click on the pipeline you want to use (e.g. "Scout Leads")
3. Copy the pipeline ID from the URL — it looks like `OJuoy9LGTq9r6m5YxeH9`

When set, Scout places each new contact into the **first stage** of this pipeline automatically. Users can then move the Opportunity through subsequent stages in GHL as the relationship develops.

> If the Pipeline ID field is left blank, Scout still creates the contact and note — it just skips Opportunity creation. You can add the Pipeline ID later without any data loss.

### Step 4 — Enter credentials in Scout

1. Go to **Settings** → **System** tab
2. Scroll to **CRM Integration**
3. Select **GoHighLevel**
4. Enter your **Location ID**
5. Enter your **Private Integration Token**
6. Enter your **Pipeline ID** (optional)
7. Click **Save**
8. Click **Test Connection** — you should see "Connected — GoHighLevel credentials are valid."

> **After a successful push**, Scout shows a "View in GoHighLevel ↗" link on the feed card. This links directly to the contact's record in GHL. If you see a warning in amber below the success state, read it — it tells you exactly what secondary step (note or Opportunity) failed and what to fix.

---

## How the Push Flow Works

### From the user's perspective

The user is reviewing their feed, sees an engaged post they want to follow up on, and clicks:

- **"Add to GoHighLevel pipeline"** (compact button in the feed card)
- OR **"Push to GoHighLevel"** (button in the expanded post view)

The button shows a spinner while processing, then either:
- Turns into a green "✓ Added to GoHighLevel" success state with a "View in GoHighLevel ↗" link
- Shows an amber warning if the contact was created but note/opportunity had an issue
- Shows a red error message with enough detail to diagnose a fatal failure

### What happens server-side (detailed)

```
1. POST /api/crm-push  
   ↓
2. Auth check (tenant config, plan gate — Agency/Owner only)  
   ↓
3. Ownership check (verify post record belongs to this tenant — IDOR prevention)
   ↓
4. Load CRM settings from Airtable Business Profile:
   - CRM Type, CRM API Key, CRM Location ID, CRM Pipeline ID
   ↓
5. Validate: CRM type must be GoHighLevel, API key and Location ID must be set
   ↓
6. findExistingGHLContact():
   - Search GHL contacts by author first+last name (GET /contacts/?locationId=X&query=Name)
   - If any result has website field == LinkedIn profile URL → return that contact's ID
   - If no match → return null
   ↓
7. If existing contact found:
   - PUT /contacts/{id} to update tags, name, website, source (best-effort, non-fatal)
   ↓
   If no existing contact:
   - POST /contacts/upsert with firstName, lastName, locationId, website (LinkedIn URL), tags, source
   - Extract contactId from response
   ↓
8. POST /contacts/{contactId}/notes
   - Body includes: source label, platform, engagement date, LinkedIn URL, post URL,
     post snippet (up to 400 chars), user's engagement notes
   - NOTE: userId field is intentionally omitted — GHL rejects empty userId string
   - Failure is surfaced as noteWarning in response (non-fatal — contact still succeeds)
   ↓
9. If pipelineId is set:
   - getFirstPipelineStageId(): GET /opportunities/pipelines?locationId=X
   - Find pipeline by ID, sort stages by position, return stages[0].id
   - POST /opportunities/ with pipelineId, locationId, name, pipelineStageId, contactId, status: 'open'
   - Failure is surfaced as warning in response (non-fatal)
   ↓
10. PATCH Airtable 'Captured Posts' record:
    - CRM Contact ID, CRM Pushed At, Action: 'CRM', clear Engagement Status
    ↓
11. Return { ok: true, contactId, contactUrl, opportunityId?, noteWarning? }
    - contactUrl = https://app.gohighlevel.com/v2/location/{locationId}/contacts/detail/{contactId}
    - Feed displays "View in GoHighLevel ↗" using this URL
    - amber noteWarning shown in feed card if secondary step failed
```

### GHL API endpoints used

| Action | Method | Endpoint | GHL Docs |
|--------|--------|----------|----------|
| Test connection | GET | `/contacts/?locationId=X&limit=1` | [Contacts API](https://highlevel.stoplight.io/docs/integrations/0144d92f3e7f2-create-contact) |
| Dedup search | GET | `/contacts/?locationId=X&query=Name&limit=10` | [Contacts API](https://highlevel.stoplight.io/docs/integrations/0144d92f3e7f2-create-contact) |
| Update existing contact | PUT | `/contacts/{id}` | [Contacts API](https://highlevel.stoplight.io/docs/integrations/0144d92f3e7f2-create-contact) |
| Create new contact | POST | `/contacts/upsert` | [Contacts API](https://highlevel.stoplight.io/docs/integrations/0144d92f3e7f2-create-contact) |
| Add note | POST | `/contacts/{id}/notes` | [Contacts API](https://highlevel.stoplight.io/docs/integrations/0144d92f3e7f2-create-contact) |
| Fetch pipelines (for stage ID) | GET | `/opportunities/pipelines?locationId=X` | [Opportunities API](https://highlevel.stoplight.io/docs/integrations/d45af89b0e71e-create-opportunity) |
| Create opportunity | POST | `/opportunities/` | [Opportunities API](https://highlevel.stoplight.io/docs/integrations/d45af89b0e71e-create-opportunity) |

All requests use: `https://services.leadconnectorhq.com` base URL, `Version: 2021-07-28` header.

### Contact URL format (deep link)

After creating a contact, Scout returns a direct link to the GHL contact page:

```
https://app.gohighlevel.com/v2/location/{locationId}/contacts/detail/{contactId}
```

This is the correct v2 URL format. The legacy format (`/contacts/{contactId}` without location) no longer works in GHL. The "View in GoHighLevel ↗" link in the feed uses this correct format.

---

## Architecture & Developer Reference

### Files involved

| File | Purpose |
|------|---------|
| `app/api/crm-test/route.ts` | Server-side connection test proxy (avoids CORS) |
| `app/api/crm-push/route.ts` | Main push handler — all GHL API calls happen here |
| `app/api/crm-settings/route.ts` | GET/POST CRM credentials from Business Profile |
| `app/settings/page.tsx` | `CRMIntegrationSection` component — settings UI |
| `app/page.tsx` | Feed card — `handleCrmPush`, push buttons, `crmWarning`/`crmContactUrl` state |
| `app/api/settings-agent/route.ts` | Scout Agent system prompt — CRM knowledge section |
| `docs/crm-integration.md` | This file |

### Plan gate

Both `crm-push` and `crm-settings` enforce:
```typescript
const CRM_ALLOWED_PLANS = new Set(['Scout Agency', 'Owner'])
```

This check is server-side. The UI shows/hides CRM settings based on plan, but the API is the authoritative gate. Changing the plan set in one file requires changing it in all three files (`crm-push`, `crm-settings`, `crm-test`).

### Why Test Connection is server-proxied

GHL's API at `services.leadconnectorhq.com` does not send CORS headers. A direct `fetch()` from the browser always throws a CORS error before the request even reaches GHL — meaning even valid credentials look like failures. Routing through `/api/crm-test` (a Next.js server route) avoids CORS entirely.

This is the root cause of the original "CORS error" bug that affected all users before v1.0.

### Deduplication strategy (no email available)

LinkedIn post data does not include the author's email address. GHL's native upsert deduplicates on email. Without email, every upsert would create a new contact regardless.

Scout's dedup approach:
1. Before upserting, search GHL for contacts matching the author's full name
2. Check if any returned contact has `website` == the LinkedIn profile URL
3. If match: `PUT` (update) that contact — no duplicate created
4. If no match: `POST /contacts/upsert` to create the new contact

This approach is correct for the vast majority of cases. Edge cases:
- Common names (e.g. "John Smith") could have multiple GHL contacts — only the first exact URL match triggers an update
- If `website` was previously set to something other than LinkedIn URL, the match will miss

Future improvement: store LinkedIn URL in a dedicated GHL custom field and search on that field specifically.

### Opportunity creation

Pipeline stage is not hardcoded. Each push dynamically fetches the pipeline configuration from GHL to get `stages[0].id` (sorted by `position`). This ensures the integration works with any customer's pipeline structure, regardless of stage names or IDs.

If pipelineId is blank, the opportunity step is skipped entirely — contact and note still succeed.

### Note body construction

The note attached to each GHL contact includes:
```
Source: Scout by ClientBloom
Platform: LinkedIn
Engaged: [date]
LinkedIn: [profile URL]
Post URL: [post URL]

Post snippet:
[first 400 chars of post text]

My engagement notes: [user's notes]
```

> **Important implementation detail:** The `userId` field is intentionally NOT sent in the note POST body. GHL rejects an empty `userId` string with a validation error. If you need to attribute notes to a specific GHL user, pass the user's actual GHL user ID — never an empty string.

### Feed UI state after push

The feed card maintains these state variables post-push:

```typescript
const [crmPushed,     setCrmPushed]     = useState(false)
const [crmWarning,    setCrmWarning]    = useState('')
const [crmContactUrl, setCrmContactUrl] = useState('')
```

- `crmPushed=true` → shows "✓ Added to GoHighLevel" success state
- `crmWarning` (non-empty) → shows amber warning paragraph below success
- `crmContactUrl` (non-empty) → shows "View in GoHighLevel ↗" link

---

## Airtable Schema Requirements

The following fields must exist in the **Business Profile** table in Airtable:

| Field name | Type | Purpose |
|-----------|------|---------|
| `CRM Type` | Single line text | 'GoHighLevel' or 'None' |
| `CRM API Key` | Single line text | Private Integration token |
| `CRM Location ID` | Single line text | GHL sub-account location ID |
| `CRM Pipeline ID` | Single line text | GHL pipeline ID (optional) |

The following fields must exist in the **Captured Posts** table:

| Field name | Type | Purpose |
|-----------|------|---------|
| `CRM Contact ID` | Single line text | GHL contact ID after push |
| `CRM Pushed At` | Date/time | Timestamp of successful push |

> **⚠️ If `CRM Location ID` doesn't exist in your Airtable Business Profile table, add it now.** The GET and POST routes reference this field. Reads from missing Airtable fields return `undefined` (graceful), but writes will fail silently if the field doesn't exist.

---

## API Reference

### POST /api/crm-test

Tests CRM credentials server-side. Proxies to GHL to avoid CORS.

**Request body:**
```json
{
  "crmType": "GoHighLevel",
  "crmApiKey": "eyJ...",
  "crmLocationId": "G43COt3uGbAzymts6uXB"
}
```

**Response:**
```json
{ "ok": true, "message": "Connected — GoHighLevel credentials are valid." }
{ "ok": false, "message": "Invalid token — 401 Unauthorized. Make sure you copied the Private Integration token (not the legacy API Key) and that it has contacts.readonly scope." }
{ "ok": false, "message": "Token valid but missing permissions. Ensure contacts.readonly and contacts.write scopes are enabled on the Private Integration." }
```

### GET /api/crm-settings

Returns saved CRM configuration for the authenticated tenant.

**Response:**
```json
{
  "crmType": "GoHighLevel",
  "crmApiKey": "eyJ...",
  "crmLocationId": "G43COt3uGbAzymts6uXB",
  "crmPipelineId": "OJuoy9LGTq9r6m5YxeH9"
}
```

### POST /api/crm-settings

Saves CRM configuration for the authenticated tenant.

**Request body (all fields optional — only provided fields are updated):**
```json
{
  "crmType": "GoHighLevel",
  "crmApiKey": "eyJ...",
  "crmLocationId": "G43COt3uGbAzymts6uXB",
  "crmPipelineId": "OJuoy9LGTq9r6m5YxeH9"
}
```

### POST /api/crm-push

Pushes a post's author to the configured CRM.

**Request body:**
```json
{
  "recordId": "recXXXXXXXX",
  "authorName": "Winston Weinberg",
  "authorProfileUrl": "https://linkedin.com/in/winstonweinberg",
  "postText": "Excited to welcome the inaugural members...",
  "postUrl": "https://linkedin.com/feed/update/...",
  "platform": "LinkedIn",
  "notes": "Mentioned Harvey's advisory board — great timing to reach out",
  "engagedAt": "2026-04-06T06:00:00Z"
}
```

**Success response:**
```json
{
  "ok": true,
  "contactId": "abc123",
  "contactUrl": "https://app.gohighlevel.com/v2/location/G43COt3.../contacts/detail/abc123",
  "opportunityId": "opp456",
  "noteWarning": null,
  "crmType": "GoHighLevel"
}
```

**Partial success (contact created, note or opportunity failed):**
```json
{
  "ok": true,
  "contactId": "abc123",
  "contactUrl": "https://app.gohighlevel.com/v2/location/.../contacts/detail/abc123",
  "opportunityId": "",
  "noteWarning": "Contact created but pipeline assignment failed (403). Check opportunities.write scope.",
  "crmType": "GoHighLevel"
}
```

> Partial success is shown in the UI as a green "✓ Added" state with an amber warning below. The contact was successfully created in GHL — only the secondary step failed.

---

## Error Reference

### Fatal errors (red — push failed)

| Error message | Root cause | Fix |
|--------------|-----------|-----|
| `Invalid token — 401 Unauthorized` | Using legacy API Key instead of Private Integration token | Create a Private Integration at GHL → Settings → Integrations → Private Integrations. See [GHL guide](https://help.gohighlevel.com/support/solutions/articles/155000002161-private-integrations). |
| `Token valid but missing permissions — 403` | Private Integration exists but missing required scopes | Edit the integration at GHL → Settings → Integrations → Private Integrations → add contacts.write, contacts.readonly, opportunities.write |
| `GoHighLevel Location ID is missing` | locationId field empty in settings | Add your GHL sub-account Location ID in Settings → System → CRM Integration |
| `GHL did not return a contact ID` | Upsert succeeded but response format unexpected | Check GHL API status; inspect server logs for raw response |
| `CRM push requires the Scout Agency plan` | User on Trial/Starter/Pro trying to push | Upgrade to Agency plan |
| `No CRM configured` | CRM type is 'None' or API key is missing | Complete CRM setup in Settings → System |
| `Network error reaching GHL` | DNS/network issue between Scout server and GHL | Temporary — retry; if persistent, check GHL status at status.gohighlevel.com |

### Non-fatal warnings (amber — contact created, secondary step failed)

| Warning message | Root cause | Fix |
|----------------|-----------|-----|
| `Contact created but note failed to attach (...). Verify contacts.write scope is enabled on your Private Integration.` | Note POST failed | Check that contacts.write scope is enabled. See [Private Integrations guide](https://help.gohighlevel.com/support/solutions/articles/155000002161-private-integrations). |
| `Contact created but pipeline assignment failed (403). Check opportunities.write scope.` | Missing opportunities.write scope | Edit Private Integration to add opportunities.write scope |
| `Contact created but pipeline not found. Double-check the Pipeline ID in CRM settings.` | Pipeline ID doesn't match any pipeline in the account | Go to GHL → Opportunities → Pipelines, click your pipeline, copy the ID from the URL |

---

## Testing the Integration

### Manual test flow (after setup)

1. Go to Settings → System → CRM Integration
2. Fill in Location ID, Private Integration Token, and Pipeline ID
3. Click **Save**
4. Click **Test Connection** — must return green "Connected" status
5. Go to the feed
6. Open any post in the Engaged tab (must be engaged/replied to see the push button)
7. Click **"Add to GoHighLevel pipeline"**
8. Verify in GHL:
   - Contact exists with correct name and LinkedIn URL in `website` field
   - Note is attached with post content and engagement notes
   - Opportunity exists in the configured pipeline at first stage
9. Verify in Scout feed:
   - "View in GoHighLevel ↗" link appears — click it to confirm the URL resolves to the correct contact record
   - No amber warning appears (if one does, read it and fix the scope issue it describes)

### Adversarial test cases (all verified in v1.0 / v1.1)

| Test | Expected result | Status |
|------|----------------|--------|
| Push same person twice | Second push updates existing contact, does NOT create duplicate | ✓ |
| Missing pipeline ID | Contact + note created successfully; no Opportunity; no error | ✓ |
| Wrong pipeline ID | Contact + note created; amber warning about pipeline not found | ✓ |
| Legacy API Key (not Private Integration) | Red: "Invalid token — 401" error explaining the correct credential type | ✓ |
| Missing contacts.readonly scope | Test Connection returns "403 Missing permissions" error | ✓ |
| Missing opportunities.write scope | Contact + note succeed; Opportunity fails; amber warning in feed | ✓ |
| Missing contacts.write scope | Note creation fails; amber warning; contact may still succeed via upsert | ✓ |
| Empty author name | firstName: 'Unknown', lastName: '' — contact created | ✓ |
| Author name with 1 word only | firstName = that word, lastName = '' | ✓ |
| Push from non-Agency plan | 403 returned — plan gate enforced server-side | ✓ |
| Post record not owned by this tenant | 404 returned — IDOR protection active | ✓ |
| GHL API timeout | 502 returned with descriptive error message | ✓ |
| Empty userId in note body | No userId field sent — GHL validation passes | ✓ (post-prod fix) |
| contactUrl in response | "View in GoHighLevel ↗" link displayed in feed | ✓ (post-prod fix) |
| noteWarning in response | Amber warning displayed in feed below success state | ✓ (post-prod fix) |

---

## Known Limitations

**No email address on contacts**  
LinkedIn post data does not expose the author's email. GHL contacts created via Scout will have a name, LinkedIn URL, tags, and notes — but no email address. Users must manually add emails in GHL if needed.

**Name-based deduplication risk for common names**  
Scout deduplicates by searching for contacts with a matching LinkedIn URL. The search query uses the author's full name. If two contacts have the exact same name in GHL, Scout checks the `website` field of each result and matches on the LinkedIn URL. This is reliable for most cases. An exact URL collision (same name + someone else's LinkedIn URL already set on a GHL contact) is theoretically possible but extremely unlikely.

**Pipeline stage is always stage 0**  
Scout places every new Opportunity at the first stage of the configured pipeline. Users cannot configure which stage to use. This keeps setup simple; users move Opportunities through subsequent stages manually in GHL.

**Single CRM per account**  
Each Scout account can only connect one CRM at a time. If a user switches from GoHighLevel to HubSpot (when available), they must re-configure and re-test credentials.

**Private Integration token scope — all three required**  
Scout requires `contacts.write`, `contacts.readonly`, and `opportunities.write` simultaneously. Enabling only one or two will cause partial failures (contact created, note or Opportunity skipped). GHL's Private Integrations UI allows selecting scopes individually — users sometimes miss one.

---

## HubSpot Roadmap

HubSpot integration is planned but not yet live. The UI already shows HubSpot as "Coming Soon" with a disabled button. The existing `pushToHubSpot()` function stub has been removed — it was never tested against real HubSpot credentials and contained an unfixed deduplication gap (HubSpot creates a new contact on 409 instead of updating).

When HubSpot is implemented, it will require:
- HubSpot Private App token with scopes: `crm.objects.contacts.write`, `crm.objects.notes.write`, `crm.objects.deals.write`
- Contact dedup strategy (HubSpot deduplicates on email — need an alternative for email-less contacts)
- Deal creation in a HubSpot pipeline (equivalent to GHL Opportunity)
- HubSpot contact URL format: `https://app.hubspot.com/contacts/{portalId}/contact/{contactId}`

---

## Version History

| Version | Date | Summary |
|---------|------|---------|
| 1.1 | April 2026 | Post-production fixes: removed empty `userId` from note body (GHL validation error), added `crmWarning` and `crmContactUrl` state to feed UI (response fields were ignored), corrected amber warning copy (was blaming `opportunities.write` for a `contacts.write` note failure), fixed feed copy ("Connect GHL or HubSpot" → "Connect GoHighLevel"). Added GHL official documentation links throughout. Updated error reference with non-fatal warning table. Added rollback tags to this file. |
| 1.0 | April 2026 | Initial GHL integration overhaul — contact upsert with dedup by LinkedIn URL, note creation, Opportunity creation at pipeline stage 0, server-side test proxy (`/api/crm-test`) to eliminate CORS failures, correct GHL v2 deep link URL format, HubSpot "Coming Soon" UI, Airtable `CRM Location ID` field added. Replaced broken prototype. |
| pre-1.0 | 2025 | Broken prototype — used legacy API Key (caused 401), browser-side test (CORS), no locationId, no Opportunity creation, wrong contact URL format, note failures silently dropped |

### Rollback tags

| Tag | State |
|-----|-------|
| `crm-overhaul-v1.0` | Production state after v1.0 merge + post-production fixes |
| `crm-pre-overhaul-v1` | State immediately before v1.0 overhaul (broken prototype) |

To roll back to pre-overhaul state: `git checkout crm-pre-overhaul-v1`  
To inspect the v1.0 production state: `git checkout crm-overhaul-v1.0`
