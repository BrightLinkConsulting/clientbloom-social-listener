/**
 * Tenant configuration helper.
 *
 * Call getTenantConfig() at the top of every API route handler to obtain
 * the current tenant's identity from their session.
 *
 * The tenantId is used for row-level data isolation in the shared Airtable base.
 * All data access goes through lib/airtable.ts using the platform provisioning token.
 */

import { getServerSession } from 'next-auth/next'
import { NextResponse }     from 'next/server'
import { authOptions }      from './auth'

export interface TenantConfig {
  tenantId:       string   // Row-level isolation key (e.g. 'owner', 't_a3f8c2d9')
  isAdmin:        boolean
  email:          string
  // Legacy fields — kept for any routes that haven't migrated yet
  airtableToken:  string
  airtableBaseId: string
}

export async function getTenantConfig(): Promise<TenantConfig | null> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null

  const user = session.user as any
  return {
    tenantId:       user.tenantId      || 'owner',   // fallback for existing admin session
    isAdmin:        user.isAdmin       ?? false,
    email:          user.email         || '',
    airtableToken:  user.airtableToken  || '',
    airtableBaseId: user.airtableBaseId || '',
  }
}

/** Standard 401 response for unauthenticated API calls. */
export function tenantError() {
  return NextResponse.json({ error: 'Unauthorized — please sign in.' }, { status: 401 })
}
