'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { getTierLimits, getPlanDisplay, isPaidPlan, isStripeBilledPlan } from '@/lib/tier'

// ---- Types ----
interface Source {
  id: string
  name: string
  type: 'linkedin_term'
  value: string
  active: boolean
  priority: 'high' | 'medium' | 'low'
}

// ---- User menu ----
function SettingsUserMenu() {
  const { data: session } = useSession()
  const [open, setOpen]   = useState(false)
  const user = session?.user as any

  return (
    <div className="relative ml-1">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-7 h-7 rounded-full bg-[#4F6BFF]/20 border border-[#4F6BFF]/30 flex items-center justify-center text-[#4F6BFF] text-xs font-bold hover:bg-[#4F6BFF]/30 transition-colors"
        title={user?.email || 'Account'}
      >
        {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || '?'}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-50 bg-[#0f1117] border border-slate-700 rounded-xl shadow-xl w-48 overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-slate-800">
              <p className="text-slate-200 text-xs font-medium truncate">{user?.name || 'Account'}</p>
              <p className="text-slate-500 text-xs truncate">{user?.email}</p>
            </div>
            {user?.isAdmin && (
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3.5 py-2.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors"
              >
                <span>🔧</span> Admin Panel
              </Link>
            )}
            <button
              onClick={() => signOut({ callbackUrl: '/sign-in' })}
              className="w-full text-left flex items-center gap-2 px-3.5 py-2.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors"
            >
              <span>→</span> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ---- Nav ----
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

function Nav() {
  const { data: session } = useSession()
  const plan          = (session?.user as any)?.plan       || ''
  const trialEndsAt   = (session?.user as any)?.trialEndsAt || null
  const isTrial       = plan === 'Trial'
  const trialMsLeft   = trialEndsAt ? new Date(trialEndsAt).getTime() - Date.now() : null
  const trialExpired  = trialMsLeft !== null && trialMsLeft <= 0
  // Math.floor matches the Feed banner exactly — "6d 14h left" not "7 days left"
  const daysLeft      = trialMsLeft !== null && !trialExpired
    ? Math.floor(trialMsLeft / 86_400_000)
    : null
  const hoursLeft     = trialMsLeft !== null && !trialExpired
    ? Math.floor((trialMsLeft % 86_400_000) / 3_600_000)
    : 0

  return (
    <header className="sticky top-0 z-20">
      {/* ── Trial countdown banner — visible only on active 7-day trials ── */}
      {/* keyframes for the flowing gradient on the trial banner */}
      <style>{`
        @keyframes trial-gradient {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
      {isTrial && !trialExpired && (
        <div
          style={{
            background: 'linear-gradient(90deg, #1e0938 0%, #3b0764 20%, #6d28d9 45%, #9333ea 55%, #3b0764 80%, #1e0938 100%)',
            backgroundSize: '300% 100%',
            animation: 'trial-gradient 6s ease infinite',
            boxShadow: '0 0 12px 2px rgba(139,92,246,0.35)',
          }}
          className="w-full border-b border-violet-700/40 flex items-center justify-center gap-3 px-4 py-1.5 text-xs tracking-wide"
        >
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-violet-400" />
          </span>
          <span className="text-violet-200 font-medium">Free Trial</span>
          <span className="text-violet-500 select-none">·</span>
          <span className="text-violet-300/80">
            {daysLeft === null ? 'Active' : daysLeft === 0 ? `${hoursLeft}h left` : `${daysLeft}d ${hoursLeft}h left`}
          </span>
          <Link href="/upgrade" className="ml-1 text-violet-300 font-semibold underline underline-offset-2 decoration-violet-500/50 hover:text-white transition-colors duration-150">
            Upgrade
          </Link>
        </div>
      )}
      <div className="border-b border-slate-800/80 bg-[#0a0c10]/95 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ClientBloomMark size={28} />
            <div>
              <p className="text-sm font-semibold text-white leading-tight">Scout by ClientBloom</p>
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {(plan === 'Scout Pro' || plan === 'Scout Agency' || plan === 'Owner') ? 'Live · 2× daily' : 'Live · 1× daily'}
              </span>
            </div>
          </div>
          <nav className="flex items-center gap-1">
            <Link href="/" className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors text-slate-400 hover:text-white hover:bg-slate-800/60">
              Feed
            </Link>
            <Link href="/settings" className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors bg-slate-800 text-white">
              Settings
            </Link>
            <SettingsUserMenu />
          </nav>
        </div>
      </div>
    </header>
  )
}

// ---- Section wrapper ----
function Section({ title, description, children }: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-slate-700/50 bg-[#12151e] overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-700/50">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}

// ---- Spinner ----
function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

// ---- Zero-streak diagnostic banner ----
// Self-contained: fetches scan-status internally and renders when streak >= 3.
// Gated on lastScanAt != null (won't fire for brand-new accounts that haven't run a scan).
function ZeroStreakBanner() {
  const [streakCount, setStreakCount] = useState(0)
  const [hasScanned,  setHasScanned]  = useState(false)

  useEffect(() => {
    fetch('/api/scan-status')
      .then(r => r.json())
      .then(data => {
        setStreakCount(data.consecutiveZeroScans ?? 0)
        setHasScanned(!!data.lastScanAt)
      })
      .catch(() => { /* fail silently — this banner is informational only */ })
  }, [])

  if (!hasScanned || streakCount < 3) return null

  return (
    <div className="mb-5 flex gap-3 px-4 py-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
      <span className="text-amber-400 text-base shrink-0 mt-0.5">🔍</span>
      <div>
        <p className="text-sm font-semibold text-amber-300 mb-1">
          Scout hasn't found new posts in {streakCount} recent scan{streakCount !== 1 ? 's' : ''}
        </p>
        <p className="text-xs text-amber-400/80 leading-relaxed mb-2">
          The most common reasons:
        </p>
        <ul className="text-xs text-amber-400/70 leading-relaxed space-y-1 list-disc list-inside mb-2">
          <li>Your ICP profiles haven't posted in the last 7 days — check their LinkedIn directly</li>
          <li>Your keyword terms may be too broad or too narrow for recent LinkedIn activity</li>
          <li>All recent posts were already captured in previous scans (this is actually a good sign)</li>
        </ul>
        <p className="text-xs text-amber-300/90">
          Try adding 2–3 new ICP profiles or refreshing your keyword terms below.
        </p>
      </div>
    </div>
  )
}

// ---- LinkedIn Terms: preset suggestion bank ----
const TERM_SUGGESTIONS = [
  {
    label: 'Questions & community input',
    color: 'blue',
    terms: [
      'looking for recommendations',
      'what tools do you use',
      'how do you handle',
      'anyone tried',
      'what worked for us',
      'ask the community',
    ],
  },
  {
    label: 'Debates & hot takes',
    color: 'emerald',
    terms: [
      'unpopular opinion',
      'hot take',
      'controversial but',
      'change my mind',
      'industry debate',
      'this is broken',
    ],
  },
  {
    label: 'Tool & vendor decisions',
    color: 'amber',
    terms: [
      'switching to',
      'just switched',
      'we moved to',
      'we replaced',
      'comparing options',
      'we decided to use',
    ],
  },
  {
    label: 'Growth & milestones',
    color: 'red',
    terms: [
      'just hired',
      'excited to announce',
      'just launched',
      'we hit',
      'lessons learned',
      'reflecting on',
    ],
  },
]

const colorMap: Record<string, string> = {
  red:     'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20',
  blue:    'bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20',
  amber:   'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20',
  emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20',
}

// ---- LinkedIn Terms: industry starter packs ----
// Each pack gives a user an instant, high-signal starting point for their vertical.
// Terms are chosen for the language decision-makers in that industry actually post about.
const INDUSTRY_PACKS: { label: string; value: string; terms: string[] }[] = [
  {
    label: 'Agency / Marketing Agency',
    value: 'agency',
    terms: ['client retention', 'agency growth', 'losing a client', 'client churn', 'retainer model', 'agency operations', 'client onboarding'],
  },
  {
    label: 'B2B SaaS',
    value: 'saas',
    terms: ['product led growth', 'reducing churn', 'customer onboarding', 'time to value', 'SaaS pricing', 'expansion revenue', 'churn rate'],
  },
  {
    label: 'Customer Success',
    value: 'customer-success',
    terms: ['customer health score', 'churn prevention', 'renewal strategy', 'expansion playbook', 'QBR prep', 'CS team scaling', 'customer onboarding'],
  },
  {
    label: 'Sales / Revenue',
    value: 'sales',
    terms: ['pipeline review', 'cold outreach', 'deal closing', 'quota attainment', 'discovery call', 'objection handling', 'sales process'],
  },
  {
    label: 'HR / Talent / Recruiting',
    value: 'hr',
    terms: ['talent acquisition', 'employee retention', 'reducing turnover', 'hiring mistakes', 'candidate experience', 'employer brand', 'performance review'],
  },
  {
    label: 'Finance / CFO / Accounting',
    value: 'finance',
    terms: ['cash flow management', 'financial planning', 'runway extension', 'unit economics', 'cost cutting', 'budgeting process', 'fundraising round'],
  },
  {
    label: 'Consulting / Professional Services',
    value: 'consulting',
    terms: ['scope creep', 'client management', 'retainer clients', 'proposal writing', 'consulting fees', 'client results', 'consulting business'],
  },
  {
    label: 'E-commerce / DTC',
    value: 'ecommerce',
    terms: ['customer acquisition cost', 'repeat purchase rate', 'abandoned cart', 'DTC growth', 'conversion rate', 'email revenue', 'DTC margins'],
  },
  {
    label: 'Healthcare / Wellness',
    value: 'healthcare',
    terms: ['patient retention', 'practice growth', 'patient experience', 'healthcare marketing', 'referral marketing', 'telehealth', 'wellness business'],
  },
  {
    label: 'Real Estate',
    value: 'real-estate',
    terms: ['real estate investing', 'deal flow', 'property management', 'multifamily investing', 'passive income real estate', 'real estate portfolio', 'cap rate'],
  },
  {
    label: 'Coaching / Solopreneurs',
    value: 'coaching',
    terms: ['coaching business', 'high ticket offer', 'client transformation', 'scaling services', 'lead generation coaching', 'online coaching', 'group program'],
  },
  {
    label: 'Legal / Law Firms',
    value: 'legal',
    terms: ['law firm growth', 'client acquisition lawyer', 'legal operations', 'billing rates', 'in-house counsel', 'law practice management', 'legal tech'],
  },
]

// MAX_ACTIVE_TERMS is now tier-aware — see getTierLimits() in lib/tier.ts
// The component reads the session plan and calls getTierLimits(plan).keywords
const WARN_ACTIVE_TERMS = 8

// ---- LinkedIn Terms Section ----
function LinkedInTermsSection({ sources, onUpdate, planLimit = 10, plan = 'Trial' }: {
  sources: Source[]
  onUpdate: () => void
  planLimit?: number
  plan?: string
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showPackPicker, setShowPackPicker] = useState(false)
  const [selectedIndustry, setSelectedIndustry] = useState('')
  const [loadingPack, setLoadingPack] = useState(false)
  const [newTerm, setNewTerm] = useState('')
  const [adding, setAdding] = useState(false)
  const [addingPreset, setAddingPreset] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [error, setError] = useState('')

  const terms = sources.filter(s => s.type === 'linkedin_term')
  const activeCount = terms.filter(t => t.active).length
  const existingValues = new Set(terms.map(t => t.value.toLowerCase()))
  // Bug #2 fix: atCap must match API enforcement — API counts ALL records including paused,
  // so we use terms.length (total) not activeCount to avoid a mismatch where UI shows "ok"
  // but API returns 429 when the user tries to add.
  const atCap = terms.length >= planLimit

  // Bug #3 fix: parse API error JSON before showing to user
  const parseApiError = async (resp: Response): Promise<string> => {
    try {
      const text = await resp.text()
      const parsed = JSON.parse(text)
      return parsed.error || text
    } catch {
      return 'Something went wrong — try again.'
    }
  }

  const handleToggle = async (source: Source) => {
    setToggling(source.id)
    try {
      const resp = await fetch(`/api/sources/${source.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !source.active }),
      })
      if (!resp.ok) throw new Error(await parseApiError(resp))
      onUpdate()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setToggling(null)
    }
  }

  const handleDelete = async (source: Source) => {
    if (!confirm(`Remove "${source.name}"?`)) return
    setDeleting(source.id)
    try {
      const resp = await fetch(`/api/sources/${source.id}`, { method: 'DELETE' })
      if (!resp.ok) throw new Error(await parseApiError(resp))
      onUpdate()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setDeleting(null)
    }
  }

  const addTerm = async (term: string, isPreset = false) => {
    const t = term.trim()
    if (!t) { setError('Enter a search term.'); return }
    if (existingValues.has(t.toLowerCase())) return
    // Bug #2 fix: use terms.length (total) to match API enforcement — not activeCount
    if (terms.length >= planLimit) {
      setError(`You've reached the ${planLimit}-term limit. Pause or remove a term before adding another.`)
      return
    }
    if (isPreset) setAddingPreset(t)
    else setAdding(true)
    setError('')
    try {
      const resp = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: t, type: 'linkedin_term', value: t, priority: 'high' }),
      })
      if (!resp.ok) throw new Error(await parseApiError(resp))
      if (!isPreset) { setNewTerm(''); setShowAdd(false) }
      onUpdate()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setAdding(false)
      setAddingPreset(null)
    }
  }

  const loadIndustryPack = async () => {
    if (!selectedIndustry) return
    const pack = INDUSTRY_PACKS.find(p => p.value === selectedIndustry)
    if (!pack) return
    setLoadingPack(true)
    setError('')
    const termsToAdd = pack.terms.filter(t => !existingValues.has(t.toLowerCase()))
    let added = 0
    for (const t of termsToAdd) {
      // Bug #2 fix: use terms.length (total) to match API enforcement
      if (terms.length + added >= planLimit) break
      try {
        const resp = await fetch('/api/sources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: t, type: 'linkedin_term', value: t, priority: 'high' }),
        })
        if (resp.ok) added++
      } catch { /* skip failed terms */ }
    }
    setLoadingPack(false)
    setShowPackPicker(false)
    setSelectedIndustry('')
    onUpdate()
  }

  const scanFreq = (plan === 'Scout Pro' || plan === 'Scout Agency' || plan === 'Owner') ? '2×' : '1×'

  return (
    <Section
      title="LinkedIn Keyword Search"
      description={`${terms.length} of ${planLimit} keywords used · ${activeCount} active · Scout searches LinkedIn ${scanFreq} daily`}
    >
      {/* How it works tip */}
      <div className="mb-5 flex gap-3 px-3.5 py-3 rounded-xl bg-slate-800/50 border border-slate-700/40">
        <svg className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-300">What to enter here</p>
          <p className="text-sm text-slate-500 leading-relaxed">
            Use 2–4 word phrases that describe the topics your ideal clients post about — their role, their work, their industry challenges. Fewer focused terms get better results than a long list. <span className="text-slate-400">Example: if you sell to marketing agency owners, terms like "client retention" or "agency operations" will surface the right conversations.</span>
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center justify-between">
          {error}
          <button onClick={() => setError('')} className="ml-2 opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      {/* Active terms */}
      {terms.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {terms.map((t) => (
            <div
              key={t.id}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all ${
                t.active
                  ? 'bg-slate-800 text-slate-300 border-slate-700/50'
                  : 'bg-slate-900/50 text-slate-600 border-slate-800/50'
              }`}
            >
              <button
                onClick={() => handleToggle(t)}
                disabled={toggling === t.id}
                title={t.active ? 'Pause' : 'Resume'}
                className="hover:text-white transition-colors leading-none"
              >
                {toggling === t.id ? <Spinner /> : (t.active ? '●' : '○')}
              </button>
              <span style={{ textDecoration: t.active ? 'none' : 'line-through' }}>{t.value}</span>
              <button
                onClick={() => handleDelete(t)}
                disabled={deleting === t.id}
                className="ml-0.5 text-slate-600 hover:text-red-400 transition-colors leading-none"
              >
                {deleting === t.id ? <Spinner /> : '×'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty state — prompt to use a starter pack */}
      {terms.length === 0 && (
        <div className="mb-5 rounded-xl border border-slate-700/40 bg-slate-900/60 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <span className="text-lg leading-none mt-0.5">🎯</span>
            <div>
              <p className="text-xs font-semibold text-slate-200 mb-1">Start with a starter pack</p>
              <p className="text-sm text-slate-500 leading-relaxed">
                Pick your industry and Scout will add 6–7 high-signal terms that match how your buyers actually post on LinkedIn. You can edit or remove any of them after.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={selectedIndustry}
              onChange={e => setSelectedIndustry(e.target.value)}
              className="flex-1 min-w-[200px] text-xs bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500/50"
            >
              <option value="">Select your industry…</option>
              {INDUSTRY_PACKS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <button
              onClick={loadIndustryPack}
              disabled={!selectedIndustry || loadingPack}
              className="text-xs px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-medium transition-colors flex items-center gap-1.5"
            >
              {loadingPack && <Spinner />}
              Load Pack
            </button>
          </div>
          <p className="text-sm text-slate-600">Prefer to build your own? Use <span className="text-slate-400">Browse suggestions</span> or <span className="text-slate-400">Add custom term</span> below.</p>
        </div>
      )}

      {/* Suggestions panel */}
      {showSuggestions && (
        <div className="mb-5 rounded-xl border border-slate-700/40 bg-slate-900/60 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-300">Suggested terms — click any to add</p>
            <button onClick={() => setShowSuggestions(false)} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">Done</button>
          </div>
          <p className="text-sm text-slate-600 -mt-2">These are starting points. Replace the generic phrases with the specific language your buyers actually use when they post on LinkedIn.</p>
          {TERM_SUGGESTIONS.map(group => (
            <div key={group.label}>
              <p className="text-sm text-slate-500 font-medium mb-2">{group.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {group.terms.map(term => {
                  const already = existingValues.has(term.toLowerCase())
                  return (
                    <button
                      key={term}
                      onClick={() => !already && addTerm(term, true)}
                      disabled={already || addingPreset === term}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                        already
                          ? 'bg-slate-800/30 border-slate-700/30 text-slate-600 cursor-default line-through'
                          : `${colorMap[group.color]} border cursor-pointer`
                      }`}
                    >
                      {addingPreset === term ? '...' : already ? term : `+ ${term}`}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Custom add input */}
      {showAdd && (
        <div className="mb-4 space-y-2">
          <p className="text-sm text-slate-500">Enter a 2–4 word topic or phrase your ideal client would post about on LinkedIn. Avoid single words — they pull too much noise.</p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder='e.g. "what tools do you use" or "just launched" or "lessons learned"'
              value={newTerm}
              onChange={e => setNewTerm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTerm(newTerm)}
              autoFocus
              maxLength={60}
              className="flex-1 min-w-0 text-sm bg-slate-800/80 border border-slate-700/50 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
            />
            <button
              onClick={() => { setShowAdd(false); setNewTerm(''); setError('') }}
              className="text-xs px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => addTerm(newTerm)}
              disabled={adding}
              className="text-xs px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {adding && <Spinner />}
              Add
            </button>
          </div>
        </div>
      )}

      {/* Term count guardrails */}
      {atCap && (
        <div className="mb-4 flex gap-2.5 px-3.5 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <span className="text-red-400 text-sm shrink-0">⛔</span>
          <div className="flex-1">
            <p className="text-xs font-semibold text-red-300">{planLimit}-keyword limit reached</p>
            <p className="text-xs text-red-400/80 mt-0.5 leading-relaxed">
              Pause or remove a term to swap in a different one.
              {(plan === 'Trial' || plan === 'Scout Starter') && (
                <> Pro includes 10 searches · Agency includes 20.{' '}
                  <a href="/upgrade" className="underline text-red-300 hover:text-white transition-colors">Upgrade →</a>
                </>
              )}
              {plan === 'Scout Pro' && (
                <> Agency includes 20 searches.{' '}
                  <a href="/upgrade" className="underline text-red-300 hover:text-white transition-colors">Upgrade →</a>
                </>
              )}
              {(plan === 'Scout Agency' || plan === 'Owner') && (
                <> Keeping 6–10 tightly focused terms tends to surface higher-quality conversations.</>
              )}
            </p>
          </div>
        </div>
      )}
      {!atCap && activeCount >= WARN_ACTIVE_TERMS && (
        <div className="mb-4 flex gap-2.5 px-3.5 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <span className="text-amber-400 text-sm shrink-0">⚠️</span>
          <p className="text-xs text-amber-400/90 leading-relaxed">
            <span className="font-semibold">{activeCount} active searches.</span> Fewer, more focused terms surface higher-quality conversations. Aim for 5–8 tightly targeted phrases.
          </p>
        </div>
      )}

      {/* Starter pack picker — for accounts that already have some terms */}
      {showPackPicker && terms.length > 0 && (
        <div className="mb-4 rounded-xl border border-slate-700/40 bg-slate-900/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-300">Load a starter pack</p>
            <button onClick={() => { setShowPackPicker(false); setSelectedIndustry('') }} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">Cancel</button>
          </div>
          <p className="text-sm text-slate-500 -mt-1">Only terms you don't already have will be added. Won't exceed the {planLimit}-term limit.</p>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={selectedIndustry}
              onChange={e => setSelectedIndustry(e.target.value)}
              className="flex-1 min-w-[200px] text-xs bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500/50"
            >
              <option value="">Select your industry…</option>
              {INDUSTRY_PACKS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <button
              onClick={loadIndustryPack}
              disabled={!selectedIndustry || loadingPack || atCap}
              className="text-xs px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-medium transition-colors flex items-center gap-1.5"
            >
              {loadingPack && <Spinner />}
              Load Pack
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Browse suggestions — always openable; addTerm blocks the add if at cap */}
        <button
          onClick={() => { setShowSuggestions(v => !v); setShowAdd(false); setShowPackPicker(false) }}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.346A3.51 3.51 0 0114.5 18H9.5a3.51 3.51 0 01-2.471-1.024l-.347-.346z" />
          </svg>
          Browse suggestions
        </button>
        {/* Starter packs — always openable; loadIndustryPack respects planLimit */}
        {terms.length > 0 && (
          <button
            onClick={() => { setShowPackPicker(v => !v); setShowAdd(false); setShowSuggestions(false) }}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Starter packs
          </button>
        )}
        {/* Add custom term — disabled when at cap; addTerm already blocks + shows error */}
        <button
          onClick={() => { setShowAdd(v => !v); setShowSuggestions(false); setShowPackPicker(false) }}
          disabled={atCap}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {atCap ? 'At limit — pause a term to add' : 'Add custom term'}
        </button>
      </div>
    </Section>
  )
}

// ---- LinkedIn ICP Section ----
interface IcpProfile {
  id: string
  name: string
  profileUrl: string
  jobTitle: string
  company: string
  industry: string
  active: boolean
  source: string
  notes: string
  addedDate: string
  postsFound: number
}

// ---- Profile Preview Drawer ----
function ProfileDrawer({
  profile,
  allProfiles,
  onClose,
  onNavigate,
  onDelete,
  onToggle,
}: {
  profile: IcpProfile | null
  allProfiles: IcpProfile[]
  onClose: () => void
  onNavigate: (direction: 'prev' | 'next') => void
  onDelete: (p: IcpProfile) => void
  onToggle: (p: IcpProfile) => void
}) {
  const idx = profile ? allProfiles.findIndex(p => p.id === profile.id) : -1
  const hasPrev = idx > 0
  const hasNext = idx < allProfiles.length - 1

  // Keyboard nav
  useEffect(() => {
    if (!profile) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape')      onClose()
      if (e.key === 'ArrowUp'   && hasPrev) onNavigate('prev')
      if (e.key === 'ArrowDown' && hasNext) onNavigate('next')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [profile, hasPrev, hasNext, onClose, onNavigate])

  if (!profile) return null

  // Parse display name — Google titles often come as "First Last - Title | Company"
  const dashIdx = profile.name.indexOf(' - ')
  const displayName = dashIdx > 0 ? profile.name.slice(0, dashIdx) : profile.name
  const titleFromName = dashIdx > 0 ? profile.name.slice(dashIdx + 3) : ''

  // Initials for avatar
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-full sm:w-[340px] bg-[#0d1017] border-l border-slate-700/50 z-50 flex flex-col shadow-2xl overflow-y-auto">

        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-slate-800/60 flex items-start gap-3">
          {/* Avatar */}
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600/40 to-purple-600/40 border border-slate-700/50 flex items-center justify-center text-sm font-semibold text-white shrink-0">
            {initials || '?'}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-white leading-tight truncate">{displayName}</h3>
              {profile.source === 'discovered' && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0">
                  discovered
                </span>
              )}
            </div>
            {(titleFromName || profile.jobTitle || profile.company) && (
              <p className="text-sm text-slate-400 mt-0.5 leading-snug line-clamp-2">
                {titleFromName || [profile.jobTitle, profile.company].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>

          {/* Close */}
          <button onClick={onClose} className="shrink-0 text-slate-600 hover:text-white transition-colors p-1 -mr-1 -mt-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 px-5 py-4 space-y-4">

          {/* Google snippet / notes */}
          {profile.notes && (
            <div className="rounded-xl bg-slate-800/40 border border-slate-700/30 px-4 py-3">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1.5">About</p>
              <p className="text-xs text-slate-300 leading-relaxed">{profile.notes}</p>
            </div>
          )}

          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-3">
            {profile.jobTitle && (
              <div className="rounded-xl bg-slate-800/40 border border-slate-700/30 px-3 py-2.5">
                <p className="text-xs text-slate-600 mb-0.5">Title</p>
                <p className="text-xs text-slate-300 font-medium leading-snug">{profile.jobTitle}</p>
              </div>
            )}
            {profile.company && (
              <div className="rounded-xl bg-slate-800/40 border border-slate-700/30 px-3 py-2.5">
                <p className="text-xs text-slate-600 mb-0.5">Company</p>
                <p className="text-xs text-slate-300 font-medium leading-snug">{profile.company}</p>
              </div>
            )}
            {profile.addedDate && (
              <div className="rounded-xl bg-slate-800/40 border border-slate-700/30 px-3 py-2.5">
                <p className="text-xs text-slate-600 mb-0.5">Added</p>
                <p className="text-xs text-slate-300 font-medium">{profile.addedDate}</p>
              </div>
            )}
            {profile.postsFound > 0 && (
              <div className="rounded-xl bg-slate-800/40 border border-slate-700/30 px-3 py-2.5">
                <p className="text-xs text-slate-600 mb-0.5">Posts found</p>
                <p className="text-xs text-slate-300 font-medium">{profile.postsFound}</p>
              </div>
            )}
          </div>

          {/* Monitoring status */}
          <div className="flex items-center justify-between rounded-xl bg-slate-800/40 border border-slate-700/30 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-300">Monitoring</p>
              <p className="text-sm text-slate-600 mt-0.5">{profile.active ? 'Posts from this profile are being scanned' : 'Paused — not included in scans'}</p>
            </div>
            <button
              onClick={() => onToggle(profile)}
              className={`relative shrink-0 w-8 h-4 rounded-full transition-colors ${profile.active ? 'bg-blue-600' : 'bg-slate-700'}`}
            >
              <span className={`absolute top-0.5 left-0 w-3 h-3 rounded-full bg-white shadow transition-transform ${profile.active ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
          </div>

        </div>

        {/* Footer actions */}
        <div className="px-5 pb-5 pt-3 border-t border-slate-800/60 space-y-2">
          <a
            href={profile.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full text-xs px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
          >
            View on LinkedIn
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>

          <div className="flex gap-2">
            {/* Prev / Next */}
            <button
              onClick={() => onNavigate('prev')}
              disabled={!hasPrev}
              title="Previous profile (↑)"
              className="flex-1 text-xs py-2 rounded-xl border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
              Prev
            </button>
            <button
              onClick={() => onNavigate('next')}
              disabled={!hasNext}
              title="Next profile (↓)"
              className="flex-1 text-xs py-2 rounded-xl border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
            >
              Next
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Remove */}
            <button
              onClick={() => { onDelete(profile); onClose() }}
              title="Remove from pool"
              className="text-xs py-2 px-3 rounded-xl border border-red-500/20 text-red-400/70 hover:text-red-400 hover:border-red-500/40 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>

          {/* Position indicator */}
          <p className="text-center text-xs text-slate-700 pt-1">
            {idx + 1} of {allProfiles.length} · ↑↓ to navigate · Esc to close
          </p>
        </div>
      </div>
    </>
  )
}

const ICP_JOB_TITLES = [
  'Founder', 'Co-Founder', 'CEO', 'Managing Director',
  'VP of Sales', 'Head of Sales', 'Sales Director', 'Account Executive',
  'VP of Marketing', 'Head of Marketing', 'Marketing Director', 'CMO',
  'Head of Operations', 'COO', 'VP of Product', 'Director of Partnerships',
  'Consultant', 'Business Owner', 'Entrepreneur', 'Independent Advisor',
]

function LinkedInICPSection() {
  const { data: icpSession } = useSession()
  const icpPlan    = (icpSession?.user as any)?.plan || 'Trial'
  const isTrial    = icpPlan === 'Trial'
  const tierLimits = getTierLimits(icpPlan)
  const poolSize   = tierLimits.poolSize
  const scanSlots  = tierLimits.scanSlots
  const canDiscover = tierLimits.discoverRunsPerDay > 0
  const scanFreq   = (icpPlan === 'Scout Pro' || icpPlan === 'Scout Agency' || icpPlan === 'Owner') ? '2×' : '1×'

  const [profiles, setProfiles]   = useState<IcpProfile[]>([])
  const [loading, setLoading]     = useState(true)
  const [toggling, setToggling]   = useState<string | null>(null)
  const [deleting, setDeleting]   = useState<string | null>(null)
  const [error, setError]         = useState('')

  // Profile drawer
  const [selectedProfile, setSelectedProfile] = useState<IcpProfile | null>(null)

  // Search + pagination
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(0)
  const PAGE_SIZE = 25

  // Manual add form
  const [showAdd, setShowAdd]     = useState(false)
  const [newUrl, setNewUrl]       = useState('')
  const [newName, setNewName]     = useState('')
  const [newTitle, setNewTitle]   = useState('')
  const [newCompany, setNewCompany] = useState('')
  const [adding, setAdding]       = useState(false)

  // Discovery panel
  const [showDiscover, setShowDiscover]         = useState(false)
  const [discTitles, setDiscTitles]             = useState<string[]>([])
  const [discKeywords, setDiscKeywords]         = useState<string[]>([])
  // discMax removed — plan limit (tierLimits.discoverMaxPerRun) is used automatically by the API
  const [discTitleInput, setDiscTitleInput]     = useState('')
  const [discKwInput, setDiscKwInput]           = useState('')
  const [discovering, setDiscovering]           = useState(false)
  const [discResult, setDiscResult]             = useState<string>('')

  const fetchProfiles = useCallback(async () => {
    try {
      const resp = await fetch('/api/linkedin-icps')
      if (!resp.ok) throw new Error('Failed to load profiles')
      const data = await resp.json()
      setProfiles(data.profiles || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchProfiles() }, [fetchProfiles])

  // Parse API errors — never show raw JSON to the user
  const parseApiError = async (resp: Response): Promise<string> => {
    try {
      const text   = await resp.text()
      const parsed = JSON.parse(text)
      return parsed.error || text
    } catch {
      return 'Something went wrong — try again.'
    }
  }

  const handleToggle = async (p: IcpProfile) => {
    setToggling(p.id)
    try {
      const resp = await fetch(`/api/linkedin-icps/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !p.active }),
      })
      if (!resp.ok) throw new Error(await parseApiError(resp))
      await fetchProfiles()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setToggling(null)
    }
  }

  const handleDelete = async (p: IcpProfile, skipConfirm = false) => {
    if (!skipConfirm && !confirm(`Remove "${p.name}" from your pool?`)) return
    setDeleting(p.id)
    try {
      const resp = await fetch(`/api/linkedin-icps/${p.id}`, { method: 'DELETE' })
      if (!resp.ok) throw new Error(await parseApiError(resp))
      await fetchProfiles()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setDeleting(null)
    }
  }

  const handleAddManual = async () => {
    if (profiles.length >= poolSize) {
      setError(`Your ${poolSize}-profile pool is full. Remove a profile to add a new one.`)
      return
    }
    if (!newUrl.trim()) { setError('LinkedIn profile URL is required.'); return }
    if (!newUrl.includes('linkedin.com/in/')) {
      setError('Please enter a LinkedIn profile URL (linkedin.com/in/...)')
      return
    }
    setAdding(true)
    setError('')
    try {
      const resp = await fetch('/api/linkedin-icps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:       newName.trim() || newUrl.trim(),
          profileUrl: newUrl.trim(),
          jobTitle:   newTitle.trim(),
          company:    newCompany.trim(),
          source:     'manual',
        }),
      })
      if (!resp.ok) throw new Error(await parseApiError(resp))
      setNewUrl(''); setNewName(''); setNewTitle(''); setNewCompany('')
      setShowAdd(false)
      await fetchProfiles()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setAdding(false)
    }
  }

  const handleDiscover = async () => {
    if (!canDiscover) {
      setError('Profile discovery is not available on your current plan.')
      return
    }
    if (profiles.length >= poolSize) {
      setError(`Your ${poolSize}-profile pool is full. Remove a profile to make room.`)
      return
    }
    if (!discTitles.length) { setError('Add at least one job title to search.'); return }
    setDiscovering(true)
    setDiscResult('')
    setError('')
    try {
      const resp = await fetch('/api/linkedin-icps/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobTitles: discTitles, keywords: discKeywords }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Discovery failed')
      setDiscResult(`Added ${data.added} new profile${data.added !== 1 ? 's' : ''}${data.skipped > 0 ? ` · ${data.skipped} already in your pool` : ''}.`)
      await fetchProfiles()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setDiscovering(false)
    }
  }

  const handleDrawerNavigate = (direction: 'prev' | 'next') => {
    if (!selectedProfile) return
    const idx     = profiles.findIndex(p => p.id === selectedProfile.id)
    const nextIdx = direction === 'prev' ? idx - 1 : idx + 1
    if (nextIdx >= 0 && nextIdx < profiles.length) setSelectedProfile(profiles[nextIdx])
  }

  const addDiscTitle = () => {
    const t = discTitleInput.trim()
    if (t && !discTitles.includes(t)) setDiscTitles([...discTitles, t])
    setDiscTitleInput('')
  }
  const addDiscKw = () => {
    const k = discKwInput.trim()
    if (k && !discKeywords.includes(k)) setDiscKeywords([...discKeywords, k])
    setDiscKwInput('')
  }

  const activeCount = profiles.filter(p => p.active).length
  const total       = profiles.length
  const atPoolCap   = total >= poolSize

  const q        = searchQuery.trim().toLowerCase()
  const filtered = q
    ? profiles.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.jobTitle.toLowerCase().includes(q) ||
        p.company.toLowerCase().includes(q) ||
        p.notes.toLowerCase().includes(q)
      )
    : profiles
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage   = Math.min(currentPage, totalPages - 1)
  const paged      = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  // Description: when total exceeds poolSize (grandfathered data), avoid "25 of 10" confusion
  const sectionDescription = total > poolSize
    ? `${total} profiles saved · ${poolSize}-profile ${isTrial ? 'trial ' : ''}pool limit · top ${scanSlots} scanned per run · ${scanFreq} daily`
    : `${total} of ${poolSize} in pool · ${activeCount} active · top ${Math.min(activeCount, scanSlots)} scanned per run · ${scanFreq} daily`

  return (
    <Section
      title="LinkedIn ICP Pool"
      description={sectionDescription}
    >
      {/* ── How the ICP Pool works info box ──────────────────────────────────── */}
      <div className="mb-5 rounded-xl bg-slate-800/50 border border-slate-700/40 overflow-hidden">
        <div className="flex gap-3 px-3.5 py-3 border-b border-slate-700/30">
          <svg className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-slate-300 mb-1">How the ICP Pool works</p>
            <p className="text-sm text-slate-500 leading-relaxed">
              These don&apos;t have to be people you already know or are connected with. You can add{' '}
              <span className="text-slate-400 font-medium">any public LinkedIn profile</span> — prospects you&apos;ve never met, industry voices you follow, potential referral partners. Scout monitors their posts and alerts you when they create a natural opening for you to add value.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-slate-700/30">
          <div className="px-3.5 py-3">
            <p className="text-xs font-semibold text-slate-400 mb-1 flex items-center gap-1.5">
              <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Profile
              <span className="font-normal text-slate-600">— all plans</span>
            </p>
            <p className="text-xs text-slate-600 leading-relaxed">Paste any LinkedIn URL to add a specific person you want to track. Great for prospects, clients, or industry names you already have in mind.</p>
          </div>
          <div className="px-3.5 py-3">
            <p className="text-xs font-semibold text-slate-400 mb-1 flex items-center gap-1.5">
              <svg className="w-3 h-3 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Discover ICPs
              <span className="font-normal text-slate-600">— Starter+</span>
            </p>
            <p className="text-xs text-slate-600 leading-relaxed">Tell Scout a job title and industry, and it finds matching profiles automatically — people you may have never thought to search for.</p>
          </div>
        </div>
        {isTrial && (
          <div className="px-3.5 py-2.5 border-t border-slate-700/30 bg-slate-900/30">
            <p className="text-xs text-slate-500">
              <span className="text-amber-400/90 font-medium">Trial:</span> 10-profile pool · 5 scanned per run · 1 Discover run/day.{' '}
              <a href="/upgrade" className="text-violet-400 hover:text-violet-300 underline underline-offset-2 transition-colors">
                Starter: 50 pool · 10 discovered/run · Pro: 150 pool · 25/run · Agency: 500 pool · 50/run →
              </a>
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-start justify-between gap-2">
          <span>{error}</span>
          <button onClick={() => setError('')} className="shrink-0 opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      {/* ── Action buttons — AT TOP before profile list ─────────────────────── */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {/* Add Profile */}
        <button
          onClick={() => { setShowAdd(!showAdd); setShowDiscover(false); setDiscResult('') }}
          disabled={atPoolCap}
          title={atPoolCap ? `Pool full (${poolSize}/${poolSize}). Remove a profile to add new ones.` : ''}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-700/60 bg-slate-800/60 text-slate-300 hover:text-white hover:border-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {atPoolCap ? 'Pool full' : 'Add Profile'}
        </button>

        {/* Discover ICPs — available on all plans including Trial (1 run/day, 10 profiles) */}
        {canDiscover ? (
          <button
            onClick={() => { setShowDiscover(!showDiscover); setShowAdd(false); setDiscResult('') }}
            disabled={atPoolCap}
            title={atPoolCap ? `Pool full (${poolSize}/${poolSize}). Remove a profile first.` : ''}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-violet-500/30 bg-violet-600/10 text-violet-400 hover:bg-violet-600/20 hover:text-violet-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Discover ICPs
          </button>
        ) : (
          /* Suspended/expired plan: show locked button with upgrade prompt */
          <button
            onClick={() => setShowDiscover(!showDiscover)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-700/40 bg-slate-900/40 text-slate-500 hover:text-slate-400 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Discover ICPs
          </button>
        )}

        {/* Pool cap pill */}
        {atPoolCap && (
          <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400">
            Pool full · {total}/{poolSize}
          </span>
        )}
        {!atPoolCap && total > 0 && (
          <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-slate-800/60 border border-slate-700/40 text-slate-500">
            {poolSize - total} slot{poolSize - total !== 1 ? 's' : ''} remaining
          </span>
        )}
      </div>

      {/* ── Manual Add Form ──────────────────────────────────────────────────── */}
      {showAdd && !atPoolCap && (
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-4 mb-5 space-y-3">
          <p className="text-xs font-semibold text-slate-300">Add Profile Manually</p>
          <input
            type="url"
            placeholder="https://www.linkedin.com/in/username/"
            value={newUrl}
            onChange={e => setNewUrl(e.target.value)}
            autoFocus
            className="w-full bg-slate-800/80 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
          />
          <div className="grid grid-cols-3 gap-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Full name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <input
              type="text"
              placeholder="Job title"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              className="bg-slate-800/80 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
            />
            <input
              type="text"
              placeholder="Company"
              value={newCompany}
              onChange={e => setNewCompany(e.target.value)}
              className="bg-slate-800/80 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAddManual}
              disabled={adding || !newUrl.trim()}
              className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50"
            >
              {adding && <Spinner />}
              Add to Pool
            </button>
            <button
              onClick={() => { setShowAdd(false); setError('') }}
              className="text-xs px-3 py-2 rounded-lg border border-slate-700/50 text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Discover ICPs Panel ──────────────────────────────────────────────── */}
      {showDiscover && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-600/5 p-4 mb-5 space-y-4">
          {!canDiscover ? (
            /* Trial lock state — visible but gated */
            <div className="text-center py-4">
              <div className="w-10 h-10 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-white mb-1">Profile discovery is a paid feature</p>
              <p className="text-sm text-slate-400 mb-4 max-w-sm mx-auto leading-relaxed">
                Tell Scout which job titles and industries to look for, and it automatically finds and adds matching LinkedIn profiles to your pool. No manual searching required.
              </p>
              <div className="text-sm text-slate-500 mb-4 space-y-1">
                <p>Starter: 1 discovery run/day · up to 10 profiles</p>
                <p>Pro: 3 runs/day · up to 25 profiles</p>
                <p>Agency: unlimited runs · up to 50 profiles</p>
              </div>
              <a
                href="/upgrade"
                className="inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors"
              >
                Upgrade to unlock →
              </a>
              <button
                onClick={() => setShowDiscover(false)}
                className="block mx-auto mt-3 text-xs text-slate-600 hover:text-slate-400 transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold text-slate-300 mb-1">Discover ICPs</p>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Scout searches for LinkedIn profiles matching your criteria and adds them to your pool automatically. Results appear within about 60 seconds.
                </p>
              </div>

              {/* Job Titles */}
              <div>
                <p className="text-sm text-slate-400 mb-2 font-medium">Job Titles <span className="text-slate-600 font-normal">(required)</span></p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {discTitles.map(t => (
                    <span key={t} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700/50">
                      {t}
                      <button onClick={() => setDiscTitles(discTitles.filter(x => x !== t))} className="text-slate-600 hover:text-red-400 ml-0.5">×</button>
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {ICP_JOB_TITLES.filter(t => !discTitles.includes(t)).slice(0, 8).map(t => (
                    <button
                      key={t}
                      onClick={() => setDiscTitles([...discTitles, t])}
                      className="text-xs px-2 py-0.5 rounded-full bg-slate-900/60 border border-slate-700/40 text-slate-500 hover:text-slate-300 hover:border-slate-600 transition-colors"
                    >
                      + {t}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Custom job title..."
                    value={discTitleInput}
                    onChange={e => setDiscTitleInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addDiscTitle()}
                    className="flex-1 min-w-0 bg-slate-800/80 border border-slate-700/50 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
                  />
                  <button onClick={addDiscTitle} className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors">Add</button>
                </div>
              </div>

              {/* Narrowing Keywords */}
              <div>
                <p className="text-sm text-slate-400 mb-1 font-medium">Narrowing Keywords <span className="text-slate-600 font-normal">(optional — recommended)</span></p>
                <p className="text-sm text-slate-600 mb-2">Filters broad titles like "CEO" to the right people.</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {discKeywords.map(k => (
                    <span key={k} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700/50">
                      {k}
                      <button onClick={() => setDiscKeywords(discKeywords.filter(x => x !== k))} className="text-slate-600 hover:text-red-400 ml-0.5">×</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. SaaS, B2B consulting, fintech..."
                    value={discKwInput}
                    onChange={e => setDiscKwInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addDiscKw()}
                    className="flex-1 min-w-0 bg-slate-800/80 border border-slate-700/50 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
                  />
                  <button onClick={addDiscKw} className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors">Add</button>
                </div>
              </div>

              {discResult && (
                <div className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
                  {discResult}
                </div>
              )}

              <div className="flex gap-2 items-center flex-wrap">
                <button
                  onClick={handleDiscover}
                  disabled={discovering || !discTitles.length || atPoolCap}
                  className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors disabled:opacity-50"
                >
                  {discovering ? <><Spinner /> Searching...</> : 'Run Discovery'}
                </button>
                <button
                  onClick={() => { setShowDiscover(false); setDiscResult('') }}
                  className="text-xs px-3 py-2 rounded-lg border border-slate-700/50 text-slate-400 hover:text-white transition-colors"
                >
                  Close
                </button>
              </div>

              {/* Plan-aware run context — replaces the old arbitrary number picker */}
              <p className="text-xs text-slate-600 leading-relaxed">
                Adds up to <span className="text-slate-500">{tierLimits.discoverMaxPerRun} profile{tierLimits.discoverMaxPerRun !== 1 ? 's' : ''}</span> per run
                {tierLimits.discoverRunsPerDay < 999
                  ? ` · ${tierLimits.discoverRunsPerDay} run${tierLimits.discoverRunsPerDay !== 1 ? 's' : ''} per day`
                  : ' · unlimited runs per day'}.
                {' '}Tighter job titles and keywords find better matches than running broad searches.
              </p>
            </>
          )}
        </div>
      )}

      {/* ── Scan slot explainer (shown when pool > scan slots) ───────────────── */}
      {!loading && activeCount > scanSlots && (
        <div className="mb-4 flex gap-2.5 px-3.5 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <svg className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-blue-400/90 leading-relaxed">
            You have {activeCount} active profiles. Scout scans the top <span className="font-semibold">{scanSlots}</span> per run, prioritizing recent posters. Profiles rotate automatically so everyone gets coverage.
            {(icpPlan === 'Scout Starter' || isTrial) && (
              <> <a href="/upgrade" className="underline text-blue-300 hover:text-white transition-colors">Upgrade</a> for more scan slots.</>
            )}
          </p>
        </div>
      )}

      {/* ── Profile pool status + list ───────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner />Loading profiles...</div>
      ) : profiles.length === 0 ? (
        <p className="text-sm text-slate-500 mb-4">No profiles in your pool yet. Add one manually or use Discover to find ICPs automatically.</p>
      ) : (
        <>
          {/* Search bar */}
          <div className="relative mb-3">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder={`Search ${total} profiles...`}
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setCurrentPage(0) }}
              className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl pl-9 pr-8 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setCurrentPage(0) }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors"
              >
                ×
              </button>
            )}
          </div>

          {/* Search result count */}
          {q && (
            <p className="text-sm text-slate-600 mb-2">
              {filtered.length === 0 ? 'No matches' : `${filtered.length} match${filtered.length !== 1 ? 'es' : ''}`}
            </p>
          )}

          {/* Profile list */}
          <div className="space-y-2 mb-3">
            {paged.length === 0 && q ? (
              <p className="text-sm text-slate-500 py-3 text-center">No profiles match "{searchQuery}"</p>
            ) : (
              paged.map(p => (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                    p.active ? 'bg-slate-800/60 border-slate-700/50' : 'bg-slate-900/40 border-slate-800/40 opacity-60'
                  }`}
                >
                  {/* Toggle */}
                  <button
                    onClick={() => handleToggle(p)}
                    disabled={toggling === p.id}
                    title={p.active ? 'Pause monitoring' : 'Resume monitoring'}
                    className={`relative shrink-0 w-8 h-4 rounded-full transition-colors ${p.active ? 'bg-blue-600' : 'bg-slate-700'}`}
                  >
                    {toggling === p.id
                      ? <span className="absolute inset-0 flex items-center justify-center"><Spinner /></span>
                      : <span className={`absolute top-0.5 left-0 w-3 h-3 rounded-full bg-white shadow transition-transform ${p.active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    }
                  </button>

                  {/* Profile info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => setSelectedProfile(p)}
                        className="text-xs font-medium text-white hover:text-blue-400 transition-colors truncate text-left"
                      >
                        {p.name || p.profileUrl}
                      </button>
                      {p.source === 'discovered' && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          discovered
                        </span>
                      )}
                    </div>
                    {(p.jobTitle || p.company) && (
                      <p className="text-sm text-slate-500 mt-0.5 truncate">
                        {[p.jobTitle, p.company].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(p)}
                    disabled={deleting === p.id}
                    className="shrink-0 text-slate-600 hover:text-red-400 transition-colors p-1"
                    title="Remove from pool"
                  >
                    {deleting === p.id
                      ? <Spinner />
                      : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    }
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mb-3 px-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Prev
              </button>
              <span className="text-xs text-slate-600">
                Page {safePage + 1} of {totalPages}
                <span className="text-slate-700"> · {filtered.length} total</span>
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Next
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </>
      )}

      {/* Profile preview drawer */}
      <ProfileDrawer
        profile={selectedProfile}
        allProfiles={profiles}
        onClose={() => setSelectedProfile(null)}
        onNavigate={handleDrawerNavigate}
        onDelete={(p) => { handleDelete(p, true) }}
        onToggle={(p) => { handleToggle(p) }}
      />
    </Section>
  )
}

// ---- Business Profile Section ----
const SIGNAL_OPTIONS = [
  { id: 'asking_for_help', label: 'Asking questions or seeking advice from their network' },
  { id: 'industry_discussion', label: 'Starting or joining an industry debate or discussion' },
  { id: 'growing_team', label: 'Talking about growing, hiring, or scaling their business' },
  { id: 'shopping_alternatives', label: 'Comparing tools, vendors, or evaluating alternatives' },
  { id: 'milestone', label: 'Announcing a milestone, promotion, or company change' },
  { id: 'thought_leadership', label: 'Sharing bold takes or opinions you can thoughtfully add to' },
]

function BusinessProfileSection() {
  const [profile, setProfile] = useState({
    businessName: '', industry: '', idealClient: '', problemSolved: '', signalTypes: [] as string[],
  })
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/business-profile')
      .then(r => r.json())
      .then(d => {
        if (d.profile) {
          setProfile({
            businessName: d.profile['Business Name'] || '',
            industry: d.profile['Industry'] || '',
            idealClient: d.profile['Ideal Client'] || '',
            problemSolved: d.profile['Problem Solved'] || '',
            signalTypes: d.profile['Signal Types']
              ? d.profile['Signal Types'].split(',').map((s: string) => s.trim()).filter(Boolean)
              : [],
          })
        }
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetch('/api/business-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  const toggleSignal = (id: string) =>
    setProfile(prev => ({
      ...prev,
      signalTypes: prev.signalTypes.includes(id)
        ? prev.signalTypes.filter(s => s !== id)
        : [...prev.signalTypes, id],
    }))

  if (!loaded) return null

  return (
    <Section
      title="Business Profile"
      description="Tells Scout who you're trying to build relationships with and what kinds of conversations are worth joining. The more specific you are, the sharper the AI scoring."
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-500 mb-1.5">Your business name</label>
            <input
              value={profile.businessName}
              onChange={e => setProfile(p => ({ ...p, businessName: e.target.value }))}
              placeholder="Your business name"
              className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1.5">Your industry / niche</label>
            <input
              value={profile.industry}
              onChange={e => setProfile(p => ({ ...p, industry: e.target.value }))}
              placeholder="e.g. SaaS, marketing services, recruiting..."
              className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-500 mb-1.5">Who is your ideal client?</label>
          <textarea
            value={profile.idealClient}
            onChange={e => setProfile(p => ({ ...p, idealClient: e.target.value }))}
            rows={2}
            placeholder="e.g. Series A SaaS founders in fintech, typically posting about growth, hiring, and product decisions."
            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 resize-none"
          />
        </div>

        <div>
          <label className="block text-sm text-slate-500 mb-1.5">What value do you deliver for them?</label>
          <textarea
            value={profile.problemSolved}
            onChange={e => setProfile(p => ({ ...p, problemSolved: e.target.value }))}
            rows={2}
            placeholder="e.g. We help SaaS founders build their go-to-market motion and close their first 50 enterprise accounts."
            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 resize-none"
          />
        </div>

        <div>
          <label className="block text-sm text-slate-500 mb-2">Conversation types to prioritize</label>
          <div className="grid grid-cols-2 gap-2">
            {SIGNAL_OPTIONS.map(s => {
              const on = profile.signalTypes.includes(s.id)
              return (
                <button
                  key={s.id}
                  onClick={() => toggleSignal(s.id)}
                  className={`text-left flex items-start gap-2 px-3 py-2.5 rounded-lg border text-xs transition-all ${
                    on
                      ? 'bg-blue-600/10 border-blue-500/30 text-blue-300'
                      : 'bg-slate-800/40 border-slate-700/40 text-slate-500 hover:border-slate-600 hover:text-slate-400'
                  }`}
                >
                  <div className={`mt-0.5 w-3 h-3 rounded border shrink-0 flex items-center justify-center ${on ? 'bg-blue-500 border-blue-500' : 'border-slate-600'}`}>
                    {on && <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                  </div>
                  {s.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
          >
            {saving ? 'Saving...' : 'Save profile'}
          </button>
          {saved && <span className="text-xs text-emerald-400">Saved — AI will use this on the next scan</span>}
        </div>
      </div>
    </Section>
  )
}

// ---- Scoring Prompt Builder ----
function ScoringPromptSection() {
  const [mode, setMode]               = useState<'build' | 'edit'>('build')
  const [idealClient, setIdealClient] = useState('')
  const [problemSolved, setProblem]   = useState('')
  const [highValue, setHighValue]     = useState('')
  const [lowValue, setLowValue]       = useState('')
  const [commentStyle, setCommentStyle] = useState('')
  const [generating, setGenerating]   = useState(false)
  const [prompt, setPrompt]           = useState('')
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)
  const [hasCustom, setHasCustom]     = useState(false)
  const [loaded, setLoaded]           = useState(false)
  const [genError, setGenError]       = useState('')

  useEffect(() => {
    fetch('/api/business-profile')
      .then(r => r.json())
      .then(d => {
        const p = d.profile?.['Scoring Prompt'] || ''
        if (p) { setPrompt(p); setHasCustom(true); setMode('edit') }
        // Pre-fill builder from saved Business Profile if present
        setIdealClient(d.profile?.['Ideal Client'] || '')
        setProblem(d.profile?.['Problem Solved'] || '')
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  const handleGenerate = async () => {
    if (!idealClient.trim() || !problemSolved.trim()) {
      setGenError('Fill in at least the first two fields to generate a prompt.')
      return
    }
    setGenError('')
    setGenerating(true)
    try {
      const resp = await fetch('/api/generate-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idealClient, problemSolved, highValueSignals: highValue, lowValueSignals: lowValue, commentStyle }),
      })
      const data = await resp.json()
      if (data.error) throw new Error(data.error)
      setPrompt(data.prompt)
      setMode('edit')
    } catch (e: any) {
      setGenError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetch('/api/business-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scoringPrompt: prompt }),
      })
      setHasCustom(true)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) return null

  const inputCls = "w-full bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 resize-none leading-relaxed"

  return (
    <Section
      title="AI Scoring Prompt"
      description="The AI reads this before scoring every LinkedIn post. A well-tuned prompt is what separates a feed full of real conversation opportunities from one full of noise."
    >
      {/* Mode switcher */}
      <div className="flex items-center gap-1 mb-5 p-1 rounded-lg bg-slate-900/60 border border-slate-700/40 w-fit">
        <button
          onClick={() => setMode('build')}
          className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${mode === 'build' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
        >
          ✦ Prompt builder
        </button>
        <button
          onClick={() => setMode('edit')}
          className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${mode === 'edit' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Edit directly
        </button>
      </div>

      {/* ── Build mode ── */}
      {mode === 'build' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500 leading-relaxed">
            Answer these questions and the AI will write a custom scoring prompt tailored to your business. The more specific you are, the better your feed quality will be.
          </p>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1.5">
              1. Who is your ideal client? <span className="text-slate-600 font-normal">(role, industry, company size)</span>
            </label>
            <textarea rows={2} value={idealClient} onChange={e => setIdealClient(e.target.value)}
              placeholder="e.g. B2B SaaS founders, typically 10–100 employees, posting about growth strategy, hiring, and go-to-market."
              className={inputCls} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1.5">
              2. What value do you deliver for them?
            </label>
            <textarea rows={2} value={problemSolved} onChange={e => setProblem(e.target.value)}
              placeholder="e.g. We help founders build and scale an outbound sales motion so they can close enterprise deals without hiring a full team."
              className={inputCls} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1.5">
              3. What does a high-value post look like? <span className="text-slate-600 font-normal">(optional — AI will infer if blank)</span>
            </label>
            <textarea rows={2} value={highValue} onChange={e => setHighValue(e.target.value)}
              placeholder="e.g. A founder asking for tool recommendations, sharing a scaling challenge, debating a go-to-market strategy, or announcing a new hire."
              className={inputCls} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1.5">
              4. What should be filtered out? <span className="text-slate-600 font-normal">(optional)</span>
            </label>
            <textarea rows={2} value={lowValue} onChange={e => setLowValue(e.target.value)}
              placeholder="e.g. Promotional posts, content marketing, job listings, motivational quotes, pure thought leadership monologues with no comment angle."
              className={inputCls} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1.5">
              5. How should comment suggestions read? <span className="text-slate-600 font-normal">(optional)</span>
            </label>
            <textarea rows={2} value={commentStyle} onChange={e => setCommentStyle(e.target.value)}
              placeholder="e.g. Peer-to-peer tone, 2–3 sentences, ask one question, never pitch or mention the product."
              className={inputCls} />
          </div>

          {genError && (
            <p className="text-xs text-red-400">{genError}</p>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {generating ? (
              <><Spinner /> Generating prompt...</>
            ) : (
              <><span>✦</span> Generate prompt</>
            )}
          </button>
        </div>
      )}

      {/* ── Edit mode ── */}
      {mode === 'edit' && (
        <div className="space-y-3">
          {!hasCustom && (
            <div className="flex gap-2.5 px-3.5 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              No custom prompt saved yet — the default prompt is active. Use the builder or write your own below, then save.
            </div>
          )}
          {hasCustom && (
            <div className="flex gap-2.5 px-3.5 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Custom prompt active — this is what the AI uses to score every post.
            </div>
          )}
          <textarea
            rows={20}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Paste or write a scoring prompt here, or use the builder to generate one."
            className="w-full bg-slate-900/80 border border-slate-700/40 rounded-xl px-4 py-3 text-xs text-slate-300 font-mono leading-relaxed focus:outline-none focus:border-blue-500/40 resize-none"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !prompt.trim()}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
            >
              {saving ? 'Saving...' : 'Save prompt'}
            </button>
            {saved && <span className="text-xs text-emerald-400">Saved — AI will use this on the next scan</span>}
            <button
              onClick={() => setMode('build')}
              className="ml-auto text-xs text-slate-600 hover:text-slate-400 transition-colors"
            >
              Back to builder
            </button>
          </div>
        </div>
      )}
    </Section>
  )
}

// ---- System Integration Overview Cards ----
function SystemIntegrationCards() {
  const { data: session } = useSession()
  const plan        = (session?.user as any)?.plan || 'Trial'
  const slackUnlocked = plan === 'Scout Pro' || plan === 'Scout Agency' || plan === 'Owner'
  const crmUnlocked   = plan === 'Scout Agency' || plan === 'Owner'

  const [slackConnected, setSlackConnected] = useState(false)
  const [slackChannel,   setSlackChannel]   = useState('')
  const [crmType,        setCrmType]        = useState('None')
  const [crmConnected,   setCrmConnected]   = useState(false)
  const [loaded,         setLoaded]         = useState(false)

  useEffect(() => {
    const fetches: Promise<void>[] = [
      fetch('/api/slack-settings')
        .then(r => r.json())
        .then(d => {
          setSlackConnected(!!d.slackBotToken)
          setSlackChannel(d.slackChannelName || d.slackChannelId || '')
        })
        .catch(() => {}),
    ]
    if (crmUnlocked) {
      fetches.push(
        fetch('/api/crm-settings')
          .then(r => r.json())
          .then(d => {
            setCrmType(d.crmType || 'None')
            setCrmConnected(!!d.crmApiKey && d.crmType !== 'None')
          })
          .catch(() => {})
      )
    }
    Promise.all(fetches).finally(() => setLoaded(true))
  }, [crmUnlocked])

  if (!loaded) return null

  const lockBadge = (label: string) => (
    <span className="flex items-center gap-1 text-[10px] font-medium text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded-full shrink-0">
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
      {label}
    </span>
  )

  const statusDot = (connected: boolean) => (
    <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${connected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
  )

  const cardBorder = (unlocked: boolean, connected: boolean) =>
    !unlocked ? 'border-violet-700/30' : connected ? 'border-emerald-500/20' : 'border-amber-500/20'

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

      {/* Slack card */}
      <div className={`rounded-2xl border bg-[#12151e] p-5 flex flex-col gap-3 ${cardBorder(slackUnlocked, slackConnected)}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-800/60 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-slate-300" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Slack Digest</p>
              <p className="text-xs text-slate-500">Daily AI briefing</p>
            </div>
          </div>
          {!slackUnlocked ? lockBadge('Pro+') : statusDot(slackConnected)}
        </div>

        {!slackUnlocked ? (
          <>
            <p className="text-sm text-slate-500 leading-relaxed">
              Receive an AI-written digest of your highest-scored posts every morning, with ready-to-use comment angles.
            </p>
            <a href="/upgrade" className="text-xs font-semibold text-violet-400 hover:text-violet-300 transition-colors underline underline-offset-2 decoration-violet-600">
              Upgrade to Pro to unlock →
            </a>
          </>
        ) : slackConnected ? (
          <>
            <p className="text-sm font-medium text-emerald-400">Connected · #{slackChannel.replace(/^#/, '')}</p>
            <p className="text-xs text-slate-500">Daily digest at ~8 AM Pacific · Configure below</p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-amber-400">Not connected</p>
            <p className="text-xs text-slate-500">Set up your bot token and channel below to receive your daily digest</p>
          </>
        )}
      </div>

      {/* CRM card */}
      <div className={`rounded-2xl border bg-[#12151e] p-5 flex flex-col gap-3 ${cardBorder(crmUnlocked, crmConnected)}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-800/60 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-white">CRM Integration</p>
              <p className="text-xs text-slate-500">Push contacts to GoHighLevel · HubSpot coming soon</p>
            </div>
          </div>
          {!crmUnlocked ? lockBadge('Agency') : statusDot(crmConnected)}
        </div>

        {!crmUnlocked ? (
          <>
            <p className="text-sm text-slate-500 leading-relaxed">
              Push engaged contacts directly into GoHighLevel or HubSpot with a single click from your Scout feed.
            </p>
            <a href="/upgrade" className="text-xs font-semibold text-violet-400 hover:text-violet-300 transition-colors underline underline-offset-2 decoration-violet-600">
              Upgrade to Agency to unlock →
            </a>
          </>
        ) : crmConnected ? (
          <>
            <p className="text-sm font-medium text-emerald-400">Connected · {crmType}</p>
            <p className="text-xs text-slate-500">Push contacts from the feed · Configure below</p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-amber-400">Not connected</p>
            <p className="text-xs text-slate-500">Add your GoHighLevel credentials below to activate</p>
          </>
        )}
      </div>

    </div>
  )
}

// ---- Slack Integration Section ----
const SLACK_STEPS = [
  'Go to api.slack.com/apps and click "Create New App" → "From scratch".',
  'Name it "Scout" and pick your Slack workspace.',
  'In the left menu click "OAuth & Permissions". Under "Bot Token Scopes" add: chat:write and channels:read.',
  'Scroll up and click "Install to Workspace" → Allow.',
  'Copy the "Bot OAuth Token" that starts with xoxb- and paste it below.',
  'Invite the bot to your channel in Slack: type /invite @Scout in the channel.',
  'Paste the channel name (without #) into the Channel Name field below.',
]

function SlackIntegrationSection() {
  const { data: slackSession } = useSession()
  const slackPlan = (slackSession?.user as any)?.plan || 'Trial'
  const slackUnlocked = slackPlan === 'Scout Pro' || slackPlan === 'Scout Agency' || slackPlan === 'Owner'

  const [botToken,      setBotToken]      = useState('')
  const [channelId,     setChannelId]     = useState('')
  const [channelName,   setChannelName]   = useState('')
  const [showToken,     setShowToken]     = useState(false)
  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState(false)
  const [testing,       setTesting]       = useState(false)
  const [testResult,    setTestResult]    = useState<{ ok: boolean; msg: string } | null>(null)
  const [saved,         setSaved]         = useState(false)
  const [error,         setError]         = useState('')
  const [sendingDigest, setSendingDigest] = useState(false)
  const [digestResult,  setDigestResult]  = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    fetch('/api/slack-settings')
      .then(r => r.json())
      .then(d => {
        setBotToken(d.slackBotToken    || '')
        setChannelId(d.slackChannelId  || '')
        setChannelName(d.slackChannelName || '')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true); setError(''); setSaved(false)
    try {
      const resp = await fetch('/api/slack-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slackBotToken: botToken, slackChannelId: channelId, slackChannelName: channelName }),
      })
      if (!resp.ok) throw new Error(await resp.text())
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!botToken.trim()) { setTestResult({ ok: false, msg: 'Paste your Bot Token first.' }); return }
    setTesting(true); setTestResult(null)
    try {
      const r = await fetch('/api/slack-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken }),
      })
      const data = await r.json()
      if (data.ok) {
        setTestResult({ ok: true, msg: `Connected as @${data.bot_id || 'bot'} in workspace "${data.team}".` })
      } else {
        setTestResult({ ok: false, msg: `Slack returned: ${data.error}. Double-check the token.` })
      }
    } catch {
      setTestResult({ ok: false, msg: 'Request failed — check your network connection and try again.' })
    } finally {
      setTesting(false)
    }
  }

  const handleSendDigest = async () => {
    setSendingDigest(true); setDigestResult(null)
    try {
      const r = await fetch('/api/trigger-digest', { method: 'POST' })
      const data = await r.json()
      if (r.ok) {
        setDigestResult({ ok: true, msg: data.message || 'Digest sent successfully.' })
      } else {
        setDigestResult({ ok: false, msg: data.error || 'Failed to send digest.' })
      }
    } catch {
      setDigestResult({ ok: false, msg: 'Request failed — check your network connection.' })
    } finally {
      setSendingDigest(false)
    }
  }

  if (loading) return null

  // Locked plans: overview card (SystemIntegrationCards) handles the upgrade prompt
  if (!slackUnlocked) return null

  const isConfigured = !!botToken && !!channelName

  return (
    <Section
      title="Slack Integration"
      description="The daily digest and scan alerts are delivered via Slack. Required for the digest to work."
    >
      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex justify-between">
          <span>{error}</span><button onClick={() => setError('')}>×</button>
        </div>
      )}

      {/* Status badge */}
      <div className={`mb-4 flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
        isConfigured
          ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
          : 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
      }`}>
        <span className={`w-1.5 h-1.5 rounded-full ${isConfigured ? 'bg-emerald-400' : 'bg-amber-400'}`} />
        {isConfigured
          ? `Connected · Daily digest goes to #${channelName.replace(/^#/, '')}`
          : 'Not connected — the daily digest will not send until Slack is set up'}
      </div>

      {/* Setup instructions */}
      <div className="rounded-xl bg-slate-900/60 border border-slate-700/40 p-4 mb-4">
        <p className="text-xs font-semibold text-slate-300 mb-2">How to connect Slack</p>
        <ol className="space-y-1.5">
          {SLACK_STEPS.map((step, i) => (
            <li key={i} className="flex gap-2 text-sm text-slate-500 leading-relaxed">
              <span className="shrink-0 w-4 h-4 rounded-full bg-slate-800 border border-slate-700/50 flex items-center justify-center text-[11px] text-slate-600 mt-0.5">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      <div className="space-y-3">
        {/* Bot Token */}
        <div>
          <p className="text-sm text-slate-400 font-medium mb-1.5">Bot OAuth Token</p>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={botToken}
              onChange={e => { setBotToken(e.target.value); setTestResult(null) }}
              placeholder="xoxb-..."
              className="w-full bg-slate-800/80 border border-slate-700/50 rounded-xl px-3 py-2 pr-10 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 font-mono"
            />
            <button
              onClick={() => setShowToken(!showToken)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors text-xs"
            >
              {showToken ? 'hide' : 'show'}
            </button>
          </div>
        </div>

        {/* Channel */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-sm text-slate-400 font-medium mb-1.5">Channel Name <span className="text-slate-600 font-normal">(without #)</span></p>
            <input
              type="text"
              value={channelName}
              onChange={e => setChannelName(e.target.value.replace(/^#/, ''))}
              placeholder="general"
              className="w-full bg-slate-800/80 border border-slate-700/50 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
            />
          </div>
          <div>
            <p className="text-sm text-slate-400 font-medium mb-1.5">Channel ID <span className="text-slate-600 font-normal">(optional)</span></p>
            <input
              type="text"
              value={channelId}
              onChange={e => setChannelId(e.target.value)}
              placeholder="C0XXXXXXXX"
              className="w-full bg-slate-800/80 border border-slate-700/50 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 font-mono"
            />
          </div>
        </div>

        {/* Test result */}
        {testResult && (
          <div className={`px-3 py-2 rounded-lg text-xs ${
            testResult.ok
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
              : 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
          }`}>
            {testResult.ok ? '✓ ' : '⚠ '}{testResult.msg}
          </div>
        )}

        {/* Digest result */}
        {digestResult && (
          <div className={`px-3 py-2 rounded-lg text-xs ${
            digestResult.ok
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
              : 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
          }`}>
            {digestResult.ok ? '✓ ' : '⚠ '}{digestResult.msg}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50"
          >
            {saving ? <><Spinner /> Saving…</> : saved ? '✓ Saved' : 'Save'}
          </button>
          <button
            onClick={handleTest}
            disabled={testing || !botToken.trim()}
            className="text-xs px-3 py-2 rounded-lg border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600 disabled:opacity-50 transition-colors"
          >
            {testing ? 'Testing…' : 'Test Connection'}
          </button>
          <button
            onClick={handleSendDigest}
            disabled={sendingDigest || !botToken.trim() || !channelId.trim()}
            className="text-xs px-3 py-2 rounded-lg border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600 disabled:opacity-50 transition-colors"
            title="Send the daily digest to Slack right now"
          >
            {sendingDigest ? 'Sending…' : '📨 Send Test Digest'}
          </button>
        </div>
      </div>
    </Section>
  )
}

// ---- CRM Integration Section ----

function CRMIntegrationSection() {
  const { data: crmSession } = useSession()
  const crmPlan     = (crmSession?.user as any)?.plan || 'Trial'
  const crmUnlocked = crmPlan === 'Scout Agency' || crmPlan === 'Owner'

  const [crmType,        setCrmType]        = useState('None')
  const [crmApiKey,      setCrmApiKey]      = useState('')
  const [crmLocationId,  setCrmLocationId]  = useState('')
  const [crmPipelineId,  setCrmPipelineId]  = useState('')
  const [showKey,        setShowKey]        = useState(false)
  const [loading,        setLoading]        = useState(true)
  const [saving,         setSaving]         = useState(false)
  const [testing,        setTesting]        = useState(false)
  const [testResult,     setTestResult]     = useState<{ ok: boolean; msg: string } | null>(null)
  const [saved,          setSaved]          = useState(false)
  const [error,          setError]          = useState('')

  useEffect(() => {
    fetch('/api/crm-settings')
      .then(r => r.json())
      .then(d => {
        setCrmType(d.crmType         || 'None')
        setCrmApiKey(d.crmApiKey     || '')
        setCrmLocationId(d.crmLocationId || '')
        setCrmPipelineId(d.crmPipelineId || '')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const resp = await fetch('/api/crm-settings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ crmType, crmApiKey, crmLocationId, crmPipelineId }),
      })
      if (!resp.ok) throw new Error(await resp.text())
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // Test connection routes through /api/crm-test (server-side proxy) to avoid CORS
  const handleTest = async () => {
    if (!crmApiKey.trim())     { setTestResult({ ok: false, msg: 'Paste your Private Integration token first.' }); return }
    if (!crmLocationId.trim()) { setTestResult({ ok: false, msg: 'Enter your Location ID first.' }); return }
    setTesting(true)
    setTestResult(null)
    try {
      const r = await fetch('/api/crm-test', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ crmType, crmApiKey, crmLocationId }),
      })
      const data = await r.json()
      setTestResult({ ok: data.ok, msg: data.message || (data.ok ? 'Connected.' : 'Connection failed.') })
    } catch {
      setTestResult({ ok: false, msg: 'Could not reach the test endpoint. Check your network connection.' })
    } finally {
      setTesting(false)
    }
  }

  if (loading) return null
  if (!crmUnlocked) return null

  const isGHL = crmType === 'GoHighLevel'

  return (
    <Section
      title="CRM Integration"
      description="Push engaged contacts directly into GoHighLevel with one click from your feed."
    >
      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')}>×</button>
        </div>
      )}

      {/* CRM selector */}
      <div className="mb-5">
        <p className="text-sm text-slate-400 font-medium mb-2">CRM Platform</p>
        <div className="flex gap-2 flex-wrap">
          {/* None */}
          <button
            onClick={() => { setCrmType('None'); setTestResult(null) }}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              crmType === 'None'
                ? 'bg-blue-600/20 border-blue-500/40 text-blue-400'
                : 'border-slate-700/50 bg-slate-800/60 text-slate-400 hover:text-white'
            }`}
          >
            None
          </button>

          {/* GoHighLevel */}
          <button
            onClick={() => { setCrmType('GoHighLevel'); setTestResult(null) }}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              crmType === 'GoHighLevel'
                ? 'bg-blue-600/20 border-blue-500/40 text-blue-400'
                : 'border-slate-700/50 bg-slate-800/60 text-slate-400 hover:text-white'
            }`}
          >
            GoHighLevel
          </button>

          {/* HubSpot — Coming Soon */}
          <button
            disabled
            title="HubSpot integration coming soon"
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-700/30 bg-slate-800/30 text-slate-600 cursor-not-allowed flex items-center gap-1.5"
          >
            HubSpot
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-500 font-medium">Soon</span>
          </button>
        </div>
      </div>

      {/* GoHighLevel setup */}
      {isGHL && (
        <div className="space-y-5">

          {/* Step-by-step instructions */}
          <div className="rounded-xl bg-[#0d1018] border border-slate-700/40 p-4">
            <p className="text-xs font-semibold text-slate-300 mb-3">Setup — 3 things you need from GoHighLevel</p>
            <ol className="space-y-3">
              <li className="flex gap-3">
                <span className="shrink-0 w-5 h-5 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-[11px] text-blue-400 font-bold mt-0.5">1</span>
                <div>
                  <p className="text-sm text-slate-300 font-medium">Your Location ID</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    Log into GHL and open your sub-account. Look at the URL — it looks like{' '}
                    <span className="font-mono text-slate-400">app.gohighlevel.com/v2/location/<strong className="text-blue-400">XXXXXXXX</strong>/dashboard</span>
                    . Copy the ID between <span className="font-mono text-slate-400">/location/</span> and the next slash.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-5 h-5 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-[11px] text-blue-400 font-bold mt-0.5">2</span>
                <div>
                  <p className="text-sm text-slate-300 font-medium">A Private Integration token</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    In GHL, go to <span className="text-slate-400">Settings → Integrations → Private Integrations</span> → Create new integration.
                    Name it <span className="text-slate-400">"Scout"</span>. Under Scopes, enable{' '}
                    <span className="font-mono text-slate-400">contacts.write</span>,{' '}
                    <span className="font-mono text-slate-400">contacts.readonly</span>, and{' '}
                    <span className="font-mono text-slate-400">opportunities.write</span>.
                    Click Create and copy the Access Token — it starts with <span className="font-mono text-slate-400">eyJ…</span>
                  </p>
                  <p className="text-xs text-amber-500/80 mt-1.5 flex items-start gap-1">
                    <span className="shrink-0 mt-px">⚠</span>
                    <span>Use Private Integrations — not the legacy API Key. The legacy key will not work with Scout.</span>
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-5 h-5 rounded-full bg-slate-700/60 border border-slate-600/30 flex items-center justify-center text-[11px] text-slate-500 font-bold mt-0.5">3</span>
                <div>
                  <p className="text-sm text-slate-400 font-medium">Your Pipeline ID <span className="font-normal text-slate-600">(optional)</span></p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    In GHL, go to Opportunities → Pipelines. Click the pipeline you want Scout leads added to.
                    Copy the ID from the URL — it looks like{' '}
                    <span className="font-mono text-slate-400">OJuoy9LGTq9r6m5YxeH9</span>.
                    When set, Scout automatically creates an Opportunity at the first stage of this pipeline every time you push a contact.
                  </p>
                </div>
              </li>
            </ol>
          </div>

          {/* Location ID field */}
          <div>
            <p className="text-sm text-slate-300 font-medium mb-1">
              Location ID <span className="text-red-400 text-xs">required</span>
            </p>
            <p className="text-xs text-slate-600 mb-1.5">
              The sub-account ID from your GHL URL — not the agency ID.
            </p>
            <input
              type="text"
              value={crmLocationId}
              onChange={e => { setCrmLocationId(e.target.value); setTestResult(null) }}
              placeholder="e.g. G43COt3uGbAzymts6uXB"
              className="w-full bg-slate-800/80 border border-slate-700/50 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 font-mono"
            />
          </div>

          {/* Private Integration Token field */}
          <div>
            <p className="text-sm text-slate-300 font-medium mb-1">
              Private Integration Token <span className="text-red-400 text-xs">required</span>
            </p>
            <p className="text-xs text-slate-600 mb-1.5">
              From GHL Settings → Integrations → Private Integrations. Starts with <span className="font-mono">eyJ…</span>
            </p>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={crmApiKey}
                onChange={e => { setCrmApiKey(e.target.value); setTestResult(null) }}
                placeholder="eyJ…"
                className="w-full bg-slate-800/80 border border-slate-700/50 rounded-xl px-3 py-2 pr-10 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 font-mono"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors text-xs"
              >
                {showKey ? 'hide' : 'show'}
              </button>
            </div>
          </div>

          {/* Pipeline ID field */}
          <div>
            <p className="text-sm text-slate-400 font-medium mb-1">
              Pipeline ID <span className="text-slate-600 font-normal text-xs">optional</span>
            </p>
            <p className="text-xs text-slate-600 mb-1.5">
              GHL → Opportunities → Pipelines → click your pipeline → copy the ID from the URL.
              When set, Scout creates an Opportunity at the first stage of this pipeline on every push.
            </p>
            <input
              type="text"
              value={crmPipelineId}
              onChange={e => setCrmPipelineId(e.target.value)}
              placeholder="e.g. OJuoy9LGTq9r6m5YxeH9"
              className="w-full bg-slate-800/80 border border-slate-700/50 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 font-mono"
            />
          </div>

          {/* Test result */}
          {testResult && (
            <div className={`px-3 py-2.5 rounded-lg text-xs leading-relaxed ${
              testResult.ok
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                : 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
            }`}>
              {testResult.ok ? '✓ ' : '⚠ '}{testResult.msg}
            </div>
          )}

          {/* Save + Test buttons */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50"
            >
              {saving ? <><Spinner /> Saving…</> : saved ? '✓ Saved' : 'Save'}
            </button>
            <button
              onClick={handleTest}
              disabled={testing || !crmApiKey.trim() || !crmLocationId.trim()}
              className="text-xs px-3 py-2 rounded-lg border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600 disabled:opacity-40 transition-colors"
            >
              {testing ? 'Testing…' : 'Test Connection'}
            </button>
          </div>

          {/* What gets pushed */}
          <div className="rounded-xl bg-slate-900/40 border border-slate-700/30 px-4 py-3">
            <p className="text-sm font-medium text-slate-400 mb-1.5">What happens when you push a contact</p>
            <ul className="space-y-1 text-xs text-slate-500 leading-relaxed">
              <li className="flex gap-2"><span className="text-slate-600 shrink-0">→</span> Scout searches GHL for an existing contact with the same LinkedIn URL to avoid duplicates.</li>
              <li className="flex gap-2"><span className="text-slate-600 shrink-0">→</span> Creates (or updates) a GHL contact with the author's name and LinkedIn profile URL.</li>
              <li className="flex gap-2"><span className="text-slate-600 shrink-0">→</span> Adds a note to the contact with the post snippet, your engagement notes, and a link back to the LinkedIn post.</li>
              <li className="flex gap-2"><span className="text-slate-600 shrink-0">→</span> If a Pipeline ID is set, creates an Opportunity at the first stage of that pipeline automatically.</li>
              <li className="flex gap-2"><span className="text-slate-600 shrink-0">→</span> The post moves to the "In CRM" tab in Scout so you always know who's been pushed.</li>
            </ul>
          </div>

        </div>
      )}

      {crmType === 'None' && (
        <p className="text-sm text-slate-600">
          Select a CRM above to connect your account and enable one-click contact creation from the feed.
          GoHighLevel is fully supported. HubSpot integration is coming soon.
        </p>
      )}
    </Section>
  )
}

// ---- Account Section (password change) ----
function AccountSection() {
  const { data: session } = useSession()
  const user = session?.user as any

  const [current,  setCurrent]  = useState('')
  const [next,     setNext]     = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [saving,   setSaving]   = useState(false)
  const [success,  setSuccess]  = useState(false)
  const [error,    setError]    = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)

    if (next !== confirm) {
      setError('New passwords do not match.')
      return
    }
    if (next.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }

    setSaving(true)
    try {
      const resp = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Failed to change password.')
      setSuccess(true)
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Account info */}
      <Section title="Account Details">
        <div className="space-y-3">
          <div>
            <p className="text-sm text-slate-500 mb-1">Email</p>
            <p className="text-sm text-white font-medium">{user?.email || '—'}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500 mb-1">Company</p>
            <p className="text-sm text-white font-medium">{user?.name || '—'}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500 mb-1">Plan</p>
            <p className="text-sm text-white font-medium">{(session?.user as any)?.plan || 'Trial'}</p>
          </div>
        </div>
      </Section>

      {/* Change password */}
      <Section
        title="Change Password"
        description="Choose a strong password that is at least 8 characters."
      >
        <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
          {/* Current */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1.5">Current password</label>
            <input
              type="password"
              value={current}
              onChange={e => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
              placeholder="Your current password"
            />
          </div>

          {/* New */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1.5">New password</label>
            <input
              type="password"
              value={next}
              onChange={e => setNext(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
              placeholder="At least 8 characters"
            />
          </div>

          {/* Confirm */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1.5">Confirm new password</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
              className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
              placeholder="Repeat new password"
            />
          </div>

          {/* Error / success */}
          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          {success && (
            <p className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
              Password updated. Use your new password the next time you sign in.
            </p>
          )}

          <button
            type="submit"
            disabled={saving || !current || !next || !confirm}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
          >
            {saving ? <><Spinner /> Saving...</> : 'Update password'}
          </button>
        </form>
      </Section>
    </div>
  )
}

// ---- Team Section ----
interface TeamMember {
  id:        string
  email:     string
  name:      string
  status:    string
  createdAt: string
}

function TeamSection() {
  const { data: teamSession } = useSession()
  const teamPlan   = (teamSession?.user as any)?.plan || 'Trial'
  const isTrialTeam = teamPlan === 'Trial'

  const [members,     setMembers]     = useState<TeamMember[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting,    setInviting]    = useState(false)
  const [removing,    setRemoving]    = useState<string | null>(null)
  const [feedback,    setFeedback]    = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const loadMembers = useCallback(async () => {
    setLoadingList(true)
    try {
      const resp = await fetch('/api/team/members')
      if (!resp.ok) throw new Error('Failed to load team')
      const data = await resp.json()
      setMembers(data.members || [])
    } catch {
      // silently fail — treat as no members
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => { loadMembers() }, [loadMembers])

  async function handleInvite() {
    if (!inviteEmail.trim()) return
    setInviting(true)
    setFeedback(null)
    try {
      const resp = await fetch('/api/team/invite', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: inviteEmail.trim() }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        setFeedback({ type: 'error', msg: data.error || 'Invite failed.' })
      } else {
        setInviteEmail('')
        setFeedback({
          type: 'success',
          msg:  data.emailWarning
            ? 'Access created — but the invite email failed to send. Share the login link and credentials manually.'
            : `Invite sent to ${inviteEmail.trim()}. They'll receive login instructions by email.`,
        })
        loadMembers()
      }
    } catch {
      setFeedback({ type: 'error', msg: 'Network error. Please try again.' })
    } finally {
      setInviting(false)
    }
  }

  async function handleRemove(member: TeamMember) {
    setRemoving(member.id)
    setFeedback(null)
    try {
      const resp = await fetch('/api/team/remove', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ recordId: member.id }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        setFeedback({ type: 'error', msg: data.error || 'Could not remove member.' })
      } else {
        setFeedback({ type: 'success', msg: `${member.email}'s access has been removed.` })
        loadMembers()
      }
    } catch {
      setFeedback({ type: 'error', msg: 'Network error. Please try again.' })
    } finally {
      setRemoving(null)
    }
  }

  const hasMember = members.length > 0
  const atLimit   = members.length >= 1

  return (
    <div className="space-y-4">
      <Section
        title="Team Access"
        description="Give one teammate read-only access to your Scout feed."
      >
        {/* Access rules callout */}
        <div className="rounded-xl bg-slate-800/50 border border-slate-700/40 p-4 mb-6 flex gap-3">
          <div className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center">
            <svg className="w-3 h-3 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-300 mb-1">What a team member can do</p>
            <ul className="text-sm text-slate-500 space-y-0.5">
              <li>View and filter all posts in the Scout feed</li>
              <li>Copy AI comment starters and act on leads</li>
              <li>Mark posts as Engaged, Replied, or Skipped</li>
            </ul>
            <p className="text-sm text-slate-600 mt-2">They cannot access Settings, billing, or any account configuration. You can remove their access at any time.</p>
          </div>
        </div>

        {/* Feedback banner */}
        {feedback && (
          <div className={`mb-4 px-4 py-3 rounded-xl border text-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}>
            {feedback.msg}
          </div>
        )}

        {/* Current member list */}
        {loadingList ? (
          <div className="flex items-center gap-2 py-4 text-slate-500 text-sm">
            <Spinner /> Loading team...
          </div>
        ) : hasMember ? (
          <div className="space-y-3 mb-6">
            {members.map(m => (
              <div key={m.id} className="flex items-center justify-between rounded-xl bg-slate-800/60 border border-slate-700/40 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-600/30 flex items-center justify-center text-xs font-semibold text-blue-300">
                    {m.email.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium">{m.email}</p>
                    <p className="text-sm text-slate-500">Feed access only · added {m.createdAt || 'recently'}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleRemove(m)}
                  disabled={removing === m.id}
                  className="text-xs px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                >
                  {removing === m.id ? 'Removing...' : 'Remove access'}
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {/* Invite form */}
        {isTrialTeam ? (
          <div className="rounded-xl bg-slate-800/30 border border-violet-700/30 px-4 py-4 flex items-start gap-3">
            <svg className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <div>
              <p className="text-xs font-semibold text-violet-300 mb-1">Team access is a paid feature</p>
              <p className="text-sm text-slate-500 leading-relaxed">
                Inviting teammates is available on any paid plan. Upgrade to give your team read-only access to the Scout feed.
              </p>
              <a href="/upgrade" className="inline-block mt-2 text-xs font-semibold text-violet-400 hover:text-violet-300 transition-colors underline underline-offset-2 decoration-violet-600">
                Upgrade to unlock →
              </a>
            </div>
          </div>
        ) : atLimit ? (
          <div className="rounded-xl bg-slate-800/30 border border-slate-700/30 px-4 py-3 text-xs text-slate-500">
            You've reached the limit of 1 team member on this plan. Remove the existing member to invite someone new.
          </div>
        ) : (
          <div>
            {!hasMember && (
              <p className="text-sm font-medium text-slate-400 mb-2">Invite your first team member</p>
            )}
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="teammate@company.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleInvite() }}
                className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <button
                onClick={handleInvite}
                disabled={inviting || !inviteEmail.trim()}
                className="shrink-0 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors disabled:opacity-40"
              >
                {inviting ? 'Sending...' : 'Send invite'}
              </button>
            </div>
            <p className="text-sm text-slate-600 mt-2">
              They'll receive an email with their login credentials and a walkthrough of the feed.
            </p>
          </div>
        )}
      </Section>
    </div>
  )
}

// ---- Plan & Billing Section ----
function PlanBillingSection() {
  const { data: session } = useSession()
  const user             = session?.user as any
  const plan             = user?.plan || 'Trial'
  const trialEndsAt      = user?.trialEndsAt ? new Date(user.trialEndsAt) : null
  const display          = getPlanDisplay(plan)
  const isTrial          = plan === 'Trial'
  const isStripePlan     = isStripeBilledPlan(plan)   // Starter/Pro/Agency only — has real Stripe subscription
  const isInternal       = plan === 'Owner' || plan === 'Complimentary'

  // Trial countdown — Math.floor + hours, matches TrialBanner exactly
  const msLeft    = trialEndsAt ? trialEndsAt.getTime() - Date.now() : 0
  const isExpired = isTrial && trialEndsAt ? msLeft <= 0 : false
  const daysLeft  = isTrial && !isExpired && trialEndsAt ? Math.floor(msLeft / 86_400_000) : null
  const hoursLeft = isTrial && !isExpired && trialEndsAt ? Math.floor((msLeft % 86_400_000) / 3_600_000) : 0

  // Billing portal state
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalError,   setPortalError]   = useState('')

  // Cancel flow state
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [canceling,         setCanceling]         = useState(false)
  const [canceledUntil,     setCanceledUntil]     = useState('')   // formatted date string when canceled
  const [cancelError,       setCancelError]       = useState('')

  // On mount, check if subscription is already in 'canceling' state (persists across refreshes)
  useEffect(() => {
    if (!isStripePlan) return
    fetch('/api/billing/status')
      .then(r => r.json())
      .then((d: { status?: string; accessUntil?: string }) => {
        if (d.status === 'canceling' && d.accessUntil) {
          setCanceledUntil(
            new Date(d.accessUntil).toLocaleDateString('en-US', {
              month: 'long', day: 'numeric', year: 'numeric',
            })
          )
        }
      })
      .catch(() => {}) // non-fatal — UI degrades gracefully without the amber card
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStripePlan])

  async function handleManageSubscription() {
    setPortalLoading(true)
    setPortalError('')
    try {
      const res  = await fetch('/api/billing/portal')
      const data = await res.json()
      if (!res.ok || !data.url) {
        setPortalError(data.error || 'Could not open billing portal. Please try again.')
        return
      }
      window.location.href = data.url
    } catch {
      setPortalError('Network error — please try again.')
    } finally {
      setPortalLoading(false)
    }
  }

  async function handleConfirmCancel() {
    setCanceling(true)
    setCancelError('')
    setShowCancelConfirm(false)
    try {
      const res  = await fetch('/api/billing/cancel', { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.accessUntil) {
        setCanceledUntil(
          new Date(data.accessUntil).toLocaleDateString('en-US', {
            month: 'long', day: 'numeric', year: 'numeric',
          })
        )
      } else {
        setCancelError(data.error || 'Cancellation failed — please try again.')
      }
    } catch {
      setCancelError('Network error — please try again.')
    } finally {
      setCanceling(false)
    }
  }

  function TrialBadge() {
    if (!isTrial || isExpired) return null
    if (daysLeft === null) return null
    const label =
      daysLeft === 0 ? `${hoursLeft}h left` :
                       `${daysLeft}d ${hoursLeft}h left`
    const cls =
      daysLeft <= 1 ? 'bg-red-900/30 border-red-700/40 text-red-400' :
      daysLeft <= 5 ? 'bg-amber-900/30 border-amber-700/40 text-amber-400' :
                     'bg-emerald-900/30 border-emerald-700/40 text-emerald-400'
    return (
      <span className={`text-xs px-3 py-1 rounded-full font-medium border ${cls}`}>
        {label}
      </span>
    )
  }

  return (
    <div className="space-y-6">

      {/* ── Current plan card ── */}
      <div className="rounded-2xl bg-[#0f1117] border border-slate-700/50 p-6 space-y-4">

        {/* Plan header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm text-slate-500 mb-1 uppercase tracking-wider font-medium">Current plan</p>
            <p className="text-2xl font-bold text-white">{display.name}</p>
            <p className="text-slate-400 text-sm">{display.price}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <TrialBadge />
            {isExpired && (
              <span className="text-xs px-3 py-1 rounded-full font-medium border bg-red-900/30 border-red-700/40 text-red-400">
                Trial expired
              </span>
            )}
          </div>
        </div>

        {/* ── State: Trial active ── */}
        {isTrial && !isExpired && (
          <div className="pt-1 space-y-3">
            <a
              href="/upgrade"
              className="inline-block bg-[#4F6BFF] hover:bg-[#3d5aee] text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
            >
              Upgrade now
            </a>
            <p className="text-sm text-slate-500">
              Your trial includes full access to all Starter features.{' '}
              <a href="/upgrade" className="text-[#4F6BFF] hover:underline">See plans →</a>
            </p>
          </div>
        )}

        {/* ── State: Trial expired ── */}
        {isExpired && (
          <div className="pt-1 space-y-2">
            <p className="text-sm text-slate-400">Your trial has ended. Subscribe to restore access to your feed and saved contacts.</p>
            <a
              href="/upgrade"
              className="inline-block bg-[#4F6BFF] hover:bg-[#3d5aee] text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
            >
              Start your plan →
            </a>
          </div>
        )}

        {/* ── State: Active Stripe subscription — normal ── */}
        {isStripePlan && !canceledUntil && (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              onClick={handleManageSubscription}
              disabled={portalLoading}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-medium px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-60"
            >
              {portalLoading ? 'Opening…' : 'Manage subscription'}
            </button>

            {/* 2-step cancel confirmation */}
            {!showCancelConfirm && !canceling && (
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="text-slate-500 hover:text-red-400 text-sm transition-colors"
              >
                Cancel subscription
              </button>
            )}
            {showCancelConfirm && (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-slate-400">Cancel and keep access until billing period ends?</span>
                <button
                  onClick={handleConfirmCancel}
                  disabled={canceling}
                  className="text-red-400 hover:text-red-300 font-medium transition-colors disabled:opacity-50"
                >
                  Yes, cancel
                </button>
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  className="text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Keep my plan
                </button>
              </div>
            )}
            {canceling && (
              <span className="text-xs text-slate-500">Canceling…</span>
            )}
          </div>
        )}

        {/* Portal error */}
        {portalError && (
          <p className="text-xs text-red-400 bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-2">
            {portalError}
          </p>
        )}

        {/* Cancel error */}
        {cancelError && (
          <p className="text-xs text-red-400 bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-2">
            {cancelError}
          </p>
        )}

        {/* ── State: Just canceled — access-until banner ── */}
        {canceledUntil && (
          <div className="rounded-xl bg-amber-900/15 border border-amber-800/30 px-4 py-3 space-y-2">
            <p className="text-sm text-amber-300 font-medium">
              Subscription canceled — full access until {canceledUntil}
            </p>
            <p className="text-xs text-slate-400">
              A confirmation email is on its way. Changed your mind?
            </p>
            <a
              href="/upgrade"
              className="inline-block text-xs font-semibold text-[#4F6BFF] hover:underline"
            >
              Resubscribe →
            </a>
          </div>
        )}

        {/* ── State: Internal plan (Owner / Complimentary) ── */}
        {isInternal && (
          <p className="text-xs text-slate-600 pt-1">Internal plan — no billing account attached.</p>
        )}

      </div>

    </div>
  )
}

// ---- Settings Agent ----

interface SettingsChatMessage {
  role:    'user' | 'assistant'
  content: string
}

interface SettingsAgentCtx {
  plan:                   string
  activeTab:              string
  businessProfileComplete: boolean
  businessName:           string
  industry:               string
  keywordCount:           number
  icpCount:               number
  hasCustomPrompt:        boolean
  hasSlack:               boolean
  hasCrm:                 boolean
}

function buildSettingsOpening(ctx: SettingsAgentCtx): string {
  const { activeTab, businessProfileComplete, keywordCount, icpCount, hasSlack, plan } = ctx

  if (activeTab === 'profile') {
    if (!businessProfileComplete) {
      return "I noticed your Business Profile isn't filled in yet. This is the most important first step — Scout uses your industry and ideal client description to score posts more accurately. Want me to walk you through what to enter in each field?"
    }
    return "Your Business Profile looks good. If you want to fine-tune how Scout scores posts, the AI & Scoring tab has a Custom Scoring Prompt where you can describe exactly what signals matter most for your business."
  }

  if (activeTab === 'linkedin') {
    if (keywordCount === 0) {
      return "You don't have any keywords set up yet. Keywords are what Scout searches LinkedIn for — without them, your inbox will stay empty. Want me to explain how to choose effective terms for your industry?"
    }
    if (icpCount === 0) {
      return `You have ${keywordCount} keyword${keywordCount !== 1 ? 's' : ''} tracking — solid start. Your ICP Pool is empty though. Adding specific LinkedIn profiles to watch often produces the highest-signal posts, because you're monitoring people you already know are your ideal clients. Want to know how it works?`
    }
    return `Looking good — ${keywordCount} keyword${keywordCount !== 1 ? 's' : ''} and ${icpCount} ICP profile${icpCount !== 1 ? 's' : ''} in your pool. If your inbox feels thin, try adding a few more keywords or ICP profiles. Anything you'd like me to explain?`
  }

  if (activeTab === 'ai') {
    if (!ctx.hasCustomPrompt) {
      return "This tab shows how Scout automatically filters your feed, and gives you the one lever you can actually control: the AI Scoring Prompt. Scores 1–4 get filtered out silently, 5+ land in your inbox, 6+ go to your Slack digest, and 8+ get the priority badge. You can't change those numbers — but you can write a prompt that tells Scout exactly what kinds of posts should score high for your business. Want me to walk you through what makes a good one?"
    }
    return "You have a custom scoring prompt set up — that's the most impactful thing you can do on this tab. If your inbox quality feels off, tweaking the prompt is usually the fix. Want to talk through what's working or what you'd change?"
  }

  if (activeTab === 'system') {
    if (!hasSlack) {
      return "You haven't connected Slack yet. That's how you get your daily digest — Scout sends your top-scored posts to a Slack channel every morning at ~8 AM Pacific (3 PM UTC). It takes about 2 minutes to set up. Want me to walk you through it?"
    }
    return "Slack is connected — you'll get your daily digest at ~8 AM Pacific (3 PM UTC) with posts that scored 6/10 or higher. Anything about the system integrations you'd like me to explain?"
  }

  if (activeTab === 'billing') {
    return `You're on the ${plan} plan. I can explain what's included, what each upgrade unlocks, or answer any questions about how billing works. What would you like to know?`
  }

  return "Hey, I'm Scout Agent. I can walk you through any setting on this page, explain what it does, and help you get the most out of the platform. What can I help with?"
}

function SettingsAgentPanel({
  open,
  onClose,
  plan,
  activeTab,
  keywordCount,
}: {
  open:         boolean
  onClose:      () => void
  plan:         string
  activeTab:    string
  keywordCount: number
}) {
  const [messages,    setMessages]    = useState<SettingsChatMessage[]>([])
  const [input,       setInput]       = useState('')
  const [loading,     setLoading]     = useState(false)
  const [ctx,         setCtx]         = useState<SettingsAgentCtx | null>(null)
  const [ctxLoading,  setCtxLoading]  = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150)
  }, [open])

  // Reset on close
  useEffect(() => {
    if (!open) {
      setMessages([])
      setInput('')
      setCtx(null)
    }
  }, [open])

  // Fetch context and generate proactive opening when panel first opens.
  // Uses an `active` flag to guard state updates if the panel closes while
  // the fetches are still in-flight (prevents stale state warnings).
  useEffect(() => {
    if (!open || ctx !== null || ctxLoading) return
    let active = true
    const fetchCtx = async () => {
      setCtxLoading(true)
      try {
        const [bpRes, icpRes, slackRes] = await Promise.all([
          fetch('/api/business-profile'),
          fetch('/api/linkedin-icps'),
          fetch('/api/slack-settings'),
        ])
        if (!active) return
        const [bpData, icpData, slackData] = await Promise.all([
          bpRes.json(), icpRes.json(), slackRes.json(),
        ])
        if (!active) return

        const profile   = bpData.profile
        const builtCtx: SettingsAgentCtx = {
          plan,
          activeTab,
          businessProfileComplete: !!(profile?.['Industry'] && profile?.['Ideal Client']),
          businessName:   profile?.['Business Name'] || '',
          industry:       profile?.['Industry']      || '',
          keywordCount,
          icpCount:       icpData.profiles?.length   ?? 0,
          hasCustomPrompt: !!(profile?.['Scoring Prompt']),
          hasSlack:       !!(slackData.slackBotToken),
          hasCrm:         false, // non-Agency plans always return 'None'
        }
        setCtx(builtCtx)
        setMessages([{ role: 'assistant', content: buildSettingsOpening(builtCtx) }])
      } catch {
        if (!active) return
        const fallback: SettingsAgentCtx = {
          plan, activeTab,
          businessProfileComplete: false, businessName: '', industry: '',
          keywordCount, icpCount: 0,
          hasCustomPrompt: false, hasSlack: false, hasCrm: false,
        }
        setCtx(fallback)
        setMessages([{ role: 'assistant', content: "Hey, I'm Scout Agent. I can walk you through any setting on this page and help you get the most out of the platform. What can I help with?" }])
      } finally {
        if (active) setCtxLoading(false)
      }
    }
    fetchCtx()
    return () => { active = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return
    if (text.length > 1000) return
    setInput('')

    const userMsg: SettingsChatMessage = { role: 'user', content: text }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setLoading(true)

    const effectiveCtx = ctx ?? {
      plan, activeTab,
      businessProfileComplete: false, businessName: '', industry: '',
      keywordCount, icpCount: 0,
      hasCustomPrompt: false, hasSlack: false, hasCrm: false,
    }

    try {
      const res = await fetch('/api/settings-agent', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          message: text,
          context: effectiveCtx,
          history: messages.slice(-6),
        }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply ?? "Sorry, I didn't get a response. Try again?" }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I ran into an error. Try again?" }])
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop — clicking outside closes the panel */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Panel */}
      <div
        className="fixed bottom-20 right-5 z-50 w-80 sm:w-96 flex flex-col bg-[#0d1017] border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden"
        style={{ height: '480px' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-white">Scout Agent</span>
            <span className="text-xs text-slate-600">Settings guide</span>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 1 && (
              <button
                onClick={() => {
                  // Keep ctx so the proactive opener regenerates from existing state
                  const freshOpening = ctx ? buildSettingsOpening({ ...ctx, activeTab }) : null
                  setMessages(freshOpening ? [{ role: 'assistant', content: freshOpening }] : [])
                }}
                title="New conversation"
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800/60"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                New
              </button>
            )}
            <button onClick={onClose} className="text-slate-600 hover:text-slate-400 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {ctxLoading && messages.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-8">
              <svg className="animate-spin h-4 w-4 text-slate-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm text-slate-500">Checking your setup...</span>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] text-sm rounded-xl px-3.5 py-2.5 leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-violet-600/25 border border-violet-500/30 text-slate-200'
                  : 'bg-slate-800/70 border border-slate-700/40 text-slate-300'
              }`}>
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-800/70 border border-slate-700/40 rounded-xl px-3.5 py-3">
                <div className="flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-slate-800 px-3 py-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
              }}
              placeholder="Ask anything about settings..."
              rows={1}
              maxLength={1000}
              className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 resize-none focus:outline-none focus:border-violet-500/50 transition-colors"
              style={{ maxHeight: '100px', overflowY: 'auto' }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="shrink-0 w-8 h-8 rounded-xl bg-violet-600 border border-violet-500/60 flex items-center justify-center text-white hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ---- Tab definitions ----
const TABS = [
  { id: 'profile',  label: 'Profile'        },
  { id: 'linkedin', label: 'LinkedIn'       },
  { id: 'ai',       label: 'AI & Scoring'   },
  { id: 'system',   label: 'System'         },
  { id: 'billing',  label: 'Plan & Billing' },
  { id: 'account',  label: 'Account'        },
  { id: 'team',     label: 'Team'           },
] as const
type TabId = typeof TABS[number]['id']

// ---- Main page ----
export default function SettingsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  // Feed-only users can only access the feed — redirect immediately
  useEffect(() => {
    if (status === 'loading') return
    const user = session?.user as any
    if (user?.isFeedOnly) router.replace('/')
  }, [session, status, router])

  const [activeTab, setActiveTab] = useState<TabId>('profile')

  // Read ?tab= param on mount so deep-links like /settings?tab=linkedin work.
  // Reads directly from window.location.search (client-only, inside useEffect)
  // to avoid adding useSearchParams() which requires a Suspense boundary.
  useEffect(() => {
    const tabParam = new URLSearchParams(window.location.search).get('tab')
    const validIds = ['profile', 'linkedin', 'ai', 'system', 'billing', 'account', 'team']
    if (tabParam && validIds.includes(tabParam)) {
      setActiveTab(tabParam as TabId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [sources, setSources]     = useState<Source[]>([])
  const [loading, setLoading]     = useState(true)
  const [loadError, setLoadError] = useState('')

  // Settings Agent
  const [agentOpen, setAgentOpen] = useState(false)

  const fetchSources = useCallback(async () => {
    try {
      const resp = await fetch('/api/sources')
      if (!resp.ok) throw new Error('Failed to load sources')
      const data = await resp.json()
      setSources(data.sources)
    } catch (e: any) {
      setLoadError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSources() }, [fetchSources])

  return (
    <div className="min-h-screen bg-[#0a0c10] text-white">
      <Nav />

      {/* Tab bar */}
      <div className="sticky top-[57px] z-10 bg-[#0a0c10]/95 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-3xl mx-auto px-5">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 text-xs font-medium px-4 py-2 rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-5 py-8 space-y-6">

        {/* ── Profile ── */}
        {activeTab === 'profile' && (
          <BusinessProfileSection />
        )}

        {/* ── LinkedIn ── */}
        {activeTab === 'linkedin' && (
          <>
            {/* Context banner */}
            <div className="rounded-xl bg-[#4F6BFF]/8 border border-[#4F6BFF]/20 px-5 py-4 flex gap-4 items-start">
              <svg className="w-5 h-5 text-[#4F6BFF] mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h14m-.5 15.5v-5.3a3.26 3.26 0 00-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 011.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 001.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 00-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/></svg>
              <div>
                <p className="text-sm font-medium text-slate-200 mb-0.5">Scout is a LinkedIn-only tool</p>
                <p className="text-sm text-slate-400 leading-relaxed">All posts come from two LinkedIn sources: <span className="text-slate-300 font-medium">Keyword Search</span> (finds public posts matching your terms) and <span className="text-slate-300 font-medium">ICP Profiles</span> (monitors specific people you're tracking). Configure both below for maximum coverage.</p>
              </div>
            </div>
            {loading && (
              <div className="flex items-center justify-center gap-2 py-8 text-slate-500 text-sm">
                <Spinner /> Loading sources...
              </div>
            )}
            {loadError && (
              <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                {loadError}
              </div>
            )}
            {!loading && !loadError && (
              <>
                <ZeroStreakBanner />
                <LinkedInTermsSection
                  sources={sources}
                  onUpdate={fetchSources}
                  planLimit={getTierLimits((session?.user as any)?.plan || 'Trial').keywords}
                  plan={(session?.user as any)?.plan || 'Trial'}
                />
              </>
            )}
            <LinkedInICPSection />
          </>
        )}

        {/* ── AI & Scoring ── */}
        {activeTab === 'ai' && (
          <>
            <Section
              title="How Scout filters and prioritizes your posts"
              description="Scout scores every LinkedIn post 1–10 before deciding what you see. These thresholds are the automatic filter — they run silently on every scan so your inbox stays focused on what matters. You can't adjust the numbers here, but the AI Scoring Prompt below gives you full control over how posts get scored in the first place."
            >
              {/* Score floor — what happens to 1–4 (the missing context) */}
              <div className="flex items-start gap-3 mb-5 px-3.5 py-3 rounded-xl bg-slate-900/50 border border-slate-700/30">
                <div className="w-5 h-5 rounded-full bg-slate-700/60 border border-slate-600/40 flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="w-2.5 h-2.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-slate-300 font-medium mb-0.5">Scores 1–4: filtered out before you see anything</p>
                  <p className="text-sm text-slate-500 leading-relaxed">Scout found these posts but decided they weren&apos;t relevant enough for your business. They&apos;re removed silently — they don&apos;t appear in your inbox, don&apos;t count against any limits, and you never have to deal with them. A well-tuned scoring prompt keeps real opportunities well above this cutoff.</p>
                </div>
              </div>

              {/* Three threshold cards — responsive grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                {[
                  {
                    label:      'Saved to inbox',
                    value:      '5 / 10',
                    note:       'Any post scoring 5 or above lands in your inbox for review. This is your main workspace — everything you see here cleared the relevance bar.',
                    border:     'border-amber-500/25',
                    bg:         'bg-amber-500/5',
                    dotColor:   'bg-amber-400',
                    valueColor: 'text-amber-300',
                  },
                  {
                    label:      'Slack digest',
                    value:      '6 / 10',
                    note:       'Posts scoring 6 or above are bundled into your daily morning summary and sent to your Slack channel. Set up Slack under the System tab.',
                    border:     'border-blue-500/25',
                    bg:         'bg-blue-500/5',
                    dotColor:   'bg-blue-400',
                    valueColor: 'text-blue-300',
                  },
                  {
                    label:      'Priority badge',
                    value:      '8 / 10',
                    note:       'Posts scoring 8 or above get a green badge and sort to the top of your inbox. These are your best opportunities — engage with these first.',
                    border:     'border-emerald-500/25',
                    bg:         'bg-emerald-500/5',
                    dotColor:   'bg-emerald-400',
                    valueColor: 'text-emerald-300',
                  },
                ].map((item) => (
                  <div key={item.label} className={`rounded-xl ${item.bg} border ${item.border} p-4`}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${item.dotColor}`} />
                      <p className="text-sm text-slate-400">{item.label}</p>
                    </div>
                    <p className={`text-2xl font-bold ${item.valueColor} mb-1.5`}>{item.value}</p>
                    <p className="text-sm text-slate-500 leading-snug">{item.note}</p>
                  </div>
                ))}
              </div>

              {/* Additive / cumulative explanation */}
              <p className="text-sm text-slate-500 leading-relaxed">
                These checks are <span className="text-slate-400 font-medium">cumulative</span> — a post scoring 9 passes all three: it lands in your inbox, appears in your Slack digest, and gets the priority badge. A post scoring 5 passes only the first check and sits in your inbox without appearing in the digest.
              </p>
            </Section>

            <ScoringPromptSection />
          </>
        )}

        {/* ── System ── */}
        {activeTab === 'system' && (
          <div className="space-y-4">
            <SystemIntegrationCards />
            <SlackIntegrationSection />
            <CRMIntegrationSection />
          </div>
        )}

        {/* ── Plan & Billing ── */}
        {activeTab === 'billing' && (
          <PlanBillingSection />
        )}

        {/* ── Account ── */}
        {activeTab === 'account' && (
          <AccountSection />
        )}

        {/* ── Team ── */}
        {activeTab === 'team' && (
          <TeamSection />
        )}

      </main>

      {/* ── Settings Agent: floating trigger button ── */}
      <div className="fixed bottom-5 right-5 z-40">
        <button
          onClick={() => setAgentOpen(prev => !prev)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border font-semibold text-white transition-all duration-200 shadow-lg text-xs ${
            agentOpen
              ? 'bg-violet-700 border-violet-500/80 shadow-violet-700/50 scale-95'
              : 'bg-violet-600 border-violet-500/60 shadow-violet-600/40 hover:bg-violet-500 hover:shadow-violet-500/60 hover:scale-105 active:scale-95'
          }`}
          title="Scout Agent — Settings guide"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-xs font-semibold tracking-wide">Scout Agent</span>
        </button>
      </div>

      {/* ── Settings Agent panel ── */}
      <SettingsAgentPanel
        open={agentOpen}
        onClose={() => setAgentOpen(false)}
        plan={(session?.user as any)?.plan || 'Trial'}
        activeTab={activeTab}
        keywordCount={sources.length}
      />

    </div>
  )
}
