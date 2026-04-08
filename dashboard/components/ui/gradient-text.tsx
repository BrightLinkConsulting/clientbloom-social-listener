'use client'
import React from 'react'
import { cn } from '@/lib/utils'

interface GradientTextProps extends React.HTMLAttributes<HTMLElement> {
  className?: string
  children: React.ReactNode
  as?: React.ElementType
}

/**
 * GradientText — animated gradient applied directly to text via background-clip.
 * Colors: indigo (#4F6BFF) → purple (#7C3AED) → pink (#E91E8C)
 * Matches the ClientBloom / Scout brand palette.
 */
function GradientText({
  className,
  children,
  as: Component = 'span',
  ...props
}: GradientTextProps) {
  return (
    <>
      <Component
        className={cn('inline-block', className)}
        style={{
          background:
            'linear-gradient(90deg, #4F6BFF 0%, #7C3AED 50%, #E91E8C 100%)',
          backgroundSize: '200% auto',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          animation: 'gradientShift 5s ease-in-out infinite alternate',
        }}
        {...props}
      >
        {children}
      </Component>
      <style>{`
        @keyframes gradientShift {
          0%   { background-position: 0%   center; }
          100% { background-position: 100% center; }
        }
      `}</style>
    </>
  )
}

export { GradientText }
