'use client'

import { useState, FormEvent, useEffect, useRef } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { trackStandardEvent } from '../../lib/meta-pixel'

/* ─────────────────────────────────────────────
   Animated canvas dot-grid background
───────────────────────────────────────────── */
function DotMatrixCanvas({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const SPACING = 28
    const { r, g, b } = { r: 79, g: 107, b: 255 }
    let raf: number
    let w = 0
    let h = 0
    let dots: Array<{ x: number; y: number; phase: number; amp: number }> = []

    function setup() {
      w = canvas.offsetWidth
      h = canvas.offsetHeight
      canvas.width  = w
      canvas.height = h
      dots = []
      const cols = Math.ceil(w / SPACING) + 1
      const rows = Math.ceil(h / SPACING) + 1
      for (let c = 0; c < cols; c++) {
        for (let row = 0; row < rows; row++) {
          dots.push({
            x:     c   * SPACING,
            y:     row * SPACING,
            phase: Math.random() * Math.PI * 2,
            amp:   0.25 + Math.random() * 0.45,
          })
        }
      }
    }

    let t = 0
    function draw() {
      ctx.clearRect(0, 0, w, h)
      t += 0.007
      for (const d of dots) {
        const pulse   = Math.sin(t + d.phase) * d.amp
        const opacity = 0.055 + pulse * 0.05
        const radius  = 1.1  + pulse * 0.35
        ctx.beginPath()
        ctx.arc(d.x, d.y, Math.max(0.5, radius), 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${r},${g},${b},${opacity})`
        ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }

    setup()
    draw()

    const ro = new ResizeObserver(setup)
    ro.observe(canvas)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} className={`absolute inset-0 w-full h-full ${className}`} />
}

/* ─────────────────────────────────────────────
   ClientBloom logo mark
───────────────────────────────────────────── */
function ClientBloomMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="21" rx="24" ry="13" fill="#F7B731" />
      <ellipse cx="20" cy="52" rx="13" ry="25" fill="#E91E8C" />
      <ellipse cx="80" cy="52" rx="13" ry="25" fill="#00B96B" />
      <ellipse cx="50" cy="79" rx="24" ry="13" fill="#7C3AED" />
      <circle  cx="50" cy="50" r="13"          fill="#7C3AED" />
    </svg>
  )
}

/* ─────────────────────────────────────────────
   Typewriter headline — cycles through endings
───────────────────────────────────────────── */
const HEADLINE_ENDINGS = [
  'posted on LinkedIn.',
  'asked for a recommendation.',
  'complained about their vendor.',
  'shared their biggest challenge.',
  'announced a new budget.',
  "said they're evaluating options.",
]

function TypewriterHeadline() {
  const [endingIndex, setEndingIndex] = useState(0)
  const [displayed,   setDisplayed]   = useState('')
  const [isDeleting,  setIsDeleting]  = useState(false)

  useEffect(() => {
    const target = HEADLINE_ENDINGS[endingIndex]

    if (!isDeleting && displayed === target) {
      const t = setTimeout(() => setIsDeleting(true), 2200)
      return () => clearTimeout(t)
    }

    if (isDeleting && displayed === '') {
      setIsDeleting(false)
      setEndingIndex(i => (i + 1) % HEADLINE_ENDINGS.length)
      return
    }

    const speed = isDeleting ? 38 : 68
    const t = setTimeout(() => {
      setDisplayed(prev =>
        isDeleting
          ? prev.slice(0, -1)
          : target.slice(0, prev.length + 1)
      )
    }, speed)

    return () => clearTimeout(t)
  }, [displayed, isDeleting, endingIndex])

  return (
    <h2 className="text-4xl font-bold text-white leading-tight mb-4">
      Your next client just<br />
      <span className="text-[#4F6BFF]">{displayed}</span>
      <span
        className="inline-block w-[2px] h-[1em] bg-[#4F6BFF] ml-0.5 align-middle"
        style={{ animation: 'blink 1s step-end infinite' }}
      />
      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </h2>
  )
}

/* ─────────────────────────────────────────────
   Mock LinkedIn post data for the live feed
───────────────────────────────────────────── */
const MOCK_POSTS = [
  { initials: 'SL', color: '#7C3AED', author: 'Sarah L.',  title: 'VP of Marketing · SaaS',        excerpt: "We just lost our third agency this year. At some point you have to ask if the problem is the vendors or the strategy...", score: 94 },
  { initials: 'JR', color: '#E91E8C', author: 'James R.',  title: 'Founder · B2B Consulting',       excerpt: "Hot take: most 'client retention' problems are actually onboarding problems in disguise. Fight me.", score: 91 },
  { initials: 'AM', color: '#00B96B', author: 'Aisha M.',  title: 'Head of Growth · FinTech',       excerpt: "Anyone else finding that their best customers came from referrals of churned customers? The irony is real.", score: 88 },
  { initials: 'TK', color: '#F7B731', author: 'Tom K.',    title: 'CEO · Digital Agency',           excerpt: "We're evaluating three new vendors this quarter. Would love recommendations from people who've actually switched recently.", score: 96 },
  { initials: 'PB', color: '#4F6BFF', author: 'Priya B.',  title: 'CMO · E-commerce',               excerpt: "The agency we hired six months ago still doesn't understand our customer. Thinking about bringing it all in-house.", score: 87 },
  { initials: 'DW', color: '#E91E8C', author: 'Derek W.',  title: 'Director of Ops · Mid-Market',   excerpt: "Open to conversations with consultants who specialize in revenue operations. DMs open, please no cold pitches.", score: 93 },
  { initials: 'NL', color: '#00B96B', author: 'Nina L.',   title: 'Chief Revenue Officer',          excerpt: "We hit our Q1 number but at the cost of our team. Time to rethink how we're running outbound before Q2 starts.", score: 89 },
]

/* ─────────────────────────────────────────────
   Scrolling live feed ticker
───────────────────────────────────────────── */
function LiveFeedTicker() {
  const posts = [...MOCK_POSTS, ...MOCK_POSTS]
  return (
    <div className="relative w-full overflow-hidden rounded-xl" style={{ height: 340 }}>
      <div className="absolute inset-x-0 top-0 z-10 h-12 pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, #080a0f 0%, transparent 100%)' }} />
      <div className="absolute inset-x-0 bottom-0 z-10 h-16 pointer-events-none"
        style={{ background: 'linear-gradient(to top, #080a0f 0%, transparent 100%)' }} />
      <div className="flex flex-col gap-3"
        style={{ animation: 'scrollUp 28s linear infinite', willChange: 'transform' }}>
        {posts.map((post, i) => (
          <div key={i} className="rounded-xl border border-slate-800/70 bg-[#0d1018]/80 backdrop-blur-sm px-4 py-3 mx-0.5">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                style={{ background: post.color }}>{post.initials}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div>
                    <span className="text-white text-xs font-semibold">{post.author}</span>
                    <span className="text-slate-600 text-xs ml-1">· {post.title}</span>
                  </div>
                  <div className="flex-shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded-md"
                    style={{
                      background: post.score >= 93 ? 'rgba(79,107,255,0.15)' : 'rgba(79,107,255,0.08)',
                      color:      post.score >= 93 ? '#818cf8' : '#6272b8',
                      border:     '1px solid rgba(79,107,255,0.2)',
                    }}>{post.score}</div>
                </div>
                <p className="text-slate-500 text-xs leading-relaxed line-clamp-2">{post.excerpt}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <style>{`@keyframes scrollUp{0%{transform:translateY(0)}100%{transform:translateY(-50%)}}`}</style>
    </div>
  )
}

/* ─────────────────────────────────────────────
   Eye toggle icon
───────────────────────────────────────────── */
function EyeIcon({ open }: { open: boolean }) {
  return open
    ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
    : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
}

/* ─────────────────────────────────────────────
   Page
───────────────────────────────────────────── */
export default function SignUpPage() {
  const router = useRouter()

  const [name,        setName]        = useState('')
  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [confirm,     setConfirm]     = useState('')
  const [error,       setError]       = useState('')
  const [loading,     setLoading]     = useState(false)
  const [showPass,    setShowPass]    = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (password.length < 8)  { setError('Password must be at least 8 characters.'); return }

    setLoading(true)
    try {
      const res  = await fetch('/api/trial/start', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), password }),
      })
      const data = await res.json()

      if (res.status === 409) {
        if (data.action === 'sign_in') {
          setError('An account with this email already exists. Please sign in instead.')
        } else if (data.action === 'upgrade') {
          setError('Your trial has expired. Redirecting to upgrade…')
          setTimeout(() => router.replace('/upgrade'), 1800)
        } else {
          setError(data.error || 'Account already exists.')
        }
        return
      }

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
        return
      }

      // Auto sign-in after account created
      const result = await signIn('credentials', {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      })

      if (result?.error) {
        setError('Account created but sign-in failed. Please go to the sign-in page.')
        return
      }

      // Fire Meta Pixel SubmitApplication event — ties this signup to the
      // Meta ad that drove the visit. Safe no-op when Pixel hasn't loaded.
      trackStandardEvent('SubmitApplication', {
        content_name: 'Scout 7-Day Free Trial',
      })

      router.replace('/onboarding')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#080a0f] flex flex-col items-center justify-center relative overflow-hidden px-6 py-12">

      {/* Full-screen animated dot background */}
      <DotMatrixCanvas />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 90% 70% at 50% 50%, rgba(79,107,255,0.07) 0%, #080a0f 68%)' }}
      />

      {/* Centered two-column layout */}
      <div className="relative z-10 w-full max-w-4xl flex flex-col lg:flex-row items-center gap-12 lg:gap-16">

        {/* LEFT: branding + live feed (desktop only) */}
        <div className="hidden lg:flex flex-col flex-1 min-w-0">

          <div className="flex items-center gap-3 mb-10">
            <ClientBloomMark size={32} />
            <div>
              <div className="text-white font-bold text-lg tracking-tight leading-none">Scout</div>
              <div className="text-slate-500 text-xs font-medium tracking-wide mt-0.5">by ClientBloom</div>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 bg-[#4F6BFF]/10 border border-[#4F6BFF]/20 rounded-full px-3 py-1 mb-8 w-fit">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4F6BFF] animate-pulse" />
            <span className="text-[#4F6BFF] text-xs font-medium tracking-wide uppercase">AI-Powered ICP Listener</span>
          </div>

          <TypewriterHeadline />
          <p className="text-slate-500 text-sm leading-relaxed mb-6">
            Scout surfaces the posts your ICP is writing right now — scored by conversation opportunity.
          </p>

          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"
              style={{ boxShadow: '0 0 6px #34d399', animation: 'pulse 1.5s ease-in-out infinite' }} />
            <span className="text-emerald-400 text-[12px] font-semibold tracking-widest uppercase">Live Intelligence Feed</span>
          </div>

          <LiveFeedTicker />
        </div>

        {/* RIGHT: sign-up form */}
        <div className="w-full lg:w-[400px] lg:flex-shrink-0">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-10">
            <ClientBloomMark size={40} />
            <div>
              <div className="text-white font-bold text-2xl tracking-tight leading-none">Scout</div>
              <div className="text-slate-500 text-xs font-medium tracking-wide mt-0.5">by ClientBloom</div>
            </div>
          </div>

          {/* Card */}
          <div className="bg-[#0f1117] border border-slate-800 rounded-2xl p-8 shadow-2xl shadow-black/60">

            <div className="mb-7">
              <h1 className="text-white font-bold text-2xl mb-1.5 tracking-tight">Start your free trial</h1>
              <p className="text-slate-500 text-sm">7 days free · No credit card · Cancel anytime</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">

              <div>
                <label className="block text-slate-300 text-sm font-medium mb-1.5">Full name</label>
                <input type="text" required value={name} onChange={e => setName(e.target.value)}
                  placeholder="Jane Smith" autoComplete="name"
                  className="w-full bg-[#161b27] border border-slate-700/80 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:border-[#4F6BFF] focus:ring-1 focus:ring-[#4F6BFF]/50 transition-all" />
              </div>

              <div>
                <label className="block text-slate-300 text-sm font-medium mb-1.5">Work email</label>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="jane@company.com" autoComplete="email"
                  className="w-full bg-[#161b27] border border-slate-700/80 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:border-[#4F6BFF] focus:ring-1 focus:ring-[#4F6BFF]/50 transition-all" />
              </div>

              <div>
                <label className="block text-slate-300 text-sm font-medium mb-1.5">Password</label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="Min. 8 characters" autoComplete="new-password"
                    className="w-full bg-[#161b27] border border-slate-700/80 rounded-xl px-4 py-3 pr-11 text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:border-[#4F6BFF] focus:ring-1 focus:ring-[#4F6BFF]/50 transition-all" />
                  <button type="button" onClick={() => setShowPass(v => !v)} tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors">
                    <EyeIcon open={showPass} />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 text-sm font-medium mb-1.5">Confirm password</label>
                <div className="relative">
                  <input type={showConfirm ? 'text' : 'password'} required value={confirm} onChange={e => setConfirm(e.target.value)}
                    placeholder="Same password again" autoComplete="new-password"
                    className="w-full bg-[#161b27] border border-slate-700/80 rounded-xl px-4 py-3 pr-11 text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:border-[#4F6BFF] focus:ring-1 focus:ring-[#4F6BFF]/50 transition-all" />
                  <button type="button" onClick={() => setShowConfirm(v => !v)} tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors">
                    <EyeIcon open={showConfirm} />
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-900/20 border border-red-800/40 rounded-xl px-4 py-3">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full bg-[#4F6BFF] hover:bg-[#3D57F5] active:bg-[#3347E0] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 text-sm mt-1 transition-all hover:shadow-lg hover:shadow-[#4F6BFF]/25 flex items-center justify-center gap-2">
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Creating your account…
                  </>
                ) : 'Start free trial →'}
              </button>

              <p className="text-slate-600 text-xs text-center leading-relaxed">
                By creating an account you agree to our{' '}
                <Link href="/terms" className="text-slate-500 hover:text-slate-400 underline underline-offset-2 transition-colors">Terms of Service</Link>
                {' '}and{' '}
                <Link href="/privacy-policy" className="text-slate-500 hover:text-slate-400 underline underline-offset-2 transition-colors">Privacy Policy</Link>
              </p>
            </form>
          </div>

          <div className="flex items-center justify-center gap-1 mt-6 text-slate-600 text-xs">
            <span>Already have an account?</span>
            <Link href="/sign-in" className="text-[#4F6BFF] hover:text-[#7C8FFF] transition-colors ml-1">Sign in</Link>
          </div>
        </div>
      </div>

      <p className="relative z-10 text-slate-700 text-xs mt-12">© 2026 Scout by ClientBloom</p>
    </div>
  )
}
