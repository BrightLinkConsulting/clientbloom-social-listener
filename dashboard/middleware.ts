/**
 * Next.js middleware — authentication guard + trial expiry enforcement.
 *
 * Public routes (no auth required):
 *   /                    — public landing page
 *   /welcome             — post-checkout confirmation page
 *   /sign-in             — login page
 *   /sign-up             — no-CC trial signup page (NEW)
 *   /about               — public about page
 *   /blog/**             — public blog
 *   /compare/**          — public competitor comparison pages
 *   /terms               — public terms
 *   /privacy-policy      — public privacy policy
 *   /forgot-password     — public password reset request
 *   /reset-password      — public password reset form
 *   /api/auth/**         — NextAuth's own endpoints
 *   /api/checkout        — Stripe checkout redirect (pre-auth direct purchase)
 *   /api/trial/start     — no-CC trial account creation (NEW)
 *   /api/webhooks/**     — Stripe webhook (signed, not session-based)
 *   /api/cron/**         — cron jobs (secured by CRON_SECRET)
 *   /api/debug           — debug endpoints
 *   /api/health          — health check endpoint (monitoring)
 *   /_next/**            — Next.js internal assets
 *   /favicon.ico         — browser default request
 *   /robots.txt          — SEO crawler
 *   /sitemap.xml         — SEO crawler
 *
 * Unauthenticated requests to other routes → redirect to /sign-in.
 *
 * NOTE: Trial expiry enforcement (redirect to /upgrade when trial_expired)
 * is handled at the page level in /app/page.tsx and /app/upgrade/page.tsx.
 * The middleware here handles unauthenticated access only — expiry checks
 * require reading the JWT which has plan/trialEndsAt baked in.
 */

export { default } from 'next-auth/middleware'

export const config = {
  matcher: [
    '/((?!$|welcome|sign-in|sign-up|about|blog|compare|terms|privacy-policy|forgot-password|reset-password|api/auth|api/checkout|api/trial|api/webhooks|api/cron|api/debug|api/health|_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)',
  ],
}
