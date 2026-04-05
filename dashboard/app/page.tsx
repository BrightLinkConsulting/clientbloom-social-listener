'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
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
    'CRM Contact ID': string
    'CRM Pushed At': string
  }
}

type ActionFilter = 'New' | 'Engaged' | 'Replied' | 'Skipped' | 'CRM' | 'all'

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
      className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
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
            <span className="text-[10px] text-slate-600">AI relevance score</span>
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
}: {
  post: Post
  onAction: (id: string, action: string) => void
  updating: boolean
  crmType: string
}) {
  const [expanded,   setExpanded]   = useState(false)
  const [angleOpen,  setAngleOpen]  = useState(false)
  const [notes,      setNotes]      = useState(post.fields['Notes'] || '')
  const [notesSaved, setNotesSaved] = useState(false)
  const [notesDirty, setNotesDirty] = useState(false)
  const [notesTs,    setNotesTs]    = useState(post.fields['Notes Updated At'] || '')
  const [crmPushing, setCrmPushing] = useState(false)
  const [crmPushed,  setCrmPushed]  = useState(!!post.fields['CRM Pushed At'])
  const [crmError,   setCrmError]   = useState('')

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
      setNotesSaved(true)
      setNotesDirty(false)
      setTimeout(() => setNotesSaved(false), 3000)
    } catch { /* non-fatal */ }
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
      className={`relative rounded-2xl border transition-all duration-300 ${
        isSkipped
          ? 'opacity-35 bg-[#0d0f14] border-slate-800/30'
          : isReplied
          ? 'bg-[#0b1520] border-blue-800/50 ring-1 ring-blue-900/30'
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
            <span className="text-xs text-slate-500">{f['Group Name']}</span>
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

        {/* ── Engagement zone (Engaged + Replied only) ── */}
        {isActiveEngage && (
          <div className="mt-3 pt-3 border-t border-slate-700/40 space-y-3">

            {/* Notes textarea */}
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
                {/* Timestamp */}
                <span className="text-xs text-slate-700">
                  {notesSaved
                    ? '✓ Saved just now'
                    : notesTs
                    ? `Last saved ${new Date(notesTs).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                    : ''}
                </span>
                {/* Save button — only active when dirty */}
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

            {/* CRM push error */}
            {crmError && (
              <p className="text-xs text-red-400">{crmError} — <a href="/settings" className="underline">check CRM settings</a></p>
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

          {/* CRM push button — visible when engaged or replied and CRM is configured */}
          {isActiveEngage && crmType && crmType !== 'None' && (
            <button
              onClick={handleCrmPush}
              disabled={crmPushing}
              className={`ml-auto text-xs px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
                crmPushed
                  ? 'border-emerald-500/30 text-emerald-500/70 cursor-default'
                  : 'border-slate-600/50 text-slate-400 hover:text-white hover:border-slate-500 disabled:opacity-50'
              }`}
            >
              {crmPushing ? (
                <>
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Pushing…
                </>
              ) : crmPushed ? (
                <>✓ In {crmType}</>
              ) : (
                <>Push to {crmType}</>
              )}
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
function getNextScanMs(): number {
  const now = new Date()
  // Scans at 6 AM and 6 PM PDT = 13:00 and 01:00 UTC
  const utcH = now.getUTCHours()
  const utcM = now.getUTCMinutes()
  const utcS = now.getUTCSeconds()
  const todayMins = utcH * 60 + utcM

  // Next scan candidates (UTC minutes from midnight)
  const scan1 = 1 * 60   // 01:00 UTC = 6 PM PDT
  const scan2 = 13 * 60  // 13:00 UTC = 6 AM PDT

  let nextMins: number
  if (todayMins < scan1) {
    nextMins = scan1
  } else if (todayMins < scan2) {
    nextMins = scan2
  } else {
    nextMins = scan1 + 24 * 60 // tomorrow's 01:00 UTC
  }

  const minsUntil = nextMins - todayMins
  return minsUntil * 60 * 1000 - utcS * 1000
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

function NextScanCountdown() {
  const [ms, setMs] = useState(() => getNextScanMs())

  useEffect(() => {
    const id = setInterval(() => setMs(getNextScanMs()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <span className="text-xs text-slate-600">
      Next scan in <span className="text-slate-500 font-medium tabular-nums">{formatCountdown(ms)}</span>
    </span>
  )
}

// ---- Nav ----
interface ScanHealth {
  lastScanAt:     string | null
  lastScanStatus: string | null
  lastPostsFound: number
  fbPending:      boolean
}

function ScanStatusPill({ health, lastScannedAt }: { health: ScanHealth | null; lastScannedAt: string | null }) {
  // Determine display state from scan health (preferred) or fallback to lastScannedAt from posts
  const scanAt = health?.lastScanAt || lastScannedAt
  const status = health?.lastScanStatus

  if (status === 'scanning') {
    return (
      <span className="text-xs text-blue-400 flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
        Scanning…
      </span>
    )
  }

  if (status === 'pending_fb' || health?.fbPending) {
    return (
      <span className="text-xs text-amber-400 flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        {scanAt ? `LinkedIn done · Facebook collecting…` : 'Collecting…'}
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
    return (
      <span className="text-xs text-emerald-400 flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        Last scan: {timeAgo(scanAt)}
      </span>
    )
  }

  // Fallback — no data yet
  return (
    <span className="text-xs text-slate-500 flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-600 animate-pulse" />
      Live · 2× daily
    </span>
  )
}

function Nav({ lastScannedAt, scanHealth }: { lastScannedAt: string | null; scanHealth: ScanHealth | null }) {
  const [tick, setTick] = useState(0)

  // Re-render time-ago labels every minute
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-[#0a0c10]/95 backdrop-blur-md">
      <div className="max-w-3xl mx-auto px-5 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClientBloomMark size={28} />
          <div>
            <p className="text-sm font-semibold text-white leading-tight">Scout by ClientBloom</p>
            <ScanStatusPill health={scanHealth} lastScannedAt={lastScannedAt} />
          </div>
        </div>
        <nav className="flex items-center gap-1">
          <Link href="/" className="text-xs px-3 py-1.5 rounded-lg font-medium bg-slate-800 text-white transition-colors">Feed</Link>
          <Link href="/settings" className="text-xs px-3 py-1.5 rounded-lg font-medium text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors">Settings</Link>
          <UserMenu />
        </nav>
      </div>
    </header>
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
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<ActionFilter>('New')
  const [groupFilter, setGroupFilter] = useState('all')
  const [updating, setUpdating] = useState<string | null>(null)
  const [actionCounts, setActionCounts] = useState<Record<string, number>>({})
  const [availableGroups, setAvailableGroups] = useState<string[]>([])
  const [lastScannedAt, setLastScrapedAt] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())
  const [error, setError] = useState<string | null>(null)
  const [crmType, setCrmType] = useState('None')
  const [scanHealth, setScanHealth] = useState<ScanHealth | null>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // First-run: redirect to onboarding if no posts exist and never onboarded
  useEffect(() => {
    const onboarded = localStorage.getItem('cb_onboarded')
    if (!onboarded) {
      // Give the data a moment to load before deciding
      const check = setTimeout(async () => {
        try {
          const res = await fetch('/api/posts?action=all&limit=5')
          const data = await res.json()
          const hasPosts = (data.records?.length || 0) > 0
          if (!hasPosts) {
            router.push('/onboarding')
          } else {
            // Existing user with posts — mark as onboarded, don't redirect
            localStorage.setItem('cb_onboarded', 'true')
          }
        } catch { /* stay on feed */ }
      }, 800)
      return () => clearTimeout(check)
    }
  }, [router])

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
      if (data.lastScannedAt) setLastScrapedAt(data.lastScannedAt)
      setLastRefreshed(new Date())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [filter, groupFilter])

  // Initial load + re-fetch when filters change
  useEffect(() => { fetchPosts() }, [fetchPosts])

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
      <Nav lastScannedAt={lastScannedAt} scanHealth={scanHealth} />

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
              {filter === 'New' ? '🎉' : filter === 'Engaged' ? '📋' : filter === 'Replied' ? '💬' : filter === 'CRM' ? '🔗' : '🗃️'}
            </div>
            <p className="text-slate-300 text-sm font-medium">
              {filter === 'New' ? 'Inbox zero — all caught up' : filter === 'Engaged' ? 'No engaged posts yet' : filter === 'Replied' ? 'No replies yet' : filter === 'Skipped' ? 'Nothing skipped' : filter === 'CRM' ? 'No contacts pushed to CRM yet' : 'No posts found'}
            </p>
            <p className="text-slate-600 text-xs max-w-xs">
              {filter === 'New'
                ? scanHealth?.lastScanStatus === 'pending_fb'
                  ? 'Facebook results are still being collected — check back in a minute.'
                  : scanHealth?.lastScanStatus === 'scanning'
                    ? 'Scan is running now — results will appear shortly.'
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
              <NextScanCountdown />
              <p className="text-xs text-slate-700">
                Updated {timeAgo(lastRefreshed.toISOString())}
                {scanHealth?.lastScanStatus === 'failed' && (
                  <span className="text-amber-600"> · ⚠ last scan had issues</span>
                )}
              </p>
            </div>
            <div className="space-y-3">
              {posts.map(post => (
                <PostCard
                  key={post.id}
                  post={post}
                  onAction={handleAction}
                  updating={updating === post.id}
                  crmType={crmType}
                />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
