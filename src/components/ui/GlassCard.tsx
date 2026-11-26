import type { HTMLAttributes, ReactNode } from 'react'
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion'
import { cn } from './cn'

export type GlassCardVariant = 'default' | 'elevated' | 'interactive'
export type GlassCardPadding = 'none' | 'sm' | 'md' | 'lg'

export interface GlassCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Visual elevation and interactivity style of the Liquid Glass panel. */
  variant?: GlassCardVariant
  /** Inner spacing scale aligned to the 4px/8px grid. */
  padding?: GlassCardPadding
  /** Card contents. */
  children: ReactNode
}

const VARIANT_CLASSES: Record<GlassCardVariant, string> = {
  // Warstwa treści (bez ciężkiego bluru, zgodnie z HIG — wysoka czytelność i płynne przewijanie list)
  default: cn(
    'bg-white/90 dark:bg-zinc-900/86',
    'border border-stone-900/8 dark:border-white/12',
    'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.65),0_6px_22px_0_rgba(28,25,23,0.06)]',
    'dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_10px_28px_0_rgba(0,0,0,0.4)]',
  ),
  elevated: cn(
    'backdrop-blur-md backdrop-saturate-150',
    'bg-white/85 dark:bg-zinc-900/80',
    'border border-white/60 dark:border-white/16',
    'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.75),inset_0_-1px_0_0_rgba(255,255,255,0.14),0_14px_38px_0_rgba(28,25,23,0.1)]',
    'dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.16),0_18px_46px_0_rgba(0,0,0,0.5)]',
  ),
  interactive: cn(
    'bg-white/92 hover:bg-white dark:bg-zinc-900/86 dark:hover:bg-zinc-900/95',
    'border border-stone-900/8 hover:border-amber-500/35 dark:border-white/12 dark:hover:border-white/25',
    'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7),0_6px_22px_0_rgba(28,25,23,0.06)]',
    'dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_10px_28px_0_rgba(0,0,0,0.4)]',
    'transition-colors duration-200',
  ),
}

const PADDING_CLASSES: Record<GlassCardPadding, string> = {
  none: 'p-0',
  sm: 'p-4',
  md: 'p-5 sm:p-6',
  lg: 'p-6 sm:p-8',
}

/**
 * Apple Liquid Glass surface container with specular borders and optional spring interactivity.
 */
export function GlassCard({
  variant = 'default',
  padding = 'md',
  className,
  children,
  onClick,
  ...rest
}: GlassCardProps) {
  const prefersReducedMotion = useReducedMotion()
  const baseClassName = cn(
    'relative overflow-hidden rounded-3xl',
    VARIANT_CLASSES[variant],
    PADDING_CLASSES[padding],
    onClick ? 'cursor-pointer' : undefined,
    className,
  )

  if (variant === 'interactive') {
    const motionProps = rest as Omit<HTMLMotionProps<'div'>, 'children'>
    return (
      <motion.div
        {...motionProps}
        onClick={onClick}
        className={baseClassName}
        whileHover={prefersReducedMotion ? undefined : { y: -2, scale: 1.005 }}
        whileTap={prefersReducedMotion ? undefined : { scale: 0.985 }}
        transition={{ type: 'spring', stiffness: 420, damping: 30, mass: 0.85 }}
      >
        {children}
      </motion.div>
    )
  }

  return (
    <div {...rest} onClick={onClick} className={baseClassName}>
      {children}
    </div>
  )
}
