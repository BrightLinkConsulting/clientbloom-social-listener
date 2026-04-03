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
              Live · every 3 hours
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
      description={`${activeCount} of ${groups.length} groups active · scrapes 20 posts per group every 3 hours`}
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

// ---- LinkedIn Terms Section ----
function LinkedInTermsSection({ sources, onUpdate }: {
  sources: Source[]
  onUpdate: () => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [newTerm, setNewTerm] = useState('')
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [error, setError] = useState('')

  const terms = sources.filter(s => s.type === 'linkedin_term')
  const activeCount = terms.filter(t => t.active).length

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

  const handleAdd = async () => {
    const term = newTerm.trim()
    if (!term) { setError('Enter a search term.'); return }
    setAdding(true)
    setError('')
    try {
      const resp = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: term, type: 'linkedin_term', value: term, priority: 'high' }),
      })
      if (!resp.ok) throw new Error(await resp.text())
      setNewTerm('')
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
      title="LinkedIn Search Terms"
      description={`${activeCount} of ${terms.length} terms active · requires Apify paid plan to return results`}
    >
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
          Paused — free plan limit
        </span>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          {error}
          <button onClick={() => setError('')} className="ml-2 opacity-60 hover:opacity-100">x</button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
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
              {deleting === t.id ? <Spinner /> : 'x'}
            </button>
          </div>
        ))}
      </div>

      {showAdd ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder='e.g. "agency client churn"'
            value={newTerm}
            onChange={e => setNewTerm(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            autoFocus
            className="flex-1 text-sm bg-slate-800/80 border border-slate-700/50 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
          />
          <button
            onClick={() => { setShowAdd(false); setNewTerm(''); setError('') }}
            className="text-xs px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={adding}
            className="text-xs px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {adding && <Spinner />}
            Add
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Search Term
        </button>
      )}
    </Section>
  )
}

// ---- Static data ----
const KEYWORDS = {
  'Retention & Churn': [
    'client retention', 'client churn', 'retain clients', 'keep clients', 'losing clients',
    'lost a client', 'clients leaving', 'client turnover', 'customer churn', 'customer retention',
    'agency retention', 'client dropped', 'client cancelled', 'cancel their contract',
    'clients keep leaving', "clients aren't sticking", 'high churn', 'reduce churn', 'churn rate',
  ],
  'Emotional / Friction': [
    'frustrated with clients', 'client complaints', 'difficult clients', 'unhappy clients',
    'client ghosted', "client won't pay", 'fire a client', 'client is upset', 'client is unhappy',
    'client is leaving', 'client at risk', 'client escalation', 'referrals drying up',
    'client lifetime value', 'LTV problem', 'lost the account',
  ],
  'Process / Systems': [
    'client health score', 'client health', 'customer health score', 'client onboarding',
    'client success', 'customer success manager', 'CSM', 'client dashboard',
    'client portal', 'client reporting', 'book of business', 'account management systems',
  ],
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

        <Section
          title="Keyword Gate"
          description="A post must match at least one of these to reach Claude for scoring. Platform names are excluded to avoid promo spam."
        >
          <div className="space-y-5">
            {Object.entries(KEYWORDS).map(([category, words]) => (
              <div key={category}>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{category}</p>
                <div className="flex flex-wrap gap-1.5">
                  {words.map((word) => (
                    <span key={word} className="text-xs px-2.5 py-1 rounded-full bg-slate-800/70 text-slate-400 border border-slate-700/50">
                      {word}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="System Status">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Scraper', value: 'Every 3 hours', status: 'active' },
              { label: 'Digest', value: 'Daily 7 AM local', status: 'active' },
              { label: 'LinkedIn', value: 'Paused (free plan)', status: 'paused' },
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
