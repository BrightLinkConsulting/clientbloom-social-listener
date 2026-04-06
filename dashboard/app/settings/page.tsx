'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'

// ---- Types ----
interface Source {
  id: string
  name: string
  type: 'facebook_group' | 'linkedin_term'
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
  return (
    <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-[#0a0c10]/95 backdrop-blur-md">
      <div className="max-w-3xl mx-auto px-5 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClientBloomMark size={28} />
          <div>
            <p className="text-sm font-semibold text-white leading-tight">Scout by ClientBloom</p>
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
          <SettingsUserMenu />
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
      title="LinkedIn Keyword Search"
      description={`${activeCount} of ${terms.length} terms active · Scout searches LinkedIn for these phrases 2× daily`}
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
          <p className="text-xs text-slate-600 -mt-2">These are starting points. Replace the generic phrases with the specific language your buyers actually use when they post on LinkedIn.</p>
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
              placeholder='e.g. "what tools do you use" or "just launched" or "lessons learned"'
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
      <div className="fixed top-0 right-0 h-full w-[340px] bg-[#0d1017] border-l border-slate-700/50 z-50 flex flex-col shadow-2xl overflow-y-auto">

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
              <p className="text-xs text-slate-400 mt-0.5 leading-snug line-clamp-2">
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
              <p className="text-xs font-medium text-slate-300">Monitoring</p>
              <p className="text-xs text-slate-600 mt-0.5">{profile.active ? 'Posts from this profile are being scanned' : 'Paused — not included in scans'}</p>
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
  const [profiles, setProfiles]       = useState<IcpProfile[]>([])
  const [loading, setLoading]         = useState(true)
  const [toggling, setToggling]       = useState<string | null>(null)
  const [deleting, setDeleting]       = useState<string | null>(null)
  const [error, setError]             = useState('')

  // Profile drawer
  const [selectedProfile, setSelectedProfile] = useState<IcpProfile | null>(null)

  // Search + pagination
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(0)
  const PAGE_SIZE = 25

  // Manual add form
  const [showAdd, setShowAdd]         = useState(false)
  const [newUrl, setNewUrl]           = useState('')
  const [newName, setNewName]         = useState('')
  const [newTitle, setNewTitle]       = useState('')
  const [newCompany, setNewCompany]   = useState('')
  const [adding, setAdding]           = useState(false)

  // Discovery panel
  const [showDiscover, setShowDiscover] = useState(false)
  const [discTitles, setDiscTitles]     = useState<string[]>([])
  const [discKeywords, setDiscKeywords] = useState<string[]>([])
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

  const handleDelete = async (p: IcpProfile, skipConfirm = false) => {
    if (!skipConfirm && !confirm(`Remove "${p.name}" from your ICP pool?`)) return
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

  const handleDrawerNavigate = (direction: 'prev' | 'next') => {
    if (!selectedProfile) return
    const idx = profiles.findIndex(p => p.id === selectedProfile.id)
    const nextIdx = direction === 'prev' ? idx - 1 : idx + 1
    if (nextIdx >= 0 && nextIdx < profiles.length) {
      setSelectedProfile(profiles[nextIdx])
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

  const active   = profiles.filter(p => p.active).length
  const total    = profiles.length
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

  return (
    <Section
      title="LinkedIn ICP Pool"
      description={`${active} of ${total} profiles monitored · Scout checks their LinkedIn activity 2× daily and surfaces the best moments to show up in their conversations`}
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
              className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition-colors"
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
            <p className="text-xs text-slate-600 mb-2">
              {filtered.length === 0 ? 'No matches' : `${filtered.length} match${filtered.length !== 1 ? 'es' : ''}`}
            </p>
          )}

          {/* Profile list */}
          <div className="space-y-2 mb-3">
            {paged.length === 0 && q ? (
              <p className="text-xs text-slate-500 py-3 text-center">No profiles match "{searchQuery}"</p>
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
                placeholder="e.g. SaaS, fintech, B2B consulting..."
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
            placeholder="e.g. Series A SaaS founders in fintech, typically posting about growth, hiring, and product decisions."
            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 resize-none"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1.5">What value do you deliver for them?</label>
          <textarea
            value={profile.problemSolved}
            onChange={e => setProfile(p => ({ ...p, problemSolved: e.target.value }))}
            rows={2}
            placeholder="e.g. We help SaaS founders build their go-to-market motion and close their first 50 enterprise accounts."
            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 resize-none"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-2">Conversation types to prioritize</label>
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

  const inputCls = "w-full bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 resize-none"

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
          <p className="text-xs text-slate-500 leading-relaxed">
            Answer these questions and the AI will write a custom scoring prompt tailored to your business. The more specific you are, the better your feed quality will be.
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              1. Who is your ideal client? <span className="text-slate-600 font-normal">(role, industry, company size)</span>
            </label>
            <textarea rows={2} value={idealClient} onChange={e => setIdealClient(e.target.value)}
              placeholder="e.g. B2B SaaS founders, typically 10–100 employees, posting about growth strategy, hiring, and go-to-market."
              className={inputCls} />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              2. What value do you deliver for them?
            </label>
            <textarea rows={2} value={problemSolved} onChange={e => setProblem(e.target.value)}
              placeholder="e.g. We help founders build and scale an outbound sales motion so they can close enterprise deals without hiring a full team."
              className={inputCls} />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              3. What does a high-value post look like? <span className="text-slate-600 font-normal">(optional — AI will infer if blank)</span>
            </label>
            <textarea rows={2} value={highValue} onChange={e => setHighValue(e.target.value)}
              placeholder="e.g. A founder asking for tool recommendations, sharing a scaling challenge, debating a go-to-market strategy, or announcing a new hire."
              className={inputCls} />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              4. What should be filtered out? <span className="text-slate-600 font-normal">(optional)</span>
            </label>
            <textarea rows={2} value={lowValue} onChange={e => setLowValue(e.target.value)}
              placeholder="e.g. Promotional posts, content marketing, job listings, motivational quotes, pure thought leadership monologues with no comment angle."
              className={inputCls} />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
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

// ---- System Status Section ----
function SystemStatusSection() {
  const [slackChannel,  setSlackChannel]  = useState('')
  const [slackHasToken, setSlackHasToken] = useState(false)
  const [slackLoaded,   setSlackLoaded]   = useState(false)

  useEffect(() => {
    fetch('/api/slack-settings')
      .then(r => r.json())
      .then(d => {
        setSlackHasToken(!!d.slackBotToken)
        setSlackChannel(d.slackChannelName || d.slackChannelId || '')
        setSlackLoaded(true)
      })
      .catch(() => setSlackLoaded(true))
  }, [])

  const slackConfigured = slackLoaded && slackHasToken

  const items = [
    {
      label:  'Scanner',
      value:  'Runs at 6 AM + 6 PM PST',
      detail: 'Scans LinkedIn ICP profiles and keyword searches for new posts',
      status: 'active' as const,
    },
    {
      label:  'LinkedIn',
      value:  'Active — ICP + keyword',
      detail: 'Posts from your ICP pool and keyword searches scored for conversation value',
      status: 'active' as const,
    },
    {
      label:  'Daily Digest',
      value:  'Sent to Slack at 7 AM PST',
      detail: 'AI-written summary of top posts with comment angles — requires Slack to be connected below',
      status: slackConfigured ? 'active' as const : 'warning' as const,
    },
  ]

  return (
    <Section title="System Status" description="Live overview of all connected services">
      <div className="grid grid-cols-2 gap-3">
        {items.map(item => (
          <div
            key={item.label}
            className={`p-3 rounded-lg border ${
              item.status === 'warning'
                ? 'bg-amber-500/5 border-amber-500/20'
                : 'bg-slate-800/40 border-slate-700/30'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-slate-500 mb-0.5">{item.label}</p>
                <p className={`text-sm font-medium ${item.status === 'warning' ? 'text-amber-400' : 'text-slate-200'}`}>
                  {item.value}
                </p>
                <p className="text-xs text-slate-600 mt-1 leading-snug">{item.detail}</p>
              </div>
              <span className={`shrink-0 w-2 h-2 rounded-full mt-1 ${
                item.status === 'warning' ? 'bg-amber-400' : 'bg-emerald-400'
              }`} />
            </div>
          </div>
        ))}
      </div>
    </Section>
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
            <li key={i} className="flex gap-2 text-xs text-slate-500 leading-relaxed">
              <span className="shrink-0 w-4 h-4 rounded-full bg-slate-800 border border-slate-700/50 flex items-center justify-center text-[10px] text-slate-600 mt-0.5">
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
          <p className="text-xs text-slate-400 font-medium mb-1.5">Bot OAuth Token</p>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={botToken}
              onChange={e => { setBotToken(e.target.value); setTestResult(null) }}
              placeholder="xoxb-..."
              className="w-full bg-slate-800/80 border border-slate-700/50 rounded-xl px-3 py-2 pr-10 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 font-mono"
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
            <p className="text-xs text-slate-400 font-medium mb-1.5">Channel Name <span className="text-slate-600 font-normal">(without #)</span></p>
            <input
              type="text"
              value={channelName}
              onChange={e => setChannelName(e.target.value.replace(/^#/, ''))}
              placeholder="general"
              className="w-full bg-slate-800/80 border border-slate-700/50 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
            />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium mb-1.5">Channel ID <span className="text-slate-600 font-normal">(optional)</span></p>
            <input
              type="text"
              value={channelId}
              onChange={e => setChannelId(e.target.value)}
              placeholder="C0XXXXXXXX"
              className="w-full bg-slate-800/80 border border-slate-700/50 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 font-mono"
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
const CRM_INSTRUCTIONS: Record<string, { title: string; steps: string[] }> = {
  GoHighLevel: {
    title: 'How to get your GoHighLevel API key',
    steps: [
      'Log into GoHighLevel and go to your sub-account (not the agency account).',
      'Click Settings (gear icon) → Integrations → API Key.',
      'Copy the Location API Key — this is what you paste below.',
      'The key should start with "eyJ..." or be a long alphanumeric string.',
      'Each sub-account has its own key. Make sure you copy from the right one.',
    ],
  },
  HubSpot: {
    title: 'How to get your HubSpot Private App token',
    steps: [
      'Log into HubSpot and go to Settings (gear icon) → Integrations → Private Apps.',
      'Click "Create a private app" and give it a name (e.g. "ClientBloom").',
      'Under Scopes, enable: crm.objects.contacts.write, crm.objects.notes.write.',
      'Click "Create app" and copy the access token shown.',
      'Paste that token below — it starts with "pat-na1-..." or similar.',
    ],
  },
}

function CRMIntegrationSection() {
  const [crmType,       setCrmType]       = useState('None')
  const [crmApiKey,     setCrmApiKey]     = useState('')
  const [crmPipelineId, setCrmPipelineId] = useState('')
  const [showKey,       setShowKey]       = useState(false)
  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState(false)
  const [testing,       setTesting]       = useState(false)
  const [testResult,    setTestResult]    = useState<{ ok: boolean; msg: string } | null>(null)
  const [saved,         setSaved]         = useState(false)
  const [error,         setError]         = useState('')

  useEffect(() => {
    fetch('/api/crm-settings')
      .then(r => r.json())
      .then(d => {
        setCrmType(d.crmType       || 'None')
        setCrmApiKey(d.crmApiKey   || '')
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crmType, crmApiKey, crmPipelineId }),
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
    if (!crmApiKey.trim()) { setTestResult({ ok: false, msg: 'Paste your API key first.' }); return }
    setTesting(true)
    setTestResult(null)
    try {
      // Test by calling a lightweight endpoint on the CRM
      if (crmType === 'GoHighLevel') {
        const r = await fetch('https://services.leadconnectorhq.com/locations/lookup', {
          headers: { 'Authorization': `Bearer ${crmApiKey}`, 'Version': '2021-07-28' },
        })
        setTestResult(r.ok || r.status === 404
          ? { ok: true,  msg: 'Connected — API key is valid.' }
          : { ok: false, msg: `GHL returned ${r.status}. Double-check the key.` }
        )
      } else if (crmType === 'HubSpot') {
        const r = await fetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', {
          headers: { 'Authorization': `Bearer ${crmApiKey}` },
        })
        setTestResult(r.ok
          ? { ok: true,  msg: 'Connected — HubSpot access confirmed.' }
          : { ok: false, msg: `HubSpot returned ${r.status}. Check scopes and token.` }
        )
      }
    } catch {
      setTestResult({ ok: false, msg: 'Request failed — could be a CORS issue. Try saving and using the Push button on the feed to verify.' })
    } finally {
      setTesting(false)
    }
  }

  const instructions = crmType !== 'None' ? CRM_INSTRUCTIONS[crmType] : null

  if (loading) return null

  return (
    <Section
      title="CRM Integration"
      description="Push engaged contacts directly into your CRM with one click from the feed."
    >
      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')}>×</button>
        </div>
      )}

      {/* CRM selector */}
      <div className="mb-4">
        <p className="text-xs text-slate-400 font-medium mb-2">CRM Platform</p>
        <div className="flex gap-2">
          {['None', 'GoHighLevel', 'HubSpot'].map(opt => (
            <button
              key={opt}
              onClick={() => { setCrmType(opt); setTestResult(null) }}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                crmType === opt
                  ? 'bg-blue-600/20 border-blue-500/40 text-blue-400'
                  : 'border-slate-700/50 bg-slate-800/60 text-slate-400 hover:text-white'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {crmType !== 'None' && (
        <div className="space-y-4">
          {/* Instructions */}
          {instructions && (
            <div className="rounded-xl bg-slate-900/60 border border-slate-700/40 p-4">
              <p className="text-xs font-semibold text-slate-300 mb-2">{instructions.title}</p>
              <ol className="space-y-1.5">
                {instructions.steps.map((step, i) => (
                  <li key={i} className="flex gap-2 text-xs text-slate-500 leading-relaxed">
                    <span className="shrink-0 w-4 h-4 rounded-full bg-slate-800 border border-slate-700/50 flex items-center justify-center text-[10px] text-slate-600 mt-0.5">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* API Key field */}
          <div>
            <p className="text-xs text-slate-400 font-medium mb-1.5">
              {crmType === 'GoHighLevel' ? 'Location API Key' : 'Private App Token'}
            </p>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={crmApiKey}
                onChange={e => { setCrmApiKey(e.target.value); setTestResult(null) }}
                placeholder={crmType === 'GoHighLevel' ? 'eyJ...' : 'pat-na1-...'}
                className="w-full bg-slate-800/80 border border-slate-700/50 rounded-xl px-3 py-2 pr-10 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 font-mono"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors text-xs"
              >
                {showKey ? 'hide' : 'show'}
              </button>
            </div>
          </div>

          {/* Pipeline ID — GHL only */}
          {crmType === 'GoHighLevel' && (
            <div>
              <p className="text-xs text-slate-400 font-medium mb-1">Pipeline ID <span className="text-slate-600 font-normal">(optional)</span></p>
              <p className="text-xs text-slate-600 mb-1.5">Found in GHL → Pipelines → click a pipeline → copy the ID from the URL.</p>
              <input
                type="text"
                value={crmPipelineId}
                onChange={e => setCrmPipelineId(e.target.value)}
                placeholder="pipeline_xxxxxxxx"
                className="w-full bg-slate-800/80 border border-slate-700/50 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 font-mono"
              />
            </div>
          )}

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

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50"
            >
              {saving ? <><Spinner /> Saving…</> : saved ? '✓ Saved' : 'Save'}
            </button>
            <button
              onClick={handleTest}
              disabled={testing || !crmApiKey.trim()}
              className="text-xs px-3 py-2 rounded-lg border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600 disabled:opacity-50 transition-colors"
            >
              {testing ? 'Testing…' : 'Test Connection'}
            </button>
          </div>

          {/* What happens when you push */}
          <div className="rounded-xl bg-slate-900/40 border border-slate-700/30 px-4 py-3">
            <p className="text-xs font-medium text-slate-400 mb-1">What gets pushed</p>
            <p className="text-xs text-slate-600 leading-relaxed">
              Clicking "Push to {crmType}" on an engaged post creates a contact with the author's name, adds a note with their post snippet, your engagement notes, and a link back to the post. Duplicate contacts are handled gracefully — GHL upserts by identity, HubSpot creates a new record.
            </p>
          </div>
        </div>
      )}

      {crmType === 'None' && (
        <p className="text-xs text-slate-600">
          Select a CRM above to connect your account and enable one-click contact creation from the feed.
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
            <p className="text-xs text-slate-500 mb-1">Email</p>
            <p className="text-sm text-white font-medium">{user?.email || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Company</p>
            <p className="text-sm text-white font-medium">{user?.name || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Plan</p>
            <p className="text-sm text-white font-medium">Scout $79 / mo</p>
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
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Current password</label>
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
            <label className="block text-xs font-medium text-slate-400 mb-1.5">New password</label>
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
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Confirm new password</label>
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
            <p className="text-xs font-medium text-slate-300 mb-1">What a team member can do</p>
            <ul className="text-xs text-slate-500 space-y-0.5">
              <li>View and filter all posts in the Scout feed</li>
              <li>Copy AI comment starters and act on leads</li>
              <li>Mark posts as Engaged, Replied, or Skipped</li>
            </ul>
            <p className="text-xs text-slate-600 mt-2">They cannot access Settings, billing, or any account configuration. You can remove their access at any time.</p>
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
                    <p className="text-xs text-slate-500">Feed access only · added {m.createdAt || 'recently'}</p>
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
        {atLimit ? (
          <div className="rounded-xl bg-slate-800/30 border border-slate-700/30 px-4 py-3 text-xs text-slate-500">
            You've reached the limit of 1 team member on this plan. Remove the existing member to invite someone new.
          </div>
        ) : (
          <div>
            {!hasMember && (
              <p className="text-xs font-medium text-slate-400 mb-2">Invite your first team member</p>
            )}
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="teammate@company.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleInvite() }}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <button
                onClick={handleInvite}
                disabled={inviting || !inviteEmail.trim()}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors disabled:opacity-40"
              >
                {inviting ? 'Sending...' : 'Send invite'}
              </button>
            </div>
            <p className="text-xs text-slate-600 mt-2">
              They'll receive an email with their login credentials and a walkthrough of the feed.
            </p>
          </div>
        )}
      </Section>
    </div>
  )
}

// ---- Tab definitions ----
const TABS = [
  { id: 'profile',  label: 'Profile'      },
  { id: 'linkedin', label: 'LinkedIn'     },
  { id: 'ai',       label: 'AI & Scoring' },
  { id: 'system',   label: 'System'       },
  { id: 'account',  label: 'Account'      },
  { id: 'team',     label: 'Team'         },
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
  const [sources, setSources]     = useState<Source[]>([])
  const [loading, setLoading]     = useState(true)
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
                <p className="text-xs text-slate-400 leading-relaxed">All posts come from two LinkedIn sources: <span className="text-slate-300 font-medium">Keyword Search</span> (finds public posts matching your terms) and <span className="text-slate-300 font-medium">ICP Profiles</span> (monitors specific people you're tracking). Configure both below for maximum coverage.</p>
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
              <LinkedInTermsSection sources={sources} onUpdate={fetchSources} />
            )}
            <LinkedInICPSection />
          </>
        )}

        {/* ── AI & Scoring ── */}
        {activeTab === 'ai' && (
          <>
            <Section
              title="Scoring Thresholds"
              description="Every post gets an AI score from 1–10. These thresholds control what happens with it."
            >
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Min score to save',    value: '5 / 10', note: 'Posts below this are dropped entirely — you never see them.' },
                  { label: 'Min score for digest', value: '6 / 10', note: 'Posts at this score or above appear in your daily Slack digest.'  },
                  { label: 'High-value threshold', value: '8 / 10', note: 'Posts here get the green priority badge — engage with these first.'    },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-4">
                    <p className="text-xs text-slate-500 mb-1">{item.label}</p>
                    <p className="text-xl font-bold text-white">{item.value}</p>
                    <p className="text-xs text-slate-600 mt-1">{item.note}</p>
                  </div>
                ))}
              </div>
            </Section>

            <ScoringPromptSection />
          </>
        )}

        {/* ── System ── */}
        {activeTab === 'system' && (
          <div className="space-y-4">
            <SystemStatusSection />
            <SlackIntegrationSection />
            <CRMIntegrationSection />
          </div>
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
    </div>
  )
}
