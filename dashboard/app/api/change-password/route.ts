/**
 * POST /api/change-password
 *
 * Allows an authenticated tenant to change their own password.
 *
 * Body: { currentPassword: string, newPassword: string }
 *
 * Steps:
 *   1. Verify session (tenant must be logged in)
 *   2. Look up their Tenants record in Platform Airtable
 *   3. Compare currentPassword against stored bcrypt hash
 *   4. Hash newPassword and PATCH the Tenants record
 *
 * Returns: { ok: true } on success
 * Returns: { error: string } on failure
 */

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getTenantConfig, tenantError } from '@/lib/tenant'

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const TENANTS_TABLE  = 'Tenants'

async function getTenantRecord(email: string) {
  if (!PLATFORM_TOKEN || !PLATFORM_BASE) return null
  const url =
    `https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent(TENANTS_TABLE)}` +
    `?filterByFormula=${encodeURIComponent(`{Email}='${email.toLowerCase()}'`)}&maxRecords=1`

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
  })
  if (!resp.ok) return null
  const data = await resp.json()
  return data.records?.[0] || null
}

async function updatePasswordHash(recordId: string, passwordHash: string) {
  const resp = await fetch(
    `https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent(TENANTS_TABLE)}/${recordId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${PLATFORM_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields: { 'Password Hash': passwordHash } }),
    }
  )
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Airtable update failed: ${err}`)
  }
  return resp.json()
}

export async function POST(req: NextRequest) {
  // 1. Auth check
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()

  // 2. Parse request body
  let body: { currentPassword?: string; newPassword?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { currentPassword, newPassword } = body

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: 'currentPassword and newPassword are required.' },
      { status: 400 }
    )
  }

  // Basic new password validation
  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: 'New password must be at least 8 characters.' },
      { status: 400 }
    )
  }

  if (newPassword === currentPassword) {
    return NextResponse.json(
      { error: 'New password must be different from your current password.' },
      { status: 400 }
    )
  }

  if (!PLATFORM_TOKEN || !PLATFORM_BASE) {
    return NextResponse.json(
      { error: 'Platform not configured — contact support.' },
      { status: 500 }
    )
  }

  // 3. Look up tenant record by email to get current hash
  const record = await getTenantRecord(tenant.email)
  if (!record) {
    return NextResponse.json(
      { error: 'Account not found.' },
      { status: 404 }
    )
  }

  const storedHash = record.fields?.['Password Hash'] || ''

  // 4. Verify current password
  const valid = await bcrypt.compare(currentPassword, storedHash)
  if (!valid) {
    return NextResponse.json(
      { error: 'Current password is incorrect.' },
      { status: 401 }
    )
  }

  // 5. Hash new password and save
  try {
    const newHash = await bcrypt.hash(newPassword, 12)
    await updatePasswordHash(record.id, newHash)
  } catch (e: any) {
    console.error('[change-password] Failed to update hash:', e.message)
    return NextResponse.json(
      { error: 'Failed to save new password. Please try again.' },
      { status: 500 }
    )
  }

  console.log(`[change-password] Password updated for tenant ${tenant.tenantId} (${tenant.email})`)
  return NextResponse.json({ ok: true })
}
