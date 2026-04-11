import { NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import { airtableList, airtableCreate, SHARED_BASE, PROV_TOKEN, tenantFilter } from '@/lib/airtable'
import { getTierLimits, isPaidPlan } from '@/lib/tier'

const TABLE          = 'LinkedIn ICPs'
const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''

// Cooldown window per plan: paid = 15 min, trial = 1 hour
const COOLDOWN_MS = {
  paid:  15  * 60 * 1000,
  trial: 60  * 60 * 1000,
}

// ── Read + write Last ICP Discovery At on the tenant record ───────────────────

async function getLastDiscoveryAt(tenantId: string): Promise<{ recordId: string; lastAt: string | null } | null> {
  if (!PLATFORM_TOKEN || !PLATFORM_BASE) return null
  try {
    const filter = tenantId === 'owner'
      ? `OR({Tenant ID}='owner',{Tenant ID}='')`
      : `{Tenant ID}='${tenantId}'`
    const url = new URL(`https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent('Tenants')}`)
    url.searchParams.set('filterByFormula', filter)
    url.searchParams.set('fields[]', 'Last ICP Discovery At')
    url.searchParams.set('maxRecords', '1')
    const resp = await fetch(url.toString(), { headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` } })
    if (!resp.ok) return null
    const data = await resp.json()
    const rec  = data.records?.[0]
    if (!rec) return null
    return { recordId: rec.id, lastAt: rec.fields?.['Last ICP Discovery At'] || null }
  } catch { return null }
}

async function recordDiscoveryTimestamp(recordId: string): Promise<void> {
  if (!PLATFORM_TOKEN || !PLATFORM_BASE) return
  try {
    await fetch(`https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent('Tenants')}/${recordId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${PLATFORM_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { 'Last ICP Discovery At': new Date().toISOString() } }),
    })
  } catch (e) {
    console.error('[discover] Failed to record Last ICP Discovery At:', e)
  }
}

/**
 * POST /api/linkedin-icps/discover
 *
 * Body: { jobTitles: string[], keywords: string[], maxProfiles: number }
 *
 * Flow:
 *  1. Rate-limit check (15 min for paid, 60 min for trial) — protect Apify spend
 *  2. Enforce ICP profile count against plan limit
 *  3. Build Google search queries from job titles + keywords
 *  4. Run apify/google-search-scraper
 *  5. Extract LinkedIn profile URLs from organic results
 *  6. Fetch existing profile URLs from Airtable to avoid duplicates
 *  7. Save new profiles as "discovered" records in LinkedIn ICPs table
 *  8. Return { added, skipped, profiles }
 */
export async function POST(req: Request) {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()
  const { tenantId, plan } = tenant

  const APIFY_TOKEN = process.env.APIFY_API_TOKEN

  try {
    const { jobTitles = [], keywords = [], maxProfiles = 50, onboardingMode = false } = await req.json()

    if (!jobTitles.length) {
      return NextResponse.json({ error: 'At least one job title is required.' }, { status: 400 })
    }
    if (!APIFY_TOKEN) {
      return NextResponse.json({ error: 'Profile discovery is not available on this platform.' }, { status: 500 })
    }

    const tierLimits = getTierLimits(plan)

    // ── Onboarding bypass: Trial users get one discovery run during wizard ─────
    // onboardingMode=true skips the plan gate but still enforces the 10-profile
    // pool cap (poolSize for Trial = 10). The hard cooldown and dedup logic
    // remain active to prevent abuse from page refreshes.
    const isOnboardingBypass = onboardingMode === true && plan === 'Trial'

    // ── Plan gate: Discover ICPs locked for Trial ─────────────────────────────
    if (!isOnboardingBypass && tierLimits.discoverRunsPerDay === 0) {
      return NextResponse.json(
        { error: 'Profile discovery is available on paid plans. Upgrade to unlock it.', upgrade: true },
        { status: 403 }
      )
    }

    // Effective per-run cap: onboarding Trial users get up to 10 (their poolSize)
    const effectiveMaxPerRun = isOnboardingBypass ? 10 : tierLimits.discoverMaxPerRun

    // ── Daily run frequency check (paid plans) ─────────────────────────────────
    // Note: discoverRunsPerDay = 999 means effectively unlimited (Agency)
    const discovery = await getLastDiscoveryAt(tenantId)
    if (tierLimits.discoverRunsPerDay < 999 && discovery?.lastAt) {
      const msPerDay     = 24 * 60 * 60 * 1000
      const windowMs     = msPerDay / tierLimits.discoverRunsPerDay
      const msSinceLast  = Date.now() - new Date(discovery.lastAt).getTime()
      if (msSinceLast < windowMs) {
        const waitMins = Math.ceil((windowMs - msSinceLast) / 60_000)
        return NextResponse.json(
          { error: `You can run discovery ${tierLimits.discoverRunsPerDay}× per day. Try again in ${waitMins} minute${waitMins === 1 ? '' : 's'}.`, retryAfter: waitMins * 60 },
          { status: 429 }
        )
      }
    }

    // ── Cooldown safety net (15 min min between calls regardless of plan) ─────
    const HARD_COOLDOWN_MS = 15 * 60 * 1000
    if (discovery?.lastAt) {
      const msSinceLast = Date.now() - new Date(discovery.lastAt).getTime()
      if (msSinceLast < HARD_COOLDOWN_MS) {
        const waitMins = Math.ceil((HARD_COOLDOWN_MS - msSinceLast) / 60_000)
        return NextResponse.json(
          { error: `Please wait ${waitMins} more minute${waitMins === 1 ? '' : 's'} before running discovery again.`, retryAfter: waitMins * 60 },
          { status: 429 }
        )
      }
    }

    // ── Pool size cap (counts ALL records — active + paused, paginated) ──────
    // Paginates so Agency-tier tenants (500-profile pools) are counted correctly.
    let existingCount = 0
    {
      let countOffset: string | undefined
      do {
        const existingCountUrl = new URL(`https://api.airtable.com/v0/${SHARED_BASE}/${encodeURIComponent(TABLE)}`)
        existingCountUrl.searchParams.set('filterByFormula', tenantFilter(tenantId))
        existingCountUrl.searchParams.set('fields[]', 'Active')
        existingCountUrl.searchParams.set('pageSize', '100')
        if (countOffset) existingCountUrl.searchParams.set('offset', countOffset)
        const countResp = await fetch(existingCountUrl.toString(), { headers: { Authorization: `Bearer ${PROV_TOKEN}` } })
        const countData = await countResp.json()
        existingCount  += (countData.records ?? []).length
        countOffset     = countData.offset
      } while (countOffset)
    }
    if (existingCount >= tierLimits.poolSize) {
      return NextResponse.json(
        {
          error:   `Your ${tierLimits.poolSize}-profile pool is full. Remove a profile to make room for new ones.`,
          limit:   tierLimits.poolSize,
          current: existingCount,
        },
        { status: 429 }
      )
    }

    // Cap to effective per-run limit, then to remaining pool slots
    const slotsRemaining = tierLimits.poolSize - existingCount
    const cap = Math.min(
      Number(maxProfiles) || effectiveMaxPerRun,
      effectiveMaxPerRun,
      slotsRemaining
    )

    // ---- Build search queries ----
    const keywordStr = keywords.map((k: string) => `"${k}"`).join(' ')
    const queries    = jobTitles.map((title: string) =>
      `site:linkedin.com/in "${title}"${keywordStr ? ' ' + keywordStr : ''}`
    )

    // ---- Run Google Search scraper ----
    const apifyRunResp = await fetch(
      'https://api.apify.com/v2/acts/apify~google-search-scraper/runs?waitForFinish=120',
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${APIFY_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries: queries.join('\n'),
          maxPagesPerQuery: 3,
          resultsPerPage: 10,
          proxy: { useApifyProxy: true },
        }),
      }
    )

    if (!apifyRunResp.ok) {
      return NextResponse.json({ error: `Apify error: ${await apifyRunResp.text()}` }, { status: 500 })
    }

    const apifyData = await apifyRunResp.json()
    const datasetId = apifyData?.data?.defaultDatasetId

    if (!datasetId) {
      return NextResponse.json({ error: 'Apify run did not produce a dataset.' }, { status: 500 })
    }

    // ---- Fetch dataset items ----
    const itemsResp = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?format=json&clean=true`,
      { headers: { 'Authorization': `Bearer ${APIFY_TOKEN}` } }
    )
    const items = await itemsResp.json()

    // ---- Extract LinkedIn profile URLs ----
    const profilePattern = /https?:\/\/(?:www\.|[a-z]{2}\.)?linkedin\.com\/in\/([a-zA-Z0-9_-]+)/gi
    const discovered: { profileUrl: string; name: string; snippet: string }[] = []
    const seen = new Set<string>()

    for (const item of (Array.isArray(items) ? items : [])) {
      for (const result of (item.organicResults || [])) {
        const rawUrl: string = result.url || ''
        const match = profilePattern.exec(rawUrl)
        profilePattern.lastIndex = 0
        if (match) {
          const slug = match[1].toLowerCase()
          if (!seen.has(slug)) {
            seen.add(slug)
            discovered.push({
              profileUrl: `https://www.linkedin.com/in/${slug}/`,
              name:       result.title       || slug,
              snippet:    result.description || '',
            })
          }
        }
        if (discovered.length >= cap) break
      }
      if (discovered.length >= cap) break
    }

    if (!discovered.length) {
      return NextResponse.json({ added: 0, skipped: 0, profiles: [], message: 'No LinkedIn profiles found. Try different keywords or job titles.' })
    }

    // ---- Fetch existing profile URLs from Airtable (dedup, paginated) ----
    // Paginates so tenants with >100 profiles don't get duplicates added.
    const existingSlugs = new Set<string>()
    {
      let dedupOffset: string | undefined
      do {
        const existingUrl = new URL(`https://api.airtable.com/v0/${SHARED_BASE}/${encodeURIComponent(TABLE)}`)
        existingUrl.searchParams.set('filterByFormula', tenantFilter(tenantId))
        existingUrl.searchParams.set('fields[]', 'Profile URL')
        existingUrl.searchParams.set('pageSize', '100')
        if (dedupOffset) existingUrl.searchParams.set('offset', dedupOffset)

        const existingResp = await fetch(existingUrl.toString(), { headers: { Authorization: `Bearer ${PROV_TOKEN}` } })
        const existingData = await existingResp.json()
        for (const r of (existingData.records || [])) {
          const u: string = r.fields?.['Profile URL'] || ''
          const m = u.match(/linkedin\.com\/in\/([^/?&\s]+)/)
          if (m) existingSlugs.add(m[1].toLowerCase())
        }
        dedupOffset = existingData.offset
      } while (dedupOffset)
    }

    // ---- Save new profiles to Airtable ----
    const toAdd = discovered.filter(p => {
      const m    = p.profileUrl.match(/linkedin\.com\/in\/([^/?&\s]+)/)
      const slug = m ? m[1].toLowerCase() : ''
      return slug && !existingSlugs.has(slug)
    })

    const today     = new Date().toISOString().split('T')[0]
    const batchSize = 10
    const addedProfiles: any[] = []

    for (let i = 0; i < toAdd.length; i += batchSize) {
      const batch = toAdd.slice(i, i + batchSize)

      // airtableCreate only handles one record at a time; batch via direct fetch
      const records = batch.map(p => ({
        fields: {
          'Name':        p.name,
          'Profile URL': p.profileUrl,
          'Active':      true,
          'Source':      'discovered',
          'Notes':       p.snippet?.slice(0, 200) || '',
          'Added Date':  today,
          'Tenant ID':   tenantId,
        }
      }))

      const saveResp = await fetch(
        `https://api.airtable.com/v0/${SHARED_BASE}/${encodeURIComponent(TABLE)}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${PROV_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ records }),
        }
      )

      if (saveResp.ok) {
        const saved = await saveResp.json()
        addedProfiles.push(...(saved.records || []).map((r: any) => ({
          id:         r.id,
          name:       r.fields['Name'],
          profileUrl: r.fields['Profile URL'],
          active:     true,
          source:     'discovered',
        })))
      }
    }

    // ── Record timestamp so cooldown kicks in on next call ────────────────────
    if (discovery?.recordId) {
      await recordDiscoveryTimestamp(discovery.recordId)
    }

    return NextResponse.json({
      added:    addedProfiles.length,
      skipped:  discovered.length - toAdd.length,
      profiles: addedProfiles,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
