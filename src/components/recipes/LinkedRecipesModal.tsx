import { useId, useMemo, useState } from 'react'
import {
  AlertCircle,
  ChefHat,
  Clock,
  Link2,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { extractLinkedRecipes } from '../../lib/recipesApi'
import type { LinkedRecipeItem, RecipeRow } from '../../lib/supabase'
import { GlassButton, GlassCard, GlassModal, GlassPill, cn } from '../ui'

export interface LinkedRecipesModalProps {
  isOpen: boolean
  onClose: () => void
  recipe: RecipeRow
  allRecipes: RecipeRow[]
  onSave: (linkedRecipes: LinkedRecipeItem[]) => Promise<void>
}

const DEFAULT_LABEL = 'Najlepiej podawać z:'

const LABEL_SUGGESTIONS: readonly string[] = [
  'Najlepiej podawać z:',
  'Idealny dodatek:',
  'Sos do potrawy:',
  'Pieczywo / chlebki:',
  'Surówka / sałatka:',
  'Do popicia:',
]

interface LinkedRecipesEditorProps {
  recipe: RecipeRow
  allRecipes: RecipeRow[]
  onClose: () => void
  onSave: (linkedRecipes: LinkedRecipeItem[]) => Promise<void>
  isSaving: boolean
  setIsSaving: (saving: boolean) => void
  links: LinkedRecipeItem[]
  setLinks: React.Dispatch<React.SetStateAction<LinkedRecipeItem[]>>
  saveError: string | null
  setSaveError: (error: string | null) => void
}

function LinkedRecipesEditor({
  recipe,
  allRecipes,
  links,
  setLinks,
  saveError,
}: LinkedRecipesEditorProps) {
  const baseId = useId()
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('')
  const [candidateLabel, setCandidateLabel] = useState<string>(DEFAULT_LABEL)
  const [candidateSearch, setCandidateSearch] = useState<string>('')

  // Dostępne przepisy do podpięcia (z wyłączeniem edytowanego przepisu i już podpiętych)
  const linkedIdsSet = useMemo(() => new Set(links.map((l) => l.recipe_id)), [links])

  const availableRecipes = useMemo(() => {
    return allRecipes.filter((r) => r.id !== recipe.id && !linkedIdsSet.has(r.id))
  }, [allRecipes, recipe.id, linkedIdsSet])

  const filteredCandidates = useMemo(() => {
    const q = candidateSearch.trim().toLowerCase()
    if (!q) return availableRecipes
    return availableRecipes.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.category && r.category.toLowerCase().includes(q)) ||
        (Array.isArray(r.tags) && r.tags.some((t) => t.toLowerCase().includes(q))),
    )
  }, [availableRecipes, candidateSearch])

  const handleUpdateLinkLabel = (index: number, newLabel: string) => {
    setLinks((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, label: newLabel } : item)),
    )
  }

  const handleRemoveLink = (index: number) => {
    setLinks((prev) => prev.filter((_, idx) => idx !== index))
  }

  const handleAddCandidate = () => {
    if (!selectedCandidateId) return
    const trimmedLabel = candidateLabel.trim() || DEFAULT_LABEL
    setLinks((prev) => [...prev, { recipe_id: selectedCandidateId, label: trimmedLabel }])
    setSelectedCandidateId('')
    setCandidateLabel(DEFAULT_LABEL)
    setCandidateSearch('')
  }

  return (
    <div className="flex flex-col gap-5">
      {saveError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-2xl border border-red-500/35 bg-red-500/12 p-3.5 text-sm font-medium text-red-900 dark:border-red-400/35 dark:bg-red-500/15 dark:text-red-200"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{saveError}</span>
        </div>
      )}

      {/* 1. Lista aktualnie podpiętych przepisów */}
      {links.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold tracking-wide text-stone-900 uppercase dark:text-stone-100">
            Podpięte dania ({links.length}):
          </h3>

          <div className="space-y-3">
            {links.map((link, idx) => {
              const target = allRecipes.find((r) => r.id === link.recipe_id)
              const targetTitle = target ? target.title : 'Przepis usunięty'
              const targetTime =
                target &&
                (typeof target.prep_time_minutes === 'number' ||
                  typeof target.cook_time_minutes === 'number')
                  ? (target.prep_time_minutes ?? 0) + (target.cook_time_minutes ?? 0)
                  : 0

              return (
                <GlassCard
                  key={`${link.recipe_id}-${idx}`}
                  variant="default"
                  padding="sm"
                  className="space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-amber-500/10">
                        {target?.image_url ? (
                          <img
                            src={target.image_url}
                            alt={targetTitle}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <ChefHat className="size-6 text-amber-700/40 dark:text-amber-300/40" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-stone-900 dark:text-stone-50">
                          {targetTitle}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                          {target?.category && <span>{target.category}</span>}
                          {targetTime > 0 && (
                            <span className="flex items-center gap-1">
                              <Clock className="size-3" />
                              {targetTime} min
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      aria-label={`Usuń powiązanie z ${targetTitle}`}
                      onClick={() => handleRemoveLink(idx)}
                      className="inline-flex size-9 cursor-pointer items-center justify-center rounded-xl text-stone-400 transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:bg-red-500/20 dark:hover:text-red-400"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>

                  {/* Własny nagłówek dla tego powiązania */}
                  <div className="space-y-1.5 border-t border-stone-900/10 pt-2 dark:border-white/10">
                    <label
                      htmlFor={`${baseId}-link-label-${idx}`}
                      className="text-xs font-medium text-stone-600 dark:text-stone-300"
                    >
                      Nagłówek sekcji w przepisie:
                    </label>
                    <input
                      id={`${baseId}-link-label-${idx}`}
                      type="text"
                      value={link.label}
                      onChange={(e) => handleUpdateLinkLabel(idx, e.target.value)}
                      placeholder="np. Najlepiej podawać z:"
                      className={cn(
                        'w-full rounded-xl px-3 py-1.5 text-sm font-medium',
                        'bg-white/80 text-stone-900 placeholder:text-stone-400',
                        'dark:bg-zinc-950/60 dark:text-stone-50 dark:placeholder:text-stone-500',
                        'border border-stone-900/15 dark:border-white/15',
                        'focus-visible:outline-2 focus-visible:outline-amber-600 dark:focus-visible:outline-amber-400',
                      )}
                    />

                    {/* Szybkie sugestie nagłówka */}
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {LABEL_SUGGESTIONS.map((sug) => (
                        <button
                          key={sug}
                          type="button"
                          onClick={() => handleUpdateLinkLabel(idx, sug)}
                          className={cn(
                            'cursor-pointer rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                            link.label === sug
                              ? 'bg-amber-600 text-white dark:bg-amber-500 dark:text-zinc-950'
                              : 'bg-stone-900/5 text-stone-600 hover:bg-stone-900/10 dark:bg-white/10 dark:text-stone-300 dark:hover:bg-white/15',
                          )}
                        >
                          {sug}
                        </button>
                      ))}
                    </div>
                  </div>
                </GlassCard>
              )
            })}
          </div>
        </div>
      )}

      {/* 2. Sekcja dodawania nowego powiązania */}
      <div className="space-y-3 rounded-2xl border border-stone-900/10 bg-white/40 p-3.5 dark:border-white/10 dark:bg-white/5">
        <h3 className="text-sm font-semibold tracking-wide text-stone-900 uppercase dark:text-stone-100">
          Podepnij kolejny przepis:
        </h3>

        {availableRecipes.length === 0 ? (
          <p className="text-sm text-stone-600 dark:text-stone-400">
            {allRecipes.length <= 1
              ? 'Brak innych przepisów w bazie. Dodaj najpierw drugi przepis, aby móc je ze sobą powiązać.'
              : 'Wszystkie pozostałe przepisy z Twojej książki są już podpięte.'}
          </p>
        ) : (
          <div className="space-y-3">
            {/* Wyszukiwanie przepisu */}
            {availableRecipes.length > 3 && (
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={candidateSearch}
                  onChange={(e) => setCandidateSearch(e.target.value)}
                  placeholder="Filtruj przepisy..."
                  className={cn(
                    'w-full rounded-xl py-2 pr-9 pl-9 text-sm',
                    'bg-white/80 text-stone-900 placeholder:text-stone-400',
                    'dark:bg-zinc-950/60 dark:text-stone-50 dark:placeholder:text-stone-500',
                    'border border-stone-900/15 dark:border-white/15',
                    'focus-visible:outline-2 focus-visible:outline-amber-600 dark:focus-visible:outline-amber-400',
                  )}
                />
                {candidateSearch && (
                  <button
                    type="button"
                    aria-label="Wyczyść filtr"
                    onClick={() => setCandidateSearch('')}
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
            )}

            {/* Lista wyboru przepisu kandydackiego */}
            <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
              {filteredCandidates.length === 0 ? (
                <p className="py-2 text-xs text-stone-500 dark:text-stone-400">
                  Brak przepisów pasujących do frazy „{candidateSearch}”.
                </p>
              ) : (
                filteredCandidates.map((cand) => {
                  const isSelected = selectedCandidateId === cand.id
                  return (
                    <button
                      key={cand.id}
                      type="button"
                      onClick={() => setSelectedCandidateId(cand.id)}
                      className={cn(
                        'flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl p-2 text-left transition-all',
                        isSelected
                          ? 'border border-amber-600/40 bg-amber-500/20 text-stone-900 dark:border-amber-400/40 dark:bg-amber-500/25 dark:text-white'
                          : 'border border-transparent bg-white/60 hover:bg-white/90 text-stone-800 dark:bg-zinc-900/60 dark:text-stone-200 dark:hover:bg-zinc-800/80',
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="relative size-9 shrink-0 overflow-hidden rounded-lg bg-amber-500/10">
                          {cand.image_url ? (
                            <img
                              src={cand.image_url}
                              alt={cand.title}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <ChefHat className="size-4 text-amber-700/50 dark:text-amber-300/50" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{cand.title}</p>
                          {cand.category && (
                            <p className="text-[11px] text-stone-500 dark:text-stone-400">
                              {cand.category}
                            </p>
                          )}
                        </div>
                      </div>

                      {isSelected && (
                        <span className="shrink-0 rounded-full bg-amber-600 px-2 py-0.5 text-[10px] font-bold text-white uppercase dark:bg-amber-500 dark:text-zinc-950">
                          Wybrany
                        </span>
                      )}
                    </button>
                  )
                })
              )}
            </div>

            {/* Nagłówek dla wybranego przepisu */}
            {selectedCandidateId && (
              <div className="space-y-2 border-t border-stone-900/10 pt-2 dark:border-white/10">
                <label
                  htmlFor={`${baseId}-candidate-label`}
                  className="text-xs font-medium text-stone-700 dark:text-stone-200"
                >
                  Własny nagłówek dla tego powiązania:
                </label>
                <input
                  id={`${baseId}-candidate-label`}
                  type="text"
                  value={candidateLabel}
                  onChange={(e) => setCandidateLabel(e.target.value)}
                  placeholder="np. Najlepiej podawać z:"
                  className={cn(
                    'w-full rounded-xl px-3 py-2 text-sm font-medium',
                    'bg-white/80 text-stone-900 placeholder:text-stone-400',
                    'dark:bg-zinc-950/60 dark:text-stone-50 dark:placeholder:text-stone-500',
                    'border border-stone-900/15 dark:border-white/15',
                    'focus-visible:outline-2 focus-visible:outline-amber-600 dark:focus-visible:outline-amber-400',
                  )}
                />

                {/* Szybkie sugestie */}
                <div className="flex flex-wrap gap-1.5">
                  {LABEL_SUGGESTIONS.map((sug) => (
                    <GlassPill
                      key={sug}
                      as="button"
                      variant={candidateLabel === sug ? 'active' : 'surface'}
                      size="sm"
                      onClick={() => setCandidateLabel(sug)}
                      className="text-xs"
                    >
                      {sug}
                    </GlassPill>
                  ))}
                </div>

                <GlassButton
                  type="button"
                  variant="secondary"
                  size="md"
                  fullWidth
                  leftIcon={<Plus className="size-4" aria-hidden="true" />}
                  onClick={handleAddCandidate}
                  className="mt-2"
                >
                  Dodaj powiązanie do listy
                </GlassButton>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function LinkedRecipesModal({
  isOpen,
  onClose,
  recipe,
  allRecipes,
  onSave,
}: LinkedRecipesModalProps) {
  const [links, setLinks] = useState<LinkedRecipeItem[]>(() => extractLinkedRecipes(recipe))
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleSaveAll = async () => {
    if (isSaving) return
    setIsSaving(true)
    setSaveError(null)
    try {
      await onSave(links)
      onClose()
    } catch (err) {
      setSaveError(
        err instanceof Error && err.message
          ? err.message
          : 'Nie udało się zapisać powiązanych przepisów.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={() => {
        if (!isSaving) onClose()
      }}
      title="Powiązane przepisy"
      subtitle={`Dopasuj dania i dodatki pasujące do „${recipe.title}” z własnym nagłówkiem.`}
      size="md"
      closedBy={isSaving ? 'none' : 'any'}
      footer={
        <>
          <GlassButton
            type="button"
            variant="ghost"
            size="md"
            disabled={isSaving}
            onClick={onClose}
          >
            Anuluj
          </GlassButton>
          <GlassButton
            type="button"
            variant="primary"
            size="md"
            isLoading={isSaving}
            loadingText="Zapisywanie..."
            leftIcon={<Link2 className="size-4" aria-hidden="true" />}
            onClick={() => void handleSaveAll()}
          >
            Zapisz powiązania
          </GlassButton>
        </>
      }
    >
      {isOpen && (
        <LinkedRecipesEditor
          key={`${recipe.id}-${isOpen ? 'open' : 'closed'}`}
          recipe={recipe}
          allRecipes={allRecipes}
          onClose={onClose}
          onSave={onSave}
          isSaving={isSaving}
          setIsSaving={setIsSaving}
          links={links}
          setLinks={setLinks}
          saveError={saveError}
          setSaveError={setSaveError}
        />
      )}
    </GlassModal>
  )
}
