'use client'

import { useState, FormEvent, useEffect, useRef } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

/* ─────────────────────────────────────────────
   Animated canvas dot-grid background (same as sign-in)
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
    let w = 0, h = 0
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
          dots.push({ x: c * SPACING, y: row * SPACING, phase: Math.random() * Math.PI * 2, amp: 0.25 + Math.random() * 0.45 })
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
        const radius  = 1.1   + pulse * 0.35
        ctx.beginPath()
        ctx.arc(d.x, d.y, Math.max(0.5, radius), 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${r},${g},${b},${opacity})`
        ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }

    setup(); draw()
    const ro = new ResizeObserver(setup)
    ro.observe(canvas)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  return <canvas ref={canvasRef} className={`absolute inset-0 w-full h-full ${className}`} />
}

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
   Social proof ticker (left panel)
───────────────────────────────────────────── */
const PROOF_ITEMS = [
  { icon: '🎯', text: 'Setup takes under 10 minutes' },
  { icon: '📈', text: 'First leads surface within 24 hours' },
  { icon: '💬', text: 'AI comment suggestions on every post' },
  { icon: '🔒', text: 'No credit card — cancel anytime' },
  { icon: '⚡', text: 'Twice-daily LinkedIn scans' },
  { icon: '🤝', text: 'Your ICP, monitored 24/7' },
]

/* ─────────────────────────────────────────────
   Main sign-up page
───────────────────────────────────────────── */
export default function SignUpPage() {
  const router = useRouter()

  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/trial/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
        setLoading(false)
        return
      }

      // Account created — auto sign in
      const signInResult = await signIn('credentials', {
        redirect: false,
        email:    email.trim().toLowerCase(),
        password,
      })

      if (signInResult?.error) {
        // Account created but auto-sign-in failed — send to sign-in page
        router.replace('/sign-in?welcome=1')
        return
      }

      // Signed in — go to onboarding
      router.replace('/onboarding')
    } catch {
      setError('Network error. Please check your connection and try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#080a0f] flex">
      <style>{`
        @keyframes gradientShift {
          0%   { background-position: 0% 50%; }
          100% { background-position: 100% 50%; }
        }
      `}</style>

      {/* ── Left panel (desktop only) ── */}
      <div className="hidden lg:flex flex-col relative overflow-hidden w-[420px] shrink-0 border-r border-slate-800/60">
        <DotMatrixCanvas />

        {/* Logo */}
        <div className="relative z-10 p-8">
          <div className="flex items-center gap-3">
            <ClientBloomMark size={36} />
            <div>
              <p className="text-white font-bold text-base leading-tight">Scout</p>
              <p className="text-slate-500 text-xs">by ClientBloom</p>
            </div>
          </div>
        </div>

        {/* Headline */}
        <div className="relative z-10 px-8 mt-4 flex-1">
          <h2 className="text-3xl font-bold text-white leading-tight mb-4">
            Your next client is<br />
            <span style={{
              background: 'linear-gradient(90deg, #4F6BFF, #7C3AED, #E91E8C)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundSize: '200% auto',
              animation: 'gradientShift 5s ease-in-out infinite alternate',
            }}>
              posting right now.
            </span>
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-8">
            Scout scans LinkedIn for signals from your ideal clients and surfaces them before your competitors notice.
          </p>

          {/* Social proof items */}
          <div className="space-y-3">
            {PROOF_ITEMS.map((item) => (
              <div key={item.text} className="flex items-center gap-3">
                <span className="text-lg">{item.icon}</span>
                <span className="text-slate-300 text-sm">{item.text}</span>
              </div>
            ))}
          </div>

          {/* Trial badge */}
          <div className="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-900/30 border border-emerald-700/40">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 text-sm font-medium">7-day free trial · No card required</span>
          </div>
        </div>

        {/* Bottom attribution */}
        <div className="relative z-10 p-8">
          <p className="text-slate-600 text-xs">scout.clientbloom.ai</p>
        </div>
      </div>

      {/* ── Right panel — sign-up form ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">

        {/* Mobile logo */}
        <div className="flex lg:hidden items-center gap-3 mb-8">
          <ClientBloomMark size={32} />
          <div>
            <p className="text-white font-bold text-sm">Scout</p>
            <p className="text-slate-500 text-xs">by ClientBloom</p>
          </div>
        </div>

        <div className="w-full max-w-sm">
          {/* Header */}
          <div className="mb-7">
            <h1 className="text-2xl font-bold text-white mb-1">Start your free trial</h1>
            <p className="text-slate-400 text-sm">7 days free · No credit card · Cancel anytime</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Full name */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Full name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                autoComplete="name"
                placeholder="Jane Smith"
                className="w-full bg-[#0f1117] border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-[#4F6BFF]/50 focus:border-[#4F6BFF]/60 transition-all"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Work email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="jane@company.com"
                className="w-full bg-[#0f1117] border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-[#4F6BFF]/50 focus:border-[#4F6BFF]/60 transition-all"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="Min. 8 characters"
                className="w-full bg-[#0f1117] border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-[#4F6BFF]/50 focus:border-[#4F6BFF]/60 transition-all"
              />
            </div>

            {/* Confirm password */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="Same password again"
                className="w-full bg-[#0f1117] border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-[#4F6BFF]/50 focus:border-[#4F6BFF]/60 transition-all"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-xl bg-red-900/20 border border-red-700/40 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#4F6BFF] hover:bg-[#3d5aee] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl transition-all text-sm mt-2"
            >
              {loading ? 'Creating your account…' : 'Start free trial →'}
            </button>

          </form>

          {/* Fine print */}
          <p className="text-xs text-slate-600 text-center mt-4 leading-relaxed">
            By creating an account you agree to our{' '}
            <Link href="/terms" className="text-slate-500 hover:text-slate-300 underline underline-offset-2 transition-colors">
              Terms of Service
            </Link>
            {' '}and{' '}
            <Link href="/privacy-policy" className="text-slate-500 hover:text-slate-300 underline underline-offset-2 transition-colors">
              Privacy Policy
            </Link>
            .
          </p>

          {/* Sign in link */}
          <p className="text-center mt-6 text-sm text-slate-500">
            Already have an account?{' '}
            <Link href="/sign-in" className="text-[#4F6BFF] hover:text-[#6b84ff] font-medium transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
