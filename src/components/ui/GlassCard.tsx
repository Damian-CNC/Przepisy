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
  default: cn(
    'backdrop-blur-2xl backdrop-saturate-150',
    'bg-white/65 dark:bg-zinc-900/55',
    'border border-white/40 dark:border-white/15',
    'shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.6),0_8px_32px_0_rgba(0,0,0,0.08)]',
    'dark:shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.12),0_12px_40px_0_rgba(0,0,0,0.45)]',
  ),
  elevated: cn(
    'backdrop-blur-2xl backdrop-saturate-150',
    'bg-white/78 dark:bg-zinc-900/72',
    'border border-white/50 dark:border-white/20',
    'shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.72),0_16px_44px_0_rgba(28,25,23,0.12)]',
    'dark:shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.16),0_20px_52px_0_rgba(0,0,0,0.55)]',
  ),
  interactive: cn(
    'backdrop-blur-2xl backdrop-saturate-150',
    'bg-white/65 hover:bg-white/75 dark:bg-zinc-900/55 dark:hover:bg-zinc-900/70',
    'border border-white/40 hover:border-white/60 dark:border-white/15 dark:hover:border-white/25',
    'shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.6),0_8px_32px_0_rgba(0,0,0,0.08)]',
    'dark:shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.12),0_12px_40px_0_rgba(0,0,0,0.45)]',
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
