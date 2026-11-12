import { useRef, useState } from 'react'
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import {
  AlertCircle,
  ArrowLeft,
  ChefHat,
  Clock,
  ExternalLink,
  Flame,
  Globe,
  Heart,
  ImagePlus,
  Lightbulb,
  Minus,
  Play,
  Plus,
  Sparkles,
  Timer,
  Trash2,
  Users,
} from 'lucide-react'
import {
  formatScaledAmount,
  generateRecipeCoverImage,
  groupIngredientsBySection,
  toSafeHttpUrl,
} from '../../lib/recipesApi'
import type { RecipeRow, RecipeUpdate } from '../../lib/supabase'
import { GlassButton, GlassCard, GlassModal, GlassPill, cn } from '../ui'
import { RecipeVoiceEditor } from './RecipeVoiceEditor'
import { formatTimerLabel, getSourceMeta } from './recipeMeta'

export interface RecipeDetailViewProps {
  recipe: RecipeRow
  onBack: () => void
  onToggleFavorite: (id: string) => void | Promise<unknown>
  onUpdatePhoto: (id: string, file: File) => Promise<RecipeRow>
  onUpdateRecipe: (id: string, payload: RecipeUpdate) => Promise<RecipeRow>
  onRemoveRecipe: (id: string) => Promise<void>
  onStartCooking: (recipe: RecipeRow, targetServings: number) => void
}

function supportsCssScrollDrivenParallax(): boolean {
  if (typeof window === 'undefined' || !window.CSS?.supports) return false
  return window.CSS.supports('(animation-timeline: view()) and (animation-range: entry)')
}

/**
 * Widok szczegółów przepisu z paralaksą zdjęcia, podmianą okładki, przelicznikiem porcji i CTA do gotowania.
 */
export function RecipeDetailView({
  recipe,
  onBack,
  onToggleFavorite,
  onUpdatePhoto,
  onUpdateRecipe,
  onRemoveRecipe,
  onStartCooking,
}: RecipeDetailViewProps) {
  const baseServings = recipe.servings && recipe.servings > 0 ? recipe.servings : 2
  const [targetServings, setTargetServings] = useState<number>(baseServings)
  const [isUpdatingPhoto, setIsUpdatingPhoto] = useState(false)
  const [photoAction, setPhotoAction] = useState<'search' | 'generate' | null>(null)
  const [isPhotoOptionsOpen, setIsPhotoOptionsOpen] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isVoiceEditorOpen, setIsVoiceEditorOpen] = useState(false)

  const photoInputRef = useRef<HTMLInputElement>(null)
  const heroWrapperRef = useRef<HTMLDivElement>(null)

  const prefersReducedMotion = useReducedMotion()
  const cssParallaxSupported = supportsCssScrollDrivenParallax()

  // Lekki fallback paralaksy w Framer Motion dla przeglądarek bez CSS scroll-driven animations
  const { scrollYProgress } = useScroll({
    target: heroWrapperRef,
    offset: ['start start', 'end start'],
  })
  const fallbackY = useTransform(scrollYProgress, [0, 1], [0, 44])
  const fallbackScale = useTransform(scrollYProgress, [0, 1], [1, 1.07])
  const useMotionFallback = !cssParallaxSupported && !prefersReducedMotion

  const prepMinutes =
    typeof recipe.prep_time_minutes === 'number' ? Math.max(0, recipe.prep_time_minutes) : 0
  const cookMinutes =
    typeof recipe.cook_time_minutes === 'number' ? Math.max(0, recipe.cook_time_minutes) : 0
  const totalMinutes = prepMinutes + cookMinutes
  const isFavorite = Boolean(recipe.is_favorite)
  const { label: sourceLabel, Icon: SourceIcon } = getSourceMeta(recipe.source_platform)
  const safeSourceUrl = toSafeHttpUrl(recipe.source_url)

  const handlePhotoSelect = async (file: File | undefined) => {
    if (!file || isUpdatingPhoto) return
    setPhotoError(null)
    setIsUpdatingPhoto(true)
    try {
      await onUpdatePhoto(recipe.id, file)
    } catch (err) {
      setPhotoError(
        err instanceof Error && err.message
          ? err.message
          : 'Nie udało się zaktualizować zdjęcia potrawy.',
      )
    } finally {
      setIsUpdatingPhoto(false)
    }
  }

  const handleResolveCoverPhoto = async (forceGenerate: boolean) => {
    if (photoAction !== null || isUpdatingPhoto) return
    setIsPhotoOptionsOpen(false)
    setPhotoError(null)
    setPhotoAction(forceGenerate ? 'generate' : 'search')
    try {
      const imageUrl = await generateRecipeCoverImage({
        title: recipe.title,
        description: recipe.description,
        category: recipe.category,
        forceGenerate,
      })
      await onUpdateRecipe(recipe.id, { image_url: imageUrl })
    } catch (err) {
      setPhotoError(
        err instanceof Error && err.message
          ? err.message
          : 'Nie udało się dobrać ani wygenerować zdjęcia dla tego przepisu.',
      )
    } finally {
      setPhotoAction(null)
    }
  }

  const handleConfirmDelete = async () => {
    if (isDeleting) return
    setDeleteError(null)
    setIsDeleting(true)
    try {
      await onRemoveRecipe(recipe.id)
      setIsDeleteModalOpen(false)
      onBack()
    } catch (err) {
      setDeleteError(
        err instanceof Error && err.message
          ? err.message
          : 'Nie udało się usunąć przepisu.',
      )
    } finally {
      setIsDeleting(false)
    }
  }

  const handleApplyVoiceChanges = async (id: string, updatedFields: RecipeUpdate) => {
    const updated = await onUpdateRecipe(id, updatedFields)
    if (
      typeof updated.servings === 'number' &&
      updated.servings > 0 &&
      updated.servings !== recipe.servings
    ) {
      setTargetServings(updated.servings)
    }
    return updated
  }

  return (
    <div className="relative pb-36">
      {/* Zdjęcie nagłówkowe z paralaksą przy przewijaniu */}
      <div
        ref={heroWrapperRef}
        className="recipe-hero-parallax-wrapper relative h-[min(58dvh,27rem)] min-h-80 w-full overflow-clip bg-gradient-to-br from-amber-200/85 via-orange-200/75 to-emerald-200/75 dark:from-amber-950/85 dark:via-stone-900 dark:to-emerald-950/80"
      >
        <motion.div
          style={useMotionFallback ? { y: fallbackY, scale: fallbackScale } : undefined}
          className={cn(
            'h-full w-full',
            cssParallaxSupported ? 'recipe-hero-parallax-media' : undefined,
          )}
        >
          {recipe.image_url ? (
            <img
              src={recipe.image_url}
              alt={recipe.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ChefHat
                className="size-24 text-amber-900/30 dark:text-amber-300/25"
                aria-hidden="true"
              />
            </div>
          )}
        </motion.div>

        {/* Warstwa gradientu gwarantująca czytelność nakładek */}
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/30"
          aria-hidden="true"
        />

        {!recipe.image_url && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-4 pt-10">
            <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2.5">
              <GlassButton
                type="button"
                variant="secondary"
                size="md"
                isLoading={photoAction === 'search'}
                disabled={photoAction === 'generate' || isUpdatingPhoto}
                loadingText="Szukam zdjęcia..."
                leftIcon={<Globe className="size-4 text-emerald-300" aria-hidden="true" />}
                onClick={() => void handleResolveCoverPhoto(false)}
                className="border-white/35 bg-zinc-950/65 text-white hover:bg-zinc-950/80 dark:border-white/25 dark:bg-zinc-950/75 dark:text-white"
              >
                Znajdź z sieci
              </GlassButton>

              <GlassButton
                type="button"
                variant="secondary"
                size="md"
                isLoading={photoAction === 'generate'}
                disabled={photoAction === 'search' || isUpdatingPhoto}
                loadingText="Generuję..."
                leftIcon={<Sparkles className="size-4 text-amber-300" aria-hidden="true" />}
                onClick={() => void handleResolveCoverPhoto(true)}
                className="border-white/35 bg-zinc-950/65 text-white hover:bg-zinc-950/80 dark:border-white/25 dark:bg-zinc-950/75 dark:text-white"
              >
                Generuj zdjęcie
              </GlassButton>
            </div>
          </div>
        )}

        {/* Pasek górnych akcji na zdjęciu (z zapasem poniżej Dynamic Island na iPhone) */}
        <div className="absolute inset-x-0 top-0 z-10 mx-auto flex max-w-4xl items-center justify-between gap-2 px-4 pt-[calc(env(safe-area-inset-top,0px)+1rem)] sm:px-6">
          <GlassButton
            variant="secondary"
            size="md"
            leftIcon={<ArrowLeft className="size-4" aria-hidden="true" />}
            onClick={onBack}
            className="border-white/30 bg-zinc-950/65 text-white hover:bg-zinc-950/80 dark:border-white/25 dark:bg-zinc-950/70 dark:text-white"
          >
            Przepisy
          </GlassButton>

          <div className="flex items-center gap-2">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                void handlePhotoSelect(file)
                e.target.value = ''
              }}
            />

            <GlassButton
              variant="secondary"
              size="md"
              isLoading={isUpdatingPhoto || photoAction !== null}
              loadingText={photoAction === 'generate' ? 'Generuję...' : photoAction === 'search' ? 'Szukam...' : 'Zapis...'}
              leftIcon={<ImagePlus className="size-4" aria-hidden="true" />}
              onClick={() => setIsPhotoOptionsOpen(true)}
              className="border-white/30 bg-zinc-950/65 text-white hover:bg-zinc-950/80 dark:border-white/25 dark:bg-zinc-950/70 dark:text-white"
            >
              <span className="hidden sm:inline">
                {recipe.image_url ? 'Podmień zdjęcie' : 'Dodaj zdjęcie'}
              </span>
              <span className="sm:hidden">Zdjęcie</span>
            </GlassButton>

            <motion.button
              type="button"
              aria-label={isFavorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
              aria-pressed={isFavorite}
              onClick={() => {
                void onToggleFavorite(recipe.id)
              }}
              whileTap={prefersReducedMotion ? undefined : { scale: 0.85 }}
              transition={{ type: 'spring', stiffness: 520, damping: 24 }}
              className={cn(
                'inline-flex size-11 cursor-pointer items-center justify-center rounded-full',
                'border border-white/30 bg-zinc-950/65 text-white backdrop-blur-xl hover:bg-zinc-950/80',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400',
              )}
            >
              <Heart
                className={cn(
                  'size-5 transition-colors',
                  isFavorite ? 'fill-rose-500 text-rose-500' : 'text-white',
                )}
                aria-hidden="true"
              />
            </motion.button>

            <button
              type="button"
              aria-label="Usuń przepis"
              onClick={() => {
                setDeleteError(null)
                setIsDeleteModalOpen(true)
              }}
              className={cn(
                'inline-flex size-11 cursor-pointer items-center justify-center rounded-full',
                'border border-white/30 bg-zinc-950/65 text-white backdrop-blur-xl hover:bg-red-600/85',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400',
              )}
            >
              <Trash2 className="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Tytuł i metadane na dole zdjęcia */}
        <div className="absolute inset-x-0 bottom-0 z-10 mx-auto max-w-4xl px-4 pb-6 text-white sm:px-6">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            {recipe.category && (
              <span className="rounded-full border border-amber-300/40 bg-amber-500/85 px-3 py-1 text-xs font-semibold tracking-wide text-zinc-950 uppercase">
                {recipe.category}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-zinc-950/70 px-3 py-1 text-xs font-medium text-white backdrop-blur-xl">
              <SourceIcon className="size-3.5 text-amber-300" aria-hidden="true" />
              {sourceLabel}
            </span>
            {totalMinutes > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-zinc-950/70 px-3 py-1 text-xs font-semibold text-white tabular-nums backdrop-blur-xl">
                <Clock className="size-3.5 text-amber-300" aria-hidden="true" />
                {totalMinutes} min
              </span>
            )}
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-4xl">
            {recipe.title}
          </h1>
        </div>
      </div>

      {/* Główna treść szczegółów */}
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pt-6 sm:px-6">
        <div aria-live="polite">
          {photoError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-2xl border border-red-500/35 bg-red-500/12 p-3.5 text-sm font-medium text-red-900 dark:border-red-400/35 dark:bg-red-500/15 dark:text-red-200"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{photoError}</span>
            </div>
          )}
        </div>

        {/* Opis, czasy i interaktywny przelicznik porcji */}
        <GlassCard variant="elevated" padding="md">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2.5">
              {recipe.description && (
                <p className="max-w-xl text-base leading-relaxed text-stone-700 dark:text-stone-200">
                  {recipe.description}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {prepMinutes > 0 && (
                  <GlassPill
                    variant="tag"
                    size="sm"
                    leftIcon={<Clock className="size-3.5 text-amber-700 dark:text-amber-400" aria-hidden="true" />}
                  >
                    <span className="tabular-nums">Przygotowanie: {prepMinutes} min</span>
                  </GlassPill>
                )}
                {cookMinutes > 0 && (
                  <GlassPill
                    variant="tag"
                    size="sm"
                    leftIcon={<Flame className="size-3.5 text-amber-700 dark:text-amber-400" aria-hidden="true" />}
                  >
                    <span className="tabular-nums">Obróbka: {cookMinutes} min</span>
                  </GlassPill>
                )}
                {safeSourceUrl && (
                  <a
                    href={safeSourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/40 bg-white/55 px-3.5 py-1.5 text-xs font-medium text-amber-800 backdrop-blur-xl hover:bg-white/80 dark:border-white/15 dark:bg-zinc-800/60 dark:text-amber-300"
                  >
                    <span>Źródło przepisu</span>
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                )}
              </div>
            </div>

            {/* Interaktywny przelicznik porcji */}
            <div
              className={cn(
                'flex shrink-0 items-center justify-between gap-3 rounded-2xl p-2.5 sm:justify-start',
                'border border-stone-900/10 bg-white/60 dark:border-white/10 dark:bg-white/5',
              )}
            >
              <div className="flex items-center gap-2 pl-1.5 text-sm font-medium text-stone-700 dark:text-stone-200">
                <Users className="size-4 text-amber-700 dark:text-amber-400" aria-hidden="true" />
                <span>Porcje</span>
              </div>

              <div className="flex items-center gap-2">
                <GlassButton
                  type="button"
                  variant="secondary"
                  size="md"
                  aria-label="Zmniejsz liczbę porcji"
                  disabled={targetServings <= 1}
                  onClick={() => setTargetServings((prev) => Math.max(1, prev - 1))}
                  className="size-11 px-0"
                >
                  <Minus className="size-4" aria-hidden="true" />
                </GlassButton>

                <span
                  aria-live="polite"
                  className="min-w-10 text-center text-lg font-semibold text-stone-900 tabular-nums dark:text-stone-50"
                >
                  {targetServings}
                </span>

                <GlassButton
                  type="button"
                  variant="secondary"
                  size="md"
                  aria-label="Zwiększ liczbę porcji"
                  onClick={() => setTargetServings((prev) => Math.min(24, prev + 1))}
                  className="size-11 px-0"
                >
                  <Plus className="size-4" aria-hidden="true" />
                </GlassButton>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Siatka: Składniki + Kroki w stylu Thermomix */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
          {/* Pełna lista składników */}
          <section aria-labelledby="ingredients-heading" className="lg:col-span-5">
            <GlassCard variant="default" padding="md">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2
                  id="ingredients-heading"
                  className="text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-50"
                >
                  Składniki
                </h2>
                <GlassPill variant="tag" size="sm">
                  <span className="tabular-nums">
                    {targetServings} {targetServings === 1 ? 'porcja' : targetServings < 5 ? 'porcje' : 'porcji'}
                  </span>
                </GlassPill>
              </div>

              {recipe.ingredients.length === 0 ? (
                <p className="text-sm text-stone-600 dark:text-stone-300">
                  Ten przepis nie ma jeszcze zapisanej listy składników.
                </p>
              ) : (
                <div className="space-y-5">
                  {groupIngredientsBySection(recipe.ingredients).map((group, groupIdx) => (
                    <div
                      key={group.section ?? `group-${groupIdx}`}
                      className={cn(
                        groupIdx > 0
                          ? 'border-t border-stone-900/10 pt-4 dark:border-white/10'
                          : undefined,
                      )}
                    >
                      {group.section && (
                        <h3 className="mb-2.5 text-sm font-semibold tracking-wide text-amber-800 dark:text-amber-300">
                          {group.section}:
                        </h3>
                      )}

                      <ul className="divide-y divide-stone-900/10 dark:divide-white/10">
                        {group.items.map((ing, index) => {
                          const scaled =
                            ing.amount > 0
                              ? formatScaledAmount(ing.amount, baseServings, targetServings)
                              : ''
                          const amountLabel = scaled
                            ? `${scaled} ${ing.unit}`.trim()
                            : ing.unit || 'wg uznania'

                          return (
                            <li
                              key={`${ing.name}-${index}`}
                              className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
                            >
                              <span className="text-base text-stone-800 dark:text-stone-100">
                                {ing.name}
                              </span>
                              <span className="shrink-0 text-base font-semibold text-amber-800 tabular-nums dark:text-amber-300">
                                {amountLabel}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          </section>

          {/* Lista kroków w stylu Thermomix */}
          <section aria-labelledby="steps-heading" className="space-y-4 lg:col-span-7">
            <div className="flex items-center justify-between px-1">
              <h2
                id="steps-heading"
                className="text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-50"
              >
                Przygotowanie krok po kroku
              </h2>
              <span className="text-sm font-medium text-stone-600 tabular-nums dark:text-stone-300">
                {recipe.steps.length} {recipe.steps.length === 1 ? 'krok' : 'kroków'}
              </span>
            </div>

            {recipe.steps.length === 0 ? (
              <GlassCard variant="default" padding="md">
                <p className="text-sm text-stone-600 dark:text-stone-300">
                  Brak zapisanych kroków przygotowania dla tego przepisu.
                </p>
              </GlassCard>
            ) : (
              <ol className="space-y-4">
                {recipe.steps.map((step) => {
                  const timerLabel = formatTimerLabel(step.timer_seconds)
                  return (
                    <li key={step.step_number}>
                      <GlassCard variant="default" padding="md">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
                              <span className="inline-flex size-7 items-center justify-center rounded-full bg-amber-600 text-xs font-bold text-white dark:bg-amber-500 dark:text-zinc-950">
                                {step.step_number}
                              </span>
                              <span>Krok {step.step_number}</span>
                            </span>

                            {step.timer_seconds > 0 && (
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
                                <span className="tabular-nums">Minutnik: {timerLabel}</span>
                              </GlassPill>
                            )}
                          </div>

                          {/* Przeliczone step_ingredients dla tego kroku */}
                          {step.step_ingredients && step.step_ingredients.length > 0 && (
                            <div className="flex flex-wrap gap-2 rounded-2xl border border-amber-700/15 bg-amber-500/10 p-2.5 dark:border-amber-400/20 dark:bg-amber-500/10">
                              {step.step_ingredients.map((si, siIndex) => {
                                const scaled =
                                  si.amount > 0
                                    ? formatScaledAmount(si.amount, baseServings, targetServings)
                                    : ''
                                const qty = scaled ? `${scaled} ${si.unit}`.trim() : si.unit
                                return (
                                  <span
                                    key={`${si.name}-${siIndex}`}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-white/50 bg-white/75 px-3 py-1 text-xs font-medium text-stone-900 dark:border-white/15 dark:bg-zinc-900/75 dark:text-stone-100"
                                  >
                                    {qty && (
                                      <strong className="font-semibold text-amber-800 tabular-nums dark:text-amber-300">
                                        {qty}
                                      </strong>
                                    )}
                                    <span>{si.name}</span>
                                  </span>
                                )
                              })}
                            </div>
                          )}

                          <p className="text-base leading-relaxed text-stone-900 sm:text-lg dark:text-stone-100">
                            {step.instruction}
                          </p>

                          {step.tip && (
                            <div className="flex items-start gap-2 rounded-2xl border border-emerald-700/15 bg-emerald-500/10 p-3 text-sm text-emerald-950 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                              <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                              <span>{step.tip}</span>
                            </div>
                          )}
                        </div>
                      </GlassCard>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>
        </div>
      </main>

      {/* Pływający asystent głosowej edycji przepisu (nad dolnym CTA) */}
      <RecipeVoiceEditor
        recipe={recipe}
        isOpen={isVoiceEditorOpen}
        onOpenChange={setIsVoiceEditorOpen}
        onApplyChanges={handleApplyVoiceChanges}
      />

      {/* Pływający przycisk na dole ekranu (Thumb Zone) */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex justify-center px-4">
        <div className="pointer-events-auto w-full max-w-md">
          <GlassButton
            type="button"
            variant="primary"
            size="lg"
            fullWidth
            leftIcon={<Play className="size-5 fill-current" aria-hidden="true" />}
            onClick={() => onStartCooking(recipe, targetServings)}
            className="shadow-[0_16px_40px_rgba(180,83,9,0.45)]"
          >
            Rozpocznij gotowanie (Krok po kroku)
          </GlassButton>
        </div>
      </div>

      {/* Modal wyboru źródła zdjęcia potrawy */}
      <GlassModal
        isOpen={isPhotoOptionsOpen}
        onClose={() => setIsPhotoOptionsOpen(false)}
        title="Zdjęcie potrawy"
        subtitle={`Wybierz sposób dodania okładki dla „${recipe.title}”.`}
        size="sm"
      >
        <div className="flex flex-col gap-3">
          <GlassButton
            type="button"
            variant="secondary"
            size="lg"
            fullWidth
            leftIcon={<ImagePlus className="size-5" aria-hidden="true" />}
            onClick={() => {
              setIsPhotoOptionsOpen(false)
              photoInputRef.current?.click()
            }}
          >
            Wybierz z galerii lub aparatu
          </GlassButton>

          <GlassButton
            type="button"
            variant="secondary"
            size="lg"
            fullWidth
            leftIcon={<Globe className="size-5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />}
            onClick={() => void handleResolveCoverPhoto(false)}
          >
            Znajdź zdjęcie w internecie
          </GlassButton>

          <GlassButton
            type="button"
            variant="primary"
            size="lg"
            fullWidth
            leftIcon={<Sparkles className="size-5" aria-hidden="true" />}
            onClick={() => void handleResolveCoverPhoto(true)}
          >
            Generuj zdjęcie AI
          </GlassButton>
        </div>
      </GlassModal>

      {/* Modal potwierdzenia usunięcia przepisu */}
      <GlassModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          if (!isDeleting) setIsDeleteModalOpen(false)
        }}
        title="Usunąć ten przepis?"
        subtitle={`Przepis „${recipe.title}” zostanie trwale usunięty ze wspólnej książki kucharskiej.`}
        size="sm"
        footer={
          <>
            <GlassButton
              variant="ghost"
              size="md"
              disabled={isDeleting}
              onClick={() => setIsDeleteModalOpen(false)}
            >
              Anuluj
            </GlassButton>
            <GlassButton
              variant="danger"
              size="md"
              isLoading={isDeleting}
              loadingText="Usuwanie..."
              leftIcon={<Trash2 className="size-4" aria-hidden="true" />}
              onClick={() => void handleConfirmDelete()}
            >
              Usuń przepis
            </GlassButton>
          </>
        }
      >
        {deleteError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-2xl border border-red-500/35 bg-red-500/12 p-3 text-sm text-red-900 dark:text-red-200"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{deleteError}</span>
          </div>
        )}
      </GlassModal>
    </div>
  )
}
