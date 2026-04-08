/**
 * lib/tier.ts — Single source of truth for Scout tier limits.
 *
 * NEVER hardcode tier limits anywhere else in the codebase.
 * Every API route, settings page, and scan cron imports from here.
 */

export interface TierLimits {
  keywords: number
  profiles: number
  scansPerDay: number
  commentCredits: number   // Infinity = unlimited
  workspaces: number       // 1 = no multi-workspace
  seats: number
  postHistoryDays: number  // 0 = unlimited
}

export function getTierLimits(plan: string): TierLimits {
  switch (plan) {
    case 'Scout Starter':
      return {
        keywords: 3,
        profiles: 2,
        scansPerDay: 1,
        commentCredits: 30,
        workspaces: 1,
        seats: 1,
        postHistoryDays: 30,
      }
    case 'Scout Pro':
      return {
        keywords: 10,
        profiles: 5,
        scansPerDay: 2,
        commentCredits: Infinity,
        workspaces: 1,
        seats: 1,
        postHistoryDays: 0,
      }
    case 'Scout Agency':
      return {
        keywords: 20,
        profiles: 15,
        scansPerDay: 2,
        commentCredits: Infinity,
        workspaces: 5,   // UI deferred to Q3 — stored here for future enforcement
        seats: 5,
        postHistoryDays: 0,
      }
    case 'Trial':
      return {
        keywords: 3,
        profiles: 2,
        scansPerDay: 1,
        commentCredits: 10,   // 10 total (not per-month) during trial
        workspaces: 1,
        seats: 1,
        postHistoryDays: 30,
      }
    case 'Owner':
      return {
        keywords: 999,
        profiles: 999,
        scansPerDay: 2,
        commentCredits: Infinity,
        workspaces: 999,
        seats: 999,
        postHistoryDays: 0,
      }
    default:
      // Suspended / trial_expired / unknown — zero access
      return {
        keywords: 0,
        profiles: 0,
        scansPerDay: 0,
        commentCredits: 0,
        workspaces: 0,
        seats: 0,
        postHistoryDays: 0,
      }
  }
}

/**
 * Returns the human-readable plan display name and price string.
 */
export function getPlanDisplay(plan: string): { name: string; price: string } {
  switch (plan) {
    case 'Scout Starter': return { name: 'Starter', price: '$49/mo' }
    case 'Scout Pro':     return { name: 'Pro', price: '$99/mo' }
    case 'Scout Agency':  return { name: 'Agency', price: '$249/mo' }
    case 'Trial':         return { name: '7-Day Trial', price: 'Free' }
    case 'Owner':         return { name: 'Owner', price: 'Internal' }
    default:              return { name: plan || 'Unknown', price: '' }
  }
}

/**
 * Maps a Stripe price ID to a Scout plan name.
 * Used in the webhook handler to set the correct plan after purchase.
 */
export function planFromPriceId(priceId: string): string {
  const map: Record<string, string> = {
    [process.env.STRIPE_PRICE_STARTER ?? '']: 'Scout Starter',
    [process.env.STRIPE_PRICE_PRO ?? '']:     'Scout Pro',
    [process.env.STRIPE_PRICE_AGENCY ?? '']:  'Scout Agency',
  }
  return map[priceId] ?? 'Scout Pro' // fallback to Pro if unknown
}

/**
 * Returns true if the plan is an active paid plan (not trial, not expired).
 */
export function isPaidPlan(plan: string): boolean {
  return ['Scout Starter', 'Scout Pro', 'Scout Agency', 'Owner'].includes(plan)
}

/**
 * Returns the tier key (starter | pro | agency) from a plan name.
 * Used for routing and display logic.
 */
export function tierKey(plan: string): 'starter' | 'pro' | 'agency' | 'trial' | 'owner' | null {
  switch (plan) {
    case 'Scout Starter': return 'starter'
    case 'Scout Pro':     return 'pro'
    case 'Scout Agency':  return 'agency'
    case 'Trial':         return 'trial'
    case 'Owner':         return 'owner'
    default:              return null
  }
}

// escapeAirtableString lives in lib/airtable.ts — import from there.
// Re-exported here for backward compat with existing imports.
export { escapeAirtableString } from './airtable'
