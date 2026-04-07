'use client'

import { useState, FormEvent, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'

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

function ScoutWordmark({ iconSize = 36 }: { iconSize?: number }) {
  return (
    <div className="inline-flex items-center gap-3">
      <ClientBloomMark size={iconSize} />
      <div className="text-left">
        <div className="text-white font-bold text-xl tracking-tight leading-none">Scout</div>
        <div className="text-slate-400 text-xs font-medium tracking-wide mt-0.5">by ClientBloom</div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const token = searchParams.get('token')
  const email = searchParams.get('email')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [invalidLink, setInvalidLink] = useState(!token || !email)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          email,
          newPassword: password,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        setSuccess(true)
        setTimeout(() => router.push('/sign-in'), 3000)
      } else {
        setError(data.error || 'Something went wrong. Please try again.')
        if (data.error.includes('expired')) {
          setInvalidLink(true)
        }
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#080a0f] flex flex-col items-center justify-center px-4">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#4F6BFF]/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative">
        {/* Wordmark */}
        <div className="text-center mb-10">
          <ScoutWordmark iconSize={44} />
        </div>

        {/* Card */}
        <div className="bg-[#0f1117] border border-slate-800 rounded-2xl p-8 shadow-2xl shadow-black/40">
          {invalidLink ? (
            <>
              <h1 className="text-white font-bold text-2xl mb-3 tracking-tight">Link expired or invalid</h1>
              <p className="text-slate-400 text-sm mb-6">
                This password reset link has expired or is invalid. Please request a new one.
              </p>

              <Link
                href="/forgot-password"
                className="block w-full bg-[#4F6BFF] hover:bg-[#3D57F5] active:bg-[#3347E0]
                           text-white font-semibold rounded-xl py-3 text-sm text-center
                           transition-all hover:shadow-lg hover:shadow-[#4F6BFF]/25 mb-3"
              >
                Request new reset link
              </Link>

              <Link
                href="/sign-in"
                className="block w-full bg-slate-800 hover:bg-slate-700 active:bg-slate-600
                           text-slate-100 font-semibold rounded-xl py-3 text-sm text-center
                           transition-all"
              >
                Back to sign in
              </Link>
            </>
          ) : success ? (
            <>
              <h1 className="text-white font-bold text-2xl mb-3 tracking-tight">Password updated</h1>
              <p className="text-slate-400 text-sm mb-6">
                Your password has been successfully reset. You'll be redirected to sign in shortly.
              </p>

              <div className="flex items-center justify-center gap-2 text-slate-400 text-sm">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Redirecting...
              </div>
            </>
          ) : (
            <>
              <h1 className="text-white font-bold text-2xl mb-1 tracking-tight">Create new password</h1>
              <p className="text-slate-500 text-sm mb-7">
                Enter your new password below.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-1.5">New password</label>
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

                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-1.5">Confirm password</label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
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
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      Setting password...
                    </>
                  ) : (
                    'Set new password'
                  )}
                </button>
              </form>

              <div className="mt-6 text-center">
                <Link
                  href="/sign-in"
                  className="text-slate-400 hover:text-slate-300 text-sm transition-colors"
                >
                  Back to sign in
                </Link>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-2 mt-8">
          <ClientBloomMark size={16} />
          <span className="text-slate-600 text-xs">ClientBloom.ai &copy; 2026</span>
        </div>
      </div>
    </div>
  )
}
