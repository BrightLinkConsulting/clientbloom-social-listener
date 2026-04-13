# Scout CSM Agent — README

**Version:** 1.0 (April 2026)
**Route:** `POST /api/admin/csm-agent`
**UI:** Floating amber button in admin panel bottom-right corner

---

## What it is

The CSM Agent is an AI-powered Customer Success Manager built into the Scout admin panel. It gives the admin (Mike Walker) a conversational interface for managing the customer portfolio — asking questions about account health, identifying churn risks, and executing common CSM workflows with a single confirmation click.

The agent is powered by Claude (`claude-opus-4-6`) and runs entirely server-side. It has read access to the full tenant portfolio and limited, confirmed write access for common operations.

---

## Read capabilities

The agent can answer questions about:

- Full tenant portfolio (all accounts, plans, statuses, trial timelines)
- Account health across the portfolio (service flags, last scan, post counts)
- Trial pipeline (who's about to expire, who hasn't set up, who needs outreach)
- Individual account details on demand

**Example questions:**
- "Who's at risk of churning this week?"
- "Which paid accounts haven't scanned in 48 hours?"
- "Show me all accounts on the trial that haven't set up their ICP"
- "How many accounts do I have on each plan?"
- "What's happening with Acme Corp?"

---

## Write capabilities

The agent can execute these operations **after you confirm**:

| Operation | What it does |
|-----------|-------------|
| `archive_tenant` | Sets Status=Archived + archivedAt timestamp |
| `unarchive_tenant` | Restores Status=Active, clears archivedAt |
| `update_status` | Changes status between Active and Suspended |
| `update_plan` | Changes the tenant's plan |
| `send_password_reset` | Generates a new temp password, updates the hash, sends the email |
| `send_reactivation` | Sends a reactivation email to an expired trial account |
| `grant_trial` | Creates a new 7-day trial account (delegates to `/api/admin/grant-access`) |

**The agent never self-confirms.** Every write operation returns a confirmation UI block in the chat panel. You must click "Confirm" before the action executes.

**Example write requests:**
- "Archive all accounts that expired over 30 days ago"
- "Suspend the account for bad-actor@example.com"
- "Send a reset to jane@company.com — she's locked out"
- "Upgrade Acme Corp to Scout Pro"

---

## What it cannot do

- Hard delete any account (use the main admin UI Delete button for that)
- Access raw API tokens, password hashes, or Stripe keys
- Take action without confirmation
- Operate on admin/owner accounts

---

## Security model

**Admin-only:** The route requires `isAdmin=true` in the caller's session (enforced by `getTenantConfig()` + session check).

**Confirmation gate:** Every write action sets `requiresConfirmation: true` in its response. The frontend renders a confirmation panel before POSTing back with `confirm: true`. The agent cannot bypass this — it's enforced in the request handler, not just in the system prompt.

**Audit trail:** Every confirmed write action creates an `Admin Audit Log` entry with `source: 'csm_agent'` in the notes. This means all agent-executed changes are traceable.

**No hard delete:** Hard delete is explicitly excluded from the agent's capabilities. It requires the multi-step modal confirmation in the main UI.

**Prompt injection defense:** The agent system prompt instructs Claude not to follow instructions embedded in tenant data fields (company names, emails, etc.). The agent operates on structured data fields only — it does not render or execute tenant-provided content.

---

## How the confirmation flow works

1. You type a request: "Archive the account for inactiveuser@example.com"
2. The agent responds with a plain-English description and embeds a JSON block in its reply:
   ```json
   {
     "action": {
       "type": "archive_tenant",
       "requiresConfirmation": true,
       "tenantRecordId": "recXXXXXXXXXX",
       "tenantEmail": "inactiveuser@example.com",
       "summary": "Archive account for inactiveuser@example.com"
     }
   }
   ```
3. The frontend strips the JSON block from the displayed message and renders a confirmation banner
4. You click "Confirm"
5. The frontend POSTs back with `{ confirm: true, pendingAction: <action> }`
6. The server validates and executes the action
7. The result ("✓ Archived inactiveuser@example.com.") appears in the chat

---

## Architecture

**File:** `dashboard/app/api/admin/csm-agent/route.ts`

**Dependencies:**
- `lib/audit-log.ts` — writes audit log entries on confirmed actions
- `lib/tenant.ts` — getTenantConfig() for admin auth check
- Anthropic Claude API (`claude-opus-4-6`)
- Resend (for password reset emails)
- Direct Airtable PATCH calls (for status/plan/archive changes)

**Tenant context:** The frontend passes the current tenant list (up to 50 accounts) with each request. This gives the agent portfolio-wide awareness without requiring separate API calls. The context is built from the same data already loaded in the admin panel.

**Message history:** Up to 8 prior messages are passed per request for conversational continuity. This allows multi-turn workflows ("which accounts need attention?" → "archive all three of those").

---

## Configuration

| Env variable | Required | Purpose |
|-------------|---------|---------|
| `ANTHROPIC_API_KEY` | Yes | Claude API access |
| `PLATFORM_AIRTABLE_TOKEN` | Yes | Write access to Tenants table |
| `PLATFORM_AIRTABLE_BASE_ID` | Yes | Platform base ID |
| `RESEND_API_KEY` | For password resets | Email delivery |
| `NEXT_PUBLIC_BASE_URL` | For email links | Base URL for Scout app |

---

## Extending the agent

To add new write capabilities:

1. Add the new `type` to the `executeAction` switch in `route.ts`
2. Add the operation to the system prompt's "What you can do" section
3. Include the operation in the "What you cannot do" if there are restrictions
4. Add an `AuditEventType` to `lib/audit-log.ts` if needed
5. Update this README

The action schema is intentionally simple — type, tenantRecordId, tenantEmail, payload, summary. Keep new actions consistent with this pattern.

---

## Handing off to a new developer

If you're inheriting this codebase:

1. The CSM Agent route is at `dashboard/app/api/admin/csm-agent/route.ts`
2. The floating UI panel is in `dashboard/app/admin/page.tsx` — search for `CsmAgentPanel`
3. The agent operates in the same auth session as the rest of the admin panel — no separate credentials
4. The `ANTHROPIC_API_KEY` env variable must be set in Vercel for the agent to function
5. All confirmed actions write to `Admin Audit Log` in Airtable — this is your paper trail
6. The agent cannot hard-delete accounts. That's by design and should not be changed without explicit product approval.
