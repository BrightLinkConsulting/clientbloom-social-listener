/**
 * GET  /api/sources — List all keyword sources for the authenticated tenant.
 * POST /api/sources — Add a new keyword source, subject to plan tier limits.
 *
 * Server-side limit enforcement: the POST handler counts existing sources before
 * creating a new one. This prevents UI-bypass attacks where a tenant calls this
 * endpoint directly with a valid session cookie to exceed their plan's keyword limit.
 */

import { NextResponse }                                          from 'next/server'
import { getTenantConfig, tenantError }                         from '@/lib/tenant'
import { airtableList, airtableCreate, SHARED_BASE, PROV_TOKEN, tenantFilter } from '@/lib/airtable'
import { getTierLimits }                                        from '@/lib/tier'

const TABLE = 'Sources'

// ── Count existing keyword sources for a tenant ───────────────────────────
// Used to enforce the plan's keyword limit before allowing a new source to be added.
async function countKeywordSources(tenantId: string): Promise<number> {
  const url = new URL(`https://api.airtable.com/v0/${SHARED_BASE}/${encodeURIComponent(TABLE)}`)
  url.searchParams.set(
    'filterByFormula',
    `AND(${tenantFilter(tenantId)},{Type}='linkedin_term')`
  )
  url.searchParams.set('fields[]', 'Type')
  url.searchParams.set('pageSize', '100')

  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${PROV_TOKEN}` },
    cache: 'no-store',
  })
  if (!resp.ok) throw new Error(`Airtable count failed: ${resp.status}`)

  const data = await resp.json()
  return (data.records ?? []).length
}

// ── GET — list all sources ────────────────────────────────────────────────
export async function GET() {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()
  const { tenantId } = tenant

  const url = new URL(`https://api.airtable.com/v0/${SHARED_BASE}/${encodeURIComponent(TABLE)}`)
  url.searchParams.set('filterByFormula', tenantFilter(tenantId))
  url.searchParams.set('sort[0][field]', 'Type')
  url.searchParams.set('sort[0][direction]', 'asc')
  url.searchParams.set('sort[1][field]', 'Priority')
  url.searchParams.set('sort[1][direction]', 'asc')

  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${PROV_TOKEN}` },
    cache: 'no-store',
  })

  if (!resp.ok) return NextResponse.json({ error: await resp.text() }, { status: resp.status })

  const data = await resp.json()
  const sources = data.records.map((r: any) => ({
    id:       r.id,
    name:     r.fields.Name     || '',
    type:     r.fields.Type     || '',
    value:    r.fields.Value    || '',
    active:   r.fields.Active   === true,
    priority: r.fields.Priority || 'medium',
  }))

  return NextResponse.json({ sources })
}

// ── POST — add a new source ───────────────────────────────────────────────
export async function POST(request: Request) {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()
  const { tenantId, plan } = tenant

  const body = await request.json()
  const { name, type, value, priority } = body

  if (!name || !type || !value) {
    return NextResponse.json({ error: 'name, type, and value are required' }, { status: 400 })
  }
  if (type !== 'linkedin_term') {
    return NextResponse.json({ error: 'type must be linkedin_term' }, { status: 400 })
  }

  // ── Plan limit enforcement ────────────────────────────────────────────
  // Count current sources server-side before allowing the create. This prevents
  // UI-bypass: a tenant calling this endpoint directly cannot exceed their limit.
  const { keywords: keywordLimit } = getTierLimits(plan)
  try {
    const currentCount = await countKeywordSources(tenantId)
    if (currentCount >= keywordLimit) {
      return NextResponse.json(
        {
          error:   `You've reached the source limit for your plan. Upgrade to add more.`,
          limit:   keywordLimit,
          current: currentCount,
        },
        { status: 429 }
      )
    }
  } catch (e: any) {
    console.error('[sources] Count check failed:', e.message)
    return NextResponse.json(
      { error: 'Could not verify plan limits. Please try again.' },
      { status: 503 }
    )
  }

  // ── Create ────────────────────────────────────────────────────────────
  const resp = await airtableCreate(TABLE, tenantId, {
    Name: name, Type: type, Value: value, Active: true, Priority: priority || 'medium',
  })

  if (!resp.ok) return NextResponse.json({ error: await resp.text() }, { status: resp.status })

  const data = await resp.json()
  const r = data.records[0]
  return NextResponse.json(
    {
      source: {
        id:       r.id,
        name:     r.fields.Name,
        type:     r.fields.Type,
        value:    r.fields.Value,
        active:   r.fields.Active === true,
        priority: r.fields.Priority || 'medium',
      },
    },
    { status: 201 }
  )
}
