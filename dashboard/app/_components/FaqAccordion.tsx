'use client'

import { useState } from 'react'

interface FaqItem {
  q: string
  a: string
}

interface FaqAccordionProps {
  items: FaqItem[]
}

export function FaqAccordion({ items }: FaqAccordionProps) {
  const [faqOpen, setFaqOpen] = useState<number | null>(null)

  return (
    <div className="space-y-4">
      {items.map((item, i) => (
        <div key={i} className="bg-[#0f1117] border border-slate-800 rounded-lg overflow-hidden">
          <button
            onClick={() => setFaqOpen(faqOpen === i ? null : i)}
            className="w-full flex items-center justify-between p-6 hover:bg-[#1a1e2e] transition-colors"
          >
            <span className="text-left font-semibold text-white">{item.q}</span>
            <svg
              className={`w-5 h-5 text-slate-400 transition-transform ${faqOpen === i ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
          {faqOpen === i && (
            <div className="px-6 pb-6 border-t border-slate-800 text-slate-400">
              {item.a}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
