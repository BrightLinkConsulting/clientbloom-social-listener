/**
 * scripts/live-validation.ts
 *
 * Live validation gates for the feature/apify-resilience branch.
 * Executes real Apify API calls — NOT mock. Uses actual LinkedIn data.
 *
 * Run with:
 *   APIFY_TOKEN=apify_api_xxx npx ts-node --project tsconfig.test.json scripts/live-validation.ts
 *
 * Or with a real tenant ID for Gate 3:
 *   APIFY_TOKEN=apify_api_xxx TENANT_ID=recXXXXXXXXXXXXXX \
 *   npx ts-node --project tsconfig.test.json scripts/live-validation.ts
 *
 * Covers three validation gates from docs/apify-resilience-plan.md:
 *
 * Gate 1A — Run data-slayer/linkedin-profile-posts-scraper with a real LinkedIn profile.
 *            Capture actual output, compare field names against FALLBACK_ACTORS fieldMap.
 *
 * Gate 1B — Run powerai/linkedin-posts-search-scraper with a real keyword.
 *            Capture actual output, compare field names against FALLBACK_ACTORS fieldMap.
 *
 * Gate 2  — Run harvestapi/linkedin-profile-posts at 256MB vs 1024MB with the same
 *            inputs. Record result counts and durations. Flag if counts differ.
 *
 * Gate 3  — (Requires TENANT_ID) Run a full runScanForTenant() call using the
 *            branch code. Confirm posts are written with canonical fields populated.
 *
 * Results written to: docs/live-validation-results.md
 * Exit code 0 = all gates passed. Exit code 1 = one or more gates failed.
 */

import * as fs from 'fs'
import * as path from 'path'
import { FALLBACK_ACTORS, ACTOR_SCHEMAS, validateActorOutput, normalizeWithFieldMap } from '../lib/scan'

// ── Config ─────────────────────────────────────────────────────────────────────
const APIFY_TOKEN = process.env.APIFY_TOKEN || ''
const TENANT_ID   = process.env.TENANT_ID   || ''

// Test LinkedIn inputs
// Using a high-volume public profile for memory test (more posts = clearer diff)
const TEST_PROFILE_URL = 'https://www.linkedin.com/in/satyanadella/'
const TEST_KEYWORD     = 'B2B SaaS sales strategy'

const APIFY_BASE = 'https://api.apify.com/v2'

// ── Helpers ────────────────────────────────────────────────────────────────────
interface GateResult {
  gate:      string
  passed:    boolean
  findings:  string[]
  rawSample: object | null  // first item from actual actor output
  elapsedMs: number
}

async function runApifySync(
  actorId:      string,
  input:        object,
  waitSecs:     number,
  memoryMbytes: number,
): Promise<{ items: any[]; errorType: string | null; durationMs: number }> {
  const safeId = actorId.replace('/', '~')
  const url    = `${APIFY_BASE}/acts/${safeId}/run-sync-get-dataset-items` +
                 `?token=${APIFY_TOKEN}&timeout=${waitSecs}&memory=${memoryMbytes}`

  const start = Date.now()
  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(input),
    })
    const durationMs = Date.now() - start

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[live] ${actorId} HTTP ${res.status}: ${body.slice(0, 300)}`)
      return { items: [], errorType: `HTTP_${res.status}`, durationMs }
    }

    const items = await res.json()
    return { items: Array.isArray(items) ? items : [], errorType: null, durationMs }
  } catch (err: any) {
    return { items: [], errorType: 'NETWORK', durationMs: Date.now() - start }
  }
}

function checkFieldMap(
  items:    any[],
  actorId:  string,
  schema:   { required: string[]; fieldMap: Record<string,string> },
  findings: string[],
): boolean {
  if (!items.length) {
    findings.push('FAIL: Actor returned 0 items — cannot verify field names')
    return false
  }

  const sample = items[0]
  const actualKeys = Object.keys(sample)
  findings.push(`INFO: Actual output keys on item[0]: ${actualKeys.join(', ')}`)

  let allMatch = true

  // Check required fields exist in actual output
  for (const requiredField of schema.required) {
    const exists = requiredField.includes('.')
      ? requiredField.split('.').reduce((obj: any, k: string) => obj?.[k], sample) !== undefined
      : sample[requiredField] !== undefined

    if (!exists) {
      findings.push(`FAIL: Required field "${requiredField}" NOT FOUND in actual output`)
      findings.push(`      This means the fieldMap is wrong for ${actorId}`)
      findings.push(`      Actual keys: ${actualKeys.join(', ')}`)
      allMatch = false
    } else {
      findings.push(`PASS: Required field "${requiredField}" present in actual output`)
    }
  }

  // Check fieldMap source keys exist in actual output
  for (const [srcPath, destField] of Object.entries(schema.fieldMap)) {
    const value = srcPath.includes('.')
      ? srcPath.split('.').reduce((obj: any, k: string) => obj?.[k], sample)
      : sample[srcPath]

    if (value === undefined) {
      findings.push(`WARN: fieldMap source "${srcPath}" → "${destField}" not found in actual output`)
      findings.push(`      Canonical field "${destField}" will be blank for this actor`)
      allMatch = false
    } else {
      const preview = typeof value === 'string' ? value.slice(0, 50) : String(value)
      findings.push(`PASS: fieldMap "${srcPath}" → "${destField}" found: "${preview}..."`)
    }
  }

  // Apply normalization and check canonical fields
  const normalized = normalizeWithFieldMap(sample, schema.fieldMap)
  const canonicals  = ['text', 'authorName', 'authorUrl', 'postUrl', 'postId']
  const blankCanonicals = canonicals.filter(f => !normalized[f])

  if (blankCanonicals.length > 0) {
    findings.push(`FAIL: After normalization, canonical fields are BLANK: ${blankCanonicals.join(', ')}`)
    findings.push(`      Posts written to Airtable will have empty fields for: ${blankCanonicals.join(', ')}`)
    allMatch = false
  } else {
    findings.push(`PASS: All canonical fields populated after normalization: ${canonicals.join(', ')}`)
  }

  return allMatch
}

// ── Gate 1A: bebity fallback actor ─────────────────────────────────────────────
async function runGate1A(): Promise<GateResult> {
  const start    = Date.now()
  const findings: string[] = []
  let passed     = true

  const actorId  = 'data-slayer/linkedin-profile-posts-scraper'
  const fallbackConfig = Object.values(FALLBACK_ACTORS).find(f => f.actorId === actorId)

  if (!fallbackConfig) {
    return {
      gate: 'Gate 1A',
      passed: false,
      findings: ['FAIL: data-slayer actor not registered in FALLBACK_ACTORS'],
      rawSample: null,
      elapsedMs: Date.now() - start,
    }
  }

  findings.push(`INFO: Running ${actorId} with profile: ${TEST_PROFILE_URL}`)
  findings.push(`INFO: waitSecs=${fallbackConfig.waitSecs}, memory=256MB`)

  const { items, errorType, durationMs } = await runApifySync(
    actorId,
    // bebity actor input format — may need adjustment based on actual actor docs
    { profileUrls: [TEST_PROFILE_URL], maxPosts: 3 },
    fallbackConfig.waitSecs,
    256,
  )

  findings.push(`INFO: Apify call completed in ${durationMs}ms`)

  if (errorType) {
    findings.push(`FAIL: Actor returned error: ${errorType}`)
    findings.push(`      This may mean the input format is wrong for this actor`)
    findings.push(`      Check Apify console for run details`)
    passed = false
    return { gate: 'Gate 1A', passed, findings, rawSample: null, elapsedMs: Date.now() - start }
  }

  findings.push(`INFO: Actor returned ${items.length} item(s)`)

  if (!checkFieldMap(items, actorId, fallbackConfig.schema, findings)) {
    passed = false
  }

  // Validate against schema
  const isValid = validateActorOutput(actorId, items)
  if (!isValid) {
    findings.push('FAIL: validateActorOutput() rejected actual output — fieldMap or required fields need updating')
    passed = false
  } else {
    findings.push('PASS: validateActorOutput() accepted actual output')
  }

  return {
    gate:      'Gate 1A',
    passed,
    findings,
    rawSample: items[0] || null,
    elapsedMs: Date.now() - start,
  }
}

// ── Gate 1B: anchor fallback actor ─────────────────────────────────────────────
async function runGate1B(): Promise<GateResult> {
  const start    = Date.now()
  const findings: string[] = []
  let passed     = true

  const actorId  = 'powerai/linkedin-posts-search-scraper'
  const fallbackConfig = Object.values(FALLBACK_ACTORS).find(f => f.actorId === actorId)

  if (!fallbackConfig) {
    return {
      gate: 'Gate 1B',
      passed: false,
      findings: ['FAIL: powerai actor not registered in FALLBACK_ACTORS'],
      rawSample: null,
      elapsedMs: Date.now() - start,
    }
  }

  findings.push(`INFO: Running ${actorId} with keyword: "${TEST_KEYWORD}"`)
  findings.push(`INFO: waitSecs=${fallbackConfig.waitSecs}, memory=256MB`)

  const { items, errorType, durationMs } = await runApifySync(
    actorId,
    // anchor actor input format — may need adjustment
    { searchQuery: TEST_KEYWORD, limit: 5 },
    fallbackConfig.waitSecs,
    256,
  )

  findings.push(`INFO: Apify call completed in ${durationMs}ms`)

  if (errorType) {
    findings.push(`FAIL: Actor returned error: ${errorType}`)
    findings.push(`      May mean input format is wrong for this actor`)
    passed = false
    return { gate: 'Gate 1B', passed, findings, rawSample: null, elapsedMs: Date.now() - start }
  }

  findings.push(`INFO: Actor returned ${items.length} item(s)`)

  if (!checkFieldMap(items, actorId, fallbackConfig.schema, findings)) {
    passed = false
  }

  const isValid = validateActorOutput(actorId, items)
  if (!isValid) {
    findings.push('FAIL: validateActorOutput() rejected actual output — need to update fieldMap')
    passed = false
  } else {
    findings.push('PASS: validateActorOutput() accepted actual output')
  }

  return {
    gate:      'Gate 1B',
    passed,
    findings,
    rawSample: items[0] || null,
    elapsedMs: Date.now() - start,
  }
}

// ── Gate 2: Memory baseline ────────────────────────────────────────────────────
async function runGate2(): Promise<GateResult> {
  const start    = Date.now()
  const findings: string[] = []
  let passed     = true

  const primaryActorId = 'harvestapi/linkedin-profile-posts'
  const input = {
    profileUrls:     [TEST_PROFILE_URL],
    maxPosts:        10,
    proxy:           { useApifyProxy: true },
    scrapeReactions: false,
    scrapeComments:  false,
  }

  findings.push(`INFO: Running ${primaryActorId} at 256MB...`)
  const run256 = await runApifySync(primaryActorId, input, 45, 256)
  findings.push(`INFO: 256MB — ${run256.items.length} items in ${run256.durationMs}ms (error: ${run256.errorType || 'none'})`)

  // Small delay between runs to avoid rate limiting
  await new Promise(r => setTimeout(r, 5000))

  findings.push(`INFO: Running ${primaryActorId} at 1024MB...`)
  const run1024 = await runApifySync(primaryActorId, input, 45, 1024)
  findings.push(`INFO: 1024MB — ${run1024.items.length} items in ${run1024.durationMs}ms (error: ${run1024.errorType || 'none'})`)

  // Compare
  const countDiff = Math.abs(run256.items.length - run1024.items.length)
  const bothFailed = run256.errorType && run1024.errorType

  if (bothFailed) {
    findings.push(`FAIL: Both runs failed. 256MB error: ${run256.errorType}, 1024MB error: ${run1024.errorType}`)
    findings.push(`      Primary actor may be rate-limited or unavailable. Retry later.`)
    passed = false
  } else if (run256.errorType && !run1024.errorType) {
    findings.push(`FAIL: 256MB run FAILED but 1024MB succeeded (${run1024.items.length} items)`)
    findings.push(`      This is the exact scenario we suspected: 256MB is insufficient for this actor`)
    findings.push(`      ACTION REQUIRED: Update global default from 256MB to 1024MB in FALLBACK_ACTORS and scanLinkedIn()`)
    passed = false
  } else if (!run256.errorType && run1024.errorType) {
    findings.push(`WARN: 256MB succeeded (${run256.items.length} items) but 1024MB failed (${run1024.errorType})`)
    findings.push(`      This is unusual — 1024MB should always succeed if 256MB does. May be a transient error.`)
  } else if (countDiff > 2) {
    findings.push(`FAIL: Result count differs between 256MB (${run256.items.length}) and 1024MB (${run1024.items.length})`)
    findings.push(`      Difference of ${countDiff} posts suggests memory is constraining actor performance`)
    findings.push(`      ACTION REQUIRED: Update default memory to 1024MB`)
    passed = false
  } else {
    findings.push(`PASS: Result counts match within tolerance (256MB: ${run256.items.length}, 1024MB: ${run1024.items.length}, diff: ${countDiff})`)
    findings.push(`PASS: 256MB is confirmed sufficient for ${primaryActorId}. No global default change needed.`)
  }

  // Cost calculation
  const cuAt256  = (256 / 1024) * (run256.durationMs / 3600000)
  const cuAt1024 = (1024 / 1024) * (run1024.durationMs / 3600000)
  findings.push(`INFO: CU cost — 256MB: ${cuAt256.toFixed(6)} CU ($${(cuAt256 * 0.30).toFixed(6)}), 1024MB: ${cuAt1024.toFixed(6)} CU ($${(cuAt1024 * 0.30).toFixed(6)})`)

  return {
    gate:      'Gate 2',
    passed,
    findings,
    rawSample: run256.items[0] || null,
    elapsedMs: Date.now() - start,
  }
}

// ── Gate 3: End-to-end scan (if TENANT_ID provided) ───────────────────────────
async function runGate3(): Promise<GateResult> {
  const start    = Date.now()
  const findings: string[] = []

  if (!TENANT_ID) {
    return {
      gate:      'Gate 3',
      passed:    false,
      findings:  ['SKIP: No TENANT_ID provided. Set TENANT_ID=recXXXXXXXXXXXXXX to run end-to-end scan gate.'],
      rawSample: null,
      elapsedMs: 0,
    }
  }

  findings.push(`INFO: Gate 3 requires the branch code to run via the Next.js API route, not directly from this script.`)
  findings.push(`INFO: To run Gate 3:`)
  findings.push(`  1. Deploy the branch to a Vercel preview (git push → Vercel auto-deploys feature branches)`)
  findings.push(`  2. Hit the preview URL: POST /api/trigger-scan with your session cookie`)
  findings.push(`  3. Check Airtable Captured Posts table for the test tenant — all canonical fields should be populated`)
  findings.push(`  4. Check Scan Health table — status should be 'success', Scan Lock Token should be cleared`)
  findings.push(``)
  findings.push(`INFO: Alternatively, with TENANT_ID=${TENANT_ID}, you can verify the Airtable write manually:`)
  findings.push(`  1. Trigger a scan from the Scout dashboard UI`)
  findings.push(`  2. Inspect the most recent Captured Posts records for this tenant`)
  findings.push(`  3. Confirm: Post Text, Author Name, Author Profile URL, Post URL are all non-blank`)

  return {
    gate:      'Gate 3',
    passed:    false,  // Cannot auto-pass Gate 3 — requires manual verification step
    findings,
    rawSample: null,
    elapsedMs: Date.now() - start,
  }
}

// ── Markdown formatter ─────────────────────────────────────────────────────────
function formatMarkdown(results: GateResult[]): string {
  const now    = new Date().toISOString()
  const passed = results.filter(r => r.passed).length
  const total  = results.length

  let md = `# Live Validation Results\n`
  md += `## Scout — feature/apify-resilience (Live Apify Calls)\n\n`
  md += `**Run date:** ${now}  \n`
  md += `**Branch:** feature/apify-resilience  \n`
  md += `**Test profile:** ${TEST_PROFILE_URL}  \n`
  md += `**Test keyword:** ${TEST_KEYWORD}  \n`
  md += `**Gates passed:** ${passed}/${total}  \n\n`
  md += `---\n\n`

  for (const r of results) {
    const icon = r.passed ? '✅' : '❌'
    md += `## ${icon} ${r.gate} — ${r.passed ? 'PASS' : 'FAIL'}\n\n`
    md += `**Duration:** ${r.elapsedMs}ms  \n\n`
    md += `**Findings:**\n`
    for (const f of r.findings) {
      const prefix = f.startsWith('FAIL') ? '❌' : f.startsWith('WARN') ? '⚠️' : f.startsWith('PASS') ? '✅' : 'ℹ️'
      md += `- ${prefix} ${f}\n`
    }

    if (r.rawSample) {
      md += `\n**Raw output sample (first item):**\n\`\`\`json\n${JSON.stringify(r.rawSample, null, 2).slice(0, 2000)}\n\`\`\`\n`
    }

    md += `\n---\n\n`
  }

  return md
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!APIFY_TOKEN) {
    console.error('\n❌ APIFY_TOKEN is not set.')
    console.error('Run with: APIFY_TOKEN=apify_api_xxx npx ts-node --project tsconfig.test.json scripts/live-validation.ts\n')
    process.exit(1)
  }

  console.log('\n================================================================================')
  console.log('  SCOUT — LIVE VALIDATION GATES (real Apify API calls)')
  console.log('  This costs real Compute Units. Estimated cost: ~$0.01 total.')
  console.log('================================================================================\n')

  const results: GateResult[] = []

  console.log('Running Gate 1A: bebity fallback actor...')
  results.push(await runGate1A())
  console.log(`  → ${results[results.length-1].passed ? 'PASS' : 'FAIL'}\n`)

  console.log('Running Gate 1B: anchor fallback actor...')
  results.push(await runGate1B())
  console.log(`  → ${results[results.length-1].passed ? 'PASS' : 'FAIL'}\n`)

  console.log('Running Gate 2: memory baseline (256MB vs 1024MB)...')
  results.push(await runGate2())
  console.log(`  → ${results[results.length-1].passed ? 'PASS' : 'FAIL'}\n`)

  console.log('Running Gate 3: end-to-end scan...')
  results.push(await runGate3())
  console.log(`  → ${results[results.length-1].passed ? 'PASS' : 'SKIP (manual step)'}\n`)

  // Write report
  const reportPath = path.join(__dirname, '../../docs/live-validation-results.md')
  fs.writeFileSync(reportPath, formatMarkdown(results), 'utf8')
  console.log(`\nReport written to: ${reportPath}`)

  // Print summary
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  console.log(`\n================================================================================`)
  console.log(`  FINAL: ${passed}/${results.length} PASS | ${failed}/${results.length} FAIL/SKIP`)
  console.log(`================================================================================\n`)

  // Print detailed findings for each gate
  for (const r of results) {
    console.log(`\n[${r.passed ? 'PASS' : 'FAIL'}] ${r.gate}:`)
    for (const f of r.findings) {
      console.log(`  ${f}`)
    }
    if (r.rawSample) {
      console.log(`  Raw sample keys: ${Object.keys(r.rawSample).join(', ')}`)
    }
  }

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('\n❌ Live validation script crashed:', err.message)
  process.exit(1)
})
