'use client'

import { useState, useEffect, Fragment } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

// ─── Apify affiliate link — replace with your approved affiliate URL ───────────
const APIFY_AFFILIATE_URL = 'https://apify.com?fpr=YOUR_CODE'

// ── ClientBloom Logo ──────────────────────────────────────────────────────────
function ClientBloomMark({ size = 28 }: { size?: number }) {
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

// ── Types ──────────────────────────────────────────────────────────────────────
interface Tenant {
  id:             string
  email:          string
  companyName:    string
  airtableBaseId: string
  tenantId:       string
  hasToken:       boolean
  hasApifyKey:    boolean
  status:         string
  isAdmin:        boolean
  isFeedOnly:     boolean
  plan:           string
  createdAt:      string
  trialEndsAt:    string | null
}

function PlanBadge({ plan }: { plan: string }) {
  if (!plan) return <span className="text-slate-600 text-xs">—</span>
  const styles: Record<string, string> = {
    'Owner':     'bg-amber-900/30 text-amber-300 border-amber-700/40',
    'Scout $79': 'bg-emerald-900/30 text-emerald-300 border-emerald-700/40',
    'Scout $49': 'bg-emerald-900/30 text-emerald-300 border-emerald-700/40',
    'Trial':     'bg-blue-900/30 text-blue-300 border-blue-700/40',
  }
  const cls = styles[plan] || 'bg-slate-800 text-slate-400 border-slate-700'
  return (
    <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-md border whitespace-nowrap ${cls}`}>
      {plan}
    </span>
  )
}

function trialBadge(trialEndsAt: string | null) {
  if (!trialEndsAt) return null
  const daysLeft = Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000)
  if (daysLeft <= 0) {
    return <span className="text-[10px] bg-red-900/30 text-red-400 px-1.5 py-0.5 rounded font-medium border border-red-800/30">Trial expired</span>
  }
  const color = daysLeft <= 3 ? 'bg-amber-900/30 text-amber-400 border-amber-800/30' : 'bg-blue-900/30 text-blue-400 border-blue-800/30'
  return <span className={`text-[10px] ${color} px-1.5 py-0.5 rounded font-medium border`}>{daysLeft}d left</span>
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
  tenantId:    string
  postCount:   number | null
  lastScan:    string | null
  realCost:    number | null
  costSource:  'tagged' | 'prorata' | 'own_key' | 'no_data'
  syncedAt:    string | null
  fromCache:   boolean
  ownApify:    boolean
  error?:      string
}

interface ApifyAccount {
  totalUsd:          number
  billingCycleStart: string
  billingCycleEnd:   string
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

// ── Grant 14-Day Trial modal ───────────────────────────────────────────────────
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
            <h3 className="text-white font-semibold">Grant 14-Day Trial</h3>
            <p className="text-xs text-slate-400 mt-0.5">Creates a fully provisioned trial account — no setup required on their end</p>
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
            <p className="text-white font-medium mb-1">Trial account created!</p>
            <p className="text-slate-400 text-sm">14-day trial welcome email sent to <strong className="text-slate-200">{form.email}</strong></p>
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
                placeholder="e.g. Enjoy your free trial!"
                className="w-full bg-[#161b27] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-[#4F6BFF]"
              />
            </div>
            <div className="bg-blue-950/30 border border-blue-800/30 rounded-lg px-4 py-3 text-xs text-blue-300 space-y-1">
              <p className="font-medium">What gets created automatically:</p>
              <p className="text-blue-400/80">Full account provisioning · 14-day trial clock starts on first login · Temporary password emailed · Onboarding wizard runs on first login</p>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex gap-3 justify-end pt-1">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
              >
                {saving ? 'Creating…' : 'Grant trial & send welcome email'}
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
  const [newestSyncedAt,   setNewestSyncedAt]   = useState<string | null>(null)
  const [usageFetchedAt,   setUsageFetchedAt]   = useState<Date | null>(null)
  const [apifyAccount,     setApifyAccount]     = useState<ApifyAccount | null>(null)
  const [usageSortCol,     setUsageSortCol]     = useState<'postCount' | 'realCost' | 'companyName' | 'syncedAt'>('postCount')
  const [usageSortDir,     setUsageSortDir]     = useState<'asc' | 'desc'>('desc')
  const [loading,          setLoading]          = useState(true)
  const [statsLoad,        setStatsLoad]        = useState(true)
  const [usageLoad,        setUsageLoad]        = useState(false)
  const [error,            setError]            = useState('')
  const [showForm,         setShowForm]         = useState(false)
  const [saving,           setSaving]           = useState(false)
  const [success,          setSuccess]          = useState('')
  const [tab,              setTab]              = useState<'overview' | 'tenants' | 'usage'>('overview')
  const [expandedApify,    setExpandedApify]    = useState<string | null>(null)
  const [openMenuId,       setOpenMenuId]       = useState<string | null>(null)

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

  // Search + filter
  const [searchQuery,   setSearchQuery]   = useState('')
  const [filterPlan,    setFilterPlan]    = useState('all')
  const [filterStatus,  setFilterStatus]  = useState('all')

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
        setNewestSyncedAt(data.newestSyncedAt || null)
        setApifyAccount(data.apify || null)
        setUsageFetchedAt(new Date())
      }
    } catch {}
    finally { setUsageLoad(false) }
  }

  // Auto-fetch on tab open; re-fetch if cached data is >55 min old
  useEffect(() => {
    if (tab !== 'usage') return
    const ageMs = usageFetchedAt ? Date.now() - usageFetchedAt.getTime() : Infinity
    if (usageData.length === 0 || ageMs > 55 * 60 * 1000) {
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
            <ClientBloomMark size={24} />
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
      <div className="border-b border-slate-800 px-8">
        <div className="flex gap-1 max-w-[1440px] mx-auto">
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

      <div className="max-w-[1440px] mx-auto px-8 py-8">

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
                  className="bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Grant 14-Day Trial
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

            {/* Search + filter bar */}
            {!loading && tenants.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search company or email…"
                    className="w-full bg-[#0f1117] border border-slate-700/60 rounded-lg pl-8 pr-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-[#4F6BFF]/60"
                  />
                </div>

                {/* Plan filter */}
                <select
                  value={filterPlan}
                  onChange={e => setFilterPlan(e.target.value)}
                  className="bg-[#0f1117] border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-[#4F6BFF]/60"
                >
                  <option value="all">All plans</option>
                  {Array.from(new Set(tenants.map(t => t.plan).filter(Boolean))).sort().map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>

                {/* Status filter */}
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="bg-[#0f1117] border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-[#4F6BFF]/60"
                >
                  <option value="all">All statuses</option>
                  <option value="Active">Active</option>
                  <option value="Suspended">Suspended</option>
                </select>

                {/* Clear filters */}
                {(searchQuery || filterPlan !== 'all' || filterStatus !== 'all') && (
                  <button
                    onClick={() => { setSearchQuery(''); setFilterPlan('all'); setFilterStatus('all') }}
                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Clear
                  </button>
                )}
              </div>
            )}

            {/* Tenant list */}
            {loading ? (
              <div className="text-center py-16 text-slate-500">Loading tenants…</div>
            ) : tenants.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-slate-400 text-sm">No tenants yet.</p>
              </div>
            ) : (() => {
              const q = searchQuery.toLowerCase()
              const filtered = tenants.filter(t => {
                const matchesSearch = !q
                  || t.companyName?.toLowerCase().includes(q)
                  || t.email?.toLowerCase().includes(q)
                const matchesPlan   = filterPlan   === 'all' || t.plan === filterPlan
                const matchesStatus = filterStatus === 'all' || t.status === filterStatus
                return matchesSearch && matchesPlan && matchesStatus
              })
              // Build account groups: owner rows with their members nested below
              // Group by tenantId — owner is isFeedOnly=false, members are isFeedOnly=true
              const groups: { owner: Tenant; members: Tenant[] }[] = []
              const orphans: Tenant[] = []
              const seenOwners = new Map<string, Tenant>()

              // First pass: find all owners
              filtered.forEach(t => {
                if (!t.isFeedOnly && t.tenantId) {
                  seenOwners.set(t.tenantId, t)
                  groups.push({ owner: t, members: [] })
                }
              })
              // Second pass: attach members to their owner
              filtered.forEach(t => {
                if (t.isFeedOnly) {
                  const group = groups.find(g => g.owner.tenantId === t.tenantId)
                  if (group) group.members.push(t)
                  else orphans.push(t) // member whose owner is filtered out
                }
              })
              // Tenants with no tenantId at all (legacy / admin records)
              filtered.forEach(t => {
                if (!t.tenantId && !t.isFeedOnly && !seenOwners.has(t.tenantId)) {
                  orphans.push(t)
                }
              })

              // Flatten to ordered rows with a flag for rendering
              type TableRow =
                | { kind: 'owner'; tenant: Tenant; hasMembers: boolean }
                | { kind: 'member'; tenant: Tenant; ownerEmail: string; ownerCompanyName: string; isLast: boolean }
                | { kind: 'orphan'; tenant: Tenant }

              const rows: TableRow[] = []
              groups.forEach(g => {
                rows.push({ kind: 'owner', tenant: g.owner, hasMembers: g.members.length > 0 })
                g.members.forEach((m, mi) => {
                  rows.push({ kind: 'member', tenant: m, ownerEmail: g.owner.email, ownerCompanyName: g.owner.companyName, isLast: mi === g.members.length - 1 })
                })
              })
              orphans.forEach(t => rows.push({ kind: 'orphan', tenant: t }))

              return (
              <div className="bg-[#0f1117] border border-slate-800 rounded-xl overflow-hidden">
                {filtered.length === 0 ? (
                  <div className="text-center py-10 text-slate-500 text-sm">No tenants match your filters.</div>
                ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800/80 bg-[#0d0f15]">
                      <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-6 py-3.5">Account</th>
                      <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3.5">Email</th>
                      <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3.5">Plan</th>
                      <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3.5">Status</th>
                      <th className="text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-6 py-3.5">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      const t = row.tenant
                      const isMember = row.kind === 'member'
                      const isLastRow = i === rows.length - 1
                      return (
                      <Fragment key={t.id}>
                        <tr className={`group transition-colors ${
                          isMember
                            ? 'bg-slate-900/30 hover:bg-slate-800/20'
                            : 'hover:bg-slate-800/20'
                        } ${!isLastRow || expandedApify === t.id ? 'border-b border-slate-800/50' : ''}`}>

                          {/* Company — inline editable */}
                          <td className={`py-4 ${isMember ? 'pl-12 pr-6' : 'px-6'}`}>
                            <div className="flex items-center gap-3">
                              {/* Member indent connector */}
                              {isMember && (
                                <div className="shrink-0 flex flex-col items-center self-stretch -ml-5 mr-1">
                                  <div className="w-px flex-1 bg-slate-700/40" />
                                  <svg className="w-3 h-3 text-slate-700 shrink-0" fill="none" viewBox="0 0 12 12">
                                    <path d="M2 0 v6 h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                                  </svg>
                                  <div className="w-px flex-1 bg-transparent" />
                                </div>
                              )}
                              {/* Avatar */}
                              <div className={`rounded-xl flex items-center justify-center text-sm font-bold shrink-0 shadow-sm ${
                                isMember
                                  ? 'w-7 h-7 bg-slate-800 border border-slate-700/60 text-slate-400 text-xs'
                                  : 'w-9 h-9 bg-gradient-to-br from-[#4F6BFF]/30 to-[#1a2235] border border-slate-700/80 text-slate-200'
                              }`}>
                                {t.companyName?.charAt(0)?.toUpperCase() || t.email?.charAt(0)?.toUpperCase() || '?'}
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
                                  className="bg-[#161b27] border border-[#4F6BFF] rounded-lg px-2.5 py-1 text-slate-100 text-sm focus:outline-none w-44"
                                />
                              ) : (
                                <div>
                                  <button
                                    onClick={() => { setEditingCompanyId(t.id); setEditingCompanyVal(t.companyName) }}
                                    className="text-slate-100 font-medium text-left hover:text-[#4F6BFF] transition-colors group/edit flex items-center gap-1.5"
                                    title="Click to rename"
                                  >
                                    {t.companyName || '—'}
                                    <svg className="w-3 h-3 text-slate-600 opacity-0 group-hover/edit:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                  </button>
                                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                    {t.isAdmin && (
                                      <span className="text-[10px] bg-[#4F6BFF]/20 text-[#4F6BFF] px-1.5 py-0.5 rounded-md font-semibold border border-[#4F6BFF]/20">Admin</span>
                                    )}
                                    {isMember ? (
                                      <span className="text-[10px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded-md font-medium border border-slate-700/50">
                                        Guest · {row.kind === 'member' ? (row.ownerCompanyName || row.ownerEmail) : ''}
                                      </span>
                                    ) : t.isFeedOnly ? (
                                      <span className="text-[10px] bg-amber-900/30 text-amber-400 px-1.5 py-0.5 rounded-md font-semibold border border-amber-800/30">Feed only</span>
                                    ) : null}
                                    {trialBadge(t.trialEndsAt)}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Email */}
                          <td className="px-4 py-4">
                            <span className="text-slate-400 text-xs font-mono">{t.email}</span>
                          </td>

                          {/* Plan */}
                          <td className="px-4 py-4">
                            <PlanBadge plan={t.plan} />
                          </td>

                          {/* Status */}
                          <td className="px-4 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                              t.status === 'Active'
                                ? 'bg-emerald-900/30 text-emerald-300 border border-emerald-800/40'
                                : 'bg-red-900/20 text-red-400 border border-red-800/30'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${t.status === 'Active' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                              {t.status}
                            </span>
                          </td>

                          {/* Actions — compact: 2 icon toggles + ⋮ overflow menu */}
                          <td className="px-4 py-4">
                            <div className="flex items-center justify-end gap-1">

                              {/* Suspend / Activate toggle
                                  Grey = currently active (click to suspend)
                                  Red  = currently suspended (click to reactivate) */}
                              <button
                                onClick={() => handleStatusToggle(t)}
                                title={t.status === 'Active'
                                  ? 'Currently active — click to suspend'
                                  : 'Currently suspended — click to reactivate'}
                                className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-all ${
                                  t.status === 'Active'
                                    ? 'bg-slate-800/80 border-slate-700 text-slate-400 hover:bg-red-900/30 hover:border-red-700/50 hover:text-red-300'
                                    : 'bg-red-900/20 border-red-700/40 text-red-400 hover:bg-emerald-900/20 hover:border-emerald-700/40 hover:text-emerald-300'
                                }`}
                              >
                                {t.status === 'Active' ? (
                                  /* Ban icon — click will suspend */
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                  </svg>
                                ) : (
                                  /* Check icon — click will reactivate */
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                )}
                              </button>

                              {/* Feed-only toggle icon
                                  Grey/eye-slash = full access (click to restrict)
                                  Amber/eye-open = feed only (click to restore) */}
                              <button
                                onClick={() => handleFeedOnlyToggle(t)}
                                title={t.isFeedOnly
                                  ? 'Currently feed only — click to restore full access'
                                  : 'Currently full access — click to restrict to feed only'}
                                className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-all ${
                                  t.isFeedOnly
                                    ? 'bg-amber-900/30 border-amber-700/50 text-amber-300 hover:bg-slate-800/80 hover:border-slate-700 hover:text-slate-400'
                                    : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:bg-amber-900/20 hover:border-amber-700/40 hover:text-amber-300'
                                }`}
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d={t.isFeedOnly
                                    ? "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                    : "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                                  } />
                                </svg>
                              </button>

                              {/* ⋮ Overflow menu — Apify, Reset PW, Delete */}
                              <div className="relative">
                                <button
                                  onClick={() => setOpenMenuId(openMenuId === t.id ? null : t.id)}
                                  title="More actions"
                                  className="w-8 h-8 rounded-lg border bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700/80 hover:border-slate-600 flex items-center justify-center transition-all"
                                >
                                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
                                  </svg>
                                </button>

                                {openMenuId === t.id && (
                                  <>
                                    {/* Click-away backdrop */}
                                    <div className="fixed inset-0 z-40" onClick={() => setOpenMenuId(null)} />
                                    {/* Dropdown */}
                                    <div className="absolute right-0 top-9 z-50 w-48 bg-[#0f1117] border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden">

                                      {/* Apify */}
                                      <button
                                        onClick={() => { setOpenMenuId(null); setExpandedApify(expandedApify === t.id ? null : t.id) }}
                                        className="w-full flex items-center gap-3 px-3.5 py-2.5 text-xs text-slate-300 hover:bg-slate-800/60 hover:text-white transition-colors"
                                      >
                                        <span className={`w-2 h-2 rounded-full shrink-0 ${t.hasApifyKey ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                                        <span>{t.hasApifyKey ? 'Apify key — manage' : 'Apify — use shared pool'}</span>
                                      </button>

                                      {/* Reset PW */}
                                      <button
                                        onClick={() => { setOpenMenuId(null); handleSendReset(t) }}
                                        disabled={resetingId === t.id}
                                        className="w-full flex items-center gap-3 px-3.5 py-2.5 text-xs text-slate-300 hover:bg-slate-800/60 hover:text-white transition-colors disabled:opacity-40"
                                      >
                                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                        </svg>
                                        {resetingId === t.id ? 'Sending…' : 'Reset password'}
                                      </button>

                                      {/* Separator + Delete */}
                                      <div className="border-t border-slate-800 mx-2 my-1" />
                                      <button
                                        onClick={() => { setOpenMenuId(null); setDeleteTarget(t) }}
                                        className="w-full flex items-center gap-3 px-3.5 py-2.5 text-xs text-red-400 hover:bg-red-900/20 hover:text-red-300 transition-colors"
                                      >
                                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        Delete account
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Inline feedback for reset */}
                            {resetMsg[t.id] && (
                              <p className={`text-[11px] mt-1.5 text-right ${
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
                      </Fragment>
                    )})}
                  </tbody>
                </table>
                )}
              </div>
            )
            })()}

          </div>
        )}

        {/* ── Usage tab ── */}
        {tab === 'usage' && (() => {
          // Sort logic
          const sortedUsage = [...usageData].sort((a, b) => {
            let av: any, bv: any
            if (usageSortCol === 'postCount') { av = a.postCount ?? -1; bv = b.postCount ?? -1 }
            else if (usageSortCol === 'realCost') { av = a.realCost ?? -1; bv = b.realCost ?? -1 }
            else if (usageSortCol === 'syncedAt') { av = a.syncedAt ? new Date(a.syncedAt).getTime() : 0; bv = b.syncedAt ? new Date(b.syncedAt).getTime() : 0 }
            else { av = (a.companyName || a.email).toLowerCase(); bv = (b.companyName || b.email).toLowerCase() }
            if (av < bv) return usageSortDir === 'asc' ? -1 : 1
            if (av > bv) return usageSortDir === 'asc' ? 1 : -1
            return 0
          })

          // Sync freshness
          const syncMsAgo  = newestSyncedAt ? Date.now() - new Date(newestSyncedAt).getTime() : null
          const syncMinAgo = syncMsAgo !== null ? Math.floor(syncMsAgo / 60000) : null
          const nextSyncIn = syncMinAgo !== null ? Math.max(0, 60 - syncMinAgo) : null

          function SortHeader({ col, label, right = false, tooltip }: { col: typeof usageSortCol; label: string; right?: boolean; tooltip?: string }) {
            const active = usageSortCol === col
            return (
              <th
                className={`${right ? 'text-right' : 'text-left'} text-[11px] font-semibold uppercase tracking-wider px-4 py-3 cursor-pointer select-none transition-colors ${
                  active ? 'text-[#4F6BFF]' : 'text-slate-500 hover:text-slate-300'
                }`}
                title={tooltip}
                onClick={() => {
                  if (usageSortCol === col) setUsageSortDir(d => d === 'asc' ? 'desc' : 'asc')
                  else { setUsageSortCol(col); setUsageSortDir('desc') }
                }}
              >
                <span className={`inline-flex items-center gap-1 ${right ? 'justify-end w-full' : ''}`}>
                  {label}
                  {tooltip && <span className="text-slate-700 font-normal normal-case tracking-normal text-[10px]">?</span>}
                  {active
                    ? <span className="text-[#4F6BFF]">{usageSortDir === 'desc' ? '↓' : '↑'}</span>
                    : <span className="text-slate-700">↕</span>
                  }
                </span>
              </th>
            )
          }

          return (
          <div className="space-y-5">

            {/* Header row */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-semibold text-white">Usage</h1>
                <p className="text-slate-400 text-sm mt-0.5">Per-tenant post counts and real Apify cost attribution.</p>
              </div>
              <div className="flex items-center gap-3 shrink-0 pt-1">
                {/* Sync status badge */}
                {newestSyncedAt && (
                  <div className="text-right">
                    <p className="text-xs text-slate-400">
                      Last sync: <span className="text-slate-200">{syncMinAgo === 0 ? 'just now' : `${syncMinAgo}m ago`}</span>
                    </p>
                    {nextSyncIn !== null && (
                      <p className="text-[11px] text-slate-600">Next in ~{nextSyncIn}m</p>
                    )}
                  </div>
                )}
                <button
                  onClick={fetchUsage}
                  disabled={usageLoad}
                  className="text-sm text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/60 hover:bg-slate-700/60 disabled:opacity-40"
                >
                  <svg className={`w-3.5 h-3.5 ${usageLoad ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {usageLoad ? 'Loading…' : 'Refresh'}
                </button>
              </div>
            </div>

            {/* Apify account card */}
            {apifyAccount ? (
              <div className="bg-[#0a0c10] border border-slate-700/50 rounded-lg px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-white font-bold text-lg tabular-nums">${apifyAccount.totalUsd.toFixed(4)}</span>
                  <span className="text-slate-400 text-xs">actual spend this billing cycle</span>
                </div>
                <div className="text-[11px] text-slate-500">
                  {new Date(apifyAccount.billingCycleStart).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  {' – '}
                  {new Date(apifyAccount.billingCycleEnd).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                <div className="text-[11px] text-slate-600 ml-auto">
                  Source: Apify /users/me/usage/monthly
                  {usageFetchedAt && <> · fetched {usageFetchedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>}
                </div>
              </div>
            ) : (
              <div className="bg-[#0a0c10] border border-slate-700/50 rounded-lg px-4 py-3 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  Apify account data unavailable — check APIFY_API_TOKEN env var.
                </span>
                {usageFetchedAt && (
                  <span className="text-[11px] text-slate-600 shrink-0 ml-4">
                    Fetched {usageFetchedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            )}

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
                    <tr className="border-b border-slate-800 bg-[#0d0f15]">
                      <SortHeader col="companyName" label="Tenant" />
                      <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Plan</th>
                      <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Status</th>
                      <SortHeader col="postCount" label="Posts" right tooltip="Total posts captured in this tenant's Airtable base. Updated automatically every hour by the background sync." />
                      <SortHeader col="syncedAt"  label="Cache age" right tooltip="How long ago the hourly sync last updated this tenant's post count. Goes amber if it's been over 90 minutes — usually means a sync error." />
                      <SortHeader col="realCost"  label="Apify cost" right />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedUsage.map((u, i) => {
                      const cacheAgeMs  = u.syncedAt ? Date.now() - new Date(u.syncedAt).getTime() : null
                      const cacheAgeMin = cacheAgeMs !== null ? Math.floor(cacheAgeMs / 60000) : null
                      const stale       = cacheAgeMin !== null && cacheAgeMin > 90

                      return (
                        <tr key={u.id} className={`transition-colors hover:bg-slate-800/20 ${i < sortedUsage.length - 1 ? 'border-b border-slate-800/50' : ''}`}>
                          <td className="px-4 py-3.5 pl-5">
                            <p className="text-slate-200 font-medium text-sm">{u.companyName || '—'}</p>
                            <p className="text-slate-500 text-xs mt-0.5">{u.email}</p>
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
                              <span className="text-slate-200 font-semibold tabular-nums">
                                {u.postCount.toLocaleString()}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            {u.syncedAt ? (
                              <span className={`text-xs tabular-nums ${stale ? 'text-amber-400' : 'text-slate-500'}`}
                                title={new Date(u.syncedAt).toLocaleString()}>
                                {cacheAgeMin === 0 ? 'just now' : `${cacheAgeMin}m ago`}
                                {stale && ' ⚠'}
                              </span>
                            ) : (
                              <span className="text-slate-700 text-xs">live</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 pr-5 text-right">
                            {u.realCost === null ? (
                              <span className="text-slate-600 text-xs">—</span>
                            ) : (
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="text-slate-200 text-xs tabular-nums font-semibold">
                                  ${u.realCost.toFixed(4)}
                                </span>
                                <span className={`text-[10px] tabular-nums ${
                                  u.costSource === 'tagged'   ? 'text-green-500' :
                                  u.costSource === 'own_key'  ? 'text-blue-400'  :
                                  u.costSource === 'prorata'  ? 'text-amber-500' :
                                  'text-slate-600'
                                }`}>
                                  {u.costSource === 'tagged'  ? 'exact' :
                                   u.costSource === 'own_key' ? 'own key' :
                                   u.costSource === 'prorata' ? 'pro-rata' : ''}
                                </span>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-700 bg-[#0d0f15]">
                      <td colSpan={3} className="px-5 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wider">Totals</td>
                      <td className="px-4 py-3 text-right text-white font-bold text-sm tabular-nums">
                        {usageData.reduce((s, u) => s + (u.postCount || 0), 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3" />
                      <td className="px-5 py-3 text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          {apifyAccount ? (
                            <>
                              <span className="text-white font-bold text-sm tabular-nums">${apifyAccount.totalUsd.toFixed(4)}</span>
                              <span className="text-[10px] text-slate-500">billing cycle total</span>
                            </>
                          ) : (
                            <span className="text-white font-bold text-sm tabular-nums">
                              ${usageData.reduce((s, u) => s + (u.realCost || 0), 0).toFixed(4)}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

          </div>
          )
        })()}

      </div>
    </div>
  )
}
