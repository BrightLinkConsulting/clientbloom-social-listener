/**
 * POST /api/trigger-scan
 *
 * Manual scan triggered by the authenticated user from the dashboard.
 * Enforces trial expiry, a 30-minute per-tenant cooldown, and delegates
 * the actual scan work to lib/scan.ts.
 *
 * Access: authenticated tenants on an active paid plan or active trial only.
 * Expired trial users receive a 403 with an upgrade prompt.
 */

import { NextResponse }                 from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import { isPaidPlan }                   from '@/lib/tier'
import { runScanForTenant }             from '@/lib/scan'
import { airtableFetch }               from '@/lib/airtable'

// 90s: LinkedIn scraping + Claude scoring + Airtable saves
export const maxDuration = 90

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''

// ── Single Airtable query — fetches Apify key + cooldown timestamp together ─
interface TenantRow {
  recordId:       string
  apifyKey:       string | undefined
  lastManualScan: string | null
}

async function getTenantRow(tenantId: string): Promise<TenantRow | null> {
  if (!PLATFORM_TOKEN || !PLATFORM_BASE) return null
  try {
    const filter = tenantId === 'owner'
      ? `OR({Tenant ID}='owner',{Tenant ID}='')`
      : `{Tenant ID}='${tenantId}'`

    const url = new URL(`https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent('Tenants')}`)
    url.searchParams.set('filterByFormula', filter)
    url.searchParams.set('fields[]', 'Apify API Key')
    url.searchParams.set('fields[]', 'Last Manual Scan At')
    url.searchParams.set('maxRecords', '1')

    const resp = await airtableFetch(url.toString(), {
      headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
    })
    if (!resp.ok) return null

    const data = await resp.json()
    const rec  = data.records?.[0]
    if (!rec) return null

    return {
      recordId:       rec.id,
      apifyKey:       rec.fields?.['Apify API Key'] || undefined,
      lastManualScan: rec.fields?.['Last Manual Scan At'] || null,
    }
  } catch {
    return null
  }
}

async function recordScanTimestamp(recordId: string): Promise<void> {
  if (!PLATFORM_TOKEN || !PLATFORM_BASE) return
  try {
    await airtableFetch(
      `https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent('Tenants')}/${recordId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization:  `Bearer ${PLATFORM_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields: { 'Last Manual Scan At': new Date().toISOString() } }),
      }
    )
  } catch (e) {
    console.error('[trigger-scan] Failed to record Last Manual Scan At:', e)
  }
}

// ── Handler ───────────────────────────────────────────────────────────────
export async function POST() {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()

  // ── Plan / trial expiry gate ───────────────────────────────────────────
  // Server-side check — cannot be bypassed by calling this endpoint directly
  // with a valid session cookie. isPaidPlan covers all paid tiers; expired
  // Trial sessions are blocked regardless of session cookie validity.
  if (!isPaidPlan(tenant.plan)) {
    const trialActive =
      tenant.plan === 'Trial' &&
      tenant.trialEndsAt !== null &&
      new Date() <= new Date(tenant.trialEndsAt)

    if (!trialActive) {
      return NextResponse.json(
        { error: 'Your trial has ended. Upgrade to keep scanning.' },
        { status: 403 }
      )
    }
  }

  // ── 30-minute manual scan cooldown ────────────────────────────────────
  const row = await getTenantRow(tenant.tenantId)

  if (row?.lastManualScan) {
    const minutesSinceLast = (Date.now() - new Date(row.lastManualScan).getTime()) / 60_000
    if (minutesSinceLast < 30) {
      const waitMinutes = Math.ceil(30 - minutesSinceLast)
      return NextResponse.json(
        {
          error: `Please wait ${waitMinutes} more minute${waitMinutes === 1 ? '' : 's'} before scanning again.`,
          retryAfter: Math.ceil((30 - minutesSinceLast) * 60),
        },
        { status: 429 }
      )
    }
  }

  // ── Run scan ──────────────────────────────────────────────────────────
  // Use tenant's own Apify key if assigned by admin; otherwise use shared pool
  const result = await runScanForTenant(tenant.tenantId, row?.apifyKey, tenant.plan)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  // Record timestamp for cooldown enforcement on next call (non-fatal)
  if (row) await recordScanTimestamp(row.recordId)

  return NextResponse.json(result)
}
