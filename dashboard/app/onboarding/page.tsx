'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { getTierLimits } from '@/lib/tier'

// ---- Industry starter packs (mirrored from settings/page.tsx) ----
const INDUSTRY_PACKS: { label: string; value: string; terms: string[] }[] = [
  { label: 'Agency / Marketing Agency',      value: 'agency',          terms: ['client retention', 'agency growth', 'losing a client', 'client churn', 'retainer model', 'agency operations'] },
  { label: 'B2B SaaS',                       value: 'saas',            terms: ['product led growth', 'reducing churn', 'customer onboarding', 'time to value', 'SaaS pricing', 'expansion revenue'] },
  { label: 'Customer Success',               value: 'customer-success', terms: ['customer health score', 'churn prevention', 'renewal strategy', 'expansion playbook', 'QBR prep', 'CS team scaling'] },
  { label: 'Sales / Revenue',                value: 'sales',           terms: ['pipeline review', 'cold outreach', 'deal closing', 'quota attainment', 'discovery call', 'objection handling'] },
  { label: 'HR / Talent / Recruiting',       value: 'hr',              terms: ['talent acquisition', 'employee retention', 'reducing turnover', 'hiring mistakes', 'candidate experience', 'employer brand'] },
  { label: 'Consulting / Professional Svcs', value: 'consulting',      terms: ['scope creep', 'client management', 'retainer clients', 'proposal writing', 'consulting fees', 'client results'] },
  { label: 'Coaching / Solopreneurs',        value: 'coaching',        terms: ['coaching business', 'high ticket offer', 'client transformation', 'scaling services', 'lead generation coaching', 'online coaching'] },
  { label: 'Finance / CFO / Accounting',     value: 'finance',         terms: ['cash flow management', 'financial planning', 'runway extension', 'unit economics', 'cost cutting', 'budgeting process'] },
  { label: 'E-commerce / DTC',               value: 'ecommerce',       terms: ['customer acquisition cost', 'repeat purchase rate', 'abandoned cart', 'DTC growth', 'conversion rate', 'email revenue'] },
  { label: 'Real Estate',                    value: 'real-estate',     terms: ['real estate investing', 'deal flow', 'property management', 'multifamily investing', 'passive income real estate', 'real estate portfolio'] },
  { label: 'Legal / Law Firms',              value: 'legal',           terms: ['law firm growth', 'client acquisition lawyer', 'legal operations', 'billing rates', 'in-house counsel', 'law practice management'] },
  { label: 'Healthcare / Wellness',          value: 'healthcare',      terms: ['patient retention', 'practice growth', 'patient experience', 'healthcare marketing', 'referral marketing', 'telehealth'] },
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

/**
 * Try to extract a job title from the free-text idealClient field.
 * Returns a best-guess string or '' if nothing clear was found.
 */
function guessJobTitle(idealClient: string): string {
  if (!idealClient) return ''
  const lower = idealClient.toLowerCase()
  const patterns = [
    [/ceo|chief executive/i,            'CEO'],
    [/cfo|chief financial/i,            'CFO'],
    [/cto|chief technology/i,           'CTO'],
    [/cmo|chief marketing/i,            'CMO'],
    [/vp of sales/i,                    'VP of Sales'],
    [/vp of marketing/i,                'VP of Marketing'],
    [/vp of customer success/i,         'VP of Customer Success'],
    [/director of (sales|marketing|cs|customer)/i, (m: RegExpMatchArray) => `Director of ${m[1]}`],
    [/agency owner/i,                   'Agency Owner'],
    [/founder/i,                        'Founder'],
    [/co-founder/i,                     'Co-Founder'],
    [/managing director/i,              'Managing Director'],
    [/head of (sales|marketing|growth|customer)/i, (m: RegExpMatchArray) => `Head of ${m[1]}`],
    [/marketing manager/i,              'Marketing Manager'],
    [/sales manager/i,                  'Sales Manager'],
    [/account executive/i,              'Account Executive'],
    [/customer success manager/i,       'Customer Success Manager'],
    [/recruiter|talent acquisition/i,   'Talent Acquisition Manager'],
    [/consultant/i,                     'Consultant'],
    [/coach/i,                          'Business Coach'],
  ] as const

  for (const [regex, result] of patterns) {
    const m = idealClient.match(regex as RegExp)
    if (m) {
      return typeof result === 'function' ? (result as Function)(m) : result as string
    }
  }
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

function Spinner({ size = 4 }: { size?: number }) {
  return (
    <svg className={`w-${size} h-${size} animate-spin`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  )
}

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 justify-center mb-10">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i === current
              ? 'w-6 h-2 bg-blue-500'
              : i < current
              ? 'w-2 h-2 bg-blue-500/40'
              : 'w-2 h-2 bg-slate-700'
          }`}
        />
      ))}
    </div>
  )
}

// ── Step 0: Business Info ────────────────────────────────────────────────────
function StepBusinessInfo({
  data,
  onChange,
  onNext,
}: {
  data: any
  onChange: (k: string, v: string) => void
  onNext: () => void
}) {
  const [saving, setSaving] = useState(false)
  const valid = data.industry.trim() && data.idealClient.trim()

  const handleNext = async () => {
    if (!valid) return
    setSaving(true)
    // Save profile cross-device immediately — don't wait until final step
    try {
      await fetch('/api/business-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    } catch { /* non-fatal */ }
    setSaving(false)
    onNext()
  }

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
            Industry / Niche <span className="text-blue-400">*</span>
          </label>
          <input
            value={data.industry}
            onChange={e => onChange('industry', e.target.value)}
            placeholder="e.g. Marketing agency software, B2B SaaS, Coaching & Consulting…"
            maxLength={120}
            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20 transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
            Who is your ideal client? <span className="text-blue-400">*</span>
          </label>
          <textarea
            value={data.idealClient}
            onChange={e => onChange('idealClient', e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="e.g. Marketing agency owners with 10–50 clients who use GoHighLevel. Decision-makers, usually the founder or ops lead, typically posting about growth, systems, or client management."
            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20 transition-colors resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
            What value do you deliver for them?
          </label>
          <textarea
            value={data.problemSolved}
            onChange={e => onChange('problemSolved', e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="e.g. We help agencies systematize client retention so they stop losing clients they thought were happy — and start getting referrals instead."
            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20 transition-colors resize-none"
          />
        </div>
      </div>

      <button
        onClick={handleNext}
        disabled={!valid || saving}
        className="mt-8 w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
      >
        {saving && <Spinner size={4} />}
        {saving ? 'Saving…' : 'Continue →'}
      </button>
    </div>
  )
}

// ── Step 1: Keyword Searches ─────────────────────────────────────────────────
function StepKeywords({
  planLimit,
  industry,
  idealClient,
  problemSolved,
  onNext,
  onBack,
}: {
  planLimit:     number
  industry:      string
  idealClient:   string
  problemSolved: string
  onNext:        (keywords: string[]) => void
  onBack:        () => void
}) {
  const [terms, setTerms]               = useState<{ id: string; value: string }[]>([])
  const [loadingTerms, setLoadingTerms] = useState(true)
  const [selectedIndustry, setSel]      = useState(() => detectIndustryPack(industry))
  const [loadingPack, setLoadingPack]   = useState(false)
  const [packInfo, setPackInfo]         = useState<string>('')
  const [customInput, setCustom]        = useState('')
  const [showCustom, setShowCustom]     = useState(false)
  const [adding, setAdding]             = useState(false)
  const [enhancing, setEnhancing]       = useState(false)
  const [suggestions, setSuggestions]   = useState<string[]>([])
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
      setSuggestions([])
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
      setPackInfo(`Added ${added.length} keyword${added.length !== 1 ? 's' : ''} from the ${pack.label} pack.`)
    }
  }

  const enhanceKeyword = async () => {
    const kw = customInput.trim()
    if (!kw) return
    setEnhancing(true)
    setSuggestions([])
    setError('')
    try {
      const resp = await fetch('/api/onboarding/suggest-keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: kw, industry, idealClient, problemSolved }),
      })
      if (!resp.ok) throw new Error('Could not get suggestions — add the keyword as typed.')
      const data = await resp.json()
      setSuggestions((data.suggestions || []).filter((s: string) =>
        !terms.some(t => t.value.toLowerCase() === s.toLowerCase())
      ))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setEnhancing(false)
    }
  }

  if (loadingTerms) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500 text-sm gap-2">
        <Spinner size={4} />
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

      {/* Hero pack loader */}
      <div className="mb-5 rounded-xl border border-blue-500/20 bg-blue-600/5 p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold text-white mb-0.5">Load an industry starter pack</p>
          <p className="text-xs text-slate-500 leading-relaxed">
            Pick your industry and we&apos;ll load proven high-signal phrases that match how your buyers post on LinkedIn.
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
            {loadingPack && <Spinner size={3.5} />}
            {atCap ? 'At limit' : 'Load pack'}
          </button>
        </div>
        {selectedIndustry && !atCap && (
          <p className="text-xs text-slate-600">
            Will add up to {Math.min(INDUSTRY_PACKS.find(p => p.value === selectedIndustry)?.terms.length ?? 0, planLimit - terms.length)} keywords for your feed.
          </p>
        )}
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

      {/* Custom term input with AI enhancement */}
      {!atCap && !showCustom && (
        <button
          onClick={() => setShowCustom(true)}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors mb-5"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add your own keyword
        </button>
      )}
      {showCustom && (
        <div className="mb-5 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={customInput}
              onChange={e => { setCustom(e.target.value); setSuggestions([]) }}
              onKeyDown={e => e.key === 'Enter' && customInput.trim() && addTerm(customInput)}
              placeholder='e.g. "client retention" or "scaling my agency"'
              autoFocus
              maxLength={60}
              className="flex-1 text-sm bg-slate-800/80 border border-slate-700/50 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
            />
            <button
              onClick={() => { setShowCustom(false); setCustom(''); setSuggestions([]) }}
              className="text-xs px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
            >
              Cancel
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => addTerm(customInput)}
              disabled={adding || !customInput.trim()}
              className="text-xs px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {adding && <Spinner size={3} />}
              Add as typed
            </button>
            <button
              onClick={enhanceKeyword}
              disabled={enhancing || !customInput.trim()}
              className="text-xs px-4 py-1.5 rounded-lg bg-violet-600/80 hover:bg-violet-600 text-white font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
              title="Let AI suggest better variations of this keyword phrase"
            >
              {enhancing ? <Spinner size={3} /> : (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              )}
              {enhancing ? 'Generating…' : 'Enhance with AI'}
            </button>
          </div>
          <p className="text-xs text-slate-600">Use 2–4 word phrases — single words pull too much noise.</p>

          {/* AI keyword suggestions */}
          {suggestions.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-medium text-violet-400">AI-suggested variations — click to add:</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => addTerm(s)}
                    disabled={adding || atCap || terms.some(t => t.value.toLowerCase() === s.toLowerCase())}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-violet-500/30 bg-violet-600/10 text-violet-300 hover:bg-violet-600/20 hover:border-violet-500/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
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
          onClick={() => onNext(terms.map(t => t.value))}
          disabled={terms.length === 0}
          className="flex-1 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
        >
          {terms.length > 0 ? `Continue with ${terms.length} keyword${terms.length !== 1 ? 's' : ''} →` : 'Load a keyword pack to continue'}
        </button>
      </div>
    </div>
  )
}

// ── Step 2: Discover ICPs ────────────────────────────────────────────────────
//
// The onboarding "wow moment". Uses the Discover ICPs feature (normally
// Trial-locked) with onboardingMode=true to bypass the plan gate.
// Profiles are saved automatically by the API — user just sees the results.
//
function StepDiscoverICPs({
  keywords,
  idealClient,
  poolLimit,
  onNext,
  onBack,
}: {
  keywords:   string[]
  idealClient: string
  poolLimit:  number
  onNext:     (icpCount: number) => void
  onBack:     () => void
}) {
  const [jobTitleInput, setJobTitleInput] = useState(() => guessJobTitle(idealClient))
  const [status, setStatus]         = useState<'idle' | 'discovering' | 'done' | 'error'>('idle')
  const [results, setResults]       = useState<{ id: string; name: string; profileUrl: string }[]>([])
  const [added, setAdded]           = useState(0)
  const [skipped, setSkipped]       = useState(0)
  const [poolWasFull, setPoolFull]  = useState(false)
  const [existingCount, setExisting]= useState(0)
  const [error, setError]           = useState('')

  const runDiscover = async () => {
    const titles = jobTitleInput
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)

    if (!titles.length) {
      setError('Enter at least one job title so Scout knows who to look for.')
      return
    }

    setStatus('discovering')
    setError('')

    try {
      const resp = await fetch('/api/linkedin-icps/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitles:      titles,
          keywords:       keywords.slice(0, 4),   // top 4 keywords as search signal
          maxProfiles:    poolLimit,
          onboardingMode: true,                    // bypass Trial plan gate
        }),
      })
      const data = await resp.json()

      if (!resp.ok) {
        // Pool already full — profiles from a prior session are already tracked
        if (resp.status === 429 && data.current !== undefined) {
          setResults([])
          setAdded(0)
          setSkipped(0)
          setPoolFull(true)
          setExisting(data.current)
          setStatus('done')
          return
        }
        throw new Error(data.error || 'Discovery failed — try again or skip this step.')
      }

      setResults(data.profiles || [])
      setAdded(data.added || 0)
      setSkipped(data.skipped || 0)
      setStatus('done')
    } catch (e: any) {
      setError(e.message)
      setStatus('error')
    }
  }

  // ── Discovering state ──────────────────────────────────────────────────────
  if (status === 'discovering') {
    return (
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-6">
          <div className="w-7 h-7 border-2 border-slate-700 border-t-violet-400 rounded-full animate-spin" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Searching LinkedIn…</h2>
        <p className="text-slate-400 text-sm mb-2">
          Scout is combing through LinkedIn to find profiles that match your ICP. This usually takes 20–40 seconds.
        </p>
        <p className="text-xs text-slate-600 mt-6">Don&apos;t close this tab — your results are on the way.</p>
      </div>
    )
  }

  // ── Done state ─────────────────────────────────────────────────────────────
  if (status === 'done') {
    // Pool was already full from a prior session
    if (poolWasFull) {
      return (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Your ICP pool is full</h2>
              <p className="text-sm text-slate-400">
                {existingCount} profile{existingCount !== 1 ? 's are' : ' is'} already tracked — Scout will surface their posts in your feed.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNext(existingCount)}
            className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors"
          >
            Continue →
          </button>
        </div>
      )
    }

    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">
              {added > 0 ? `${added} profile${added !== 1 ? 's' : ''} added to your pool` : 'Your ICP pool is ready'}
            </h2>
            <p className="text-sm text-slate-400">
              {added > 0
                ? 'Scout will track these people and surface their posts in your feed.'
                : 'Scout will pull from your keyword searches for your first scan.'}
            </p>
          </div>
        </div>

        {results.length > 0 && (
          <div className="mb-6 space-y-2 max-h-64 overflow-y-auto pr-1">
            {results.map(p => (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-800/60 border border-slate-700/40">
                <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center shrink-0 text-xs font-medium text-slate-300">
                  {p.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-200 truncate">{p.name}</p>
                  <p className="text-xs text-slate-600 truncate">{p.profileUrl.replace('https://www.linkedin.com/in/', 'linkedin.com/in/')}</p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">Added</span>
              </div>
            ))}
          </div>
        )}

        {skipped > 0 && (
          <p className="text-xs text-slate-600 mb-4">{skipped} profile{skipped !== 1 ? 's were' : ' was'} already in your pool.</p>
        )}

        {added === 0 && results.length === 0 && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm text-amber-400">
            No new profiles found for those job titles. You can add profiles manually in Settings after setup.
          </div>
        )}

        <button
          onClick={() => onNext(added)}
          className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors"
        >
          {added > 0 ? `Continue with ${added} ICP profile${added !== 1 ? 's' : ''} →` : 'Continue →'}
        </button>
      </div>
    )
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div>
        <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-5">
          <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white text-center mb-2">Discovery hit a snag</h2>
        <p className="text-xs text-slate-500 text-center mb-6">{error}</p>
        <div className="flex gap-3">
          <button
            onClick={() => { setStatus('idle'); setError('') }}
            className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-400 hover:text-white text-sm transition-colors"
          >
            Try again
          </button>
          <button
            onClick={() => onNext(0)}
            className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition-colors"
          >
            Skip this step
          </button>
        </div>
      </div>
    )
  }

  // ── Idle state ─────────────────────────────────────────────────────────────
  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-2">Find your ideal clients on LinkedIn</h2>
      <p className="text-slate-400 text-sm mb-6">
        Scout will search LinkedIn and automatically add up to {poolLimit} people who match your ICP to your tracking pool. Their posts will appear in your feed every day.
      </p>

      {/* How it works callout */}
      <div className="mb-6 rounded-xl bg-slate-800/40 border border-slate-700/30 px-4 py-3 flex gap-3">
        <svg className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <div>
          <p className="text-sm font-medium text-slate-300">AI-powered profile discovery</p>
          <p className="text-sm text-slate-500 leading-relaxed mt-0.5">
            Scout builds a targeted Google search using your job titles and keywords to find matching LinkedIn profiles and adds them to your feed automatically.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
            Job titles to target <span className="text-blue-400">*</span>
          </label>
          <input
            value={jobTitleInput}
            onChange={e => setJobTitleInput(e.target.value)}
            placeholder="e.g. Agency Owner, Marketing Director, VP of Sales"
            maxLength={200}
            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20 transition-colors"
          />
          <p className="text-xs text-slate-600 mt-1.5">Separate multiple titles with commas.</p>
        </div>

        {keywords.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">Search signal (from your keywords)</p>
            <div className="flex flex-wrap gap-1.5">
              {keywords.slice(0, 4).map((kw, i) => (
                <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700/50 text-slate-400">
                  {kw}
                </span>
              ))}
              {keywords.length > 4 && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700/50 text-slate-600">
                  +{keywords.length - 4} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          {error}
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <button
          onClick={onBack}
          className="px-5 py-3.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 text-sm font-medium transition-colors"
        >
          Back
        </button>
        <button
          onClick={runDiscover}
          disabled={!jobTitleInput.trim()}
          className="flex-1 py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Discover profiles
        </button>
      </div>

      <button
        onClick={() => onNext(0)}
        className="mt-3 w-full text-xs text-slate-600 hover:text-slate-400 transition-colors py-1"
      >
        Skip — I&apos;ll add profiles manually in Settings
      </button>
    </div>
  )
}

// ── Step 3: Launch Scan ──────────────────────────────────────────────────────
//
// Strategy: fire the scan immediately and race against a 12-second client-side
// timer. If the scan completes in time, show the full result. If the scan is
// still running after 12s, mark onboarding complete and redirect to the feed
// with ?firstScan=1 — the Vercel function continues running server-side and
// completes even after the client navigates away (serverless functions are not
// killed by client disconnects; they run to maxDuration). The feed detects the
// query param and shows a "first scan in progress" banner while polling.
//
function StepLaunchScan({
  data,
  onBack,
  onComplete,
  onMarkComplete,
}: {
  data: any
  onBack: () => void
  onComplete: (postsFound: number, scanCompleted: boolean) => void
  onMarkComplete: () => Promise<void>
}) {
  const [status, setStatus]         = useState<'idle' | 'saving' | 'scanning' | 'done' | 'error'>('idle')
  const [postsFound, setPostsFound] = useState(0)
  const [breakdown, setBreakdown]   = useState<{ fetched?: number; ageFiltered?: number; belowThreshold?: number } | null>(null)
  const [progress, setProgress]     = useState(0)
  const [errorMsg, setErrorMsg]     = useState('')
  const [scanCompleted, setScanCompleted] = useState(false)

  const runScan = async () => {
    setStatus('saving')
    setProgress(10)

    // 1. Save business profile (non-fatal — already saved on Step 0 advance,
    //    this is a belt-and-suspenders write in case that failed)
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
    let scanResult: { postsFound: number; breakdown?: any } | null = null
    let scanWon     = false
    let scanErrored = false
    let timedOut    = false

    const scanFetch = fetch('/api/trigger-scan', { method: 'POST' })
      .then(async r => {
        if (!r.ok) throw new Error('scan-failed')
        return r.json()
      })
      .then(result => {
        if (!timedOut) {
          scanResult = result
          scanWon    = true
        }
      })
      .catch(() => {
        if (!timedOut) {
          scanErrored = true
        }
      })

    const timeoutFence = new Promise<void>(resolve => setTimeout(() => {
      timedOut = true
      resolve()
    }, 12_000))

    await Promise.race([scanFetch, timeoutFence])

    clearInterval(progressInterval)

    // Case 1: Scan timed out — Vercel function still running server-side
    if (!scanWon && !scanErrored) {
      setProgress(100)
      setScanCompleted(false)
      setPostsFound(0)
      setStatus('done')
      await new Promise(r => setTimeout(r, 600))
      onComplete(0, false)
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
            <h2 className="text-2xl font-bold text-white mb-2">Your feed is ready</h2>
            <p className="text-slate-400 text-sm mb-4">
              Your first scan searched LinkedIn but didn&apos;t find posts that crossed the relevance threshold yet — this is normal on a brand-new account.
            </p>
            {breakdown && (
              <div className="text-left bg-slate-800/40 border border-slate-700/30 rounded-xl p-4 mb-4 space-y-2">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">What happened</p>
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
            <div className="text-left bg-blue-600/5 border border-blue-500/15 rounded-xl p-4 mb-8 space-y-2">
              <p className="text-xs font-medium text-blue-400 mb-2">Two things that will help immediately</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                1. <span className="text-slate-200">Add more ICP profiles</span> in Settings — Scout fetches their latest posts directly.
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                2. <span className="text-slate-200">Your next automatic scan</span> runs tonight and tomorrow morning — posts will be waiting.
              </p>
            </div>
          </>
        )}

        <button
          onClick={() => onComplete(postsFound, true)}
          className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors"
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
            onClick={() => onComplete(0, true)}
            className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition-colors"
          >
            Go to my feed
          </button>
        </div>
      </div>
    )
  }

  // ── Idle state (launch screen) ─────────────────────────────────────────────
  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-2">You&apos;re almost live</h2>
      <p className="text-slate-400 text-sm mb-8">
        Scout will search LinkedIn for conversations worth joining right now and score them for relevance. Takes about 30–45 seconds, then your feed is live with daily updates from here on.
      </p>

      {/* Summary card */}
      <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4 mb-8 space-y-3">
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
          <span className="text-slate-600 text-xs mt-0.5 w-20 shrink-0">Keywords</span>
          <span className="text-sm text-emerald-400">{data.keywordCount ?? 0} active</span>
        </div>
        <div className="flex items-start gap-3">
          <span className="text-slate-600 text-xs mt-0.5 w-20 shrink-0">ICP pool</span>
          <span className={`text-sm ${(data.icpCount ?? 0) > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
            {(data.icpCount ?? 0) > 0
              ? `${data.icpCount} profile${data.icpCount !== 1 ? 's' : ''} tracked`
              : 'None yet — add in Settings after setup'}
          </span>
        </div>
      </div>

      <button
        onClick={runScan}
        disabled={status !== 'idle'}
        className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        Run my first scan
      </button>

      <div className="mt-5 flex items-center justify-between">
        <button onClick={onBack} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
          ← Back
        </button>
      </div>
    </div>
  )
}

// ── Main Onboarding Page ─────────────────────────────────────────────────────
//
// Step flow: 0 Business Info → 1 Keywords → 2 Discover ICPs → 3 Launch Scan
// Signal Types step has been removed — signalTypes defaults to [] (all types).
//
export default function OnboardingPage() {
  const router = useRouter()
  const { data: session, status, update: updateSession } = useSession()
  const [step, setStep]             = useState(0)
  const [keywords, setKeywords]     = useState<string[]>([])
  const [keywordCount, setKeywordCount] = useState(0)
  const [icpCount, setIcpCount]     = useState(0)
  const [profile, setProfile]       = useState({
    businessName:  '',
    industry:      '',
    idealClient:   '',
    problemSolved: '',
    signalTypes:   [] as string[],   // always empty = all signal types
  })

  const plan      = (session?.user as any)?.plan || 'Trial'
  const tierLimits = getTierLimits(plan)

  // Already-onboarded guard — skip wizard if setup is already done
  useEffect(() => {
    if (status !== 'authenticated') return
    const onboarded = (session?.user as any)?.onboarded ?? false
    if (onboarded) router.replace('/')
  }, [status, session, router])

  const updateProfile = (key: string, value: string) =>
    setProfile(prev => ({ ...prev, [key]: value }))

  // Marks onboarding complete server-side and refreshes the JWT so the
  // feed redirect guard clears immediately — no localStorage needed.
  const markOnboardingComplete = async () => {
    const apiWrite = async () => {
      const resp = await fetch('/api/onboarding/complete', { method: 'POST' })
      if (!resp.ok) throw new Error('onboarding-complete-failed')
    }
    try {
      await apiWrite()
    } catch {
      try { await apiWrite() } catch { /* both attempts non-fatal */ }
    }
    try { await updateSession({ onboarded: true }) } catch { /* non-fatal */ }
  }

  // Called when StepLaunchScan finishes (scan result or timeout redirect)
  const handleScanComplete = (postsFound: number, scanCompleted: boolean) => {
    if (scanCompleted && postsFound > 0) {
      router.push('/')
    } else if (!scanCompleted) {
      router.push('/?firstScan=1')
    } else {
      router.push('/?firstScan=0')
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
          <StepBusinessInfo
            data={profile}
            onChange={updateProfile}
            onNext={() => setStep(1)}
          />
        )}
        {step === 1 && (
          <StepKeywords
            planLimit={tierLimits.keywords}
            industry={profile.industry}
            idealClient={profile.idealClient}
            problemSolved={profile.problemSolved}
            onNext={(kws: string[]) => {
              setKeywords(kws)
              setKeywordCount(kws.length)
              setStep(2)
            }}
            onBack={() => setStep(0)}
          />
        )}
        {step === 2 && (
          <StepDiscoverICPs
            keywords={keywords}
            idealClient={profile.idealClient}
            poolLimit={tierLimits.poolSize}
            onNext={(count: number) => {
              setIcpCount(count)
              setStep(3)
            }}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <StepLaunchScan
            data={{ ...profile, keywordCount, icpCount }}
            onBack={() => setStep(2)}
            onComplete={handleScanComplete}
            onMarkComplete={markOnboardingComplete}
          />
        )}
      </div>
    </div>
  )
}
