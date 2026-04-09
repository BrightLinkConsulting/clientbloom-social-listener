/**
 * GET /api/scan-status
 *
 * Returns the current scan health for the authenticated tenant.
 * Used by the feed to display "Last scan: X ago ✓" or a warning badge.
 *
 * Response:
 * {
 *   lastScanAt:     ISO string | null,
 *   lastScanStatus: "success" | "partial" | "failed" | null,
 *   lastPostsFound: number,
 *   lastScanSource: string | null,
 *   lastError:      string | null
 * }
 */

import { NextResponse }   from 'next/server'
import { getTenantConfig } from '@/lib/tenant'
import { getScanHealth }   from '@/lib/scan-health'

export async function GET() {
  const tenant = await getTenantConfig()
  if (!tenant) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const health = await getScanHealth(tenant.tenantId)

  if (!health) {
    // Scan Health table may not be set up yet — return null state gracefully
    return NextResponse.json({
      lastScanAt:     null,
      lastScanStatus: null,
      lastPostsFound: 0,
      lastScanSource: null,
      lastError:      null,
    })
  }

  return NextResponse.json({
    lastScanAt:     health.lastScanAt,
    lastScanStatus: health.lastScanStatus,
    lastPostsFound: health.lastPostsFound,
    lastScanSource: health.lastScanSource,
    lastError:      health.lastError,
  })
}
