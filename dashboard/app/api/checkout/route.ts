/**
 * GET/POST /api/checkout  (legacy redirect)
 *
 * This route previously created a Stripe Checkout session directly.
 * Trial entry now flows through /sign-up → /api/trial/start.
 * Paid upgrades flow through /api/billing/upgrade?tier=xxx.
 *
 * Any old bookmarks or links to /api/checkout are gracefully redirected
 * to the sign-up page so the user can choose their plan.
 */

import { NextResponse } from 'next/server'

const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL || 'https://scout.clientbloom.ai').replace(/\/$/, '')

export async function GET() {
  return NextResponse.redirect(`${BASE_URL}/sign-up`, { status: 302 })
}

export async function POST() {
  return NextResponse.redirect(`${BASE_URL}/sign-up`, { status: 302 })
}
