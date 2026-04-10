# LinkedIn ICP Pool — Architecture & Feature Spec

> Last updated: April 2026  
> Status: Production

---

## Overview

Scout's LinkedIn ICP system uses a **two-layer model** that separates storage from scanning cost. These are distinct concepts and must never be collapsed into a single number.

| Layer | What it controls | Cost driver |
|-------|-----------------|-------------|
| **Pool** (`poolSize`) | Total profiles a tenant can save | Storage only — cheap |
| **Scan Slots** (`scanSlots`) | Profiles fetched per scan run | Apify API calls — real cost |

A Pro tenant can store 150 profiles in their pool, but only the top 25 get scanned each run. The pool is a library; scan slots determine what gets read today.

---

## Tier Limits

All limits live in `lib/tier.ts` — **never hardcode anywhere else**.

| Plan | `poolSize` | `scanSlots` | `discoverRunsPerDay` | `discoverMaxPerRun` | `scansPerDay` |
|------|-----------|------------|---------------------|-------------------|--------------|
| Trial | 10 | 3 | 0 (locked) | 0 | 1 |
| Scout Starter | 50 | 10 | 1 | 10 | 1 |
| Scout Pro | 150 | 25 | 3 | 25 | 2 |
| Scout Agency | 500 | 50 | unlimited (999) | 50 | 2 |
| Owner / Complimentary | 999 | 999 | unlimited | 999 | 2 |

---

## Smart Profile Prioritization

When a scan runs, `lib/scan.ts` selects which profiles to include using this sort order:

1. **Posts Found DESC** — most productive profiles come first
2. **Added Date DESC** — among profiles with equal engagement, newer ones rotate in
3. Natural round-robin on ties

This means every profile in the pool eventually gets scanned — high performers just get scanned more often. There is no manual priority setting (by design — reduces UI complexity for v1).

```typescript
const sorted = [...allActive].sort((a, b) => {
  const postsA = Number(a.fields['Posts Found'] || 0)
  const postsB = Number(b.fields['Posts Found'] || 0)
  if (postsB !== postsA) return postsB - postsA
  const dateA = String(a.fields['Added Date'] || '')
  const dateB = String(b.fields['Added Date'] || '')
  return dateB.localeCompare(dateA)
})
const icpProfiles = sorted.slice(0, scanSlots).map(r => r.fields['Profile URL']).filter(Boolean)
```

---

## Pool Cap Enforcement

The pool cap counts **ALL records** — both active and paused. A paused profile still occupies a pool slot.

This is enforced in two places:

### `POST /api/linkedin-icps` (manual add)
```typescript
const currentCount = await countAllIcpProfiles(tenantId)  // paginates all pages
if (currentCount >= poolSize) return 429
```

### `POST /api/linkedin-icps/discover` (discovery)
```typescript
// Pool count check (paginated)
let existingCount = 0; { do { ... } while (offset) }
if (existingCount >= poolSize) return 429

// Cap to remaining slots
const slotsRemaining = poolSize - existingCount
const cap = Math.min(maxProfiles, discoverMaxPerRun, slotsRemaining)
```

Both functions paginate through all Airtable pages so Agency-tier tenants (500-profile pools) are counted correctly. A single Airtable page returns max 100 records.

---

## Discover ICPs Feature

Discover ICPs uses Google Search (via Apify) to find LinkedIn profiles matching job titles and optional keyword criteria. It is gated at the plan level:

- **Trial**: Locked (403 with upgrade prompt)
- **Starter**: 1 run/day, max 10 profiles per run
- **Pro**: 3 runs/day, max 25 profiles per run
- **Agency**: Unlimited runs, max 50 profiles per run

### Rate Limiting
Two overlapping checks protect Apify spend:

1. **Plan frequency window**: `msPerDay / discoverRunsPerDay` milliseconds between allowed calls
2. **Hard 15-minute floor**: Minimum gap between any two discovery calls, regardless of plan

Both read `Last ICP Discovery At` from the Tenants table and write a new timestamp after a successful run.

### Deduplication
Before saving discovered profiles, the endpoint fetches all existing Profile URLs for the tenant (paginated) and builds a slug set. Only slugs not already in the set are saved.

### UI Gating (settings/page.tsx)
- **Trial**: Lock overlay with tier comparison table and "Upgrade to unlock →" CTA (no form shown)
- **At pool cap**: Discover ICPs toggle button disabled with tooltip; Run Discovery submit button also disabled with label "Pool full"
- **Active**: Full discovery form in violet/purple styling, submit disabled during `discovering` state

---

## API Routes

### `GET /api/linkedin-icps`
Returns `{ profiles: IcpProfile[], poolSize: number, scanSlots: number }`.  
The UI reads `poolSize` and `scanSlots` from this response — no separate tier limits call needed.

### `POST /api/linkedin-icps`
Adds a single profile manually. Enforces pool cap via `countAllIcpProfiles` (paginated).

Error response when full:
```json
{ "error": "Your 150-profile pool is full. Remove a profile to add a new one.", "limit": 150, "current": 150 }
```

### `POST /api/linkedin-icps/discover`
Discovers profiles via Google Search. Returns:
```json
{ "added": 3, "skipped": 2, "profiles": [...] }
```
- `added`: new profiles saved
- `skipped`: profiles already in pool (dedup)
- `profiles`: array of saved profile objects

Error responses:
- 403 `{ error: "...", upgrade: true }` — trial or unsupported plan
- 429 `{ error: "...", retryAfter: N }` — rate limit or pool full

---

## Scan Integration

`lib/scan.ts` → `runScanForTenant(tenantId, apifyTokenOverride?, plan = 'Trial')`

The `plan` parameter is now required for correct scan slot enforcement. Both callers must pass it:

- `POST /api/trigger-scan` → passes `tenant.plan`
- `POST /api/cron/scan-tenant` → passes `plan || 'Trial'`

---

## UI Section Layout (settings/page.tsx)

The `LinkedInICPSection` renders in this order:

1. **Section header** with description: `${total} of ${poolSize} in pool · ${activeCount} active · top ${Math.min(activeCount, scanSlots)} scanned per run · ${scanFreq} daily`
2. **Pool status pills**: pool cap indicator + slots remaining
3. **Add Profile button** (top, before list) — disabled + tooltip when `atPoolCap`
4. **Discover ICPs toggle** (top, before list) — disabled + tooltip when `atPoolCap`
5. **Pool cap notice** (amber, when `atPoolCap`)
6. **Discover ICPs form** (expands inline — trial shows lock overlay, paid shows form)
7. **Scan slot explainer** (shown when `activeCount > scanSlots`)
8. **Search + profile list** with pagination

### Key State Variables
| Variable | Type | Meaning |
|----------|------|---------|
| `profiles` | `IcpProfile[]` | All profiles (loaded from API) |
| `total` | `number` | `profiles.length` (ALL — active + paused) |
| `activeCount` | `number` | `profiles.filter(p => p.active).length` |
| `poolSize` | `number` | From API response |
| `scanSlots` | `number` | From API response |
| `atPoolCap` | `boolean` | `total >= poolSize` |
| `canDiscover` | `boolean` | `discoverRunsPerDay > 0` |

---

## Adversarial Test Results (April 2026)

Findings from the formal adversarial stress test:

### Fixed in this release
- **Pagination truncation** in pool count (route.ts + discover route) — fixed to paginate all pages
- **Pagination truncation** in discover dedup check — fixed to paginate all pages
- **Discover "Run Discovery" button** not gated on `atPoolCap` — fixed

### Known issues (pre-existing, not introduced in this release)
- **Race conditions** on concurrent pool adds and discover runs — read-then-write pattern has a window; mitigated by low probability of concurrent requests from a single tenant
- **Cron trial expiry** not enforced in scan-tenant route — orchestrator should filter expired tenants before dispatching
- **scansPerDay=1 window** uses 12h check which allows 2 scans in 25h — pre-existing behavior

---

## Copy Rules

- Never expose "Apify" in user-facing copy — say "discovers profiles" not "Apify search"
- Pool = storage; Scan Slots = active scanning — always use both terms when explaining limits
- CTA text: "Add Profile", "Discover ICPs", "Run Discovery", "Upgrade to unlock →"
- Error: "Your X-profile pool is full. Remove a profile to add a new one."
- Section description template: `${total} of ${poolSize} in pool · ${activeCount} active · top ${Math.min(activeCount, scanSlots)} scanned per run · ${scanFreq} daily`
