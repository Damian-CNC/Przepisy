import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { cn, hasExplicitDisplayClass } from './cn'

export type GlassButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type GlassButtonSize = 'sm' | 'md' | 'lg'

export interface GlassButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Visual emphasis style of the button. */
  variant?: GlassButtonVariant
  /** Touch-target size preset (`md` >= 44px, `lg` >= 52px for kitchen use). */
  size?: GlassButtonSize
  /** Optional icon rendered before the label. */
  leftIcon?: ReactNode
  /** Optional icon rendered after the label. */
  rightIcon?: ReactNode
  /** Displays a spinner and prevents duplicate submissions while active. */
  isLoading?: boolean
  /** Optional accessible text shown while `isLoading` is true. */
  loadingText?: string
  /** Stretches the button to fill its container width. */
  fullWidth?: boolean
  /** Button label or content. */
  children: ReactNode
}

const VARIANT_CLASSES: Record<GlassButtonVariant, string> = {
  primary: cn(
    'liquid-glass-primary text-white',
    'hover:brightness-105',
    'dark:text-zinc-950',
  ),
  secondary: cn(
    'liquid-glass text-stone-900 dark:text-stone-100',
    'hover:brightness-105',
  ),
  ghost: cn(
    'bg-transparent hover:bg-white/45 text-stone-800',
    'dark:hover:bg-white/10 dark:text-stone-200',
    'border border-transparent hover:border-white/35 dark:hover:border-white/15',
  ),
  danger: cn(
    'backdrop-blur-md backdrop-saturate-[1.8]',
    'bg-red-600/90 hover:bg-red-600 text-white',
    'dark:bg-red-500/85 dark:hover:bg-red-500 dark:text-white',
    'border border-white/30 dark:border-red-300/30',
    'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.4),inset_0_-1px_0_0_rgba(255,255,255,0.12),0_8px_24px_-4px_rgba(220,38,38,0.35)]',
  ),
}

const SIZE_CLASSES: Record<GlassButtonSize, string> = {
  sm: 'min-h-9 px-3.5 py-1.5 text-sm rounded-xl gap-1.5',
  md: 'min-h-11 px-5 py-2.5 text-base rounded-2xl gap-2',
  lg: 'min-h-13 px-6 py-3 text-lg rounded-2xl gap-2.5',
}

/**
 * Tactile Apple Liquid Glass button with spring press physics and >=44px kitchen touch targets.
 */
export function GlassButton({
  variant = 'secondary',
  size = 'md',
  leftIcon,
  rightIcon,
  isLoading = false,
  loadingText,
  fullWidth = false,
  disabled,
  type = 'button',
  className,
  children,
  ...rest
}: GlassButtonProps) {
  const prefersReducedMotion = useReducedMotion()
  const isDisabled = Boolean(disabled || isLoading)
  const motionProps = rest as Omit<HTMLMotionProps<'button'>, 'children'>

  return (
    <motion.button
      {...motionProps}
      type={type}
      disabled={isDisabled}
      aria-busy={isLoading || undefined}
      whileTap={
        isDisabled || prefersReducedMotion ? undefined : { scale: 0.97 }
      }
      transition={{ type: 'spring', stiffness: 500, damping: 32, mass: 0.8 }}
      className={cn(
        !hasExplicitDisplayClass(className) && 'inline-flex',
        'select-none items-center justify-center font-medium',
        'transition-colors duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:focus-visible:outline-amber-400',
        'disabled:cursor-not-allowed disabled:opacity-55',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth ? 'w-full' : undefined,
        className,
      )}
    >
      {isLoading ? (
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
      ) : (
        leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>
      )}
      <span className="inline-flex items-center justify-center">
        {isLoading && loadingText ? loadingText : children}
      </span>
      {!isLoading && rightIcon && (
        <span className="inline-flex shrink-0">{rightIcon}</span>
      )}
    </motion.button>
  )
}
