/**
 * POST /api/auth/reset-password
 *
 * Completes password reset flow.
 * 1. Validates reset token (hash comparison + expiry check)
 * 2. Hashes new password with bcryptjs
 * 3. Updates tenant record in Airtable
 * 4. Clears reset token fields
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN || ''
const PLATFORM_BASE = process.env.PLATFORM_AIRTABLE_BASE_ID || ''

async function findTenantByEmail(email: string) {
  if (!PLATFORM_TOKEN || !PLATFORM_BASE) return null

  const url =
    `https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent('Tenants')}` +
    `?filterByFormula=${encodeURIComponent(`{Email}='${email.toLowerCase().replace(/'/g, "\\'")}'`)}&maxRecords=1`

  try {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
    })
    if (!resp.ok) return null
    const data = await resp.json()
    return data.records?.[0] || null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const { token, email, newPassword } = await req.json()

  if (!token || !email || !newPassword) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (newPassword.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  try {
    // Find tenant
    const tenantRecord = await findTenantByEmail(email)
    if (!tenantRecord) {
      return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 })
    }

    const fields = tenantRecord.fields || {}
    const storedHashedToken = fields['Password Reset Token'] || ''
    const expiresAt = fields['Password Reset Expires At']

    // Validate token
    const incomingHashedToken = crypto.createHash('sha256').update(token).digest('hex')

    if (incomingHashedToken !== storedHashedToken) {
      return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 })
    }

    // Check expiry
    if (expiresAt && new Date(expiresAt) < new Date()) {
      return NextResponse.json({ error: 'Reset link has expired' }, { status: 400 })
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10)

    // Update tenant with new password and clear reset fields
    await fetch(
      `https://api.airtable.com/v0/${PLATFORM_BASE}/Tenants/${tenantRecord.id}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${PLATFORM_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: {
            'Password Hash': passwordHash,
            'Password Reset Token': '', // Clear the token
            'Password Reset Expires At': null,
          }
        })
      }
    )

    return NextResponse.json({
      success: true,
      message: 'Password updated successfully. You can now log in with your new password.'
    })
  } catch (e: any) {
    console.error('[reset-password] Error:', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
