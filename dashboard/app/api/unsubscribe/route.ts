/**
 * GET /api/unsubscribe?email=...
 *
 * CAN-SPAM compliant unsubscribe endpoint.
 * Sets "Email Opted Out" = true on the tenant record.
 * Returns a plain HTML confirmation page — no login required.
 *
 * The trial-check cron respects the opted-out flag by skipping
 * sequence emails for opted-out tenants.
 *
 * NOTE: This only opts out of marketing / trial sequence emails.
 * Transactional emails (password reset, billing alerts) are still sent.
 */

import { NextRequest, NextResponse } from 'next/server'
import { escapeAirtableString } from '@/lib/tier'

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''

async function findAndOptOut(email: string): Promise<'done' | 'not_found' | 'error'> {
  if (!PLATFORM_TOKEN || !PLATFORM_BASE) return 'error'

  // Find tenant record
  const url =
    `https://api.airtable.com/v0/${PLATFORM_BASE}/Tenants` +
    `?filterByFormula=${encodeURIComponent(`{Email}='${escapeAirtableString(email.toLowerCase())}'`)}&maxRecords=1`

  const findResp = await fetch(url, { headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` } })
  if (!findResp.ok) return 'error'

  const data = await findResp.json()
  const record = data.records?.[0]
  if (!record) return 'not_found'

  // Set opted-out flag
  const patchResp = await fetch(
    `https://api.airtable.com/v0/${PLATFORM_BASE}/Tenants/${record.id}`,
    {
      method:  'PATCH',
      headers: { Authorization: `Bearer ${PLATFORM_TOKEN}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ fields: { 'Email Opted Out': true } }),
    }
  )

  return patchResp.ok ? 'done' : 'error'
}

function htmlPage(title: string, body: string): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — Scout</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f7ff; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #fff; border-radius: 12px; padding: 40px 48px; max-width: 480px; width: 100%; text-align: center; box-shadow: 0 2px 16px rgba(0,0,0,0.06); }
    h1 { font-size: 20px; color: #1a1a1a; margin: 0 0 12px; }
    p  { font-size: 14px; color: #555; line-height: 1.6; margin: 0 0 20px; }
    a  { color: #4F6BFF; text-decoration: none; font-size: 13px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    ${body}
  </div>
</body>
</html>`
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email') || ''

  if (!email || !email.includes('@')) {
    return htmlPage(
      'Invalid unsubscribe link',
      `<p>This unsubscribe link is missing a valid email address. Please contact <a href="mailto:support@clientbloom.ai">support@clientbloom.ai</a> if you need help.</p>`
    )
  }

  const result = await findAndOptOut(email)

  if (result === 'done') {
    return htmlPage(
      'You\'ve been unsubscribed',
      `<p><strong>${email}</strong> has been removed from Scout marketing emails.</p>
       <p>You may still receive transactional emails such as billing receipts and password reset links.</p>
       <a href="/">Return to Scout</a>`
    )
  }

  if (result === 'not_found') {
    // Return success anyway — privacy / idempotency
    return htmlPage(
      'You\'ve been unsubscribed',
      `<p><strong>${email}</strong> has been removed from Scout marketing emails.</p>
       <a href="/">Return to Scout</a>`
    )
  }

  // 'error' — don't expose internals
  return htmlPage(
    'Something went wrong',
    `<p>We weren't able to process your request. Please try again or contact <a href="mailto:support@clientbloom.ai">support@clientbloom.ai</a>.</p>`
  )
}
