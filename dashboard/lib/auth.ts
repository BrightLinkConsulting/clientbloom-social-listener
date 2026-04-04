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

// ── Platform Airtable (tenant registry) ──────────────────────────────────────
const PLATFORM_TOKEN   = process.env.PLATFORM_AIRTABLE_TOKEN  || ''
const PLATFORM_BASE    = process.env.PLATFORM_AIRTABLE_BASE_ID || ''
const TENANTS_TABLE    = 'Tenants'

async function findTenantByEmail(email: string) {
  if (!PLATFORM_TOKEN || !PLATFORM_BASE) return null

  const url =
    `https://api.airtable.com/v0/${PLATFORM_BASE}/${encodeURIComponent(TENANTS_TABLE)}` +
    `?filterByFormula=${encodeURIComponent(`{Email}='${email.toLowerCase()}'`)}&maxRecords=1`

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

      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        // ── Multi-tenant path (Platform Airtable configured) ──────────────
        if (PLATFORM_TOKEN && PLATFORM_BASE) {
          const record = await findTenantByEmail(credentials.email)
          if (!record) return null

          const fields       = record.fields || {}
          const passwordHash = fields['Password Hash'] || ''
          const status       = fields['Status']        || 'Active'

          if (status === 'Suspended') return null

          const valid = await bcrypt.compare(credentials.password, passwordHash)
          if (!valid) return null

          return {
            id:             record.id,
            email:          credentials.email.toLowerCase(),
            name:           fields['Company Name']        || credentials.email,
            airtableToken:  fields['Airtable API Token']  || '',
            airtableBaseId: fields['Airtable Base ID']    || '',
            isAdmin:        fields['Is Admin']            ?? false,
            isFeedOnly:     fields['Is Feed Only']        ?? false,
            tenantId:       fields['Tenant ID']           || 'owner',
            plan:           fields['Plan']                || '',
            trialEndsAt:    fields['Trial Ends At']       || null,
          }
        }

        // ── Single-tenant fallback (existing Mike deployment) ─────────────
        const adminEmail = (process.env.ADMIN_EMAIL    || '').trim()
        const adminPass  = (process.env.ADMIN_PASSWORD || '').trim()

        if (
          adminEmail &&
          adminPass &&
          credentials.email.toLowerCase() === adminEmail.toLowerCase() &&
          credentials.password === adminPass
        ) {
          return {
            id:             'admin',
            email:          adminEmail,
            name:           'ClientBloom Admin',
            airtableToken:  process.env.AIRTABLE_API_TOKEN  || '',
            airtableBaseId: process.env.AIRTABLE_BASE_ID    || '',
            isAdmin:        true,
          }
        }

        return null
      },
    }),
  ],

  session: { strategy: 'jwt' },

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
      }
      return session
    },
  },

  pages: {
    signIn: '/sign-in',
  },

  secret: process.env.NEXTAUTH_SECRET,
}
