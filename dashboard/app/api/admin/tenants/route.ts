/**
 * /api/admin/tenants
 *
 * Admin-only tenant management API.
 * Requires the requester to be signed in AND have isAdmin=true in their session.
 *
 * GET    — list all tenants from Platform Airtable
 * POST   — create a new tenant (hashes password server-side, duplicate email guard)
 * PATCH  — update tenant (status, company name, base ID, token, role, etc.)
 *          Special action: action='archive'   → sets Status=Archived + archivedAt
 *          Special action: action='unarchive' → clears Archived status
 * DELETE — cascade-delete a tenant and ALL associated data across both Airtable bases
 *          - Shared data: Captured Posts, Sources, LinkedIn ICPs, Business Profile,
 *            Facebook Keywords, Target Groups (AIRTABLE_PROVISIONING_TOKEN)
 *          - Platform data: Scan Health, sub-accounts, Tenants row (PLATFORM_AIRTABLE_TOKEN)
 *          - Stripe: cancels active subscription before deletion
 *          - Writes an Admin Audit Log entry on completion
 */

import { NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import { cascadeDeleteTenant }          from '@/lib/cascade-delete'
import { writeAuditLog }                from '@/lib/audit-log'
import bcrypt from 'bcryptjs'

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN  || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const STRIPE_KEY     = process.env.STRIPE_SECRET_KEY         || ''
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

// ── Validation constants ──────────────────────────────────────────────────────

const VALID_STATUSES = new Set(['Active', 'Suspended', 'Archived', 'trial_expired'])
const VALID_PLANS    = new Set([
  'Trial', 'Scout Starter', 'Scout Pro', 'Scout Agency', 'Owner', 'Complimentary',
  // Legacy plan names kept for backward compatibility
  'Scout $49', 'Scout $79',
])
const VALID_APIFY_POOLS = new Set([0, 1, 2])

// ── Stripe helpers ────────────────────────────────────────────────────────────

/**
 * Cancel a Stripe subscription if one exists for this tenant.
 * Non-fatal: logs on failure but does not block the delete.
 */
async function cancelStripeSubscription(subscriptionId: string): Promise<boolean> {
  if (!STRIPE_KEY || !subscriptionId) return false

  try {
    const resp = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
      method:  'DELETE',
      headers: {
        Authorization:  `Bearer ${STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })

    if (!resp.ok) {
      const body = await resp.text()
      console.error(`[tenants/DELETE] Stripe subscription cancel failed (${resp.status}):`, body.slice(0, 200))
      return false
    }

    return true
  } catch (e: any) {
    console.error('[tenants/DELETE] Stripe cancel error:', e.message)
    return false
  }
}

// ── Duplicate email check ─────────────────────────────────────────────────────

async function emailExistsInTenants(email: string): Promise<boolean> {
  if (!PLATFORM_TOKEN || !PLATFORM_BASE) return false

  const formula = encodeURIComponent(`{Email}='${email.replace(/'/g, "\\'")}'`)
  const url = `${BASE_URL()}?filterByFormula=${formula}&maxRecords=1&fields[]=Email`

  const resp = await fetch(url, { headers: HEADERS() })
  if (!resp.ok) return false

  const data = await resp.json()
  return (data.records || []).length > 0
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
      tenantId:       r.fields['Tenant ID']           || '',
      // Never expose raw tokens or password hash — only existence flags
      hasToken:       !!(r.fields['Airtable API Token']),
      hasApifyKey:    !!(r.fields['Apify API Key']),
      // apifyPool: 0 = default shared, 1 = Pool 1, 2 = Pool 2
      apifyPool:      typeof r.fields['Apify Pool'] === 'number' ? r.fields['Apify Pool'] : 0,
      status:         r.fields['Status']              || 'Active',
      isAdmin:        r.fields['Is Admin']            ?? false,
      isFeedOnly:     r.fields['Is Feed Only']        ?? false,
      plan:           r.fields['Plan']                || '',
      createdAt:      r.fields['Created At']          || '',
      archivedAt:           r.fields['Archived At']           || null,
      trialEndsAt:          r.fields['Trial Ends At']          || null,
      reactivationSentAt:   r.fields['Reactivation Sent At']   || null,
      stripeCustomerId:     r.fields['Stripe Customer ID']     || null,
      stripeSubscriptionId: r.fields['Stripe Subscription ID'] || null,
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

    const cleanEmail = email.toLowerCase().trim()

    // Duplicate email guard
    const alreadyExists = await emailExistsInTenants(cleanEmail)
    if (alreadyExists) {
      return NextResponse.json(
        { error: `An account with email "${cleanEmail}" already exists.` },
        { status: 409 }
      )
    }

    // Plan validation
    if (plan && !VALID_PLANS.has(plan)) {
      return NextResponse.json(
        { error: `Invalid plan "${plan}". Valid values: Trial, Scout Starter, Scout Pro, Scout Agency, Owner, Complimentary.` },
        { status: 400 }
      )
    }

    const passwordHash = await bcrypt.hash(password, 12)

    const fields: Record<string, any> = {
      'Email':         cleanEmail,
      'Password Hash': passwordHash,
      'Company Name':  companyName || cleanEmail,
      'Status':        'Active',
      'Created At':    new Date().toISOString(),
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
  const caller = await getTenantConfig()
  if (!caller) return tenantError()
  if (!caller.isAdmin) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }
  if (!isPlatformConfigured()) {
    return NextResponse.json({ error: 'Platform Airtable not configured.' }, { status: 500 })
  }

  try {
    const body = await req.json()
    const {
      id, action, status, companyName, airtableBaseId, airtableToken,
      password, plan, isAdmin, isFeedOnly, apifyKey, apifyPool, reactivationSentAt,
    } = body

    if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })

    // ── Special actions: archive / unarchive ──────────────────────────────
    if (action === 'archive') {
      const now = new Date().toISOString()
      const archiveResp = await fetch(`${BASE_URL()}/${id}`, {
        method: 'PATCH',
        headers: HEADERS(),
        body: JSON.stringify({
          fields: {
            'Status':      'Archived',
            'Archived At': now,
          },
        }),
      })
      if (!archiveResp.ok) {
        return NextResponse.json({ error: await archiveResp.text() }, { status: archiveResp.status })
      }

      // Audit log (non-fatal)
      await writeAuditLog({
        eventType:       'archive_tenant',
        adminEmail:      caller.email || 'admin',
        targetRecordId:  id,
        notes:           { archivedAt: now },
      })

      return NextResponse.json({ ok: true, archivedAt: now })
    }

    if (action === 'unarchive') {
      const unarchiveResp = await fetch(`${BASE_URL()}/${id}`, {
        method: 'PATCH',
        headers: HEADERS(),
        body: JSON.stringify({
          fields: {
            'Status':      'Active',
            'Archived At': null,
          },
        }),
      })
      if (!unarchiveResp.ok) {
        return NextResponse.json({ error: await unarchiveResp.text() }, { status: unarchiveResp.status })
      }

      await writeAuditLog({
        eventType:      'unarchive_tenant',
        adminEmail:     caller.email || 'admin',
        targetRecordId: id,
      })

      return NextResponse.json({ ok: true })
    }

    // ── Standard field update ─────────────────────────────────────────────
    const fields: Record<string, any> = {}

    if (status !== undefined) {
      if (!VALID_STATUSES.has(status)) {
        return NextResponse.json(
          { error: `Invalid status "${status}". Valid values: Active, Suspended, Archived, trial_expired.` },
          { status: 400 }
        )
      }
      fields['Status'] = status
    }

    if (plan !== undefined) {
      if (plan && !VALID_PLANS.has(plan)) {
        return NextResponse.json(
          { error: `Invalid plan "${plan}". Valid values: Trial, Scout Starter, Scout Pro, Scout Agency, Owner, Complimentary.` },
          { status: 400 }
        )
      }
      fields['Plan'] = plan
    }

    if (apifyPool !== undefined) {
      const pool = typeof apifyPool === 'number' ? apifyPool : 0
      if (!VALID_APIFY_POOLS.has(pool)) {
        return NextResponse.json(
          { error: `Invalid apifyPool "${pool}". Valid values: 0, 1, 2.` },
          { status: 400 }
        )
      }
      fields['Apify Pool'] = pool
    }

    if (companyName    !== undefined) fields['Company Name']        = companyName
    if (airtableBaseId !== undefined) fields['Airtable Base ID']    = airtableBaseId
    if (airtableToken  !== undefined) fields['Airtable API Token']  = airtableToken
    if (isAdmin        !== undefined) fields['Is Admin']            = isAdmin
    if (isFeedOnly     !== undefined) fields['Is Feed Only']        = isFeedOnly
    // apifyKey: empty string = clear (revert to shared pool), truthy = set custom key
    if (apifyKey       !== undefined) fields['Apify API Key']       = apifyKey || null
    if (reactivationSentAt !== undefined) fields['Reactivation Sent At'] = reactivationSentAt || null

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

    // Audit log for status changes
    if (fields['Status']) {
      await writeAuditLog({
        eventType:      'status_change',
        adminEmail:     caller.email || 'admin',
        targetRecordId: id,
        notes:          { newStatus: fields['Status'] },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ── DELETE — cascade-delete a tenant ─────────────────────────────────────────
export async function DELETE(req: Request) {
  const caller = await getTenantConfig()
  if (!caller) return tenantError()
  if (!caller.isAdmin) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }
  if (!isPlatformConfigured()) {
    return NextResponse.json({ error: 'Platform Airtable not configured.' }, { status: 500 })
  }

  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })

    // Fetch the target tenant to get tenantId, Stripe IDs, and sub-account status
    const fetchResp = await fetch(`${BASE_URL()}/${id}`, { headers: HEADERS() })
    if (!fetchResp.ok) {
      if (fetchResp.status === 404) return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 })
      return NextResponse.json({ error: await fetchResp.text() }, { status: fetchResp.status })
    }

    const record   = await fetchResp.json()
    const fields   = record.fields || {}
    const tenantId = fields['Tenant ID']           || ''
    const email    = fields['Email']               || ''
    const plan     = fields['Plan']                || ''
    const subId    = fields['Stripe Subscription ID'] || ''
    const isOwner  = fields['Is Admin']            === true

    // Self-delete guard — compare against caller's email (getTenantConfig has no .id field)
    if (email && caller.email && email.toLowerCase() === caller.email.toLowerCase()) {
      return NextResponse.json(
        { error: 'You cannot delete your own account.' },
        { status: 403 }
      )
    }

    // Owner protection — cannot hard-delete an owner/admin account from the UI
    if (isOwner) {
      return NextResponse.json(
        { error: 'Cannot delete an admin/owner account. Revoke admin access first.' },
        { status: 403 }
      )
    }

    // ── Stripe cancellation (before data wipe) ────────────────────────────
    let stripeCancelled = false
    if (subId) {
      stripeCancelled = await cancelStripeSubscription(subId)
      console.log(`[tenants/DELETE] Stripe sub ${subId} cancelled: ${stripeCancelled}`)
    }

    // ── Cascade delete ────────────────────────────────────────────────────
    if (!tenantId) {
      // No Tenant ID means the account was never fully provisioned.
      // Only the Tenants row needs to be removed.
      const resp = await fetch(`${BASE_URL()}/${id}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
      })
      if (!resp.ok) return NextResponse.json({ error: await resp.text() }, { status: resp.status })

      await writeAuditLog({
        eventType:       'hard_delete_tenant',
        adminEmail:      caller.email || 'admin',
        targetEmail:     email,
        targetRecordId:  id,
        notes:           { reason: 'No tenantId — only Tenants row removed', stripeCancelled },
      })

      return NextResponse.json({ ok: true, cascade: null, stripeCancelled })
    }

    const result = await cascadeDeleteTenant(id, tenantId, true)

    // Audit log (non-fatal regardless of cascade errors)
    await writeAuditLog({
      eventType:       'hard_delete_tenant',
      adminEmail:      caller.email || 'admin',
      targetEmail:     email,
      targetTenantId:  tenantId,
      targetRecordId:  id,
      notes:           {
        stripeCancelled,
        cascade: {
          tables:           result.tables,
          scanHealthDeleted: result.scanHealthDeleted,
          subAccountsDeleted: result.subAccountsDeleted,
          tenantRowDeleted:  result.tenantRowDeleted,
          errors:           result.errors,
          durationMs:       result.durationMs,
        },
      },
    })

    return NextResponse.json({
      ok:             result.tenantRowDeleted,
      cascade:        result,
      stripeCancelled,
      errors:         result.errors.length > 0 ? result.errors : undefined,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
