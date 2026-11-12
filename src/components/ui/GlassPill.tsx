import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion'
import { cn, hasExplicitDisplayClass } from './cn'

export type GlassPillVariant = 'surface' | 'active' | 'island' | 'tag'
export type GlassPillSize = 'sm' | 'md' | 'lg'

interface GlassPillBaseProps {
  /** Visual role of the pill (navigation surface, active filter, dynamic timer island, or tag). */
  variant?: GlassPillVariant
  /** Size scale (`md`/`lg` interactive pills maintain >= 44px touch height). */
  size?: GlassPillSize
  /** Optional leading icon. */
  leftIcon?: ReactNode
  /** Optional trailing icon or badge. */
  rightIcon?: ReactNode
  /** Pill content. */
  children: ReactNode
  /** Additional CSS classes. */
  className?: string
}

export type GlassPillProps =
  | (GlassPillBaseProps & {
      as?: 'div' | 'span'
      onClick?: never
    } & Omit<HTMLAttributes<HTMLDivElement>, 'children'>)
  | (GlassPillBaseProps & {
      as?: 'button'
      onClick: ButtonHTMLAttributes<HTMLButtonElement>['onClick']
    } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onClick'>)

const VARIANT_CLASSES: Record<GlassPillVariant, string> = {
  surface: cn(
    'backdrop-blur-2xl backdrop-saturate-150',
    'bg-white/65 text-stone-800 dark:bg-zinc-900/60 dark:text-stone-100',
    'border border-white/45 dark:border-white/15',
    'shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.6),0_8px_28px_0_rgba(0,0,0,0.08)]',
    'dark:shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.12),0_12px_32px_0_rgba(0,0,0,0.45)]',
  ),
  active: cn(
    'backdrop-blur-2xl backdrop-saturate-150',
    'bg-stone-900 text-white dark:bg-amber-500 dark:text-zinc-950',
    'border border-white/25 dark:border-amber-300/40',
    'shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.28),0_8px_24px_0_rgba(28,25,23,0.22)]',
    'dark:shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.45),0_8px_24px_0_rgba(245,158,11,0.3)]',
  ),
  island: cn(
    'backdrop-blur-2xl backdrop-saturate-180',
    'bg-zinc-950/85 text-stone-50 dark:bg-zinc-900/85 dark:text-stone-50',
    'border border-white/20 dark:border-white/15',
    'shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.2),0_14px_38px_0_rgba(0,0,0,0.32)]',
  ),
  tag: cn(
    'backdrop-blur-xl backdrop-saturate-150',
    'bg-white/55 text-stone-700 dark:bg-zinc-800/60 dark:text-stone-200',
    'border border-white/40 dark:border-white/15',
    'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.5)]',
  ),
}

const STATIC_SIZE_CLASSES: Record<GlassPillSize, string> = {
  sm: 'px-3 py-1 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-base gap-2.5',
}

const INTERACTIVE_SIZE_CLASSES: Record<GlassPillSize, string> = {
  sm: 'min-h-9 px-3.5 py-1.5 text-xs gap-1.5',
  md: 'min-h-11 px-4.5 py-2 text-sm gap-2',
  lg: 'min-h-12 px-5.5 py-2.5 text-base gap-2.5',
}

/**
 * Rounded-full Liquid Glass capsule for floating navigation, category filters, tags, and the Timer Island.
 */
export function GlassPill(props: GlassPillProps) {
  const prefersReducedMotion = useReducedMotion()
  const {
    variant = 'surface',
    size = 'md',
    leftIcon,
    rightIcon,
    children,
    className,
    as,
    ...rest
  } = props

  const isButton = as === 'button' || typeof props.onClick === 'function'
  const sizeClass = isButton
    ? INTERACTIVE_SIZE_CLASSES[size]
    : STATIC_SIZE_CLASSES[size]

  const baseClassName = cn(
    !hasExplicitDisplayClass(className) && 'inline-flex',
    'items-center justify-center rounded-full font-medium',
    VARIANT_CLASSES[variant],
    sizeClass,
    isButton
      ? cn(
          'cursor-pointer select-none transition-colors duration-150',
          'hover:brightness-105 active:brightness-95',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:focus-visible:outline-amber-400',
        )
      : undefined,
    className,
  )

  const content = (
    <>
      {leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>}
      <span>{children}</span>
      {rightIcon && <span className="inline-flex shrink-0">{rightIcon}</span>}
    </>
  )

  if (isButton) {
    const {
      type = 'button',
      onClick,
      ...buttonRest
    } = rest as Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>
    const motionProps = buttonRest as Omit<HTMLMotionProps<'button'>, 'children'>
    return (
      <motion.button
        {...motionProps}
        type={type}
        onClick={onClick}
        whileTap={prefersReducedMotion ? undefined : { scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 500, damping: 32, mass: 0.8 }}
        className={baseClassName}
      >
        {content}
      </motion.button>
    )
  }

  const Element = as === 'span' ? 'span' : 'div'
  return (
    <Element
      {...(rest as HTMLAttributes<HTMLDivElement>)}
      className={baseClassName}
    >
      {content}
    </Element>
  )
}
