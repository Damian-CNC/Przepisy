import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from './cn'

export type GlassModalSize = 'sm' | 'md' | 'lg'
export type GlassModalClosedBy = 'any' | 'closerequest' | 'none'

export interface GlassModalProps {
  /** Controls whether the native `<dialog>` is open via `showModal()`. */
  isOpen: boolean
  /** Called when the modal closes (via Escape, backdrop light-dismiss, or close button). */
  onClose: () => void
  /** Visible modal heading linked via `aria-labelledby`. */
  title?: string
  /** Optional subtitle rendered below the title. */
  subtitle?: string
  /** Accessible name used when no visible `title` is provided. */
  ariaLabel?: string
  /** Width preset for the modal panel. */
  size?: GlassModalSize
  /** Native `<dialog closedby>` behavior (`any` enables light-dismiss on backdrop). */
  closedBy?: GlassModalClosedBy
  /** Shows the top-right close button (`>= 44px` touch target). */
  showCloseButton?: boolean
  /** Modal body contents. */
  children: ReactNode
  /** Optional footer slot for primary/secondary actions. */
  footer?: ReactNode
  /** Additional CSS classes for the `<dialog>` container. */
  className?: string
}

const SIZE_CLASSES: Record<GlassModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
}

let cachedDisplayTransitionSupport: boolean | undefined

function canTransitionDisplay(): boolean {
  if (cachedDisplayTransitionSupport !== undefined) {
    return cachedDisplayTransitionSupport
  }
  if (
    typeof window === 'undefined' ||
    !window.CSS?.supports?.('transition-behavior', 'allow-discrete') ||
    !document.body
  ) {
    return false
  }
  const probe = document.createElement('div')
  probe.style.cssText =
    'transition: display 1s allow-discrete !important; display: block;'
  document.body.appendChild(probe)
  const initialDisplay = getComputedStyle(probe).display
  probe.style.display = 'none'
  cachedDisplayTransitionSupport =
    initialDisplay === 'block' && getComputedStyle(probe).display === 'block'
  probe.remove()
  return cachedDisplayTransitionSupport
}

function supportsTopLayerExit(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.CSS?.supports?.('overlay', 'auto')) &&
    canTransitionDisplay()
  )
}

function isPointerOutsideDialog(
  event: PointerEvent,
  dialog: HTMLDialogElement,
): boolean {
  const rect = dialog.getBoundingClientRect()
  return (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
}

/**
 * Native `<dialog>` modal in Apple Liquid Glass aesthetic.
 * Relies on `showModal()` top-layer, native focus containment, `closedby`, and CSS scroll containment.
 */
export function GlassModal({
  isOpen,
  onClose,
  title,
  subtitle,
  ariaLabel,
  size = 'md',
  closedBy = 'any',
  showCloseButton = true,
  children,
  footer,
  className,
}: GlassModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const headingId = useId()
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // Synchronize React `isOpen` state with native `<dialog>` open/close lifecycle.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    let cancelled = false

    const closeWithExitAnimation = async () => {
      if (!dialog.open) return
      if (!supportsTopLayerExit()) {
        dialog.setAttribute('data-closing', '')
        const animations = dialog.getAnimations({ subtree: true })
        if (animations.length > 0) {
          await Promise.race([
            Promise.allSettled(animations.map((animation) => animation.finished)),
            new Promise((resolve) => setTimeout(resolve, 400)),
          ])
        }
        if (cancelled) return
        dialog.removeAttribute('data-closing')
      }
      if (dialog.open) {
        dialog.close()
      }
    }

    if (isOpen) {
      dialog.removeAttribute('data-closing')
      if (!dialog.open) {
        dialog.showModal()
      }
    } else if (dialog.open) {
      void closeWithExitAnimation()
    }

    return () => {
      cancelled = true
    }
  }, [isOpen])

  // Listen to native `close` and `cancel` events to keep React state synchronized.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const handleClose = () => {
      dialog.removeAttribute('data-closing')
      dialog.returnValue = ''
      onCloseRef.current()
    }

    const handleCancel = (event: Event) => {
      if (closedBy === 'none') {
        event.preventDefault()
      }
    }

    dialog.addEventListener('close', handleClose)
    dialog.addEventListener('cancel', handleCancel)
    return () => {
      dialog.removeEventListener('close', handleClose)
      dialog.removeEventListener('cancel', handleCancel)
    }
  }, [closedBy])

  // Lightweight light-dismiss fallback for browsers without native `HTMLDialogElement.prototype.closedBy`.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || closedBy !== 'any') return
    if (
      typeof HTMLDialogElement !== 'undefined' &&
      'closedBy' in HTMLDialogElement.prototype
    ) {
      return
    }

    let pressedOutside = false

    const handlePointerDown = (event: PointerEvent) => {
      pressedOutside = isPointerOutsideDialog(event, dialog)
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (pressedOutside && isPointerOutsideDialog(event, dialog)) {
        onCloseRef.current()
      }
      pressedOutside = false
    }

    dialog.addEventListener('pointerdown', handlePointerDown)
    dialog.addEventListener('pointerup', handlePointerUp)
    return () => {
      dialog.removeEventListener('pointerdown', handlePointerDown)
      dialog.removeEventListener('pointerup', handlePointerUp)
    }
  }, [closedBy])

  const closedByAttribute = { closedby: closedBy } as Record<string, string>

  return (
    <dialog
      ref={dialogRef}
      {...closedByAttribute}
      aria-labelledby={title ? headingId : undefined}
      aria-label={!title ? (ariaLabel ?? 'Okno dialogowe') : undefined}
      className={cn(
        'glass-modal m-auto w-[calc(100%-2rem)] rounded-3xl p-0 text-inherit',
        'backdrop-blur-2xl backdrop-saturate-150',
        'bg-white/80 dark:bg-zinc-900/80',
        'border border-white/50 dark:border-white/15',
        'shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.7),0_24px_64px_-12px_rgba(28,25,23,0.28)]',
        'dark:shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.14),0_28px_72px_-12px_rgba(0,0,0,0.7)]',
        'max-h-[min(88dvh,46rem)] overflow-y-auto',
        SIZE_CLASSES[size],
        className,
      )}
    >
      <div className="flex flex-col gap-5 p-5 sm:p-6">
        {(title || showCloseButton) && (
          <header className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              {title && (
                <h2
                  id={headingId}
                  className="text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-50"
                >
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className="mt-1 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                  {subtitle}
                </p>
              )}
            </div>

            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Zamknij okno"
                className={cn(
                  'inline-flex size-11 shrink-0 items-center justify-center rounded-full',
                  'bg-white/60 hover:bg-white/85 text-stone-700',
                  'dark:bg-white/10 dark:hover:bg-white/20 dark:text-stone-200',
                  'border border-white/45 dark:border-white/15',
                  'transition-colors duration-150',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:focus-visible:outline-amber-400',
                )}
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            )}
          </header>
        )}

        <div className="text-stone-800 dark:text-stone-200">{children}</div>

        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-stone-900/10 pt-4 dark:border-white/10">
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  )
}
