/**
 * /api/slack-settings — GET/POST Slack config (stored in Business Profile table)
 */
import { NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import { airtableList, airtableCreate, airtableUpdate } from '@/lib/airtable'

const TABLE = 'Business Profile'

export async function GET() {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()
  try {
    const res = await airtableList(TABLE, tenant.tenantId, { pageSize: '1' })
    const data = await res.json()
    const record = data.records?.[0]
    if (!record) return NextResponse.json({ slackBotToken: '', slackChannelId: '', slackChannelName: '' })
    return NextResponse.json({
      slackBotToken:    record.fields['Slack Bot Token']    || '',
      slackChannelId:   record.fields['Slack Channel ID']   || '',
      slackChannelName: record.fields['Slack Channel Name'] || '',
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const tenant = await getTenantConfig()
  if (!tenant) return tenantError()
  try {
    const { slackBotToken, slackChannelId, slackChannelName } = await req.json()
    const fields: Record<string, any> = {}
    if (slackBotToken    !== undefined) fields['Slack Bot Token']    = slackBotToken
    if (slackChannelId   !== undefined) fields['Slack Channel ID']   = slackChannelId
    if (slackChannelName !== undefined) fields['Slack Channel Name'] = slackChannelName

    const existing = await (await airtableList(TABLE, tenant.tenantId, { pageSize: '1' })).json()
    const rec = existing.records?.[0]
    const saved = rec
      ? await airtableUpdate(TABLE, rec.id, fields)
      : await airtableCreate(TABLE, tenant.tenantId, fields)
    if (!saved.ok) return NextResponse.json({ error: await saved.text() }, { status: saved.status })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
