/**
 * lib/emails.ts
 *
 * Single source of truth for all Scout email templates.
 *
 * Previously email HTML was scattered across 5+ route files with no
 * centralized management and no CAN-SPAM unsubscribe links.
 *
 * This module provides:
 *   - Trial nurture sequence:  Day 1 (welcome) through Day 7 (expires today)
 *   - Post-expiry win-back:    ~3 days after trial ends
 *   - Transactionals:          purchase welcome, team invite, password reset
 *   - Admin alerts:            new trial, new purchase, payment failed, expired
 *
 * CAN-SPAM compliance:
 *   All marketing/nurture emails include a plain-text unsubscribe link in the
 *   footer. Physical address is included per CAN-SPAM §15 USC 7704(a)(5)(A)(ii).
 *   Transactionals (password reset) are exempt from unsubscribe requirements.
 *
 * Usage:
 *   import { buildTrialDayEmail, buildPurchaseWelcomeEmail } from '@/lib/emails'
 *   const { subject, html } = buildTrialDayEmail(2, 'Jane', { appUrl, upgradeUrl })
 *   await resend.send({ to, from: FROM, subject, html })
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const BRAND_BLUE    = '#4F6BFF'
const BRAND_PURPLE  = '#7C3AED'
const BRAND_PINK    = '#E91E8C'
const BRAND_DARK    = '#0a0c10'
// Physical mailing address for CAN-SPAM compliance
const PHYSICAL_ADDR = 'ClientBloom · 1234 Innovation Way · San Bernardino, CA 92401'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EmailTemplate {
  subject: string
  html:    string
}

// Plan recommendation for upgrade CTAs in Days 5-7
export type RecommendedPlan = 'starter' | 'pro' | 'agency'

// ── Layout helpers ────────────────────────────────────────────────────────────

function header(text: string, color: string = BRAND_BLUE): string {
  return `<div style="background:${color};padding:20px 28px;border-radius:12px 12px 0 0">
    <p style="color:#fff;font-size:15px;font-weight:700;margin:0">${text}</p>
  </div>`
}

/**
 * Logo header — used for the Day 1 welcome email so it mirrors the app's
 * nav bar: ClientBloom mark (3 ellipses) + "Scout / by ClientBloom" text.
 * Uses a table layout for maximum email-client compatibility.
 */
function logoHeader(color: string = BRAND_PURPLE): string {
  return `<div style="background:${color};padding:18px 28px;border-radius:12px 12px 0 0">
    <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
      <tr>
        <td style="vertical-align:middle;padding-right:10px">
          <svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <ellipse cx="50" cy="21" rx="24" ry="13" fill="#F7B731"/>
            <ellipse cx="20" cy="52" rx="13" ry="25" fill="#E91E8C"/>
            <ellipse cx="80" cy="52" rx="13" ry="25" fill="#00B96B"/>
          </svg>
        </td>
        <td style="vertical-align:middle">
          <p style="color:#fff;font-size:16px;font-weight:700;margin:0;line-height:1.2">Scout</p>
          <p style="color:rgba(255,255,255,0.65);font-size:11px;font-weight:500;margin:0;line-height:1.2;letter-spacing:0.03em">by ClientBloom</p>
        </td>
      </tr>
    </table>
  </div>`
}

function footer(unsubUrl: string): string {
  return `
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:28px 0 16px" />
    <p style="font-size:11px;color:#aaa;margin:0;line-height:1.7">
      You're receiving this because you signed up for a Scout by ClientBloom trial.<br />
      ${PHYSICAL_ADDR}<br />
      <a href="${unsubUrl}" style="color:#aaa;text-decoration:underline">Unsubscribe from trial emails</a>
    </p>`
}

function wrap(headerHtml: string, bodyHtml: string, footerHtml: string): string {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:540px;margin:0 auto;color:#1a1a1a">
      ${headerHtml}
      <div style="background:#f9f9f9;padding:28px 32px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none">
        ${bodyHtml}
        ${footerHtml}
      </div>
    </div>`
}

function cta(label: string, href: string, color: string = BRAND_BLUE): string {
  return `<a href="${href}" style="display:inline-block;background:${color};color:#fff;font-weight:700;padding:13px 26px;border-radius:10px;text-decoration:none;font-size:14px">${label}</a>`
}

function infoBox(content: string, borderColor: string = BRAND_BLUE): string {
  return `<div style="background:#fff;border-left:3px solid ${borderColor};padding:14px 18px;border-radius:0 8px 8px 0;margin:16px 0">${content}</div>`
}

function calloutBox(title: string, items: string[], color: string = BRAND_BLUE): string {
  const rows = items
    .map(i => `<p style="margin:0 0 7px;font-size:13px;color:#374151;line-height:1.7">${i}</p>`)
    .join('')
  return `<div style="background:#f0f4ff;border:1px solid #c7d4ff;border-radius:8px;padding:14px 18px;margin:16px 0">
    <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#1e3a8a;text-transform:uppercase;letter-spacing:0.05em">${title}</p>
    ${rows}
  </div>`
}

function p(content: string, style = ''): string {
  return `<p style="color:#444;line-height:1.7;font-size:14px;margin:12px 0;${style}">${content}</p>`
}

function h2(content: string): string {
  return `<h2 style="margin:0 0 14px;font-size:20px;color:#1a1a1a;font-weight:700">${content}</h2>`
}

// ── Plan recommendation logic ─────────────────────────────────────────────────

interface PlanCopy {
  ctaLabel:  string
  price:     string
  highlight: string
  color:     string
}

const PLAN_COPY: Record<RecommendedPlan, PlanCopy> = {
  starter: {
    ctaLabel:  'Continue with Starter →',
    price:     '$49/month',
    highlight: 'Up to 3 keyword searches and 2 ICP profiles, 1 daily scan.',
    color:     BRAND_BLUE,
  },
  pro: {
    ctaLabel:  'Continue with Pro →',
    price:     '$99/month',
    highlight: '10 keyword searches, 5 ICP profiles, 2 daily scans, CRM sync, Slack digest.',
    color:     BRAND_PURPLE,
  },
  agency: {
    ctaLabel:  'Continue with Agency →',
    price:     '$249/month',
    highlight: '20 keyword searches, 15 ICP profiles, 2 daily scans, up to 5 user seats.',
    color:     BRAND_PINK,
  },
}

// ── Trial Day 1: Welcome ──────────────────────────────────────────────────────

export function buildTrialDay1Email(
  opts: { appUrl: string; unsubUrl: string },
): EmailTemplate {
  const subject = `Welcome — your 30-Day LinkedIn Authority Challenge starts today`
  const onboardUrl = `${opts.appUrl}/onboarding`

  const body = `
    ${h2('Your 30-Day LinkedIn Authority Challenge starts today.')}
    ${p(`You have 7 days to experience what it feels like when your ideal clients are coming to <em>you</em>.`)}
    ${infoBox(`
      <p style="margin:0 0 6px;font-weight:700;font-size:13px;color:#1a1a1a">The challenge: 30 days, 3 prospects who know your name before you pitch them.</p>
      <p style="margin:0;font-size:13px;color:#555;line-height:1.6">Scout finds the conversations your buyers are having on LinkedIn every single day. You show up. Add something real. Over 30 days, they start to recognize you.</p>
    `, BRAND_PURPLE)}
    ${p(`<strong>Your first move:</strong> Complete your quick setup — tell Scout who your ideal client is and add 1–2 LinkedIn profiles you want to monitor. Then hit <strong>Scan Now</strong> to see your first batch of posts.`)}
    <p style="margin:16px 0 8px">${cta('Set up Scout now →', onboardUrl, BRAND_PURPLE)}</p>
    ${p(`You'll get one email per day this week — specific, actionable, zero filler. Day 2 lands tomorrow with the comment framework that makes you memorable.`, 'color:#666;font-size:13px')}
    ${footer(opts.unsubUrl)}`

  return { subject, html: wrap(logoHeader(), body, '') }
}

// ── Trial Day 2: Comment Framework ───────────────────────────────────────────

export function buildTrialDay2Email(
  opts: { appUrl: string; unsubUrl: string },
): EmailTemplate {
  const subject = `Day 2: The comment that gets you remembered (copy-paste ready)`

  const body = `
    ${h2('The one comment framework that works on LinkedIn')}
    ${p(`Most people comment the same three ways: "Great point!" · "So true!" · A paragraph about themselves. None of these work. Here's the framework that does.`)}
    ${calloutBox('THE 3-PART COMMENT FORMULA', [
      '<strong>1. Name a specific detail from their post.</strong> Shows you actually read it, not just the headline.',
      '<strong>2. Add one concrete observation or contrasting data point.</strong> Builds your authority without pitching.',
      '<strong>3. End with one genuine question.</strong> Creates a dialogue, not a broadcast.',
    ])}
    ${p(`Scout's AI comment suggestions follow this exact structure. Open your feed, find a post scored 7 or above, and read the <em>Comment Angle</em> — that's your starting point.`)}
    ${p(`The goal isn't to sell anything. It's to be someone they remember when the time comes.`)}
    <p style="margin:16px 0 8px">${cta('Open your Scout feed →', opts.appUrl)}</p>
    ${footer(opts.unsubUrl)}`

  return { subject, html: wrap(header('Scout · Day 2 of 7'), body, '') }
}

// ── Trial Day 3: Check-in on signals ─────────────────────────────────────────

export function buildTrialDay3Email(
  opts: { appUrl: string; unsubUrl: string },
): EmailTemplate {
  const subject = `Day 3: How to tell if it's working (look for these 3 things)`

  const body = `
    ${h2('The early signals that tell you this is working')}
    ${p(`You should have your first comments live by now. Here's how to tell whether they're building anything yet.`)}
    ${calloutBox('WEEK 1 SIGNALS TO WATCH FOR', [
      '✓ <strong>Profile view spike</strong> after you comment (check LinkedIn notifications).',
      '✓ <strong>Reply from the post author</strong> — even a brief one counts. It means they noticed.',
      '✓ <strong>New connection request</strong> from someone matching your ICP — unprompted.',
    ])}
    ${p(`You won't get all three this week. Getting even one is the signal that you're doing it right.`)}
    ${infoBox(`<p style="margin:0;font-size:13px;color:#333;line-height:1.6">When you get a positive response, mark that post as <strong>Engaged</strong> in Scout. You'll build a list of warm contacts without a spreadsheet.</p>`)}
    ${p(`If you're getting zero responses, two things to check: (1) Are you posting comments on the actual LinkedIn post, not just saving it in Scout? (2) Are the posts you're commenting on less than 24 hours old? Timing matters more than quality in week one.`)}
    <p style="margin:16px 0 8px">${cta('Check today\'s feed →', opts.appUrl)}</p>
    ${footer(opts.unsubUrl)}`

  return { subject, html: wrap(header('Scout · Day 3 of 7'), body, '') }
}

// ── Trial Day 4: Timing tip ───────────────────────────────────────────────────

export function buildTrialDay4Email(
  opts: { appUrl: string; unsubUrl: string },
): EmailTemplate {
  const subject = `Day 4: When you comment matters more than what you say`

  const body = `
    ${h2('The timing advantage most people ignore')}
    ${p(`LinkedIn's algorithm rewards early engagement. A comment in the first 60–90 minutes of a post's life gets meaningfully more visibility than the same comment posted 6 hours later.`)}
    ${p(`Most people open LinkedIn twice a day and scroll what's already popular. By then, the algorithm window is closed. You're commenting into a conversation that's already moved on.`)}
    ${infoBox(`
      <p style="margin:0 0 8px;font-weight:700;font-size:13px;color:#1a1a1a">Scout's morning and evening scans (6 AM + 6 PM) put fresh posts in your feed every day.</p>
      <p style="margin:0;font-size:13px;color:#555;line-height:1.6">Check your feed in the morning and again in early evening. That's when you're catching posts in their first hour — the window where your comment gets seen.</p>
    `)}
    ${p(`You don't need to be first. You need to be early and have something worth saying. The combination is rare enough that people notice.`)}
    <p style="margin:16px 0 8px">${cta('See today\'s posts →', opts.appUrl)}</p>
    ${footer(opts.unsubUrl)}`

  return { subject, html: wrap(header('Scout · Day 4 of 7'), body, '') }
}

// ── Trial Day 5: Social proof + first urgency ─────────────────────────────────

export function buildTrialDay5Email(
  opts: { appUrl: string; upgradeUrl: string; unsubUrl: string; plan?: RecommendedPlan },
): EmailTemplate {
  const plan     = opts.plan || 'pro'
  const planCopy = PLAN_COPY[plan]
  const subject  = `Day 5: What 30 days of this actually looks like (your trial ends in 2 days)`

  const body = `
    ${h2('What 30 days of consistent showing up actually produces')}
    ${p(`Consultants who run this approach for 30 days consistently describe the same experience: prospects start reaching out first, before any cold pitch. Not because of a lucky post. Because they showed up in the right conversations enough times that they became a familiar, credible name.`)}
    ${infoBox(`
      <p style="margin:0 0 4px;font-weight:700;font-size:13px;color:#1a1a1a">By day 30: at least 3 of your ideal prospects recognize your name before you ever pitch them.</p>
      <p style="margin:0;font-size:13px;color:#555;line-height:1.6">That's the bar. It's achievable in 30 days with 15 minutes a day. You're on day 5 of 30.</p>
    `, planCopy.color)}
    ${p(`Your trial ends in <strong>2 days</strong>. Don't lose the momentum you've built this week.`)}
    ${p(`${planCopy.highlight}`, 'color:#666;font-size:13px')}
    <p style="margin:16px 0 4px">${cta(planCopy.ctaLabel, opts.upgradeUrl, planCopy.color)}</p>
    ${p(`${planCopy.price} · Cancel anytime · No setup fees`, 'color:#999;font-size:12px;margin:6px 0 16px')}
    ${footer(opts.unsubUrl)}`

  return { subject, html: wrap(header('Scout · Day 5 of 7 — Trial ending soon', planCopy.color), body, '') }
}

// ── Trial Day 6: Last chance ──────────────────────────────────────────────────

export function buildTrialDay6Email(
  opts: { upgradeUrl: string; unsubUrl: string; plan?: RecommendedPlan },
): EmailTemplate {
  const plan     = opts.plan || 'pro'
  const planCopy = PLAN_COPY[plan]
  const subject  = `Day 6: Tomorrow your trial ends — here's exactly what stops at day 7`

  const body = `
    ${h2('Day 7 vs. Day 30 — two very different outcomes')}
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin:16px 0;border-radius:8px;overflow:hidden;border:1px solid #e5e5e5">
      <thead>
        <tr style="background:#f5f5f5">
          <th style="padding:11px 14px;text-align:left;color:#888;font-weight:600;border-bottom:1px solid #e5e5e5">If you stop at day 7</th>
          <th style="padding:11px 14px;text-align:left;color:${planCopy.color};font-weight:600;border-bottom:1px solid #e5e5e5">If you continue to day 30</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding:10px 14px;border-top:1px solid #eee;color:#555">Your ICP doesn't know you yet</td>
          <td style="padding:10px 14px;border-top:1px solid #eee;color:#333">3+ prospects recognize your name</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;border-top:1px solid #eee;color:#555">Cold outreach is still the only path</td>
          <td style="padding:10px 14px;border-top:1px solid #eee;color:#333">Inbound conversations starting</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;border-top:1px solid #eee;color:#555">Lost the early-mover timing window</td>
          <td style="padding:10px 14px;border-top:1px solid #eee;color:#333">First recognizable voice in your niche's feed</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;border-top:1px solid #eee;color:#555">Engaged contacts lost without CRM sync</td>
          <td style="padding:10px 14px;border-top:1px solid #eee;color:#333">Warm pipeline building automatically</td>
        </tr>
      </tbody>
    </table>
    ${p(`Your trial ends tomorrow.`)}
    <p style="margin:16px 0 4px">${cta(`Don't stop at day 7 →`, opts.upgradeUrl, planCopy.color)}</p>
    ${p(`${planCopy.price} · Cancel anytime`, 'color:#999;font-size:12px;margin:6px 0 16px')}
    ${footer(opts.unsubUrl)}`

  return { subject, html: wrap(header('Scout · Day 6 of 7 — Trial ends tomorrow', planCopy.color), body, '') }
}

// ── Trial Day 7: Final day ────────────────────────────────────────────────────

export function buildTrialDay7Email(
  opts: { upgradeUrl: string; unsubUrl: string; plan?: RecommendedPlan },
): EmailTemplate {
  const plan     = opts.plan || 'pro'
  const planCopy = PLAN_COPY[plan]
  const subject  = `Your Scout trial ends tonight — you're 23% of the way there`

  const body = `
    ${h2(`You started something. Don't leave it at 23%.`)}
    ${p(`On Day 1 I mentioned the 30-Day LinkedIn Authority Challenge. Today is day 7 — you're 23% through it.`)}
    ${p(`The results people talk about — the moment a prospect messages you first, mentions your name in a conversation, asks you for help unprompted — those happen between days 20 and 30. Not day 7.`)}
    ${infoBox(`
      <p style="margin:0;font-size:13px;color:#333;line-height:1.6">The people who get results from this approach are the ones who don't stop at day 7. You're 23% of the way to something real. Your trial ends tonight.</p>
    `, planCopy.color)}
    <p style="margin:20px 0 4px">${cta(`Finish what you started →`, opts.upgradeUrl, planCopy.color)}</p>
    ${p(`Starter $49 · Pro $99 · Agency $249 · Cancel anytime`, 'color:#999;font-size:12px;margin:6px 0 16px')}
    ${footer(opts.unsubUrl)}`

  return { subject, html: wrap(header(`Scout · Day 7 — Trial ends today`, planCopy.color), body, '') }
}

// ── Trial Expired (immediate) ─────────────────────────────────────────────────

export function buildTrialExpiredEmail(
  opts: { upgradeUrl: string; unsubUrl: string },
): EmailTemplate {
  const subject = `Your Scout trial has ended — your leads are waiting`

  const body = `
    ${h2(`Your trial has ended`)}
    ${p(`Your 7-day Scout trial is over. Your feed is paused — the posts Scout found and the contacts you engaged are still there, locked until you subscribe.`)}
    ${p(`The LinkedIn conversations you were showing up in are still happening. The question is whether someone else is filling the space you were in.`)}
    <p style="margin:20px 0 4px">${cta(`Unlock my leads →`, opts.upgradeUrl)}</p>
    ${p(`Starter $49 · Pro $99 · Agency $249 · Cancel anytime`, 'color:#999;font-size:12px;margin:6px 0 16px')}
    ${footer(opts.unsubUrl)}`

  return { subject, html: wrap(header(`Scout by ClientBloom`, BRAND_DARK), body, '') }
}

// ── Post-Expiry Win-Back (~3 days after expiry) ───────────────────────────────

export function buildTrialWinBackEmail(
  opts: { upgradeUrl: string; unsubUrl: string },
): EmailTemplate {
  const subject = `One last thing about your Scout trial`

  const body = `
    ${h2(`The contacts you warmed up this week are still warm.`)}
    ${p(`Your trial ended a few days ago. I want to be direct with you.`)}
    ${p(`The window for those LinkedIn conversations doesn't stay open. The people whose posts you were showing up in will move on. Some of them are probably seeing someone else's name in their feed right now.`)}
    ${p(`I'm not saying that to pressure you. I'm saying it because I've watched consultants lose the early-mover position in their niche by waiting two more weeks to decide.`)}
    ${p(`If the timing genuinely isn't right, I get it. But if it's just hesitation — Scout is $49/month, cancel anytime, and everything you set up during your trial is still there.`)}
    <p style="margin:20px 0 4px">${cta(`Pick up where you left off →`, opts.upgradeUrl)}</p>
    ${p(`Starter $49 · Pro $99 · Agency $249`, 'color:#999;font-size:12px;margin:6px 0 16px')}
    ${p(`— Mike`, 'color:#666;font-size:13px;margin-top:20px')}
    ${footer(opts.unsubUrl)}`

  return { subject, html: wrap(header(`Scout by ClientBloom`, BRAND_DARK), body, '') }
}

// ── Purchase Welcome ──────────────────────────────────────────────────────────

export function buildPurchaseWelcomeEmail(
  opts: {
    companyName: string
    email:       string
    password:    string
    plan:        string
    appUrl:      string
  },
): EmailTemplate {
  const firstName = opts.companyName.split(' ')[0] || opts.companyName
  const subject   = `Your Scout account is ready`

  const body = `
    ${h2(`Welcome, ${firstName}. You're all set.`)}
    ${p(`Your Scout ${opts.plan} account is live and ready. Your credentials are below.`)}
    <div style="background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:18px 20px;margin:16px 0">
      <table style="width:100%;font-size:13px;border-collapse:collapse">
        <tr style="border-bottom:1px solid #f0f0f0">
          <td style="padding:8px 0;color:#888;width:140px">Login URL</td>
          <td style="padding:8px 0"><a href="${opts.appUrl}/sign-in" style="color:${BRAND_BLUE}">${opts.appUrl}/sign-in</a></td>
        </tr>
        <tr style="border-bottom:1px solid #f0f0f0">
          <td style="padding:8px 0;color:#888">Email</td>
          <td style="padding:8px 0;font-weight:600">${opts.email}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#888">Temp password</td>
          <td style="padding:8px 0;font-family:monospace;font-size:15px;background:#f5f5f5;padding:6px 10px;border-radius:5px;letter-spacing:0.05em">${opts.password}</td>
        </tr>
      </table>
    </div>
    ${p(`Sign in and complete your 2-minute setup — tell Scout who your ideal client is and add the LinkedIn profiles or keywords you want to monitor. Then hit <strong>Scan Now</strong> to see your first posts.`)}
    <p style="margin:16px 0 8px">${cta(`Sign in to Scout →`, `${opts.appUrl}/sign-in`)}</p>
    ${p(`Questions? Reply directly to this email — we read every one.`, 'color:#888;font-size:12px;margin-top:20px')}`

  return { subject, html: wrap(header(`Scout by ClientBloom — ${opts.plan}`), body, '') }
}

// ── Team Invite ───────────────────────────────────────────────────────────────

export function buildTeamInviteEmail(opts: {
  inviteeEmail: string
  tempPassword: string
  loginUrl:     string
}): EmailTemplate {
  const subject = `You've been invited to Scout`

  const body = `
    ${h2(`Your team access is ready`)}
    ${p(`A teammate has added you to their Scout account. You can view and act on incoming ICP posts, copy AI-generated comment starters, and mark leads as Engaged or Skipped — all without touching account settings.`)}
    <div style="background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:18px 20px;margin:16px 0">
      <table style="width:100%;font-size:13px;border-collapse:collapse">
        <tr style="border-bottom:1px solid #f0f0f0">
          <td style="padding:8px 0;color:#888;width:120px">Login URL</td>
          <td style="padding:8px 0"><a href="${opts.loginUrl}/sign-in" style="color:${BRAND_BLUE}">${opts.loginUrl}/sign-in</a></td>
        </tr>
        <tr style="border-bottom:1px solid #f0f0f0">
          <td style="padding:8px 0;color:#888">Your email</td>
          <td style="padding:8px 0;font-weight:600">${opts.inviteeEmail}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#888">Temp password</td>
          <td style="padding:8px 0;font-family:monospace;font-size:16px;font-weight:700;letter-spacing:0.06em">${opts.tempPassword}</td>
        </tr>
      </table>
    </div>
    ${calloutBox('WHAT YOU CAN DO', [
      'View and filter all incoming ICP posts in the feed',
      'Copy AI-generated comment starters and reply on LinkedIn',
      'Mark posts as Engaged, Replied, or Skipped',
      'Refresh the feed to pull the latest scans',
    ])}
    <p style="margin:16px 0 8px">${cta(`Open Scout Feed →`, `${opts.loginUrl}/sign-in`)}</p>
    ${p(`Your access is limited to the feed — billing and settings are managed by the account owner. If you didn't expect this invite, you can safely ignore this email.`, 'color:#888;font-size:12px;margin-top:20px')}`

  return { subject, html: wrap(header(`You've been invited to Scout`), body, '') }
}

// ── Password Reset (transactional — no unsubscribe required) ─────────────────

export function buildPasswordResetEmail(opts: {
  resetLink: string
  appName?:  string
}): EmailTemplate {
  const subject = `Reset your Scout password`

  const body = `
    ${p(`We received a request to reset your password. If you didn't make this request, you can ignore this email — nothing will change.`)}
    <p style="margin:20px 0 8px">${cta(`Reset my password →`, opts.resetLink)}</p>
    <p style="margin:12px 0 8px;font-size:13px;color:#888">Or copy this link:</p>
    <p style="font-family:monospace;font-size:11px;background:#f0f0f0;padding:8px 12px;border-radius:6px;word-break:break-all;color:#555;margin:0 0 16px">${opts.resetLink}</p>
    ${p(`This link expires in 1 hour. If you need a new link, visit the login page and select "Forgot password?".`, 'color:#888;font-size:12px')}
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0 16px" />
    <p style="font-size:11px;color:#aaa;margin:0">Scout by ClientBloom · ${PHYSICAL_ADDR}</p>`

  return { subject, html: wrap(header(`Reset Your Scout Password`), body, '') }
}

// ── Admin: New Trial Signup ───────────────────────────────────────────────────

export function buildAdminNewTrialEmail(opts: {
  email:     string
  name:      string
  trialEnds: string
}): EmailTemplate {
  const safe = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const subject = `[Scout] New trial signup — ${opts.email}`
  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
      <div style="background:#4F6BFF;padding:16px 22px;border-radius:10px 10px 0 0">
        <p style="color:#fff;font-size:14px;font-weight:700;margin:0">Scout · New Trial Signup</p>
      </div>
      <div style="background:#f9f9f9;padding:22px 24px;border-radius:0 0 10px 10px;border:1px solid #e5e5e5;border-top:none">
        <p style="margin:0 0 4px;font-size:13px;color:#888">Name</p>
        <p style="margin:0 0 12px;font-weight:600">${safe(opts.name)}</p>
        <p style="margin:0 0 4px;font-size:13px;color:#888">Email</p>
        <p style="margin:0 0 12px;font-weight:600">${safe(opts.email)}</p>
        <p style="margin:0 0 4px;font-size:13px;color:#888">Trial ends</p>
        <p style="margin:0;font-weight:600">${opts.trialEnds}</p>
      </div>
    </div>`
  return { subject, html }
}

// ── Admin: New Purchase ───────────────────────────────────────────────────────

export function buildAdminNewPurchaseEmail(opts: {
  email:  string
  name:   string
  plan:   string
  subId:  string
}): EmailTemplate {
  const safe = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const subject = `[Scout] 💰 New purchase — ${opts.plan} · ${opts.email}`
  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
      <div style="background:#00B96B;padding:16px 22px;border-radius:10px 10px 0 0">
        <p style="color:#fff;font-size:14px;font-weight:700;margin:0">Scout · New Purchase</p>
      </div>
      <div style="background:#f9f9f9;padding:22px 24px;border-radius:0 0 10px 10px;border:1px solid #e5e5e5;border-top:none">
        <p style="margin:0 0 4px;font-size:13px;color:#888">Name</p>
        <p style="margin:0 0 12px;font-weight:600">${safe(opts.name)}</p>
        <p style="margin:0 0 4px;font-size:13px;color:#888">Email</p>
        <p style="margin:0 0 12px;font-weight:600">${safe(opts.email)}</p>
        <p style="margin:0 0 4px;font-size:13px;color:#888">Plan</p>
        <p style="margin:0 0 12px;font-weight:600">${safe(opts.plan)}</p>
        <p style="margin:0 0 4px;font-size:13px;color:#888">Stripe Subscription</p>
        <p style="margin:0;font-family:monospace;font-size:12px">${safe(opts.subId)}</p>
      </div>
    </div>`
  return { subject, html }
}

// ── Admin: Payment Failed ─────────────────────────────────────────────────────

export function buildAdminPaymentFailedEmail(opts: {
  email:     string
  invoiceId: string
  amount:    string
}): EmailTemplate {
  const safe = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const subject = `[Scout] ⚠️ Payment failed — ${opts.email}`
  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
      <div style="background:#ef4444;padding:16px 22px;border-radius:10px 10px 0 0">
        <p style="color:#fff;font-size:14px;font-weight:700;margin:0">Scout · Payment Failed — Tenant Suspended</p>
      </div>
      <div style="background:#f9f9f9;padding:22px 24px;border-radius:0 0 10px 10px;border:1px solid #e5e5e5;border-top:none">
        <p style="margin:0 0 4px;font-size:13px;color:#888">Email</p>
        <p style="margin:0 0 12px;font-weight:600">${safe(opts.email)}</p>
        <p style="margin:0 0 4px;font-size:13px;color:#888">Invoice</p>
        <p style="margin:0 0 12px;font-family:monospace;font-size:12px">${safe(opts.invoiceId)}</p>
        <p style="margin:0 0 4px;font-size:13px;color:#888">Amount due</p>
        <p style="margin:0;font-weight:600;color:#ef4444">${safe(opts.amount)}</p>
      </div>
    </div>`
  return { subject, html }
}

// ── Admin: Trial Expired ──────────────────────────────────────────────────────

export function buildAdminTrialExpiredEmail(opts: {
  email: string
  name:  string
}): EmailTemplate {
  const safe = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const subject = `[Scout] Trial expired — ${opts.email}`
  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
      <div style="background:#7C3AED;padding:16px 22px;border-radius:10px 10px 0 0">
        <p style="color:#fff;font-size:14px;font-weight:700;margin:0">Scout · Trial Expired</p>
      </div>
      <div style="background:#f9f9f9;padding:22px 24px;border-radius:0 0 10px 10px;border:1px solid #e5e5e5;border-top:none">
        <p style="margin:0 0 4px;font-size:13px;color:#888">Name</p>
        <p style="margin:0 0 12px;font-weight:600">${safe(opts.name)}</p>
        <p style="margin:0 0 4px;font-size:13px;color:#888">Email</p>
        <p style="margin:0;font-weight:600">${safe(opts.email)}</p>
      </div>
    </div>`
  return { subject, html }
}

// ── Resend sender helper ──────────────────────────────────────────────────────
// Centralizes the actual send call so all routes share identical error handling.

export const EMAIL_FROM_MARKETING = 'Mike at Scout <info@clientbloom.ai>'
export const EMAIL_FROM_SUPPORT   = 'Scout Support <info@clientbloom.ai>'
export const EMAIL_FROM_ALERTS    = 'Scout Alerts <info@clientbloom.ai>'

export async function sendEmail(opts: {
  resendKey: string
  from:      string
  to:        string
  subject:   string
  html:      string
}): Promise<boolean> {
  if (!opts.resendKey) {
    console.log(`[emails] Would send "${opts.subject}" to ${opts.to} — RESEND_API_KEY not set`)
    return false
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { Authorization: `Bearer ${opts.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: opts.from, to: [opts.to], subject: opts.subject, html: opts.html }),
    })
    if (!res.ok) {
      const body = await res.text()
      console.error(`[emails] Resend error ${res.status} for "${opts.subject}" → ${opts.to}: ${body.slice(0, 200)}`)
    }
    return res.ok
  } catch (e: any) {
    console.error(`[emails] Failed to send "${opts.subject}":`, e.message)
    return false
  }
}

// ── Transactional: Admin-Sent Credential Reset ────────────────────────────────

export function buildAdminSentResetEmail(opts: {
  email:       string
  companyName?: string
  tempPassword: string
  loginUrl:    string
}): EmailTemplate {
  const safe = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const subject = `Your Scout login has been reset`
  const body = `
    ${h2('Your login credentials have been reset')}
    ${p(`Here are your updated login details for Scout${opts.companyName ? ` (${safe(opts.companyName)})` : ''}. Please sign in and change your password in Settings.`)}
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0 20px">
      <tr style="border-bottom:1px solid #eee">
        <td style="padding:9px 0;color:#888;width:110px">Login URL</td>
        <td style="padding:9px 0"><a href="${opts.loginUrl}" style="color:${BRAND_BLUE};text-decoration:none">${opts.loginUrl}</a></td>
      </tr>
      <tr style="border-bottom:1px solid #eee">
        <td style="padding:9px 0;color:#888">Email</td>
        <td style="padding:9px 0;font-weight:500">${safe(opts.email)}</td>
      </tr>
      <tr>
        <td style="padding:9px 0;color:#888">Password</td>
        <td style="padding:9px 0;font-family:monospace;font-size:16px;font-weight:700;letter-spacing:0.05em">${safe(opts.tempPassword)}</td>
      </tr>
    </table>
    <div style="margin:20px 0">${cta('Sign in to Scout →', opts.loginUrl)}</div>
    ${p('This password was generated by your Scout administrator. If you didn\'t expect this email, please contact support.', 'font-size:12px;color:#aaa')}
  `
  const html = wrap(header('Scout — Login Reset'), body, '')
  return { subject, html }
}

// ── Transactional: Admin Grant Access (manual trial invite) ──────────────────

export function buildAdminGrantAccessEmail(opts: {
  displayName:   string
  email:         string
  tempPassword:  string
  trialEndLabel: string
  loginUrl:      string
  note?:         string
}): EmailTemplate {
  const safe = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const subject = `Your 14-day Scout trial starts now`
  const noteBlock = opts.note
    ? `<p style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;font-size:13px;color:#92400e;margin:0 0 20px">${safe(opts.note)}</p>`
    : ''
  const body = `
    ${h2('Your Scout trial is ready')}
    ${p(`Hey ${safe(opts.displayName !== opts.email ? opts.displayName : '')}, you have full Scout access for the next 14 days — completely free. Sign in, complete the 2-minute setup, and Scout will start finding high-intent LinkedIn leads automatically.`)}
    ${noteBlock}
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0 20px">
      <tr style="border-bottom:1px solid #eee">
        <td style="padding:9px 0;color:#888;width:120px">Login URL</td>
        <td style="padding:9px 0"><a href="${opts.loginUrl}" style="color:${BRAND_BLUE};text-decoration:none">${opts.loginUrl}</a></td>
      </tr>
      <tr style="border-bottom:1px solid #eee">
        <td style="padding:9px 0;color:#888">Email</td>
        <td style="padding:9px 0;font-weight:500">${safe(opts.email)}</td>
      </tr>
      <tr style="border-bottom:1px solid #eee">
        <td style="padding:9px 0;color:#888">Password</td>
        <td style="padding:9px 0;font-family:monospace;font-size:16px;font-weight:700;letter-spacing:0.05em">${safe(opts.tempPassword)}</td>
      </tr>
      <tr>
        <td style="padding:9px 0;color:#888">Trial expires</td>
        <td style="padding:9px 0;font-weight:500;color:#ef4444">${safe(opts.trialEndLabel)}</td>
      </tr>
    </table>
    ${calloutBox('What happens next', [
      'Sign in and complete the 2-minute ICP setup',
      'Scout runs your first scan automatically',
      'Check back daily — new opportunities arrive twice a day',
      `Subscribe before ${safe(opts.trialEndLabel)} to keep your data and feed running`,
    ])}
    <div style="margin:20px 0">${cta('Start my free trial →', opts.loginUrl)}</div>
  `
  const html = wrap(header('Welcome to Scout — 14-Day Free Trial'), body, '')
  return { subject, html }
}

// ── Transactional: Subscription Canceled ─────────────────────────────────────

export function buildCancellationEmail(opts: {
  name:          string
  email:         string
  periodEndDate: string   // human-readable e.g. "May 1, 2026"
  resubscribeUrl: string
}): EmailTemplate {
  const safe = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const subject = `Your Scout subscription has been canceled`
  const body = `
    ${h2('Your subscription has been canceled')}
    ${p(`Hi ${safe(opts.name || opts.email.split('@')[0])},`)}
    ${p(`Your Scout subscription is canceled and will remain active until <strong>${safe(opts.periodEndDate)}</strong>. You keep full access until that date.`)}
    ${p(`Changed your mind? You can resubscribe any time before that date and nothing will change.`)}
    <div style="margin:20px 0">${cta('Resubscribe →', opts.resubscribeUrl)}</div>
    ${p('Questions? Reply to this email — we read every one.', 'font-size:13px;color:#888')}
  `
  const html = wrap(header('Scout by ClientBloom', BRAND_DARK), body, '')
  return { subject, html }
}

// ── Trial Reactivation (30-day lapsed) ───────────────────────────────────────
// Sent manually from admin panel to expired trial users who never upgraded.
// Tone: warm, direct, no pressure — opens a door without pushing.

export function buildTrialReactivationEmail(opts: {
  companyName: string
  email:       string
  upgradeUrl:  string
  unsubUrl:    string
}): EmailTemplate {
  const safe = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const name = safe(opts.companyName || opts.email.split('@')[0])

  const subject = `Your Scout account is still here, ${name}`

  const body = `
    ${h2(`Still here when you're ready.`)}
    ${p(`Hi ${name},`)}
    ${p(`I noticed you tried Scout a little while back. I wanted to reach out — not to pitch you, but because I'm genuinely curious what got in the way.`)}
    ${p(`Most people who don't convert fall into one of three camps: the timing wasn't right, the trial moved too fast to get real results, or they just got busy. All of those make sense.`)}
    ${p(`Here's what I want you to know: everything you set up during your trial is still there. Your feed configuration, your ICP profiles, your scan settings — none of it went anywhere. If you wanted to pick back up today, you'd be running in minutes, not hours.`)}
    ${infoBox(`<strong>Scout starts at $49/month</strong> — cancel anytime, no contracts. The LinkedIn conversations your prospects are having right now are happening with or without you in them.`, BRAND_BLUE)}
    ${p(`If you're ready to give it a real run — or if you want to talk through whether it's a fit — just reply to this email. I read every one.`)}
    <div style="margin:24px 0">${cta(`Resume where you left off →`, opts.upgradeUrl)}</div>
    ${p(`Starter $49 · Pro $99 · Agency $249`, 'color:#999;font-size:12px;margin:4px 0 16px')}
    ${p(`— Mike Walker, Scout by ClientBloom`, 'color:#666;font-size:13px;margin-top:20px')}
    ${footer(opts.unsubUrl)}
  `

  return { subject, html: wrap(header('Scout by ClientBloom', BRAND_DARK), body, '') }
}

// ── Day-number dispatcher ─────────────────────────────────────────────────────
// Used by trial-check cron: given a day number (2-7), returns the correct email.

export function buildTrialDayEmail(
  day: number,
  opts: {
    appUrl:     string
    upgradeUrl: string
    unsubUrl:   string
    plan?:      RecommendedPlan
  },
): EmailTemplate | null {
  switch (day) {
    case 2: return buildTrialDay2Email(opts)
    case 3: return buildTrialDay3Email(opts)
    case 4: return buildTrialDay4Email(opts)
    case 5: return buildTrialDay5Email(opts)
    case 6: return buildTrialDay6Email(opts)
    case 7: return buildTrialDay7Email(opts)
    default: return null
  }
}
