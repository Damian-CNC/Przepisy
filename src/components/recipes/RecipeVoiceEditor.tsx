import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AlertCircle,
  Check,
  Mic,
  MicOff,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import { useVoiceRecognition } from '../../hooks/useVoiceRecognition'
import {
  editRecipeWithAi,
  type EditRecipeWithAiResult,
  type RecipeEditDiffItem,
} from '../../lib/recipesApi'
import type { RecipeRow, RecipeUpdate } from '../../lib/supabase'
import { GlassButton, GlassCard, GlassModal, GlassPill, cn } from '../ui'

export interface RecipeVoiceEditorProps {
  recipe: RecipeRow
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onApplyChanges: (recipeId: string, updatedFields: RecipeUpdate) => Promise<RecipeRow>
  hideFloatingTrigger?: boolean
}

const QUICK_EDIT_PROMPTS: readonly string[] = [
  'Zamień kolejność kroków 2 i 3',
  'Przelicz na wersję fit',
  'Dodaj 5 min pieczenia',
  'Przelicz na 4 porcje',
]

function getDiffBadgeMeta(kind: RecipeEditDiffItem['kind']): {
  label: string
  className: string
} {
  switch (kind) {
    case 'added':
      return {
        label: '+ Dodano',
        className:
          'border-emerald-600/35 bg-emerald-500/15 text-emerald-900 dark:border-emerald-400/35 dark:bg-emerald-500/20 dark:text-emerald-200',
      }
    case 'removed':
      return {
        label: '− Usunięto',
        className:
          'border-rose-600/35 bg-rose-500/15 text-rose-900 dark:border-rose-400/35 dark:bg-rose-500/20 dark:text-rose-200',
      }
    case 'updated':
      return {
        label: '✎ Zmieniono',
        className:
          'border-amber-600/35 bg-amber-500/15 text-amber-900 dark:border-amber-400/35 dark:bg-amber-500/20 dark:text-amber-200',
      }
  }
}

/**
 * Pływający asystent głosowy i tekstowy do edycji przepisu z podglądem zmian (diff preview) przed zapisem.
 */
export function RecipeVoiceEditor({
  recipe,
  isOpen,
  onOpenChange,
  onApplyChanges,
  hideFloatingTrigger = false,
}: RecipeVoiceEditorProps) {
  const baseId = useId()
  const prefersReducedMotion = useReducedMotion()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef(true)

  const [promptText, setPromptText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [editResult, setEditResult] = useState<EditRecipeWithAiResult | null>(null)

  const {
    isSupported: isVoiceSupported,
    isListening,
    transcript,
    interimTranscript,
    error: voiceError,
    startListening,
    stopListening,
    resetTranscript,
  } = useVoiceRecognition({
    lang: 'pl-PL',
    onFinalResult: (spokenChunk) => {
      setPromptText((prev) => {
        const trimmed = prev.trim()
        return trimmed ? `${trimmed} ${spokenChunk}` : spokenChunk
      })
    },
  })

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      abortRef.current?.abort()
    }
  }, [])

  // Jeśli modal zostanie zamknięty z zewnątrz, zatrzymujemy nagrywanie i anulujemy aktywne zapytanie
  useEffect(() => {
    if (!isOpen) {
      stopListening()
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [isOpen, stopListening])

  const resetTransientState = (clearPrompt = false) => {
    stopListening()
    resetTranscript()
    abortRef.current?.abort()
    abortRef.current = null
    setIsGenerating(false)
    setIsApplying(false)
    setAiError(null)
    setEditResult(null)
    if (clearPrompt) {
      setPromptText('')
    }
  }

  const handleClose = () => {
    if (isGenerating || isApplying) return
    resetTransientState(false)
    onOpenChange(false)
  }

  const handleCancelAi = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsGenerating(false)
    setAiError('Anulowano przygotowanie zmian. Możesz poprawić polecenie i spróbować ponownie.')
  }

  const handleGenerateProposal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isGenerating || isApplying) return

    if (isListening) {
      stopListening()
    }

    const combinedPrompt = (
      interimTranscript
        ? promptText.trim()
          ? `${promptText.trim()} ${interimTranscript}`
          : interimTranscript
        : promptText
    ).trim()

    if (!combinedPrompt) {
      setAiError('Powiedz lub wpisz, co chcesz zmienić w tym przepisie.')
      return
    }

    setPromptText(combinedPrompt)
    setAiError(null)
    setIsGenerating(true)

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const result = await editRecipeWithAi({
        currentRecipe: recipe,
        userPrompt: combinedPrompt,
        signal: controller.signal,
      })
      if (!isMountedRef.current) return
      setEditResult(result)
    } catch (err) {
      if (!isMountedRef.current) return
      setAiError(
        err instanceof Error && err.message
          ? err.message
          : 'Nie udało się przygotować zmian przez AI.',
      )
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
      }
      if (isMountedRef.current) {
        setIsGenerating(false)
      }
    }
  }

  const handleDiscardDiff = () => {
    if (isApplying) return
    setEditResult(null)
    setAiError(null)
  }

  const handleConfirmApply = async () => {
    if (!editResult || isApplying) return
    setAiError(null)
    setIsApplying(true)

    try {
      await onApplyChanges(recipe.id, editResult.updatedFields)
      if (!isMountedRef.current) return
      resetTransientState(true)
      onOpenChange(false)
    } catch (err) {
      if (!isMountedRef.current) return
      setAiError(
        err instanceof Error && err.message
          ? err.message
          : 'Nie udało się zapisać zmian w bazie.',
      )
    } finally {
      if (isMountedRef.current) {
        setIsApplying(false)
      }
    }
  }

  const liveTextareaValue = interimTranscript
    ? promptText.trim()
      ? `${promptText.trim()} ${interimTranscript}`
      : interimTranscript
    : promptText

  const previewTitleChanged =
    editResult !== null && editResult.previewRecipe.title.trim() !== recipe.title.trim()
  const previewServingsChanged =
    editResult !== null &&
    (editResult.previewRecipe.servings ?? null) !== (recipe.servings ?? null)

  return (
    <>
      {!hideFloatingTrigger && (
        <motion.button
          type="button"
          onClick={() => onOpenChange(true)}
          aria-label="Edytuj przepis z AI"
          whileTap={prefersReducedMotion ? undefined : { scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 500, damping: 32, mass: 0.8 }}
          className={cn(
            'fixed right-4 bottom-[calc(max(1rem,env(safe-area-inset-bottom))+4.25rem)] z-30',
            'md:right-[max(1.5rem,calc(50%-26.5rem))]',
            'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold',
            'backdrop-blur-2xl backdrop-saturate-150',
            'bg-white/80 text-stone-900 hover:bg-white/95',
            'dark:bg-zinc-900/80 dark:text-stone-50 dark:hover:bg-zinc-800/90',
            'border border-white/50 dark:border-white/20',
            'shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.7),0_10px_30px_0_rgba(28,25,23,0.16)]',
            'dark:shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.16),0_12px_36px_0_rgba(0,0,0,0.55)]',
            'transition-colors duration-150 select-none',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:focus-visible:outline-amber-400',
          )}
        >
          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
            <Mic className="size-4" aria-hidden="true" />
            <Sparkles className="size-3.5" aria-hidden="true" />
          </span>
          <span>Edytuj z AI</span>
        </motion.button>
      )}

      <GlassModal
        isOpen={isOpen}
        onClose={handleClose}
        title={editResult ? 'Podgląd zmian w przepisie' : 'Edytuj przepis z AI'}
        subtitle={
          editResult
            ? 'Sprawdź listę proponowanych zmian przed zapisaniem w bazie.'
            : `Powiedz po polsku lub napisz, co zmienić w „${recipe.title}”.`
        }
        size="md"
        closedBy={isGenerating || isApplying ? 'none' : 'any'}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={isGenerating ? 'loading' : editResult ? 'diff' : 'input'}
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.985 }}
            transition={
              prefersReducedMotion
                ? { duration: 0.1 }
                : { type: 'spring', stiffness: 360, damping: 28 }
            }
            className="flex flex-col gap-4"
          >
            {/* Alerty błędów głosu i AI */}
            <div aria-live="polite" className="space-y-2">
              {voiceError && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-2xl border border-amber-600/35 bg-amber-500/12 p-3 text-sm font-medium text-amber-950 dark:border-amber-400/35 dark:bg-amber-500/15 dark:text-amber-100"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{voiceError}</span>
                </div>
              )}

              {aiError && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-2xl border border-red-500/35 bg-red-500/12 p-3 text-sm font-medium text-red-900 dark:border-red-400/35 dark:bg-red-500/15 dark:text-red-200"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{aiError}</span>
                </div>
              )}
            </div>

            {isGenerating ? (
              <GlassCard variant="elevated" padding="lg" className="magic-shimmer">
                <div
                  role="status"
                  aria-live="polite"
                  className="flex flex-col items-center gap-4 py-5 text-center"
                >
                  <div className="inline-flex size-16 items-center justify-center rounded-3xl border border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300">
                    <Sparkles
                      className="size-8 animate-pulse motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-base font-semibold text-stone-900 dark:text-stone-50">
                      Asystent AI wprowadza zmiany w przepisie...
                    </p>
                    <p className="text-sm text-stone-600 dark:text-stone-300">
                      Za chwilę zobaczysz dokładne porównanie zmian przed zapisaniem.
                    </p>
                  </div>
                  <GlassButton
                    type="button"
                    variant="ghost"
                    size="md"
                    onClick={handleCancelAi}
                  >
                    Anuluj
                  </GlassButton>
                </div>
              </GlassCard>
            ) : editResult ? (
              /* Sekcja 2 — Podgląd zmian przed zapisem (Diff Preview) */
              <div className="flex flex-col gap-4">
                <GlassCard variant="default" padding="sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-stone-500 dark:text-stone-400">
                        {previewTitleChanged ? 'Nowy tytuł przepisu' : 'Przepis po zmianach'}
                      </p>
                      <p className="truncate text-base font-semibold text-stone-900 dark:text-stone-50">
                        {editResult.previewRecipe.title}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <GlassPill variant="tag" size="sm">
                        <span className="tabular-nums">
                          {editResult.previewRecipe.ingredients.length} składników
                        </span>
                      </GlassPill>
                      <GlassPill variant="tag" size="sm">
                        <span className="tabular-nums">
                          {editResult.previewRecipe.steps.length} kroków
                        </span>
                      </GlassPill>
                      {(previewServingsChanged || editResult.previewRecipe.servings) && (
                        <GlassPill variant={previewServingsChanged ? 'active' : 'tag'} size="sm">
                          <span className="tabular-nums">
                            {editResult.previewRecipe.servings ?? 2}{' '}
                            {(editResult.previewRecipe.servings ?? 2) === 1
                              ? 'porcja'
                              : (editResult.previewRecipe.servings ?? 2) < 5
                                ? 'porcje'
                                : 'porcji'}
                          </span>
                        </GlassPill>
                      )}
                    </div>
                  </div>
                </GlassCard>

                {editResult.changes.length === 0 ? (
                  <GlassCard variant="default" padding="md">
                    <p className="text-sm leading-relaxed text-stone-700 dark:text-stone-200">
                      Wprowadzono drobną korektę brzmienia lub struktury przepisu bez zmiany liczby
                      składników i kroków.
                    </p>
                  </GlassCard>
                ) : (
                  <ul className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
                    {editResult.changes.map((item, idx) => {
                      const badge = getDiffBadgeMeta(item.kind)
                      return (
                        <li
                          key={`${item.kind}-${item.label}-${idx}`}
                          className={cn(
                            'rounded-2xl border p-3',
                            'border-white/45 bg-white/60 dark:border-white/15 dark:bg-zinc-950/50',
                          )}
                        >
                          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-stone-900 dark:text-stone-50">
                              {item.label}
                            </span>
                            <span
                              className={cn(
                                'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                                badge.className,
                              )}
                            >
                              {badge.label}
                            </span>
                          </div>
                          <p className="text-sm leading-relaxed text-stone-700 dark:text-stone-300">
                            {item.detail}
                          </p>
                        </li>
                      )
                    })}
                  </ul>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-900/10 pt-4 dark:border-white/10">
                  <GlassButton
                    type="button"
                    variant="ghost"
                    size="md"
                    disabled={isApplying}
                    leftIcon={<RotateCcw className="size-4" aria-hidden="true" />}
                    onClick={handleDiscardDiff}
                  >
                    Odrzuć
                  </GlassButton>

                  <GlassButton
                    type="button"
                    variant="primary"
                    size="lg"
                    isLoading={isApplying}
                    loadingText="Zapisywanie..."
                    leftIcon={<Check className="size-5" aria-hidden="true" />}
                    onClick={() => void handleConfirmApply()}
                  >
                    Zatwierdź zmiany
                  </GlassButton>
                </div>
              </div>
            ) : (
              /* Sekcja 1 — Wprowadzanie polecenia głosowego / tekstowego */
              <form onSubmit={handleGenerateProposal} className="flex flex-col gap-4">
                {isVoiceSupported ? (
                  <div className="flex flex-col items-center gap-3 py-1">
                    <div className="relative flex items-center justify-center">
                      {isListening && !prefersReducedMotion && (
                        <>
                          <motion.span
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 rounded-full bg-amber-500/35 dark:bg-amber-400/30"
                            initial={{ scale: 1, opacity: 0.65 }}
                            animate={{ scale: 1.55, opacity: 0 }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
                          />
                          <motion.span
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 rounded-full bg-emerald-500/30 dark:bg-emerald-400/25"
                            initial={{ scale: 1, opacity: 0.55 }}
                            animate={{ scale: 1.85, opacity: 0 }}
                            transition={{
                              duration: 1.5,
                              delay: 0.45,
                              repeat: Infinity,
                              ease: 'easeOut',
                            }}
                          />
                        </>
                      )}

                      <motion.button
                        type="button"
                        onClick={isListening ? stopListening : startListening}
                        aria-pressed={isListening}
                        aria-label={
                          isListening
                            ? 'Zatrzymaj nagrywanie głosu'
                            : 'Dotknij i mów polecenie po polsku'
                        }
                        whileTap={prefersReducedMotion ? undefined : { scale: 0.94 }}
                        transition={{ type: 'spring', stiffness: 480, damping: 28 }}
                        className={cn(
                          'relative z-10 inline-flex size-20 cursor-pointer items-center justify-center rounded-full border transition-colors',
                          'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-600 dark:focus-visible:outline-amber-400',
                          isListening
                            ? 'border-emerald-300/70 bg-gradient-to-br from-amber-500 to-emerald-600 text-white shadow-[0_0_28px_rgba(245,158,11,0.45)]'
                            : 'border-white/50 bg-white/80 text-amber-700 hover:bg-white dark:border-white/20 dark:bg-zinc-800/85 dark:text-amber-300 dark:hover:bg-zinc-800',
                          'shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.65),0_10px_28px_rgba(0,0,0,0.12)]',
                        )}
                      >
                        <Mic className="size-8" aria-hidden="true" />
                      </motion.button>
                    </div>

                    <p
                      aria-live="polite"
                      className={cn(
                        'text-sm font-medium',
                        isListening
                          ? 'text-emerald-800 dark:text-emerald-300'
                          : 'text-stone-600 dark:text-stone-300',
                      )}
                    >
                      {isListening
                        ? 'Słucham... powiedz co zmienić'
                        : 'Dotknij i mów po polsku...'}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-2xl border border-stone-900/10 bg-white/55 px-3.5 py-2.5 text-xs text-stone-700 dark:border-white/10 dark:bg-white/5 dark:text-stone-300">
                    <MicOff className="size-4 shrink-0" aria-hidden="true" />
                    <span>
                      Rozpoznawanie mowy nie jest dostępne w tej przeglądarce — wpisz polecenie
                      poniżej.
                    </span>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor={`${baseId}-voice-prompt`}
                      className="text-sm font-medium text-stone-800 dark:text-stone-200"
                    >
                      Twoje polecenie dla asystenta
                    </label>
                    {(transcript || promptText) && (
                      <button
                        type="button"
                        onClick={() => {
                          stopListening()
                          resetTranscript()
                          setPromptText('')
                        }}
                        className="text-xs font-medium text-stone-600 underline-offset-4 hover:underline dark:text-stone-300"
                      >
                        Wyczyść
                      </button>
                    )}
                  </div>

                  <textarea
                    ref={textareaRef}
                    id={`${baseId}-voice-prompt`}
                    rows={3}
                    value={liveTextareaValue}
                    onChange={(e) => {
                      if (isListening) {
                        stopListening()
                      }
                      setPromptText(e.target.value)
                    }}
                    placeholder="np. Zamień cukier na erytrytol, wydłuż pieczenie o 5 minut albo zamień kroki 2 i 3..."
                    className={cn(
                      'w-full min-h-24 rounded-2xl px-4 py-3 text-base',
                      'bg-white/75 text-stone-900 placeholder:text-stone-500',
                      'dark:bg-zinc-950/65 dark:text-stone-50 dark:placeholder:text-stone-400',
                      'border border-stone-900/15 dark:border-white/15',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:focus-visible:outline-amber-400',
                    )}
                  />
                </div>

                {/* Szybkie podpowiedzi poleceń */}
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-stone-600 dark:text-stone-300">
                    Szybkie polecenia:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_EDIT_PROMPTS.map((suggestion) => (
                      <GlassPill
                        key={suggestion}
                        as="button"
                        variant={promptText.trim() === suggestion ? 'active' : 'surface'}
                        size="sm"
                        leftIcon={<Plus className="size-3.5" aria-hidden="true" />}
                        onClick={() => {
                          if (isListening) stopListening()
                          setPromptText(suggestion)
                          setAiError(null)
                          textareaRef.current?.focus()
                        }}
                        className="min-h-11 px-3.5 text-xs sm:text-sm"
                      >
                        {suggestion}
                      </GlassPill>
                    ))}
                  </div>
                </div>

                <GlassButton
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  leftIcon={<Pencil className="size-5" aria-hidden="true" />}
                >
                  Zaproponuj zmiany z AI
                </GlassButton>
              </form>
            )}
          </motion.div>
        </AnimatePresence>
      </GlassModal>
    </>
  )
}
