/**
 * /api/slack-test — Server-side proxy for Slack auth.test
 * Avoids CORS errors that occur when the browser calls Slack's API directly.
 */
import { NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'

export async function POST(req: Request) {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()

  try {
    const { botToken } = await req.json()
    if (!botToken?.trim()) {
      return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 400 })
    }

    const r = await fetch('https://slack.com/api/auth.test', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken.trim()}`,
        'Content-Type': 'application/json',
      },
    })

    const data = await r.json()
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
