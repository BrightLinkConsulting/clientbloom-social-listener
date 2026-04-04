'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

// ─── Apify affiliate link — replace with your approved affiliate URL ───────────
const APIFY_AFFILIATE_URL = 'https://apify.com?fpr=YOUR_CODE'

// ── Types ──────────────────────────────────────────────────────────────────────
interface Tenant {
  id:             string
  email:          string
  companyName:    string
  airtableBaseId: string
  hasToken:       boolean
  hasApifyKey:    boolean
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

// ── Helpers ────────────────────────────────────────────────────────────────────
function eventLabel(type: string) {
  switch (type) {
    case 'checkout.session.completed':    return { label: 'New subscriber',       color: 'text-emerald-400', dot: 'bg-emerald-400' }
    case 'invoice.payment_succeeded':     return { label: 'Payment succeeded',    color: 'text-emerald-400', dot: 'bg-emerald-400' }
    case 'invoice.payment_failed':        return { label: 'Payment failed',       color: 'text-amber-400',   dot: 'bg-amber-400'   }
    case 'customer.subscription.deleted': return { label: 'Subscription canceled', color: 'text-red-400',   dot: 'bg-red-400'     }
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
  return `${Math.floor(hrs / 24)}d ago`
}

function StatCard({ label, value, sub, accent = false }: {
  label: string; value: string; sub?: string; accent?: boolean
}) {
  return (
    <div className={`rounded-xl border p-5 ${
      accent ? 'bg-[#4F6BFF]/10 border-[#4F6BFF]/30' : 'bg-[#0f1117] border-slate-800'
    }`}>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-widest mb-1.5">{label}</p>
      <p className={`text-2xl font-bold ${accent ? 'text-[#4F6BFF]' : 'text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#1a1d27] border border-slate-700 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-white">${payload[0].value.toFixed(0)}</p>
    </div>
  )
}

// ── Apify pool badge ───────────────────────────────────────────────────────────
function ApifyPoolBadge({ hasKey }: { hasKey: boolean }) {
  return hasKey ? (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-900/30 text-emerald-400 border border-emerald-800/40">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
      Custom key
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-800/60 text-slate-400 border border-slate-700">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
      Shared pool
    </span>
  )
}

// ── Apify management panel (inline expansion) ──────────────────────────────────
function ApifyPanel({
  tenant,
  onClose,
  onSaved,
}: {
  tenant: Tenant
  onClose: () => void
  onSaved: () => void
}) {
  const [keyInput,   setKeyInput]   = useState('')
  const [saving,     setSaving]     = useState(false)
  const [clearing,   setClearing]   = useState(false)
  const [msg,        setMsg]        = useState('')
  const [error,      setError]      = useState('')

  async function handleSave() {
    if (!keyInput.trim()) return
    setSaving(true); setMsg(''); setError('')
    try {
      const resp = await fetch('/api/admin/tenants', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: tenant.id, apifyKey: keyInput.trim() }),
      })
      if (resp.ok) { setMsg('Key saved.'); setKeyInput(''); onSaved() }
      else { const d = await resp.json(); setError(d.error || 'Save failed') }
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  async function handleClear() {
    setClearing(true); setMsg(''); setError('')
    try {
      const resp = await fetch('/api/admin/tenants', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: tenant.id, apifyKey: '' }),
      })
      if (resp.ok) { setMsg('Reverted to shared pool.'); onSaved() }
      else { const d = await resp.json(); setError(d.error || 'Clear failed') }
    } catch { setError('Network error') }
    finally { setClearing(false) }
  }

  return (
    <tr>
      <td colSpan={7} className="p-0">
        <div className="mx-4 mb-4 rounded-xl border border-slate-700 bg-[#0d1017] overflow-hidden">

          {/* Panel header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-[#0f1117]">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded bg-[#1a2235] border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
                {tenant.companyName?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <span className="text-sm font-medium text-white">
                {tenant.companyName || tenant.email}
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-xs text-slate-400">{tenant.email}</span>
            </div>
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="px-5 py-4 grid grid-cols-2 gap-6">

            {/* Left: current status + key form */}
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Scanning Pool</p>

                {/* Status card */}
                <div className={`rounded-lg border px-4 py-3 mb-3 ${
                  tenant.hasApifyKey
                    ? 'bg-emerald-900/10 border-emerald-800/30'
                    : 'bg-slate-800/30 border-slate-700'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${tenant.hasApifyKey ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                    <p className={`text-sm font-medium ${tenant.hasApifyKey ? 'text-emerald-300' : 'text-slate-300'}`}>
                      {tenant.hasApifyKey ? 'Custom Apify account active' : 'Using Scout shared pool'}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500 ml-4">
                    {tenant.hasApifyKey
                      ? 'This tenant\'s scans run on their own Apify account, isolated from other tenants.'
                      : 'Scans run on Scout\'s shared Apify account. Included in subscription.'}
                  </p>
                </div>

                {/* Key input */}
                <p className="text-xs text-slate-400 mb-1.5">
                  {tenant.hasApifyKey ? 'Update Apify key' : 'Assign custom Apify key'}
                </p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={keyInput}
                    onChange={e => setKeyInput(e.target.value)}
                    placeholder="apify_api_XXXXXXXXXXXXXXXXXXXX"
                    className="flex-1 bg-[#161b27] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder-slate-600 focus:outline-none focus:border-[#4F6BFF] font-mono"
                  />
                  <button
                    onClick={handleSave}
                    disabled={saving || !keyInput.trim()}
                    className="bg-[#4F6BFF] hover:bg-[#3D57F5] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
                  >
                    {saving ? 'Saving…' : 'Save key'}
                  </button>
                </div>

                {/* Clear key */}
                {tenant.hasApifyKey && (
                  <button
                    onClick={handleClear}
                    disabled={clearing}
                    className="mt-2 text-xs text-slate-500 hover:text-red-400 transition-colors underline underline-offset-2"
                  >
                    {clearing ? 'Reverting…' : 'Remove key — revert to shared pool'}
                  </button>
                )}

                {/* Feedback */}
                {msg && <p className="text-xs text-emerald-400 mt-2">{msg}</p>}
                {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
              </div>
            </div>

            {/* Right: affiliate link section */}
            <div className="border-l border-slate-800 pl-6">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Give Them Their Own Account</p>
              <p className="text-xs text-slate-500 leading-relaxed mb-4">
                If this customer wants higher scan limits or complete isolation, they can sign up for their own Apify account.
                Use your affiliate link — you'll earn a commission on their subscription.
              </p>
              <a
                href={APIFY_AFFILIATE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-[#161b27] hover:bg-[#1e2538] border border-slate-700 hover:border-slate-600 text-slate-300 text-sm font-medium px-4 py-2.5 rounded-lg transition-all"
              >
                <svg className="w-4 h-4 text-orange-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
                Sign up for Apify
                <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
              <p className="text-[11px] text-slate-600 mt-2">
                After they sign up, paste their API key above to activate.
              </p>
            </div>

          </div>
        </div>
      </td>
    </tr>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [tenants,       setTenants]       = useState<Tenant[]>([])
  const [stats,         setStats]         = useState<StatsData | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [statsLoad,     setStatsLoad]     = useState(true)
  const [error,         setError]         = useState('')
  const [showForm,      setShowForm]      = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [success,       setSuccess]       = useState('')
  const [tab,           setTab]           = useState<'overview' | 'tenants'>('overview')
  const [expandedApify, setExpandedApify] = useState<string | null>(null)

  const [form, setForm] = useState({
    email:          '',
    password:       '',
    companyName:    '',
    airtableBaseId: '',
    airtableToken:  '',
    plan:           'Scout $79',
    isAdmin:        false,
  })

  useEffect(() => {
    if (status === 'loading') return
    if (!(session?.user as any)?.isAdmin) { router.push('/'); return }
    fetchTenants()
    fetchStats()
  }, [session, status]) // eslint-disable-line

  async function fetchTenants() {
    setLoading(true); setError('')
    try {
      const resp = await fetch('/api/admin/tenants')
      if (!resp.ok) { const d = await resp.json(); setError(d.error || 'Failed to load tenants'); return }
      const data = await resp.json()
      setTenants(data.tenants || [])
    } catch { setError('Network error — could not load tenants') }
    finally  { setLoading(false) }
  }

  async function fetchStats() {
    setStatsLoad(true)
    try {
      const resp = await fetch('/api/admin/stripe-stats')
      if (resp.ok) setStats(await resp.json())
    } catch {}
    finally { setStatsLoad(false) }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setSuccess(''); setError('')
    try {
      const resp = await fetch('/api/admin/tenants', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await resp.json()
      if (!resp.ok) { setError(data.error || 'Failed to create tenant'); return }
      setSuccess(`Tenant "${data.tenant.companyName}" created.`)
      setShowForm(false)
      setForm({ email: '', password: '', companyName: '', airtableBaseId: '', airtableToken: '', plan: 'Scout $79', isAdmin: false })
      fetchTenants(); fetchStats()
    } catch { setError('Network error — could not create tenant') }
    finally { setSaving(false) }
  }

  async function handleStatusToggle(tenant: Tenant) {
    const newStatus = tenant.status === 'Active' ? 'Suspended' : 'Active'
    try {
      const resp = await fetch('/api/admin/tenants', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
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

      {/* Header */}
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

      {/* Tab nav */}
      <div className="border-b border-slate-800 px-6">
        <div className="flex gap-1 max-w-5xl mx-auto">
          {(['overview', 'tenants'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                tab === t ? 'border-[#4F6BFF] text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
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

            {error && (
              <div className="bg-red-900/20 border border-red-800/50 rounded-lg px-4 py-3">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

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
                <StatCard label="MRR" value={`$${stats.mrr.toLocaleString()}`} sub={`$${stats.arr.toLocaleString()}/yr run rate`} accent />
                <StatCard label="Active subscribers" value={String(stats.activeCount)} sub={`${stats.totalTenants} total accounts`} />
                <StatCard label="Suspended" value={String(stats.suspendedCount)} sub="Access disabled" />
                <StatCard label="Revenue / sub" value="$79" sub="per month, flat" />
              </div>
            ) : null}

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
                    <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v === 0 ? '' : `$${v}`} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(79,107,255,0.06)' }} />
                    <Bar dataKey="revenue" fill="#4F6BFF" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {stats && (
              <div className="bg-[#0f1117] border border-slate-800 rounded-xl p-6">
                <h2 className="font-semibold text-white mb-4">Recent activity</h2>
                {stats.activity.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-slate-500 text-sm">
                      {stats.source === 'stub' ? 'Connect Stripe to see live subscription events here.' : 'No recent activity.'}
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

            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold text-white">Tenants</h1>
                <p className="text-slate-400 text-sm mt-0.5">
                  Manage accounts, scanning pools, and Apify configuration.
                </p>
              </div>
              <button
                onClick={() => { setShowForm(!showForm); setError(''); setSuccess('') }}
                className="bg-[#4F6BFF] hover:bg-[#3D57F5] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {showForm ? 'Cancel' : '+ Add Tenant'}
              </button>
            </div>

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
                    <input type="email" required value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="user@company.com"
                      className="w-full bg-[#161b27] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-[#4F6BFF]"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 text-xs font-medium mb-1">Password *</label>
                    <input type="password" required value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      placeholder="Temporary password"
                      className="w-full bg-[#161b27] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-[#4F6BFF]"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 text-xs font-medium mb-1">Company Name</label>
                    <input type="text" value={form.companyName}
                      onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))}
                      placeholder="Acme Corp"
                      className="w-full bg-[#161b27] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-[#4F6BFF]"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 text-xs font-medium mb-1">Plan</label>
                    <select value={form.plan}
                      onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}
                      className="w-full bg-[#161b27] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-[#4F6BFF]"
                    >
                      <option>Scout $79</option>
                      <option>Owner</option>
                      <option>Trial</option>
                      <option>Complimentary</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-slate-300 text-xs font-medium mb-1">
                      Airtable Base ID <span className="text-slate-500 font-normal">(optional — customer can add in Settings)</span>
                    </label>
                    <input type="text" value={form.airtableBaseId}
                      onChange={e => setForm(f => ({ ...f, airtableBaseId: e.target.value }))}
                      placeholder="appXXXXXXXXXXXXXX"
                      className="w-full bg-[#161b27] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-[#4F6BFF] font-mono"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-slate-300 text-xs font-medium mb-1">
                      Airtable API Token <span className="text-slate-500 font-normal">(optional)</span>
                    </label>
                    <input type="password" value={form.airtableToken}
                      onChange={e => setForm(f => ({ ...f, airtableToken: e.target.value }))}
                      placeholder="patXXXXXXXXXXXXXX"
                      className="w-full bg-[#161b27] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-[#4F6BFF] font-mono"
                    />
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <input type="checkbox" id="isAdmin" checked={form.isAdmin}
                      onChange={e => setForm(f => ({ ...f, isAdmin: e.target.checked }))}
                      className="w-4 h-4 accent-[#4F6BFF]"
                    />
                    <label htmlFor="isAdmin" className="text-slate-300 text-sm">Grant admin access</label>
                  </div>
                  <div className="col-span-2 flex justify-end gap-3 pt-2">
                    <button type="button" onClick={() => setShowForm(false)}
                      className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button type="submit" disabled={saving}
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
                <p className="text-slate-400 text-sm">No tenants yet.</p>
              </div>
            ) : (
              <div className="bg-[#0f1117] border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="text-left text-slate-400 font-medium px-5 py-3">Company</th>
                      <th className="text-left text-slate-400 font-medium px-5 py-3">Email</th>
                      <th className="text-left text-slate-400 font-medium px-5 py-3">Plan</th>
                      <th className="text-left text-slate-400 font-medium px-5 py-3">Status</th>
                      <th className="text-left text-slate-400 font-medium px-5 py-3">Apify</th>
                      <th className="text-left text-slate-400 font-medium px-5 py-3 pr-5">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map((t, i) => (
                      <>
                        <tr key={t.id} className={i < tenants.length - 1 || expandedApify === t.id ? 'border-b border-slate-800/50' : ''}>
                          {/* Company */}
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
                          {/* Email */}
                          <td className="px-5 py-3.5 text-slate-400 text-xs">{t.email}</td>
                          {/* Plan */}
                          <td className="px-5 py-3.5 text-slate-400">{t.plan || '—'}</td>
                          {/* Status */}
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                              t.status === 'Active' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${t.status === 'Active' ? 'bg-green-400' : 'bg-red-400'}`} />
                              {t.status}
                            </span>
                          </td>
                          {/* Apify pool badge */}
                          <td className="px-5 py-3.5">
                            <ApifyPoolBadge hasKey={t.hasApifyKey} />
                          </td>
                          {/* Actions */}
                          <td className="px-5 py-3.5 pr-5">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => handleStatusToggle(t)}
                                className="text-xs text-slate-400 hover:text-slate-200 transition-colors underline underline-offset-2"
                              >
                                {t.status === 'Active' ? 'Suspend' : 'Activate'}
                              </button>
                              <span className="text-slate-700">·</span>
                              <button
                                onClick={() => setExpandedApify(expandedApify === t.id ? null : t.id)}
                                className={`text-xs transition-colors underline underline-offset-2 ${
                                  expandedApify === t.id
                                    ? 'text-[#4F6BFF]'
                                    : 'text-slate-400 hover:text-[#4F6BFF]'
                                }`}
                              >
                                Apify
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Inline Apify management panel */}
                        {expandedApify === t.id && (
                          <ApifyPanel
                            tenant={t}
                            onClose={() => setExpandedApify(null)}
                            onSaved={() => { fetchTenants() }}
                          />
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  )
}
