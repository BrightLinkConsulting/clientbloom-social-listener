'use client'
import React from 'react'
import { cn } from '@/lib/utils'
import { VariantProps, cva } from 'class-variance-authority'

const buttonVariants = cva(
  'relative group border font-semibold text-center rounded-full transition-all duration-200',
  {
    variants: {
      variant: {
        default: 'bg-[#4F6BFF]/10 hover:bg-[#4F6BFF]/5 border-[#4F6BFF]/30 text-white',
        solid: 'bg-[#4F6BFF] hover:bg-[#3D57F5] text-white border-transparent hover:shadow-lg hover:shadow-[#4F6BFF]/30',
        ghost: 'border-transparent bg-transparent hover:border-slate-600 hover:bg-white/5 text-slate-400 hover:text-white',
        outline: 'bg-transparent border-slate-700 text-slate-300 hover:border-[#4F6BFF]/60 hover:text-white',
      },
      size: {
        default: 'px-7 py-2.5 text-sm',
        sm: 'px-4 py-1.5 text-xs',
        lg: 'px-10 py-4 text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface NeonButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  neon?: boolean
  href?: string
}

const NeonButton = React.forwardRef<HTMLButtonElement, NeonButtonProps>(
  ({ className, neon = true, size, variant, children, href, ...props }, ref) => {
    const content = (
      <>
        {/* Top neon line — appears on hover */}
        <span
          className={cn(
            'absolute h-px opacity-0 group-hover:opacity-100 transition-all duration-500 ease-in-out inset-x-0 top-0 bg-gradient-to-r w-3/4 mx-auto from-transparent via-[#4F6BFF] to-transparent hidden',
            neon && 'block'
          )}
        />
        {children}
        {/* Bottom neon line — always subtle, brightens on hover */}
        <span
          className={cn(
            'absolute group-hover:opacity-50 opacity-20 transition-all duration-500 ease-in-out inset-x-0 h-px -bottom-px bg-gradient-to-r w-3/4 mx-auto from-transparent via-[#4F6BFF] to-transparent hidden',
            neon && 'block'
          )}
        />
      </>
    )

    if (href) {
      return (
        <a
          href={href}
          className={cn(buttonVariants({ variant, size }), 'inline-flex items-center justify-center gap-2', className)}
        >
          {content}
        </a>
      )
    }

    return (
      <button
        className={cn(buttonVariants({ variant, size }), 'inline-flex items-center justify-center gap-2', className)}
        ref={ref}
        {...props}
      >
        {content}
      </button>
    )
  }
)

NeonButton.displayName = 'NeonButton'

export { NeonButton, buttonVariants }
