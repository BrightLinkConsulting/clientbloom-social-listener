/**
 * POST /api/admin/grant-access
 *
 * Admin-only. Creates a fully-provisioned 14-day free trial account:
 *   1. Creates the Tenants record
 *   2. Calls provisionNewTenant() to generate a Tenant ID (same path as paid users)
 *   3. Sets a 14-day Trial Ends At date
 *   4. Sends a welcome email via Resend with login credentials + trial details
 *
 * When the trial expires, the user is redirected to /upgrade to subscribe.
 * Their data (ICP, captured posts) is preserved and unlocked on payment.
 */

import { NextResponse } from 'next/server'
import { getTenantConfig, tenantError } from '@/lib/tenant'
import { provisionNewTenant } from '@/lib/provision'
import bcrypt from 'bcryptjs'

const PLATFORM_TOKEN = process.env.PLATFORM_AIRTABLE_TOKEN   || ''
const PLATFORM_BASE  = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const RESEND_KEY     = process.env.RESEND_API_KEY             || ''
const BASE_URL_SITE  = (process.env.NEXT_PUBLIC_BASE_URL || 'https://cb-dashboard-xi.vercel.app').replace(/\/$/, '')
const FROM           = 'Scout <noreply@clientbloom.ai>'
const TRIAL_DAYS     = 14

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let pw = ''
  for (let i = 0; i < 12; i++) {
    pw += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return pw
}

function trialEndDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + TRIAL_DAYS)
  return d.toISOString()
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles',
  })
}

export async function POST(req: Request) {
  const caller = await getTenantConfig()
  if (!caller) return tenantError()
  if (!caller.isAdmin) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }
  if (!PLATFORM_TOKEN || !PLATFORM_BASE) {
    return NextResponse.json({ error: 'Platform Airtable not configured.' }, { status: 500 })
  }
  if (!RESEND_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured — cannot send welcome email.' }, { status: 500 })
  }

  try {
    const { email, companyName, note } = await req.json()
    if (!email) {
      return NextResponse.json({ error: 'email is required.' }, { status: 400 })
    }

    const cleanEmail    = email.toLowerCase().trim()
    const displayName   = companyName?.trim() || cleanEmail
    const tempPassword  = generateTempPassword()
    const passwordHash  = await bcrypt.hash(tempPassword, 12)
    const trialEndsAt   = trialEndDate()
    const trialEndLabel = formatDate(trialEndsAt)

    // ── Step 1: Create Tenants record ────────────────────────────────────────
    const createResp = await fetch(
      `https://api.airtable.com/v0/${PLATFORM_BASE}/Tenants`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${PLATFORM_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: [{
            fields: {
              'Email':          cleanEmail,
              'Password Hash':  passwordHash,
              'Company Name':   displayName,
              'Plan':           'Trial',
              'Status':         'Active',
              'Trial Ends At':  trialEndsAt,
              'Created At':     new Date().toISOString().split('T')[0],
            },
          }],
        }),
      }
    )

    if (!createResp.ok) {
      const body = await createResp.text()
      return NextResponse.json({ error: `Airtable error: ${body.slice(0, 200)}` }, { status: 500 })
    }

    const created   = await createResp.json()
    const recordId  = created.records?.[0]?.id

    // ── Step 2: Provision Tenant ID (same path as paid users via Stripe) ─────
    // This generates a unique Tenant ID and stores it on the record so all
    // shared-base data tables can isolate this user's rows.
    let provisionedTenantId: string | null = null
    try {
      provisionedTenantId = await provisionNewTenant(recordId, displayName)
    } catch (provErr: any) {
      // Non-fatal: tenant can still log in, but data isolation won't work until
      // provisionNewTenant succeeds. Log and continue.
      console.error('[grant-access] provisionNewTenant failed:', provErr.message)
    }

    // ── Step 3: Send welcome email ───────────────────────────────────────────
    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
        <div style="background:#4F6BFF;padding:20px 28px;border-radius:12px 12px 0 0">
          <p style="color:#fff;font-size:16px;font-weight:700;margin:0">Welcome to Scout — 14-Day Free Trial</p>
        </div>
        <div style="background:#f9f9f9;padding:28px 32px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none">
          <h2 style="margin:0 0 8px;font-size:20px">Your Scout trial is ready 🎉</h2>
          <p style="color:#555;margin:0 0 24px;font-size:14px;line-height:1.6">
            Hey${displayName !== cleanEmail ? ` ${displayName}` : ''},
            you have full Scout access for the next 14 days — completely free.
            Sign in below, complete the 2-minute setup, and Scout will start finding
            high-intent leads on LinkedIn and Facebook for you automatically.
          </p>

          ${note ? `<p style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;font-size:13px;color:#92400e;margin:0 0 24px">${note}</p>` : ''}

          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px">
            <tr style="border-bottom:1px solid #eee">
              <td style="padding:10px 0;color:#888;width:120px">Login URL</td>
              <td style="padding:10px 0">
                <a href="${BASE_URL_SITE}/sign-in" style="color:#4F6BFF;text-decoration:none">${BASE_URL_SITE}/sign-in</a>
              </td>
            </tr>
            <tr style="border-bottom:1px solid #eee">
              <td style="padding:10px 0;color:#888">Email</td>
              <td style="padding:10px 0;font-weight:500">${cleanEmail}</td>
            </tr>
            <tr style="border-bottom:1px solid #eee">
              <td style="padding:10px 0;color:#888">Password</td>
              <td style="padding:10px 0;font-family:monospace;font-size:16px;font-weight:700;letter-spacing:0.05em">${tempPassword}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;color:#888">Trial expires</td>
              <td style="padding:10px 0;font-weight:500;color:#ef4444">${trialEndLabel}</td>
            </tr>
          </table>

          <div style="background:#f0f4ff;border:1px solid #c7d4ff;border-radius:8px;padding:14px 18px;margin:0 0 24px">
            <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#1e40af">What happens next</p>
            <ol style="margin:0;padding-left:16px;font-size:13px;color:#374151;line-height:1.7">
              <li>Sign in and complete the 2-minute ICP setup</li>
              <li>Scout runs your first scan automatically</li>
              <li>Check back daily — new opportunities arrive twice a day</li>
              <li>Subscribe before ${trialEndLabel} to keep your data and feed running</li>
            </ol>
          </div>

          <a href="${BASE_URL_SITE}/sign-in"
             style="display:inline-block;background:#4F6BFF;color:#fff;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px">
            Start my free trial →
          </a>

          <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0 16px" />
          <p style="font-size:12px;color:#aaa;margin:0;line-height:1.6">
            Scout monitors LinkedIn and Facebook for high-intent conversations matching your ICP.
            Your captured opportunities and profile data are preserved if you subscribe after the trial.
          </p>
        </div>
      </div>
    `

    const emailResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    FROM,
        to:      [cleanEmail],
        subject: `Your 14-day Scout trial starts now`,
        html,
      }),
    })

    if (!emailResp.ok) {
      const body = await emailResp.text()
      return NextResponse.json({
        ok: true,
        recordId,
        provisionedTenantId,
        emailWarning: `Account created but welcome email failed: ${body.slice(0, 200)}`,
      })
    }

    return NextResponse.json({ ok: true, recordId, provisionedTenantId, trialEndsAt })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
