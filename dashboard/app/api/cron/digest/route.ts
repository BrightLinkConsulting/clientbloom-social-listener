/**
 * /api/cron/digest — Daily Slack digest for all active tenants.
 * Runs at 7 AM PDT (15:00 UTC) via Vercel Cron, one hour after the morning scan.
 * Protected by CRON_SECRET bearer token.
 */

import { NextResponse } from 'next/server'
import { sendDailyDigest } from '@/lib/digest'

export const maxDuration = 120

const PLATFORM_TOKEN   = process.env.PLATFORM_AIRTABLE_TOKEN  || ''
const PLATFORM_BASE_ID = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const CRON_SECRET      = process.env.CRON_SECRET || ''

async function getActiveTenants(): Promise<{ tenantId: string; email: string }[]> {
  const params = new URLSearchParams({
    filterByFormula: `{Status}='Active'`,
    'fields[]':  'Tenant ID',
    'fields[1]': 'Email',
    pageSize: '100',
  })
  const r = await fetch(
    `https://api.airtable.com/v0/${PLATFORM_BASE_ID}/Tenants?${params}`,
    { headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` } }
  )
  const data = await r.json()
  return (data.records || []).map((rec: any) => ({
    tenantId: rec.fields['Tenant ID'] || '',
    email:    rec.fields['Email']     || '',
  })).filter((t: any) => !!t.tenantId)
}

export async function GET(req: Request) {
  // Auth check
  const auth = req.headers.get('authorization') || ''
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenants = await getActiveTenants()
  if (tenants.length === 0) {
    return NextResponse.json({ message: 'No active tenants', results: [] })
  }

  // Run digest for all tenants in parallel
  const results = await Promise.allSettled(
    tenants.map(t => sendDailyDigest(t.tenantId))
  )

  const summary = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value
    return { tenantId: tenants[i].tenantId, sent: false, postCount: 0, error: String(r.reason) }
  })

  const sent    = summary.filter(r => r.sent).length
  const skipped = summary.filter(r => !r.sent && r.skipped).length
  const failed  = summary.filter(r => !r.sent && !r.skipped).length

  return NextResponse.json({
    message: `Digest complete: ${sent} sent, ${skipped} skipped, ${failed} failed`,
    results: summary,
  })
}
