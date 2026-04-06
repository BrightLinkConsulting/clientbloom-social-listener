/**
 * api/engagement-history/route.ts
 *
 * Stores and retrieves daily engagement snapshots for the Momentum sparkline.
 * Each snapshot is a cumulative total for that day — the chart computes deltas.
 * Snapshots are stored as a JSON blob in the Business Profile Airtable record.
 */

import { NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import { airtableList, airtableUpdate, airtableCreate } from '@/lib/airtable'

const TABLE   = 'Business Profile'
const MAX_DAYS = 30

export interface DaySnapshot {
  date:     string  // YYYY-MM-DD (local date when snapshot was recorded)
  surfaced: number  // cumulative posts surfaced (all statuses)
  engaged:  number  // cumulative Engaged count
  replied:  number  // cumulative Replied count
  crm:      number  // cumulative CRM count
}

function todayKey(): string {
  // Use LA timezone so the snapshot date matches the user's day
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }) // YYYY-MM-DD
}

// ── GET — return history array ─────────────────────────────────────────────────

export async function GET() {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()

  try {
    const res    = await airtableList(TABLE, tenant.tenantId, { maxRecords: '1' })
    const data   = await res.json()
    const fields = data.records?.[0]?.fields || {}
    const raw    = fields['Momentum History'] || '[]'

    let history: DaySnapshot[] = []
    try { history = JSON.parse(raw) } catch { history = [] }

    return NextResponse.json({ history })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ── POST — upsert today's snapshot ───────────────────────────────────────────

export async function POST(req: Request) {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()

  try {
    const body = await req.json()
    const snapshot: DaySnapshot = {
      date:     todayKey(),
      surfaced: Number(body.surfaced) || 0,
      engaged:  Number(body.engaged)  || 0,
      replied:  Number(body.replied)  || 0,
      crm:      Number(body.crm)      || 0,
    }

    // Read existing history
    const existing = await (await airtableList(TABLE, tenant.tenantId, { maxRecords: '1' })).json()
    const rec      = existing.records?.[0]
    const raw      = rec?.fields?.['Momentum History'] || '[]'
    let history: DaySnapshot[] = []
    try { history = JSON.parse(raw) } catch { history = [] }

    // Upsert today
    const idx = history.findIndex(d => d.date === snapshot.date)
    if (idx >= 0) {
      history[idx] = snapshot
    } else {
      history.push(snapshot)
    }

    // Sort and trim to MAX_DAYS
    history = history
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-MAX_DAYS)

    const fields = { 'Momentum History': JSON.stringify(history) }

    if (rec) {
      await airtableUpdate(TABLE, rec.id, fields)
    } else {
      await airtableCreate(TABLE, tenant.tenantId, fields)
    }

    return NextResponse.json({ success: true, history })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
