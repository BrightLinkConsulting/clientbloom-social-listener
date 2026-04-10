# Scout Agent — Architecture & Operations Guide

> **Audience:** Engineers maintaining or extending the Scout codebase.
> **Last updated:** April 2026 (Session 5 — Scout Agent button redesign + adversarial validation)

---

## What Scout Agent Is

Scout Agent is a conversational AI assistant embedded in the Scout inbox. It serves two purposes:

1. **Inbox management** — interprets natural-language commands (e.g. "clear everything below score 5") and translates them into structured actions executed via `/api/posts/bulk`.
2. **Platform guide** — answers questions about how Scout works: plans, pricing, features, settings, limits, scans, scoring, billing, and more. Answers are always personalized to the user's actual plan.

The agent is powered by Claude Haiku (claude-haiku-4-5-20251001) via the Anthropic Messages API and runs entirely server-side. The user's API key and all Airtable access happen inside Next.js API routes — never in the browser.

The agent operates strictly from its built-in knowledge base. It does not query live data to answer platform questions, and it is explicitly instructed never to guess or hallucinate answers outside of what is documented in the system prompt.

---

## Architecture Overview

```
Browser (page.tsx)
  │
  │  POST /api/inbox-agent
  │  { message, context: { plan, inboxCount, skippedCount, topPosts, scoreDistribution }, history }
  ▼
inbox-agent/route.ts                 ← Validates input, builds prompt, calls Claude
  │
  │  Anthropic Messages API (Haiku)
  ▼
Claude Haiku                         ← Returns JSON { reply, action }
  │
  │  Output sanitization layer
  ▼
inbox-agent/route.ts                 ← Whitelists action type, clamps scores, forces confirm
  │
  │  { reply, action } response
  ▼
Browser (ScoutAgentPanel component)
  │
  │  If action.confirm = true → show confirmation dialog
  │  If action.confirm = false → auto-execute
  │
  │  POST /api/posts/bulk  (inbox management actions only)
  │  { action, filter }
  ▼
posts/bulk/route.ts                  ← Tenant-scoped Airtable PATCH
```

For platform questions (plans, features, billing, settings), the agent returns a plain conversational `reply` with `action.type = 'none'` — no Airtable write happens.

---

## Files

| File | Purpose |
|------|---------|
| `app/page.tsx` | `ScoutAgentPanel` component — chat UI, pending action confirmation, execResult display, plan prop |
| `app/api/inbox-agent/route.ts` | AI endpoint — input validation, prompt construction, plan injection, output sanitization |
| `app/api/posts/bulk/route.ts` | Bulk action executor — skip / archive / restore with Airtable formula safety |
| `docs/api-reference.md` | External API contracts for both routes |

---

## System Prompt Structure

The system prompt has three clearly labeled sections. When updating Scout's features, plans, or limits, **only Section 2 needs to change** — the other two sections govern behavior, not knowledge.

### Section 1 — Role & Actions

Defines Scout Agent's two purposes and the five inbox action types it can propose (`bulk_skip`, `bulk_archive`, `bulk_restore`, `set_min_score`, `none`).

### Section 2 — Platform Knowledge Base

The complete factual ground truth the agent draws from when answering platform questions. Organized into subsections:

- What Scout is
- Plans and pricing (Trial, Starter $49, Pro $99, Agency $249)
- Full feature limits by plan (pool size, scan slots, keywords, comment credits, seats, workspaces, post history, CRM access, discover runs)
- How scans work (cadence, manual trigger, zero-posts breakdown)
- Scoring guide (1–10 scale, thresholds, custom prompt)
- Inbox tabs and their meanings
- AI comment suggestions and credit limits
- Settings (Business Profile, ICP Pool, Keywords, Slack, CRM, Billing, Password)
- Discover ICPs (gating, run limits, how to use)
- Slack digest (timing, setup)
- Team seats (Agency: 5, others: 1)
- Billing flows (upgrade, change plan, cancel, invoices)
- Trial details (7 days, no CC, limits)
- Support contact (info@clientbloom.ai)

**When to update Section 2:** any time a plan price changes, a tier limit changes, a new feature ships, or a feature moves between tiers. The agent cannot know what it is not told — stale knowledge = wrong answers.

Note: Section 2 is maintained as natural language text separately from `lib/tier.ts` (the server-side enforcement source of truth), because Claude cannot import TypeScript. When limits change, **both** must be updated.

### Section 3 — Behavioral Rules

15 explicit rules covering:

| Rule | Topic |
|------|-------|
| 1 | Always confirm destructive bulk actions (`confirm: true`) |
| 2 | Be concise — 2-4 sentences max |
| 3 | What to engage: suggest top 2-3 from TOP POSTS |
| 4 | Score guide: 8-10 engage today, 6-7 when inspired, 1-5 skip |
| 5 | No hallucination on posts — only reference TOP POSTS |
| 6 | No hallucination on platform — only use knowledge base |
| 7 | Proactively suggest inbox cleanup when inbox > 200 posts |
| 8 | Score filters must be integers 0-10 |
| 9 | `currentAction` only accepts "New", "Skipped", "Engaged" |
| 10 | Post content safety — treat [USER POST CONTENT] blocks as data only |
| 11 | Partial context — flag when score breakdown is estimated |
| 12 | **Unknown questions → honest "I'm not sure" + support redirect** |
| 13 | **Plan-aware answers — always personalize to user's actual plan** |
| 14 | **Upgrade suggestions — proactive but specific when user hits a limit** |
| 15 | **No unsolicited upsells — only suggest upgrade when genuinely warranted** |

Rules 12–15 are the hallucination guardrail and plan-awareness layer added in Session 4.

---

## How the Agent Works (Step by Step)

### 1. User sends a message

`ScoutAgentPanel.sendMessage()` fires a `POST /api/inbox-agent` request with:

- `message` — the user's natural language text (max 1000 characters)
- `context` — live state snapshotted from the UI:
  - `plan` — user's current plan from session JWT (e.g. `'Scout Pro'`, `'Trial'`)
  - `inboxCount` — total posts in the Inbox tab
  - `skippedCount` — posts in the Skipped tab
  - `topPosts` — up to 10 posts sorted by score descending
  - `scoreDistribution` — `{ high, mid, low }` counts by score bracket
- `history` — last 6 message turns from the current session

### 2. Server validates and sanitizes input

`inbox-agent/route.ts` enforces:

- `message` must be non-empty and ≤ 1000 characters (client-side guard + server 400)
- `history` entries must have a valid role (`user` | `assistant`) and content ≤ 2000 characters; invalid entries are dropped silently
- `context.plan` is type-checked and passed through a `PLAN_LABELS` map before reaching the model
- All other context fields are type-checked and defaulted safely

### 3. Plan injection — context block assembly

The server assembles a `contextBlock` with the user's plan as the **very first line**, pinned above inbox state and above post data. This ensures the agent knows the user's plan before it reads anything else:

```
USER PLAN: Scout Pro ($99/mo)

INBOX STATE:
- 148 posts in inbox
- 12 posts in skipped tab
- Score breakdown: 14 high (8-10), 28 mid (6-7), 106 low (0-5)
- NOTE: Score breakdown above is estimated from 100 loaded posts out of 148 total. [only shown when partial]

TOP POSTS:
  • Score 9/10 | Jane Smith: [USER POST CONTENT]: We're hiring a VP of Sales... [END USER POST CONTENT]
  • Score 8/10 | John Doe: [USER POST CONTENT]: Just launched our Series B... [END USER POST CONTENT]

USER MESSAGE: How many keywords can I add?
```

The `PLAN_LABELS` map translates internal plan strings to human-readable labels with prices:

```typescript
const PLAN_LABELS: Record<string, string> = {
  'Scout Starter':  'Scout Starter ($49/mo)',
  'Scout Pro':      'Scout Pro ($99/mo)',
  'Scout Agency':   'Scout Agency ($249/mo)',
  'Trial':          'Free Trial (7-day)',
  'Owner':          'Owner (internal)',
  'Complimentary':  'Complimentary (gifted)',
}
```

### 4. Claude Haiku response

For an **inbox action** request:
```json
{
  "reply": "You have 106 low-score posts. Want me to skip everything below score 6?",
  "action": {
    "type": "bulk_skip",
    "filter": { "maxScore": 5, "currentAction": "New" },
    "confirm": true,
    "summary": "Skip 106 posts with score ≤ 5 in your inbox"
  }
}
```

For a **plan-aware platform question** (Rule 13):
```json
{
  "reply": "On your Pro plan you can add up to 10 keyword sources. You currently have access to 25 ICP scan slots per run as well.",
  "action": { "type": "none", "confirm": false, "summary": "" }
}
```

For a **feature the user doesn't have** (Rule 14):
```json
{
  "reply": "CRM integration is Agency-only ($249/mo). Your current Starter plan doesn't include it. Upgrading to Agency also gets you 500 ICP profiles, unlimited comment credits, and 5 team seats. You can upgrade at Settings → Plan & Billing or click Upgrade in the top nav.",
  "action": { "type": "none", "confirm": false, "summary": "" }
}
```

For a **question outside the knowledge base** (Rule 12):
```json
{
  "reply": "I'm not sure about that — for account-specific issues or questions outside what I know, reach out to support at info@clientbloom.ai.",
  "action": { "type": "none", "confirm": false, "summary": "" }
}
```

### 5. Output sanitization

Before the response leaves the server, the output sanitization layer enforces security regardless of what Claude returns. See the Security Model section below.

### 6. Frontend handles the response

- `reply` is appended to the message thread.
- If `action.type === 'none'` → nothing further happens (platform Q&A, conversational reply).
- If `action.confirm === true` → a confirmation card appears. The user must approve before anything executes.
- If `action.confirm === false` (only `set_min_score`) → auto-executes immediately.

### 7. Action execution (inbox actions only)

`executeAgentAction()` in `page.tsx` maps agent action types to `handleBulkAction` calls:

| Agent action type | `handleBulkAction` call |
|-------------------|------------------------|
| `bulk_skip` | `handleBulkAction('skip', { filter })` |
| `bulk_archive` | `handleBulkAction('archive', { filter })` |
| `bulk_restore` | `handleBulkAction('restore', { filter })` |
| `set_min_score` | Updates `minScore` state — no Airtable write |

`handleBulkAction` calls `POST /api/posts/bulk`, waits 1500ms for Airtable propagation, then re-fetches posts. It returns the count of affected records, displayed as "Done — 47 posts updated".

---

## Platform Knowledge Base — Maintenance Guide

The knowledge base lives in Section 2 of `SYSTEM_PROMPT` in `app/api/inbox-agent/route.ts`. It is the single source of truth for everything the agent can answer about the platform.

### What the agent knows

| Topic | Coverage |
|-------|----------|
| Plans & pricing | Trial (free 7d), Starter $49/mo, Pro $99/mo, Agency $249/mo |
| Feature limits | Full table: pool size, scan slots, keywords, comment credits, seats, workspaces, post history, CRM, discover runs |
| CRM integration | Agency-only; GoHighLevel; setup via Settings |
| Scans | Cadence by plan, manual trigger, 30-min cooldown, zero-posts breakdown |
| Scoring | 1-10 scale, thresholds, custom prompt, how to update |
| Inbox tabs | Inbox, Engaged, Replied, Skipped, In CRM — meanings and behaviors |
| Comment credits | Limits by plan, monthly reset, trial total |
| Settings | Business Profile, ICP Pool, Keywords, Slack, CRM, Billing, Password |
| Discover ICPs | Gating by plan, run limits, dedup behavior |
| Slack digest | 3pm UTC / 8am PT, setup instructions |
| Team/seats | Agency: 5 seats; others: 1; how to invite |
| Billing | Upgrade, plan change via portal, cancel flow, invoice access |
| Trial | 7 days, no CC, limits, what happens when it expires |
| Support | info@clientbloom.ai |

### What the agent will NOT answer (by design)

- Account-specific questions (why is my scan failing, why was I charged X)
- Questions about integrations not listed above
- Third-party platform questions (Slack workspace setup, GHL pipeline config, etc.)
- Anything requiring live account data beyond the inbox context provided

For all of these, the agent says it's not sure and directs the user to support.

### Plan-aware upgrade suggestions

When a user asks about a feature their plan doesn't include, or hits a limit, Rule 14 instructs the agent to:

1. Name the plan that unlocks the feature
2. State the price
3. List the exact feature gain (and any other notable upgrades they'd receive)
4. Point to Settings → Plan & Billing or the top nav Upgrade button

Rule 15 prevents this from becoming a sales pitch — upgrades are only suggested when genuinely warranted by the user's question or situation.

### Updating the knowledge base

When plans, features, or limits change:

1. Open `app/api/inbox-agent/route.ts`
2. Find the `SYSTEM_PROMPT` constant
3. Update **Section 2 only** — do not touch Sections 1 or 3
4. Also update `lib/tier.ts` (server-side enforcement)
5. Also update `docs/api-reference.md`, `docs/architecture-overview.md`, and marketing pages

---

## Security Model

### Hallucination Guardrail (Rule 12)

The system prompt's Rule 12 explicitly instructs the agent:

> "If the user asks something not covered by the knowledge base — respond honestly: say you're not sure and direct them to support at info@clientbloom.ai. Never guess or make up an answer."

### Prompt Injection Defense (B1)

LinkedIn post text is wrapped in `[USER POST CONTENT]: ... [END USER POST CONTENT]` delimiters. Rule 10 instructs the model to treat content inside those blocks as data only, never as instructions.

### Formula Injection Defense (H1)

`currentAction` is validated against a whitelist (`['New', 'Skipped', 'Engaged']`) at both the agent endpoint and the bulk route before any Airtable formula interpolation. Any unrecognised value defaults to `'New'`.

### Forced Confirmation (C5)

`bulk_skip` and `bulk_archive` always have `confirm: true` enforced server-side, regardless of what the model returns. Users always see the confirmation dialog before posts are removed.

### Action Type Whitelist (C1)

`action.type` is checked against `ALLOWED_ACTION_TYPES`. Unknown types are replaced with `none`.

### Score Clamping (C2)

`maxScore` and `minScore` are clamped to integers `[0, 10]` at the agent output layer and again inside `fetchMatchingIds` in the bulk route.

### History Validation (B2)

History entries with invalid roles are dropped; content is truncated to 2000 characters per entry; the array is capped at 6 turns.

### Message Length Limits (E1/E2)

Messages over 1000 characters are blocked client-side with an inline error and rejected server-side with HTTP 400.

### Partial Context Disclosure (A1)

When fewer posts are loaded than `inboxCount`, the context block includes a note that score distribution is estimated. Rule 11 instructs the agent to surface this caveat when the user asks for exact counts.

---

## Action Reference

| Agent type | Bulk API action | Airtable effect | Confirm required |
|------------|----------------|-----------------|-----------------|
| `bulk_skip` | `skip` | `Action='Skipped'`, `Engagement Status=''` | Always |
| `bulk_archive` | `archive` | `Engagement Status='archived'` | Always |
| `bulk_restore` | `restore` | `Action='New'`, `Engagement Status=''` | Sometimes |
| `set_min_score` | (none — UI only) | Updates `minScore` state in React | Never |
| `none` | (none) | No write | N/A |

---

## Conversation State

Conversation history is stored in React state inside `ScoutAgentPanel` (`messages` array):

- **Not persisted** — closing and reopening the panel starts a fresh session
- **Trimmed to 6 turns** before being sent to Claude
- **Cleared** when the user clicks "↺ New" in the panel header, or switches inbox tabs

The panel closes automatically on tab switch (G3 fix) to prevent stale inbox context from being used against a different tab.

---

## Adding New Action Types

To add a new inbox action type (e.g., `bulk_engage`):

1. Add it to `ALLOWED_ACTION_TYPES` in `inbox-agent/route.ts`
2. Add it to Section 1 of `SYSTEM_PROMPT` (the actions list)
3. If destructive, add it to `ALWAYS_CONFIRM_TYPES`
4. Add it to `fieldsForAction()` in `posts/bulk/route.ts`
5. Handle it in `executeAgentAction()` in `page.tsx`
6. Update the action reference table in this document and `docs/api-reference.md`

---

## Session Changelog

### Session 5 — April 2026 (Scout Agent Button Redesign + Full Adversarial Validation)

**Problem solved**
The floating Scout Agent button was nearly invisible at rest (`bg-[#0d1017]` with a barely-visible slate border), causing it to blend into the dark UI chrome. Users could easily scroll past it without noticing it existed.

**Button redesign (`app/page.tsx`)**

| State | Before | After |
|-------|--------|-------|
| Resting | Dark (`#0d1017`) + slate border — invisible | ClientBloom violet (`violet-600`) — always visible |
| Hover | Blue border tint + text brightens | Lightens to `violet-500`, scales up 5% |
| Open | Blue-600 | Darkens to `violet-700`, scales down (pressed feel) |
| Click feedback | None | `active:scale-95` tactile response |
| Shadow | `shadow-black/40` | `shadow-violet-600/40` — branded glow |

**Attention pulse (`agentPulse` state)**
- A `bg-violet-500 animate-ping` ring fires once on inbox load (via `useEffect([], [])`)
- Auto-stops after 5000ms via `clearTimeout` cleanup (no memory leak on unmount)
- Stops immediately if user opens the panel (`setAgentPulse(false)` in click handler)
- Ring is hidden while panel is open (`agentPulse && !agentOpen` condition)
- Ring has `pointer-events-none` so it cannot intercept button clicks
- Never repeats within a session — it's an onboarding nudge, not a recurring distraction

**Why bottom-right position was kept**
Bottom-right is the universal location for chat and AI assistant widgets (Intercom, Drift, Zendesk, Crisp, etc.). Users are trained to look there. The discovery problem was the button's invisible appearance, not its position. Moving it "front and center" would have conflicted with feed header controls and broken UX conventions.

**Adversarial & reliability test results — 53/53 passing**

All pre-existing security scenarios retained, plus new categories:

| Category | Scenarios | Result |
|----------|-----------|--------|
| C1 Action type whitelist | 6 | ✅ All pass |
| C2 Score clamping | 9 | ✅ All pass |
| H1 currentAction whitelist | 9 | ✅ All pass |
| C5 Force confirm | 5 | ✅ All pass |
| B2 History sanitization | 5 | ✅ All pass |
| E1 Message length | 3 | ✅ All pass |
| B1 Post text framing | 3 | ✅ All pass |
| A1 Partial context detection | 3 | ✅ All pass |
| Plan injection labels | 6 | ✅ All pass |
| Button pulse state logic | 4 | ✅ All pass |
| **Total** | **53** | **53/53 ✅** |

**UI logic audit — 5/5 checks passing**
- `useEffect` returns `clearTimeout` cleanup (no memory leak on unmount)
- Empty dependency array — pulse fires exactly once on mount
- Ring condition `agentPulse && !agentOpen` correctly hides when panel is open
- Ping ring has `pointer-events-none` — cannot absorb clicks
- Click handler calls `setAgentPulse(false)` before toggling panel

---

### Session 4 — April 2026 (Plan-Aware Guidance + Upsell Rules)

**Plan injection**
- Added `plan` prop to `ScoutAgentPanel` in `page.tsx`; passed from `FeedPage` session JWT
- `plan` included in context payload sent to `/api/inbox-agent` on every turn
- Backend accepts `plan` in context type; runs it through `PLAN_LABELS` map to produce human-readable label with price (e.g. `'Scout Pro'` → `'Scout Pro ($99/mo)'`)
- `USER PLAN: <label>` pinned as the first line of every `contextBlock`, above all inbox state and post data
- System prompt header updated to tell the agent the plan will always be present and to use it

**New behavioral rules (Section 3)**
- Rule 13 — PLAN-AWARE ANSWERS: every feature/limit answer must reference the user's actual plan by name
- Rule 14 — UPGRADE SUGGESTIONS: when a user asks about a locked feature or hits a limit, name the unlocking plan + price + specific gains + how to upgrade
- Rule 15 — NO UNSOLICITED UPSELLS: upgrade suggestions only when genuinely warranted

**`max_tokens` increase**
- Bumped from 512 to 800 to support longer platform Q&A and upgrade explanation replies

---

### Session 3 — April 2026 (Platform Knowledge Base + Hallucination Guardrail)

**System prompt restructure**
- Split into three labeled sections (Role & Actions / Knowledge Base / Behavioral Rules) with inline editing guide
- Section 2 added: full platform knowledge base covering all plans, pricing, feature limits by tier, scans, scoring, inbox tabs, comment credits, all settings, Discover ICPs, Slack digest, team seats, billing flows, trial details, and support contact

**Hallucination guardrail**
- Rule 12 added: unknown questions → honest "I'm not sure" + direct to support at info@clientbloom.ai

**`max_tokens` increase**
- Bumped from 512 to 800 (subsequently to support platform Q&A)

---

### Session 2 — April 2026 (Security Hardening + UX Reset)

**New Conversation button**
- Added "↺ New" button to ScoutAgentPanel header (visible only when conversation history exists)
- Clears messages, pending action, pending reply, exec result, and loading state

**Security hardening — 45/45 adversarial scenarios passing**

| Fix | Code | What it closes |
|-----|------|---------------|
| Action type whitelist | C1 | Unknown/injected action types replaced with `none` |
| Score clamping | C2 | `maxScore`/`minScore` clamped to int [0,10]; non-finite → `undefined` |
| Filter enforcement | C4 | Bulk actions require filter; safe defaults applied |
| Force confirm | C5 | `bulk_skip`/`bulk_archive` always `confirm:true` server-side |
| Field fallbacks | F4 | `reply` and `summary` always guaranteed non-empty strings |
| Formula injection | H1 | `currentAction` whitelisted in agent output + bulk route Airtable formula |
| Prompt injection | B1 | Post text wrapped in `[USER POST CONTENT]` delimiters; Rule 10 added |
| Partial context | A1 | `NOTE:` injected when loaded posts < inboxCount |
| History validation | B2 | Role enum enforced; content truncated at 2000 chars; invalid entries dropped |
| Message length | E1/E2 | Client-side 1000-char guard + server-side 400 |
| Panel on tab switch | G3 | Agent panel closes automatically on tab switch |

**`posts/bulk/route.ts`**
- `currentAction` whitelisted before Airtable formula interpolation (H1 server layer)
- `maxScore` clamped server-side inside `fetchMatchingIds` (C2 server layer)

---

### Session 1 — April 2026 (Initial Build)

- `ScoutAgentPanel` component built in `page.tsx` — floating chat UI, pending action confirmation, execResult display
- `POST /api/inbox-agent` route created — Claude Haiku integration, JSON output, regex JSON extraction fallback
- `POST /api/posts/bulk` route created — bulk skip/archive/restore with explicit IDs or filter mode, chunked at 10/batch
- Airtable propagation delay (1500ms) added to `handleBulkAction` to prevent stale meta-query reads
- Selection state reset on tab switch via `useEffect([filter])`
- Scan breakdown display scoped to Inbox tab only
- `handleBulkAction` changed to `Promise<number>` — throws on failure, returns affected count
- Dedup fix in `lib/scan.ts` — skipped posts permanently included in `getExistingPostUrls()` OR formula
- `docs/scout-agent.md` created

---

## Known Limitations

**Partial score distribution.** The agent's view of score distribution reflects only the posts currently loaded in the UI (up to 100). Bulk actions always execute against the full dataset.

**No post content search.** The agent can only act on score thresholds and action states — it cannot search post text or filter by keyword.

**Single-turn filter execution.** One action per turn.

**No undo for archive.** Archived posts cannot be recovered via the agent. Skipped posts can be restored via `bulk_restore`.

**Knowledge base is static.** The agent's platform knowledge is baked into the system prompt at deploy time. It does not query live account data — it cannot answer "how many posts do I have this month" beyond what the inbox context provides.

**Plan from session JWT only.** The `plan` field comes from the NextAuth JWT, which is refreshed at sign-in and via `/api/session/refresh`. If a user upgrades mid-session without refreshing, the agent will show their pre-upgrade plan until the session updates. This is the same behavior as the rest of the UI.

---

## Future Development Notes

**Streaming replies.** Currently the agent waits for the full Haiku response. Streaming (`stream: true`) would improve perceived latency.

**Full-context mode.** Loading all post IDs and score distributions server-side during the agent request would give the model a complete picture of the inbox.

**Persistent conversation history.** History could be stored server-side (Redis + session token) to survive panel close/reopen.

**Rate limiting.** No per-tenant rate limit on the inbox-agent route. Add a sliding window before GA launch.

**Knowledge base sync automation.** Consider auto-generating Section 2 from `lib/tier.ts` at build time to keep plan limits in sync automatically without manual dual-maintenance.

**Evals.** A test suite of common scenarios (inbox management, platform Q&A, unknown question fallback, upgrade suggestion accuracy) would catch regressions on system prompt changes.
