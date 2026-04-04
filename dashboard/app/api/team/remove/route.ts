/**
 * DELETE /api/team/remove
 *
 * Admin-only. Removes a feed-only team member by their Airtable record ID.
 * Verifies the record belongs to the calling tenant before deleting.
 *
 * Body: { recordId: string }
 */

import { NextResponse }              from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''

export async function DELETE(req: Request) {
  const caller = await getTenantConfig()
  if (!caller) return tenantError()

  if ((caller as any).isFeedOnly) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  if (!PLATFORM_TOKEN || !PLATFORM_BASE) {
    return NextResponse.json({ error: 'Platform Airtable not configured.' }, { status: 500 })
  }

  try {
    const { recordId } = await req.json()
    if (!recordId) return NextResponse.json({ error: 'recordId is required.' }, { status: 400 })

    // Verify the record belongs to this tenant and is feed-only before deleting
    const verifyResp = await fetch(
      `https://api.airtable.com/v0/${PLATFORM_BASE}/Tenants/${recordId}`,
      { headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` } }
    )

    if (!verifyResp.ok) {
      return NextResponse.json({ error: 'Member record not found.' }, { status: 404 })
    }

    const record = await verifyResp.json()
    const fields = record.fields || {}

    if (fields['Tenant ID'] !== caller.tenantId) {
      return NextResponse.json({ error: 'Not authorized to remove this member.' }, { status: 403 })
    }
    if (!fields['Is Feed Only']) {
      return NextResponse.json({ error: 'Cannot remove the account owner.' }, { status: 403 })
    }

    // Delete the record
    const deleteResp = await fetch(
      `https://api.airtable.com/v0/${PLATFORM_BASE}/Tenants/${recordId}`,
      {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
      }
    )

    if (!deleteResp.ok) {
      const body = await deleteResp.text()
      return NextResponse.json({ error: `Airtable error: ${body.slice(0, 200)}` }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
