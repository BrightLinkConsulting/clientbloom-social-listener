/**
 * lib/apify-mock.ts
 *
 * Simulation layer for deterministic adversarial testing of Apify resilience code.
 *
 * This file is NEVER imported in production. It is only used by scripts/adversarial-test.ts.
 * It replaces the real fetch() calls inside runApifyActor() with controlled failure injection.
 *
 * Usage:
 *   import { MockApifyClient, MockScenario } from './apify-mock'
 *   const mock = new MockApifyClient(scenario)
 *   // pass mock.runApifyActor as the replaceable function in test harness
 *
 * All scenarios are deterministic: given the same scenario config, the same
 * result is always returned. No randomness, no network calls, no CU cost.
 */

import { ActorSchema } from './scan'

// ── Item generators ───────────────────────────────────────────────────────────
// These produce realistic-looking but fake actor output matching each actor's schema.

function validHarvestapiItem(index: number): object {
  return {
    id:      `post_${index}`,
    content: `This is a LinkedIn post about B2B sales strategy #${index}`,
    author: {
      name:        `Author Name ${index}`,
      linkedinUrl: `https://linkedin.com/in/author-${index}`,
    },
    socialContent: {
      shareUrl:  `https://linkedin.com/feed/update/urn:li:activity:${1000 + index}`,
      authorUrl: `https://linkedin.com/in/author-${index}`,
    },
    publishedAt: new Date(Date.now() - index * 3600000).toISOString(),
  }
}

function validApimaestroItem(index: number): object {
  return {
    id:               `kw_post_${index}`,
    text:             `Great insights on enterprise software strategy #${index}`,
    authorName:       `Keyword Author ${index}`,
    authorProfileUrl: `https://linkedin.com/in/kw-author-${index}`,
    postUrl:          `https://linkedin.com/feed/update/urn:li:activity:${2000 + index}`,
    publishedAt:      new Date(Date.now() - index * 3600000).toISOString(),
  }
}

function validBebityItem(index: number): object {
  // bebity/linkedin-profile-posts-scraper uses different field names
  return {
    urn:       `urn:li:activity:${3000 + index}`,
    postText:  `Fallback actor post about leadership and growth #${index}`,
    ownerName: `Bebity Author ${index}`,
    ownerUrl:  `https://linkedin.com/in/bebity-author-${index}`,
    url:       `https://linkedin.com/feed/update/urn:li:activity:${3000 + index}`,
    publishedAt: new Date(Date.now() - index * 3600000).toISOString(),
  }
}

function validAnchorItem(index: number): object {
  // anchor/linkedin-post-url-search uses similar flat schema to apimaestro
  return {
    id:         `anchor_post_${index}`,
    text:       `Anchor actor post about sales strategy #${index}`,
    authorName: `Anchor Author ${index}`,
    authorUrl:  `https://linkedin.com/in/anchor-author-${index}`,
    postUrl:    `https://linkedin.com/feed/update/urn:li:activity:${4000 + index}`,
    publishedAt: new Date(Date.now() - index * 3600000).toISOString(),
  }
}

function schemaBreakingHarvestapiItem(index: number): object {
  // Same as valid but with 'content' renamed to 'postContent' — schema violation
  return {
    id:          `post_${index}`,
    postContent: `This is a schema-broken post #${index}`,  // WRONG: should be 'content'
    author: {
      fullName:   `Author Name ${index}`,                   // WRONG: should be 'name'
      profileUrl: `https://linkedin.com/in/author-${index}`, // WRONG: should be 'linkedinUrl'
    },
    publishedAt: new Date(Date.now() - index * 3600000).toISOString(),
  }
}

function emptyTextField(index: number): object {
  // Valid structure but blank text — triggers post-write sanity check
  return {
    id:      `post_${index}`,
    content: '',   // empty — will produce blank Post Text after normalization
    author: {
      name:        `Author Name ${index}`,
      linkedinUrl: `https://linkedin.com/in/author-${index}`,
    },
    socialContent: {
      shareUrl:  `https://linkedin.com/feed/update/urn:li:activity:${5000 + index}`,
      authorUrl: `https://linkedin.com/in/author-${index}`,
    },
    publishedAt: new Date(Date.now() - index * 3600000).toISOString(),
  }
}

// ── Scenario definitions ──────────────────────────────────────────────────────

export type ActorCallResult =
  | { type: 'success';        items: object[] }
  | { type: 'error';          errorType: string; status: number }
  | { type: 'empty';          errorType?: string }          // 0 items, no error
  | { type: 'schema_broken';  items: object[] }             // items with wrong field names
  | { type: 'partial_blank';  items: object[]; blankPct: number }  // items with some blank fields

export interface ActorCallConfig {
  actorId:    string
  attempt:    number  // 1 = primary, 2 = retry, 3 = fallback
  result:     ActorCallResult
}

export interface MockScenario {
  id:          string
  description: string
  calls:       ActorCallConfig[]
}

// ── Pre-built scenarios ───────────────────────────────────────────────────────
// These are the 15 adversarial scenarios from the resilience plan.

export const SCENARIOS: MockScenario[] = [
  {
    id:          'A1',
    description: 'Primary actor returns actor_error, fallback succeeds with valid output',
    calls: [
      { actorId: 'harvestapi/linkedin-profile-posts', attempt: 1, result: { type: 'error', errorType: 'RUN_FAILED', status: 400 } },
      { actorId: 'harvestapi/linkedin-profile-posts', attempt: 2, result: { type: 'error', errorType: 'RUN_FAILED', status: 400 } },
      { actorId: 'bebity/linkedin-profile-posts-scraper', attempt: 3, result: { type: 'success', items: [validBebityItem(1), validBebityItem(2), validBebityItem(3)] } },
    ],
  },
  {
    id:          'A2',
    description: 'Primary fails, fallback succeeds with DIFFERENT field schema — normalization must work',
    calls: [
      { actorId: 'harvestapi/linkedin-profile-posts', attempt: 1, result: { type: 'error', errorType: 'RUN_FAILED', status: 400 } },
      { actorId: 'harvestapi/linkedin-profile-posts', attempt: 2, result: { type: 'error', errorType: 'NETWORK', status: 0 } },
      { actorId: 'bebity/linkedin-profile-posts-scraper', attempt: 3, result: { type: 'success', items: [validBebityItem(1), validBebityItem(2)] } },
    ],
  },
  {
    id:          'A3',
    description: 'Primary fails and fallback ALSO fails — all 3 attempts exhausted',
    calls: [
      { actorId: 'harvestapi/linkedin-profile-posts', attempt: 1, result: { type: 'error', errorType: 'RUN_FAILED', status: 400 } },
      { actorId: 'harvestapi/linkedin-profile-posts', attempt: 2, result: { type: 'error', errorType: 'TIMEOUT', status: 400 } },
      { actorId: 'bebity/linkedin-profile-posts-scraper', attempt: 3, result: { type: 'error', errorType: 'RUN_FAILED', status: 400 } },
    ],
  },
  {
    id:          'A4',
    description: 'Primary returns 0 items with NO error code (silent empty) — should trigger fallback',
    calls: [
      { actorId: 'harvestapi/linkedin-profile-posts', attempt: 1, result: { type: 'empty' } },
      { actorId: 'harvestapi/linkedin-profile-posts', attempt: 2, result: { type: 'empty' } },
      { actorId: 'bebity/linkedin-profile-posts-scraper', attempt: 3, result: { type: 'success', items: [validBebityItem(1)] } },
    ],
  },
  {
    id:          'A5',
    description: 'Primary succeeds but returns schema-broken output — validation must block Airtable write',
    calls: [
      {
        actorId: 'harvestapi/linkedin-profile-posts',
        attempt: 1,
        result: { type: 'schema_broken', items: [schemaBreakingHarvestapiItem(1), schemaBreakingHarvestapiItem(2)] }
      },
      {
        actorId: 'harvestapi/linkedin-profile-posts',
        attempt: 2,
        result: { type: 'schema_broken', items: [schemaBreakingHarvestapiItem(1)] }
      },
      { actorId: 'bebity/linkedin-profile-posts-scraper', attempt: 3, result: { type: 'success', items: [validBebityItem(1)] } },
    ],
  },
  {
    id:          'A6',
    description: 'Primary succeeds, first/last items valid, middle item malformed — sampling must catch it',
    calls: [
      {
        actorId: 'harvestapi/linkedin-profile-posts',
        attempt: 1,
        result: {
          type: 'success',
          // item[0] valid, item[1] broken (middle of 3), item[2] valid
          items: [
            validHarvestapiItem(1),
            schemaBreakingHarvestapiItem(2),  // middle item breaks schema
            validHarvestapiItem(3),
          ]
        }
      },
      { actorId: 'harvestapi/linkedin-profile-posts', attempt: 2, result: { type: 'success', items: [validHarvestapiItem(1)] } },
    ],
  },
  {
    id:          'A7',
    description: 'Primary succeeds, all items valid schema but 35% have empty text — post-write sanity must trigger',
    calls: [
      {
        actorId: 'harvestapi/linkedin-profile-posts',
        attempt: 1,
        result: {
          type: 'success',
          items: [
            validHarvestapiItem(1),
            validHarvestapiItem(2),
            emptyTextField(3),   // 35% blank — triggers sanity check (>30% threshold)
            emptyTextField(4),
            validHarvestapiItem(5),
            validHarvestapiItem(6),
            emptyTextField(7),
            // 3/7 ≈ 43% blank — above 30% threshold — should flag as degraded
          ]
        }
      },
    ],
  },
  {
    id:          'A8',
    description: 'Two scan requests fire for same tenant — concurrency lock prevents duplicate',
    calls: [], // Lock behavior — no actor calls involved in this scenario
  },
  {
    id:          'A9',
    description: 'Stale lock (expiry in past) must not block future scans',
    calls: [], // Lock behavior
  },
  {
    id:          'A10',
    description: 'Global Inflight Count = 26 (above ceiling of 24) — scan should be delayed',
    calls: [], // Inflight counter behavior
  },
  {
    id:          'A11',
    description: 'Global Inflight Count stuck at 8 for >10 minutes — watchdog must reset',
    calls: [], // Watchdog behavior
  },
  {
    id:          'A12',
    description: 'AUTH error on primary actor — non-retriable, no fallback triggered',
    calls: [
      { actorId: 'harvestapi/linkedin-profile-posts', attempt: 1, result: { type: 'error', errorType: 'AUTH', status: 401 } },
    ],
  },
  {
    id:          'A13',
    description: 'Primary TIMEOUT, fallback succeeds — timeout is retriable',
    calls: [
      { actorId: 'harvestapi/linkedin-profile-posts', attempt: 1, result: { type: 'error', errorType: 'TIMEOUT', status: 400 } },
      { actorId: 'harvestapi/linkedin-profile-posts', attempt: 2, result: { type: 'error', errorType: 'TIMEOUT', status: 400 } },
      { actorId: 'bebity/linkedin-profile-posts-scraper', attempt: 3, result: { type: 'success', items: [validBebityItem(1), validBebityItem(2)] } },
    ],
  },
  {
    id:          'A14',
    description: 'All keyword terms fail in parallel — no crash, scan reports 0 posts cleanly',
    calls: [
      { actorId: 'apimaestro/linkedin-posts-search-scraper-no-cookies', attempt: 1, result: { type: 'error', errorType: 'RUN_FAILED', status: 400 } },
      { actorId: 'apimaestro/linkedin-posts-search-scraper-no-cookies', attempt: 2, result: { type: 'error', errorType: 'RUN_FAILED', status: 400 } },
      { actorId: 'anchor/linkedin-post-url-search', attempt: 3, result: { type: 'error', errorType: 'RUN_FAILED', status: 400 } },
    ],
  },
  {
    id:          'A15',
    description: 'Fallback actor times out — clean TIMEOUT failure, no crash',
    calls: [
      { actorId: 'harvestapi/linkedin-profile-posts', attempt: 1, result: { type: 'error', errorType: 'RUN_FAILED', status: 400 } },
      { actorId: 'harvestapi/linkedin-profile-posts', attempt: 2, result: { type: 'error', errorType: 'RUN_FAILED', status: 400 } },
      { actorId: 'bebity/linkedin-profile-posts-scraper', attempt: 3, result: { type: 'error', errorType: 'TIMEOUT', status: 400 } },
    ],
  },
]

// ── Mock client ───────────────────────────────────────────────────────────────
/**
 * MockApifyClient provides a drop-in replacement for runApifyActor() during tests.
 * It consumes the scenario's call config in sequence and returns the configured result.
 */
export class MockApifyClient {
  private scenario:   MockScenario
  private callIndex:  number = 0
  public  callLog:    Array<{ actorId: string; attempt: number; returned: string }> = []

  constructor(scenario: MockScenario) {
    this.scenario = scenario
  }

  /**
   * Simulates runApifyActor() — returns { items, errorType } matching the configured result.
   * Matches calls by actorId in sequence (not by attempt number, since the caller doesn't
   * know what attempt it is — the scenario order determines which config fires next).
   */
  runApifyActor(
    _token: string,
    actorId: string,
    _input: object,
    _waitSecs: number,
    _memory: number,
    _tag?: string,
  ): { items: any[]; errorType: string | null } {
    // Find the next unmatched call config for this actorId
    const remaining = this.scenario.calls.slice(this.callIndex)
    const matchIdx  = remaining.findIndex(c => c.actorId === actorId)

    if (matchIdx === -1) {
      // No more configs for this actorId — return empty (unexpected call)
      this.callLog.push({ actorId, attempt: -1, returned: 'UNEXPECTED_CALL (no config)' })
      return { items: [], errorType: 'NO_CONFIG' }
    }

    const config = remaining[matchIdx]
    this.callIndex += matchIdx + 1

    const result = this.buildResult(config.result, actorId)
    this.callLog.push({ actorId, attempt: config.attempt, returned: this.describeResult(result) })
    return result
  }

  private buildResult(
    result: ActorCallResult,
    _actorId: string,
  ): { items: any[]; errorType: string | null } {
    switch (result.type) {
      case 'success':
        return { items: result.items as any[], errorType: null }

      case 'schema_broken':
        // Return items — schema validation in the real code should catch them
        return { items: result.items as any[], errorType: null }

      case 'error':
        return { items: [], errorType: result.errorType }

      case 'empty':
        return { items: [], errorType: result.errorType || null }

      case 'partial_blank': {
        // Return mixed items — some with content, some with blank text fields
        return { items: result.items as any[], errorType: null }
      }

      default:
        return { items: [], errorType: 'MOCK_ERROR' }
    }
  }

  private describeResult(result: { items: any[]; errorType: string | null }): string {
    if (result.errorType) return `ERROR:${result.errorType}`
    return `SUCCESS:${result.items.length} items`
  }

  reset(): void {
    this.callIndex = 0
    this.callLog   = []
  }
}

// ── Mock lock state ───────────────────────────────────────────────────────────
// Simulates the Airtable-backed lock state in memory for testing.

export interface MockLockState {
  token:     string | null
  expiresAt: number | null   // Unix timestamp ms
}

export class MockLockStore {
  private locks: Map<string, MockLockState> = new Map()
  private inflightCount: number = 0
  private lastInflightActivity: number = Date.now()

  getLock(tenantId: string): MockLockState {
    return this.locks.get(tenantId) || { token: null, expiresAt: null }
  }

  setLock(tenantId: string, token: string | null, expiresAtMs: number | null): void {
    this.locks.set(tenantId, { token, expiresAt: expiresAtMs })
  }

  clearLock(tenantId: string): void {
    this.locks.set(tenantId, { token: null, expiresAt: null })
  }

  getInflight(): number { return this.inflightCount }
  setInflight(n: number): void {
    this.inflightCount = n
    this.lastInflightActivity = Date.now()
  }
  getLastInflightActivity(): number { return this.lastInflightActivity }
  setLastInflightActivity(ts: number): void { this.lastInflightActivity = ts }
}
