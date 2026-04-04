/**
 * GET /api/debug/apify
 *
 * Diagnostic endpoint — tests the Apify token and both LinkedIn actors.
 * Protected by CRON_SECRET so it's not publicly accessible.
 *
 * Returns the raw Apify response (status, body) for each actor test
 * so you can see exactly what's failing without digging through logs.
 */

import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

async function testActor(
  token: string,
  actorId: string,
  input: object,
  waitSecs = 20,
): Promise<{ status: number; ok: boolean; body: string }> {
  const safeActorId = actorId.replace('/', '~')
  const url =
    `https://api.apify.com/v2/acts/${safeActorId}/run-sync-get-dataset-items` +
    `?token=${token}&timeout=${waitSecs}&memory=256`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    let body = ''
    try { body = await res.text() } catch {}
    return { status: res.status, ok: res.ok, body: body.slice(0, 1000) }
  } catch (e: any) {
    return { status: 0, ok: false, body: `Network error: ${e.message}` }
  }
}

export async function GET(req: NextRequest) {
  // Auth guard
  const cronSecret = process.env.CRON_SECRET || ''
  if (cronSecret) {
    const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
    if (token !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const APIFY_TOKEN = process.env.APIFY_API_TOKEN || ''
  if (!APIFY_TOKEN) {
    return NextResponse.json({ error: 'APIFY_API_TOKEN not set in environment' }, { status: 500 })
  }

  // Test 1: ICP profile actor with a known public LinkedIn URL
  const icpTest = await testActor(
    APIFY_TOKEN,
    'harvestapi/linkedin-profile-posts',
    {
      profileUrls: ['https://www.linkedin.com/in/satyanadella/'],
      maxPosts: 2,
      proxy: { useApifyProxy: true },
      scrapeReactions: false,
      scrapeComments: false,
    },
    20,
  )

  // Test 2: Keyword search actor
  const keywordTest = await testActor(
    APIFY_TOKEN,
    'apimaestro/linkedin-posts-search-scraper-no-cookies',
    { searchQuery: 'business consulting', limit: 3, sort_type: 'relevance' },
    20,
  )

  // Test 3: Token validity via Apify user endpoint
  let tokenCheck: { ok: boolean; status: number; user?: string; body?: string } = { ok: false, status: 0 }
  try {
    const userRes = await fetch(`https://api.apify.com/v2/users/me?token=${APIFY_TOKEN}`)
    const userData = userRes.ok ? await userRes.json() : null
    tokenCheck = {
      ok: userRes.ok,
      status: userRes.status,
      user: userData?.data?.username,
      body: userRes.ok ? undefined : (await userRes.text?.().catch(() => '')).slice(0, 200),
    }
  } catch (e: any) {
    tokenCheck = { ok: false, status: 0, body: e.message }
  }

  return NextResponse.json({
    tokenPresent: !!APIFY_TOKEN,
    tokenPrefix: APIFY_TOKEN.slice(0, 8) + '...',
    tokenCheck,
    icpActor:    { actorId: 'harvestapi/linkedin-profile-posts',                  ...icpTest },
    keywordActor: { actorId: 'apimaestro/linkedin-posts-search-scraper-no-cookies', ...keywordTest },
  })
}
