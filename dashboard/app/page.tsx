'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'

// ---- Types ----
interface Post {
  id: string
  fields: {
    'Post ID': string
    'Platform': string
    'Group Name': string
    'Author Name': string
    'Author Profile URL': string
    'Post Text': string
    'Post URL': string
    'Keywords Matched': string
    'Relevance Score': number
    'Score Reason': string
    'Comment Approach': string
    'Captured At': string
    'Action': string
  }
}

type ActionFilter = 'New' | 'Engaged' | 'Skipped' | 'all'

// ---- Helpers ----
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

// ---- Score Badge ----
function ScoreBadge({ score }: { score: number }) {
  const tier =
    score >= 8
      ? { ring: 'ring-emerald-500/40', bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' }
      : score >= 6
      ? { ring: 'ring-amber-500/40', bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' }
      : { ring: 'ring-blue-500/30', bg: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-400' }
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ring-1 ${tier.ring} ${tier.bg} ${tier.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${tier.dot}`} />
      {score}/10
    </div>
  )
}

// ---- Copy Button ----
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback for older browsers
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }
  return (
    <button
      onClick={handleCopy}
      className={`ml-auto flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-all ${
        copied
          ? 'text-emerald-400 bg-emerald-500/10'
          : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/50'
      }`}
    >
      {copied ? (
        <>
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Copy
        </>
      )}
    </button>
  )
}

// ---- Post Card ----
function PostCard({
  post,
  onAction,
  updating,
}: {
  post: Post
  onAction: (id: string, action: string) => void
  updating: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [angleOpen, setAngleOpen] = useState(false)
  const f = post.fields
  const text = f['Post Text'] || ''
  const score = f['Relevance Score'] || 0
  const action = f['Action'] || 'New'
  const isEngaged = action === 'Engaged'
  const isSkipped = action === 'Skipped'

  const keywords = f['Keywords Matched']
    ? f['Keywords Matched'].split(',').map((k) => k.trim()).filter(Boolean)
    : []

  const date = f['Captured At']
    ? new Date(f['Captured At']).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : ''

  const preview = text.length > 240 ? text.slice(0, 240) + '…' : text
  const platformIcon = f['Platform'] === 'LinkedIn' ? '💼' : '📘'

  return (
    <article
      className={`relative rounded-2xl border transition-all duration-300 ${
        isSkipped
          ? 'opacity-35 bg-[#0d0f14] border-slate-800/30'
          : isEngaged
          ? 'bg-[#0b1810] border-emerald-800/50 ring-1 ring-emerald-900/30'
          : 'bg-[#12151e] border-slate-700/50 hover:border-slate-600/60'
      }`}
    >
      <div className="p-5 sm:p-6">

        {/* Top meta */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <ScoreBadge score={score} />
            <span className="text-xs text-slate-500">
              {platformIcon} {f['Group Name']}
            </span>
            {date && (
              <>
                <span className="text-slate-700 text-xs">·</span>
                <span className="text-xs text-slate-600">{date}</span>
              </>
            )}
          </div>
          {isEngaged && (
            <span className="shrink-0 text-xs text-emerald-500 font-medium flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Engaged
            </span>
          )}
        </div>

        {/* Author */}
        <p className="text-sm font-semibold text-slate-200 mb-2.5">
          {f['Author Profile URL'] ? (
            <a href={f['Author Profile URL']} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
              {f['Author Name']}
            </a>
          ) : f['Author Name']}
        </p>

        {/* Post text */}
        <div className="mb-3">
          <p className="text-sm text-slate-400 leading-relaxed whitespace-pre-line">
            {expanded ? text : preview}
          </p>
          {text.length > 240 && (
            <button onClick={() => setExpanded(!expanded)} className="mt-1 text-xs text-blue-400 hover:text-blue-300 transition-colors">
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>

        {/* Keywords */}
        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {keywords.map((kw) => (
              <span key={kw} className="text-xs px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-500 border border-slate-700/50">
                {kw}
              </span>
            ))}
          </div>
        )}

        {/* Suggested angle — expandable with copy button */}
        {f['Comment Approach'] && (
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAngleOpen(!angleOpen)}
                className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                <svg className={`w-3 h-3 transition-transform duration-150 ${angleOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Suggested comment angle
              </button>
              {/* Copy button always visible — copies even when angle is collapsed */}
              <CopyButton text={f['Comment Approach']} />
            </div>
            {angleOpen && (
              <div className="mt-2 p-3.5 rounded-xl bg-blue-950/40 border border-blue-500/15">
                <p className="text-sm text-slate-300 leading-relaxed italic">
                  &ldquo;{f['Comment Approach']}&rdquo;
                </p>
              </div>
            )}
          </div>
        )}

        {/* Score reason */}
        {f['Score Reason'] && !isSkipped && (
          <p className="text-xs text-slate-600 mb-4 leading-relaxed">{f['Score Reason']}</p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          {f['Post URL'] && (
            <a
              href={f['Post URL']}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-700/60 hover:border-slate-600 text-slate-400 hover:text-slate-300 transition-colors"
            >
              View Post ↗
            </a>
          )}

          {!isSkipped && !isEngaged && (
            <>
              <button
                onClick={() => onAction(post.id, 'Engaged')}
                disabled={updating}
                className="text-xs px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium transition-colors"
              >
                ✓ Engage
              </button>
              <button
                onClick={() => onAction(post.id, 'Skipped')}
                disabled={updating}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-700/60 hover:border-red-700/50 text-slate-500 hover:text-red-400 transition-colors"
              >
                Skip
              </button>
            </>
          )}

          {isEngaged && (
            <button onClick={() => onAction(post.id, 'New')} disabled={updating} className="text-xs px-3 py-1.5 rounded-lg border border-slate-700/60 text-slate-600 hover:text-slate-400 transition-colors">
              Undo
            </button>
          )}
          {isSkipped && (
            <button onClick={() => onAction(post.id, 'New')} disabled={updating} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
              Restore to inbox
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

// ---- Nav ----
function Nav({ lastScrapedAt }: { lastScrapedAt: string | null }) {
  const [tick, setTick] = useState(0)

  // Re-render the "X ago" label every minute
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-[#0a0c10]/95 backdrop-blur-md">
      <div className="max-w-3xl mx-auto px-5 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-xs shrink-0">CB</div>
          <div>
            <p className="text-sm font-semibold text-white leading-tight">ClientBloom Listener</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live · every 3h
              </span>
              {lastScrapedAt && (
                <>
                  <span className="text-slate-700 text-xs">·</span>
                  <span className="text-xs text-slate-500">
                    Last scrape: {timeAgo(lastScrapedAt)}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <nav className="flex items-center gap-1">
          <Link href="/" className="text-xs px-3 py-1.5 rounded-lg font-medium bg-slate-800 text-white transition-colors">Feed</Link>
          <Link href="/settings" className="text-xs px-3 py-1.5 rounded-lg font-medium text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors">Settings</Link>
        </nav>
      </div>
    </header>
  )
}

// ---- Main Feed ----
export default function FeedPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<ActionFilter>('New')
  const [groupFilter, setGroupFilter] = useState('all')
  const [updating, setUpdating] = useState<string | null>(null)
  const [actionCounts, setActionCounts] = useState<Record<string, number>>({})
  const [availableGroups, setAvailableGroups] = useState<string[]>([])
  const [lastScrapedAt, setLastScrapedAt] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())
  const [error, setError] = useState<string | null>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchPosts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ action: filter, limit: '100' })
      if (groupFilter !== 'all') params.set('group', groupFilter)

      const res = await fetch(`/api/posts?${params}`)
      if (!res.ok) throw new Error('Failed to load posts')
      const data = await res.json()

      setPosts(data.records || [])
      if (data.actionCounts) setActionCounts(data.actionCounts)
      if (data.availableGroups) setAvailableGroups(data.availableGroups)
      if (data.lastScrapedAt) setLastScrapedAt(data.lastScrapedAt)
      setLastRefreshed(new Date())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [filter, groupFilter])

  // Initial load + re-fetch when filters change
  useEffect(() => { fetchPosts() }, [fetchPosts])

  // Auto-refresh every 5 minutes (silent — no loading spinner)
  useEffect(() => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
    refreshTimerRef.current = setInterval(() => fetchPosts(true), 5 * 60 * 1000)
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
    }
  }, [fetchPosts])

  const handleAction = async (recordId: string, action: string) => {
    setUpdating(recordId)
    try {
      const res = await fetch(`/api/posts/${recordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (res.ok) {
        const old = posts.find(p => p.id === recordId)?.fields?.Action || 'New'
        setActionCounts(prev => ({
          ...prev,
          [old]: Math.max(0, (prev[old] || 0) - 1),
          [action]: (prev[action] || 0) + 1,
        }))
        // Optimistic update — remove from view after short delay if it no longer matches filter
        setPosts(prev => prev.map(p =>
          p.id === recordId ? { ...p, fields: { ...p.fields, Action: action } } : p
        ))
        if (action !== filter && filter !== 'all') {
          setTimeout(() => {
            setPosts(prev => prev.filter(p => p.id !== recordId))
          }, 500)
        }
      }
    } finally {
      setUpdating(null)
    }
  }

  const tabs: { id: ActionFilter; label: string }[] = [
    { id: 'New', label: 'Inbox' },
    { id: 'Engaged', label: 'Engaged' },
    { id: 'Skipped', label: 'Skipped' },
    { id: 'all', label: 'All' },
  ]

  const tabCounts: Partial<Record<ActionFilter, number>> = {
    New: actionCounts['New'],
    Engaged: actionCounts['Engaged'],
    Skipped: actionCounts['Skipped'],
  }

  return (
    <div className="min-h-screen bg-[#0a0c10] text-white">
      <Nav lastScrapedAt={lastScrapedAt} />

      {/* Tab bar + filters */}
      <div className="sticky top-[61px] z-10 bg-[#0a0c10]/95 backdrop-blur-md border-b border-slate-800/60">
        <div className="max-w-3xl mx-auto px-5">
          <div className="flex items-center gap-0 overflow-x-auto">
            {tabs.map(tab => {
              const count = tabCounts[tab.id]
              return (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id)}
                  className={`shrink-0 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                    filter === tab.id
                      ? 'border-blue-500 text-white'
                      : 'border-transparent text-slate-500 hover:text-slate-400'
                  }`}
                >
                  {tab.label}
                  {count !== undefined && count > 0 && (
                    <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                      filter === tab.id ? 'bg-blue-500/20 text-blue-300' : 'bg-slate-800 text-slate-500'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}

            <div className="ml-auto flex items-center gap-2 py-1.5 shrink-0">
              {/* Group filter */}
              {availableGroups.length > 0 && (
                <select
                  value={groupFilter}
                  onChange={e => setGroupFilter(e.target.value)}
                  className="text-xs bg-slate-800/80 border border-slate-700/60 rounded-lg px-2.5 py-1 text-slate-400 focus:outline-none focus:border-blue-500/50 max-w-[160px] truncate"
                >
                  <option value="all">All groups</option>
                  {availableGroups.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              )}

              <button
                onClick={() => fetchPosts()}
                className="text-xs px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 transition-colors whitespace-nowrap"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-5 py-6">
        {error && (
          <div className="mb-4 p-4 rounded-xl bg-red-900/20 border border-red-700/40 text-red-400 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-5 h-5 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-slate-600 text-sm">Loading posts…</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
            <div className="text-4xl">
              {filter === 'New' ? '🎉' : filter === 'Engaged' ? '📋' : '🗃️'}
            </div>
            <p className="text-slate-300 text-sm font-medium">
              {filter === 'New' ? 'Inbox zero — all caught up' : filter === 'Engaged' ? 'No engaged posts yet' : filter === 'Skipped' ? 'Nothing skipped' : 'No posts found'}
            </p>
            <p className="text-slate-600 text-xs max-w-xs">
              {filter === 'New'
                ? 'New posts arrive every 3 hours. Check back later.'
                : 'Posts you mark will appear here.'}
            </p>
            {lastScrapedAt && (
              <p className="text-slate-700 text-xs">Last scrape: {timeAgo(lastScrapedAt)}</p>
            )}
          </div>
        ) : (
          <>
            {/* Subtle "auto-refreshes" note */}
            <p className="text-xs text-slate-700 mb-4 text-right">
              Auto-refreshes every 5 min · last updated {timeAgo(lastRefreshed.toISOString())}
            </p>
            <div className="space-y-3">
              {posts.map(post => (
                <PostCard
                  key={post.id}
                  post={post}
                  onAction={handleAction}
                  updating={updating === post.id}
                />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
