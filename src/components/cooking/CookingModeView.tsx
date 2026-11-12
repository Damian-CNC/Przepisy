import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  BellOff,
  BellRing,
  Check,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Eye,
  Lightbulb,
  Mic,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Sun,
  Timer,
  X,
} from 'lucide-react'
import { useCookingTimers, type CookingTimer } from '../../hooks/useCookingTimers'
import { useWakeLock } from '../../hooks/useWakeLock'
import { formatScaledAmount } from '../../lib/recipesApi'
import type { RecipeRow, RecipeStep, RecipeUpdate } from '../../lib/supabase'
import { RecipeVoiceEditor } from '../recipes/RecipeVoiceEditor'
import { AmbientBackground, GlassButton, GlassCard, GlassModal, GlassPill, cn } from '../ui'

export interface CookingModeViewProps {
  recipe: RecipeRow
  targetServings: number
  onExit: () => void
  onUpdateRecipe?: (id: string, payload: RecipeUpdate) => Promise<RecipeRow>
}

const SWIPE_MIN_DISTANCE_PX = 64
const SWIPE_HORIZONTAL_RATIO = 1.4

function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(clamped / 3600)
  const minutes = Math.floor((clamped % 3600) / 60)
  const seconds = clamped % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function getIngredientKey(stepIndex: number, ingredientIndex: number, name: string): string {
  return `${stepIndex}:${ingredientIndex}:${name}`
}

function isInteractiveSwipeTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest('button, a, input, textarea, select, [data-no-swipe="true"]'))
}

/**
 * Pełnoekranowy tryb gotowania „Krok po kroku” (Thermomix Experience) z blokadą
 * wygaszania ekranu (Wake Lock), pływającą wyspą timerów i dużymi celami dotykowymi.
 */
export function CookingModeView({
  recipe,
  targetServings,
  onExit,
  onUpdateRecipe,
}: CookingModeViewProps) {
  const steps = useMemo<RecipeStep[]>(() => recipe.steps ?? [], [recipe.steps])
  const totalSteps = steps.length
  const baseServings = recipe.servings && recipe.servings > 0 ? recipe.servings : 2

  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [slideDirection, setSlideDirection] = useState<1 | -1>(1)
  const [checkedIngredients, setCheckedIngredients] = useState<Record<string, boolean>>({})
  const [isCompleted, setIsCompleted] = useState(false)
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const [pendingConfirmAction, setPendingConfirmAction] = useState<'next' | 'finish' | null>(null)
  const [isVoiceEditorOpen, setIsVoiceEditorOpen] = useState(false)

  const prefersReducedMotion = useReducedMotion()
  const { isActive: isWakeLockActive } = useWakeLock(true)
  const {
    timers,
    startTimer,
    pauseTimer,
    resumeTimer,
    addMinute,
    resetTimer,
    dismissTimer,
    clearAllTimers,
  } = useCookingTimers()

  const swipeStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null)
  const mainContainerRef = useRef<HTMLElement>(null)

  const safeStepIndex = totalSteps > 0 ? Math.min(currentStepIndex, totalSteps - 1) : 0
  const currentStep = totalSteps > 0 ? steps[safeStepIndex] : null
  const isFirstStep = safeStepIndex === 0
  const isLastStep = totalSteps > 0 && safeStepIndex === totalSteps - 1

  const islandTimers = useMemo(
    () =>
      timers.filter(
        (timer) =>
          timer.status === 'running' ||
          timer.status === 'paused' ||
          timer.status === 'finished',
      ),
    [timers],
  )

  const finishedTimersCount = useMemo(
    () => islandTimers.filter((timer) => timer.status === 'finished').length,
    [islandTimers],
  )

  const currentStepTimer: CookingTimer | undefined = useMemo(
    () => timers.find((timer) => timer.stepIndex === safeStepIndex),
    [timers, safeStepIndex],
  )

  const handleExit = useCallback(() => {
    clearAllTimers()
    onExit()
  }, [clearAllTimers, onExit])

  const goToStep = useCallback(
    (nextIndex: number) => {
      if (totalSteps === 0) return
      const clamped = Math.max(0, Math.min(totalSteps - 1, nextIndex))
      if (clamped === safeStepIndex) return
      setSlideDirection(clamped > safeStepIndex ? 1 : -1)
      setCurrentStepIndex(clamped)
      setIsCompleted(false)
      window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' })
    },
    [prefersReducedMotion, safeStepIndex, totalSteps],
  )

  const uncheckedStepIngredients = useMemo(() => {
    if (!currentStep) return []
    return currentStep.step_ingredients
      .map((ing, idx) => {
        const key = getIngredientKey(safeStepIndex, idx, ing.name)
        const scaled =
          ing.amount > 0 ? formatScaledAmount(ing.amount, baseServings, targetServings) : ''
        const amountLabel = scaled ? `${scaled} ${ing.unit}`.trim() : ing.unit || 'wg uznania'
        return { key, name: ing.name, amountLabel }
      })
      .filter((item) => !checkedIngredients[item.key])
  }, [baseServings, checkedIngredients, currentStep, safeStepIndex, targetServings])

  const completeRecipe = useCallback(() => {
    setIsCompleted(true)
    if (!prefersReducedMotion) {
      void confetti({
        particleCount: 95,
        spread: 75,
        origin: { y: 0.72 },
        disableForReducedMotion: true,
      })
    }
  }, [prefersReducedMotion])

  const handlePrevious = useCallback(() => {
    if (!isFirstStep) {
      setPendingConfirmAction(null)
      goToStep(safeStepIndex - 1)
    }
  }, [goToStep, isFirstStep, safeStepIndex])

  const advanceStepAction = useCallback(
    (action: 'next' | 'finish') => {
      if (action === 'next' && !isLastStep) {
        goToStep(safeStepIndex + 1)
      } else if (action === 'finish') {
        completeRecipe()
      }
    },
    [completeRecipe, goToStep, isLastStep, safeStepIndex],
  )

  const handleNext = useCallback(() => {
    if (isLastStep) return
    if (!isPreviewMode && uncheckedStepIngredients.length > 0) {
      setPendingConfirmAction('next')
      return
    }
    goToStep(safeStepIndex + 1)
  }, [goToStep, isLastStep, isPreviewMode, safeStepIndex, uncheckedStepIngredients.length])

  const handleFinishRecipe = useCallback(() => {
    if (!isCompleted && !isPreviewMode && uncheckedStepIngredients.length > 0) {
      setPendingConfirmAction('finish')
      return
    }
    completeRecipe()
  }, [completeRecipe, isCompleted, isPreviewMode, uncheckedStepIngredients.length])

  const handleConfirmUncheckedAdvance = useCallback(() => {
    const action = pendingConfirmAction
    setPendingConfirmAction(null)
    if (!action) return

    if (uncheckedStepIngredients.length > 0) {
      setCheckedIngredients((prev) => {
        const next = { ...prev }
        for (const item of uncheckedStepIngredients) {
          next[item.key] = true
        }
        return next
      })
    }

    advanceStepAction(action)
  }, [advanceStepAction, pendingConfirmAction, uncheckedStepIngredients])

  const handleEnterPreviewAndAdvance = useCallback(() => {
    const action = pendingConfirmAction
    setPendingConfirmAction(null)
    setIsPreviewMode(true)
    if (action) {
      advanceStepAction(action)
    }
  }, [advanceStepAction, pendingConfirmAction])

  const toggleIngredient = useCallback((key: string) => {
    setCheckedIngredients((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }, [])

  // Keyboard navigation: ArrowLeft / ArrowRight / Escape
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (pendingConfirmAction !== null || isVoiceEditorOpen) return
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        handleExit()
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        handlePrevious()
        return
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        handleNext()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleExit, handleNext, handlePrevious, isVoiceEditorOpen, pendingConfirmAction])

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || isInteractiveSwipeTarget(event.target)) {
      swipeStartRef.current = null
      return
    }
    swipeStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    }
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const start = swipeStartRef.current
    swipeStartRef.current = null
    if (!start || start.pointerId !== event.pointerId) return

    const dx = event.clientX - start.x
    const dy = event.clientY - start.y

    if (
      Math.abs(dx) >= SWIPE_MIN_DISTANCE_PX &&
      Math.abs(dx) > Math.abs(dy) * SWIPE_HORIZONTAL_RATIO
    ) {
      if (dx < 0) {
        handleNext()
      } else {
        handlePrevious()
      }
    }
  }

  const handlePointerCancel = () => {
    swipeStartRef.current = null
  }

  const progressPercent = totalSteps > 0 ? ((safeStepIndex + 1) / totalSteps) * 100 : 0

  // Fallback dla przepisu bez kroków
  if (totalSteps === 0 || !currentStep) {
    return (
      <div className="relative isolate flex min-h-dvh flex-col bg-[#fbf8f3] text-stone-900 dark:bg-zinc-950 dark:text-stone-50">
        <AmbientBackground />

        <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 pt-[calc(env(safe-area-inset-top,0px)+1rem)] pb-3 sm:px-6">
          <GlassButton
            variant="secondary"
            size="md"
            onClick={handleExit}
            leftIcon={<X className="size-5" aria-hidden="true" />}
            className="min-h-11"
          >
            Zakończ
          </GlassButton>

          {isWakeLockActive && (
            <GlassPill
              variant="tag"
              size="sm"
              leftIcon={
                <Sun
                  className="size-3.5 text-emerald-700 dark:text-emerald-400"
                  aria-hidden="true"
                />
              }
            >
              Ekran nie zgaśnie
            </GlassPill>
          )}
        </header>

        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6">
          <GlassCard variant="elevated" padding="lg" className="w-full text-center">
            <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-4">
              <div className="inline-flex size-16 items-center justify-center rounded-3xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
                <ChefHat className="size-8" aria-hidden="true" />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
                  {recipe.title}
                </h1>
                <p className="text-base leading-relaxed text-stone-600 dark:text-stone-300">
                  Ten przepis nie ma jeszcze zapisanych kroków przygotowania do trybu
                  prowadzenia krok po kroku.
                </p>
              </div>
              <GlassButton
                variant="primary"
                size="lg"
                onClick={handleExit}
                className="min-h-14 w-full sm:w-auto"
              >
                Wróć do przepisu
              </GlassButton>
            </div>
          </GlassCard>
        </main>
      </div>
    )
  }

  const checkedCountForStep = currentStep.step_ingredients.reduce((acc, ing, idx) => {
    const key = getIngredientKey(safeStepIndex, idx, ing.name)
    return checkedIngredients[key] ? acc + 1 : acc
  }, 0)

  return (
    <div className="relative isolate flex min-h-dvh flex-col bg-[#fbf8f3] text-stone-900 dark:bg-zinc-950 dark:text-stone-50">
      <AmbientBackground />

      {/* Ogłoszenie dla czytników ekranu przy zakończeniu minutnika */}
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {finishedTimersCount > 0
          ? `Uwaga: ${finishedTimersCount === 1 ? 'minutnik zakończył odliczanie' : `${finishedTimersCount} minutniki zakończyły odliczanie`}.`
          : ''}
      </div>

      {/* Górny pasek postępu i statusu (z zapasem poniżej Dynamic Island na iPhone) */}
      <header className="sticky top-0 z-30 border-b border-white/40 bg-[#fbf8f3]/75 backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10 dark:bg-zinc-950/75">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 pt-[calc(env(safe-area-inset-top,0px)+1rem)] pb-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <GlassButton
              variant="secondary"
              size="md"
              onClick={handleExit}
              leftIcon={<X className="size-5" aria-hidden="true" />}
              className="min-h-11"
            >
              Zakończ
            </GlassButton>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {isWakeLockActive && (
                <GlassPill
                  variant="tag"
                  size="sm"
                  leftIcon={
                    <Sun
                      className="size-3.5 text-emerald-700 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                  }
                >
                  <span className="hidden sm:inline">Ekran nie zgaśnie</span>
                  <span className="sm:hidden">Czuwa</span>
                </GlassPill>
              )}

              <GlassPill
                as="button"
                variant={isPreviewMode ? 'active' : 'surface'}
                size="sm"
                aria-pressed={isPreviewMode}
                aria-label={
                  isPreviewMode
                    ? 'Wyłącz tryb podglądu (sprawdzaj składniki)'
                    : 'Włącz tryb podglądu (przeklikaj kroki bez odhaczania składników)'
                }
                leftIcon={<Eye className="size-3.5" aria-hidden="true" />}
                onClick={() => setIsPreviewMode((prev) => !prev)}
                className="min-h-11 px-3 text-xs font-semibold sm:text-sm"
              >
                {isPreviewMode ? 'Podgląd wł.' : 'Podgląd'}
              </GlassPill>

              {onUpdateRecipe && (
                <GlassButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  aria-label="Edytuj przepis z AI"
                  onClick={() => setIsVoiceEditorOpen(true)}
                  leftIcon={
                    <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                      <Mic className="size-3.5" aria-hidden="true" />
                      <Sparkles className="size-3.5" aria-hidden="true" />
                    </span>
                  }
                  className="min-h-11 rounded-full px-3.5 text-xs font-semibold sm:text-sm"
                >
                  Edytuj z AI
                </GlassButton>
              )}

              <GlassPill variant="surface" size="sm">
                <span className="font-semibold text-stone-900 tabular-nums dark:text-stone-50">
                  Krok {safeStepIndex + 1} z {totalSteps}
                </span>
              </GlassPill>
            </div>
          </div>

          <div className="flex items-baseline justify-between gap-3">
            <h1 className="min-w-0 truncate text-base font-semibold tracking-tight text-stone-900 sm:text-lg dark:text-stone-50">
              {recipe.title}
            </h1>
            <span className="shrink-0 text-xs font-medium text-stone-600 tabular-nums dark:text-stone-300">
              {targetServings}{' '}
              {targetServings === 1 ? 'porcja' : targetServings < 5 ? 'porcje' : 'porcji'}
            </span>
          </div>

          {/* Płynny pasek postępu */}
          <div
            role="progressbar"
            aria-label="Postęp kroków przepisu"
            aria-valuemin={1}
            aria-valuemax={totalSteps}
            aria-valuenow={safeStepIndex + 1}
            className="h-2 w-full overflow-hidden rounded-full bg-stone-900/10 dark:bg-white/15"
          >
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-500 dark:from-amber-400 dark:to-amber-500"
              initial={false}
              animate={{ width: `${progressPercent}%` }}
              transition={
                prefersReducedMotion
                  ? { duration: 0.1 }
                  : { type: 'spring', stiffness: 320, damping: 30 }
              }
            />
          </div>

          {/* Nieduży, kompaktowy pasek przypiętych minutników pod postępem */}
          <AnimatePresence initial={false}>
            {islandTimers.length > 0 && (
              <motion.section
                aria-label="Aktywne minutniki"
                initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="flex flex-col gap-1.5"
              >
                {islandTimers.map((timer) => {
                  const isFinished = timer.status === 'finished'
                  const isPaused = timer.status === 'paused'
                  const isCurrentStep = timer.stepIndex === safeStepIndex

                  return (
                    <div
                      key={timer.id}
                      className={cn(
                        'flex min-h-9 w-full flex-nowrap items-center justify-between gap-1.5 rounded-full px-2.5 py-0.5',
                        'backdrop-blur-2xl backdrop-saturate-180',
                        'border text-stone-50 shadow-[0_6px_20px_rgba(0,0,0,0.24)]',
                        isFinished
                          ? 'border-emerald-400/60 bg-emerald-950/92 ring-1 ring-emerald-400/45'
                          : 'border-white/15 bg-zinc-950/85 dark:bg-zinc-900/90',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => goToStep(timer.stepIndex)}
                        className={cn(
                          'inline-flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-full px-1.5 text-left',
                          'transition-colors hover:bg-white/10',
                          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400',
                        )}
                      >
                        {isFinished ? (
                          <BellRing
                            className={cn(
                              'size-3.5 shrink-0 text-emerald-300',
                              !prefersReducedMotion && 'animate-bounce',
                            )}
                            aria-hidden="true"
                          />
                        ) : (
                          <span
                            aria-hidden="true"
                            className={cn(
                              'size-2 shrink-0 rounded-full',
                              isPaused
                                ? 'bg-stone-400'
                                : 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.85)]',
                            )}
                          />
                        )}

                        <span className="truncate text-xs font-medium text-stone-200">
                          Krok {timer.stepNumber}
                          {!isCurrentStep && (
                            <span className="ml-1 text-[11px] text-stone-400">• Idź</span>
                          )}
                        </span>

                        <span
                          className={cn(
                            'ml-auto shrink-0 font-semibold tabular-nums',
                            isFinished
                              ? 'text-xs text-emerald-300'
                              : 'text-sm tracking-tight text-amber-300',
                          )}
                        >
                          {isFinished ? 'Gotowe!' : formatCountdown(timer.remainingSeconds)}
                        </span>
                      </button>

                      <div className="flex shrink-0 items-center gap-1">
                        {timer.status === 'running' && (
                          <button
                            type="button"
                            aria-label={`Wstrzymaj minutnik kroku ${timer.stepNumber}`}
                            onClick={() => pauseTimer(timer.id)}
                            className="inline-flex size-7 cursor-pointer items-center justify-center rounded-full bg-white/12 text-stone-100 transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
                          >
                            <Pause className="size-3.5" aria-hidden="true" />
                          </button>
                        )}

                        {timer.status === 'paused' && (
                          <button
                            type="button"
                            aria-label={`Wznów minutnik kroku ${timer.stepNumber}`}
                            onClick={() => resumeTimer(timer.id)}
                            className="inline-flex size-7 cursor-pointer items-center justify-center rounded-full bg-amber-500/30 text-amber-200 transition-colors hover:bg-amber-500/45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
                          >
                            <Play className="size-3.5" aria-hidden="true" />
                          </button>
                        )}

                        <button
                          type="button"
                          aria-label={`Dodaj 1 minutę do minutnika kroku ${timer.stepNumber}`}
                          onClick={() => addMinute(timer.id)}
                          className="inline-flex h-7 cursor-pointer items-center justify-center rounded-full bg-white/12 px-2 text-[11px] font-semibold text-stone-100 tabular-nums transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
                        >
                          +1m
                        </button>

                        <button
                          type="button"
                          aria-label={
                            isFinished
                              ? `Wycisz minutnik kroku ${timer.stepNumber}`
                              : `Usuń minutnik kroku ${timer.stepNumber}`
                          }
                          onClick={() => dismissTimer(timer.id)}
                          className={cn(
                            'inline-flex h-7 cursor-pointer items-center justify-center gap-1 rounded-full text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400',
                            isFinished
                              ? 'bg-emerald-500 px-2.5 text-zinc-950 hover:bg-emerald-400'
                              : 'w-7 bg-white/10 text-stone-200 hover:bg-white/20',
                          )}
                        >
                          {isFinished ? (
                            <>
                              <BellOff className="size-3.5" aria-hidden="true" />
                              <span>Wycisz</span>
                            </>
                          ) : (
                            <X className="size-3.5" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Główna zawartość kroku z obsługą poziomego swipe (touch-pan-y zachowuje pionowy scroll) */}
      <main
        ref={mainContainerRef}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className="mx-auto flex w-full max-w-3xl flex-1 touch-pan-y flex-col gap-4 px-4 pt-4 pb-32 sm:px-6"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={safeStepIndex}
            initial={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, x: slideDirection * 24 }
            }
            animate={{ opacity: 1, x: 0 }}
            exit={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, x: slideDirection * -24 }
            }
            transition={
              prefersReducedMotion
                ? { duration: 0.1 }
                : { type: 'spring', stiffness: 360, damping: 32, mass: 0.9 }
            }
            className="flex flex-col gap-4"
          >
            {/* Nagłówek aktualnego kroku */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2.5">
                <span className="inline-flex size-9 items-center justify-center rounded-full bg-amber-600 text-base font-bold text-white shadow-sm dark:bg-amber-500 dark:text-zinc-950">
                  {currentStep.step_number}
                </span>
                <span className="text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-50">
                  Krok {currentStep.step_number}
                </span>
              </div>

              {currentStep.timer_seconds > 0 && (
                <GlassPill
                  variant="tag"
                  size="sm"
                  leftIcon={
                    <Timer
                      className="size-3.5 text-amber-700 dark:text-amber-400"
                      aria-hidden="true"
                    />
                  }
                >
                  <span className="tabular-nums">
                    Czas kroku: {formatCountdown(currentStep.timer_seconds)}
                  </span>
                </GlassPill>
              )}
            </div>

            {/* 1. Sekcja Instrukcji (pierwsza na górze!) */}
            <section aria-labelledby="step-instruction-heading">
              <GlassCard variant="elevated" padding="md">
                <h2
                  id="step-instruction-heading"
                  className="mb-2.5 text-xs font-semibold tracking-wider text-stone-500 uppercase dark:text-stone-400"
                >
                  Instrukcja
                </h2>
                <p className="text-xl leading-relaxed font-medium text-pretty text-stone-950 md:text-2xl dark:text-stone-50">
                  {currentStep.instruction}
                </p>

                {currentStep.tip && (
                  <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/12 p-3.5 text-sm leading-relaxed text-amber-950 sm:text-base dark:border-amber-400/25 dark:bg-amber-500/15 dark:text-amber-100">
                    <Lightbulb
                      className="mt-0.5 size-4.5 shrink-0 text-amber-700 dark:text-amber-300"
                      aria-hidden="true"
                    />
                    <p>
                      <span className="font-semibold">Wskazówka: </span>
                      {currentStep.tip}
                    </p>
                  </div>
                )}
              </GlassCard>
            </section>

            {/* 2. Sekcja: Dodaj w tym kroku (pod instrukcją!) */}
            {currentStep.step_ingredients.length > 0 && (
              <section aria-labelledby="step-ingredients-heading">
                <GlassCard variant="default" padding="md">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2
                      id="step-ingredients-heading"
                      className="text-base font-semibold tracking-tight text-stone-900 sm:text-lg dark:text-stone-50"
                    >
                      Dodaj w tym kroku
                    </h2>
                    <GlassPill variant="tag" size="sm">
                      <span className="tabular-nums">
                        {checkedCountForStep}/{currentStep.step_ingredients.length} odhaczono
                      </span>
                    </GlassPill>
                  </div>

                  <div className="flex flex-col gap-2">
                    {currentStep.step_ingredients.map((ing, idx) => {
                      const key = getIngredientKey(safeStepIndex, idx, ing.name)
                      const isChecked = Boolean(checkedIngredients[key])
                      const scaled =
                        ing.amount > 0
                          ? formatScaledAmount(ing.amount, baseServings, targetServings)
                          : ''
                      const amountLabel = scaled
                        ? `${scaled} ${ing.unit}`.trim()
                        : ing.unit || 'wg uznania'

                      return (
                        <button
                          key={key}
                          type="button"
                          aria-pressed={isChecked}
                          onClick={() => toggleIngredient(key)}
                          className={cn(
                            'flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-all duration-150',
                            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:focus-visible:outline-amber-400',
                            isChecked
                              ? 'border-emerald-600/35 bg-emerald-600/12 text-stone-600 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-stone-300'
                              : 'border-white/55 bg-white/65 text-stone-900 hover:bg-white/85 dark:border-white/15 dark:bg-zinc-900/60 dark:text-stone-50 dark:hover:bg-zinc-800/75',
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <span
                              aria-hidden="true"
                              className={cn(
                                'inline-flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors',
                                isChecked
                                  ? 'border-emerald-600 bg-emerald-600 text-white dark:border-emerald-400 dark:bg-emerald-500 dark:text-zinc-950'
                                  : 'border-stone-400/60 bg-white/80 dark:border-stone-500 dark:bg-zinc-800',
                              )}
                            >
                              {isChecked && <Check className="size-4 stroke-[2.5]" />}
                            </span>
                            <span
                              className={cn(
                                'text-base font-medium',
                                isChecked && 'line-through opacity-75',
                              )}
                            >
                              {ing.name}
                            </span>
                          </span>

                          <span
                            className={cn(
                              'shrink-0 text-base font-semibold tabular-nums',
                              isChecked
                                ? 'text-emerald-800 line-through opacity-80 dark:text-emerald-300'
                                : 'text-amber-800 dark:text-amber-300',
                            )}
                          >
                            {amountLabel}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </GlassCard>
              </section>
            )}

            {/* 3. Kompaktowa sekcja Minutnika kroku */}
            {currentStep.timer_seconds > 0 && (
              <section aria-labelledby="step-timer-heading" data-no-swipe="true">
                <GlassCard
                  variant="default"
                  padding="sm"
                  className={cn(
                    currentStepTimer?.status === 'finished' &&
                      'border-emerald-500/60 ring-2 ring-emerald-500/35 dark:border-emerald-400/55',
                  )}
                >
                  {!currentStepTimer || currentStepTimer.status === 'idle' ? (
                    <div className="flex flex-wrap items-center justify-between gap-2.5">
                      <h2
                        id="step-timer-heading"
                        className="inline-flex items-center gap-2 text-sm font-semibold text-stone-900 dark:text-stone-50"
                      >
                        <Timer
                          className="size-4 text-amber-700 dark:text-amber-400"
                          aria-hidden="true"
                        />
                        <span>Minutnik kroku {currentStep.step_number}</span>
                      </h2>

                      <GlassButton
                        variant="primary"
                        size="sm"
                        leftIcon={<Play className="size-3.5 fill-current" aria-hidden="true" />}
                        onClick={() =>
                          startTimer(
                            safeStepIndex,
                            currentStep.step_number,
                            `Krok ${currentStep.step_number}`,
                            currentStep.timer_seconds,
                          )
                        }
                        className="min-h-9 px-3.5"
                      >
                        <span className="tabular-nums">
                          Start ({formatCountdown(currentStep.timer_seconds)})
                        </span>
                      </GlassButton>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2.5">
                        <h2
                          id="step-timer-heading"
                          className="inline-flex items-center gap-1.5 text-sm font-semibold text-stone-800 dark:text-stone-200"
                        >
                          <Timer
                            className="size-4 text-amber-700 dark:text-amber-400"
                            aria-hidden="true"
                          />
                          <span className="sr-only">Minutnik kroku {currentStep.step_number}</span>
                        </h2>

                        <span
                          className={cn(
                            'text-2xl font-semibold tracking-tight tabular-nums',
                            currentStepTimer.status === 'finished'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-stone-950 dark:text-stone-50',
                          )}
                        >
                          {currentStepTimer.status === 'finished'
                            ? '00:00'
                            : formatCountdown(currentStepTimer.remainingSeconds)}
                        </span>

                        <GlassPill
                          variant={currentStepTimer.status === 'finished' ? 'active' : 'tag'}
                          size="sm"
                        >
                          {currentStepTimer.status === 'running'
                            ? 'Odlicza'
                            : currentStepTimer.status === 'paused'
                              ? 'Pauza'
                              : 'Koniec!'}
                        </GlassPill>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {currentStepTimer.status === 'running' && (
                          <GlassButton
                            variant="secondary"
                            size="sm"
                            leftIcon={<Pause className="size-3.5" aria-hidden="true" />}
                            onClick={() => pauseTimer(currentStepTimer.id)}
                          >
                            Pauza
                          </GlassButton>
                        )}

                        {currentStepTimer.status === 'paused' && (
                          <GlassButton
                            variant="primary"
                            size="sm"
                            leftIcon={<Play className="size-3.5 fill-current" aria-hidden="true" />}
                            onClick={() => resumeTimer(currentStepTimer.id)}
                          >
                            Wznów
                          </GlassButton>
                        )}

                        {currentStepTimer.status === 'finished' && (
                          <GlassButton
                            variant="primary"
                            size="sm"
                            leftIcon={<BellOff className="size-3.5" aria-hidden="true" />}
                            onClick={() => dismissTimer(currentStepTimer.id)}
                          >
                            Wycisz
                          </GlassButton>
                        )}

                        <GlassButton
                          variant="secondary"
                          size="sm"
                          leftIcon={<Plus className="size-3.5" aria-hidden="true" />}
                          onClick={() => addMinute(currentStepTimer.id)}
                        >
                          +1 min
                        </GlassButton>

                        <GlassButton
                          variant="ghost"
                          size="sm"
                          aria-label="Resetuj minutnik"
                          onClick={() => resetTimer(currentStepTimer.id)}
                          className="px-2.5"
                        >
                          <RotateCcw className="size-3.5" aria-hidden="true" />
                        </GlassButton>
                      </div>
                    </div>
                  )}
                </GlassCard>
              </section>
            )}

            {/* Karta gratulacji po zakończeniu ostatniego kroku */}
            {isLastStep && isCompleted && (
              <motion.section
                aria-label="Gratulacje"
                initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 360, damping: 28 }}
              >
                <GlassCard
                  variant="elevated"
                  padding="lg"
                  className="border-emerald-500/45 bg-emerald-500/12 dark:border-emerald-400/35 dark:bg-emerald-500/15"
                >
                  <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-zinc-950">
                        <Sparkles className="size-6" aria-hidden="true" />
                      </div>
                      <div className="space-y-1">
                        <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-50">
                          Brawo! Danie gotowe — smacznego!
                        </h2>
                        <p className="text-base text-stone-700 dark:text-stone-200">
                          Wszystkie {totalSteps} kroków dla „{recipe.title}” zostały ukończone.
                        </p>
                      </div>
                    </div>

                    <GlassButton
                      variant="primary"
                      size="md"
                      onClick={handleExit}
                      className="min-h-11 w-full shrink-0 sm:w-auto"
                    >
                      Wróć do przepisu
                    </GlassButton>
                  </div>
                </GlassCard>
              </motion.section>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Dolna nawigacja (ergonomiczna wysokość 56px — 2x większa dla wygodnej obsługi w kuchni) */}
      <nav
        aria-label="Nawigacja kroków gotowania"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 border-t border-white/40 bg-[#fbf8f3]/80 backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10 dark:bg-zinc-950/80"
      >
        <div className="pointer-events-auto mx-auto grid w-full max-w-3xl grid-cols-2 gap-3 px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          <GlassButton
            variant="secondary"
            size="lg"
            disabled={isFirstStep}
            leftIcon={<ChevronLeft className="size-5" aria-hidden="true" />}
            onClick={handlePrevious}
            className="h-14 !min-h-14 rounded-2xl px-4 py-2 text-sm font-semibold sm:text-base"
          >
            Poprzedni
          </GlassButton>

          {isLastStep ? (
            <GlassButton
              variant="primary"
              size="lg"
              onClick={handleFinishRecipe}
              className="h-14 !min-h-14 rounded-2xl px-4 py-2 text-sm font-semibold sm:text-base"
            >
              Gotowe! Smacznego 🎉
            </GlassButton>
          ) : (
            <GlassButton
              variant="primary"
              size="lg"
              rightIcon={<ChevronRight className="size-5" aria-hidden="true" />}
              onClick={handleNext}
              className="h-14 !min-h-14 rounded-2xl px-4 py-2 text-sm font-semibold sm:text-base"
            >
              Następny krok
            </GlassButton>
          )}
        </div>
      </nav>

      {/* Modal potwierdzenia niezaznaczonych składników przed przejściem dalej */}
      <GlassModal
        isOpen={pendingConfirmAction !== null}
        onClose={() => setPendingConfirmAction(null)}
        title="Nie wszystkie składniki odhaczone"
        subtitle="Upewnij się przed przejściem dalej, że poniższe składniki trafiły już do potrawy — albo włącz tryb podglądu, żeby przeklikać przepis bez odhaczania."
        size="sm"
        footer={
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <GlassButton
              variant="ghost"
              size="md"
              autoFocus
              onClick={() => setPendingConfirmAction(null)}
            >
              Wróć i zaznacz
            </GlassButton>
            <GlassButton
              variant="secondary"
              size="md"
              leftIcon={<Eye className="size-4" aria-hidden="true" />}
              onClick={handleEnterPreviewAndAdvance}
            >
              Przeklikaj jako podgląd
            </GlassButton>
            <GlassButton
              variant="primary"
              size="md"
              onClick={handleConfirmUncheckedAdvance}
            >
              {pendingConfirmAction === 'finish'
                ? 'Tak, dodane — zakończ'
                : 'Tak, dodane — dalej'}
            </GlassButton>
          </div>
        }
      >
        <ul className="space-y-2 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3.5 text-sm dark:border-amber-400/20 dark:bg-amber-500/12">
          {uncheckedStepIngredients.map((item) => (
            <li
              key={item.key}
              className="flex items-baseline justify-between gap-3 text-stone-900 dark:text-stone-100"
            >
              <span className="font-medium">{item.name}</span>
              <span className="shrink-0 font-semibold text-amber-800 tabular-nums dark:text-amber-300">
                {item.amountLabel}
              </span>
            </li>
          ))}
        </ul>
      </GlassModal>

      {onUpdateRecipe && (
        <RecipeVoiceEditor
          recipe={recipe}
          isOpen={isVoiceEditorOpen}
          onOpenChange={setIsVoiceEditorOpen}
          onApplyChanges={onUpdateRecipe}
          hideFloatingTrigger
        />
      )}
    </div>
  )
}
