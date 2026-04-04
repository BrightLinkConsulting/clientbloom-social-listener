'use client'

import { useState, FormEvent } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

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
        email:     email.toLowerCase(),
        password,
        redirect:  false,
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
    <div className="min-h-screen bg-[#0a0c10] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo / wordmark */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-[#4F6BFF] flex items-center justify-center text-white font-bold text-sm">
              CB
            </div>
            <span className="text-white font-semibold text-lg tracking-tight">ClientBloom</span>
          </div>
          <p className="text-slate-400 text-sm">Market Intelligence Dashboard</p>
        </div>

        {/* Card */}
        <div className="bg-[#0f1117] border border-slate-800 rounded-2xl p-8">
          <h1 className="text-white font-semibold text-xl mb-1">Sign in</h1>
          <p className="text-slate-400 text-sm mb-6">Enter your credentials to access your dashboard.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full bg-[#161b27] border border-slate-700 rounded-lg px-3.5 py-2.5
                           text-slate-100 placeholder-slate-500 text-sm
                           focus:outline-none focus:border-[#4F6BFF] focus:ring-1 focus:ring-[#4F6BFF]
                           transition-colors"
              />
            </div>

            <div>
              <label className="block text-slate-300 text-sm font-medium mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#161b27] border border-slate-700 rounded-lg px-3.5 py-2.5
                           text-slate-100 placeholder-slate-500 text-sm
                           focus:outline-none focus:border-[#4F6BFF] focus:ring-1 focus:ring-[#4F6BFF]
                           transition-colors"
              />
            </div>

            {error && (
              <div className="bg-red-900/20 border border-red-800/50 rounded-lg px-3.5 py-2.5">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#4F6BFF] hover:bg-[#3D57F5] disabled:opacity-60
                         text-white font-medium rounded-lg py-2.5 text-sm
                         transition-colors flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          Powered by ClientBloom.ai — Market Intelligence
        </p>
      </div>
    </div>
  )
}
