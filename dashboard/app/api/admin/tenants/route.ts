/**
 * /api/admin/tenants
 *
 * Admin-only tenant management API.
 * Requires the requester to be signed in AND have isAdmin=true in their session.
 *
 * GET    — list all tenants from Platform Airtable
 * POST   — create a new tenant (hashes password server-side)
 * PATCH  — update tenant (status, company name, base ID, token, role, etc.)
 * DELETE — permanently delete a tenant record
 */

import { NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import bcrypt from 'bcryptjs'

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN  || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const TENANTS_TABLE  = 'Tenants'

const BASE_URL = () =>
  `https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent(TENANTS_TABLE)}`

const HEADERS = () => ({
  'Authorization': `Bearer ${PLATFORM_TOKEN}`,
  'Content-Type':  'application/json',
})

function isPlatformConfigured() {
  return !!(PLATFORM_TOKEN && PLATFORM_BASE)
}

// ── GET — list all tenants ────────────────────────────────────────────────────
export async function GET() {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()
  if (!tenant.isAdmin) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }
  if (!isPlatformConfigured()) {
    return NextResponse.json({ error: 'Platform Airtable not configured.' }, { status: 500 })
  }

  try {
    const all: any[] = []
    let offset: string | undefined

    do {
      const url = new URL(BASE_URL())
      url.searchParams.set('pageSize', '100')
      url.searchParams.set('sort[0][field]', 'Company Name')
      url.searchParams.set('sort[0][direction]', 'asc')
      if (offset) url.searchParams.set('offset', offset)

      const resp = await fetch(url.toString(), { headers: HEADERS() })
      if (!resp.ok) return NextResponse.json({ error: await resp.text() }, { status: resp.status })

      const data = await resp.json()
      all.push(...(data.records || []))
      offset = data.offset
    } while (offset)

    const tenants = all.map((r: any) => ({
      id:             r.id,
      email:          r.fields['Email']               || '',
      companyName:    r.fields['Company Name']         || '',
      airtableBaseId: r.fields['Airtable Base ID']    || '',
      // Never expose raw tokens or password hash — only existence flags
      hasToken:       !!(r.fields['Airtable API Token']),
      hasApifyKey:    !!(r.fields['Apify API Key']),
      status:         r.fields['Status']              || 'Active',
      isAdmin:        r.fields['Is Admin']            ?? false,
      isFeedOnly:     r.fields['Is Feed Only']        ?? false,
      plan:           r.fields['Plan']                || '',
      createdAt:      r.fields['Created At']          || '',
      trialEndsAt:    r.fields['Trial Ends At']       || null,
    }))

    return NextResponse.json({ tenants })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ── POST — create a new tenant ────────────────────────────────────────────────
export async function POST(req: Request) {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()
  if (!tenant.isAdmin) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }
  if (!isPlatformConfigured()) {
    return NextResponse.json({ error: 'Platform Airtable not configured.' }, { status: 500 })
  }

  try {
    const { email, password, companyName, airtableBaseId, airtableToken, plan, isAdmin } = await req.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'email and password are required.' },
        { status: 400 }
      )
    }

    const passwordHash = await bcrypt.hash(password, 12)

    const fields: Record<string, any> = {
      'Email':         email.toLowerCase(),
      'Password Hash': passwordHash,
      'Company Name':  companyName || email,
      'Status':        'Active',
      'Created At':    new Date().toISOString().split('T')[0],
    }
    if (airtableBaseId?.trim()) fields['Airtable Base ID']   = airtableBaseId.trim()
    if (airtableToken?.trim())  fields['Airtable API Token'] = airtableToken.trim()
    if (plan)                   fields['Plan']               = plan
    if (isAdmin === true)       fields['Is Admin']           = true

    const resp = await fetch(BASE_URL(), {
      method: 'POST',
      headers: HEADERS(),
      body: JSON.stringify({ records: [{ fields }] }),
    })

    if (!resp.ok) return NextResponse.json({ error: await resp.text() }, { status: resp.status })

    const data = await resp.json()
    const r    = data.records[0]

    return NextResponse.json({
      tenant: {
        id:             r.id,
        email:          r.fields['Email'],
        companyName:    r.fields['Company Name'],
        airtableBaseId: r.fields['Airtable Base ID'] || '',
        status:         r.fields['Status'],
        isAdmin:        r.fields['Is Admin'] ?? false,
      }
    }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ── PATCH — update a tenant ───────────────────────────────────────────────────
export async function PATCH(req: Request) {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()
  if (!tenant.isAdmin) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }
  if (!isPlatformConfigured()) {
    return NextResponse.json({ error: 'Platform Airtable not configured.' }, { status: 500 })
  }

  try {
    const {
      id, status, companyName, airtableBaseId, airtableToken,
      password, plan, isAdmin, isFeedOnly, apifyKey,
    } = await req.json()

    if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })

    const fields: Record<string, any> = {}
    if (status         !== undefined) fields['Status']              = status
    if (companyName    !== undefined) fields['Company Name']        = companyName
    if (airtableBaseId !== undefined) fields['Airtable Base ID']    = airtableBaseId
    if (airtableToken  !== undefined) fields['Airtable API Token']  = airtableToken
    if (plan           !== undefined) fields['Plan']                = plan
    if (isAdmin        !== undefined) fields['Is Admin']            = isAdmin
    if (isFeedOnly     !== undefined) fields['Is Feed Only']        = isFeedOnly
    // apifyKey: empty string = clear (revert to shared pool), truthy string = set custom key
    if (apifyKey !== undefined) fields['Apify API Key'] = apifyKey || null

    // Reset password if provided
    if (password) {
      fields['Password Hash'] = await bcrypt.hash(password, 12)
    }

    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
    }

    const resp = await fetch(`${BASE_URL()}/${id}`, {
      method: 'PATCH',
      headers: HEADERS(),
      body: JSON.stringify({ fields }),
    })

    if (!resp.ok) return NextResponse.json({ error: await resp.text() }, { status: resp.status })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ── DELETE — remove a tenant ──────────────────────────────────────────────────
export async function DELETE(req: Request) {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()
  if (!tenant.isAdmin) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }
  if (!isPlatformConfigured()) {
    return NextResponse.json({ error: 'Platform Airtable not configured.' }, { status: 500 })
  }

  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })

    const resp = await fetch(`${BASE_URL()}/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${PLATFORM_TOKEN}` },
    })

    if (!resp.ok) return NextResponse.json({ error: await resp.text() }, { status: resp.status })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
