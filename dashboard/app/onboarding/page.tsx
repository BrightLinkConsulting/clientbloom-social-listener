'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { getTierLimits } from '@/lib/tier'

// ---- Industry starter packs (keep in sync with settings/page.tsx — 7 terms per pack) ----
const INDUSTRY_PACKS: { label: string; value: string; terms: string[] }[] = [
  { label: 'Agency / Marketing Agency',      value: 'agency',          terms: ['client retention', 'agency growth', 'losing a client', 'client churn', 'retainer model', 'agency operations', 'client onboarding'] },
  { label: 'B2B SaaS',                       value: 'saas',            terms: ['product led growth', 'reducing churn', 'customer onboarding', 'time to value', 'SaaS pricing', 'expansion revenue', 'churn rate'] },
  { label: 'Customer Success',               value: 'customer-success', terms: ['customer health score', 'churn prevention', 'renewal strategy', 'expansion playbook', 'QBR prep', 'CS team scaling', 'customer onboarding'] },
  { label: 'Sales / Revenue',                value: 'sales',           terms: ['pipeline review', 'cold outreach', 'deal closing', 'quota attainment', 'discovery call', 'objection handling', 'sales process'] },
  { label: 'HR / Talent / Recruiting',       value: 'hr',              terms: ['talent acquisition', 'employee retention', 'reducing turnover', 'hiring mistakes', 'candidate experience', 'employer brand', 'performance review'] },
  { label: 'Consulting / Professional Svcs', value: 'consulting',      terms: ['scope creep', 'client management', 'retainer clients', 'proposal writing', 'consulting fees', 'client results', 'consulting business'] },
  { label: 'Coaching / Solopreneurs',        value: 'coaching',        terms: ['coaching business', 'high ticket offer', 'client transformation', 'scaling services', 'lead generation coaching', 'online coaching', 'group program'] },
  { label: 'Finance / CFO / Accounting',     value: 'finance',         terms: ['cash flow management', 'financial planning', 'runway extension', 'unit economics', 'cost cutting', 'budgeting process', 'fundraising round'] },
  { label: 'E-commerce / DTC',               value: 'ecommerce',       terms: ['customer acquisition cost', 'repeat purchase rate', 'abandoned cart', 'DTC growth', 'conversion rate', 'email revenue', 'DTC margins'] },
  { label: 'Real Estate',                    value: 'real-estate',     terms: ['real estate investing', 'deal flow', 'property management', 'multifamily investing', 'passive income real estate', 'real estate portfolio', 'cap rate'] },
  { label: 'Legal / Law Firms',              value: 'legal',           terms: ['law firm growth', 'client acquisition lawyer', 'legal operations', 'billing rates', 'in-house counsel', 'law practice management', 'legal tech'] },
  { label: 'Healthcare / Wellness',          value: 'healthcare',      terms: ['patient retention', 'practice growth', 'patient experience', 'healthcare marketing', 'referral marketing', 'telehealth', 'wellness business'] },
]

/**
 * Attempt to auto-match the user's free-text industry field to a pack.
 * Returns the pack `value` string, or '' if nothing matches.
 */
function detectIndustryPack(industry: string): string {
  const lower = industry.toLowerCase()
  if (lower.includes('agency') || lower.includes('marketing agency')) return 'agency'
  if (lower.includes('saas') || lower.includes('software as a service')) return 'saas'
  if (lower.includes('customer success') || lower.includes(' cs ') || lower.includes('churn')) return 'customer-success'
  if (lower.includes('sales') || lower.includes('revenue') || lower.includes('bdr') || lower.includes('sdr')) return 'sales'
  if (lower.includes('talent') || lower.includes('recruiting') || lower.includes(' hr ') || lower.includes('human resource')) return 'hr'
  if (lower.includes('consult')) return 'consulting'
  if (lower.includes('coach') || lower.includes('solopreneur')) return 'coaching'
  if (lower.includes('finance') || lower.includes('cfo') || lower.includes('accounting') || lower.includes('bookkeep')) return 'finance'
  if (lower.includes('ecomm') || lower.includes('dtc') || lower.includes('e-comm') || lower.includes('direct to consumer')) return 'ecommerce'
  if (lower.includes('real estate') || lower.includes('realt') || lower.includes('property')) return 'real-estate'
  if (lower.includes('legal') || lower.includes('law firm') || lower.includes('attorney')) return 'legal'
  if (lower.includes('health') || lower.includes('wellness') || lower.includes('medical') || lower.includes('clinic')) return 'healthcare'
  return ''
}

// ---- ClientBloom bloom mark ----
function ClientBloomMark({ size = 32 }: { size?: number }) {
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

const SIGNALS = [
  { id: 'asking_for_help',      label: 'Asking questions or seeking advice from their network' },
  { id: 'industry_discussion',  label: 'Starting or joining an industry debate or discussion' },
  { id: 'milestone',            label: 'Announcing a milestone, promotion, or company change' },
  { id: 'growing_team',         label: 'Talking about growing, hiring, or scaling their business' },
  { id: 'shopping_alternatives',label: 'Comparing tools, vendors, or evaluating alternatives' },
  { id: 'thought_leadership',   label: 'Sharing bold takes or opinions you can thoughtfully add to' },
]

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 justify-center mb-10">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i === current
              ? 'w-6 h-2 bg-violet-600'
              : i < current
              ? 'w-2 h-2 bg-violet-600/40'
              : 'w-2 h-2 bg-slate-700'
          }`}
        />
      ))}
    </div>
  )
}

// ── Step 1: Business Info ────────────────────────────────────────────────────
function Step1({
  data,
  onChange,
  onNext,
}: {
  data: any
  onChange: (k: string, v: string) => void
  onNext: () => void
}) {
  const valid = data.industry.trim() && data.idealClient.trim()
  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-2">Tell Scout who you serve</h2>
      <p className="text-slate-400 text-sm mb-8">
        This is how Scout knows which conversations are worth your time. The more specific you are about your ideal client and what you do for them, the more precisely Scout will surface the right moments on LinkedIn.
      </p>

      <div className="space-y-5">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
            Business or Brand Name
          </label>
          <input
            value={data.businessName}
            onChange={e => onChange('businessName', e.target.value)}
            placeholder="e.g. ClientBloom"
            maxLength={100}
            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20 transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
            Industry / Niche <span className="text-violet-400">*</span>
          </label>
          <input
            value={data.industry}
            onChange={e => onChange('industry', e.target.value)}
            placeholder="e.g. Marketing agency software, B2B SaaS, Coaching & Consulting..."
            maxLength={120}
            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/20 transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wide">
            Who is your ideal client? <span className="text-violet-400">*</span>
          </label>
          <p className="text-xs text-slate-600 mb-1.5 leading-relaxed">
            Be specific — include their job title, company type, size, and what they typically post about. The more detail you give, the sharper Scout's scoring will be.
          </p>
          <textarea
            value={data.idealClient}
            onChange={e => onChange('idealClient', e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="e.g. Marketing agency owners with 10–50 clients who use GoHighLevel. Decision-makers, usually the founder or ops lead, typically posting about growth, systems, or client management."
            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/20 transition-colors resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
            What value do you deliver for them?
          </label>
          <textarea
            value={data.problemSolved}
            onChange={e => onChange('problemSolved', e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="e.g. We help agencies systematize client retention so they stop losing clients they thought were happy — and start getting referrals instead."
            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/20 transition-colors resize-none"
          />
        </div>
      </div>

      <button
        onClick={onNext}
        disabled={!valid}
        className="mt-8 w-full py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
      >
        Continue →
      </button>
    </div>
  )
}

// ── Step 2: Signal Types ─────────────────────────────────────────────────────
function Step2({
  selected,
  onToggle,
  onNext,
  onBack,
}: {
  selected: string[]
  onToggle: (id: string) => void
  onNext: () => void
  onBack: () => void
}) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-2">What conversation moments matter?</h2>
      <p className="text-slate-400 text-sm mb-8">
        Scout surfaces LinkedIn posts that create a natural opening for you to show up and add value. Select the types of conversations you want to be part of — these train Scout&apos;s scoring for your feed.
      </p>

      <div className="space-y-2.5">
        {SIGNALS.map(s => {
          const on = selected.includes(s.id)
          return (
            <button
              key={s.id}
              onClick={() => onToggle(s.id)}
              className={`w-full text-left flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all duration-150 ${
                on
                  ? 'bg-blue-600/15 border-blue-500/40 text-white'
                  : 'bg-slate-800/40 border-slate-700/40 text-slate-400 hover:border-slate-600 hover:text-slate-300'
              }`}
            >
              <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${on ? 'bg-blue-500 border-blue-500' : 'border-slate-600'}`}>
                {on && (
                  <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <span className="text-sm">{s.label}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-8 flex gap-3">
        <button
          onClick={onBack}
          className="px-5 py-3.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 text-sm font-medium transition-colors"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="flex-1 py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-colors"
        >
          Continue →
        </button>
      </div>
    </div>
  )
}

// ── Step 3: Keyword Searches ─────────────────────────────────────────────────
function StepKeywords({
  planLimit,
  industry,
  onNext,
  onBack,
}: {
  planLimit: number
  industry:  string                      // from Step 1 — used to auto-suggest a pack
  onNext:   (count: number) => void      // passes keyword count up to parent for Step4 summary
  onBack:   () => void
}) {
  const [terms, setTerms]               = useState<{ id: string; value: string }[]>([])
  const [loadingTerms, setLoadingTerms] = useState(true)
  const [selectedIndustry, setSel]      = useState(() => detectIndustryPack(industry))
  const [loadingPack, setLoadingPack]   = useState(false)
  const [packInfo, setPackInfo]         = useState<string>('')
  const [customInput, setCustom]        = useState('')
  const [showCustom, setShowCustom]     = useState(false)
  const [adding, setAdding]             = useState(false)
  const [error, setError]               = useState('')

  // Load any terms already saved (handles back-navigation remount)
  useEffect(() => {
    async function fetchExisting() {
      try {
        const res = await fetch('/api/sources')
        if (res.ok) {
          const data = await res.json()
          const existing = (data.sources || [])
            .filter((s: any) => s.type === 'linkedin_term')
            .map((s: any) => ({ id: s.id, value: s.value || s.name }))
          setTerms(existing)
        }
      } catch { /* non-fatal — start empty */ }
      finally { setLoadingTerms(false) }
    }
    fetchExisting()
  }, [])

  const atCap = terms.length >= planLimit

  const parseApiError = async (resp: Response): Promise<string> => {
    try {
      const text = await resp.text()
      const parsed = JSON.parse(text)
      return parsed.error || text
    } catch {
      return 'Something went wrong — try again or pick a different keyword.'
    }
  }

  const addTerm = useCallback(async (term: string) => {
    const t = term.trim()
    if (!t) return
    if (terms.some(x => x.value.toLowerCase() === t.toLowerCase())) {
      setError(`"${t}" is already in your keyword list.`)
      return
    }
    if (atCap) {
      setError(`You've reached the ${planLimit}-keyword limit for your plan. Remove a term to add a different one.`)
      return
    }
    setAdding(true)
    setError('')
    try {
      const resp = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: t, type: 'linkedin_term', value: t, priority: 'high' }),
      })
      if (!resp.ok) {
        const msg = await parseApiError(resp)
        throw new Error(msg)
      }
      const data = await resp.json()
      const id = data?.source?.id || `tmp-${Date.now()}`
      setTerms(prev => [...prev, { id, value: t }])
      setCustom('')
      setShowCustom(false)
    } catch (e: any) {
      setError(e.message || 'Could not save keyword — you can add it later in Settings.')
    } finally {
      setAdding(false)
    }
  }, [terms, atCap, planLimit])

  const removeTerm = async (id: string) => {
    try {
      if (!id.startsWith('tmp-')) await fetch(`/api/sources/${id}`, { method: 'DELETE' })
    } catch { /* ignore */ }
    setTerms(prev => prev.filter(t => t.id !== id))
    setError('')
    setPackInfo('')
  }

  const loadPack = async () => {
    if (!selectedIndustry) return
    const pack = INDUSTRY_PACKS.find(p => p.value === selectedIndustry)
    if (!pack) return
    setLoadingPack(true)
    setError('')
    setPackInfo('')
    const available = pack.terms.filter(t => !terms.some(x => x.value.toLowerCase() === t.toLowerCase()))
    const slots     = planLimit - terms.length
    const toAdd     = available.slice(0, slots)
    // Terms in the pack that won't be loaded due to plan limit
    const dropped   = available.slice(slots)

    if (toAdd.length === 0) {
      const reason = available.length === 0
        ? 'All terms from this pack are already in your list.'
        : `You're at your ${planLimit}-keyword limit. Remove a term to add more.`
      setPackInfo(reason)
      setLoadingPack(false)
      setSel('')
      return
    }

    const added: { id: string; value: string }[] = []
    for (const t of toAdd) {
      try {
        const resp = await fetch('/api/sources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: t, type: 'linkedin_term', value: t, priority: 'high' }),
        })
        if (resp.ok) {
          const data = await resp.json()
          const id = data?.source?.id || `tmp-${Date.now()}-${t}`
          added.push({ id, value: t })
        }
      } catch { /* skip failed terms */ }
    }
    setTerms(prev => [...prev, ...added])
    setLoadingPack(false)
    setSel('')
    if (added.length > 0) {
      const wasTruncated = dropped.length > 0
      if (wasTruncated) {
        setPackInfo(
          `Added ${added.length} of ${pack.terms.length} terms from the ${pack.label} pack (plan limit: ${planLimit}). ` +
          `Not loaded: ${dropped.join(', ')}. Upgrade to add all ${pack.terms.length} terms.`
        )
      } else {
        setPackInfo(`Added ${added.length} keyword${added.length !== 1 ? 's' : ''} from the ${pack.label} pack.`)
      }
    } else if (toAdd.length > 0) {
      // All terms were within the limit but every API call failed
      setError('Could not save keywords — please try again or add them one at a time.')
    }
  }

  if (loadingTerms) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500 text-sm gap-2">
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        Loading…
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-2">Set up keyword searches</h2>
      <p className="text-slate-400 text-sm mb-6">
        Scout searches LinkedIn every day for public posts matching these phrases — from anyone on the platform, not just your tracked profiles. Add 2–4 word phrases your ideal clients post about.
      </p>

      {/* Hero pack loader — the primary CTA */}
      <div className="mb-5 rounded-xl border border-blue-500/20 bg-blue-600/5 p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold text-white mb-0.5">Load an industry starter pack</p>
          <p className="text-xs text-slate-500 leading-relaxed">
            Pick your industry and we&apos;ll load proven high-signal phrases that match how your buyers post on LinkedIn. Takes 2 seconds.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedIndustry}
            onChange={e => setSel(e.target.value)}
            className="flex-1 min-w-[200px] text-sm bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2.5 text-slate-200 focus:outline-none focus:border-blue-500/50"
          >
            <option value="">Select your industry…</option>
            {INDUSTRY_PACKS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <button
            onClick={loadPack}
            disabled={!selectedIndustry || loadingPack || atCap}
            title={atCap ? `You're at your ${planLimit}-keyword limit. Remove a term first.` : ''}
            className="text-sm px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold transition-colors flex items-center gap-1.5"
          >
            {loadingPack ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : null}
            {atCap ? 'At limit' : 'Load pack'}
          </button>
        </div>
        {selectedIndustry && !atCap && (() => {
          const pack = INDUSTRY_PACKS.find(p => p.value === selectedIndustry)
          const packTermCount = pack?.terms.length ?? 0
          // Filter against already-existing terms so the count is accurate
          const available = pack ? pack.terms.filter(t => !terms.some(x => x.value.toLowerCase() === t.toLowerCase())) : []
          const willAdd = Math.min(available.length, planLimit - terms.length)
          const planIsBottleneck = (planLimit - terms.length) < available.length
          return (
            <p className="text-xs text-slate-600">
              {planIsBottleneck
                ? <>Will add <span className="text-slate-400">{willAdd} of {packTermCount}</span> terms — plan allows {planLimit} keywords. <a href="/upgrade" className="text-blue-500 hover:text-blue-400 underline">Upgrade</a> to load all {packTermCount}.</>
                : willAdd > 0
                  ? <>Will add <span className="text-slate-400">{willAdd}</span> keyword{willAdd !== 1 ? 's' : ''} to your feed.</>
                  : <span className="text-amber-500/70">All terms from this pack are already in your list.</span>
              }
            </p>
          )
        })()}
        {atCap && (
          <p className="text-xs text-amber-500/70">Remove a keyword above to free up a slot.</p>
        )}
      </div>

      {/* Active keywords */}
      {terms.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Active keywords</p>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${atCap ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-blue-500/10 border-blue-500/20 text-blue-400'}`}>
              {terms.length} / {planLimit}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {terms.map(t => (
              <div key={t.id} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border bg-slate-800 text-slate-300 border-slate-700/50">
                <span>{t.value}</span>
                <button onClick={() => removeTerm(t.id)} className="text-slate-600 hover:text-red-400 transition-colors leading-none ml-0.5" aria-label={`Remove ${t.value}`}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center justify-between">
          {error}
          <button onClick={() => setError('')} className="ml-2 opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      {packInfo && !error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-center justify-between">
          ✓ {packInfo}
          <button onClick={() => setPackInfo('')} className="ml-2 opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      {/* Custom term input */}
      {!atCap && !showCustom && (
        <div className="mb-5">
          <p className="text-xs text-slate-600 mb-1.5">You can also type your own phrases — or skip the pack and add them all manually.</p>
          <button
            onClick={() => setShowCustom(true)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add your own keyword
          </button>
        </div>
      )}
      {showCustom && (
        <div className="mb-5 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={customInput}
              onChange={e => setCustom(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTerm(customInput)}
              placeholder='e.g. "client retention" or "scaling my agency"'
              autoFocus
              maxLength={60}
              className="flex-1 text-sm bg-slate-800/80 border border-slate-700/50 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
            />
            <button
              onClick={() => { setShowCustom(false); setCustom('') }}
              className="text-xs px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => addTerm(customInput)}
              disabled={adding || !customInput.trim()}
              className="text-xs px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {adding && <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>}
              Add
            </button>
          </div>
          <p className="text-xs text-slate-600">Use 2–4 word phrases — single words pull too much noise.</p>
        </div>
      )}

      {/* Require at least 1 keyword before continuing */}
      {terms.length === 0 && (
        <p className="text-xs text-amber-500/80 mb-4 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          Add at least one keyword so Scout has something to search for.
        </p>
      )}

      <div className="mt-6 flex gap-3">
        <button
          onClick={onBack}
          className="px-5 py-3.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 text-sm font-medium transition-colors"
        >
          Back
        </button>
        <button
          onClick={() => onNext(terms.length)}
          disabled={terms.length === 0}
          className="flex-1 py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
        >
          {terms.length > 0 ? `Continue with ${terms.length} keyword${terms.length !== 1 ? 's' : ''} →` : 'Load a keyword pack to continue'}
        </button>
      </div>
    </div>
  )
}

// ── ICP_JOB_TITLES — mirrored from settings/page.tsx ────────────────────────
const ICP_JOB_TITLES = [
  'Founder', 'Co-Founder', 'CEO', 'Managing Director',
  'VP of Sales', 'Head of Sales', 'Sales Director', 'Account Executive',
  'VP of Marketing', 'Head of Marketing', 'Marketing Director', 'CMO',
  'Head of Operations', 'COO', 'VP of Product', 'Director of Partnerships',
  'Consultant', 'Business Owner', 'Entrepreneur', 'Independent Advisor',
]

// ── Step 4: Launch Scan ──────────────────────────────────────────────────────
//
// v2.0: Embeds the Discover ICPs panel before "Run my first scan" so that
// Apify has real profiles to scan. ICPs discovered here are stored in the
// user's account — they persist to Settings → LinkedIn → ICP Pool.
//
// Strategy: fire the scan immediately and race against a 12-second client-side
// timer. If the scan completes in time, show the full result. If the scan is
// still running after 12s, mark onboarding complete and redirect to the feed
// with ?firstScan=1 — the Vercel function continues running server-side and
// completes even after the client navigates away (serverless functions are not
// killed by client disconnects; they run to maxDuration). The feed detects the
// query param and shows a "first scan in progress" banner while polling.
//
function Step4({
  data,
  onBack,
  onComplete,
  onMarkComplete,
}: {
  data: any
  onBack: () => void
  onComplete: (postsFound: number, scanCompleted: boolean, icpCount: number) => void
  onMarkComplete: () => Promise<void>
}) {
  const [status, setStatus]         = useState<'idle' | 'saving' | 'scanning' | 'done' | 'error'>('idle')
  const [postsFound, setPostsFound] = useState(0)
  const [breakdown, setBreakdown]   = useState<{ fetched?: number; ageFiltered?: number; belowThreshold?: number } | null>(null)
  const [progress, setProgress]     = useState(0)
  const [errorMsg, setErrorMsg]     = useState('')
  const [scanCompleted, setScanCompleted] = useState(false)

  // ── Discover ICPs state ───────────────────────────────────────────────────
  const [discTitles, setDiscTitles]       = useState<string[]>([])
  const [discKeywords, setDiscKeywords]   = useState<string[]>([])
  const [discTitleInput, setDiscTitleInput] = useState('')
  const [discKwInput, setDiscKwInput]     = useState('')
  const [discovering, setDiscovering]     = useState(false)
  const [discResult, setDiscResult]       = useState('')
  const [discError, setDiscError]         = useState('')
  const [icpCount, setIcpCount]           = useState(0)

  const addDiscTitle = () => {
    const t = discTitleInput.trim()
    if (t && !discTitles.includes(t)) setDiscTitles(prev => [...prev, t])
    setDiscTitleInput('')
  }
  const addDiscKw = () => {
    const k = discKwInput.trim()
    if (k && !discKeywords.includes(k)) setDiscKeywords(prev => [...prev, k])
    setDiscKwInput('')
  }
  const handleDiscover = async () => {
    if (!discTitles.length) { setDiscError('Add at least one job title to search.'); return }
    setDiscovering(true)
    setDiscResult('')
    setDiscError('')
    try {
      const resp = await fetch('/api/linkedin-icps/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobTitles: discTitles, keywords: discKeywords }),
      })
      const json = await resp.json()
      if (!resp.ok) throw new Error(json.error || 'Discovery failed')
      const added = json.added ?? 0
      setIcpCount(prev => prev + added)
      setDiscResult(`Added ${added} profile${added !== 1 ? 's' : ''}${json.skipped > 0 ? ` · ${json.skipped} already in your pool` : ''}. Your pool is ready for the first scan.`)
    } catch (e: any) {
      setDiscError(e.message || 'Discovery failed — you can still run your first scan.')
    } finally {
      setDiscovering(false)
    }
  }

  const runScan = async () => {
    setStatus('saving')
    setProgress(10)

    // 1. Save business profile (non-fatal)
    try {
      await fetch('/api/business-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    } catch { /* non-fatal */ }

    // 2. Mark onboarding complete NOW — before the scan — so that if the page
    //    unloads during the scan wait, the user lands on the feed (not onboarding).
    try { await onMarkComplete() } catch { /* non-fatal */ }

    setStatus('scanning')
    setProgress(15)

    // Smooth progress animation — ramps to 88% while waiting for the scan
    const progressInterval = setInterval(() => {
      setProgress(p => {
        if (p < 40)  return p + 4
        if (p < 70)  return p + 2
        if (p < 88)  return p + 0.8
        return p
      })
    }, 800)

    // 3. Race scan against 12-second client timeout.
    //    If scan completes fast → show exact result.
    //    If timeout fires first → redirect immediately; Vercel continues the scan.
    //
    // FIX #4 (HIGH — race condition): Use a `scanWon` flag set exclusively inside
    // the .then() success handler, not inferred from `!timedOut && scanResult`.
    // Without this, the 1–2 ms window between `timedOut = true` and Promise.race
    // returning can incorrectly classify a fast scan as a timeout (or vice-versa).
    //
    // FIX #16 (HIGH — 500 errors): Track scan failures separately with `scanErrored`.
    // Previously a 500/network error resolved `scanFetch` silently (catch swallowed),
    // causing fall-through to the "scan completed with 0 posts" branch even though
    // the scan never actually completed. Now explicit API errors show the retry UI.
    let scanResult: { postsFound: number; breakdown?: any } | null = null
    let scanWon     = false   // true only when the scan API responded successfully
    let scanErrored = false   // true when the API returned !ok or threw before timeout
    let timedOut    = false

    const scanFetch = fetch('/api/trigger-scan', { method: 'POST' })
      .then(async r => {
        if (!r.ok) throw new Error('scan-failed')
        return r.json()
      })
      .then(result => {
        if (!timedOut) {        // only claim the win if the timeout hasn't fired yet
          scanResult = result
          scanWon    = true
        }
      })
      .catch(() => {
        if (!timedOut) {        // explicit API error before our timeout fired
          scanErrored = true
        }
        // If timedOut already fired, the server may still be running — stay silent
      })

    const timeoutFence = new Promise<void>(resolve => setTimeout(() => {
      timedOut = true
      resolve()
    }, 12_000))

    await Promise.race([scanFetch, timeoutFence])

    clearInterval(progressInterval)

    // Case 1: Scan timed out — Vercel function is still running server-side
    if (!scanWon && !scanErrored) {
      setProgress(100)
      setScanCompleted(false)
      setPostsFound(0)
      setStatus('done')
      // Small visual pause so the "Setup complete!" animation renders before redirect
      await new Promise(r => setTimeout(r, 600))
      onComplete(0, false, icpCount)   // → /?firstScan=1 — show "scan in progress" banner
      return
    }

    // Case 2: Scan returned an explicit HTTP error before the timeout
    if (scanErrored) {
      setErrorMsg('Scan could not connect to LinkedIn. Your account is set up — you can try again or check back later.')
      setStatus('error')
      return
    }

    // Case 3: Scan completed successfully before the 12s timeout
    setProgress(100)
    setScanCompleted(true)
    setPostsFound(scanResult?.postsFound ?? 0)
    setBreakdown(scanResult?.breakdown ?? null)
    setStatus('done')
  }

  // ── Done state ──────────────────────────────────────────────────────────────
  if (status === 'done') {
    // If scan is still running server-side, this view flashes briefly before redirect
    if (!scanCompleted) {
      return (
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-blue-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Setup complete!</h2>
          <p className="text-slate-400 text-sm">Taking you to your feed…</p>
        </div>
      )
    }

    // Scan completed and returned a result
    return (
      <div className="text-center">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${postsFound > 0 ? 'bg-emerald-500/15 border border-emerald-500/30' : 'bg-slate-800 border border-slate-700'}`}>
          {postsFound > 0 ? (
            <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          )}
        </div>

        {postsFound > 0 ? (
          <>
            <h2 className="text-2xl font-bold text-white mb-2">
              {postsFound} post{postsFound !== 1 ? 's' : ''} ready for you
            </h2>
            <p className="text-slate-400 text-sm mb-2">
              Each one is a real conversation you can join right now — with a comment starter already written for you.
            </p>
            <p className="text-slate-600 text-xs mb-8">Scout scans daily. The more you engage, the more visible you become on LinkedIn.</p>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-white mb-2">
              {icpCount > 0 ? `You're in. ${icpCount} people are being monitored.` : "You're in. Scout is on it."}
            </h2>
            <p className="text-slate-400 text-sm mb-4">
              {icpCount > 0
                ? `Scout is now monitoring ${icpCount} LinkedIn profile${icpCount !== 1 ? 's' : ''} from your ICP pool. Your inbox will fill with posts as soon as the next scan runs — tonight or tomorrow morning.`
                : 'Your account is set up and Scout is scanning. Posts will appear in your inbox as Scout finds conversations worth joining — usually within the next scan cycle.'}
            </p>
            {/* Scan breakdown — explains the filtering so it doesn't feel broken */}
            {breakdown && (breakdown.fetched ?? 0) > 0 && (
              <div className="text-left bg-slate-800/40 border border-slate-700/30 rounded-xl p-4 mb-4 space-y-2">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">First scan results</p>
                {breakdown.fetched !== undefined && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Posts found on LinkedIn</span>
                    <span className="text-slate-300">{breakdown.fetched}</span>
                  </div>
                )}
                {breakdown.ageFiltered !== undefined && breakdown.ageFiltered > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Removed (older than 7 days)</span>
                    <span className="text-slate-400">{breakdown.ageFiltered}</span>
                  </div>
                )}
                {breakdown.belowThreshold !== undefined && breakdown.belowThreshold > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Scored below relevance threshold</span>
                    <span className="text-slate-400">{breakdown.belowThreshold}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs border-t border-slate-700/40 pt-2 mt-2">
                  <span className="text-slate-400 font-medium">Saved to your inbox</span>
                  <span className="text-white font-semibold">0</span>
                </div>
              </div>
            )}
            <div className="text-left bg-violet-600/5 border border-violet-500/15 rounded-xl p-4 mb-8 space-y-2">
              <p className="text-xs font-medium text-violet-400 mb-2">What happens next</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Scout scans automatically at <span className="text-slate-200">6 AM and 6 PM PST</span> every day. Each scan scores fresh posts against your keywords and ICP pool, and the best ones land directly in your inbox — ready to engage.
              </p>
            </div>
          </>
        )}

        <button
          onClick={() => onComplete(postsFound, true, icpCount)}
          className="w-full py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-colors"
        >
          {postsFound > 0 ? 'Go to my inbox →' : 'Go to my feed →'}
        </button>
      </div>
    )
  }

  // ── Scanning / saving state ────────────────────────────────────────────────
  if (status === 'scanning' || status === 'saving') {
    return (
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-6">
          <div className="w-7 h-7 border-2 border-slate-700 border-t-blue-400 rounded-full animate-spin" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">
          {status === 'saving' ? 'Saving your profile…' : 'Scanning LinkedIn…'}
        </h2>
        <p className="text-slate-400 text-sm mb-8">
          {status === 'saving'
            ? 'Saving your profile so Scout knows exactly which conversations are worth your time.'
            : 'Searching LinkedIn for conversations worth joining and scoring each one for relevance.'}
        </p>

        <div className="w-full bg-slate-800 rounded-full h-1.5 mb-3 overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-slate-600">
          {progress < 30 ? 'Connecting to LinkedIn…' : progress < 55 ? 'Fetching posts…' : progress < 80 ? 'Scoring with AI…' : 'Almost done…'}
        </p>
      </div>
    )
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
          <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Scan couldn&apos;t complete</h2>
        <p className="text-slate-500 text-xs mb-8">{errorMsg}</p>
        <div className="flex gap-3">
          <button onClick={() => setStatus('idle')} className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-400 hover:text-white text-sm transition-colors">
            Try again
          </button>
          <button
            onClick={() => onComplete(0, true, icpCount)}
            className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition-colors"
          >
            Go to my feed
          </button>
        </div>
      </div>
    )
  }

  // ── Idle state (launch screen with Discover ICPs) ──────────────────────────
  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-2">You&apos;re almost live</h2>
      <p className="text-slate-400 text-sm mb-6">
        One last step — tell Scout who to watch on LinkedIn. Then run your first scan and posts will be waiting in your inbox.
      </p>

      {/* Summary card */}
      <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4 mb-5 space-y-3">
        {data.businessName && (
          <div className="flex items-start gap-3">
            <span className="text-slate-600 text-xs mt-0.5 w-20 shrink-0">Business</span>
            <span className="text-sm text-slate-300">{data.businessName}</span>
          </div>
        )}
        <div className="flex items-start gap-3">
          <span className="text-slate-600 text-xs mt-0.5 w-20 shrink-0">Industry</span>
          <span className="text-sm text-slate-300">{data.industry}</span>
        </div>
        <div className="flex items-start gap-3">
          <span className="text-slate-600 text-xs mt-0.5 w-20 shrink-0">Signals</span>
          <span className="text-sm text-slate-300">
            {data.signalTypes.length > 0
              ? `${data.signalTypes.length} conversation type${data.signalTypes.length !== 1 ? 's' : ''} selected`
              : 'All conversation types'}
          </span>
        </div>
        <div className="flex items-start gap-3">
          <span className="text-slate-600 text-xs mt-0.5 w-20 shrink-0">Keywords</span>
          <span className="text-sm text-emerald-400">{data.keywordCount ?? 0} active</span>
        </div>
        {icpCount > 0 && (
          <div className="flex items-start gap-3">
            <span className="text-slate-600 text-xs mt-0.5 w-20 shrink-0">ICPs</span>
            <span className="text-sm text-emerald-400">{icpCount} profile{icpCount !== 1 ? 's' : ''} added</span>
          </div>
        )}
      </div>

      {/* ── Discover ICPs Panel ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-violet-500/20 bg-violet-600/5 p-4 mb-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-white mb-1">Discover ICPs</p>
          <p className="text-sm text-slate-500 leading-relaxed">
            Scout searches for LinkedIn profiles matching your criteria and adds them to your pool automatically. This gives Scout real people to monitor so your first scan has posts waiting for you.
          </p>
        </div>

        {/* Job Titles */}
        <div>
          <p className="text-sm text-slate-400 mb-2 font-medium">
            Job Titles <span className="text-slate-600 font-normal">(required)</span>
          </p>
          {discTitles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {discTitles.map(t => (
                <span key={t} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700/50">
                  {t}
                  <button onClick={() => setDiscTitles(discTitles.filter(x => x !== t))} className="text-slate-600 hover:text-red-400 ml-0.5">×</button>
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-1 mb-2">
            {ICP_JOB_TITLES.filter(t => !discTitles.includes(t)).slice(0, 8).map(t => (
              <button
                key={t}
                onClick={() => setDiscTitles(prev => [...prev, t])}
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
              className="flex-1 bg-slate-800/80 border border-slate-700/50 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/50"
            />
            <button onClick={addDiscTitle} className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors">Add</button>
          </div>
        </div>

        {/* Narrowing Keywords */}
        <div>
          <p className="text-sm text-slate-400 mb-1 font-medium">
            Narrowing Keywords <span className="text-slate-600 font-normal">(optional — recommended)</span>
          </p>
          <p className="text-sm text-slate-600 mb-2">Filters broad titles like &quot;CEO&quot; to the right people.</p>
          {discKeywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {discKeywords.map(k => (
                <span key={k} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700/50">
                  {k}
                  <button onClick={() => setDiscKeywords(discKeywords.filter(x => x !== k))} className="text-slate-600 hover:text-red-400 ml-0.5">×</button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. SaaS, B2B consulting, fintech..."
              value={discKwInput}
              onChange={e => setDiscKwInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addDiscKw()}
              className="flex-1 bg-slate-800/80 border border-slate-700/50 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/50"
            />
            <button onClick={addDiscKw} className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors">Add</button>
          </div>
        </div>

        {discResult && (
          <div className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
            ✓ {discResult}
          </div>
        )}
        {discError && (
          <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center justify-between">
            {discError}
            <button onClick={() => setDiscError('')} className="ml-2 opacity-60 hover:opacity-100">×</button>
          </div>
        )}

        <div className="flex gap-2 items-center flex-wrap">
          <button
            onClick={handleDiscover}
            disabled={discovering || !discTitles.length}
            className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors disabled:opacity-50"
          >
            {discovering ? (
              <>
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Searching…
              </>
            ) : 'Run Discovery'}
          </button>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          Adds up to <span className="text-slate-500">10 profiles</span> per run · 1 run per day. Tighter job titles and keywords find better matches than running broad searches.
        </p>
      </div>

      <button
        onClick={runScan}
        disabled={status !== 'idle' || discovering || !discResult}
        title={
          discovering       ? 'Wait for discovery to finish before scanning' :
          !discResult       ? 'Run Discovery first to add ICP profiles, then scan' :
          undefined
        }
        className="w-full py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        Run my first scan
      </button>

      {!discResult && (
        <p className="text-center text-xs text-slate-600 -mt-1">
          Run Discovery above to unlock your first scan
        </p>
      )}

      <div className="mt-5 flex items-center justify-between">
        <button onClick={onBack} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
          ← Back
        </button>
      </div>
    </div>
  )
}

// ── Main Onboarding Page ─────────────────────────────────────────────────────
export default function OnboardingPage() {
  const router = useRouter()
  const { data: session, status, update: updateSession } = useSession()
  const [step, setStep]     = useState(0)
  const [keywordCount, setKeywordCount] = useState(0)
  const [profile, setProfile] = useState({
    businessName: '',
    industry:     '',
    idealClient:  '',
    problemSolved:'',
    signalTypes:  [] as string[],
  })

  const plan      = (session?.user as any)?.plan || 'Trial'
  const planLimit = getTierLimits(plan).keywords

  // Already-onboarded guard — skip wizard if setup is already done
  useEffect(() => {
    if (status !== 'authenticated') return
    const onboarded = (session?.user as any)?.onboarded ?? false
    if (onboarded) router.replace('/')
  }, [status, session, router])

  const updateProfile = (key: string, value: string) =>
    setProfile(prev => ({ ...prev, [key]: value }))

  const toggleSignal = (id: string) =>
    setProfile(prev => ({
      ...prev,
      signalTypes: prev.signalTypes.includes(id)
        ? prev.signalTypes.filter(s => s !== id)
        : [...prev.signalTypes, id],
    }))

  // Marks onboarding complete server-side and refreshes the JWT so the
  // feed redirect guard clears immediately — no localStorage needed.
  // Retries the Airtable write once on failure to guard against transient
  // network blips; the updateSession() call always fires regardless so the
  // current session's JWT is updated even if the server write fails.
  const markOnboardingComplete = async () => {
    const apiWrite = async () => {
      const resp = await fetch('/api/onboarding/complete', { method: 'POST' })
      if (!resp.ok) throw new Error('onboarding-complete-failed')
    }
    try {
      await apiWrite()
    } catch {
      try { await apiWrite() } catch { /* second attempt — both non-fatal */ }
    }
    // Always update the JWT even if the server write failed — prevents the
    // redirect-to-onboarding loop on the current session. The Airtable write
    // will succeed on their next login (the session data re-reads from Airtable).
    try { await updateSession({ onboarded: true }) } catch { /* non-fatal */ }
  }

  // Called when Step4 finishes (scan result or timeout redirect)
  const handleScanComplete = (postsFound: number, scanCompleted: boolean, icpCount: number) => {
    const icpParam = icpCount > 0 ? `&icps=${icpCount}` : ''
    if (scanCompleted && postsFound > 0) {
      // Happy path: posts found, go straight to feed
      router.push('/')
    } else if (!scanCompleted) {
      // Scan still running — redirect with banner so user knows to wait
      router.push(`/?firstScan=1${icpParam}`)
    } else {
      // Scan completed but found nothing — go to feed with helpful empty state
      router.push(`/?firstScan=0${icpParam}`)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0c10] text-white flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-[520px]">
        {/* Header */}
        <div className="flex items-center gap-3 mb-10">
          <ClientBloomMark size={32} />
          <div>
            <p className="text-sm font-semibold text-white leading-tight">Scout <span className="text-slate-500 font-normal">by ClientBloom</span></p>
            <p className="text-xs text-slate-500">LinkedIn relationship intelligence · setup</p>
          </div>
        </div>

        <StepDots current={step} total={4} />

        {step === 0 && (
          <Step1 data={profile} onChange={updateProfile} onNext={() => setStep(1)} />
        )}
        {step === 1 && (
          <Step2
            selected={profile.signalTypes}
            onToggle={toggleSignal}
            onNext={() => setStep(2)}
            onBack={() => setStep(0)}
          />
        )}
        {step === 2 && (
          <StepKeywords
            planLimit={planLimit}
            industry={profile.industry}
            onNext={(count: number) => {
              // Capture keyword count for display in Step4 summary card
              setKeywordCount(count)
              setStep(3)
            }}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <Step4
            data={{ ...profile, keywordCount }}
            onBack={() => setStep(2)}
            onComplete={handleScanComplete}
            onMarkComplete={markOnboardingComplete}
          />
        )}
      </div>
    </div>
  )
}
