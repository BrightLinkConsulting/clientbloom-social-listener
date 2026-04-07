/**
 * Next.js middleware — authentication guard.
 *
 * Protects all routes except:
 *   /                    — public landing page
 *   /welcome             — post-checkout confirmation page
 *   /sign-in             — login page
 *   /about               — public about page
 *   /blog/**             — public blog
 *   /compare/**          — public competitor comparison pages
 *   /forgot-password     — public password reset request
 *   /reset-password      — public password reset form
 *   /api/auth/**         — NextAuth's own endpoints
 *   /api/checkout        — Stripe checkout redirect (pre-auth)
 *   /api/webhooks/**     — Stripe webhook (signed, not session-based)
 *   /api/cron/**         — cron jobs (secured by CRON_SECRET)
 *   /api/debug           — debug endpoints
 *   /api/health          — health check endpoint (monitoring)
 *   /_next/**            — Next.js internal assets
 *   /favicon.ico         — browser default request
 *   /robots.txt          — SEO crawler
 *   /sitemap.xml         — SEO crawler
 *
 * Unauthenticated requests to other routes are redirected to /sign-in.
 */

export { default } from 'next-auth/middleware'

export const config = {
  matcher: [
    '/((?!$|welcome|sign-in|about|blog|compare|forgot-password|reset-password|api/auth|api/checkout|api/webhooks|api/cron|api/debug|api/health|_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)',
  ],
}
