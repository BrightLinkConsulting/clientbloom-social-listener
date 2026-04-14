---
name: Scout — Airtable schema gotchas
description: Fields that do and don't exist in Scout's Airtable tables — prevents UNKNOWN_FIELD_NAME 422 errors. Updated with all fields added through April 14 2026.
type: feedback
originSessionId: ac3e2f31-3506-419e-91e9-d5fda3ecea98
---
Before writing any new field to Airtable in Scout, verify the field exists. Writing to a non-existent field throws UNKNOWN_FIELD_NAME and the entire API call fails silently (no UI error without the error banner). When in doubt, confirm via the Airtable MCP.

**Why:** Engaged By was in code but never existed — caused Engage button to silently fail for months (removed bd63e93). Invited By caused team invite to fail. This pattern has burned multiple sessions.

**How to apply:** When extending Scout to write new Airtable fields, always either (a) verify the field was previously mentioned in working code, or (b) confirm with Mike that he added it manually in Airtable first.

## Tenants table

Confirmed fields: Email, Password Hash, Company Name, Tenant ID, Is Feed Only (checkbox), Status, Plan, Created At, Archived At (date)

**Trial fields added April 2026:** Trial Ends At (date), Trial Last Email Sent At (datetime), Trial Email Day (number)

**Plan values now include:** Trial, Scout Starter, Scout Pro, Scout Agency, Owner (the old 'Scout $79' value is obsolete)

**Status values now include:** Active, trial_expired, Suspended, Archived

Does NOT exist: Invited By, Airtable Base ID

## Captured Posts table

Confirmed engagement fields: Notes, Notes Updated At, Notes Updated By, Reply Log (JSON string), CRM Contact ID, CRM Pushed At, Action, Engagement Status, Score, Comment Approach, Post URL, Author Name, Author URL, Post Text, Posted At, Source, Tenant ID

Does NOT exist: Engaged By — NEVER add back without first creating in Airtable UI

## Business Profile table

Confirmed fields: Business Name, Industry, Ideal Client, Problem Solved, Signal Types, Updated At, Scoring Prompt, CRM Type, CRM API Key, CRM Pipeline ID, Slack Bot Token, Slack Channel ID, Slack Channel Name, Tenant ID

Added April 6, 2026: Momentum History (Long text) — stores JSON array of DaySnapshot objects { date: YYYY-MM-DD, surfaced, engaged, replied, crm }. Base appZWp7QdPptIOUYB, table tblxoKaCyy28yzbFE.

## Scan Health table

Table ID: tblyHCFjjhpnJEDno. Tracks per-tenant: Last Scan At, Last Scan Status, Last Posts Found, FB Run ID, FB Run At, FB Dataset ID.

Note: FB fields still exist in the schema (legacy) but are no longer written by scan logic.
