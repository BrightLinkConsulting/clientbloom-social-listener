/**
 * Next.js middleware — authentication guard.
 *
 * Protects all routes except:
 *   /              — public landing page
 *   /welcome       — post-checkout confirmation page
 *   /sign-in       — login page
 *   /api/auth/**   — NextAuth's own endpoints
 *   /api/checkout  — Stripe checkout redirect (pre-auth)
 *   /api/webhooks/** — Stripe webhook (signed, not session-based)
 *   /_next/**      — Next.js internal assets
 *   /favicon.ico   — browser default request
 *
 * Unauthenticated requests to other routes are redirected to /sign-in.
 */

export { default } from 'next-auth/middleware'

export const config = {
  matcher: [
    '/((?!$|welcome|sign-in|api/auth|api/checkout|api/webhooks|api/cron|api/debug|_next/static|_next/image|favicon\\.ico).*)',
  ],
}
