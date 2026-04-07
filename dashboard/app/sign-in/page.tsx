'use client'

import { useState, FormEvent, useEffect, useRef } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

/** Animated canvas dot-grid background */
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
      canvas.width = w
      canvas.height = h
      dots = []
      const cols = Math.ceil(w / SPACING) + 1
      const rows = Math.ceil(h / SPACING) + 1
      for (let c = 0; c < cols; c++) {
        for (let row = 0; row < rows; row++) {
          dots.push({
            x: c * SPACING,
            y: row * SPACING,
            phase: Math.random() * Math.PI * 2,
            amp: 0.25 + Math.random() * 0.45,
          })
        }
      }
    }

    let t = 0
    function draw() {
      ctx.clearRect(0, 0, w, h)
      t += 0.007
      for (const d of dots) {
        const pulse = Math.sin(t + d.phase) * d.amp
        const opacity = 0.055 + pulse * 0.05
        const radius = 1.1 + pulse * 0.35
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

/** ClientBloom logo mark */
function ClientBloomMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="21" rx="24" ry="13" fill="#F7B731" />
      <ellipse cx="20" cy="52" rx="13" ry="25" fill="#E91E8C" />
      <ellipse cx="80" cy="52" rx="13" ry="25" fill="#00B96B" />
      <ellipse cx="50" cy="79" rx="24" ry="13" fill="#7C3AED" />
      <circle cx="50" cy="50" r="13" fill="#7C3AED" />
    </svg>
  )
}

export default function SignInPage() {
  const router   = useRouter()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await signIn('credentials', {
        email:    email.toLowerCase(),
        password,
        redirect: false,
      })
      if (result?.error) {
        setError('Invalid email or password. Please try again.')
      } else {
        router.push('/')
        router.refresh()
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#080a0f] flex">

      {/* ─── LEFT PANEL: branding + dot matrix (desktop only) ─── */}
      <div className="hidden lg:flex flex-col relative flex-1 overflow-hidden bg-[#07090e]">
        <DotMatrixCanvas />

        {/* Radial gradient overlay to focus the glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(79,107,255,0.06) 0%, #07090e 70%)',
          }}
        />

        {/* Vignette on the right edge to blend into the form panel */}
        <div
          className="absolute inset-y-0 right-0 w-32 pointer-events-none"
          style={{ background: 'linear-gradient(to right, transparent, #07090e)' }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full px-16 py-16">

          {/* Logo */}
          <div className="flex items-center gap-3">
            <ClientBloomMark size={32} />
            <div>
              <div className="text-white font-bold text-lg tracking-tight leading-none">Scout</div>
              <div className="text-slate-500 text-xs font-medium tracking-wide mt-0.5">by ClientBloom</div>
            </div>
          </div>

          {/* Center content */}
          <div className="flex-1 flex flex-col justify-center max-w-md">
            <div className="inline-flex items-center gap-2 bg-[#4F6BFF]/10 border border-[#4F6BFF]/20 rounded-full px-3 py-1 mb-8 w-fit">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4F6BFF] animate-pulse" />
              <span className="text-[#4F6BFF] text-xs font-medium tracking-wide uppercase">
                AI-Powered ICP Listener
              </span>
            </div>

            <h2 className="text-4xl font-bold text-white leading-tight mb-6">
              Your next client is<br />already posting.
            </h2>
            <p className="text-slate-400 text-base leading-relaxed mb-10">
              Scout monitors your ICP&apos;s LinkedIn activity, scores every post by conversation opportunity, and hands you the perfect thing to say — before the competition even notices.
            </p>

            <div className="space-y-4">
              {[
                { icon: '⚡', text: 'Intelligence feed updated twice daily' },
                { icon: '🎯', text: 'AI-scored posts ranked by entry point quality' },
                { icon: '💬', text: 'Comment suggestions that sound like you' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sm">{item.icon}</span>
                  <span className="text-slate-400 text-sm">{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-slate-700 text-xs">© 2026 Scout by ClientBloom</p>
        </div>
      </div>

      {/* ─── RIGHT PANEL: sign-in form ─── */}
      <div className="flex flex-col items-center justify-center w-full lg:w-[480px] lg:flex-shrink-0 px-8 py-12 relative">

        {/* Mobile dot background (hidden on desktop) */}
        <div className="lg:hidden absolute inset-0 overflow-hidden">
          <DotMatrixCanvas />
          <div className="absolute inset-0 bg-[#080a0f]/80" />
        </div>

        <div className="w-full max-w-sm relative z-10">

          {/* Mobile logo (hidden on desktop) */}
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
              <h1 className="text-white font-bold text-2xl mb-1.5 tracking-tight">Welcome back</h1>
              <p className="text-slate-500 text-sm">Sign in to access your intelligence feed.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-1.5">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full bg-[#161b27] border border-slate-700/80 rounded-xl px-4 py-3
                             text-slate-100 placeholder-slate-600 text-sm
                             focus:outline-none focus:border-[#4F6BFF] focus:ring-1 focus:ring-[#4F6BFF]/50
                             transition-all"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-slate-300 text-sm font-medium">Password</label>
                  <Link
                    href="/forgot-password"
                    className="text-slate-500 hover:text-slate-400 text-xs transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#161b27] border border-slate-700/80 rounded-xl px-4 py-3
                             text-slate-100 placeholder-slate-600 text-sm
                             focus:outline-none focus:border-[#4F6BFF] focus:ring-1 focus:ring-[#4F6BFF]/50
                             transition-all"
                />
              </div>

              {error && (
                <div className="bg-red-900/20 border border-red-800/40 rounded-xl px-4 py-3">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#4F6BFF] hover:bg-[#3D57F5] active:bg-[#3347E0]
                           disabled:opacity-50 disabled:cursor-not-allowed
                           text-white font-semibold rounded-xl py-3 text-sm mt-1
                           transition-all hover:shadow-lg hover:shadow-[#4F6BFF]/25
                           flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Signing in…
                  </>
                ) : (
                  'Sign in'
                )}
              </button>
            </form>
          </div>

          {/* Footer links */}
          <div className="flex items-center justify-center gap-1 mt-6 text-slate-600 text-xs">
            <span>New to Scout?</span>
            <a href="/api/checkout" className="text-[#4F6BFF] hover:text-[#7C8FFF] transition-colors ml-1">
              Start your free trial
            </a>
          </div>

        </div>
      </div>

    </div>
  )
}
