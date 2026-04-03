'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback } from 'react'

// ---- Types ----
interface Source {
  id: string
  name: string
  type: 'facebook_group' | 'linkedin_term'
  value: string
  active: boolean
  priority: 'high' | 'medium' | 'low'
}

// ---- Nav ----
function Nav() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-[#0a0c10]/95 backdrop-blur-md">
      <div className="max-w-3xl mx-auto px-5 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
            CB
          </div>
          <div>
            <p className="text-sm font-semibold text-white leading-tight">ClientBloom Listener</p>
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live · 2× daily
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
        </nav>
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
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
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

// ---- Facebook Groups Section ----
function FacebookGroupsSection({ sources, onUpdate }: {
  sources: Source[]
  onUpdate: () => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [newPriority, setNewPriority] = useState<'high' | 'medium' | 'low'>('medium')
  const [adding, setAdding] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState('')

  const groups = sources.filter(s => s.type === 'facebook_group')
  const activeCount = groups.filter(g => g.active).length

  const handleToggle = async (source: Source) => {
    setToggling(source.id)
    try {
      const resp = await fetch(`/api/sources/${source.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !source.active }),
      })
      if (!resp.ok) throw new Error(await resp.text())
      onUpdate()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setToggling(null)
    }
  }

  const handleDelete = async (source: Source) => {
    if (!confirm(`Remove "${source.name}"? This will stop scraping this group.`)) return
    setDeleting(source.id)
    try {
      const resp = await fetch(`/api/sources/${source.id}`, { method: 'DELETE' })
      if (!resp.ok) throw new Error(await resp.text())
      onUpdate()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setDeleting(null)
    }
  }

  const handleAdd = async () => {
    if (!newName.trim() || !newUrl.trim()) {
      setError('Group name and URL are required.')
      return
    }
    const url = newUrl.trim()
    if (!url.includes('facebook.com/groups/')) {
      setError('URL must be a Facebook group URL (facebook.com/groups/...)')
      return
    }
    setAdding(true)
    setError('')
    try {
      const resp = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), type: 'facebook_group', value: url, priority: newPriority }),
      })
      if (!resp.ok) throw new Error(await resp.text())
      setNewName('')
      setNewUrl('')
      setNewPriority('medium')
      setShowAdd(false)
      onUpdate()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setAdding(false)
    }
  }

  return (
    <Section
      title="Facebook Groups"
      description={`${activeCount} of ${groups.length} groups active · scans 20 posts per group · runs 2× daily`}
    >
      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          {error}
          <button onClick={() => setError('')} className="ml-2 opacity-60 hover:opacity-100">x</button>
        </div>
      )}

      <div className="space-y-2 mb-4">
        {groups.map((g) => (
          <div
            key={g.id}
            className={`flex items-center gap-3 py-2.5 px-3 rounded-lg border transition-all ${
              g.active
                ? 'bg-slate-800/40 border-slate-700/30'
                : 'bg-slate-900/40 border-slate-800/30 opacity-50'
            }`}
          >
            {/* Toggle */}
            <button
              onClick={() => handleToggle(g)}
              disabled={toggling === g.id}
              title={g.active ? 'Pause this group' : 'Resume this group'}
              className="shrink-0 w-8 h-5 rounded-full transition-colors relative focus:outline-none"
              style={{ backgroundColor: g.active ? '#22c55e' : '#334155' }}
            >
              {toggling === g.id ? (
                <span className="absolute inset-0 flex items-center justify-center">
                  <Spinner />
                </span>
              ) : (
                <span
                  className="absolute top-0.5 left-0 w-4 h-4 rounded-full bg-white shadow transition-transform"
                  style={{ transform: g.active ? 'translateX(14px)' : 'translateX(2px)' }}
                />
              )}
            </button>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-200 font-medium truncate">{g.name}</p>
              <a
                href={g.value}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-slate-600 hover:text-slate-400 transition-colors truncate block"
              >
                {g.value}
              </a>
            </div>

            {/* Priority badge */}
            <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium ${
              g.priority === 'high'
                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                : 'bg-slate-700/50 text-slate-500 border-slate-600/30'
            }`}>
              {g.priority}
            </span>

            {/* Delete */}
            <button
              onClick={() => handleDelete(g)}
              disabled={deleting === g.id}
              title="Remove this group"
              className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
            >
              {deleting === g.id ? <Spinner /> : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </button>
          </div>
        ))}
      </div>

      {/* Add form */}
      {showAdd ? (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-3">
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Add Facebook Group</p>
          <input
            type="text"
            placeholder="Group name (e.g. Agency Growth Insiders)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="w-full text-sm bg-slate-800/80 border border-slate-700/50 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
          />
          <input
            type="url"
            placeholder="https://www.facebook.com/groups/..."
            value={newUrl}
            onChange={e => setNewUrl(e.target.value)}
            className="w-full text-sm bg-slate-800/80 border border-slate-700/50 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
          />
          <div className="flex items-center gap-3">
            <select
              value={newPriority}
              onChange={e => setNewPriority(e.target.value as any)}
              className="text-sm bg-slate-800/80 border border-slate-700/50 rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-blue-500/50"
            >
              <option value="high">High priority</option>
              <option value="medium">Medium priority</option>
              <option value="low">Low priority</option>
            </select>
            <div className="flex gap-2 ml-auto">
              <button
                onClick={() => { setShowAdd(false); setError(''); setNewName(''); setNewUrl('') }}
                className="text-xs px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={adding}
                className="text-xs px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {adding && <Spinner />}
                Add Group
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-slate-700/50 text-xs text-slate-500 hover:text-slate-300 hover:border-slate-600 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Facebook Group
        </button>
      )}
    </Section>
  )
}

// ---- LinkedIn Terms: preset suggestion bank ----
const TERM_SUGGESTIONS = [
  {
    label: 'Topics your ICP discusses',
    color: 'blue',
    terms: [
      'client retention',
      'client success',
      'client management',
      'account management',
      'client onboarding',
      'agency operations',
    ],
  },
  {
    label: 'Advice & recommendations',
    color: 'emerald',
    terms: [
      'looking for recommendations',
      'what tools do you use',
      'how do you handle',
      'anyone tried',
      'lessons learned',
      'what worked for us',
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
      'we decided to use',
    ],
  },
  {
    label: 'Growth & team signals',
    color: 'red',
    terms: [
      'scaling the agency',
      'growing our team',
      'just hired',
      'new client win',
      'expanding our services',
    ],
  },
]

const colorMap: Record<string, string> = {
  red:     'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20',
  blue:    'bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20',
  amber:   'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20',
  emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20',
}

// ---- LinkedIn Terms Section ----
function LinkedInTermsSection({ sources, onUpdate }: {
  sources: Source[]
  onUpdate: () => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [newTerm, setNewTerm] = useState('')
  const [adding, setAdding] = useState(false)
  const [addingPreset, setAddingPreset] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [error, setError] = useState('')

  const terms = sources.filter(s => s.type === 'linkedin_term')
  const activeCount = terms.filter(t => t.active).length
  const existingValues = new Set(terms.map(t => t.value.toLowerCase()))

  const handleToggle = async (source: Source) => {
    setToggling(source.id)
    try {
      const resp = await fetch(`/api/sources/${source.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !source.active }),
      })
      if (!resp.ok) throw new Error(await resp.text())
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
      if (!resp.ok) throw new Error(await resp.text())
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
    if (isPreset) setAddingPreset(t)
    else setAdding(true)
    setError('')
    try {
      const resp = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: t, type: 'linkedin_term', value: t, priority: 'high' }),
      })
      if (!resp.ok) throw new Error(await resp.text())
      if (!isPreset) { setNewTerm(''); setShowAdd(false) }
      onUpdate()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setAdding(false)
      setAddingPreset(null)
    }
  }

  return (
    <Section
      title="LinkedIn Search Terms"
      description={`${activeCount} of ${terms.length} terms active · keyword search runs 2× daily`}
    >
      {/* How it works tip */}
      <div className="mb-5 flex gap-3 px-3.5 py-3 rounded-xl bg-slate-800/50 border border-slate-700/40">
        <svg className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-300">What to enter here</p>
          <p className="text-xs text-slate-500 leading-relaxed">
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

      {terms.length === 0 && (
        <p className="text-xs text-slate-600 mb-5">No search terms yet — add some below to start finding posts.</p>
      )}

      {/* Suggestions panel */}
      {showSuggestions && (
        <div className="mb-5 rounded-xl border border-slate-700/40 bg-slate-900/60 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-300">Suggested terms — click any to add</p>
            <button onClick={() => setShowSuggestions(false)} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">Done</button>
          </div>
          <p className="text-xs text-slate-600 -mt-2">These are starting points. Swap the generic words for the specific topics your buyers actually post about on LinkedIn.</p>
          {TERM_SUGGESTIONS.map(group => (
            <div key={group.label}>
              <p className="text-xs text-slate-500 font-medium mb-2">{group.label}</p>
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
          <p className="text-xs text-slate-500">Enter a 2–4 word topic or phrase your ideal client would post about on LinkedIn. Avoid single words — they pull too much noise.</p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder='e.g. "client success strategy" or "agency account management"'
              value={newTerm}
              onChange={e => setNewTerm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTerm(newTerm)}
              autoFocus
              maxLength={60}
              className="flex-1 text-sm bg-slate-800/80 border border-slate-700/50 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
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

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => { setShowSuggestions(v => !v); setShowAdd(false) }}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.346A3.51 3.51 0 0114.5 18H9.5a3.51 3.51 0 01-2.471-1.024l-.347-.346z" />
          </svg>
          Browse suggestions
        </button>
        <button
          onClick={() => { setShowAdd(v => !v); setShowSuggestions(false) }}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add custom term
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
  postsFound: number
}

const ICP_JOB_TITLES = [
  'Agency Owner', 'Agency CEO', 'Agency Founder', 'Marketing Agency Owner',
  'Digital Agency Owner', 'White Label Agency', 'GoHighLevel Agency',
  'Head of Customer Success', 'VP of Customer Success', 'Director of Customer Success',
  'Customer Success Manager', 'Client Success Manager', 'Account Manager',
]

function LinkedInICPSection() {
  const [profiles, setProfiles]       = useState<IcpProfile[]>([])
  const [loading, setLoading]         = useState(true)
  const [toggling, setToggling]       = useState<string | null>(null)
  const [deleting, setDeleting]       = useState<string | null>(null)
  const [error, setError]             = useState('')

  // Manual add form
  const [showAdd, setShowAdd]         = useState(false)
  const [newUrl, setNewUrl]           = useState('')
  const [newName, setNewName]         = useState('')
  const [newTitle, setNewTitle]       = useState('')
  const [newCompany, setNewCompany]   = useState('')
  const [adding, setAdding]           = useState(false)

  // Discovery panel
  const [showDiscover, setShowDiscover] = useState(false)
  const [discTitles, setDiscTitles]     = useState<string[]>(['Agency Owner', 'Agency CEO'])
  const [discKeywords, setDiscKeywords] = useState<string[]>(['GoHighLevel', 'marketing agency'])
  const [discMax, setDiscMax]           = useState(50)
  const [discTitleInput, setDiscTitleInput] = useState('')
  const [discKwInput, setDiscKwInput]       = useState('')
  const [discovering, setDiscovering]       = useState(false)
  const [discResult, setDiscResult]         = useState<string>('')

  const fetchProfiles = useCallback(async () => {
    try {
      const resp = await fetch('/api/linkedin-icps')
      if (!resp.ok) throw new Error('Failed to load ICP profiles')
      const data = await resp.json()
      setProfiles(data.profiles || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchProfiles() }, [fetchProfiles])

  const handleToggle = async (p: IcpProfile) => {
    setToggling(p.id)
    try {
      const resp = await fetch(`/api/linkedin-icps/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !p.active }),
      })
      if (!resp.ok) throw new Error(await resp.text())
      await fetchProfiles()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setToggling(null)
    }
  }

  const handleDelete = async (p: IcpProfile) => {
    if (!confirm(`Remove "${p.name}" from your ICP pool?`)) return
    setDeleting(p.id)
    try {
      const resp = await fetch(`/api/linkedin-icps/${p.id}`, { method: 'DELETE' })
      if (!resp.ok) throw new Error(await resp.text())
      await fetchProfiles()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setDeleting(null)
    }
  }

  const handleAddManual = async () => {
    if (!newUrl.trim()) { setError('LinkedIn profile URL is required.'); return }
    if (!newUrl.includes('linkedin.com/in/')) {
      setError('Must be a LinkedIn profile URL (linkedin.com/in/...)')
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
      if (!resp.ok) throw new Error(await resp.text())
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
    if (!discTitles.length) { setError('Add at least one job title to search.'); return }
    setDiscovering(true)
    setDiscResult('')
    setError('')
    try {
      const resp = await fetch('/api/linkedin-icps/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobTitles: discTitles, keywords: discKeywords, maxProfiles: discMax }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Discovery failed')
      setDiscResult(`Found ${data.added} new profiles (${data.skipped} already in pool)`)
      await fetchProfiles()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setDiscovering(false)
    }
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

  const active = profiles.filter(p => p.active).length
  const total  = profiles.length

  return (
    <Section
      title="LinkedIn ICP Pool"
      description={`${active} of ${total} profiles being monitored · posts scored for engagement opportunity`}
    >
      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-start justify-between gap-2">
          <span>{error}</span>
          <button onClick={() => setError('')} className="shrink-0 opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500"><Spinner />Loading profiles...</div>
      ) : profiles.length === 0 ? (
        <p className="text-xs text-slate-500 mb-4">No profiles yet. Add manually or use Discover to find ICPs automatically.</p>
      ) : (
        <div className="space-y-2 mb-4">
          {profiles.map(p => (
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
                  <a
                    href={p.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-white hover:text-blue-400 transition-colors truncate"
                  >
                    {p.name || p.profileUrl}
                  </a>
                  {p.source === 'discovered' && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      discovered
                    </span>
                  )}
                </div>
                {(p.jobTitle || p.company) && (
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
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
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => { setShowAdd(!showAdd); setShowDiscover(false) }}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-700/60 bg-slate-800/60 text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Profile
        </button>
        <button
          onClick={() => { setShowDiscover(!showDiscover); setShowAdd(false) }}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-blue-500/30 bg-blue-600/10 text-blue-400 hover:bg-blue-600/20 hover:text-blue-300 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Discover ICPs
        </button>
      </div>

      {/* Manual Add Form */}
      {showAdd && (
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-4 mb-4 space-y-3">
          <p className="text-xs font-semibold text-slate-300">Add Profile Manually</p>
          <input
            type="url"
            placeholder="https://www.linkedin.com/in/username/"
            value={newUrl}
            onChange={e => setNewUrl(e.target.value)}
            className="w-full bg-slate-800/80 border border-slate-700/50 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              placeholder="Full name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="bg-slate-800/80 border border-slate-700/50 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
            />
            <input
              type="text"
              placeholder="Job title"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              className="bg-slate-800/80 border border-slate-700/50 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
            />
            <input
              type="text"
              placeholder="Company"
              value={newCompany}
              onChange={e => setNewCompany(e.target.value)}
              className="bg-slate-800/80 border border-slate-700/50 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAddManual}
              disabled={adding}
              className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50"
            >
              {adding && <Spinner />}
              Add to Pool
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="text-xs px-3 py-2 rounded-lg border border-slate-700/50 text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Discovery Panel */}
      {showDiscover && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-600/5 p-4 space-y-4">
          <div>
            <p className="text-xs font-semibold text-slate-300 mb-1">Discover ICPs</p>
            <p className="text-xs text-slate-500">
              Searches Google for LinkedIn profiles matching your criteria. No LinkedIn login required.
            </p>
          </div>

          {/* Job Titles */}
          <div>
            <p className="text-xs text-slate-400 mb-2 font-medium">Job Titles <span className="text-slate-600 font-normal">(required)</span></p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {discTitles.map(t => (
                <span key={t} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700/50">
                  {t}
                  <button onClick={() => setDiscTitles(discTitles.filter(x => x !== t))} className="text-slate-600 hover:text-red-400 ml-0.5">×</button>
                </span>
              ))}
            </div>
            {/* Quick-add buttons from preset list */}
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
                className="flex-1 bg-slate-800/80 border border-slate-700/50 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
              />
              <button onClick={addDiscTitle} className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors">
                Add
              </button>
            </div>
          </div>

          {/* Narrowing Keywords */}
          <div>
            <p className="text-xs text-slate-400 mb-2 font-medium">Narrowing Keywords <span className="text-slate-600 font-normal">(optional, but recommended)</span></p>
            <p className="text-xs text-slate-600 mb-2">Helps filter broad titles like "CEO" down to the right people.</p>
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
                placeholder="e.g. GoHighLevel, white label, SaaS..."
                value={discKwInput}
                onChange={e => setDiscKwInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addDiscKw()}
                className="flex-1 bg-slate-800/80 border border-slate-700/50 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
              />
              <button onClick={addDiscKw} className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors">
                Add
              </button>
            </div>
          </div>

          {/* Max profiles */}
          <div>
            <p className="text-xs text-slate-400 mb-2 font-medium">Max Profiles to Add</p>
            <div className="flex gap-2">
              {[25, 50, 100, 200].map(n => (
                <button
                  key={n}
                  onClick={() => setDiscMax(n)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    discMax === n
                      ? 'bg-blue-600/20 border-blue-500/40 text-blue-400'
                      : 'border-slate-700/50 bg-slate-800/60 text-slate-400 hover:text-white'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-600 mt-1">Hard cap prevents runaway Apify usage with overly broad terms.</p>
          </div>

          {discResult && (
            <div className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
              {discResult}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleDiscover}
              disabled={discovering || !discTitles.length}
              className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50"
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
        </div>
      )}
    </Section>
  )
}

// ---- Facebook Keywords Section ----
interface FbKeyword {
  id: string
  keyword: string
  category: string
  active: boolean
}

const FB_KEYWORD_SUGGESTIONS = [
  { label: 'Retention & Churn',    terms: ['client retention', 'client churn', 'losing clients', 'lost a client', 'clients leaving', 'customer churn', 'reduce churn', 'churn rate'] },
  { label: 'Emotional / Friction', terms: ['frustrated with clients', 'difficult clients', 'unhappy clients', 'client ghosted', 'client at risk', 'client escalation', 'lost the account'] },
  { label: 'Process / Systems',    terms: ['client health score', 'client health', 'client onboarding', 'client success', 'client dashboard', 'client reporting', 'book of business'] },
]

function FacebookKeywordsSection() {
  const [keywords, setKeywords]   = useState<FbKeyword[]>([])
  const [loading, setLoading]     = useState(true)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showAdd, setShowAdd]     = useState(false)
  const [newKw, setNewKw]         = useState('')
  const [adding, setAdding]       = useState(false)
  const [addingPreset, setAddingPreset] = useState<string | null>(null)
  const [toggling, setToggling]   = useState<string | null>(null)
  const [deleting, setDeleting]   = useState<string | null>(null)
  const [error, setError]         = useState('')

  const fetchKeywords = useCallback(async () => {
    try {
      const resp = await fetch('/api/facebook-keywords')
      const data = await resp.json()
      setKeywords(data.keywords || [])
    } catch { /* stay silent */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchKeywords() }, [fetchKeywords])

  const existingSet = new Set(keywords.map(k => k.keyword.toLowerCase()))
  const activeCount = keywords.filter(k => k.active).length

  const addKeyword = async (kw: string, isPreset = false) => {
    const term = kw.trim()
    if (!term || existingSet.has(term.toLowerCase())) return
    if (isPreset) setAddingPreset(term); else setAdding(true)
    setError('')
    try {
      const resp = await fetch('/api/facebook-keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: term }),
      })
      if (!resp.ok) throw new Error(await resp.text())
      if (!isPreset) { setNewKw(''); setShowAdd(false) }
      await fetchKeywords()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setAdding(false)
      setAddingPreset(null)
    }
  }

  const toggleKeyword = async (kw: FbKeyword) => {
    setToggling(kw.id)
    try {
      await fetch('/api/facebook-keywords', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: kw.id, active: !kw.active }),
      })
      await fetchKeywords()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setToggling(null)
    }
  }

  const deleteKeyword = async (kw: FbKeyword) => {
    if (!confirm(`Remove "${kw.keyword}"?`)) return
    setDeleting(kw.id)
    try {
      await fetch('/api/facebook-keywords', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: kw.id }),
      })
      await fetchKeywords()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setDeleting(null)
    }
  }

  if (loading) return null

  // Group active keywords by category for display
  const byCategory: Record<string, FbKeyword[]> = {}
  keywords.forEach(k => {
    const cat = k.category || 'Other'
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(k)
  })

  return (
    <Section
      title="Facebook Post Filter"
      description={`${activeCount} of ${keywords.length} keywords active · a Facebook post must match at least one to reach the AI for scoring`}
    >
      {/* Tip */}
      <div className="mb-5 flex gap-3 px-3.5 py-3 rounded-xl bg-slate-800/50 border border-slate-700/40">
        <svg className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs text-slate-500 leading-relaxed">
          These keywords pre-filter Facebook group posts before the AI scores them — keeping costs down and noise out. Add phrases your buyers actually use when they talk about the problems you solve. <span className="text-slate-400">Example: "client churn" or "losing clients."</span>
        </p>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center justify-between">
          {error}
          <button onClick={() => setError('')} className="ml-2 opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      {/* Keywords grouped by category */}
      {Object.entries(byCategory).map(([cat, kws]) => (
        <div key={cat} className="mb-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{cat}</p>
          <div className="flex flex-wrap gap-2">
            {kws.map(k => (
              <div
                key={k.id}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all ${
                  k.active
                    ? 'bg-slate-800 text-slate-300 border-slate-700/50'
                    : 'bg-slate-900/50 text-slate-600 border-slate-800/50'
                }`}
              >
                <button
                  onClick={() => toggleKeyword(k)}
                  disabled={toggling === k.id}
                  title={k.active ? 'Pause' : 'Resume'}
                  className="hover:text-white transition-colors leading-none"
                >
                  {toggling === k.id ? <Spinner /> : (k.active ? '●' : '○')}
                </button>
                <span style={{ textDecoration: k.active ? 'none' : 'line-through' }}>{k.keyword}</span>
                <button
                  onClick={() => deleteKeyword(k)}
                  disabled={deleting === k.id}
                  className="ml-0.5 text-slate-600 hover:text-red-400 transition-colors leading-none"
                >
                  {deleting === k.id ? <Spinner /> : '×'}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {keywords.length === 0 && (
        <p className="text-xs text-slate-600 mb-4">No keywords yet — add some below.</p>
      )}

      {/* Suggestions panel */}
      {showSuggestions && (
        <div className="mb-5 rounded-xl border border-slate-700/40 bg-slate-900/60 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-300">Suggested keywords — click any to add</p>
            <button onClick={() => setShowSuggestions(false)} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">Done</button>
          </div>
          {FB_KEYWORD_SUGGESTIONS.map(group => (
            <div key={group.label}>
              <p className="text-xs text-slate-500 font-medium mb-2">{group.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {group.terms.map(term => {
                  const already = existingSet.has(term.toLowerCase())
                  return (
                    <button
                      key={term}
                      onClick={() => !already && addKeyword(term, true)}
                      disabled={already || addingPreset === term}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                        already
                          ? 'bg-slate-800/30 border-slate-700/30 text-slate-600 cursor-default line-through'
                          : 'bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20 cursor-pointer'
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
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder='e.g. "agency client management" or "losing accounts"'
              value={newKw}
              onChange={e => setNewKw(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addKeyword(newKw)}
              autoFocus
              maxLength={60}
              className="flex-1 text-sm bg-slate-800/80 border border-slate-700/50 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
            />
            <button
              onClick={() => { setShowAdd(false); setNewKw(''); setError('') }}
              className="text-xs px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => addKeyword(newKw)}
              disabled={adding}
              className="text-xs px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {adding && <Spinner />}
              Add
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={() => { setShowSuggestions(v => !v); setShowAdd(false) }}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.346A3.51 3.51 0 0114.5 18H9.5a3.51 3.51 0 01-2.471-1.024l-.347-.346z" />
          </svg>
          Browse suggestions
        </button>
        <button
          onClick={() => { setShowAdd(v => !v); setShowSuggestions(false) }}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add custom keyword
        </button>
      </div>
    </Section>
  )
}

const SCORING_PROMPT = `You are a sales intelligence analyst supporting Joseph, a sales rep at ClientBloom.ai — an AI-powered client retention platform built specifically for marketing agencies and SaaS companies.

ClientBloom helps agency owners track client health, detect churn risk early, and keep clients longer. Joseph's job is to engage in conversations that naturally lead people to discover ClientBloom — not to pitch it cold.

WHAT MAKES A HIGH-SCORE POST (7-10):
- Someone is actively venting, asking for help, or expressing frustration about client retention or churn
- Someone is describing a specific client leaving, canceling, or going silent
- Someone is asking how other agency owners handle difficult client situations or retention
- Someone is building or looking for client health/success systems and hitting a wall
- The post invites a response — it has a question, a struggle, or an emotional signal Joseph can genuinely respond to

WHAT MAKES A LOW-SCORE POST (1-4):
- Educational content (listicles, tips, how-to posts)
- Promotional posts or people selling their own services
- General agency advice with no specific pain
- Questions about tools unrelated to retention

COMMENT APPROACH RULES:
- Never mention ClientBloom or pitch anything
- Lead with something that shows you read their specific situation
- Ask ONE question that continues the conversation
- 2-3 sentences max. Peer-to-peer tone, not salesperson tone`

// ---- Business Profile Section ----
const SIGNAL_OPTIONS = [
  { id: 'asking_for_help', label: 'Publicly asking for tool or service recommendations' },
  { id: 'frustration', label: 'Expressing frustration with their current solution' },
  { id: 'announcing_problem', label: 'Announcing a business challenge or problem' },
  { id: 'growing_team', label: 'Looking to grow, hire, or scale' },
  { id: 'shopping_alternatives', label: 'Comparing or shopping for alternatives' },
  { id: 'milestone', label: 'Celebrating a milestone that signals a transition' },
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
      description="Tells the AI who you are and who to listen for. The more specific, the sharper the results."
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">Your business name</label>
            <input
              value={profile.businessName}
              onChange={e => setProfile(p => ({ ...p, businessName: e.target.value }))}
              placeholder="Your business name"
              className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">Your industry / niche</label>
            <input
              value={profile.industry}
              onChange={e => setProfile(p => ({ ...p, industry: e.target.value }))}
              placeholder="e.g. SaaS, marketing services, recruiting..."
              className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Who is your ideal client?</label>
          <textarea
            value={profile.idealClient}
            onChange={e => setProfile(p => ({ ...p, idealClient: e.target.value }))}
            rows={2}
            placeholder="e.g. Marketing agency owners with 10–50 clients who use GoHighLevel and struggle to retain clients."
            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 resize-none"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1.5">What problem do you solve for them?</label>
          <textarea
            value={profile.problemSolved}
            onChange={e => setProfile(p => ({ ...p, problemSolved: e.target.value }))}
            rows={2}
            placeholder="e.g. We help agencies track client health and get early warnings before clients churn."
            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 resize-none"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-2">Signals to listen for</label>
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

// ---- Main page ----
export default function SettingsPage() {
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

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
      <main className="max-w-3xl mx-auto px-5 py-8 space-y-6">

        <BusinessProfileSection />

        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-slate-500 text-sm">
            <Spinner />
            Loading sources...
          </div>
        )}

        {loadError && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            {loadError}
          </div>
        )}

        {!loading && !loadError && (
          <FacebookGroupsSection sources={sources} onUpdate={fetchSources} />
        )}

        {!loading && !loadError && (
          <LinkedInTermsSection sources={sources} onUpdate={fetchSources} />
        )}

        <LinkedInICPSection />

        <Section
          title="Scoring Thresholds"
          description="Posts below the save threshold are discarded. Posts below the digest threshold are saved but not sent to Slack."
        >
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Min score to save', value: '5 / 10', note: 'Posts below this are dropped' },
              { label: 'Min score for digest', value: '6 / 10', note: 'Posts shown in Slack' },
              { label: 'High-value threshold', value: '8 / 10', note: 'Shown with priority badge' },
            ].map((item) => (
              <div key={item.label} className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-4">
                <p className="text-xs text-slate-500 mb-1">{item.label}</p>
                <p className="text-xl font-bold text-white">{item.value}</p>
                <p className="text-xs text-slate-600 mt-1">{item.note}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Agent Intelligence"
          description="The instructions Claude uses to score each post and generate comment angles."
        >
          <div className="rounded-xl bg-slate-900/80 border border-slate-700/40 p-4">
            <pre className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap font-mono">
              {SCORING_PROMPT}
            </pre>
          </div>
        </Section>

        <FacebookKeywordsSection />

        <Section title="System Status">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Scanner', value: '6 AM + 6 PM PST', status: 'active' },
              { label: 'Digest', value: 'Daily 7 AM PST', status: 'active' },
              { label: 'LinkedIn', value: 'Active (ICP + keyword)', status: 'active' },
              { label: 'Slack channel', value: '#AIOS', status: 'active' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-700/30">
                <div>
                  <p className="text-xs text-slate-500">{item.label}</p>
                  <p className="text-sm text-slate-200 font-medium">{item.value}</p>
                </div>
                <span className={`w-2 h-2 rounded-full ${item.status === 'active' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              </div>
            ))}
          </div>
        </Section>

      </main>
    </div>
  )
}
