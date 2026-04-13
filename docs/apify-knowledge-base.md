# Apify Knowledge Base — Scout Platform Reference

> **Audience:** Engineers and product leads building or maintaining Scout.
> **Purpose:** Authoritative internal reference for Apify's platform, Scout's current integration pattern, concentration risk analysis, and strategic improvement roadmap.
> **Last updated:** April 2026

---

## Part 1 — What Apify Is

Apify is a cloud platform for web scraping, data extraction, and automation. Its core abstraction is the **Actor** — a serverless cloud program that runs on Apify's infrastructure, handles proxy management, and returns structured data. Actors can be pre-built (bought from the Apify Store) or custom-built.

For Scout, Apify is the only source of LinkedIn post data. Every scan for every tenant routes through two third-party Apify actors. **This is the single biggest concentration risk in the entire platform.**

---

## Part 2 — Apify Platform Reference

### 2.1 Actors

Actors are the fundamental unit of execution. Key properties:

- **Invocation methods:** Apify Console UI, REST API, scheduled trigger, webhook trigger, or programmatic (JavaScript/Python SDK)
- **Run states:** `READY → RUNNING → SUCCEEDED / FAILED / TIMED-OUT / ABORTED`
- **Abort modes:** Immediate (instant kill) or Graceful (30-second notification window to finish work)
- **Resurrection:** Failed/timed-out/aborted runs can be restarted with identical storage — the timeout clock resets from resurrection point
- **Builds:** Actors are versioned. Each version compiles into a build. You can pin to a specific build to prevent unexpected breakage from actor author updates.
- **Input schema:** JSON-defined, validates inputs and auto-generates UI. Max 500KB per input.

**Run API endpoint (what Scout uses):**
```
POST https://api.apify.com/v2/acts/{actorId}/run-sync-get-dataset-items
  ?token={apiToken}
  &timeout={seconds}
  &memory={mb}
  &tag={tenantId}
```

### 2.2 Memory, CPU, and Compute Units

**Memory allocation rules:**
- Must be a power of 2: 128MB, 256MB, 512MB, 1024MB, 2048MB, 4096MB, 8192MB, 16384MB, 32768MB
- CPU cores are proportional: 1 full core per 4096MB (so 1024MB = ¼ core, 256MB = 1/16 core)
- Disk = 2× memory allocation

**Compute Unit (CU) formula:**
```
CU = Memory (GB) × Duration (hours)
Example: 256MB × 45 seconds = 0.000053 CU per run (very small, but multiplied by hundreds of runs/day)
```

**Recommended memory by use case:**
| Scenario | Minimum | Recommended |
|----------|---------|-------------|
| Browser-based (Playwright/Puppeteer) | 1024MB | 2048–4096MB |
| Complex pages | 2048MB | 4096MB |
| Cheerio/HTTP only | 256MB | 512MB |
| Node.js single-thread | 256MB | 4096MB max benefit |

**⚠ Scout's current memory setting of 256MB is almost certainly under-provisioned for browser-based LinkedIn actors. At 256MB, the actor runs on 1/16th of a CPU core — this is a primary cause of timeouts.**

### 2.3 Pricing (as of April 2026)

| Plan | Monthly Cost | CU Price | Max Memory/Run | Concurrent Runs |
|------|-------------|----------|----------------|-----------------|
| Free | $0 | — | 8,192MB | 25 |
| Starter | $29 | $0.30/CU | 8,192MB | 32 |
| Scale | $199 | $0.25/CU | 32,768MB | 128 |
| Business | $999 | ~$0.20/CU | 32,768MB | 256 |
| Enterprise | Custom | Negotiated | Custom | Custom |

- Annual plans receive a 10% discount
- Overage uses the per-CU rate of the subscribed plan
- Each plan has a platform usage dollar limit (Starter: $200/mo max spend; Scale: $1,000/mo; Business: $5,000/mo)
- Proxy costs are separate from CU costs (~$8/GB on Starter)

**Cost estimation for Scout at scale:**

A single actor run at 256MB for 30 seconds = ~0.000028 CU = ~$0.0000085 (essentially free per run). The cost driver is when runs are large, memory is high, or many runs stack concurrently. At 100 tenants × 2 scans/day × 2 actors = 400 runs/day. At 512MB/45s each, that is roughly 0.003 CU/run × 400 = 1.2 CU/day = ~36 CU/month = ~$10/month compute — very manageable. The real cost risk is **residential proxy usage**, which is billed per GB of data transferred.

### 2.4 Platform Limits

| Limit | Value |
|-------|-------|
| Global API request rate | 250,000 req/min |
| Per-resource API rate | 60 req/sec |
| Dataset push rate | 400 req/sec |
| Concurrent runs (Starter) | 32 |
| Concurrent runs (Scale) | 128 |
| Actors per user | 100 |
| Tasks per user | 1,000 |
| Schedules per user | 100 |
| Webhooks per user | 100 |
| Actors per schedule | 10 |
| Build timeout | 1,800 seconds |
| Unnamed dataset/KV retention | 7 days (auto-deleted) |
| Named dataset/KV retention | Indefinite |
| Max run memory (Starter) | 8,192MB |
| Max run memory (Scale+) | 32,768MB |
| Combined concurrent memory (Scale) | 131,072MB |

### 2.5 Storage Systems

**Datasets** — append-only structured output storage
- Named: indefinite retention. Unnamed: 7-day expiry.
- Max 9MB per pushed object
- Export formats: JSON, JSONL, CSV, XML, Excel, HTML, RSS
- API rate: 400 req/sec push, 60 req/sec read

**Key-Value Stores** — flexible blob storage (JSON, HTML, images, zips)
- Named: indefinite. Unnamed: 7-day expiry.
- Each actor run gets its own KV store automatically
- Useful for storing actor state between runs (e.g., seen post IDs)

**Request Queues** — crawl URL management
- Not currently used by Scout, but relevant if we build a crawling-based actor

### 2.6 Schedules

- Cron syntax (6-field: second/minute/hour/day/month/weekday)
- Minimum interval: 10 seconds
- Timezone-aware with DST support
- Fires within ~1 second of scheduled time (delays possible under load)
- Failed-to-start notification via email
- Scout does **not** use Apify's native schedules — it uses its own cron via Vercel. This is correct; it preserves our ability to add logic (tenant filtering, rate control) that Apify's scheduler cannot.

### 2.7 Webhooks

- Trigger on actor run events (start, succeed, fail, timeout)
- Action: HTTP POST to a specified URL
- Can chain actors (when Actor A finishes, trigger Actor B)
- **No retry guarantee documented** — webhook delivery is best-effort
- 100 webhooks per user account

### 2.8 Proxy

- **Datacenter proxies:** Fastest and cheapest. Highest block risk.
- **Residential proxies:** IPs from real homes/offices. Hardest to block. Billed by GB.
- **Google SERP proxies:** Specialized for Google search. Not relevant to Scout.
- Proxy rotation is automatic; Apify monitors IP pool health and rotates proactively
- All plans include proxy access; residential bandwidth is charged separately

### 2.9 Security

- **SOC 2 Type II certified** (security, availability, confidentiality of customer data)
- **Encrypted environment variables** for storing API secrets in actors
- **Encrypted input** capability for sensitive actor parameters
- Trust Center: trust.apify.com
- Security Whitepaper: apify.com/security-whitepaper.pdf
- Vulnerability disclosure: security@apify.com

### 2.10 API Reference

Base URL: `https://api.apify.com/v2/`

Key endpoints used by Scout:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/acts/{id}/run-sync-get-dataset-items` | Run actor synchronously, return results inline |
| POST | `/acts/{id}/runs` | Run actor asynchronously (returns run ID) |
| GET | `/acts/{id}/runs/{runId}` | Poll run status |
| GET | `/datasets/{id}/items` | Fetch dataset items from completed run |
| GET | `/users/me/usage/monthly` | Full account billing cycle spend |
| GET | `/acts/{id}/runs?tag={tenantId}` | Filter runs by tenant tag |

---

## Part 3 — Scout's Current Apify Integration

### 3.1 Architecture Summary

```
Vercel Cron (2× daily)
  └── /api/scan → runScanForTenant(tenantId, config)
        ├── ICP scan: POST run-sync → harvestapi/linkedin-profile-posts
        └── Keyword scan: POST run-sync → apimaestro/linkedin-posts-search-scraper-no-cookies
              ↓ (synchronous, blocking, 45s timeout)
        Results → deduplicate → Airtable (Captured Posts table)
        Scan status → Airtable (Scan Health table)
```

### 3.2 Current Actors

| Role | Actor | Auth required? | Notes |
|------|-------|----------------|-------|
| ICP profile posts | `harvestapi/linkedin-profile-posts` | No (no-cookie) | Scrapes posts from specific LinkedIn profiles |
| Keyword search | `apimaestro/linkedin-posts-search-scraper-no-cookies` | No (no-cookie) | Scrapes LinkedIn posts matching keyword query |

Both are **third-party actors** maintained by external developers. Scout has no control over their code, reliability, or pricing model.

### 3.3 Current Settings

| Parameter | Value | Assessment |
|-----------|-------|------------|
| Memory | 256MB | ⚠ Under-provisioned for browser actors |
| Timeout | 45 seconds | ⚠ Tight for large ICP lists |
| Retry logic | 1 retry on timeout/429 | ⚠ Single retry insufficient |
| Run pattern | Synchronous blocking | ⚠ Blocks cron; no async fallback |
| API key | Shared (one per platform) | ⚠ All tenants compete for same rate limits |
| Per-tenant cost | Tagged by `&tag={tenantId}` | ✅ Good attribution |
| Fallback actor | None | 🚨 Zero redundancy |

---

## Part 4 — Risk Assessment

### 4.1 Concentration Risks (Priority Order)

#### 🚨 CRITICAL — Third-Party Actor Dependency
We depend on two actors maintained by external developers (`harvestapi`, `apimaestro`). If either:
- Raises pricing (they can charge per-result or per-run)
- Breaks due to LinkedIn changes
- Abandons the actor
- Gets suspended by Apify for ToS violations
- Changes their output schema

...our scans silently fail or return empty results for every single tenant. There is no fallback.

**Mitigation:** Identify and test 1-2 backup actors for each function. Consider building a Scout-owned custom actor for the most critical path.

#### 🚨 CRITICAL — Synchronous Blocking Run Pattern
The `run-sync-get-dataset-items` endpoint blocks until the actor completes or times out. At 45 seconds per call, with multiple ICP and keyword batches, a single tenant scan can take several minutes — all while holding a Vercel serverless function open. Vercel functions have a maximum execution time (10s on hobby, up to 60s on paid plans for standard routes, or 5 minutes for edge functions). **Large scans are at risk of Vercel timeout before Apify finishes.**

**Mitigation:** Move to async run pattern — fire the actor, get a run ID, receive results via webhook.

#### ⚠ HIGH — Memory Under-Provisioning
At 256MB, LinkedIn browser-based actors run on 1/16th of a CPU core. This almost certainly contributes to timeouts. Proper allocation for browser automation is 1024–2048MB.

**Mitigation:** Increase `memoryMbytes` to 1024MB or 2048MB. Re-measure timeout behavior.

#### ⚠ HIGH — No Actor Health Monitoring
If an actor starts returning garbage data (empty results, malformed output, wrong schema), Scout silently records 0 posts found and the user's feed empties. There is no automated check that confirms actor output is valid.

**Mitigation:** Add a post-scan validation step: assert that returned items have the expected fields. Alert on schema drift.

#### ⚠ HIGH — Shared API Key Across All Tenants
All non-Agency tenants share one Apify account. As tenant count grows, all scans compete for the same concurrent run limit (32 on Starter, 128 on Scale). A burst of cron jobs firing simultaneously could exhaust concurrent run slots.

**Mitigation:** Stagger cron runs across tenants. Implement a scan queue with a concurrency cap. Graduate larger tenants to their own Apify keys earlier.

#### ⚠ MEDIUM — LinkedIn Anti-Scraping
LinkedIn actively combats automated access. Both current actors claim "no cookie" operation, which means they use public endpoint access — these are inherently more fragile than session-based approaches. Any major LinkedIn frontend change can break the actor with no warning.

**Mitigation:** Monitor actor run success rates daily. Have a backup actor ready to switch to immediately. Follow Apify Store for actor update notices.

#### ⚠ MEDIUM — Single Retry Insufficient
The current retry logic retries once on timeout or 429. A temporary LinkedIn block or Apify overload that lasts more than 90 seconds (two 45s attempts) causes the scan to fail with no further recovery.

**Mitigation:** Add exponential backoff retry (3 attempts: 0s, 30s, 90s delay). Write failed scans to a retry queue and re-attempt on the next cron cycle.

#### ⚠ MEDIUM — No Cost Caps Per Tenant
Runaway scans (e.g., a tenant with 500 ICPs on a plan that allows 50) could consume disproportionate CUs. There is no per-tenant monthly CU cap enforced at the Apify level.

**Mitigation:** Enforce batch size limits per plan tier in `scan.ts`. Add a monthly CU spend check against the tagged runs API — halt if a tenant exceeds their tier's expected cost ceiling.

#### 🟡 LOW — Actor Pricing Model Changes
Third-party actor authors on Apify Store can charge via "pay-per-event" (per result, per profile, etc.). If `harvestapi` or `apimaestro` switch from free/CU-only to per-result pricing, our cost structure changes overnight.

**Mitigation:** Monitor the actor store pages for pricing model changes. Build into our incident runbook.

---

## Part 5 — Strategic Recommendations

### 5.1 Immediate Actions (Next 30 Days)

| Priority | Action | Effort | Impact |
|----------|--------|--------|--------|
| 🚨 1 | Increase actor memory from 256MB → 1024MB | Low | Reduces timeouts significantly |
| 🚨 2 | Identify and test 1 backup actor for each function | Medium | Eliminates single actor dependency |
| 🚨 3 | Add output schema validation post-scan | Low | Catches silent actor breakage |
| ⚠ 4 | Increase retries from 1 → 3 with backoff | Low | Improves scan reliability |
| ⚠ 5 | Add per-tenant scan batching to stay under 32 concurrent runs | Medium | Prevents concurrent run limit hits |

### 5.2 Medium-Term (30–90 Days)

**Migrate to async run pattern:**
Instead of synchronous blocking calls, fire actor runs asynchronously and use webhooks or polling to receive results. This removes the Vercel timeout risk and allows much larger scans.

```
Cron fires → POST /acts/{id}/runs → returns {runId}
             ↓
             Poll GET /runs/{runId} every 10s
             OR
             Webhook fires POST /api/scan-complete → fetch dataset items
```

**Actor Task Library:**
Create pre-configured Apify Tasks for each actor × each use case (keyword scan, profile scan). Tasks allow pinning to a specific actor build, preventing unexpected breakage from actor updates.

**Build an actor health check:**
A separate lightweight cron (weekly or daily) that fires each actor with a known test input and asserts expected output. Alerts via Slack if health check fails.

**Graduated key strategy:**
Move Scout Pro tenants (not just Agency) to their own Apify keys. Reduces shared pool pressure and gives Pro tenants better concurrent run access.

### 5.3 Long-Term (90+ Days)

**Custom Scout-Owned Actor:**
Build and maintain a Scout-owned LinkedIn scraper actor on Apify. This eliminates dependency on third-party actor authors entirely. We control the code, the updates, and the output schema. The actor can be private (not in Apify Store) so competitors can't use it.

**Multi-Provider Data Architecture:**
Reduce Apify concentration risk by routing some data through a secondary provider. Candidates:

| Provider | Model | Best For | Cost |
|----------|-------|----------|------|
| ProxyCurl / Nubela | LinkedIn API wrapper | Profile data, clean structured output | $0.001–$0.01/profile |
| BrightData | Residential proxy + dataset | High-reliability scraping, GDPR-compliant | Enterprise pricing |
| PhantomBuster | LinkedIn automation flows | Session-based, authenticated access | $56–$352/mo |
| Oxylabs | Proxy + scraper | Volume, redundancy | Enterprise |

A practical dual-provider architecture:
- **Primary:** Apify actors (current, optimized)
- **Fallback:** ProxyCurl for ICP profile data when Apify actor fails (per-profile cost is predictable)
- **Keyword data:** Apify is hardest to replace here — custom actor is the best long-term path

**LinkedIn Official API Consideration:**
LinkedIn's official API is heavily restricted (no post content, no public feed access for most use cases). It is not a viable primary data source for Scout's use case today. Monitor this — their API strategy evolves.

---

## Part 6 — Operational Runbook

### 6.1 When Scans Fail

**Check first: Scan Health table in Airtable**
- `Last Scan Status` = `failed`
- `Last Error` field shows error type

| Error | Most Likely Cause | First Step |
|-------|------------------|------------|
| `timeout` | Actor too slow; memory too low or input too large | Check Apify Console for run details; increase memory or reduce batch size |
| `rate_limit` | Too many concurrent runs; shared key throttled | Check Apify account usage; implement concurrency cap |
| `apify_error` | Actor-level failure (LinkedIn blocking, bad input, actor broken) | Check actor run logs in Apify Console; test actor manually |
| `airtable_error` | Write failed after successful scrape | Check Airtable token; check base ID env vars |
| `no_input` | Tenant has no ICPs and no keywords | Expected — prompt tenant to configure |

**Check second: Apify Console**
- Filter actor runs by `tag={tenantId}` to find the specific run
- Run detail page shows full input, output, logs, compute usage, and exit code

### 6.2 Actor Replacement Protocol

If a primary actor breaks or is unavailable:

1. Check Apify Store for the actor's status page and any recent comments
2. Test the backup actor with a known input set (keep at least one tested backup per function)
3. Update `actorId` in `lib/scan.ts` — single change point
4. Monitor first 3 runs of new actor for output schema consistency
5. Update `docs/apify-integration.md` actor table

### 6.3 Cost Monitoring

- Monthly billing cycle spend: `GET /v2/users/me/usage/monthly`
- Per-tenant spend: `GET /v2/acts/{id}/runs?tag={tenantId}&status=SUCCEEDED`
- Alert threshold: If monthly spend > 80% of plan limit, alert admin via Slack
- Admin panel Usage tab shows this data (already built)

### 6.4 Concurrent Run Management

At 32 concurrent runs (Starter plan), with 2 actor calls per tenant scan, Scout can run at most 16 tenant scans simultaneously. At 100 tenants × 2 scans/day, this is fine if scans are staggered. If scans are batched in a tight window, runs queue and timeouts increase.

**Mitigation already in place:** Per-tenant cron uses the same 6AM/6PM window but Vercel distributes tenant-level calls sequentially.

**Watch point:** As tenants grow past ~200, upgrade to Scale plan (128 concurrent) or implement a scan queue with explicit concurrency control.

---

## Part 7 — Alternative Provider Reference

### 7.1 Apify Actor Alternatives

**For ICP Profile Posts:**
| Actor | Author | Notes |
|-------|--------|-------|
| `harvestapi/linkedin-profile-posts` | HarvestAPI | Current primary. No cookie. |
| `supreme_coder/linkedin-profile-scraper` | Supreme Coder | No-cookie alternative; $3/1k profiles |
| `dev_fusion/linkedin-profile-scraper` | Dev Fusion | Mass scraper with email extraction |
| `curious_coder/linkedin-profile-scraper` | Curious Coder | Another alternative to test |

**For Keyword Search Posts:**
| Actor | Author | Notes |
|-------|--------|-------|
| `apimaestro/linkedin-posts-search-scraper-no-cookies` | ApiMaestro | Current primary |
| Apify LinkedIn Scraping API | Apify (official) | `apify.com/api/linkedin-scraping-api` — worth evaluating as managed alternative |

### 7.2 Non-Apify Providers

| Provider | LinkedIn Capability | Pricing Model | Concentration Risk Reduction |
|----------|--------------------|--------------|-----------------------------|
| ProxyCurl | Profile data, company data | Per API call ($0.001–$0.01) | Medium — different platform |
| BrightData | Full scraping, SERP, social | GB-based + platform fee | High — enterprise-grade |
| PhantomBuster | Session-based LinkedIn automation | Monthly plan ($56–$352) | Medium — authenticated = harder to block |
| ScrapingBee | General web scraping | Credits-based | Low for LinkedIn specifically |

---

## Part 8 — Knowledge Base for the "Apify Specialist Agent" (What It Would Watch)

If Scout had a dedicated agent continuously monitoring Apify integration health, here is exactly what it would track and what it would recommend:

### What to Watch Daily
- Actor run success rate: >95% = healthy, <90% = alert, <80% = incident
- Average actor run duration: trending up = LinkedIn slowing us down or memory too low
- Timeout rate: >5% = increase memory or timeout window
- Monthly CU spend trajectory: flag if on pace to exceed plan limit before month end

### What to Watch Weekly
- Apify Store page for both actor authors: any comments about breakage, pricing changes, or deprecation notices
- Actor build versions: have they pushed a new build? Test before auto-adoption.
- New actors in Apify Store: any better LinkedIn post scrapers now available?
- Concurrent run utilization: are we approaching the plan limit?

### What to Watch Monthly
- Per-tenant cost attribution accuracy: what % of runs are tagged vs. pro-rata?
- Total Apify spend vs. revenue per tenant: are we pricing our plans to cover Apify costs?
- Apify platform announcements: pricing changes, new features, ToS updates

### Decisions It Would Recommend Right Now
1. **Increase memory to 1024MB immediately** — 256MB is inadequate for browser-based LinkedIn actors
2. **Add a backup actor for each function this week** — zero-redundancy is unacceptable for a core dependency
3. **Build and test an async run workflow in staging** — the synchronous pattern is the biggest scalability ceiling
4. **Set up actor health checks** — currently flying blind on silent actor degradation
5. **Negotiate with Apify for a dedicated account or enterprise SLA** — once above 200 tenants, a shared Starter/Scale account carries too much risk

---

## Part 9 — Apify ToS and Legal Considerations

- Apify's terms permit scraping public data
- LinkedIn's terms of service prohibit automated data collection (Section 8.2 of LinkedIn User Agreement)
- The legal risk is LinkedIn's, not Apify's — Apify is the infrastructure provider; the customer (Scout) bears responsibility for what data is collected
- "No cookie" actors use public endpoint access only, which reduces (but does not eliminate) ToS exposure
- Scout should maintain a documented rationale: we surface publicly-available posts to help users engage with conversations they would otherwise have found manually
- Do not store or sell scraped LinkedIn data beyond what is needed for the platform's core function
- Consider a terms-of-service clause in Scout's user agreement that makes the LinkedIn data sourcing methodology clear

---

## Part 10 — Recommended Immediate Changes to `lib/scan.ts`

```typescript
// 1. INCREASE MEMORY (current: 256MB → recommended: 1024MB)
// ICP profile actor (browser-based LinkedIn scraping)
const ICP_MEMORY_MB   = 1024  // was 256
const KWD_MEMORY_MB   = 512   // was 256

// 2. INCREASE TIMEOUT (current: 45s → recommended: 90s for ICP, 60s for keyword)
const ICP_TIMEOUT_SECS = 90   // was 45
const KWD_TIMEOUT_SECS = 60   // was 45

// 3. ADD BACKUP ACTORS
const ACTORS = {
  icpProfilePosts: {
    primary:  'harvestapi/linkedin-profile-posts',
    fallback: 'curious_coder/linkedin-profile-scraper',   // tested alternative
  },
  keywordSearch: {
    primary:  'apimaestro/linkedin-posts-search-scraper-no-cookies',
    fallback: null,  // TODO: identify and test a fallback keyword actor
  }
}

// 4. INCREASE RETRIES WITH BACKOFF (current: 1 retry → recommended: 3 retries)
// Retry delays: 0s, 30s, 90s
async function runApifyActorWithRetry(
  ...params,
  maxRetries = 3,
  retryDelays = [0, 30_000, 90_000]
)

// 5. ADD OUTPUT SCHEMA VALIDATION
function validateLinkedInPostItem(item: any): boolean {
  return typeof item['Post Text'] === 'string' &&
         typeof item['Author Name'] === 'string' &&
         typeof item['Post URL'] === 'string'
}
// After each actor run: filter items through validateLinkedInPostItem()
// If >50% of items fail validation, log schemaError and alert
```

---

---

## Part 7 — Lessons Learned: April 2026 Resilience Build

These lessons were learned during the `feature/apify-resilience` build and Gate 3 live validation. They are recorded here because they would have saved ~2 hours if known in advance.

### L1 — URLSearchParams.set() silently overwrites duplicate keys

`url.searchParams.set('fields[]', 'Apify API Key')` followed by `url.searchParams.set('fields[]', 'Last Manual Scan At')` results in only the second value being sent. Use `.append()` whenever sending the same key name more than once — which is exactly how Airtable's `fields[]` param works.

**Affected file:** `dashboard/app/api/trigger-scan/route.ts` — `getTenantRow()`.  
**Detection signal:** A specific Airtable field is consistently `undefined` in the response despite being in the Airtable record. Check whether its URL param is being overwritten before sending.

### L2 — Vercel env vars: Production scope ≠ Preview scope

A variable set for Production is not available in Preview deployments. This is by design and easy to miss.

**What broke:** `AIRTABLE_PROVISIONING_TOKEN` was Production-only. All Preview scans returned `scanSource: "none"` and `fetched: 0` because `atGet()` in `scan.ts` made unauthenticated Airtable requests — empty token = 401, caught silently = empty results. The scan returned HTTP 200 with no error, which looked like "no relevant posts found" rather than "Airtable auth is broken."

**Detection signal:** `[scan] Failed to fetch existing post URLs, skipping dedup: 401` in Vercel function logs. Also: `scanSource: "none"` + `deduped: 0` for a tenant with known prior scan history.

**Rule going forward:** Before testing any Preview deployment feature that touches Airtable, verify `AIRTABLE_PROVISIONING_TOKEN`, `PLATFORM_AIRTABLE_BASE_ID`, and `AIRTABLE_PLATFORM_TOKEN` are all scoped to Preview — not just Production. Same applies to `APIFY_API_TOKEN` (see L3).

### L3 — APIFY_API_TOKEN is also Production-only

Preview scans will fail with a 500 unless either: (a) `APIFY_API_TOKEN` is added to Preview scope, or (b) a per-tenant Apify API Key is set on the tenant record in Airtable (field `fld37tNIB5YHvFecP`, Tenants table). The code falls back to the per-tenant key first, so option (b) is a clean workaround for any specific test tenant.

### L4 — Vercel UI button proximity issue (automation-specific)

The "Link Shared Variable" and "Add Environment Variable" buttons sit adjacent in the Vercel UI. Coordinate-based automation clicks reliably hit the wrong one. Workaround: use the Chrome MCP `find()` tool to get a stable element ref — or bypass the UI entirely by calling the Vercel REST API directly (`POST /api/v10/projects/{projectId}/env` with browser session cookies). The API is faster and more reliable.

### L5 — HTTP 200 does not mean the scan did anything

A scan that returns HTTP 200 with `postsFound: 0` could mean: (a) no posts cleared the relevance threshold, (b) no new posts were found, or (c) Airtable auth is broken and no data loaded at all. These three outcomes are indistinguishable from the HTTP status alone.

**More useful diagnostic fields in the scan response:**
- `scanSource` — `"none"` means Sources table returned empty (Airtable auth issue or no active sources)
- `breakdown.deduped` — should be > 0 for any tenant with prior scans; 0 means Captured Posts was unreadable
- `breakdown.fetched` — should be > 0 if any actor ran; 0 means no Apify actor executed

### L6 — Scan cooldown can be reset via Airtable for testing

The 30-minute manual scan cooldown is enforced by comparing current time to `Last Manual Scan At` (field `fldwD423KT7zFOJjt` on Tenants table, Airtable base `appZWp7QdPptIOUYB`). Setting it to a past date via the Airtable MCP instantly resets the cooldown without a code deploy or redeploy.

---

*This document should be reviewed and updated whenever:*
- *Apify announces a pricing change*
- *Either primary actor is updated, deprecated, or starts showing elevated failure rates*
- *Scout upgrades its Apify plan tier*
- *A new alternative actor or provider is evaluated*
- *The scan architecture changes significantly*
