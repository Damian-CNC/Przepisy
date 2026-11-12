import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import {
  AlertCircle,
  Camera,
  Check,
  Clock,
  ImagePlus,
  Link2,
  PenLine,
  Plus,
  RotateCcw,
  Sparkles,
  Timer,
  Trash2,
  Upload,
} from 'lucide-react'
import { prepareImageForAi, uploadRecipeImage } from '../../lib/imageCompression'
import { groupIngredientsBySection, importRecipeWithAi } from '../../lib/recipesApi'
import type {
  RecipeCategory,
  RecipeIngredient,
  RecipeInsert,
  RecipeRow,
  RecipeStep,
  StepIngredient,
} from '../../lib/supabase'
import { GlassButton, GlassCard, GlassModal, GlassPill, cn } from '../ui'
import { RECIPE_CATEGORIES, formatTimerLabel } from './recipeMeta'

export interface SmartImportModalProps {
  isOpen: boolean
  onClose: () => void
  onSaveRecipe: (payload: RecipeInsert) => Promise<RecipeRow>
  initialUrl?: string
  initialRawText?: string
  autoAnalyze?: boolean
  onAutoAnalyzeConsumed?: () => void
}

type ImportTabId = 'url' | 'photo' | 'manual'

const TABS: ReadonlyArray<{ id: ImportTabId; label: string; Icon: typeof Link2 }> = [
  { id: 'url', label: 'Z linku / Instagrama', Icon: Link2 },
  { id: 'photo', label: 'Ze zdjęcia / Zrzutu', Icon: Camera },
  { id: 'manual', label: 'Wpisz ręcznie', Icon: PenLine },
]

interface ManualIngredientRow {
  id: string
  name: string
  amount: string
  unit: string
  category: string
}

interface ManualStepIngredientRow {
  id: string
  name: string
  amount: string
  unit: string
}

interface ManualStepRow {
  id: string
  instruction: string
  timerSeconds: string
  tip: string
  stepIngredients: ManualStepIngredientRow[]
}

const FIELD_CLASS = cn(
  'w-full min-h-12 rounded-2xl px-4 text-base',
  'bg-white/75 text-stone-900 placeholder:text-stone-500',
  'dark:bg-zinc-950/65 dark:text-stone-50 dark:placeholder:text-stone-400',
  'border border-stone-900/15 dark:border-white/15',
  'transition-colors duration-150',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:focus-visible:outline-amber-400',
)

const COMPACT_FIELD_CLASS = cn(
  'w-full min-h-11 rounded-xl px-3 text-base',
  'bg-white/75 text-stone-900 placeholder:text-stone-500',
  'dark:bg-zinc-950/65 dark:text-stone-50 dark:placeholder:text-stone-400',
  'border border-stone-900/15 dark:border-white/15',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:focus-visible:outline-amber-400',
)

function createEmptyIngredient(): ManualIngredientRow {
  return { id: crypto.randomUUID(), name: '', amount: '', unit: 'g', category: '' }
}

function createEmptyStepIngredient(): ManualStepIngredientRow {
  return { id: crypto.randomUUID(), name: '', amount: '', unit: 'g' }
}

function createEmptyStep(): ManualStepRow {
  return {
    id: crypto.randomUUID(),
    instruction: '',
    timerSeconds: '',
    tip: '',
    stepIngredients: [],
  }
}

function parsePositiveNumber(raw: string, fallback = 0): number {
  const normalized = raw.replace(',', '.').trim()
  if (!normalized) return fallback
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

/**
 * Modal Smart Importer („Jak w ReciMe”) z obsługą URL/IG, zdjęć OCR, formularza ręcznego i podglądu AI.
 */
export function SmartImportModal({
  isOpen,
  onClose,
  onSaveRecipe,
  initialUrl = '',
  initialRawText = '',
  autoAnalyze = false,
  onAutoAnalyzeConsumed,
}: SmartImportModalProps) {
  const baseId = useId()
  const tabRefs = useRef<Partial<Record<ImportTabId, HTMLButtonElement | null>>>({})
  const photoInputRef = useRef<HTMLInputElement>(null)
  const manualCoverInputRef = useRef<HTMLInputElement>(null)
  const previewCoverInputRef = useRef<HTMLInputElement>(null)
  const isMountedRef = useRef(true)
  const wasOpenRef = useRef(false)
  const triggeredAutoAnalyzeKeyRef = useRef<string | null>(null)
  const analyzeAbortRef = useRef<AbortController | null>(null)
  const onAutoAnalyzeConsumedRef = useRef(onAutoAnalyzeConsumed)

  const [activeTab, setActiveTab] = useState<ImportTabId>('url')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Zakładka 1: URL / Instagram
  const [urlInput, setUrlInput] = useState(initialUrl)
  const [rawTextInput, setRawTextInput] = useState(initialRawText)

  // Zakładka 2: Zdjęcie / Zrzut ekranu
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const photoPreviewUrl = useMemo(
    () => (photoFile ? URL.createObjectURL(photoFile) : null),
    [photoFile],
  )

  // Zakładka 3: Formularz ręczny
  const [manualTitle, setManualTitle] = useState('')
  const [manualDescription, setManualDescription] = useState('')
  const [manualCategory, setManualCategory] = useState<RecipeCategory>('Obiad')
  const [manualPrepTime, setManualPrepTime] = useState('15')
  const [manualCookTime, setManualCookTime] = useState('25')
  const [manualServings, setManualServings] = useState('2')
  const [manualCoverFile, setManualCoverFile] = useState<File | null>(null)
  const manualCoverPreviewUrl = useMemo(
    () => (manualCoverFile ? URL.createObjectURL(manualCoverFile) : null),
    [manualCoverFile],
  )
  const [manualIngredients, setManualIngredients] = useState<ManualIngredientRow[]>([
    createEmptyIngredient(),
  ])
  const [manualSteps, setManualSteps] = useState<ManualStepRow[]>([createEmptyStep()])

  // Stan przetwarzania AI i krok podglądu
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isReplacingPreviewCover, setIsReplacingPreviewCover] = useState(false)
  const [previewDraft, setPreviewDraft] = useState<RecipeInsert | null>(null)

  // Zwalnianie ObjectURL dla podglądów lokalnych zdjęć
  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
    }
  }, [photoPreviewUrl])

  useEffect(() => {
    return () => {
      if (manualCoverPreviewUrl) URL.revokeObjectURL(manualCoverPreviewUrl)
    }
  }, [manualCoverPreviewUrl])

  const resetAllState = () => {
    setErrorMessage(null)
    setUrlInput('')
    setRawTextInput('')
    setPhotoFile(null)
    setManualTitle('')
    setManualDescription('')
    setManualCategory('Obiad')
    setManualPrepTime('15')
    setManualCookTime('25')
    setManualServings('2')
    setManualCoverFile(null)
    setManualIngredients([createEmptyIngredient()])
    setManualSteps([createEmptyStep()])
    setPreviewDraft(null)
    setIsAnalyzing(false)
    setIsSaving(false)
    setIsReplacingPreviewCover(false)
  }

  const handleClose = () => {
    if (isAnalyzing || isSaving) return
    resetAllState()
    onClose()
  }

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % TABS.length
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + TABS.length) % TABS.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = TABS.length - 1
    }

    if (nextIndex !== null) {
      event.preventDefault()
      const nextTab = TABS[nextIndex]
      setActiveTab(nextTab.id)
      setErrorMessage(null)
      tabRefs.current[nextTab.id]?.focus()
    }
  }

  useEffect(() => {
    onAutoAnalyzeConsumedRef.current = onAutoAnalyzeConsumed
  }, [onAutoAnalyzeConsumed])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      analyzeAbortRef.current?.abort()
    }
  }, [])

  const handleCancelAnalysis = () => {
    analyzeAbortRef.current?.abort()
    analyzeAbortRef.current = null
    setIsAnalyzing(false)
    setErrorMessage(
      'Przerwano analizę. Możesz wkleić opis rolki ręcznie poniżej lub użyć zakładki „Ze zdjęcia / Zrzutu”.',
    )
  }

  const runUrlAnalysis = useCallback(async (rawUrl: string, rawText: string) => {
    const url = rawUrl.trim()
    const text = rawText.trim()

    if (!url && !text) {
      setErrorMessage('Wklej link do przepisu lub wklej opis rolki Instagrama.')
      return
    }

    analyzeAbortRef.current?.abort()
    const controller = new AbortController()
    analyzeAbortRef.current = controller

    setErrorMessage(null)
    setIsAnalyzing(true)

    try {
      const draft = await importRecipeWithAi({
        url: url || undefined,
        rawText: text || undefined,
        signal: controller.signal,
      })
      if (!isMountedRef.current) return
      setPreviewDraft(draft)
    } catch (err) {
      if (!isMountedRef.current) return
      setErrorMessage(
        err instanceof Error && err.message
          ? err.message
          : 'Nie udało się przeanalizować linku przez AI.',
      )
    } finally {
      if (analyzeAbortRef.current === controller) {
        analyzeAbortRef.current = null
      }
      if (isMountedRef.current) {
        setIsAnalyzing(false)
      }
    }
  }, [])

  // Synchronizacja parametrów Share Target / Skrótu iOS i automatyczne uruchomienie AI przy otwarciu modala
  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false
      triggeredAutoAnalyzeKeyRef.current = null
      return
    }

    const trimmedUrl = initialUrl.trim()
    const trimmedRawText = initialRawText.trim()
    const hasIncomingContent = Boolean(trimmedUrl || trimmedRawText)
    const justOpened = !wasOpenRef.current
    wasOpenRef.current = true

    if (hasIncomingContent && (justOpened || autoAnalyze)) {
      setUrlInput(initialUrl)
      setRawTextInput(initialRawText)
      setActiveTab('url')
      setErrorMessage(null)
      setPreviewDraft(null)
    } else if (justOpened) {
      setActiveTab('url')
    }

    if (autoAnalyze && hasIncomingContent) {
      const payloadKey = `${trimmedUrl}\n${trimmedRawText}`
      if (triggeredAutoAnalyzeKeyRef.current === payloadKey) {
        return
      }
      triggeredAutoAnalyzeKeyRef.current = payloadKey
      onAutoAnalyzeConsumedRef.current?.()
      void runUrlAnalysis(trimmedUrl, trimmedRawText)
    }
  }, [isOpen, initialUrl, initialRawText, autoAnalyze, runUrlAnalysis])

  const handleAnalyzeUrl = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isAnalyzing) return
    await runUrlAnalysis(urlInput, rawTextInput)
  }

  const handleAnalyzePhoto = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isAnalyzing) return

    if (!photoFile) {
      setErrorMessage('Wybierz zdjęcie przepisu lub zrzut ekranu z galerii.')
      return
    }

    setErrorMessage(null)
    setIsAnalyzing(true)

    try {
      const prepared = await prepareImageForAi(photoFile)

      const [aiResult, uploadResult] = await Promise.allSettled([
        importRecipeWithAi({
          imageBase64: prepared.base64,
          mimeType: prepared.mimeType,
        }),
        uploadRecipeImage(photoFile, 'recipes'),
      ])

      if (aiResult.status === 'rejected') {
        throw aiResult.reason instanceof Error
          ? aiResult.reason
          : new Error('Nie udało się odczytać przepisu ze zdjęcia.')
      }

      const uploadedUrl =
        uploadResult.status === 'fulfilled' ? uploadResult.value : null

      setPreviewDraft({
        ...aiResult.value,
        source_platform: 'photo',
        image_url: uploadedUrl ?? aiResult.value.image_url ?? null,
      })

      if (uploadResult.status === 'rejected') {
        setErrorMessage(
          'Przepis został odczytany, ale nie udało się wysłać okładki. Możesz dodać zdjęcie ręcznie poniżej.',
        )
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error && err.message
          ? err.message
          : 'Nie udało się przetworzyć zdjęcia przez AI.',
      )
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleReplacePreviewCover = async (file: File | undefined) => {
    if (!file || !previewDraft) return
    setIsReplacingPreviewCover(true)
    setErrorMessage(null)

    try {
      const uploadedUrl = await uploadRecipeImage(file, 'recipes')
      setPreviewDraft((prev) => (prev ? { ...prev, image_url: uploadedUrl } : prev))
    } catch (err) {
      setErrorMessage(
        err instanceof Error && err.message
          ? err.message
          : 'Nie udało się wysłać nowej okładki.',
      )
    } finally {
      setIsReplacingPreviewCover(false)
    }
  }

  const handleSavePreviewDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!previewDraft || isSaving) return

    const cleanTitle = previewDraft.title.trim()
    if (!cleanTitle) {
      setErrorMessage('Podaj tytuł przepisu przed zapisem.')
      return
    }

    setErrorMessage(null)
    setIsSaving(true)

    try {
      await onSaveRecipe({
        ...previewDraft,
        title: cleanTitle,
      })
      resetAllState()
      onClose()
    } catch (err) {
      setErrorMessage(
        err instanceof Error && err.message
          ? err.message
          : 'Nie udało się zapisać przepisu w bazie.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveManual = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSaving) return

    const cleanTitle = manualTitle.trim()
    if (!cleanTitle) {
      setErrorMessage('Wpisz nazwę potrawy.')
      return
    }

    const parsedIngredients: RecipeIngredient[] = manualIngredients
      .map((item) => {
        const category = item.category.trim().replace(/:+$/, '')
        return {
          name: item.name.trim(),
          amount: parsePositiveNumber(item.amount, 0),
          unit: item.unit.trim(),
          ...(category ? { category } : {}),
        }
      })
      .filter((item) => item.name.length > 0)

    const parsedSteps: RecipeStep[] = manualSteps
      .map((step, index) => {
        const stepIngredients: StepIngredient[] = step.stepIngredients
          .map((ing) => ({
            name: ing.name.trim(),
            amount: parsePositiveNumber(ing.amount, 0),
            unit: ing.unit.trim(),
          }))
          .filter((ing) => ing.name.length > 0)

        return {
          step_number: index + 1,
          instruction: step.instruction.trim(),
          step_ingredients: stepIngredients,
          timer_seconds: Math.round(parsePositiveNumber(step.timerSeconds, 0)),
          tip: step.tip.trim() || null,
        }
      })
      .filter((step) => step.instruction.length > 0)
      .map((step, index) => ({ ...step, step_number: index + 1 }))

    if (parsedSteps.length === 0) {
      setErrorMessage('Dodaj przynajmniej jeden krok przygotowania.')
      return
    }

    setErrorMessage(null)
    setIsSaving(true)

    try {
      let uploadedCoverUrl: string | null = null
      if (manualCoverFile) {
        uploadedCoverUrl = await uploadRecipeImage(manualCoverFile, 'recipes')
      }

      const payload: RecipeInsert = {
        title: cleanTitle,
        description: manualDescription.trim() || null,
        source_platform: 'manual',
        image_url: uploadedCoverUrl,
        prep_time_minutes: Math.round(parsePositiveNumber(manualPrepTime, 0)),
        cook_time_minutes: Math.round(parsePositiveNumber(manualCookTime, 0)),
        servings: Math.max(1, Math.round(parsePositiveNumber(manualServings, 2))),
        category: manualCategory,
        tags: [],
        is_favorite: false,
        ingredients: parsedIngredients,
        steps: parsedSteps,
      }

      await onSaveRecipe(payload)
      resetAllState()
      onClose()
    } catch (err) {
      setErrorMessage(
        err instanceof Error && err.message
          ? err.message
          : 'Nie udało się zapisać przepisu.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={handleClose}
      title={previewDraft ? 'Podgląd przetworzonego przepisu' : 'Dodaj nowy przepis'}
      subtitle={
        previewDraft
          ? 'Sprawdź przetłumaczone składniki i kroki przed zapisaniem w książce.'
          : 'Wklej link, zrób zdjęcie książki kucharskiej albo wpisz przepis ręcznie.'
      }
      size="lg"
      closedBy={isAnalyzing || isSaving ? 'none' : 'any'}
    >
      <div className="flex flex-col gap-5">
        {/* Komunikat błędu */}
        <div aria-live="polite">
          {errorMessage && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-2xl border border-red-500/35 bg-red-500/12 p-3.5 text-sm font-medium text-red-900 dark:border-red-400/35 dark:bg-red-500/15 dark:text-red-200"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Stan ładowania AI z efektem MagicUI shimmer */}
        {isAnalyzing ? (
          <GlassCard variant="elevated" padding="lg" className="magic-shimmer">
            <div role="status" aria-live="polite" className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="inline-flex size-16 items-center justify-center rounded-3xl border border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300">
                <Sparkles className="size-8 animate-pulse motion-reduce:animate-none" aria-hidden="true" />
              </div>

              <div className="space-y-1.5">
                <p className="text-lg font-semibold text-stone-900 dark:text-stone-50">
                  AI mieli przepis, tłumaczy na polski i przelicza składniki...
                </p>
                <p className="text-sm text-stone-600 dark:text-stone-300">
                  Dzielimy też instrukcje na wygodne kroki z minutnikami. To potrwa tylko chwilę.
                </p>
              </div>

              <progress
                aria-label="Trwa przetwarzanie przepisu przez AI"
                className="h-2 w-full max-w-xs overflow-hidden rounded-full accent-amber-600 dark:accent-amber-400"
              />

              <GlassButton
                type="button"
                variant="ghost"
                size="md"
                onClick={handleCancelAnalysis}
              >
                Anuluj analizę
              </GlassButton>
            </div>
          </GlassCard>
        ) : previewDraft ? (
          /* Krok podglądu przed zapisem */
          <form onSubmit={handleSavePreviewDraft} className="flex flex-col gap-5">
            {/* Okładka z opcją podmiany */}
            <div className="relative overflow-hidden rounded-2xl border border-white/40 bg-gradient-to-br from-amber-200/70 via-orange-100/70 to-emerald-100/70 dark:border-white/15 dark:from-amber-950/70 dark:via-stone-900 dark:to-emerald-950/60">
              {previewDraft.image_url ? (
                <img
                  src={previewDraft.image_url}
                  alt={previewDraft.title}
                  className="aspect-[16/9] max-h-56 w-full object-cover"
                />
              ) : (
                <div className="flex h-36 items-center justify-center text-sm text-stone-600 dark:text-stone-300">
                  Brak zdjęcia okładki — możesz je dodać teraz
                </div>
              )}

              <div className="absolute right-3 bottom-3">
                <input
                  ref={previewCoverInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    void handleReplacePreviewCover(file)
                    e.target.value = ''
                  }}
                />
                <GlassButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  isLoading={isReplacingPreviewCover}
                  loadingText="Wysyłanie..."
                  leftIcon={<ImagePlus className="size-4" aria-hidden="true" />}
                  onClick={() => previewCoverInputRef.current?.click()}
                >
                  {previewDraft.image_url ? 'Podmień okładkę' : 'Dodaj okładkę'}
                </GlassButton>
              </div>
            </div>

            {/* Edycja podstawowych danych */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label
                  htmlFor={`${baseId}-preview-title`}
                  className="text-sm font-medium text-stone-800 dark:text-stone-200"
                >
                  Tytuł przepisu
                </label>
                <input
                  id={`${baseId}-preview-title`}
                  type="text"
                  required
                  value={previewDraft.title}
                  onChange={(e) =>
                    setPreviewDraft((prev) => (prev ? { ...prev, title: e.target.value } : prev))
                  }
                  className={FIELD_CLASS}
                />
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label
                  htmlFor={`${baseId}-preview-desc`}
                  className="text-sm font-medium text-stone-800 dark:text-stone-200"
                >
                  Krótki opis
                </label>
                <textarea
                  id={`${baseId}-preview-desc`}
                  rows={2}
                  value={previewDraft.description ?? ''}
                  onChange={(e) =>
                    setPreviewDraft((prev) =>
                      prev ? { ...prev, description: e.target.value || null } : prev,
                    )
                  }
                  className={cn(FIELD_CLASS, 'min-h-20 py-3')}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`${baseId}-preview-category`}
                  className="text-sm font-medium text-stone-800 dark:text-stone-200"
                >
                  Kategoria
                </label>
                <select
                  id={`${baseId}-preview-category`}
                  value={previewDraft.category ?? 'Obiad'}
                  onChange={(e) =>
                    setPreviewDraft((prev) =>
                      prev ? { ...prev, category: e.target.value as RecipeCategory } : prev,
                    )
                  }
                  className={FIELD_CLASS}
                >
                  {RECIPE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor={`${baseId}-preview-prep`}
                    className="text-xs font-medium text-stone-700 dark:text-stone-300"
                  >
                    Przygot. (min)
                  </label>
                  <input
                    id={`${baseId}-preview-prep`}
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={previewDraft.prep_time_minutes ?? 0}
                    onChange={(e) =>
                      setPreviewDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              prep_time_minutes: Math.max(0, Number(e.target.value) || 0),
                            }
                          : prev,
                      )
                    }
                    className={COMPACT_FIELD_CLASS}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor={`${baseId}-preview-cook`}
                    className="text-xs font-medium text-stone-700 dark:text-stone-300"
                  >
                    Gotow. (min)
                  </label>
                  <input
                    id={`${baseId}-preview-cook`}
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={previewDraft.cook_time_minutes ?? 0}
                    onChange={(e) =>
                      setPreviewDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              cook_time_minutes: Math.max(0, Number(e.target.value) || 0),
                            }
                          : prev,
                      )
                    }
                    className={COMPACT_FIELD_CLASS}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor={`${baseId}-preview-servings`}
                    className="text-xs font-medium text-stone-700 dark:text-stone-300"
                  >
                    Porcje
                  </label>
                  <input
                    id={`${baseId}-preview-servings`}
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={previewDraft.servings ?? 2}
                    onChange={(e) =>
                      setPreviewDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              servings: Math.max(1, Number(e.target.value) || 1),
                            }
                          : prev,
                      )
                    }
                    className={COMPACT_FIELD_CLASS}
                  />
                </div>
              </div>
            </div>

            {/* Podgląd składników i kroków */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <GlassCard variant="default" padding="sm">
                <h3 className="mb-2.5 text-sm font-semibold tracking-wide text-stone-700 uppercase dark:text-stone-300">
                  Składniki ({previewDraft.ingredients?.length ?? 0})
                </h3>
                <div className="space-y-3">
                  {groupIngredientsBySection(previewDraft.ingredients ?? []).map(
                    (group, groupIdx) => (
                      <div
                        key={group.section ?? `preview-group-${groupIdx}`}
                        className={cn(
                          groupIdx > 0
                            ? 'border-t border-stone-900/10 pt-2.5 dark:border-white/10'
                            : undefined,
                        )}
                      >
                        {group.section && (
                          <p className="mb-1.5 text-xs font-semibold tracking-wide text-amber-800 dark:text-amber-300">
                            {group.section}:
                          </p>
                        )}
                        <ul className="space-y-1.5 text-sm text-stone-800 dark:text-stone-200">
                          {group.items.map((ing, idx) => (
                            <li key={`${ing.name}-${idx}`} className="flex justify-between gap-2">
                              <span>{ing.name}</span>
                              <span className="shrink-0 font-semibold tabular-nums text-amber-800 dark:text-amber-300">
                                {ing.amount > 0
                                  ? `${ing.amount} ${ing.unit}`.trim()
                                  : ing.unit || 'wg uznania'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ),
                  )}
                </div>
              </GlassCard>

              <GlassCard variant="default" padding="sm">
                <h3 className="mb-2.5 text-sm font-semibold tracking-wide text-stone-700 uppercase dark:text-stone-300">
                  Kroki ({previewDraft.steps?.length ?? 0})
                </h3>
                <ol className="space-y-2.5 text-sm text-stone-800 dark:text-stone-200">
                  {(previewDraft.steps ?? []).map((step) => (
                    <li key={step.step_number} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-600 text-xs font-semibold text-white dark:bg-amber-500 dark:text-zinc-950">
                          {step.step_number}
                        </span>
                        {step.timer_seconds > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-900 tabular-nums dark:text-amber-200">
                            <Timer className="size-3" aria-hidden="true" />
                            {formatTimerLabel(step.timer_seconds)}
                          </span>
                        )}
                      </div>
                      <p className="leading-relaxed">{step.instruction}</p>
                    </li>
                  ))}
                </ol>
              </GlassCard>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-900/10 pt-4 dark:border-white/10">
              <GlassButton
                type="button"
                variant="ghost"
                size="md"
                leftIcon={<RotateCcw className="size-4" aria-hidden="true" />}
                onClick={() => setPreviewDraft(null)}
              >
                Wróć do wyboru
              </GlassButton>

              <GlassButton
                type="submit"
                variant="primary"
                size="lg"
                isLoading={isSaving}
                loadingText="Zapisywanie..."
                leftIcon={<Check className="size-5" aria-hidden="true" />}
              >
                Zapisz w naszej książce
              </GlassButton>
            </div>
          </form>
        ) : (
          /* 3 zakładki w szklanej kapsule */
          <>
            <div
              role="tablist"
              aria-label="Sposób dodania przepisu"
              className={cn(
                'flex items-center gap-1.5 overflow-x-auto rounded-full p-1.5',
                'backdrop-blur-2xl backdrop-saturate-150',
                'bg-stone-900/5 dark:bg-white/5',
                'border border-white/45 dark:border-white/15',
              )}
            >
              {TABS.map((tab, index) => {
                const isSelected = activeTab === tab.id
                const TabIcon = tab.Icon
                const tabDomId = `${baseId}-tab-${tab.id}`
                const panelDomId = `${baseId}-panel-${tab.id}`

                return (
                  <button
                    key={tab.id}
                    ref={(el) => {
                      tabRefs.current[tab.id] = el
                    }}
                    id={tabDomId}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    aria-controls={panelDomId}
                    tabIndex={isSelected ? 0 : -1}
                    onClick={() => {
                      setActiveTab(tab.id)
                      setErrorMessage(null)
                    }}
                    onKeyDown={(e) => handleTabKeyDown(e, index)}
                    className={cn(
                      'relative inline-flex min-h-11 flex-1 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:focus-visible:outline-amber-400',
                      isSelected
                        ? cn(
                            'bg-stone-900 text-white dark:bg-amber-500 dark:text-zinc-950',
                            'border border-stone-900 dark:border-amber-300',
                            'after:absolute after:inset-x-5 after:bottom-1 after:border-b-2 after:border-amber-400 dark:after:border-zinc-950',
                          )
                        : 'border border-transparent text-stone-700 hover:bg-white/55 dark:text-stone-300 dark:hover:bg-white/10',
                    )}
                  >
                    <TabIcon className="size-4 shrink-0" aria-hidden="true" />
                    <span>{tab.label}</span>
                  </button>
                )
              })}
            </div>

            {/* Panel 1: Z linku / Instagrama */}
            <div
              id={`${baseId}-panel-url`}
              role="tabpanel"
              aria-labelledby={`${baseId}-tab-url`}
              hidden={activeTab !== 'url'}
            >
              {activeTab === 'url' && (
                <form onSubmit={handleAnalyzeUrl} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor={`${baseId}-import-url`}
                      className="text-sm font-medium text-stone-800 dark:text-stone-200"
                    >
                      Link do rolki Instagrama lub strony z przepisem
                    </label>
                    <input
                      id={`${baseId}-import-url`}
                      name="url"
                      type="url"
                      inputMode="url"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      enterKeyHint="next"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="https://www.instagram.com/reel/..."
                      className={FIELD_CLASS}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor={`${baseId}-import-raw`}
                      className="text-sm font-medium text-stone-800 dark:text-stone-200"
                    >
                      Skopiowany opis rolki lub lista składników (opcjonalnie)
                    </label>
                    <textarea
                      id={`${baseId}-import-raw`}
                      name="rawText"
                      rows={4}
                      value={rawTextInput}
                      onChange={(e) => setRawTextInput(e.target.value)}
                      placeholder="Jeśli konto na Instagramie jest prywatne lub blokuje podgląd, wklej tutaj opis spod filmiku — AI przetłumaczy go na polski i podzieli na kroki."
                      className={cn(FIELD_CLASS, 'min-h-28 py-3')}
                    />
                  </div>

                  <div className="flex justify-end pt-2">
                    <GlassButton
                      type="submit"
                      variant="primary"
                      size="lg"
                      fullWidth
                      leftIcon={<Sparkles className="size-5" aria-hidden="true" />}
                    >
                      Przetwórz przepis z AI
                    </GlassButton>
                  </div>
                </form>
              )}
            </div>

            {/* Panel 2: Ze zdjęcia / Zrzutu ekranu */}
            <div
              id={`${baseId}-panel-photo`}
              role="tabpanel"
              aria-labelledby={`${baseId}-tab-photo`}
              hidden={activeTab !== 'photo'}
            >
              {activeTab === 'photo' && (
                <form onSubmit={handleAnalyzePhoto} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <label
                      htmlFor={`${baseId}-photo-file`}
                      className="text-sm font-medium text-stone-800 dark:text-stone-200"
                    >
                      Zdjęcie strony z książki kucharskiej lub zrzut ekranu
                    </label>

                    <input
                      ref={photoInputRef}
                      id={`${baseId}-photo-file`}
                      name="photo"
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null
                        setPhotoFile(file)
                        setErrorMessage(null)
                      }}
                    />

                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className={cn(
                        'flex min-h-40 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed p-5 text-center transition-colors',
                        'border-amber-700/35 bg-white/55 hover:bg-white/80',
                        'dark:border-amber-400/35 dark:bg-zinc-950/45 dark:hover:bg-zinc-900/75',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:focus-visible:outline-amber-400',
                      )}
                    >
                      {photoPreviewUrl ? (
                        <div className="flex w-full flex-col items-center gap-3">
                          <img
                            src={photoPreviewUrl}
                            alt="Podgląd wybranego zdjęcia przepisu"
                            className="max-h-52 rounded-2xl object-contain shadow-md"
                          />
                          <GlassPill
                            variant="tag"
                            size="sm"
                            leftIcon={<Upload className="size-3.5" aria-hidden="true" />}
                          >
                            Zmień zdjęcie ({photoFile?.name})
                          </GlassPill>
                        </div>
                      ) : (
                        <>
                          <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
                            <Camera className="size-7" aria-hidden="true" />
                          </span>
                          <div className="space-y-1">
                            <p className="text-base font-semibold text-stone-900 dark:text-stone-50">
                              Wybierz z galerii lub zrób zdjęcie
                            </p>
                            <p className="text-sm text-stone-600 dark:text-stone-300">
                              Automatycznie skompresujemy obraz do WebP i odczytamy przepis przez Gemini OCR.
                            </p>
                          </div>
                        </>
                      )}
                    </button>
                  </div>

                  <GlassButton
                    type="submit"
                    variant="primary"
                    size="lg"
                    fullWidth
                    leftIcon={<Sparkles className="size-5" aria-hidden="true" />}
                  >
                    Odczytaj i przetłumacz zdjęcie
                  </GlassButton>
                </form>
              )}
            </div>

            {/* Panel 3: Wpisz ręcznie */}
            <div
              id={`${baseId}-panel-manual`}
              role="tabpanel"
              aria-labelledby={`${baseId}-tab-manual`}
              hidden={activeTab !== 'manual'}
            >
              {activeTab === 'manual' && (
                <form onSubmit={handleSaveManual} className="flex flex-col gap-5">
                  {/* Podstawowe dane */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <label
                        htmlFor={`${baseId}-manual-title`}
                        className="text-sm font-medium text-stone-800 dark:text-stone-200"
                      >
                        Nazwa potrawy
                      </label>
                      <input
                        id={`${baseId}-manual-title`}
                        type="text"
                        required
                        value={manualTitle}
                        onChange={(e) => setManualTitle(e.target.value)}
                        placeholder="np. Makaron z palonym masłem i szałwią"
                        className={FIELD_CLASS}
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <label
                        htmlFor={`${baseId}-manual-desc`}
                        className="text-sm font-medium text-stone-800 dark:text-stone-200"
                      >
                        Opis (opcjonalnie)
                      </label>
                      <textarea
                        id={`${baseId}-manual-desc`}
                        rows={2}
                        value={manualDescription}
                        onChange={(e) => setManualDescription(e.target.value)}
                        placeholder="Krótka notatka domowa lub wskazówka..."
                        className={cn(FIELD_CLASS, 'min-h-20 py-3')}
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label
                        htmlFor={`${baseId}-manual-category`}
                        className="text-sm font-medium text-stone-800 dark:text-stone-200"
                      >
                        Kategoria
                      </label>
                      <select
                        id={`${baseId}-manual-category`}
                        value={manualCategory}
                        onChange={(e) => setManualCategory(e.target.value as RecipeCategory)}
                        className={FIELD_CLASS}
                      >
                        {RECIPE_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="flex flex-col gap-1.5">
                        <label
                          htmlFor={`${baseId}-manual-prep`}
                          className="text-xs font-medium text-stone-700 dark:text-stone-300"
                        >
                          Przygot. (min)
                        </label>
                        <input
                          id={`${baseId}-manual-prep`}
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={manualPrepTime}
                          onChange={(e) => setManualPrepTime(e.target.value)}
                          className={COMPACT_FIELD_CLASS}
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label
                          htmlFor={`${baseId}-manual-cook`}
                          className="text-xs font-medium text-stone-700 dark:text-stone-300"
                        >
                          Gotow. (min)
                        </label>
                        <input
                          id={`${baseId}-manual-cook`}
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={manualCookTime}
                          onChange={(e) => setManualCookTime(e.target.value)}
                          className={COMPACT_FIELD_CLASS}
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label
                          htmlFor={`${baseId}-manual-servings`}
                          className="text-xs font-medium text-stone-700 dark:text-stone-300"
                        >
                          Porcje
                        </label>
                        <input
                          id={`${baseId}-manual-servings`}
                          type="number"
                          min={1}
                          inputMode="numeric"
                          value={manualServings}
                          onChange={(e) => setManualServings(e.target.value)}
                          className={COMPACT_FIELD_CLASS}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Okładka ręczna */}
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium text-stone-800 dark:text-stone-200">
                      Zdjęcie potrawy (opcjonalnie)
                    </span>
                    <input
                      ref={manualCoverInputRef}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => setManualCoverFile(e.target.files?.[0] ?? null)}
                    />
                    <div className="flex flex-wrap items-center gap-3">
                      <GlassButton
                        type="button"
                        variant="secondary"
                        size="md"
                        leftIcon={<ImagePlus className="size-4" aria-hidden="true" />}
                        onClick={() => manualCoverInputRef.current?.click()}
                      >
                        {manualCoverPreviewUrl ? 'Zmień okładkę' : 'Dodaj okładkę'}
                      </GlassButton>
                      {manualCoverPreviewUrl && (
                        <div className="flex items-center gap-2">
                          <img
                            src={manualCoverPreviewUrl}
                            alt="Podgląd wybranej okładki"
                            className="size-12 rounded-xl object-cover"
                          />
                          <GlassButton
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setManualCoverFile(null)}
                          >
                            Usuń
                          </GlassButton>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Składniki */}
                  <fieldset className="space-y-3 rounded-2xl border border-stone-900/10 p-4 dark:border-white/10">
                    <legend className="px-1 text-sm font-semibold text-stone-900 dark:text-stone-100">
                      Składniki
                    </legend>
                    <div className="space-y-3">
                      {manualIngredients.map((ing, index) => (
                        <div key={ing.id} className="space-y-1.5">
                          <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_3.75rem_2.75rem] items-center gap-1.5 sm:gap-2">
                            <input
                              type="text"
                              aria-label={`Nazwa składnika ${index + 1}`}
                              value={ing.name}
                              onChange={(e) =>
                                setManualIngredients((prev) =>
                                  prev.map((row) =>
                                    row.id === ing.id ? { ...row, name: e.target.value } : row,
                                  ),
                                )
                              }
                              placeholder="Składnik (np. Masło)"
                              className={COMPACT_FIELD_CLASS}
                            />
                            <input
                              type="text"
                              inputMode="decimal"
                              aria-label={`Ilość składnika ${index + 1}`}
                              value={ing.amount}
                              onChange={(e) =>
                                setManualIngredients((prev) =>
                                  prev.map((row) =>
                                    row.id === ing.id ? { ...row, amount: e.target.value } : row,
                                  ),
                                )
                              }
                              placeholder="Ilość"
                              className={COMPACT_FIELD_CLASS}
                            />
                            <input
                              type="text"
                              aria-label={`Jednostka składnika ${index + 1}`}
                              value={ing.unit}
                              onChange={(e) =>
                                setManualIngredients((prev) =>
                                  prev.map((row) =>
                                    row.id === ing.id ? { ...row, unit: e.target.value } : row,
                                  ),
                                )
                              }
                              placeholder="Jedn."
                              className={COMPACT_FIELD_CLASS}
                            />
                            <button
                              type="button"
                              aria-label={`Usuń składnik ${index + 1}`}
                              disabled={manualIngredients.length <= 1}
                              onClick={() =>
                                setManualIngredients((prev) =>
                                  prev.filter((row) => row.id !== ing.id),
                                )
                              }
                              className="inline-flex size-11 cursor-pointer items-center justify-center rounded-xl text-stone-500 hover:bg-red-500/10 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-35 dark:text-stone-400"
                            >
                              <Trash2 className="size-4" aria-hidden="true" />
                            </button>
                          </div>
                          <input
                            type="text"
                            aria-label={`Sekcja składnika ${index + 1} (opcjonalnie)`}
                            value={ing.category}
                            onChange={(e) =>
                              setManualIngredients((prev) =>
                                prev.map((row) =>
                                  row.id === ing.id ? { ...row, category: e.target.value } : row,
                                ),
                              )
                            }
                            placeholder="Sekcja (opcjonalnie, np. Zaparka, Ciasto, Farsz)"
                            className={cn(COMPACT_FIELD_CLASS, 'min-h-9 text-sm')}
                          />
                        </div>
                      ))}
                    </div>

                    <GlassButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      leftIcon={<Plus className="size-4" aria-hidden="true" />}
                      onClick={() =>
                        setManualIngredients((prev) => [...prev, createEmptyIngredient()])
                      }
                    >
                      Dodaj składnik
                    </GlassButton>
                  </fieldset>

                  {/* Kroki przygotowania */}
                  <fieldset className="space-y-3 rounded-2xl border border-stone-900/10 p-4 dark:border-white/10">
                    <legend className="px-1 text-sm font-semibold text-stone-900 dark:text-stone-100">
                      Kroki przygotowania
                    </legend>
                    <div className="space-y-4">
                      {manualSteps.map((step, stepIdx) => (
                        <div
                          key={step.id}
                          className="space-y-3 rounded-2xl border border-stone-900/10 bg-white/45 p-3.5 dark:border-white/10 dark:bg-white/5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                              Krok {stepIdx + 1}
                            </span>
                            <button
                              type="button"
                              aria-label={`Usuń krok ${stepIdx + 1}`}
                              disabled={manualSteps.length <= 1}
                              onClick={() =>
                                setManualSteps((prev) =>
                                  prev.filter((row) => row.id !== step.id),
                                )
                              }
                              className="inline-flex size-11 cursor-pointer items-center justify-center rounded-xl text-stone-500 hover:bg-red-500/10 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-35 dark:text-stone-400"
                            >
                              <Trash2 className="size-4" aria-hidden="true" />
                            </button>
                          </div>

                          <textarea
                            rows={2}
                            required
                            aria-label={`Instrukcja dla kroku ${stepIdx + 1}`}
                            value={step.instruction}
                            onChange={(e) =>
                              setManualSteps((prev) =>
                                prev.map((row) =>
                                  row.id === step.id
                                    ? { ...row, instruction: e.target.value }
                                    : row,
                                ),
                              )
                            }
                            placeholder="Co trzeba zrobić w tym kroku?"
                            className={cn(FIELD_CLASS, 'min-h-20 py-2.5')}
                          />

                          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                            <div className="flex items-center gap-2">
                              <Clock className="size-4 shrink-0 text-stone-500" aria-hidden="true" />
                              <input
                                type="number"
                                min={0}
                                inputMode="numeric"
                                aria-label={`Czas minutnika w sekundach dla kroku ${stepIdx + 1}`}
                                value={step.timerSeconds}
                                onChange={(e) =>
                                  setManualSteps((prev) =>
                                    prev.map((row) =>
                                      row.id === step.id
                                        ? { ...row, timerSeconds: e.target.value }
                                        : row,
                                    ),
                                  )
                                }
                                placeholder="Minutnik w sek. (np. 300)"
                                className={COMPACT_FIELD_CLASS}
                              />
                            </div>

                            <input
                              type="text"
                              aria-label={`Wskazówka dla kroku ${stepIdx + 1}`}
                              value={step.tip}
                              onChange={(e) =>
                                setManualSteps((prev) =>
                                  prev.map((row) =>
                                    row.id === step.id ? { ...row, tip: e.target.value } : row,
                                  ),
                                )
                              }
                              placeholder="Wskazówka kuchenna (opcjonalnie)"
                              className={COMPACT_FIELD_CLASS}
                            />
                          </div>

                          {/* Składniki dodawane w tym kroku */}
                          {step.stepIngredients.length > 0 && (
                            <div className="space-y-2 border-t border-stone-900/10 pt-2.5 dark:border-white/10">
                              <p className="text-xs font-medium text-stone-600 dark:text-stone-300">
                                Składniki używane w tym kroku:
                              </p>
                              {step.stepIngredients.map((si, siIdx) => (
                                <div key={si.id} className="grid grid-cols-[minmax(0,1fr)_4.5rem_3.75rem_2.75rem] items-center gap-1.5">
                                  <input
                                    type="text"
                                    aria-label={`Składnik kroku ${stepIdx + 1}, pozycja ${siIdx + 1}`}
                                    value={si.name}
                                    onChange={(e) =>
                                      setManualSteps((prev) =>
                                        prev.map((row) =>
                                          row.id === step.id
                                            ? {
                                                ...row,
                                                stepIngredients: row.stepIngredients.map((item) =>
                                                  item.id === si.id
                                                    ? { ...item, name: e.target.value }
                                                    : item,
                                                ),
                                              }
                                            : row,
                                        ),
                                      )
                                    }
                                    placeholder="Nazwa"
                                    className={COMPACT_FIELD_CLASS}
                                  />
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    aria-label={`Ilość składnika kroku ${stepIdx + 1}, pozycja ${siIdx + 1}`}
                                    value={si.amount}
                                    onChange={(e) =>
                                      setManualSteps((prev) =>
                                        prev.map((row) =>
                                          row.id === step.id
                                            ? {
                                                ...row,
                                                stepIngredients: row.stepIngredients.map((item) =>
                                                  item.id === si.id
                                                    ? { ...item, amount: e.target.value }
                                                    : item,
                                                ),
                                              }
                                            : row,
                                        ),
                                      )
                                    }
                                    placeholder="Ilość"
                                    className={COMPACT_FIELD_CLASS}
                                  />
                                  <input
                                    type="text"
                                    aria-label={`Jednostka składnika kroku ${stepIdx + 1}, pozycja ${siIdx + 1}`}
                                    value={si.unit}
                                    onChange={(e) =>
                                      setManualSteps((prev) =>
                                        prev.map((row) =>
                                          row.id === step.id
                                            ? {
                                                ...row,
                                                stepIngredients: row.stepIngredients.map((item) =>
                                                  item.id === si.id
                                                    ? { ...item, unit: e.target.value }
                                                    : item,
                                                ),
                                              }
                                            : row,
                                        ),
                                      )
                                    }
                                    placeholder="Jedn."
                                    className={COMPACT_FIELD_CLASS}
                                  />
                                  <button
                                    type="button"
                                    aria-label={`Usuń składnik kroku ${siIdx + 1}`}
                                    onClick={() =>
                                      setManualSteps((prev) =>
                                        prev.map((row) =>
                                          row.id === step.id
                                            ? {
                                                ...row,
                                                stepIngredients: row.stepIngredients.filter(
                                                  (item) => item.id !== si.id,
                                                ),
                                              }
                                            : row,
                                        ),
                                      )
                                    }
                                    className="inline-flex size-11 cursor-pointer items-center justify-center rounded-xl text-stone-500 hover:text-red-600"
                                  >
                                    <Trash2 className="size-4" aria-hidden="true" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          <GlassButton
                            type="button"
                            variant="ghost"
                            size="sm"
                            leftIcon={<Plus className="size-3.5" aria-hidden="true" />}
                            onClick={() =>
                              setManualSteps((prev) =>
                                prev.map((row) =>
                                  row.id === step.id
                                    ? {
                                        ...row,
                                        stepIngredients: [
                                          ...row.stepIngredients,
                                          createEmptyStepIngredient(),
                                        ],
                                      }
                                    : row,
                                ),
                              )
                            }
                          >
                            Dodaj składnik do tego kroku
                          </GlassButton>
                        </div>
                      ))}
                    </div>

                    <GlassButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      leftIcon={<Plus className="size-4" aria-hidden="true" />}
                      onClick={() => setManualSteps((prev) => [...prev, createEmptyStep()])}
                    >
                      Dodaj krok
                    </GlassButton>
                  </fieldset>

                  <GlassButton
                    type="submit"
                    variant="primary"
                    size="lg"
                    fullWidth
                    isLoading={isSaving}
                    loadingText="Zapisywanie przepisu..."
                    leftIcon={<Check className="size-5" aria-hidden="true" />}
                  >
                    Zapisz w naszej książce
                  </GlassButton>
                </form>
              )}
            </div>
          </>
        )}
      </div>
    </GlassModal>
  )
}
