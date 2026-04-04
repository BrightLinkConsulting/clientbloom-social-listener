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
  isFeedOnly:     boolean
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

interface UsageRecord {
  id:          string
  email:       string
  companyName: string
  plan:        string
  status:      string
  postCount:   number | null
  lastScan:    string | null
  estCost:     number | null
  error?:      string
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function eventLabel(type: string) {
  switch (type) {
    case 'checkout.session.completed':    return { label: 'New subscriber',        color: 'text-emerald-400', dot: 'bg-emerald-400' }
    case 'invoice.payment_succeeded':     return { label: 'Payment succeeded',     color: 'text-emerald-400', dot: 'bg-emerald-400' }
    case 'invoice.payment_failed':        return { label: 'Payment failed',        color: 'text-amber-400',   dot: 'bg-amber-400'   }
    case 'customer.subscription.deleted': return { label: 'Subscription canceled', color: 'text-red-400',     dot: 'bg-red-400'     }
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

function scanAgo(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const hrs = Math.floor(diff / 3600000)
  if (hrs < 1)  return 'just now'
  if (hrs < 24) return `${hrs}h ago`
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
      <td colSpan={8} className="p-0">
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

// ── Delete confirmation modal ──────────────────────────────────────────────────
function DeleteModal({
  tenant,
  onConfirm,
  onCancel,
  loading,
}: {
  tenant: Tenant
  onConfirm: () => void
  onCancel:  () => void
  loading:   boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-[#0f1117] border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-900/30 flex items-center justify-center">
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <h3 className="text-white font-semibold">Delete tenant</h3>
            <p className="text-xs text-slate-400">This action cannot be undone</p>
          </div>
        </div>
        <p className="text-sm text-slate-300 mb-2">
          You are about to permanently delete the tenant account for:
        </p>
        <div className="bg-[#0a0c10] border border-slate-800 rounded-lg px-4 py-3 mb-5">
          <p className="text-white font-medium text-sm">{tenant.companyName || tenant.email}</p>
          <p className="text-slate-500 text-xs">{tenant.email}</p>
        </div>
        <p className="text-xs text-slate-500 mb-5">
          Their Airtable base and captured posts are <strong className="text-slate-300">not</strong> deleted — only the Scout login record is removed.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
          >
            {loading ? 'Deleting…' : 'Yes, delete tenant'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Grant Free Access modal ────────────────────────────────────────────────────
function GrantAccessModal({
  onClose,
  onSuccess,
}: {
  onClose:   () => void
  onSuccess: () => void
}) {
  const [form, setForm] = useState({ email: '', companyName: '', note: '' })
  const [saving, setSaving]   = useState(false)
  const [error,  setError]    = useState('')
  const [done,   setDone]     = useState(false)
  const [warn,   setWarn]     = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.email.trim()) return
    setSaving(true); setError(''); setWarn('')
    try {
      const resp = await fetch('/api/admin/grant-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await resp.json()
      if (!resp.ok) { setError(data.error || 'Failed'); return }
      if (data.emailWarning) setWarn(data.emailWarning)
      setDone(true)
      onSuccess()
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0f1117] border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-white font-semibold">Grant Free Access</h3>
            <p className="text-xs text-slate-400 mt-0.5">Creates a Complimentary plan account and sends login credentials</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 p-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {done ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 rounded-full bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-white font-medium mb-1">Account created!</p>
            <p className="text-slate-400 text-sm">Welcome email sent to <strong className="text-slate-200">{form.email}</strong></p>
            {warn && <p className="text-amber-400 text-xs mt-2">{warn}</p>}
            <button onClick={onClose} className="mt-4 text-sm text-[#4F6BFF] hover:underline">Close</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
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
              <label className="block text-slate-300 text-xs font-medium mb-1">Company Name</label>
              <input
                type="text" value={form.companyName}
                onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))}
                placeholder="Acme Corp"
                className="w-full bg-[#161b27] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-[#4F6BFF]"
              />
            </div>
            <div>
              <label className="block text-slate-300 text-xs font-medium mb-1">
                Personal note <span className="text-slate-500 font-normal">(shown in welcome email)</span>
              </label>
              <input
                type="text" value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                placeholder="e.g. Enjoy Scout on us!"
                className="w-full bg-[#161b27] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-[#4F6BFF]"
              />
            </div>
            <div className="bg-[#0a0c10] border border-slate-800 rounded-lg px-4 py-3 text-xs text-slate-400">
              A temporary password will be auto-generated and emailed to the user.
              Their account is fully configured — they can log in and start using Scout right away.
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex gap-3 justify-end pt-1">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
              >
                {saving ? 'Creating…' : 'Create & send welcome email'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [tenants,          setTenants]          = useState<Tenant[]>([])
  const [stats,            setStats]            = useState<StatsData | null>(null)
  const [usageData,        setUsageData]        = useState<UsageRecord[]>([])
  const [loading,          setLoading]          = useState(true)
  const [statsLoad,        setStatsLoad]        = useState(true)
  const [usageLoad,        setUsageLoad]        = useState(false)
  const [error,            setError]            = useState('')
  const [showForm,         setShowForm]         = useState(false)
  const [saving,           setSaving]           = useState(false)
  const [success,          setSuccess]          = useState('')
  const [tab,              setTab]              = useState<'overview' | 'tenants' | 'usage'>('overview')
  const [expandedApify,    setExpandedApify]    = useState<string | null>(null)

  // Task 1: Inline company name editing
  const [editingCompanyId,  setEditingCompanyId]  = useState<string | null>(null)
  const [editingCompanyVal, setEditingCompanyVal] = useState('')
  const [savingCompany,     setSavingCompany]     = useState(false)

  // Task 2: Delete confirmation
  const [deleteTarget,   setDeleteTarget]   = useState<Tenant | null>(null)
  const [deletingId,     setDeletingId]     = useState<string | null>(null)

  // Task 3: Password reset
  const [resetingId,     setResetingId]     = useState<string | null>(null)
  const [resetMsg,       setResetMsg]       = useState<Record<string, string>>({})

  // Task 4: Grant free access
  const [showFreeAccess, setShowFreeAccess] = useState(false)

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

  async function fetchUsage() {
    setUsageLoad(true)
    try {
      const resp = await fetch('/api/admin/usage')
      if (resp.ok) {
        const data = await resp.json()
        setUsageData(data.usage || [])
      }
    } catch {}
    finally { setUsageLoad(false) }
  }

  useEffect(() => {
    if (tab === 'usage' && usageData.length === 0 && !usageLoad) {
      fetchUsage()
    }
  }, [tab]) // eslint-disable-line

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

  // Task 1: Save inline company name edit
  async function handleCompanySave(tenant: Tenant) {
    const newName = editingCompanyVal.trim()
    if (!newName || newName === tenant.companyName) {
      setEditingCompanyId(null); return
    }
    setSavingCompany(true)
    try {
      const resp = await fetch('/api/admin/tenants', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: tenant.id, companyName: newName }),
      })
      if (resp.ok) {
        setTenants(ts => ts.map(t => t.id === tenant.id ? { ...t, companyName: newName } : t))
      }
    } catch {}
    finally { setSavingCompany(false); setEditingCompanyId(null) }
  }

  // Task 2: Delete tenant
  async function handleDelete() {
    if (!deleteTarget) return
    setDeletingId(deleteTarget.id)
    try {
      const resp = await fetch('/api/admin/tenants', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteTarget.id }),
      })
      if (resp.ok) {
        setTenants(ts => ts.filter(t => t.id !== deleteTarget.id))
        fetchStats()
        setSuccess(`Tenant "${deleteTarget.companyName || deleteTarget.email}" deleted.`)
      } else {
        const d = await resp.json()
        setError(d.error || 'Delete failed')
      }
    } catch { setError('Network error') }
    finally { setDeletingId(null); setDeleteTarget(null) }
  }

  // Task 3: Send password reset email
  async function handleSendReset(tenant: Tenant) {
    setResetingId(tenant.id)
    setResetMsg(m => ({ ...m, [tenant.id]: '' }))
    try {
      const resp = await fetch('/api/admin/send-reset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: tenant.id, email: tenant.email, companyName: tenant.companyName }),
      })
      const data = await resp.json()
      if (resp.ok) {
        setResetMsg(m => ({ ...m, [tenant.id]: 'Email sent!' }))
        setTimeout(() => setResetMsg(m => ({ ...m, [tenant.id]: '' })), 4000)
      } else {
        setResetMsg(m => ({ ...m, [tenant.id]: data.error || 'Failed' }))
      }
    } catch { setResetMsg(m => ({ ...m, [tenant.id]: 'Network error' })) }
    finally { setResetingId(null) }
  }

  // Task 6: Toggle feed-only role
  async function handleFeedOnlyToggle(tenant: Tenant) {
    const newVal = !tenant.isFeedOnly
    try {
      const resp = await fetch('/api/admin/tenants', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: tenant.id, isFeedOnly: newVal }),
      })
      if (resp.ok) {
        setTenants(ts => ts.map(t => t.id === tenant.id ? { ...t, isFeedOnly: newVal } : t))
      }
    } catch {}
  }

  if (status === 'loading') {
    return <div className="min-h-screen bg-[#0a0c10] flex items-center justify-center"><p className="text-slate-400">Loading…</p></div>
  }

  const user = session?.user as any

  return (
    <div className="min-h-screen bg-[#0a0c10] text-slate-200">

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <DeleteModal
          tenant={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={!!deletingId}
        />
      )}

      {/* Grant free access modal */}
      {showFreeAccess && (
        <GrantAccessModal
          onClose={() => setShowFreeAccess(false)}
          onSuccess={() => { fetchTenants(); fetchStats() }}
        />
      )}

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
          {(['overview', 'tenants', 'usage'] as const).map(t => (
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
                <StatCard label="Suspended" value={String(stats.suspendedCount)} sub="Access blocked at login" />
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

            {/* Suspend enforcement note (Task 7) */}
            <div className="bg-[#0f1117] border border-slate-800 rounded-xl p-5 flex items-start gap-4">
              <div className="w-8 h-8 rounded-lg bg-emerald-900/20 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-white mb-1">Suspend is enforced at login</p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  When you suspend a tenant, their account is blocked in the authentication layer — they cannot sign in even if they know their password.
                  Active sessions are not immediately invalidated (JWT-based), but will expire within the session TTL.
                  To instantly cut access, suspend the account in the Tenants tab.
                </p>
              </div>
            </div>

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
                  Manage accounts, scanning pools, roles, and access.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setShowFreeAccess(true); setError(''); setSuccess('') }}
                  className="bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  Grant Free Access
                </button>
                <button
                  onClick={() => { setShowForm(!showForm); setError(''); setSuccess('') }}
                  className="bg-[#4F6BFF] hover:bg-[#3D57F5] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  {showForm ? 'Cancel' : '+ Add Tenant'}
                </button>
              </div>
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
                      <th className="text-left text-slate-400 font-medium px-4 py-3">Email</th>
                      <th className="text-left text-slate-400 font-medium px-4 py-3">Plan</th>
                      <th className="text-left text-slate-400 font-medium px-4 py-3">Status</th>
                      <th className="text-left text-slate-400 font-medium px-4 py-3">Apify</th>
                      <th className="text-left text-slate-400 font-medium px-4 py-3 pr-5">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map((t, i) => (
                      <>
                        <tr key={t.id} className={`${i < tenants.length - 1 || expandedApify === t.id ? 'border-b border-slate-800/50' : ''}`}>

                          {/* Company — inline editable */}
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-[#1a2235] border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                                {t.companyName?.charAt(0)?.toUpperCase() || '?'}
                              </div>
                              {editingCompanyId === t.id ? (
                                <input
                                  autoFocus
                                  value={editingCompanyVal}
                                  onChange={e => setEditingCompanyVal(e.target.value)}
                                  onBlur={() => handleCompanySave(t)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleCompanySave(t)
                                    if (e.key === 'Escape') setEditingCompanyId(null)
                                  }}
                                  disabled={savingCompany}
                                  className="bg-[#161b27] border border-[#4F6BFF] rounded px-2 py-0.5 text-slate-100 text-sm focus:outline-none w-32"
                                />
                              ) : (
                                <div>
                                  <button
                                    onClick={() => { setEditingCompanyId(t.id); setEditingCompanyVal(t.companyName) }}
                                    className="text-slate-200 font-medium text-left hover:text-[#4F6BFF] transition-colors group flex items-center gap-1"
                                    title="Click to edit"
                                  >
                                    {t.companyName || '—'}
                                    <svg className="w-3 h-3 text-slate-600 group-hover:text-[#4F6BFF] opacity-0 group-hover:opacity-100 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                  </button>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    {t.isAdmin && (
                                      <span className="text-[10px] bg-[#4F6BFF]/20 text-[#4F6BFF] px-1.5 py-0.5 rounded font-medium">Admin</span>
                                    )}
                                    {t.isFeedOnly && (
                                      <span className="text-[10px] bg-amber-900/30 text-amber-400 px-1.5 py-0.5 rounded font-medium border border-amber-800/30">Feed only</span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Email */}
                          <td className="px-4 py-3 text-slate-400 text-xs">{t.email}</td>

                          {/* Plan */}
                          <td className="px-4 py-3 text-slate-400 text-xs">{t.plan || '—'}</td>

                          {/* Status */}
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                              t.status === 'Active' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${t.status === 'Active' ? 'bg-green-400' : 'bg-red-400'}`} />
                              {t.status}
                            </span>
                          </td>

                          {/* Apify pool badge */}
                          <td className="px-4 py-3">
                            <ApifyPoolBadge hasKey={t.hasApifyKey} />
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3 pr-5">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              {/* Suspend/Activate */}
                              <button
                                onClick={() => handleStatusToggle(t)}
                                className="text-xs text-slate-400 hover:text-slate-200 transition-colors underline underline-offset-2"
                              >
                                {t.status === 'Active' ? 'Suspend' : 'Activate'}
                              </button>
                              <span className="text-slate-700 text-xs">·</span>

                              {/* Apify */}
                              <button
                                onClick={() => setExpandedApify(expandedApify === t.id ? null : t.id)}
                                className={`text-xs transition-colors underline underline-offset-2 ${
                                  expandedApify === t.id ? 'text-[#4F6BFF]' : 'text-slate-400 hover:text-[#4F6BFF]'
                                }`}
                              >
                                Apify
                              </button>
                              <span className="text-slate-700 text-xs">·</span>

                              {/* Reset password */}
                              <button
                                onClick={() => handleSendReset(t)}
                                disabled={resetingId === t.id}
                                className="text-xs text-slate-400 hover:text-amber-400 transition-colors underline underline-offset-2 disabled:opacity-50"
                              >
                                {resetingId === t.id ? 'Sending…' : 'Reset PW'}
                              </button>
                              <span className="text-slate-700 text-xs">·</span>

                              {/* Feed-only toggle */}
                              <button
                                onClick={() => handleFeedOnlyToggle(t)}
                                className={`text-xs transition-colors underline underline-offset-2 ${
                                  t.isFeedOnly ? 'text-amber-400 hover:text-slate-400' : 'text-slate-400 hover:text-amber-400'
                                }`}
                                title={t.isFeedOnly ? 'Remove feed-only restriction' : 'Restrict to feed-only access'}
                              >
                                {t.isFeedOnly ? 'Full access' : 'Feed only'}
                              </button>
                              <span className="text-slate-700 text-xs">·</span>

                              {/* Delete */}
                              <button
                                onClick={() => setDeleteTarget(t)}
                                className="text-xs text-slate-400 hover:text-red-400 transition-colors underline underline-offset-2"
                              >
                                Delete
                              </button>
                            </div>

                            {/* Inline feedback for reset */}
                            {resetMsg[t.id] && (
                              <p className={`text-[11px] mt-1 ${
                                resetMsg[t.id] === 'Email sent!'
                                  ? 'text-emerald-400'
                                  : 'text-red-400'
                              }`}>
                                {resetMsg[t.id]}
                              </p>
                            )}
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

        {/* ── Usage tab ── */}
        {tab === 'usage' && (
          <div className="space-y-6">

            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold text-white">Usage</h1>
                <p className="text-slate-400 text-sm mt-0.5">
                  Per-tenant post counts and estimated Apify cost.
                </p>
              </div>
              <button
                onClick={fetchUsage}
                disabled={usageLoad}
                className="text-sm text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1.5"
              >
                <svg className={`w-4 h-4 ${usageLoad ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>

            <div className="bg-[#0a0c10] border border-amber-800/30 rounded-lg px-4 py-3 text-xs text-amber-300">
              Cost estimates use ~$0.002/post (Apify starter tier). Actual costs vary by actor and usage tier.
            </div>

            {usageLoad ? (
              <div className="space-y-2">
                {[1,2,3].map(i => (
                  <div key={i} className="bg-[#0f1117] border border-slate-800 rounded-xl p-4 animate-pulse">
                    <div className="h-3 bg-slate-800 rounded w-1/3 mb-2" />
                    <div className="h-2 bg-slate-800 rounded w-1/4" />
                  </div>
                ))}
              </div>
            ) : usageData.length === 0 ? (
              <div className="text-center py-16 text-slate-500 text-sm">No usage data loaded yet.</div>
            ) : (
              <div className="bg-[#0f1117] border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="text-left text-slate-400 font-medium px-5 py-3">Tenant</th>
                      <th className="text-left text-slate-400 font-medium px-4 py-3">Plan</th>
                      <th className="text-left text-slate-400 font-medium px-4 py-3">Status</th>
                      <th className="text-right text-slate-400 font-medium px-4 py-3">Posts captured</th>
                      <th className="text-right text-slate-400 font-medium px-4 py-3">Last scan</th>
                      <th className="text-right text-slate-400 font-medium px-5 py-3">Est. cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usageData.map((u, i) => (
                      <tr key={u.id} className={i < usageData.length - 1 ? 'border-b border-slate-800/50' : ''}>
                        <td className="px-5 py-3.5">
                          <p className="text-slate-200 font-medium">{u.companyName || '—'}</p>
                          <p className="text-slate-500 text-xs">{u.email}</p>
                        </td>
                        <td className="px-4 py-3.5 text-slate-400 text-xs">{u.plan || '—'}</td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            u.status === 'Active' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                          }`}>
                            <span className={`w-1 h-1 rounded-full ${u.status === 'Active' ? 'bg-green-400' : 'bg-red-400'}`} />
                            {u.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          {u.error === 'no_credentials' ? (
                            <span className="text-slate-600 text-xs">No credentials</span>
                          ) : u.error ? (
                            <span className="text-amber-500 text-xs" title={u.error}>Error</span>
                          ) : u.postCount === null ? (
                            <span className="text-slate-600 text-xs">—</span>
                          ) : (
                            <span className="text-slate-200 font-medium tabular-nums">
                              {u.postCount >= 500 ? '500+' : u.postCount.toLocaleString()}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right text-slate-400 text-xs">
                          {scanAgo(u.lastScan)}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {u.estCost === null ? (
                            <span className="text-slate-600 text-xs">—</span>
                          ) : (
                            <span className="text-slate-300 text-xs tabular-nums">
                              ~${u.estCost.toFixed(2)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {usageData.length > 0 && (
                    <tfoot>
                      <tr className="border-t border-slate-700">
                        <td colSpan={3} className="px-5 py-3 text-xs text-slate-500 font-medium">Totals</td>
                        <td className="px-4 py-3 text-right text-slate-300 font-semibold text-sm tabular-nums">
                          {usageData.reduce((s, u) => s + (u.postCount || 0), 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3" />
                        <td className="px-5 py-3 text-right text-slate-300 font-semibold text-sm tabular-nums">
                          ~${usageData.reduce((s, u) => s + (u.estCost || 0), 0).toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  )
}
