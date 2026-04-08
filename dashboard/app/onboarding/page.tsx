'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

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
  { id: 'asking_for_help', label: 'Asking questions or seeking advice from their network' },
  { id: 'industry_discussion', label: 'Starting or joining an industry debate or discussion' },
  { id: 'milestone', label: 'Announcing a milestone, promotion, or company change' },
  { id: 'growing_team', label: 'Talking about growing, hiring, or scaling their business' },
  { id: 'shopping_alternatives', label: 'Comparing tools, vendors, or evaluating alternatives' },
  { id: 'thought_leadership', label: 'Sharing bold takes or opinions you can thoughtfully add to' },
]

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
            placeholder="e.g. Marketing agency software, B2B SaaS, Coaching & Consulting..."
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
            placeholder="e.g. We help agencies systematize client retention so they stop losing clients they thought were happy — and start getting referrals instead."
            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20 transition-colors resize-none"
          />
        </div>
      </div>

      <button
        onClick={onNext}
        disabled={!valid}
        className="mt-8 w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
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
        Scout surfaces LinkedIn posts that create a natural opening for you to show up and add value. Select the types of conversations you want to be part of — these train Scout's scoring for your feed.
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
          className="flex-1 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors"
        >
          Continue →
        </button>
      </div>
    </div>
  )
}

// ── Step 3: Run First Scan ───────────────────────────────────────────────────
function Step3({
  data,
  onBack,
  onComplete,
  onMarkComplete,
}: {
  data: any
  onBack: () => void
  onComplete: () => void
  onMarkComplete: () => Promise<void>
}) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'scanning' | 'done' | 'error'>('idle')
  const [postsFound, setPostsFound] = useState(0)
  const [progress, setProgress] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const router = useRouter()

  const runScan = async () => {
    setStatus('saving')
    setProgress(10)

    // Save business profile
    try {
      await fetch('/api/business-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    } catch { /* non-fatal */ }

    setStatus('scanning')

    // Animate progress while waiting
    const progressInterval = setInterval(() => {
      setProgress(p => Math.min(p + 3, 88))
    }, 1200)

    try {
      const res = await fetch('/api/trigger-scan', { method: 'POST' })
      clearInterval(progressInterval)

      if (!res.ok) throw new Error('Scan request failed')
      const result = await res.json()

      setProgress(100)
      setPostsFound(result.postsFound || 0)
      setStatus('done')

      // Persist onboarding complete server-side and refresh JWT
      await onMarkComplete()
    } catch (e: any) {
      clearInterval(progressInterval)
      setErrorMsg(e.message || 'Something went wrong')
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">
          {postsFound > 0 ? `${postsFound} post${postsFound !== 1 ? 's' : ''} ready` : "You're all set"}
        </h2>
        <p className="text-slate-400 text-sm mb-2">
          {postsFound > 0
            ? 'Your feed is live. Each post is a real conversation you can join right now — with a comment starter already written for you.'
            : "Your profile is saved. Your next automatic scan runs at 6 AM or 6 PM PST — posts will be waiting when you check back."}
        </p>
        {postsFound > 0 && (
          <p className="text-slate-600 text-xs mb-8">Scout scans twice daily. The more you engage, the more visible you become.</p>
        )}
        {postsFound === 0 && <div className="mb-8" />}
        <button
          onClick={async () => {
            await onMarkComplete()
            router.push('/')
          }}
          className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors"
        >
          {postsFound > 0 ? 'Go to my inbox →' : 'Go to dashboard →'}
        </button>
      </div>
    )
  }

  if (status === 'scanning' || status === 'saving') {
    return (
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-6">
          <div className="w-7 h-7 border-2 border-slate-700 border-t-blue-400 rounded-full animate-spin" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">
          {status === 'saving' ? 'Saving your profile...' : 'Scanning now...'}
        </h2>
        <p className="text-slate-400 text-sm mb-8">
          {status === 'saving'
            ? 'Saving your profile so Scout knows exactly which conversations are worth your time.'
            : 'Searching LinkedIn for conversations worth joining and scoring each one. Takes about 30 seconds.'}
        </p>

        {/* Progress bar */}
        <div className="w-full bg-slate-800 rounded-full h-1.5 mb-3 overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-slate-600">
          {progress < 30 ? 'Connecting to sources...' : progress < 60 ? 'Fetching posts...' : progress < 85 ? 'Scoring with AI...' : 'Almost done...'}
        </p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
          <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Scan couldn't complete</h2>
        <p className="text-slate-500 text-xs mb-8">{errorMsg}</p>
        <div className="flex gap-3">
          <button onClick={() => setStatus('idle')} className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-400 hover:text-white text-sm transition-colors">Try again</button>
          <button
            onClick={async () => {
              await onMarkComplete()
              router.push('/')
            }}
            className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition-colors"
          >
            Skip for now
          </button>
        </div>
      </div>
    )
  }

  // idle state
  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-2">Run your first scan</h2>
      <p className="text-slate-400 text-sm mb-8">
        Scout will search LinkedIn for conversations worth joining right now and score them for you. Takes about 30 seconds. From here, your feed updates automatically twice a day — you just show up and engage.
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
          <span className="text-slate-600 text-xs mt-0.5 w-20 shrink-0">Entry points</span>
          <span className="text-sm text-slate-300">
            {data.signalTypes.length > 0
              ? `${data.signalTypes.length} conversation type${data.signalTypes.length !== 1 ? 's' : ''} selected`
              : 'All conversation types'}
          </span>
        </div>
      </div>

      <button
        onClick={runScan}
        className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        Run my first scan
      </button>

      <button
        onClick={async () => {
          await onMarkComplete()
          onComplete()
        }}
        className="mt-3 w-full py-2.5 text-xs text-slate-600 hover:text-slate-400 transition-colors"
      >
        Skip and go to dashboard
      </button>

      <div className="mt-6 flex gap-3">
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
  const { update: updateSession } = useSession()
  const [step, setStep] = useState(0)
  const [profile, setProfile] = useState({
    businessName: '',
    industry: '',
    idealClient: '',
    problemSolved: '',
    signalTypes: [] as string[],
  })

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
  const markOnboardingComplete = async () => {
    try {
      await fetch('/api/onboarding/complete', { method: 'POST' })
    } catch { /* non-fatal */ }
    // Refresh JWT so session.user.onboarded becomes true in this session
    await updateSession({ onboarded: true })
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

        <StepDots current={step} total={3} />

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
          <Step3
            data={profile}
            onBack={() => setStep(1)}
            onComplete={() => router.push('/')}
            onMarkComplete={markOnboardingComplete}
          />
        )}
      </div>
    </div>
  )
}

