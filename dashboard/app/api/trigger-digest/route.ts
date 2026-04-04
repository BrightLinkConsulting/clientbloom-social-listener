/**
 * /api/trigger-digest — Manual digest trigger for testing.
 * POST with no body — sends the digest for the authenticated tenant immediately.
 * Used by the admin panel "Send Test Digest" button.
 */

import { NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import { sendDailyDigest } from '@/lib/digest'

export const maxDuration = 60

export async function POST() {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()

  const result = await sendDailyDigest(tenant.tenantId)

  if (result.skipped === 'no_slack_config') {
    return NextResponse.json(
      { error: 'No Slack bot token configured. Go to Settings → System to connect Slack first.' },
      { status: 400 }
    )
  }
  if (result.skipped === 'no_channel_id') {
    return NextResponse.json(
      { error: 'Slack channel ID is missing. Add the Channel ID in Settings → System.' },
      { status: 400 }
    )
  }
  if (!result.sent) {
    return NextResponse.json(
      { error: `Slack returned an error: ${result.error}` },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success:   true,
    postCount: result.postCount,
    message:   result.postCount > 0
      ? `Digest sent with ${result.postCount} post${result.postCount !== 1 ? 's' : ''}.`
      : 'Digest sent (no matching posts in the last 24 hours — quiet day notice delivered).',
  })
}
