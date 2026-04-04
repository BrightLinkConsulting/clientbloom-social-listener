/**
 * POST /api/trigger-scan
 *
 * Manual scan triggered by the authenticated user.
 * Reads the tenant from the session and delegates to lib/scan.ts.
 */

import { NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import { runScanForTenant } from '@/lib/scan'

export const maxDuration = 60

export async function POST() {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()

  const result = await runScanForTenant(tenant.tenantId)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json(result)
}
