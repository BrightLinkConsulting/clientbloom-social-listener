/**
 * lib/tenant.ts — Tenant session helper.
 *
 * Call getTenantConfig() at the top of every authenticated API route handler
 * to obtain the current tenant's identity and plan from their JWT session.
 *
 * The tenantId field is the row-level isolation key used throughout the
 * shared Airtable base. All Airtable queries are scoped to this key via
 * tenantFilter() in lib/airtable.ts — no tenant can ever read or write
 * another tenant's records.
 *
 * plan and trialEndsAt are exposed here so every API route can enforce
 * access control without a separate Airtable lookup on each request.
 */

import { getServerSession } from 'next-auth/next'
import { NextResponse }     from 'next/server'
import { authOptions }      from './auth'

export interface TenantConfig {
  tenantId:       string         // Row-level isolation key (e.g. 'owner', 't_a3f8c2d9')
  isAdmin:        boolean
  email:          string
  plan:           string         // 'Trial' | 'Scout Starter' | 'Scout Pro' | 'Scout Agency' | 'Owner'
  trialEndsAt:    string | null  // ISO date string or null for paid plans
  airtableToken:  string
  airtableBaseId: string
}

export async function getTenantConfig(): Promise<TenantConfig | null> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null

  const user = session.user as any
  return {
    tenantId:       user.tenantId       || 'owner',
    isAdmin:        user.isAdmin        ?? false,
    email:          user.email          || '',
    plan:           user.plan           || '',
    trialEndsAt:    user.trialEndsAt    || null,
    airtableToken:  user.airtableToken  || '',
    airtableBaseId: user.airtableBaseId || '',
  }
}

/** Standard 401 response for unauthenticated API calls. */
export function tenantError() {
  return NextResponse.json({ error: 'Unauthorized — please sign in.' }, { status: 401 })
}
