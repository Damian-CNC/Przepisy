import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Loader2, RefreshCw, Search, Sparkles } from 'lucide-react'
import {
  searchFoodPhotoCandidates,
  rehostRecipeImage,
  type WebImageCandidate,
} from '../../lib/recipesApi'
import { GlassButton, GlassCard, GlassModal, cn } from '../ui'

export interface RecipePhotoPickerModalProps {
  isOpen: boolean
  onClose: () => void
  recipeTitle: string
  recipeId: string
  initialNotice?: string | null
  onPhotoSelected: (imageUrl: string) => Promise<void>
}

export function RecipePhotoPickerModal({
  isOpen,
  onClose,
  recipeTitle,
  recipeId,
  initialNotice,
  onPhotoSelected,
}: RecipePhotoPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState(recipeTitle)
  const [candidates, setCandidates] = useState<WebImageCandidate[]>([])
  const [selectedCandidate, setSelectedCandidate] = useState<WebImageCandidate | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const lastOpenedRef = useRef<string | null>(null)

  const loadCandidates = useCallback(async (queryText: string) => {
    const q = queryText.trim()
    if (!q) return
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const results = await searchFoodPhotoCandidates(q, 4)
      setCandidates(results)
      if (results.length > 0) {
        setSelectedCandidate(results[0])
      } else {
        setSelectedCandidate(null)
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error && err.message
          ? err.message
          : 'Nie udało się pobrać propozycji zdjęć z sieci.',
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) {
      lastOpenedRef.current = null
      return
    }

    const modalKey = `${recipeId}-${recipeTitle}`
    if (lastOpenedRef.current !== modalKey) {
      lastOpenedRef.current = modalKey
      setSearchQuery(recipeTitle)
      setSelectedCandidate(null)
      setErrorMessage(null)
      void loadCandidates(recipeTitle)
    }
  }, [isOpen, recipeId, recipeTitle, loadCandidates])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void loadCandidates(searchQuery)
  }

  const handleConfirmSelection = async () => {
    if (!selectedCandidate || isSubmitting) return
    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      // Rehosting do Supabase Storage
      const permanentUrl = await rehostRecipeImage(selectedCandidate.url, recipeId)
      await onPhotoSelected(permanentUrl)
      onClose()
    } catch (err) {
      setErrorMessage(
        err instanceof Error && err.message
          ? err.message
          : 'Nie udało się przypisać wybranego zdjęcia.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={() => {
        if (!isSubmitting) onClose()
      }}
      title="Wybierz zdjęcie potrawy"
      subtitle="Wybierz jeden z 4 najlepszych wyników z sieci lub wpisz własną frazę."
      size="md"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <GlassButton
            type="button"
            variant="ghost"
            size="md"
            disabled={isSubmitting}
            onClick={onClose}
          >
            Anuluj
          </GlassButton>
          <GlassButton
            type="button"
            variant="primary"
            size="md"
            disabled={!selectedCandidate || isSubmitting || isLoading}
            isLoading={isSubmitting}
            loadingText="Zapisuję..."
            leftIcon={<Check className="size-4" aria-hidden="true" />}
            onClick={() => void handleConfirmSelection()}
          >
            Użyj wybranego zdjęcia
          </GlassButton>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {initialNotice && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/35 bg-amber-500/15 p-3 text-xs font-medium text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/12 dark:text-amber-200">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <span>{initialNotice}</span>
          </div>
        )}

        {/* Wyszukiwarka frazy */}
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-stone-400" aria-hidden="true" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Wpisz nazwę potrawy (np. chlebki naan)..."
              disabled={isLoading || isSubmitting}
              className={cn(
                'w-full rounded-2xl border border-stone-900/10 bg-white/70 py-2.5 pr-3 pl-10 text-sm text-stone-900 placeholder:text-stone-400',
                'focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none',
                'dark:border-white/10 dark:bg-zinc-900/70 dark:text-stone-100 dark:placeholder:text-stone-500',
              )}
            />
          </div>
          <GlassButton
            type="submit"
            variant="secondary"
            size="md"
            disabled={isLoading || isSubmitting || !searchQuery.trim()}
            leftIcon={isLoading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          >
            Szukaj
          </GlassButton>
        </form>

        {errorMessage && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-800 dark:text-rose-200">
            {errorMessage}
          </div>
        )}

        {/* Siatka 4 zdjęć (2 kolumny) */}
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="aspect-4/3 animate-pulse rounded-2xl border border-stone-900/10 bg-stone-200/60 dark:border-white/10 dark:bg-zinc-800/60"
              />
            ))}
          </div>
        ) : candidates.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {candidates.map((item, idx) => {
              const isSelected = selectedCandidate?.url === item.url
              return (
                <button
                  key={`${item.url}-${idx}`}
                  type="button"
                  onClick={() => setSelectedCandidate(item)}
                  className={cn(
                    'group relative aspect-4/3 cursor-pointer overflow-hidden rounded-2xl border text-left transition-all',
                    isSelected
                      ? 'border-amber-500 ring-4 ring-amber-500/30 shadow-lg shadow-amber-500/20 scale-[0.98]'
                      : 'border-white/20 bg-stone-900/5 hover:border-amber-400/60 dark:border-white/10 dark:bg-white/5',
                  )}
                >
                  <img
                    src={item.thumbnail || item.url}
                    alt={item.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                  {isSelected && (
                    <div className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-amber-500 text-zinc-950 shadow-md">
                      <Check className="size-3.5 stroke-[3]" aria-hidden="true" />
                    </div>
                  )}

                  <div className="absolute inset-x-0 bottom-0 p-2 text-white">
                    <p className="line-clamp-2 text-xs font-medium text-stone-100 drop-shadow-sm">
                      {item.title}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <GlassCard variant="default" padding="md" className="text-center text-sm text-stone-500">
            Nie znaleziono zdjęć dla tej frazy. Spróbuj wpisać inną nazwę powyżej.
          </GlassCard>
        )}
      </div>
    </GlassModal>
  )
}
