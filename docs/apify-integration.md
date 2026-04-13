# Apify Integration

Scout uses [Apify](https://apify.com) as its LinkedIn scraping backbone. Every scan — whether ICP-profile-based or keyword-based — runs through Apify actors via synchronous `run-sync-get-dataset-items` calls.

---

## Actors

| Purpose | Actor ID | Input key | Typical output |
|---|---|---|---|
| ICP profile posts | `harvestapi/linkedin-profile-posts` | `profileUrls` (array) | Posts by a specific LinkedIn profile |
| Keyword search | `apimaestro/linkedin-posts-search-scraper-no-cookies` | `keywords` (string) | Posts matching a keyword query |

Both actors are invoked via `lib/scan.ts → runApifyActor()`.

---

## How Scans Run

### Entry point: `runScanForTenant()`

`lib/scan.ts` exposes `runScanForTenant(tenantId, config)` which orchestrates a full scan:

1. Reads ICP profiles from Airtable (`LinkedIn ICPs` table, filtered by `tenantId`)
2. Reads keyword sources from Airtable (`Sources` table, filtered by `tenantId`)
3. Runs ICP actor for each profile batch
4. Runs keyword actor for each keyword batch
5. Deduplicates results by post URL
6. Writes captured posts to `Captured Posts` table
7. Updates `Scan Health` table with status, timestamp, post count

### Actor invocation: `runApifyActor()`

```typescript
async function runApifyActor(
  apifyToken: string,
  actorId: string,
  input: object,
  waitSecs = 45,
  memoryMbytes = 256,
  tenantTag?: string,   // appended as &tag={tenantId} for cost attribution
): Promise<{ items: any[]; errorType: string | null }>
```

The URL format:
```
https://api.apify.com/v2/acts/{actorId}/run-sync-get-dataset-items
  ?token={apifyToken}
  &timeout={waitSecs}
  &memory={memoryMbytes}
  &tag={tenantId}         ← per-tenant tagging (added when tenantTag is provided)
```

`runApifyActorWithRetry()` wraps this with one automatic retry on `timeout` or `rate_limit` errors.

---

## Per-Tenant Cost Attribution (Run Tagging)

### How it works

When `runScanForTenant()` calls `scanLinkedIn()`, it passes `tenantId` as the `tenantTag` parameter. This appends `&tag={tenantId}` to every Apify run URL. Apify stores this tag on the run record, making it queryable via the Apify API.

The `GET /api/admin/usage` route queries tagged runs to compute exact per-tenant spend:

```typescript
// Fetch runs tagged with this tenant's ID, sum usageTotalUsd
async function getTenantTaggedSpend(token, tenantId, cycleStart): Promise<number>
```

### Three-tier attribution (most accurate wins)

| Tier | Condition | Accuracy |
|---|---|---|
| `own_key` | Tenant supplies their own Apify API key | Exact — queried from their own Apify account |
| `tagged` | Run was tagged with `&tag={tenantId}` | Exact — direct run-level attribution |
| `prorata` | Untagged run from the shared pool | Estimated — `(tenant posts / total untagged posts) × unattributed spend` |

Pre-tagging tenants (added before the `&tag` parameter was implemented) will show `prorata` until they run their next scan.

### Cost display in the admin panel

The Usage tab shows the cost source for each tenant:

- **exact** (green) — tagged runs, 100% accurate
- **own key** (blue) — queried from their own Apify account
- **pro-rata** (amber) — estimated share of unattributed pool spend

The Apify account card at the top of the tab shows the full billing cycle total from `/v2/users/me/usage/monthly` — this is always the authoritative number regardless of per-tenant attribution accuracy.

---

## Rate Limits and Timeouts

### Apify limits

| Limit | Value |
|---|---|
| Global request rate | 250,000 req/min |
| Per-resource rate | 60 req/sec |
| Synchronous run timeout | Configurable per call (default: 45s) |

### Scan retry logic

`runApifyActorWithRetry()` retries once on:
- `timeout` — actor took longer than `waitSecs`
- `rate_limit` — Apify returned HTTP 429

Retries use the same parameters. If the retry also fails, the error type is returned and written to the `Scan Health` table.

### Airtable side of scan writes

After each scan, the `Scan Health` table is updated. Airtable enforces a 5 req/sec per-base limit; the `airtableFetch()` helper in `lib/airtable.ts` implements exponential backoff (up to 3 retries with 1s, 2s, 4s delays) to handle transient 429s.

---

## Memory and Performance

| Setting | Default | Notes |
|---|---|---|
| `memoryMbytes` | 256 MB | Increase for very large ICP lists; Apify bills by compute unit (CU) = 1 GB·hour |
| `waitSecs` | 45s | Synchronous calls block until done; async mode not used |
| Batch size | Determined by actor defaults | HarvestAPI batches profiles internally |

**Cost optimization**: the dominant cost driver is `memoryMbytes × run_duration`. Keeping scans at 256 MB and under 45 seconds is the best lever for keeping costs low. Actors that return 0 results still incur a minimum CU charge for startup time.

---

## Scout Multi-Pool Architecture (April 2026)

Scout supports multiple Apify accounts to distribute concurrent scan load and avoid hitting the Starter plan's 32-run ceiling as the tenant count grows.

### Pool assignment

Each tenant has an `Apify Pool` field (number) on the Tenants table:

| Pool | Value | Env var used |
|---|---|---|
| Default (shared) | 0 | `APIFY_API_TOKEN` |
| Pool 1 | 1 | `APIFY_TOKEN_POOL_1` |
| Pool 2 | 2 | `APIFY_TOKEN_POOL_2` |

Additional pools follow the same naming convention. New env vars are added to Vercel as new Apify accounts are purchased.

### Token resolution priority

`resolveApifyToken(pool, customKey)` in `cron/scan/route.ts` and `cron/scan-retry/route.ts`:

1. **Custom key** — if the tenant has their own Apify key set, it always wins
2. **Pool key** — if pool >= 1, uses the corresponding `APIFY_TOKEN_POOL_N` env var
3. **Default** — `undefined` returned, scan-tenant falls back to its own `APIFY_API_TOKEN` env var

### Admin pool assignment

The admin panel ApifyPanel shows a pool selector dropdown for tenants without a custom key. Select a pool and click "Assign" — this PATCHes `Apify Pool` on the Tenants table.

### Right-now capacity planning (April 2026)

- **< 15 tenants**: Default shared pool is fine. Starter plan = 32 concurrent runs; soft ceiling = 24. 15 tenants at most = 15 concurrent runs.
- **15–30 tenants**: Begin moving heavier users to Pool 1. Purchase a second Apify account.
- **30–60 tenants**: Pool 0 + Pool 1 + Pool 2. Assign roughly 20 tenants per pool.
- **60+ tenants**: Expand pool numbering. No code changes needed — just add `APIFY_TOKEN_POOL_3`, `_4`, etc. and update `resolveApifyToken()` accordingly.

### Upgrade path to self-service (future)

Agency-tier tenants can supply their own Apify key in the admin panel. Self-service in Settings is deferred — it's an admin-only operation until you have a reason to hand it to customers.

## Own Apify Key (Tenant-Supplied, Agency)

Tenants on Scout Agency can optionally supply their own Apify API key. This is stored in `Apify API Key` field on the Tenants table and takes precedence over any pool assignment.

When a tenant has their own key:
- Their scans use their Apify account entirely — zero shared pool consumption
- Their cost is queried from their own account via `getApifyMonthlySpend(ownKey)`
- The admin Usage tab shows `own key` as the cost source

---

## Debugging Scan Failures

### Check Scan Health table first

The `Scan Health` Airtable table has one row per tenant:

| Field | Meaning |
|---|---|
| `Last Scan At` | ISO timestamp of the most recent scan attempt |
| `Last Scan Status` | `success`, `failed`, or `scanning` |
| `Last Error` | Error type/message from the last failed scan |
| `Last Posts Found` | Count of posts returned by the last successful scan |

### Common error types

| Error type | Cause | Fix |
|---|---|---|
| `timeout` | Apify run exceeded `waitSecs` | Increase timeout or reduce input batch size |
| `rate_limit` | Apify 429 | Transient — retry logic handles it; if persistent, check usage dashboard |
| `apify_error` | Actor-level error (bad input, LinkedIn blocking) | Check actor run logs in Apify console |
| `airtable_error` | Write to Captured Posts failed | Check Airtable token and base ID env vars |
| `no_input` | ICP URLs and keyword sources both empty | Account has nothing to scan — `no_icps_configured` and `no_keywords` flags will be set |

### Apify Console

All runs (including failed ones) appear in the Apify console under **Actor runs**. Filter by actor ID or by tag (`tenantId`) to find a specific tenant's runs. The run detail page shows full input, output, logs, and compute usage.

---

## Environment Variables

| Variable | Where used |
|---|---|
| `APIFY_API_TOKEN` | Shared platform key — used for all non-own-key tenants |
| Tenant's `Apify API Key` (Airtable field) | Per-tenant key when supplied |

Both are resolved at scan time in `runScanForTenant()`.
