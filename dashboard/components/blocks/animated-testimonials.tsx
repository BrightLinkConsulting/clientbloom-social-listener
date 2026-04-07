'use client'

import { motion, useAnimation, useInView, type Variants } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

export interface Testimonial {
  id: number
  name: string
  role: string
  company: string
  content: string
  rating: number
  initials: string
  accentColor: string
}

interface AnimatedTestimonialsProps {
  title?: string
  subtitle?: string
  badgeText?: string
  testimonials: Testimonial[]
  autoRotateInterval?: number
  className?: string
}

export function AnimatedTestimonials({
  title = 'What our users are saying',
  subtitle,
  badgeText = 'Trusted by consultants & agencies',
  testimonials,
  autoRotateInterval = 5500,
  className,
}: AnimatedTestimonialsProps) {
  const [activeIndex, setActiveIndex] = useState(0)

  const sectionRef = useRef(null)
  const isInView = useInView(sectionRef, { once: true, amount: 0.2 })
  const controls = useAnimation()

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.12, delayChildren: 0.15 },
    },
  }

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 24 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: 'easeOut' },
    },
  }

  useEffect(() => {
    if (isInView) controls.start('visible')
  }, [isInView, controls])

  useEffect(() => {
    if (autoRotateInterval <= 0 || testimonials.length <= 1) return
    const interval = setInterval(() => {
      setActiveIndex(current => (current + 1) % testimonials.length)
    }, autoRotateInterval)
    return () => clearInterval(interval)
  }, [autoRotateInterval, testimonials.length])

  const active = testimonials[activeIndex]

  return (
    <section
      ref={sectionRef}
      id="testimonials"
      className={`py-24 ${className || ''}`}
    >
      <div className="max-w-5xl mx-auto px-6">
        <motion.div
          initial="hidden"
          animate={controls}
          variants={containerVariants}
          className="grid grid-cols-1 md:grid-cols-2 gap-16 lg:gap-24 items-center"
        >
          {/* Left — heading + dots */}
          <motion.div variants={itemVariants} className="flex flex-col justify-center">
            <div className="space-y-5">
              {badgeText && (
                <div className="inline-flex items-center gap-2 bg-[#4F6BFF]/10 border border-[#4F6BFF]/20 rounded-full px-4 py-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4F6BFF] animate-pulse" />
                  <span className="text-[#4F6BFF] text-xs font-medium tracking-wide uppercase">
                    {badgeText}
                  </span>
                </div>
              )}

              <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight leading-tight">
                {title}
              </h2>

              {subtitle && (
                <p className="text-slate-400 text-base leading-relaxed max-w-md">
                  {subtitle}
                </p>
              )}

              {/* Navigation dots */}
              <div className="flex items-center gap-3 pt-2">
                {testimonials.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setActiveIndex(index)}
                    className={`h-2 rounded-full transition-all duration-300 ${
                      activeIndex === index
                        ? 'w-10 bg-[#4F6BFF]'
                        : 'w-2 bg-slate-700 hover:bg-slate-500'
                    }`}
                    aria-label={`View testimonial ${index + 1}`}
                  />
                ))}
              </div>
            </div>
          </motion.div>

          {/* Right — testimonial card */}
          <motion.div variants={itemVariants} className="relative min-h-[280px]">
            {testimonials.map((testimonial, index) => (
              <motion.div
                key={testimonial.id}
                className="absolute inset-0"
                initial={{ opacity: 0, x: 80 }}
                animate={{
                  opacity: activeIndex === index ? 1 : 0,
                  x: activeIndex === index ? 0 : 80,
                  scale: activeIndex === index ? 1 : 0.96,
                }}
                transition={{ duration: 0.45, ease: 'easeInOut' }}
                style={{ zIndex: activeIndex === index ? 10 : 0 }}
              >
                <div className="bg-[#0f1117] border border-slate-800 rounded-2xl p-8 h-full flex flex-col shadow-xl shadow-black/40">
                  {/* Stars */}
                  <div className="flex gap-1 mb-5">
                    {Array(testimonial.rating).fill(0).map((_, i) => (
                      <svg
                        key={i}
                        className="w-4 h-4 text-yellow-400 fill-yellow-400"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>

                  {/* Quote */}
                  <p className="text-slate-200 text-base leading-relaxed flex-1 italic">
                    &ldquo;{testimonial.content}&rdquo;
                  </p>

                  {/* Divider */}
                  <div className="border-t border-slate-800 my-5" />

                  {/* Author */}
                  <div className="flex items-center gap-4">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                      style={{ background: testimonial.accentColor }}
                    >
                      {testimonial.initials}
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">{testimonial.name}</p>
                      <p className="text-slate-500 text-xs">
                        {testimonial.role}, {testimonial.company}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}

            {/* Decorative glow */}
            <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-[#4F6BFF]/5 rounded-2xl pointer-events-none" />
            <div className="absolute -top-4 -left-4 w-20 h-20 bg-[#4F6BFF]/5 rounded-xl pointer-events-none" />
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
