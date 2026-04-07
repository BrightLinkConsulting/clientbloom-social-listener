'use client'
import React from 'react'
import { motion, MotionProps } from 'framer-motion'
import { cn } from '@/lib/utils'

interface GradientTextProps
  extends Omit<React.HTMLAttributes<HTMLElement>, keyof MotionProps> {
  className?: string
  children: React.ReactNode
  as?: React.ElementType
}

function GradientText({
  className,
  children,
  as: Component = 'span',
  ...props
}: GradientTextProps) {
  // Use motion.create if available (newer framer-motion), otherwise motion[Component]
  const MotionComponent = (motion as any).create
    ? (motion as any).create(Component)
    : (motion as any)[Component as string] || motion.span

  return (
    <MotionComponent
      className={cn(
        'relative inline-flex overflow-hidden',
        className
      )}
      {...props}
    >
      {children}
      {/* Animated color blobs via mix-blend-mode overlay */}
      <span className="pointer-events-none absolute inset-0 mix-blend-lighten">
        <span
          className="pointer-events-none absolute -top-1/2 h-[40vw] w-[40vw] animate-[gradient-1_10s_ease-in-out_infinite_alternate] opacity-60 blur-[2rem]"
          style={{ background: 'hsl(225 100% 65%)', mixBlendMode: 'overlay' }}
        />
        <span
          className="pointer-events-none absolute right-0 top-0 h-[40vw] w-[40vw] animate-[gradient-2_12s_ease-in-out_infinite_alternate] opacity-50 blur-[2rem]"
          style={{ background: 'hsl(260 100% 70%)', mixBlendMode: 'overlay' }}
        />
        <span
          className="pointer-events-none absolute bottom-0 left-0 h-[40vw] w-[40vw] animate-[gradient-3_14s_ease-in-out_infinite_alternate] opacity-40 blur-[2rem]"
          style={{ background: 'hsl(195 100% 60%)', mixBlendMode: 'overlay' }}
        />
      </span>
    </MotionComponent>
  )
}

export { GradientText }
