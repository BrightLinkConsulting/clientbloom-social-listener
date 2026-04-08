/**
 * GET /api/cron/digest
 *
 * Daily Slack digest for all eligible tenants.
 * Runs at 8 AM PDT (15:00 UTC) via Vercel Cron — one hour after the morning scan.
 * Protected by CRON_SECRET bearer token.
 *
 * Eligibility: a tenant receives a digest if and only if they have either:
 *   (a) an active paid plan (Starter / Pro / Agency / Owner), or
 *   (b) an active trial (Plan = 'Trial' AND Trial Ends At is in the future).
 *
 * Trial Ends At is stored as singleLineText in Airtable, so we compare
 * in JavaScript rather than using IS_BEFORE/IS_AFTER formula functions.
 */

import { NextResponse }    from 'next/server'
import { sendDailyDigest } from '@/lib/digest'
import { isPaidPlan }      from '@/lib/tier'

export const maxDuration = 120

const PLATFORM_TOKEN   = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE_ID = process.env.PLATFORM_AIRTABLE_BASE_ID || ''

interface EligibleTenant {
  tenantId: string
  email:    string
}

async function getEligibleTenants(): Promise<EligibleTenant[]> {
  const params = new URLSearchParams({
    filterByFormula: `{Status}='Active'`,
    pageSize: '100',
  })
  params.append('fields[]', 'Tenant ID')
  params.append('fields[]', 'Email')
  params.append('fields[]', 'Plan')
  params.append('fields[]', 'Trial Ends At')

  const resp = await fetch(
    `https://api.airtable.com/v0/${PLATFORM_BASE_ID}/Tenants?${params}`,
    { headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` } }
  )
  const data = await resp.json()

  const now = new Date()

  return (data.records || [])
    .filter((rec: any) => {
      const tenantId    = rec.fields['Tenant ID'] || ''
      const plan        = rec.fields['Plan']        || ''
      const trialEndsAt = rec.fields['Trial Ends At'] || ''

      if (!tenantId) return false

      // Active paid plan — always eligible
      if (isPaidPlan(plan)) return true

      // Active trial — eligible only if not yet expired
      if (plan === 'Trial' && trialEndsAt && now <= new Date(trialEndsAt)) return true

      return false
    })
    .map((rec: any) => ({
      tenantId: rec.fields['Tenant ID'] || '',
      email:    rec.fields['Email']     || '',
    }))
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const tenants = await getEligibleTenants()
  if (tenants.length === 0) {
    return NextResponse.json({ message: 'No eligible tenants for digest', results: [] })
  }

  // Run digest for all eligible tenants in parallel
  const results = await Promise.allSettled(
    tenants.map(t => sendDailyDigest(t.tenantId))
  )

  const summary = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value
    return { tenantId: tenants[i].tenantId, sent: false, postCount: 0, error: String(r.reason) }
  })

  const sent    = summary.filter(r => r.sent).length
  const skipped = summary.filter(r => !r.sent && (r as any).skipped).length
  const failed  = summary.filter(r => !r.sent && !(r as any).skipped).length

  return NextResponse.json({
    message: `Digest complete: ${sent} sent, ${skipped} skipped, ${failed} failed`,
    results: summary,
  })
}
