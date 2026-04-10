'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { isPaidPlan } from '@/lib/tier'
import LandingPage from './page-landing'

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
    'Engagement Status': string
    'Notes': string
    'Notes Updated At': string
    'Notes Updated By': string
    'Engaged By': string
    'Reply Log': string
    'CRM Contact ID': string
    'CRM Pushed At': string
  }
}

type ActionFilter = 'New' | 'Engaged' | 'Replied' | 'Skipped' | 'CRM' | 'all'

interface ReplyLogEntry {
  text: string
  by:   string   // email of who wrote it
  at:   string   // ISO timestamp
}

// ---- Helpers ----
function parseReplyLog(raw: string): ReplyLogEntry[] {
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

// Short display name from email: "mike@brightlink.com" → "mike"
function displayName(email: string): string {
  if (!email) return ''
  return email.split('@')[0]
}

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

// ---- ClientBloom Logo ----
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

// ---- Platform Badge ----
function PlatformBadge({ platform }: { platform: string }) {
  const isLinkedIn = platform === 'LinkedIn'
  return (
    <span
      className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
        isLinkedIn
          ? 'bg-blue-600/20 text-blue-300 ring-1 ring-blue-500/30'
          : 'bg-indigo-600/20 text-indigo-300 ring-1 ring-indigo-500/30'
      }`}
    >
      {isLinkedIn ? (
        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
        </svg>
      ) : (
        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
      )}
      {isLinkedIn ? 'LinkedIn' : 'Facebook'}
    </span>
  )
}

// ---- Score Badge ----
const SCORE_TIERS = [
  { min: 8, label: 'High priority',  desc: 'Strong signal — this person has an active pain or question you can genuinely respond to right now.',          action: 'Comment today.' },
  { min: 6, label: 'Worth engaging', desc: 'Relevant topic, but the opening is softer. A thoughtful comment can still start a real conversation.',         action: 'Comment when you have something specific to say.' },
  { min: 0, label: 'Weak signal',    desc: 'Topic is in the right area but the post doesn\'t give you a natural entry point. Low value to engage with.', action: 'Skip or save for context.' },
]

function ScoreBadge({ score }: { score: number }) {
  const tier =
    score >= 8
      ? { ring: 'ring-emerald-500/40', bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' }
      : score >= 6
      ? { ring: 'ring-amber-500/40',   bg: 'bg-amber-500/10',   text: 'text-amber-400',   dot: 'bg-amber-400'   }
      : { ring: 'ring-blue-500/30',    bg: 'bg-blue-500/10',    text: 'text-blue-400',     dot: 'bg-blue-400'    }

  const info = SCORE_TIERS.find(t => score >= t.min)!

  return (
    <div className="relative group">
      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ring-1 cursor-default ${tier.ring} ${tier.bg} ${tier.text}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${tier.dot}`} />
        {score}/10
      </div>

      {/* Tooltip */}
      <div className="absolute left-0 top-full mt-2 z-30 w-64 pointer-events-none
                      opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <div className="rounded-xl bg-[#1a1d27] border border-slate-700/60 shadow-xl p-3.5 space-y-2">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold ${tier.text}`}>{info.label}</span>
            <span className="text-[11px] text-slate-600">AI relevance score</span>
          </div>
          {/* Scale */}
          <div className="flex items-center gap-1">
            {[1,2,3,4,5,6,7,8,9,10].map(n => (
              <div
                key={n}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  n <= score
                    ? score >= 8 ? 'bg-emerald-400' : score >= 6 ? 'bg-amber-400' : 'bg-blue-400'
                    : 'bg-slate-700'
                }`}
              />
            ))}
          </div>
          {/* Description */}
          <p className="text-xs text-slate-400 leading-relaxed">{info.desc}</p>
          {/* Action nudge */}
          <p className={`text-xs font-medium ${tier.text}`}>{info.action}</p>
        </div>
      </div>
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
  crmType,
  userEmail,
  selected = false,
  selectionMode = false,
  onToggleSelect,
}: {
  post: Post
  onAction: (id: string, action: string) => void
  updating: boolean
  crmType: string
  userEmail: string
  selected?: boolean
  selectionMode?: boolean
  onToggleSelect?: (id: string) => void
}) {
  const [expanded,         setExpanded]         = useState(false)
  const [angleOpen,        setAngleOpen]         = useState(false)
  const [notes,            setNotes]             = useState(post.fields['Notes'] || '')
  const [notesSaved,       setNotesSaved]        = useState(false)
  const [notesDirty,       setNotesDirty]        = useState(false)
  const [notesTs,          setNotesTs]           = useState(post.fields['Notes Updated At'] || '')
  const [notesBy,          setNotesBy]           = useState(post.fields['Notes Updated By'] || '')
  const [replyLog,         setReplyLog]          = useState<ReplyLogEntry[]>(parseReplyLog(post.fields['Reply Log']))
  const [replyEntry,       setReplyEntry]        = useState('')
  const [replyEntrySaving, setReplyEntrySaving]  = useState(false)
  const [crmPushing,       setCrmPushing]        = useState(false)
  const [crmPushed,        setCrmPushed]         = useState(!!post.fields['CRM Pushed At'])
  const [crmError,         setCrmError]          = useState('')
  const [suggestApproach,  setSuggestApproach]   = useState('')
  const [suggestLoading,   setSuggestLoading]    = useState(false)

  const f              = post.fields
  const text           = f['Post Text'] || ''
  const score          = f['Relevance Score'] || 0
  const action         = f['Action'] || 'New'
  const engStatus      = f['Engagement Status'] || ''
  const isEngaged      = action === 'Engaged' && engStatus === ''
  const isReplied      = action === 'Engaged' && engStatus === 'replied'
  const isSkipped      = action === 'Skipped'
  const isActiveEngage = isEngaged || isReplied  // show enriched UI for both

  const keywords = f['Keywords Matched']
    ? f['Keywords Matched'].split(',').map((k) => k.trim()).filter(Boolean)
    : []

  const date = f['Captured At']
    ? new Date(f['Captured At']).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : ''

  const preview  = text.length > 240 ? text.slice(0, 240) + '…' : text
  const platform = f['Platform'] || 'Facebook'

  const handleNotesSave = async () => {
    try {
      await fetch(`/api/posts/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      })
      const now = new Date().toISOString()
      setNotesTs(now)
      setNotesBy(userEmail)
      setNotesSaved(true)
      setNotesDirty(false)
      setTimeout(() => setNotesSaved(false), 3000)
    } catch { /* non-fatal */ }
  }

  const handleAddReplyEntry = async () => {
    if (!replyEntry.trim()) return
    setReplyEntrySaving(true)
    try {
      const resp = await fetch(`/api/posts/${post.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ appendReplyLog: replyEntry.trim() }),
      })
      if (resp.ok) {
        setReplyLog(prev => [...prev, {
          text: replyEntry.trim(),
          by:   userEmail,
          at:   new Date().toISOString(),
        }])
        setReplyEntry('')
      }
    } catch { /* non-fatal */ } finally {
      setReplyEntrySaving(false)
    }
  }

  const handleCrmPush = async () => {
    setCrmPushing(true)
    setCrmError('')
    try {
      const resp = await fetch('/api/crm-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordId:         post.id,
          authorName:       f['Author Name'],
          authorProfileUrl: f['Author Profile URL'],
          postText:         f['Post Text'],
          postUrl:          f['Post URL'],
          platform:         f['Platform'],
          notes,
          engagedAt:        f['Captured At'],
        }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'CRM push failed')
      setCrmPushed(true)
    } catch (e: any) {
      setCrmError(e.message)
    } finally {
      setCrmPushing(false)
    }
  }

  return (
    <article
      onClick={selectionMode ? () => onToggleSelect?.(post.id) : undefined}
      className={`relative rounded-2xl border transition-all duration-300 ${
        selectionMode ? 'cursor-pointer' : ''
      } ${
        selected
          ? 'bg-blue-950/30 border-blue-500/50 ring-1 ring-blue-500/30'
          : isSkipped
          ? 'opacity-35 bg-[#0d0f14] border-slate-800/30'
          : isReplied
          ? 'bg-[#0b1520] border-blue-800/50 ring-1 ring-blue-900/30'
          : isEngaged
          ? 'bg-[#0b1810] border-emerald-800/50 ring-1 ring-emerald-900/30'
          : 'bg-[#12151e] border-slate-700/50 hover:border-slate-600/60'
      }`}
    >
      {/* Selection checkbox */}
      {selectionMode && (
        <div className="absolute top-4 left-4 z-10">
          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
            selected ? 'bg-blue-500 border-blue-500' : 'border-slate-600 bg-slate-800/60'
          }`}>
            {selected && (
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </div>
        </div>
      )}
      <div className={`p-5 sm:p-6 ${selectionMode ? 'pl-12' : ''}`}>

        {/* Top meta */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <ScoreBadge score={score} />
            {date && (
              <>
                <span className="text-slate-700 text-xs">·</span>
                <span className="text-xs text-slate-600">{date}</span>
              </>
            )}
          </div>
          {/* Top-right: platform badge + status */}
          <div className="flex flex-col items-end gap-1 shrink-0">
            <PlatformBadge platform={platform} />
            {isEngaged && (
              <span className="text-xs text-emerald-500 font-medium flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Engaged
              </span>
            )}
            {isReplied && (
              <span className="text-xs text-blue-400 font-medium flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Replied
              </span>
            )}
          </div>
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

        {/* Suggested angle — expandable with copy button, or generate on-demand */}
        {(() => {
          const approach = f['Comment Approach'] || suggestApproach
          if (approach) {
            return (
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
                  <CopyButton text={approach} />
                </div>
                {angleOpen && (
                  <div className="mt-2 p-3.5 rounded-xl bg-blue-950/40 border border-blue-500/15">
                    <p className="text-sm text-slate-300 leading-relaxed italic">
                      &ldquo;{approach}&rdquo;
                    </p>
                  </div>
                )}
              </div>
            )
          }
          // No comment approach yet — show generate button
          return (
            <div className="mb-4">
              <button
                disabled={suggestLoading}
                onClick={async () => {
                  setSuggestLoading(true)
                  setAngleOpen(true)
                  try {
                    const res = await fetch(`/api/posts/${post.id}/suggest`, { method: 'POST' })
                    if (res.ok) {
                      const d = await res.json()
                      if (d.commentApproach) setSuggestApproach(d.commentApproach)
                    }
                  } catch {}
                  setSuggestLoading(false)
                }}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {suggestLoading ? (
                  <>
                    <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Generating comment idea…
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Generate comment idea
                  </>
                )}
              </button>
            </div>
          )
        })()}

        {/* Score reason */}
        {f['Score Reason'] && !isSkipped && (
          <p className="text-xs text-slate-600 mb-4 leading-relaxed">{f['Score Reason']}</p>
        )}

        {/* ── Engagement zone ── */}
        {isActiveEngage && (
          <div className="mt-3 pt-3 border-t border-slate-700/40 space-y-3">

            {/* ── Engaged state: single editable note ── */}
            {isEngaged && (
              <div>
                <p className="text-xs text-slate-500 font-medium mb-1.5">Your notes</p>
                <textarea
                  value={notes}
                  onChange={e => { setNotes(e.target.value); setNotesDirty(true); setNotesSaved(false) }}
                  placeholder="What did you comment? Did they respond? Next step…"
                  rows={2}
                  className="w-full bg-slate-800/50 border border-slate-700/40 rounded-xl px-3 py-2 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500/40 resize-none leading-relaxed"
                />
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-xs text-slate-700">
                    {notesSaved
                      ? `✓ Saved by ${displayName(userEmail)}`
                      : notesTs
                      ? `Saved ${new Date(notesTs).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}${notesBy ? ` · ${displayName(notesBy)}` : ''}`
                      : ''}
                  </span>
                  <button
                    onClick={handleNotesSave}
                    disabled={!notesDirty}
                    className={`text-xs px-3 py-1 rounded-lg transition-colors ${
                      notesDirty
                        ? 'bg-blue-600 hover:bg-blue-500 text-white'
                        : 'bg-slate-800/60 text-slate-600 cursor-default'
                    }`}
                  >
                    Save note
                  </button>
                </div>
              </div>
            )}

            {/* ── Replied state: append-only activity log + CRM push ── */}
            {isReplied && (
              <div>
                <p className="text-xs text-slate-500 font-medium mb-2">Activity log</p>

                {/* Legacy note migrated as first entry if no log entries yet */}
                {replyLog.length === 0 && notes && (
                  <div className="mb-2 rounded-xl bg-slate-800/40 border border-slate-700/30 px-3 py-2.5">
                    <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{notes}</p>
                    {notesTs && (
                      <p className="text-xs text-slate-600 mt-1.5">
                        {new Date(notesTs).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        {notesBy ? ` · ${displayName(notesBy)}` : ''}
                      </p>
                    )}
                  </div>
                )}

                {/* Log entries */}
                {replyLog.map((entry, i) => (
                  <div key={i} className="mb-2 rounded-xl bg-slate-800/40 border border-slate-700/30 px-3 py-2.5">
                    <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{entry.text}</p>
                    <p className="text-xs text-slate-600 mt-1.5">
                      {new Date(entry.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {entry.by ? ` · ${displayName(entry.by)}` : ''}
                    </p>
                  </div>
                ))}

                {/* New entry input */}
                <textarea
                  value={replyEntry}
                  onChange={e => setReplyEntry(e.target.value)}
                  placeholder="Add a note — what happened next? Who responded?"
                  rows={2}
                  className="w-full bg-slate-800/50 border border-slate-700/40 rounded-xl px-3 py-2 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500/40 resize-none leading-relaxed"
                />
                <div className="flex justify-end mt-1.5">
                  <button
                    onClick={handleAddReplyEntry}
                    disabled={replyEntrySaving || !replyEntry.trim()}
                    className={`text-xs px-3 py-1 rounded-lg transition-colors ${
                      replyEntry.trim()
                        ? 'bg-blue-600 hover:bg-blue-500 text-white'
                        : 'bg-slate-800/60 text-slate-600 cursor-default'
                    }`}
                  >
                    {replyEntrySaving ? 'Adding…' : 'Add note'}
                  </button>
                </div>

                {/* CRM push — inside Replied zone */}
                <div className="mt-3 pt-3 border-t border-slate-700/30">
                  {crmType && crmType !== 'None' ? (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleCrmPush}
                        disabled={crmPushing || crmPushed}
                        className={`text-xs px-4 py-2 rounded-lg border font-medium transition-colors flex items-center gap-2 ${
                          crmPushed
                            ? 'border-emerald-500/30 text-emerald-400/70 cursor-default bg-emerald-500/5'
                            : 'border-blue-500/40 bg-blue-600/10 text-blue-300 hover:bg-blue-600/20 disabled:opacity-50'
                        }`}
                      >
                        {crmPushing ? (
                          <>
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Adding to {crmType}…
                          </>
                        ) : crmPushed ? (
                          <>✓ Added to {crmType}</>
                        ) : (
                          <>
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add to {crmType} pipeline
                          </>
                        )}
                      </button>
                      {!crmPushed && (
                        <p className="text-xs text-slate-600">Pushes contact + notes and moves this post to your In CRM tab.</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-600">
                      No CRM connected —{' '}
                      <a href="/settings" className="text-blue-400/70 hover:text-blue-400 underline transition-colors">
                        Connect GHL or HubSpot in Settings → System.
                      </a>
                    </p>
                  )}
                  {crmError && (
                    <p className="text-xs text-red-400 mt-2">{crmError} — <a href="/settings" className="underline">check CRM settings</a></p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions row */}
        <div className="flex items-center gap-2 pt-3 flex-wrap">
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

          {/* Inbox actions */}
          {!isSkipped && !isActiveEngage && (
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

          {/* Engaged actions */}
          {isEngaged && (
            <>
              <button
                onClick={() => onAction(post.id, 'Replied')}
                disabled={updating}
                className="text-xs px-3 py-1.5 rounded-lg border border-blue-500/30 bg-blue-600/10 text-blue-400 hover:bg-blue-600/20 transition-colors"
              >
                They Replied
              </button>
              <button
                onClick={() => onAction(post.id, 'Archived')}
                disabled={updating}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-700/50 text-slate-600 hover:text-slate-400 transition-colors"
              >
                Archive
              </button>
            </>
          )}

          {/* Replied actions */}
          {isReplied && (
            <button
              onClick={() => onAction(post.id, 'Archived')}
              disabled={updating}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-700/50 text-slate-600 hover:text-slate-400 transition-colors"
            >
              Archive
            </button>
          )}

          {/* CRM push for Engaged state (not yet replied) */}
          {isEngaged && crmType && crmType !== 'None' && (
            <button
              onClick={handleCrmPush}
              disabled={crmPushing || crmPushed}
              className={`ml-auto text-xs px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
                crmPushed
                  ? 'border-emerald-500/30 text-emerald-500/70 cursor-default'
                  : 'border-slate-600/50 text-slate-400 hover:text-white hover:border-slate-500 disabled:opacity-50'
              }`}
            >
              {crmPushing ? 'Pushing…' : crmPushed ? `✓ In ${crmType}` : `Push to ${crmType}`}
            </button>
          )}

          {/* Undo / restore */}
          {(isEngaged || isReplied) && (
            <button
              onClick={() => onAction(post.id, 'New')}
              disabled={updating}
              className="text-xs text-slate-700 hover:text-slate-500 transition-colors"
            >
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

// ---- User menu (sign out) ----
function UserMenu() {
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

// ---- Countdown to next scan ----

// Returns the absolute Unix timestamp (ms) of the next scheduled cron fire.
// Cron runs at 6 AM and 6 PM PDT = 13:00 UTC and 01:00 UTC.
function getNextScanTimestamp(): number {
  const now     = new Date()
  const utcH    = now.getUTCHours()
  const utcM    = now.getUTCMinutes()
  const utcS    = now.getUTCSeconds()
  const totalMs = now.getTime()

  // Scan fire times in UTC minutes from midnight
  const scan1Mins = 1 * 60    // 01:00 UTC = 6 PM PDT
  const scan2Mins = 13 * 60   // 13:00 UTC = 6 AM PDT

  const todayMins = utcH * 60 + utcM
  let nextMins: number
  if (todayMins < scan1Mins) {
    nextMins = scan1Mins
  } else if (todayMins < scan2Mins) {
    nextMins = scan2Mins
  } else {
    nextMins = scan1Mins + 24 * 60  // tomorrow 01:00 UTC
  }

  const minsUntil = nextMins - todayMins
  return totalMs + minsUntil * 60 * 1000 - utcS * 1000
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'any moment'
  const totalSecs = Math.floor(ms / 1000)
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// Formats a Unix timestamp as a friendly local time: "6:00 PM" or "6:00 AM"
function formatLocalScanTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

// "today" / "tomorrow" relative to current local date
function scanDayLabel(ts: number): string {
  const scanDate = new Date(ts)
  const today    = new Date()
  return scanDate.toDateString() === today.toDateString() ? 'today' : 'tomorrow'
}

interface NextScanCountdownProps {
  scanStatus?: string | null   // from Scan Health — hides countdown while actively scanning
  lastScanAt?: string | null   // used to detect stuck scans (> 10 min since last completed scan)
  plan?: string                // user plan — adds cadence note for single-scan plans
}

function NextScanCountdown({ scanStatus, lastScanAt, plan = '' }: NextScanCountdownProps) {
  const [nextTs, setNextTs] = useState(() => getNextScanTimestamp())

  useEffect(() => {
    const id = setInterval(() => setNextTs(getNextScanTimestamp()), 1000)
    return () => clearInterval(id)
  }, [])

  // While a scan is actively running, replace the countdown with a status note
  // so users don't see contradictory "Scanning…" and "Next scan in 11h" at the same time.
  // Exception: if the scan appears stuck (> STUCK_SCANNING_MS since last completed scan),
  // fall through to the normal countdown so the user gets useful timing info.
  const isStuckScanning = scanStatus === 'scanning' && lastScanAt
    ? (Date.now() - new Date(lastScanAt).getTime()) > STUCK_SCANNING_MS
    : false

  if (scanStatus === 'scanning' && !isStuckScanning) {
    return (
      <span className="text-xs text-blue-400/70">
        Scan running · new posts appear automatically
      </span>
    )
  }

  const msUntil   = nextTs - Date.now()
  const localTime = formatLocalScanTime(nextTs)
  const dayLabel  = scanDayLabel(nextTs)

  // Plan cadence note — explains WHY the next scan is when it is.
  // Trial/Starter get 1 scan/day; Pro gets 2. This saves the user from wondering
  // "why isn't it scanning more often?" or "why does it show 11h away?".
  const isSingleScanPlan = plan === 'Trial' || plan === 'Starter'
  const cadenceNote = isSingleScanPlan
    ? <span className="text-slate-600 ml-1.5">· {plan} plan · 1 scan/day</span>
    : null

  return (
    <span className="text-xs text-slate-600">
      Next scan: <span className="text-slate-400 font-medium">{dayLabel} at {localTime}</span>
      <span className="text-slate-700 tabular-nums ml-1.5">· {formatCountdown(msUntil)}</span>
      {cadenceNote}
    </span>
  )
}

// ---- Nav ----
interface ScanHealth {
  lastScanAt:        string | null
  lastScanStatus:    string | null
  lastPostsFound:    number
  fbPending:         boolean
  lastScanBreakdown: Record<string, number> | null
}

// If status is 'scanning' but the previous scan completed more than this long
// ago, the scan-tenant worker has definitely finished (maxDuration = 300s) —
// the final status write just failed silently. Treat as success so users see
// "Last scan: Xh ago" instead of a perpetually spinning indicator.
const STUCK_SCANNING_MS = 10 * 60 * 1000

// Overdue threshold: how long since last scan before we surface a warning.
// Single-scan plans (Trial/Starter) run once/day — overdue after ~26h.
// Pro plans run twice/day — overdue after 14h (12h interval + 2h grace).
function scanOverdueMs(plan: string): number {
  const isSingleScanPlan = plan === 'Trial' || plan === 'Starter'
  return isSingleScanPlan ? 26 * 60 * 60 * 1000 : 14 * 60 * 60 * 1000
}

function ScanStatusPill({
  health,
  lastScannedAt,
  plan = '',
}: {
  health: ScanHealth | null
  lastScannedAt: string | null
  plan?: string
}) {
  // Determine display state from scan health (preferred) or fallback to lastScannedAt from posts
  const scanAt = health?.lastScanAt || lastScannedAt
  const status = health?.lastScanStatus

  if (status === 'scanning') {
    // Client-side stuck-scanning detection: if the last completed scan is older
    // than STUCK_SCANNING_MS, the worker has definitely finished — only the
    // status write failed. Render as a normal success state so users aren't
    // alarmed. The watchdog will reset the backend field within the hour.
    const isStuck = scanAt
      ? (Date.now() - new Date(scanAt).getTime()) > STUCK_SCANNING_MS
      : false

    if (isStuck) {
      // Fall through to the success rendering below using the last known scanAt
    } else {
      return (
        <span className="text-xs text-blue-400 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          Scanning…
        </span>
      )
    }
  }

  if (status === 'pending_fb' || health?.fbPending) {
    return (
      <span className="text-xs text-amber-400 flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        {scanAt ? `LinkedIn scan running…` : 'Scanning…'}
      </span>
    )
  }

  if (status === 'failed') {
    return (
      <span className="text-xs text-red-400 flex items-center gap-1" title="Last scan encountered an error. Retry is scheduled.">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
        {scanAt ? `Scan issue · retrying · ${timeAgo(scanAt)}` : 'Scan issue · retrying'}
      </span>
    )
  }

  if (scanAt) {
    // Check if the scan is overdue using a plan-aware threshold.
    // For Trial/Starter (1 scan/day) a scan 12h old is completely normal.
    const scanAge = Date.now() - new Date(scanAt).getTime()
    const isOverdue = scanAge > scanOverdueMs(plan)

    if (isOverdue) {
      return (
        <span
          className="text-xs text-amber-400 flex items-center gap-1"
          title="Scan is overdue. The watchdog will automatically retry within the hour."
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          Scan overdue · {timeAgo(scanAt)} · auto-recovery active
        </span>
      )
    }

    const postsFound = health?.lastPostsFound ?? null
    const postsLabel = postsFound !== null
      ? postsFound === 0
        ? ' · 0 new posts'
        : ` · ${postsFound} new post${postsFound !== 1 ? 's' : ''}`
      : ''
    return (
      <span className="text-xs text-emerald-400 flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        Last scan: {timeAgo(scanAt)}{postsLabel}
      </span>
    )
  }

  // Fallback — no scan data yet
  const cadence = plan === 'Trial' || plan === 'Starter' ? '1×/day' : '2×/day'
  return (
    <span className="text-xs text-slate-500 flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-600 animate-pulse" />
      Live · {cadence}
    </span>
  )
}

function Nav({ lastScannedAt, scanHealth }: { lastScannedAt: string | null; scanHealth: ScanHealth | null }) {
  const [tick, setTick] = useState(0)
  const { data: session } = useSession()
  const isFeedOnly = (session?.user as any)?.isFeedOnly ?? false
  const plan        = (session?.user as any)?.plan       || ''
  const trialEndsAt = (session?.user as any)?.trialEndsAt || null
  const isTrial     = plan === 'Trial'
  const trialMsLeft = trialEndsAt ? new Date(trialEndsAt).getTime() - Date.now() : null
  const trialExpired = trialMsLeft !== null && trialMsLeft <= 0
  // Math.floor: shows "6d 14h left" on day 2, not "7 days left".
  const daysLeft    = trialMsLeft !== null && !trialExpired
    ? Math.floor(trialMsLeft / 86_400_000)
    : null
  const hoursLeft   = trialMsLeft !== null && !trialExpired
    ? Math.floor((trialMsLeft % 86_400_000) / 3_600_000)
    : 0

  // Re-render time-ago labels every minute
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(id)
  }, [])

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
        <div className="flex items-center gap-3 min-w-0">
          <ClientBloomMark size={28} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white leading-tight">Scout by ClientBloom</p>
            <ScanStatusPill health={scanHealth} lastScannedAt={lastScannedAt} plan={plan} />
          </div>
        </div>
        <nav className="flex items-center gap-1 shrink-0 pl-3">
          <Link href="/" className="text-xs px-3 py-1.5 rounded-lg font-medium bg-slate-800 text-white transition-colors">Feed</Link>
          {!isFeedOnly && (
            <Link href="/settings" className="text-xs px-3 py-1.5 rounded-lg font-medium text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors">Settings</Link>
          )}
          <UserMenu />
        </nav>
      </div>
      </div>
    </header>
  )
}

// ── Types for history ─────────────────────────────────────────────────────────
interface DaySnapshot {
  date:     string
  surfaced: number
  engaged:  number
  replied:  number
  crm:      number
}

// ── Sparkline chart ───────────────────────────────────────────────────────────
function MomentumSparkline({ history }: { history: DaySnapshot[] }) {
  const [period, setPeriod]       = useState<7 | 14 | 30>(14)
  const [hoveredIdx, setHovered]  = useState<number | null>(null)
  const [tooltipX, setTooltipX]   = useState(0)
  const containerRef              = useRef<HTMLDivElement>(null)

  const DAYS    = period
  const BAR_W   = period === 7 ? 18 : period === 14 ? 10 : 6
  const BAR_GAP = period === 7 ? 5  : period === 14 ? 3  : 2
  const H       = 44
  const today   = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })

  // Build full window ending today
  type DayPoint = { date: string; delta: number; engaged: number; replied: number; crm: number; isToday: boolean }
  const days: DayPoint[] = []
  for (let i = DAYS - 1; i >= 0; i--) {
    const d   = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
    const idx = history.findIndex(s => s.date === key)
    let delta = 0, eng = 0, rep = 0, crm = 0
    if (idx > 0) {
      const cur  = history[idx]
      const prev = history[idx - 1]
      eng   = Math.max(0, cur.engaged - prev.engaged)
      rep   = Math.max(0, cur.replied - prev.replied)
      crm   = Math.max(0, cur.crm     - prev.crm)
      delta = eng + rep * 2 + crm
    } else if (idx === 0) {
      eng   = history[0].engaged
      rep   = history[0].replied
      crm   = history[0].crm
      delta = eng + rep * 2 + crm
    }
    days.push({ date: key, delta, engaged: eng, replied: rep, crm, isToday: key === today })
  }

  const maxDelta   = Math.max(1, ...days.map(d => d.delta))
  const peakIdx    = days.reduce((best, d, i) => d.delta > days[best].delta ? i : best, 0)

  // Trend: compare current period total vs previous period of same length
  const currentTotal  = days.reduce((s, d) => s + d.delta, 0)
  const prevDays: DayPoint[] = []
  for (let i = DAYS * 2 - 1; i >= DAYS; i--) {
    const d   = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
    const idx = history.findIndex(s => s.date === key)
    let delta = 0
    if (idx > 0) {
      const cur  = history[idx]
      const prev = history[idx - 1]
      delta = Math.max(0, (cur.engaged - prev.engaged) + (cur.replied - prev.replied) * 2 + (cur.crm - prev.crm))
    }
    prevDays.push({ date: key, delta, engaged: 0, replied: 0, crm: 0, isToday: false })
  }
  const prevTotal = prevDays.reduce((s, d) => s + d.delta, 0)
  const trendPct  = prevTotal === 0 ? null : Math.round(((currentTotal - prevTotal) / prevTotal) * 100)

  const svgW    = DAYS * BAR_W + (DAYS - 1) * BAR_GAP
  const dayLabels = ['S','M','T','W','T','F','S']

  // Tooltip content for hovered bar
  const hovered = hoveredIdx !== null ? days[hoveredIdx] : null
  const tooltipDate = hovered
    ? new Date(hovered.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : ''

  return (
    <div className="mt-3 pt-3 border-t border-slate-800/60">
      {/* Header row: period tabs + trend */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1">
          {([7, 14, 30] as const).map(p => (
            <button
              key={p}
              onClick={() => { setPeriod(p); setHovered(null) }}
              className={`text-[11px] px-2 py-0.5 rounded-full transition-colors ${
                period === p
                  ? 'bg-slate-700 text-slate-200'
                  : 'text-slate-600 hover:text-slate-400'
              }`}
            >
              {p}D
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {trendPct !== null && currentTotal > 0 && (
            <span className={`text-[11px] font-medium ${
              trendPct > 5  ? 'text-emerald-400' :
              trendPct < -5 ? 'text-red-400' :
              'text-slate-500'
            }`}>
              {trendPct > 0 ? `↑${trendPct}%` : trendPct < 0 ? `↓${Math.abs(trendPct)}%` : '→ flat'}
              <span className="text-slate-600 font-normal"> vs prev</span>
            </span>
          )}
          <span className="text-[11px] text-slate-600">per day</span>
        </div>
      </div>

      {/* Chart container — position:relative so tooltip can be absolute */}
      <div ref={containerRef} className="relative select-none">
        <svg
          width="100%"
          viewBox={`0 0 ${svgW} ${H + 14}`}
          preserveAspectRatio="none"
          className="overflow-visible"
          style={{ display: 'block' }}
          onMouseLeave={() => setHovered(null)}
        >
          <defs>
            <filter id="glow-bar" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="glow-bar-strong" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="glow-bar-peak" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <linearGradient id="bar-grad-hi" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" /><stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
            <linearGradient id="bar-grad-mid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#60a5fa" /><stop offset="100%" stopColor="#818cf8" />
            </linearGradient>
            <linearGradient id="bar-grad-today" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a78bfa" /><stop offset="100%" stopColor="#6366f1" />
            </linearGradient>
            <linearGradient id="bar-grad-hover" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f9fafb" /><stop offset="100%" stopColor="#94a3b8" />
            </linearGradient>
          </defs>

          {days.map((day, i) => {
            const x         = i * (BAR_W + BAR_GAP)
            const pct       = day.delta / maxDelta
            const minH      = 3
            const barH      = day.delta === 0 ? minH : Math.max(minH, Math.round(pct * H))
            const y         = H - barH
            const isHigh    = pct >= 0.6
            const isMid     = pct >= 0.2
            const isPeak    = i === peakIdx && day.delta > 0
            const isHov     = i === hoveredIdx
            const fill      = isHov             ? 'url(#bar-grad-hover)'
                            : day.isToday       ? 'url(#bar-grad-today)'
                            : isPeak            ? 'url(#bar-grad-hi)'
                            : isHigh            ? 'url(#bar-grad-hi)'
                            : isMid             ? 'url(#bar-grad-mid)'
                            : '#1e293b'
            const opacity   = day.delta === 0 && !isHov ? 0.35 : 1
            const filter    = isHov ? 'url(#glow-bar)' : isPeak ? 'url(#glow-bar-peak)' : isHigh ? 'url(#glow-bar-strong)' : isMid ? 'url(#glow-bar)' : undefined
            const weekDay   = new Date(day.date + 'T12:00:00').getDay()
            const labelTxt  = dayLabels[weekDay]
            const hitX      = x - 2
            const hitW      = BAR_W + 4

            return (
              <g key={day.date} opacity={opacity}>
                <rect x={x} y={y} width={BAR_W} height={barH} rx={2.5} fill={fill} filter={filter} />
                {/* Invisible wider hit area for easier hover */}
                <rect
                  x={hitX} y={0} width={hitW} height={H + 14}
                  fill="transparent"
                  onMouseEnter={(e) => {
                    setHovered(i)
                    // Compute tooltip x as fraction of container width
                    const rect = containerRef.current?.getBoundingClientRect()
                    if (rect) {
                      const barCenterFrac = (x + BAR_W / 2) / svgW
                      setTooltipX(barCenterFrac * 100)
                    }
                  }}
                />
                <text
                  x={x + BAR_W / 2}
                  y={H + 12}
                  textAnchor="middle"
                  fontSize="6"
                  fill={isHov ? '#e2e8f0' : day.isToday ? '#a78bfa' : '#374151'}
                  fontFamily="system-ui, sans-serif"
                >
                  {labelTxt}
                </text>
              </g>
            )
          })}
        </svg>

        {/* Hover tooltip */}
        {hovered && (
          <div
            className="absolute bottom-full mb-1 pointer-events-none z-20"
            style={{
              left: `${tooltipX}%`,
              transform: 'translateX(-50%)',
              minWidth: '110px',
            }}
          >
            <div className="bg-slate-800 border border-slate-700/80 rounded-lg px-2.5 py-1.5 shadow-xl">
              <div className="text-[11px] text-slate-400 mb-1 whitespace-nowrap">{tooltipDate}</div>
              {hovered.delta === 0 ? (
                <div className="text-[12px] text-slate-500">No activity</div>
              ) : (
                <div className="space-y-0.5">
                  {hovered.engaged > 0 && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] text-blue-400">Engaged</span>
                      <span className="text-[12px] font-semibold text-blue-300">{hovered.engaged}</span>
                    </div>
                  )}
                  {hovered.replied > 0 && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] text-emerald-400">Replied</span>
                      <span className="text-[12px] font-semibold text-emerald-300">{hovered.replied}</span>
                    </div>
                  )}
                  {hovered.crm > 0 && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] text-violet-400">CRM</span>
                      <span className="text-[12px] font-semibold text-violet-300">{hovered.crm}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Engagement Momentum Widget ─────────────────────────────────────────────
function MomentumWidget({
  actionCounts,
  history,
}: {
  actionCounts: Record<string, number>
  history:      DaySnapshot[]
}) {
  const totalNew     = actionCounts['New']     || 0
  const totalEngaged = actionCounts['Engaged'] || 0
  const totalReplied = actionCounts['Replied'] || 0
  const totalSkipped = actionCounts['Skipped'] || 0
  const totalCRM     = actionCounts['CRM']     || 0

  const totalSurfaced = totalNew + totalEngaged + totalReplied + totalSkipped + totalCRM
  const totalActed    = totalEngaged + totalReplied + totalCRM

  if (totalSurfaced === 0) return null

  const engagementPct = Math.round((totalActed / totalSurfaced) * 100)

  // Relationship Score (0–100): climbs as you consistently engage.
  // Replied counts double — it means the conversation went somewhere.
  const rawScore = ((totalEngaged + totalReplied * 2) / Math.max(1, totalSurfaced)) * 150
  const relationshipScore = Math.min(100, Math.round(rawScore))

  const momentumTier = (() => {
    if (relationshipScore >= 70) return { label: 'Strong momentum', color: 'text-emerald-400', barColor: 'from-emerald-500 to-teal-400' }
    if (relationshipScore >= 35) return { label: 'Building momentum', color: 'text-blue-400',   barColor: 'from-blue-500 to-emerald-400' }
    if (relationshipScore >= 10) return { label: 'Getting started',   color: 'text-amber-400',  barColor: 'from-amber-500 to-blue-400' }
    return                               { label: 'Ready to engage',  color: 'text-slate-500',  barColor: 'from-slate-600 to-slate-500' }
  })()

  return (
    <div className="mb-5 bg-[#0f1117] border border-slate-800/60 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Engagement Momentum</span>
        <span className={`text-xs font-medium ${momentumTier.color}`}>{momentumTier.label}</span>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3">
        {([
          { label: 'Surfaced',  value: String(totalSurfaced), color: 'text-white'         },
          { label: 'Engaged',   value: String(totalEngaged),  color: 'text-blue-400'      },
          { label: 'Replied',   value: String(totalReplied),  color: 'text-emerald-400'   },
          { label: 'Rate',      value: `${engagementPct}%`,   color: engagementPct >= 20 ? 'text-emerald-400' : 'text-slate-400' },
        ] as const).map((stat, i) => (
          <div key={i} className="text-center py-1">
            <div className={`text-xl font-bold leading-tight ${stat.color}`}>{stat.value}</div>
            <div className="text-[12px] text-slate-500 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Momentum bar */}
      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${momentumTier.barColor} transition-all duration-700 ease-out`}
          style={{ width: `${Math.max(2, relationshipScore)}%` }}
        />
      </div>

      {totalActed === 0 ? (
        <p className="text-[12px] text-slate-600 mt-2 leading-snug">
          Engage with posts below to start building your score — every comment puts you in front of the right people.
        </p>
      ) : (
        <p className="text-[12px] text-slate-600 mt-2 leading-snug">
          {totalReplied > 0
            ? `${totalReplied} conversation${totalReplied !== 1 ? 's' : ''} started · ${totalNew} post${totalNew !== 1 ? 's' : ''} in queue`
            : `${totalEngaged} engagement${totalEngaged !== 1 ? 's' : ''} recorded · keep going — replies are where relationships begin`}
        </p>
      )}

      {/* 14-day sparkline — only rendered once history is populated */}
      {history.length >= 1 && <MomentumSparkline history={history} />}
    </div>
  )
}

// ── Scout Agent types ────────────────────────────────────────────────────────

interface AgentChatMessage {
  role:    'user' | 'assistant'
  content: string
}

interface AgentAction {
  type:    'bulk_skip' | 'bulk_archive' | 'bulk_restore' | 'set_min_score' | 'none'
  filter?: { maxScore?: number; currentAction?: string }
  minScore?: number
  confirm:  boolean
  summary:  string
}

interface AgentResponse {
  reply:   string
  action?: AgentAction
}

// ── Scout Agent Panel ────────────────────────────────────────────────────────

function ScoutAgentPanel({
  open,
  onClose,
  inboxCount,
  skippedCount,
  topPosts,
  scoreDistribution,
  onExecuteAction,
}: {
  open:              boolean
  onClose:           () => void
  inboxCount:        number
  skippedCount:      number
  topPosts:          { id: string; author: string; score: number; text: string }[]
  scoreDistribution: { high: number; mid: number; low: number }
  onExecuteAction:   (action: AgentAction) => Promise<void>
}) {
  const [messages,       setMessages]       = useState<AgentChatMessage[]>([])
  const [input,          setInput]          = useState('')
  const [loading,        setLoading]        = useState(false)
  const [pendingAction,  setPendingAction]  = useState<AgentAction | null>(null)
  const [pendingReply,   setPendingReply]   = useState('')
  const [executing,      setExecuting]      = useState(false)
  const [execResult,     setExecResult]     = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, pendingAction])

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150)
  }, [open])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setExecResult(null)

    const userMsg: AgentChatMessage = { role: 'user', content: text }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setLoading(true)
    setPendingAction(null)

    try {
      const res = await fetch('/api/inbox-agent', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          message: text,
          context: { inboxCount, skippedCount, topPosts, scoreDistribution },
          history: messages.slice(-6),
        }),
      })

      const data: AgentResponse = await res.json()
      const assistantMsg: AgentChatMessage = { role: 'assistant', content: data.reply }
      setMessages(prev => [...prev, assistantMsg])

      if (data.action && data.action.type !== 'none') {
        if (data.action.confirm) {
          setPendingAction(data.action)
          setPendingReply(data.reply)
        } else {
          // Auto-execute non-destructive actions like set_min_score
          setExecuting(true)
          await onExecuteAction(data.action)
          setExecuting(false)
          setExecResult(`Done: ${data.action.summary}`)
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I ran into an error. Try again?" }])
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async () => {
    if (!pendingAction) return
    setExecuting(true)
    setPendingAction(null)
    try {
      await onExecuteAction(pendingAction)
      setExecResult(`Done: ${pendingAction.summary}`)
    } catch {
      setExecResult('Action failed — please try again.')
    } finally {
      setExecuting(false)
    }
  }

  const handleDismissAction = () => {
    setPendingAction(null)
    setMessages(prev => [...prev, { role: 'assistant', content: "No worries — let me know if you change your mind." }])
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed bottom-20 right-5 z-50 w-80 sm:w-96 flex flex-col bg-[#0d1017] border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden"
           style={{ height: '480px' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-white">Scout Agent</span>
            <span className="text-xs text-slate-600">AI inbox assistant</span>
          </div>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-400 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && !loading && (
            <div className="text-center py-6">
              <p className="text-xs text-slate-500 leading-relaxed mb-3">
                I can help you clear inbox noise, skip low-score posts, and surface what matters most.
              </p>
              <div className="flex flex-col gap-1.5">
                {[
                  'What should I engage with today?',
                  'Clear everything below score 5',
                  'How many high-priority posts do I have?',
                ].map(s => (
                  <button key={s} onClick={() => { setInput(s) }} className="text-left text-xs px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/40 text-slate-400 hover:text-slate-200 hover:border-slate-600/60 transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-blue-600/20 border border-blue-500/20 text-slate-200'
                  : 'bg-slate-800/60 border border-slate-700/40 text-slate-300'
              }`}>
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-800/60 border border-slate-700/40 px-3 py-2 rounded-xl">
                <div className="flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          {/* Pending action confirmation */}
          {pendingAction && (
            <div className="rounded-xl bg-amber-950/40 border border-amber-500/20 p-3 space-y-2">
              <p className="text-xs text-amber-300 font-medium">{pendingAction.summary}</p>
              <div className="flex gap-2">
                <button
                  onClick={handleConfirm}
                  disabled={executing}
                  className="flex-1 text-xs py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium transition-colors disabled:opacity-60"
                >
                  {executing ? 'Running…' : 'Confirm'}
                </button>
                <button
                  onClick={handleDismissAction}
                  disabled={executing}
                  className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {execResult && (
            <div className="text-center">
              <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">{execResult}</span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-3 pb-3 pt-2 border-t border-slate-800">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              placeholder="Ask Scout Agent…"
              rows={1}
              className="flex-1 bg-slate-800/60 border border-slate-700/40 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/40 resize-none leading-relaxed"
              style={{ minHeight: '36px', maxHeight: '80px' }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="shrink-0 w-8 h-8 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            >
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ---- Root: route between landing page and authenticated dashboard ----
export default function RootPage() {
  const { status } = useSession()

  // Minimal dark fill while session resolves — avoids white flash
  if (status === 'loading') {
    return <div className="min-h-screen bg-[#080a0f]" />
  }

  if (status === 'unauthenticated') {
    return <LandingPage />
  }

  return <FeedPage />
}

// ---- Main Feed ----
function FeedPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const userEmail   = (session?.user as any)?.email || ''
  const plan        = (session?.user as any)?.plan  || ''
  const crmUnlocked = plan === 'Scout Agency' || plan === 'Owner'
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<ActionFilter>('New')

  const [updating, setUpdating] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionCounts, setActionCounts] = useState<Record<string, number>>({})
  const [lastScannedAt, setLastScrapedAt] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())
  const [error, setError] = useState<string | null>(null)
  const [crmType, setCrmType] = useState('None')
  const [scanHealth, setScanHealth] = useState<ScanHealth | null>(null)
  const [momentumHistory, setMomentumHistory] = useState<DaySnapshot[]>([])
  const [trialExpiredGate, setTrialExpiredGate] = useState(false)
  const historySyncedRef = useRef(false)
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Bulk selection state
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading]     = useState(false)
  const [bulkResult, setBulkResult]       = useState<string | null>(null)

  // Scout Agent state
  const [agentOpen, setAgentOpen] = useState(false)

  // Trial expiry gate — show overlay modal instead of hard-redirecting so the
  // user can see what they are missing behind the gate before choosing a plan.
  useEffect(() => {
    const plan        = (session?.user as any)?.plan || ''
    const trialEndsAt = (session?.user as any)?.trialEndsAt || null
    if (!isPaidPlan(plan) && trialEndsAt && new Date() > new Date(trialEndsAt)) {
      setTrialExpiredGate(true)
    }
  }, [session])

  // First-run: redirect to onboarding if the tenant hasn't completed setup.
  // Uses the JWT `onboarded` field (set from Airtable at sign-in and updated
  // mid-session via NextAuth update() after onboarding completes — no API call,
  // no timeout race, no localStorage dependency).
  useEffect(() => {
    if (status !== 'authenticated') return
    const sessionOnboarded = (session?.user as any)?.onboarded ?? false
    if (!sessionOnboarded) {
      router.push('/onboarding')
    }
  }, [status, session, router])

  const fetchPosts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ action: filter, limit: '100' })

      const res = await fetch(`/api/posts?${params}`)
      if (!res.ok) throw new Error('Failed to load posts')
      const data = await res.json()

      setPosts(data.records || [])
      if (data.actionCounts) setActionCounts(data.actionCounts)

      if (data.lastScannedAt) setLastScrapedAt(data.lastScannedAt)
      setLastRefreshed(new Date())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [filter])

  // Initial load + re-fetch when filters change
  useEffect(() => { fetchPosts() }, [fetchPosts])

  // Clear selection state whenever the user switches tabs.
  // Without this, IDs selected in tab A would survive into tab B and a
  // bulk action would affect posts the user cannot even see.
  useEffect(() => {
    setSelectedIds(new Set())
    setSelectionMode(false)
    setBulkResult(null)
  }, [filter])

  // Fetch CRM type once on mount (for Push button label)
  useEffect(() => {
    fetch('/api/crm-settings')
      .then(r => r.json())
      .then(d => setCrmType(d.crmType || 'None'))
      .catch(() => {})
  }, [])

  // Fetch scan health on mount + every 3 minutes
  // Also re-poll every 30s while a Facebook run is pending (fbPending)
  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval> | null = null

    const fetchHealth = async () => {
      try {
        const res = await fetch('/api/scan-status')
        if (!res.ok) return
        const data = await res.json()
        setScanHealth(data)

        // If Facebook is still collecting, poll faster (30s) until it's done
        if (data.fbPending) {
          if (!pollInterval) {
            pollInterval = setInterval(fetchHealth, 30 * 1000)
          }
        } else {
          if (pollInterval) {
            clearInterval(pollInterval)
            pollInterval = null
          }
        }
      } catch { /* non-fatal */ }
    }

    fetchHealth()
    const baseInterval = setInterval(fetchHealth, 3 * 60 * 1000)

    return () => {
      clearInterval(baseInterval)
      if (pollInterval) clearInterval(pollInterval)
    }
  }, [])

  // Auto-refresh every 5 minutes (silent — no loading spinner)
  useEffect(() => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
    refreshTimerRef.current = setInterval(() => fetchPosts(true), 5 * 60 * 1000)
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
    }
  }, [fetchPosts])

  // Fetch momentum history on mount (for sparkline)
  useEffect(() => {
    fetch('/api/engagement-history')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.history)) setMomentumHistory(d.history) })
      .catch(() => {})
  }, [])

  // Sync today's snapshot once per session when actionCounts is first populated
  useEffect(() => {
    if (historySyncedRef.current) return
    const totalSurfaced =
      (actionCounts['New']     || 0) +
      (actionCounts['Engaged'] || 0) +
      (actionCounts['Replied'] || 0) +
      (actionCounts['Skipped'] || 0) +
      (actionCounts['CRM']     || 0)
    if (totalSurfaced === 0) return
    historySyncedRef.current = true
    fetch('/api/engagement-history', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        surfaced: totalSurfaced,
        engaged:  actionCounts['Engaged'] || 0,
        replied:  actionCounts['Replied'] || 0,
        crm:      actionCounts['CRM']     || 0,
      }),
    })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.history)) setMomentumHistory(d.history) })
      .catch(() => {})
  }, [actionCounts])

  const handleAction = async (recordId: string, action: string) => {
    setUpdating(recordId)
    setActionError(null)
    try {
      const res = await fetch(`/api/posts/${recordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (res.ok) {
        const existingPost = posts.find(p => p.id === recordId)
        const old = existingPost?.fields?.Action || 'New'
        const oldEngStatus = existingPost?.fields?.['Engagement Status'] || ''

        // Update tab counts — mirror how the server categorises each state
        const countKey = (a: string, es: string) =>
          a === 'Engaged' && es === 'replied' ? 'Replied'
          : a === 'Engaged'                   ? 'Engaged'
          : a

        setActionCounts(prev => ({
          ...prev,
          [countKey(old, oldEngStatus)]: Math.max(0, (prev[countKey(old, oldEngStatus)] || 0) - 1),
          [action === 'Replied' ? 'Replied' : action === 'Archived' ? 'Archived' : action]:
            (prev[action === 'Replied' ? 'Replied' : action === 'Archived' ? 'Archived' : action] || 0) + 1,
        }))

        // Optimistic field update — mirror exactly what the server writes
        // so isEngaged / isReplied / isSkipped flags stay correct
        let newAction    = action
        let newEngStatus = ''
        if (action === 'Replied') {
          newAction    = 'Engaged'
          newEngStatus = 'replied'
        } else if (action === 'Archived') {
          newAction    = old          // server keeps Action unchanged for Archived
          newEngStatus = 'archived'
        }

        setPosts(prev => prev.map(p =>
          p.id === recordId
            ? { ...p, fields: { ...p.fields, Action: newAction, 'Engagement Status': newEngStatus } }
            : p
        ))

        // Remove from view after short delay if the post no longer belongs in this tab
        if (action !== filter && filter !== 'all') {
          setTimeout(() => {
            setPosts(prev => prev.filter(p => p.id !== recordId))
          }, 500)
        }
      } else {
        let msg = `Action failed (HTTP ${res.status})`
        try { const d = await res.json(); if (d.error) msg = d.error } catch {}
        console.error('[Scout] handleAction PATCH failed:', res.status, msg)
        setActionError(msg)
      }
    } catch (e: any) {
      console.error('[Scout] handleAction fetch error:', e)
      setActionError('Network error — check your connection and try again.')
    } finally {
      setUpdating(null)
    }
  }

  // ── Selection helpers ────────────────────────────────────────────────────────

  const toggleSelectPost = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === posts.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(posts.map(p => p.id)))
    }
  }, [posts, selectedIds.size])

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false)
    setSelectedIds(new Set())
    setBulkResult(null)
  }, [])

  // ── Bulk action handler (selection toolbar + agent) ───────────────────────

  const handleBulkAction = useCallback(async (
    action: 'skip' | 'archive' | 'restore',
    opts?: { recordIds?: string[]; filter?: { maxScore?: number; currentAction?: string } }
  ) => {
    setBulkLoading(true)
    setBulkResult(null)
    try {
      const body: Record<string, any> = { action }
      if (opts?.recordIds && opts.recordIds.length > 0) {
        body.recordIds = opts.recordIds
      } else if (opts?.filter) {
        body.filter = opts.filter
      }

      const res = await fetch('/api/posts/bulk', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const data = await res.json()

      if (data.ok) {
        setBulkResult(`${data.affected} post${data.affected !== 1 ? 's' : ''} updated`)
        // Re-fetch to reflect changes
        await fetchPosts(true)
        setSelectedIds(new Set())
        setSelectionMode(false)
      } else {
        setBulkResult(`Error: ${data.error || 'Unknown error'}`)
      }
    } catch {
      setBulkResult('Network error — please try again')
    } finally {
      setBulkLoading(false)
    }
  }, [fetchPosts])

  // ── Agent action executor (called by ScoutAgentPanel) ────────────────────

  const executeAgentAction = useCallback(async (agentAction: AgentAction) => {
    if (agentAction.type === 'none' || agentAction.type === 'set_min_score') return
    const bulkActionMap: Record<string, 'skip' | 'archive' | 'restore'> = {
      bulk_skip:    'skip',
      bulk_archive: 'archive',
      bulk_restore: 'restore',
    }
    const action = bulkActionMap[agentAction.type]
    if (!action) return
    await handleBulkAction(action, agentAction.filter ? { filter: agentAction.filter } : undefined)
  }, [handleBulkAction])

  const tabs: { id: ActionFilter; label: string }[] = [
    { id: 'New',     label: 'Inbox'    },
    { id: 'Engaged', label: 'Engaged'  },
    { id: 'Replied', label: 'Replied'  },
    { id: 'Skipped', label: 'Skipped'  },
    { id: 'CRM',     label: 'In CRM'   },
    { id: 'all',     label: 'All'      },
  ]

  const tabCounts: Partial<Record<ActionFilter, number>> = {
    New:     actionCounts['New'],
    Engaged: actionCounts['Engaged'],
    Replied: actionCounts['Replied'],
    Skipped: actionCounts['Skipped'],
    CRM:     actionCounts['CRM'],
  }

  return (
    <div className="min-h-screen bg-[#0a0c10] text-white">

      {/* ── Trial Expired Gate ── */}
      {trialExpiredGate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
          <div className="relative bg-[#0d1117] border border-slate-700/60 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            {/* Icon */}
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Your trial has ended</h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                Your 7-day Scout trial is over. Upgrade to keep monitoring LinkedIn for new client conversations — your data is still here.
              </p>
            </div>

            {/* Feature list */}
            <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4 mb-6">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">What you get back</p>
              <div className="space-y-2">
                {[
                  'LinkedIn conversation monitoring',
                  'AI-scored post feed',
                  'Comment draft suggestions',
                  'Unlimited AI suggestions',
                  'Daily Slack digest',
                ].map(f => (
                  <div key={f} className="flex items-center gap-2.5 text-sm text-slate-300">
                    <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </div>
                ))}
              </div>
            </div>

            {/* CTAs */}
            <div className="space-y-3">
              <button
                onClick={() => { window.location.href = '/api/billing/upgrade?tier=pro' }}
                className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors"
              >
                Upgrade to Pro — $99/mo →
              </button>
              <button
                onClick={() => { window.location.href = '/upgrade' }}
                className="w-full py-2.5 text-sm text-slate-500 hover:text-slate-300 transition-colors"
              >
                See all plans
              </button>
            </div>
          </div>
        </div>
      )}

      <Nav lastScannedAt={lastScannedAt} scanHealth={scanHealth} />

      {/* Tab bar + filters */}
      <div className="sticky top-[61px] z-10 bg-[#0a0c10]/95 backdrop-blur-md border-b border-slate-800/60">
        <div className="max-w-3xl mx-auto px-5">
          <div className="flex items-center gap-2">
            {/* Scrollable tab strip */}
            <div className="flex items-center gap-0 overflow-x-auto flex-1 min-w-0 scrollbar-none">
            {tabs.map(tab => {
              const count = tabCounts[tab.id]
              const isCrmLocked = tab.id === 'CRM' && !crmUnlocked
              return (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id)}
                  className={`shrink-0 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors flex items-center gap-1 ${
                    filter === tab.id
                      ? 'border-blue-500 text-white'
                      : 'border-transparent text-slate-500 hover:text-slate-400'
                  }`}
                >
                  {isCrmLocked && (
                    <svg className="w-3 h-3 text-slate-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                    </svg>
                  )}
                  {tab.label}
                  {!isCrmLocked && count !== undefined && count > 0 && (
                    <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                      filter === tab.id ? 'bg-blue-500/20 text-blue-300' : 'bg-slate-800 text-slate-500'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
            </div>{/* end scrollable tab strip */}

            {/* Fixed right-side controls */}
            <div className="flex items-center gap-2 py-1.5 shrink-0">
              {posts.length > 0 && (
                <button
                  onClick={() => {
                    if (selectionMode) {
                      exitSelectionMode()
                    } else {
                      setSelectionMode(true)
                      setBulkResult(null)
                    }
                  }}
                  className={`text-xs px-3 py-1 rounded-lg border transition-colors whitespace-nowrap ${
                    selectionMode
                      ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                      : 'bg-slate-800 border-slate-700/40 text-slate-400 hover:text-slate-300'
                  }`}
                >
                  {selectionMode ? 'Cancel' : 'Select'}
                </button>
              )}
              <button
                onClick={() => fetchPosts()}
                className="text-xs px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 transition-colors whitespace-nowrap"
              >
                Refresh
              </button>
            </div>
          </div>

          {/* Bulk action toolbar — appears when posts are selected */}
          {selectionMode && (
            <div className="flex items-center gap-3 pb-2.5 pt-0.5">
              <button onClick={toggleSelectAll} className="text-xs text-slate-500 hover:text-slate-300 transition-colors shrink-0">
                {selectedIds.size === posts.length ? 'Deselect all' : `Select all (${posts.length})`}
              </button>
              {selectedIds.size > 0 && (
                <>
                  <span className="text-xs text-slate-600">{selectedIds.size} selected</span>
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      onClick={() => handleBulkAction('skip', { recordIds: Array.from(selectedIds) })}
                      disabled={bulkLoading}
                      className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700/40 text-slate-300 hover:text-white hover:border-slate-500/60 transition-colors disabled:opacity-50"
                    >
                      Skip selected
                    </button>
                    <button
                      onClick={() => handleBulkAction('archive', { recordIds: Array.from(selectedIds) })}
                      disabled={bulkLoading}
                      className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700/40 text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
                    >
                      Archive
                    </button>
                    {filter === 'Skipped' && (
                      <button
                        onClick={() => handleBulkAction('restore', { recordIds: Array.from(selectedIds) })}
                        disabled={bulkLoading}
                        className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700/40 text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-50"
                      >
                        Restore
                      </button>
                    )}
                  </div>
                </>
              )}
              {bulkLoading && <span className="text-xs text-slate-500 ml-auto">Working…</span>}
              {bulkResult && !bulkLoading && (
                <span className={`text-xs ml-auto ${bulkResult.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
                  {bulkResult}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-5 py-6">
        <MomentumWidget actionCounts={actionCounts} history={momentumHistory} />

        {error && (
          <div className="mb-4 p-4 rounded-xl bg-red-900/20 border border-red-700/40 text-red-400 text-sm">
            {error}
          </div>
        )}

        {actionError && (
          <div className="mb-4 p-3 rounded-xl bg-red-900/20 border border-red-700/40 text-red-400 text-sm flex items-center justify-between gap-3">
            <span>⚠ {actionError}</span>
            <button onClick={() => setActionError(null)} className="text-red-600 hover:text-red-400 text-xs shrink-0">Dismiss</button>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-5 h-5 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-slate-600 text-sm">Loading posts…</p>
          </div>
        ) : filter === 'CRM' && !crmUnlocked ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-4 max-w-sm mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-center">
              <svg className="w-6 h-6 text-slate-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <p className="text-slate-300 text-sm font-semibold mb-1">CRM push is an Agency feature</p>
              <p className="text-slate-500 text-xs leading-relaxed">
                Upgrade to Scout Agency to push engaged leads directly to your CRM — all their contact info, notes, and conversation context in one click.
              </p>
            </div>
            <Link
              href="/upgrade"
              className="mt-1 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
            >
              See plans →
            </Link>
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
            <div className="text-4xl">
              {filter === 'New' ? '🎉' : filter === 'Engaged' ? '📋' : filter === 'Replied' ? '💬' : filter === 'CRM' ? '🔗' : '🗃️'}
            </div>
            <p className="text-slate-300 text-sm font-medium">
              {filter === 'New' ? 'Inbox zero — all caught up' : filter === 'Engaged' ? 'No engaged posts yet' : filter === 'Replied' ? 'No replies yet' : filter === 'Skipped' ? 'Nothing skipped' : filter === 'CRM' ? 'No contacts pushed to CRM yet' : 'No posts found'}
            </p>
            <p className="text-slate-600 text-xs max-w-xs">
              {filter === 'New'
                ? scanHealth?.lastScanStatus === 'pending_fb'
                  ? 'LinkedIn scan is running — results will appear shortly.'
                  : scanHealth?.lastScanStatus === 'scanning'
                    ? 'Scan is running now — results will appear shortly.'
                    : (plan === 'Trial' || plan === 'Starter')
                      ? 'Scout scans once per day on your plan. Your first scan will surface new posts.'
                      : 'Scout scans at 6 AM and 6 PM daily.'
                : 'Posts you mark will appear here.'}
            </p>
            {(scanHealth?.lastScanAt || lastScannedAt) && (
              <p className="text-slate-700 text-xs">
                Last scan: {timeAgo(scanHealth?.lastScanAt || lastScannedAt || '')}
                {scanHealth?.lastScanStatus === 'failed' && ' · ⚠️ issue detected, retry scheduled'}
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Subtle refresh note */}
            <div className="flex items-center justify-between mb-4">
              <NextScanCountdown scanStatus={scanHealth?.lastScanStatus} lastScanAt={scanHealth?.lastScanAt} plan={plan} />
              <p className="text-xs text-slate-700">
                Updated {timeAgo(lastRefreshed.toISOString())}
                {scanHealth?.lastScanStatus === 'failed' && (
                  <span className="text-amber-600"> · ⚠ last scan had issues</span>
                )}
              </p>
            </div>

            {/* Zero-new-posts notice — Inbox tab only, shows breakdown when available */}
            {filter === 'New' &&
              scanHealth?.lastPostsFound === 0 &&
              scanHealth?.lastScanStatus !== 'scanning' &&
              scanHealth?.lastScanStatus !== 'pending_fb' && (
              <div className="mb-4 px-3.5 py-3 rounded-xl bg-slate-800/40 border border-slate-700/30 space-y-2">
                <div className="flex items-start gap-2">
                  <svg className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Last scan found no new posts — posts below are from previous scans.
                    New results arrive automatically at the next scan.
                  </p>
                </div>
                {scanHealth?.lastScanBreakdown && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 pl-5.5">
                    {scanHealth.lastScanBreakdown.fetched !== undefined && (
                      <span className="text-xs text-slate-600">
                        Fetched <span className="text-slate-400">{scanHealth.lastScanBreakdown.fetched}</span>
                      </span>
                    )}
                    {scanHealth.lastScanBreakdown.ageFiltered !== undefined && (
                      <span className="text-xs text-slate-600">
                        Too old <span className="text-slate-400">{scanHealth.lastScanBreakdown.ageFiltered}</span>
                      </span>
                    )}
                    {scanHealth.lastScanBreakdown.deduped !== undefined && (
                      <span className="text-xs text-slate-600">
                        Already seen <span className="text-slate-400">{scanHealth.lastScanBreakdown.deduped}</span>
                      </span>
                    )}
                    {scanHealth.lastScanBreakdown.belowThreshold !== undefined && (
                      <span className="text-xs text-slate-600">
                        Below score threshold <span className="text-slate-400">{scanHealth.lastScanBreakdown.belowThreshold}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Skipped tab — bulk management toolbar */}
            {filter === 'Skipped' && posts.length > 0 && !selectionMode && (
              <div className="mb-4 flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-slate-800/30 border border-slate-700/20">
                <span className="text-xs text-slate-500 flex-1">
                  {posts.length} skipped post{posts.length !== 1 ? 's' : ''} — these are permanently excluded from future scans.
                </span>
                <button
                  onClick={() => handleBulkAction('restore', { filter: { currentAction: 'Skipped' } })}
                  disabled={bulkLoading}
                  className="text-xs px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-50 shrink-0"
                >
                  Restore all
                </button>
                <button
                  onClick={() => handleBulkAction('archive', { filter: { currentAction: 'Skipped' } })}
                  disabled={bulkLoading}
                  className="text-xs px-3 py-1.5 rounded-lg border border-slate-700/40 bg-slate-800/60 text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50 shrink-0"
                >
                  Archive all
                </button>
              </div>
            )}

            <div className="space-y-3">
              {posts.map(post => (
                <PostCard
                  key={post.id}
                  post={post}
                  onAction={handleAction}
                  updating={updating === post.id}
                  crmType={crmType}
                  userEmail={userEmail}
                  selected={selectedIds.has(post.id)}
                  selectionMode={selectionMode}
                  onToggleSelect={toggleSelectPost}
                />
              ))}
            </div>
          </>
        )}
      </main>

      {/* ── Scout Agent: floating trigger button ── */}
      <button
        onClick={() => setAgentOpen(prev => !prev)}
        className={`fixed bottom-5 right-5 z-40 flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-lg border transition-all duration-200 ${
          agentOpen
            ? 'bg-blue-600 border-blue-500 text-white shadow-blue-500/25'
            : 'bg-[#0d1017] border-slate-700/60 text-slate-300 hover:border-blue-500/40 hover:text-white shadow-black/40'
        }`}
        title="Scout Agent — AI inbox assistant"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <span className="text-xs font-semibold">Scout Agent</span>
      </button>

      {/* ── Scout Agent panel ── */}
      <ScoutAgentPanel
        open={agentOpen}
        onClose={() => setAgentOpen(false)}
        inboxCount={actionCounts['New'] || 0}
        skippedCount={actionCounts['Skipped'] || 0}
        topPosts={posts
          .filter(p => p.fields['Action'] === 'New' || p.fields['Action'] === '')
          .sort((a, b) => (b.fields['Relevance Score'] || 0) - (a.fields['Relevance Score'] || 0))
          .slice(0, 10)
          .map(p => ({
            id:     p.id,
            author: p.fields['Author Name'] || 'Unknown',
            score:  p.fields['Relevance Score'] || 0,
            text:   (p.fields['Post Text'] || '').slice(0, 200),
          }))}
        scoreDistribution={{
          high: posts.filter(p => (p.fields['Relevance Score'] || 0) >= 8).length,
          mid:  posts.filter(p => { const s = p.fields['Relevance Score'] || 0; return s >= 6 && s < 8 }).length,
          low:  posts.filter(p => (p.fields['Relevance Score'] || 0) < 6).length,
        }}
        onExecuteAction={executeAgentAction}
      />
    </div>
  )
}

