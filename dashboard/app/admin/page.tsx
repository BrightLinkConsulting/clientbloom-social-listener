'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

// ── Types ──────────────────────────────────────────────────────────────────
interface Tenant {
  id:             string
  email:          string
  companyName:    string
  airtableBaseId: string
  hasToken:       boolean
  status:         string
  isAdmin:        boolean
  plan:           string
  createdAt:      string
}

interface StatsData {
  source:         'stripe' | 'stub'
  mrr:            number
  arr:            number
  activeCount:    number
  suspendedCount: number
  totalTenants:   number
  revenueChart:   { month: string; revenue: number }[]
  activity:       { id: string; type: string; time: number; email: string }[]
}

// ── Event display helpers ──────────────────────────────────────────────────
function eventLabel(type: string) {
  switch (type) {
    case 'checkout.session.completed':   return { label: 'New subscriber',    color: 'text-emerald-400', dot: 'bg-emerald-400' }
    case 'invoice.payment_succeeded':    return { label: 'Payment succeeded', color: 'text-emerald-400', dot: 'bg-emerald-400' }
    case 'invoice.payment_failed':       return { label: 'Payment failed',    color: 'text-amber-400',   dot: 'bg-amber-400'   }
    case 'customer.subscription.deleted': return { label: 'Subscription canceled', color: 'text-red-400', dot: 'bg-red-400' }
    default: return { label: type, color: 'text-slate-400', dot: 'bg-slate-400' }
  }
}

function timeAgo(unix: number): string {
  const diff = Date.now() - unix * 1000
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

// ── Stat card ──────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, accent = false,
}: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-5 ${
      accent
        ? 'bg-[#4F6BFF]/10 border-[#4F6BFF]/30'
        : 'bg-[#0f1117] border-slate-800'
    }`}>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-widest mb-1.5">{label}</p>
      <p className={`text-2xl font-bold ${accent ? 'text-[#4F6BFF]' : 'text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Custom tooltip for chart ───────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#1a1d27] border border-slate-700 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-white">${payload[0].value.toFixed(0)}</p>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [tenants,   setTenants]   = useState<Tenant[]>([])
  const [stats,     setStats]     = useState<StatsData | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [statsLoad, setStatsLoad] = useState(true)
  const [error,     setError]     = useState('')
  const [showForm,  setShowForm]  = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [success,   setSuccess]   = useState('')
  const [tab,       setTab]       = useState<'overview' | 'tenants'>('overview')

  const [form, setForm] = useState({
    email:          '',
    password:       '',
    companyName:    '',
    airtableBaseId: '',
    airtableToken:  '',
    plan:           'Scout $49',
    isAdmin:        false,
  })

  useEffect(() => {
    if (status === 'loading') return
    if (!(session?.user as any)?.isAdmin) {
      router.push('/')
      return
    }
    fetchTenants()
    fetchStats()
  }, [session, status]) // eslint-disable-line

  async function fetchTenants() {
    setLoading(true)
    setError('')
    try {
      const resp = await fetch('/api/admin/tenants')
      if (!resp.ok) {
        const d = await resp.json()
        setError(d.error || 'Failed to load tenants')
        return
      }
      const data = await resp.json()
      setTenants(data.tenants || [])
    } catch {
      setError('Network error — could not load tenants')
    } finally {
      setLoading(false)
    }
  }

  async function fetchStats() {
    setStatsLoad(true)
    try {
      const resp = await fetch('/api/admin/stripe-stats')
      if (resp.ok) {
        const data = await resp.json()
        setStats(data)
      }
    } catch {
      // non-critical — stats can fail silently
    } finally {
      setStatsLoad(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSuccess('')
    setError('')
    try {
      const resp = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await resp.json()
      if (!resp.ok) {
        setError(data.error || 'Failed to create tenant')
        return
      }
      setSuccess(`Tenant "${data.tenant.companyName}" created.`)
      setShowForm(false)
      setForm({ email: '', password: '', companyName: '', airtableBaseId: '', airtableToken: '', plan: 'Scout $49', isAdmin: false })
      fetchTenants()
      fetchStats()
    } catch {
      setError('Network error — could not create tenant')
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusToggle(tenant: Tenant) {
    const newStatus = tenant.status === 'Active' ? 'Suspended' : 'Active'
    try {
      const resp = await fetch('/api/admin/tenants', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: tenant.id, status: newStatus }),
      })
      if (resp.ok) { fetchTenants(); fetchStats() }
    } catch {}
  }

  if (status === 'loading') {
    return <div className="min-h-screen bg-[#0a0c10] flex items-center justify-center"><p className="text-slate-400">Loading…</p></div>
  }

  const user = session?.user as any

  return (
    <div className="min-h-screen bg-[#0a0c10] text-slate-200">

      {/* ── Header ── */}
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between sticky top-0 z-30 bg-[#0a0c10]/95 backdrop-blur">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="text-slate-400 hover:text-slate-200 text-sm transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Dashboard
          </button>
          <span className="text-slate-700">|</span>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-[#4F6BFF] flex items-center justify-center text-white font-bold text-xs">CB</div>
            <span className="font-semibold text-sm">Scout Admin</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {stats && (
            <span className={`text-xs px-2 py-0.5 rounded-full border ${
              stats.source === 'stripe'
                ? 'bg-emerald-900/20 border-emerald-800/40 text-emerald-400'
                : 'bg-slate-800/60 border-slate-700 text-slate-400'
            }`}>
              {stats.source === 'stripe' ? 'Live Stripe data' : 'Stripe not connected'}
            </span>
          )}
          <span className="text-slate-500 text-xs">{user?.email}</span>
        </div>
      </header>

      {/* ── Tab nav ── */}
      <div className="border-b border-slate-800 px-6">
        <div className="flex gap-1 max-w-5xl mx-auto">
          {(['overview', 'tenants'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                tab === t
                  ? 'border-[#4F6BFF] text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* ── Overview tab ── */}
        {tab === 'overview' && (
          <div className="space-y-8">

            {/* Status messages */}
            {error && (
              <div className="bg-red-900/20 border border-red-800/50 rounded-lg px-4 py-3">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* KPI cards */}
            {statsLoad ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1,2,3,4].map(i => (
                  <div key={i} className="bg-[#0f1117] border border-slate-800 rounded-xl p-5 animate-pulse">
                    <div className="h-3 bg-slate-800 rounded w-1/2 mb-3" />
                    <div className="h-7 bg-slate-800 rounded w-3/4" />
                  </div>
                ))}
              </div>
            ) : stats ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  label="MRR"
                  value={`$${stats.mrr.toLocaleString()}`}
                  sub={`$${stats.arr.toLocaleString()}/yr run rate`}
                  accent
                />
                <StatCard
                  label="Active subscribers"
                  value={String(stats.activeCount)}
                  sub={`${stats.totalTenants} total accounts`}
                />
                <StatCard
                  label="Suspended"
                  value={String(stats.suspendedCount)}
                  sub="Access disabled"
                />
                <StatCard
                  label="Revenue / sub"
                  value="$49"
                  sub="per month, flat"
                />
              </div>
            ) : null}

            {/* Revenue chart */}
            {stats && stats.revenueChart.length > 0 && (
              <div className="bg-[#0f1117] border border-slate-800 rounded-xl p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="font-semibold text-white">Monthly revenue</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Last 6 months</p>
                  </div>
                  {stats.source === 'stub' && (
                    <span className="text-xs text-slate-500">Connect Stripe for live data</span>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={stats.revenueChart} barSize={28}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2130" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={v => v === 0 ? '' : `$${v}`}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(79,107,255,0.06)' }} />
                    <Bar dataKey="revenue" fill="#4F6BFF" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Recent activity */}
            {stats && (
              <div className="bg-[#0f1117] border border-slate-800 rounded-xl p-6">
                <h2 className="font-semibold text-white mb-4">Recent activity</h2>
                {stats.activity.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-slate-500 text-sm">
                      {stats.source === 'stub'
                        ? 'Connect Stripe to see live subscription events here.'
                        : 'No recent activity.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {stats.activity.map(a => {
                      const { label, color, dot } = eventLabel(a.type)
                      return (
                        <div key={a.id} className="flex items-center justify-between py-2.5 border-b border-slate-800/50 last:border-0">
                          <div className="flex items-center gap-3">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                            <div>
                              <p className={`text-sm font-medium ${color}`}>{label}</p>
                              {a.email && <p className="text-xs text-slate-500">{a.email}</p>}
                            </div>
                          </div>
                          <span className="text-xs text-slate-600 shrink-0">{timeAgo(a.time)}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Stripe setup CTA */}
            {stats?.source === 'stub' && (
              <div className="bg-[#4F6BFF]/5 border border-[#4F6BFF]/20 rounded-xl p-5 flex items-start gap-4">
                <div className="w-8 h-8 rounded-lg bg-[#4F6BFF]/20 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-[#4F6BFF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-white mb-1">Connect Stripe for live billing data</p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Add <code className="font-mono text-slate-300 bg-slate-800 px-1 rounded">STRIPE_SECRET_KEY</code>,{' '}
                    <code className="font-mono text-slate-300 bg-slate-800 px-1 rounded">STRIPE_PRICE_ID</code>, and{' '}
                    <code className="font-mono text-slate-300 bg-slate-800 px-1 rounded">STRIPE_WEBHOOK_SECRET</code>{' '}
                    to your Vercel environment variables, then redeploy.
                  </p>
                </div>
              </div>
            )}

          </div>
        )}

        {/* ── Tenants tab ── */}
        {tab === 'tenants' && (
          <div className="space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold text-white">Tenants</h1>
                <p className="text-slate-400 text-sm mt-0.5">
                  Each tenant has isolated data in their own Airtable base.
                </p>
              </div>
              <button
                onClick={() => { setShowForm(!showForm); setError(''); setSuccess('') }}
                className="bg-[#4F6BFF] hover:bg-[#3D57F5] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {showForm ? 'Cancel' : '+ Add Tenant'}
              </button>
            </div>

            {/* Status messages */}
            {error && (
              <div className="bg-red-900/20 border border-red-800/50 rounded-lg px-4 py-3">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}
            {success && (
              <div className="bg-green-900/20 border border-green-800/50 rounded-lg px-4 py-3">
                <p className="text-green-400 text-sm">{success}</p>
              </div>
            )}

            {/* Add tenant form */}
            {showForm && (
              <div className="bg-[#0f1117] border border-slate-800 rounded-xl p-6">
                <h2 className="font-semibold text-white mb-4">New Tenant</h2>
                <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">

                  <div>
                    <label className="block text-slate-300 text-xs font-medium mb-1">Email *</label>
                    <input
                      type="email" required value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="user@company.com"
                      className="w-full bg-[#161b27] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-[#4F6BFF]"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 text-xs font-medium mb-1">Password *</label>
                    <input
                      type="password" required value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      placeholder="Temporary password"
                      className="w-full bg-[#161b27] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-[#4F6BFF]"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 text-xs font-medium mb-1">Company Name</label>
                    <input
                      type="text" value={form.companyName}
                      onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))}
                      placeholder="Acme Corp"
                      className="w-full bg-[#161b27] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-[#4F6BFF]"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 text-xs font-medium mb-1">Plan</label>
                    <select
                      value={form.plan}
                      onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}
                      className="w-full bg-[#161b27] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-[#4F6BFF]"
                    >
                      <option>Scout $49</option>
                      <option>Owner</option>
                      <option>Trial</option>
                      <option>Complimentary</option>
                    </select>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-slate-300 text-xs font-medium mb-1">
                      Airtable Base ID <span className="text-slate-500 font-normal">(optional — customer can add in Settings)</span>
                    </label>
                    <input
                      type="text" value={form.airtableBaseId}
                      onChange={e => setForm(f => ({ ...f, airtableBaseId: e.target.value }))}
                      placeholder="appXXXXXXXXXXXXXX"
                      className="w-full bg-[#161b27] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-[#4F6BFF] font-mono"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-slate-300 text-xs font-medium mb-1">
                      Airtable API Token <span className="text-slate-500 font-normal">(optional)</span>
                    </label>
                    <input
                      type="password" value={form.airtableToken}
                      onChange={e => setForm(f => ({ ...f, airtableToken: e.target.value }))}
                      placeholder="patXXXXXXXXXXXXXX"
                      className="w-full bg-[#161b27] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-[#4F6BFF] font-mono"
                    />
                  </div>

                  <div className="col-span-2 flex items-center gap-2">
                    <input
                      type="checkbox" id="isAdmin" checked={form.isAdmin}
                      onChange={e => setForm(f => ({ ...f, isAdmin: e.target.checked }))}
                      className="w-4 h-4 accent-[#4F6BFF]"
                    />
                    <label htmlFor="isAdmin" className="text-slate-300 text-sm">Grant admin access</label>
                  </div>

                  <div className="col-span-2 flex justify-end gap-3 pt-2">
                    <button
                      type="button" onClick={() => setShowForm(false)}
                      className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit" disabled={saving}
                      className="bg-[#4F6BFF] hover:bg-[#3D57F5] disabled:opacity-60 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
                    >
                      {saving ? 'Creating…' : 'Create Tenant'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Tenant list */}
            {loading ? (
              <div className="text-center py-16 text-slate-500">Loading tenants…</div>
            ) : tenants.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-slate-400 text-sm">No tenants yet. Add your first tenant to get started.</p>
              </div>
            ) : (
              <div className="bg-[#0f1117] border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="text-left text-slate-400 font-medium px-5 py-3">Company</th>
                      <th className="text-left text-slate-400 font-medium px-5 py-3">Email</th>
                      <th className="text-left text-slate-400 font-medium px-5 py-3">Base ID</th>
                      <th className="text-left text-slate-400 font-medium px-5 py-3">Plan</th>
                      <th className="text-left text-slate-400 font-medium px-5 py-3">Status</th>
                      <th className="text-left text-slate-400 font-medium px-5 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map((t, i) => (
                      <tr key={t.id} className={i < tenants.length - 1 ? 'border-b border-slate-800/50' : ''}>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-[#1a2235] border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
                              {t.companyName?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <div>
                              <p className="text-slate-200 font-medium">{t.companyName || '—'}</p>
                              {t.isAdmin && (
                                <span className="text-[10px] bg-[#4F6BFF]/20 text-[#4F6BFF] px-1.5 py-0.5 rounded font-medium">Admin</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-slate-400">{t.email}</td>
                        <td className="px-5 py-3.5 font-mono text-xs text-slate-500">
                          {t.airtableBaseId ? `${t.airtableBaseId.slice(0, 10)}…` : (
                            <span className="text-amber-500/70">Not set</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-slate-400">{t.plan || '—'}</td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                            t.status === 'Active'
                              ? 'bg-green-900/30 text-green-400'
                              : 'bg-red-900/30 text-red-400'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${t.status === 'Active' ? 'bg-green-400' : 'bg-red-400'}`} />
                            {t.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <button
                            onClick={() => handleStatusToggle(t)}
                            className="text-xs text-slate-400 hover:text-slate-200 transition-colors underline underline-offset-2"
                          >
                            {t.status === 'Active' ? 'Suspend' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Onboarding instructions */}
            <div className="bg-[#0f1117] border border-slate-800 rounded-xl p-6">
              <h2 className="font-semibold text-white mb-3">Onboarding a new customer manually</h2>
              <ol className="space-y-2 text-slate-400 text-sm">
                <li className="flex gap-2"><span className="text-[#4F6BFF] font-bold flex-shrink-0">1.</span> Duplicate the ClientBloom Airtable template base for the customer.</li>
                <li className="flex gap-2"><span className="text-[#4F6BFF] font-bold flex-shrink-0">2.</span> Have them create a personal Airtable access token with read/write permissions on their new base.</li>
                <li className="flex gap-2"><span className="text-[#4F6BFF] font-bold flex-shrink-0">3.</span> Copy their Base ID and token, then click <strong className="text-slate-300">+ Add Tenant</strong> above.</li>
                <li className="flex gap-2"><span className="text-[#4F6BFF] font-bold flex-shrink-0">4.</span> Share the dashboard URL and their login credentials with the customer.</li>
                <li className="flex gap-2"><span className="text-[#4F6BFF] font-bold flex-shrink-0">5.</span> They log in, go to Settings → Business Profile, and complete their setup.</li>
              </ol>
              <p className="text-slate-500 text-xs mt-4">
                When Stripe is connected, new signups are provisioned automatically — no manual steps required.
              </p>
            </div>

          </div>
        )}

      </div>
    </div>
  )
}
