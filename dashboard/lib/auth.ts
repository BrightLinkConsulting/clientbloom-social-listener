/**
 * NextAuth configuration — multi-tenant credentials provider.
 *
 * Each tenant has their own row in the Platform Airtable "Tenants" table.
 * On successful login the session receives the tenant's Airtable credentials
 * so every API route can isolate data to that specific base.
 *
 * Required env vars (platform-level, not per-tenant):
 *   PLATFORM_AIRTABLE_TOKEN   — token for the platform's own Airtable base
 *   PLATFORM_AIRTABLE_BASE_ID — the platform master base (holds tenant records)
 *   NEXTAUTH_SECRET           — random secret for JWT signing
 *   NEXTAUTH_URL              — canonical URL of this deployment
 *
 * Fallback single-tenant mode (for Mike's existing deployment):
 *   If PLATFORM_AIRTABLE_BASE_ID is not set, the auth falls back to comparing
 *   ADMIN_EMAIL / ADMIN_PASSWORD env vars and uses AIRTABLE_API_TOKEN /
 *   AIRTABLE_BASE_ID from the environment. This keeps the current deployment
 *   working without any changes to its env vars.
 */

import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'

// ── In-memory rate limiter ────────────────────────────────────────────────────
// Tracks failed login attempts per IP and per email within a sliding window.
// Module-level: persists across requests within the same Vercel function instance.
// Covers the primary threat — rapid brute-force against a known email address.
// For distributed attacks across many IPs, a Redis-backed limiter (Upstash) is
// the next upgrade when the tenant count justifies it.
const WINDOW_MS       = 15 * 60 * 1000   // 15-minute sliding window
const EMAIL_MAX_FAILS = 5                 // lock email after 5 failures in window
const IP_MAX_FAILS    = 20                // lock IP after 20 failures in window

interface RateBucket { count: number; resetAt: number }
const ipBuckets:    Map<string, RateBucket> = new Map()
const emailBuckets: Map<string, RateBucket> = new Map()

function getBucket(map: Map<string, RateBucket>, key: string): RateBucket {
  const now = Date.now()
  let b = map.get(key)
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + WINDOW_MS }
    map.set(key, b)
  }
  return b
}

function rateLimitExceeded(map: Map<string, RateBucket>, key: string, max: number): boolean {
  return getBucket(map, key).count >= max
}

function recordFailure(ip: string, email: string): void {
  getBucket(ipBuckets, ip).count++
  getBucket(emailBuckets, email).count++
}

function clearEmailBucket(email: string): void {
  emailBuckets.delete(email)
}

function clientIp(req: any): string {
  const forwarded = req?.headers?.['x-forwarded-for'] ?? ''
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0]
  return raw.trim() || 'unknown'
}

// ── Platform Airtable (tenant registry) ──────────────────────────────────────
const PLATFORM_TOKEN   = process.env.PLATFORM_AIRTABLE_TOKEN  || ''
const PLATFORM_BASE    = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const TENANTS_TABLE    = 'Tenants'

async function findTenantByEmail(email: string) {
  if (!PLATFORM_TOKEN || !PLATFORM_BASE) return null

  const url =
    `https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent(TENANTS_TABLE)}` +
    `?filterByFormula=${encodeURIComponent(`{Email}='${email.toLowerCase().replace(/'/g, "\\'")}'`)}&maxRecords=1`

  try {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` },
    })
    if (!resp.ok) return null
    const data = await resp.json()
    return data.records?.[0] || null
  } catch {
    return null
  }
}

// ── Auth options ──────────────────────────────────────────────────────────────
export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Email & Password',
      credentials: {
        email:    { label: 'Email',    type: 'email'    },
        password: { label: 'Password', type: 'password' },
      },

      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null

        const email = credentials.email.toLowerCase()
        const ip    = clientIp(req)

        // ── Rate limit check (before touching Airtable) ───────────────────
        if (rateLimitExceeded(emailBuckets, email, EMAIL_MAX_FAILS)) {
          console.warn(`[auth] Rate limit: too many failures for ${email}`)
          return null
        }
        if (rateLimitExceeded(ipBuckets, ip, IP_MAX_FAILS)) {
          console.warn(`[auth] Rate limit: too many failures from ${ip}`)
          return null
        }

        // ── Multi-tenant path (Platform Airtable configured) ──────────────
        if (PLATFORM_TOKEN && PLATFORM_BASE) {
          const record = await findTenantByEmail(email)
          if (!record) { recordFailure(ip, email); return null }

          const fields       = record.fields || {}
          const passwordHash = fields['Password Hash'] || ''
          const status       = fields['Status']        || 'Active'

          if (status === 'Suspended') { recordFailure(ip, email); return null }

          const valid = await bcrypt.compare(credentials.password, passwordHash)
          if (!valid) { recordFailure(ip, email); return null }

          clearEmailBucket(email)
          return {
            id:             record.id,
            email,
            name:           fields['Company Name']        || email,
            airtableToken:  fields['Airtable API Token']  || '',
            airtableBaseId: fields['Airtable Base ID']    || '',
            isAdmin:        fields['Is Admin']            ?? false,
            isFeedOnly:     fields['Is Feed Only']        ?? false,
            tenantId:       fields['Tenant ID']           || 'owner',
            plan:           fields['Plan']                || '',
            trialEndsAt:    fields['Trial Ends At']       || null,
            onboarded:      fields['Onboarded']           ?? false,
          }
        }

        // ── Single-tenant fallback (existing Mike deployment) ─────────────
        // ADMIN_PASSWORD is expected to be a bcrypt hash in production.
        // Plain-text comparison is intentionally avoided here.
        const adminEmail    = (process.env.ADMIN_EMAIL    || '').trim()
        const adminPassHash = (process.env.ADMIN_PASSWORD || '').trim()

        if (
          adminEmail &&
          adminPassHash &&
          email === adminEmail.toLowerCase() &&
          (await bcrypt.compare(credentials.password, adminPassHash).catch(() => false))
        ) {
          clearEmailBucket(email)
          return {
            id:             'admin',
            email:          adminEmail,
            name:           'ClientBloom Admin',
            airtableToken:  process.env.AIRTABLE_API_TOKEN  || '',
            airtableBaseId: process.env.AIRTABLE_BASE_ID    || '',
            isAdmin:        true,
            onboarded:      true,
          }
        }

        recordFailure(ip, email)
        return null
      },
    }),
  ],

  session: { strategy: 'jwt', maxAge: 24 * 60 * 60 },

  callbacks: {
    jwt({ token, user }) {
      // Persist tenant credentials in the JWT on sign-in
      if (user) {
        token.airtableToken  = (user as any).airtableToken
        token.airtableBaseId = (user as any).airtableBaseId
        token.isAdmin        = (user as any).isAdmin
        token.isFeedOnly     = (user as any).isFeedOnly ?? false
        token.tenantId       = (user as any).tenantId || 'owner'
        token.plan           = (user as any).plan || ''
        token.trialEndsAt    = (user as any).trialEndsAt || null
        token.onboarded      = (user as any).onboarded ?? false
      }
      return token
    },

    session({ session, token }) {
      // Expose credentials to server components / API routes via session
      if (session.user) {
        ;(session.user as any).airtableToken  = token.airtableToken
        ;(session.user as any).airtableBaseId = token.airtableBaseId
        ;(session.user as any).isAdmin        = token.isAdmin
        ;(session.user as any).isFeedOnly     = token.isFeedOnly ?? false
        ;(session.user as any).tenantId       = token.tenantId || 'owner'
        ;(session.user as any).plan           = token.plan || ''
        ;(session.user as any).trialEndsAt    = token.trialEndsAt || null
        ;(session.user as any).onboarded      = token.onboarded ?? false
      }
      return session
    },
  },

  pages: {
    signIn: '/sign-in',
  },

  secret: process.env.NEXTAUTH_SECRET,
}