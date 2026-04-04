/**
 * /api/slack-settings
 * GET  — fetch Slack configuration from Business Profile table
 * POST — save Slack configuration
 */

import { NextResponse } from 'next/server'

const AIRTABLE_TOKEN = process.env.AIRTABLE_API_TOKEN!
const BASE_ID        = process.env.AIRTABLE_BASE_ID!
const TABLE          = 'Business Profile'
const BASE_URL       = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}`
const HEADERS        = () => ({
  'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
  'Content-Type':  'application/json',
})

export async function GET() {
  try {
    const resp = await fetch(`${BASE_URL}?pageSize=1`, { headers: HEADERS() })
    if (!resp.ok) return NextResponse.json({ error: await resp.text() }, { status: resp.status })

    const data   = await resp.json()
    const record = data.records?.[0]
    if (!record) return NextResponse.json({ slackBotToken: '', slackChannelId: '', slackChannelName: '' })

    return NextResponse.json({
      slackBotToken:   record.fields['Slack Bot Token']   || '',
      slackChannelId:  record.fields['Slack Channel ID']  || '',
      slackChannelName:record.fields['Slack Channel Name']|| '',
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { slackBotToken, slackChannelId, slackChannelName } = await req.json()

    const listResp = await fetch(`${BASE_URL}?pageSize=1`, { headers: HEADERS() })
    if (!listResp.ok) return NextResponse.json({ error: await listResp.text() }, { status: listResp.status })
    const existing = (await listResp.json()).records?.[0]

    const fields: Record<string, any> = {}
    if (slackBotToken    !== undefined) fields['Slack Bot Token']    = slackBotToken
    if (slackChannelId   !== undefined) fields['Slack Channel ID']   = slackChannelId
    if (slackChannelName !== undefined) fields['Slack Channel Name'] = slackChannelName

    const saveResp = existing
      ? await fetch(`${BASE_URL}/${existing.id}`, {
          method: 'PATCH', headers: HEADERS(), body: JSON.stringify({ fields }),
        })
      : await fetch(BASE_URL, {
          method: 'POST', headers: HEADERS(), body: JSON.stringify({ records: [{ fields }] }),
        })

    if (!saveResp.ok) return NextResponse.json({ error: await saveResp.text() }, { status: saveResp.status })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
