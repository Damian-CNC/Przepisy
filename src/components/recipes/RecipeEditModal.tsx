import { useState, useEffect, useRef, type FormEvent } from 'react'
import {
  AlertCircle,
  Clock,
  Flame,
  ListOrdered,
  Save,
  Users,
  Utensils,
  ChevronRight,
} from 'lucide-react'
import type {
  RecipeCategory,
  RecipeIngredient,
  RecipeRow,
  RecipeStep,
  RecipeUpdate,
} from '../../lib/supabase'
import { GlassButton, GlassCard, GlassModal } from '../ui'
import { RECIPE_CATEGORIES } from './recipeMeta'
import { RecipeIngredientsEditModal } from './RecipeIngredientsEditModal'
import { RecipeStepsEditModal } from './RecipeStepsEditModal'

export interface RecipeEditModalProps {
  isOpen: boolean
  onClose: () => void
  recipe: RecipeRow
  onSave: (payload: RecipeUpdate) => Promise<unknown>
}

export function RecipeEditModal({
  isOpen,
  onClose,
  recipe,
  onSave,
}: RecipeEditModalProps) {
  const [title, setTitle] = useState(recipe.title || '')
  const [category, setCategory] = useState<RecipeCategory>(
    (recipe.category as RecipeCategory) || 'Obiad',
  )
  const [description, setDescription] = useState(recipe.description || '')
  const [prepTimeMinutes, setPrepTimeMinutes] = useState(recipe.prep_time_minutes ?? 15)
  const [cookTimeMinutes, setCookTimeMinutes] = useState(recipe.cook_time_minutes ?? 0)
  const [servings, setServings] = useState(recipe.servings ?? 2)

  const [ingredients, setIngredients] = useState<RecipeIngredient[]>(() =>
    Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0
      ? recipe.ingredients.map((ing) => ({ ...ing }))
      : [{ name: '', amount: 0, unit: 'g', category: 'Główne składniki' }],
  )

  const [steps, setSteps] = useState<RecipeStep[]>(() =>
    Array.isArray(recipe.steps) && recipe.steps.length > 0
      ? recipe.steps.map((st, idx) => ({
          step_number: idx + 1,
          instruction: st.instruction || '',
          step_ingredients: Array.isArray(st.step_ingredients) ? [...st.step_ingredients] : [],
          timer_seconds: st.timer_seconds ?? 0,
          tip: st.tip ?? null,
        }))
      : [{ step_number: 1, instruction: '', step_ingredients: [], timer_seconds: 0, tip: null }],
  )

  const [isIngredientsModalOpen, setIsIngredientsModalOpen] = useState(false)
  const [isStepsModalOpen, setIsStepsModalOpen] = useState(false)

  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const prevOpenRef = useRef(false)

  // Synchronizacja przy ponownym otwarciu dla danego przepisu
  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      setTitle(recipe.title || '')
      setCategory((recipe.category as RecipeCategory) || 'Obiad')
      setDescription(recipe.description || '')
      setPrepTimeMinutes(recipe.prep_time_minutes ?? 15)
      setCookTimeMinutes(recipe.cook_time_minutes ?? 0)
      setServings(recipe.servings ?? 2)
      setIngredients(
        Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0
          ? recipe.ingredients.map((ing) => ({ ...ing }))
          : [{ name: '', amount: 0, unit: 'g', category: 'Główne składniki' }],
      )
      setSteps(
        Array.isArray(recipe.steps) && recipe.steps.length > 0
          ? recipe.steps.map((st, idx) => ({
              step_number: idx + 1,
              instruction: st.instruction || '',
              step_ingredients: Array.isArray(st.step_ingredients) ? [...st.step_ingredients] : [],
              timer_seconds: st.timer_seconds ?? 0,
              tip: st.tip ?? null,
            }))
          : [{ step_number: 1, instruction: '', step_ingredients: [], timer_seconds: 0, tip: null }],
      )
      setSaveError(null)
    }
    prevOpenRef.current = isOpen
  }, [isOpen, recipe])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setSaveError('Wpisz nazwę przepisu.')
      return
    }

    const validIngredients = ingredients
      .map((ing) => ({
        name: ing.name.trim(),
        amount: Math.max(0, Number(ing.amount) || 0),
        unit: ing.unit.trim(),
        category: ing.category?.trim() || undefined,
      }))
      .filter((ing) => ing.name.length > 0)

    if (validIngredients.length === 0) {
      setSaveError('Dodaj przynajmniej jeden składnik (użyj przycisku „Edytuj składniki”).')
      return
    }

    const validSteps = steps
      .map((st, idx) => ({
        step_number: idx + 1,
        instruction: st.instruction.trim(),
        step_ingredients: st.step_ingredients ?? [],
        timer_seconds: Math.max(0, Number(st.timer_seconds) || 0),
        tip: st.tip?.trim() || null,
      }))
      .filter((st) => st.instruction.length > 0)

    if (validSteps.length === 0) {
      setSaveError('Dodaj przynajmniej jeden krok przygotowania (użyj przycisku „Edytuj kroki”).')
      return
    }

    setSaveError(null)
    setIsSaving(true)

    try {
      await onSave({
        title: trimmedTitle,
        category,
        description: description.trim() || null,
        prep_time_minutes: Math.max(0, Number(prepTimeMinutes) || 0),
        cook_time_minutes: Math.max(0, Number(cookTimeMinutes) || 0),
        servings: Math.max(1, Number(servings) || 2),
        ingredients: validIngredients,
        steps: validSteps,
      })
      onClose()
    } catch (err) {
      setSaveError(err instanceof Error && err.message ? err.message : 'Nie udało się zapisać zmian.')
    } finally {
      setIsSaving(false)
    }
  }

  // Podgląd składników do wyświetlenia na kafelku
  const ingredientsSummary = ingredients
    .map((i) => i.name.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(', ')

  return (
    <>
      <GlassModal
        isOpen={isOpen}
        onClose={() => {
          if (!isSaving) onClose()
        }}
        title="Edycja przepisu"
        subtitle={`Wprowadź zmiany w przepisie „${recipe.title}”.`}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {saveError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-2xl border border-red-500/35 bg-red-500/12 p-3 text-sm text-red-900 dark:text-red-200"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{saveError}</span>
            </div>
          )}

          {/* Dane podstawowe */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold tracking-wide text-amber-800 uppercase dark:text-amber-300">
              Podstawowe informacje
            </h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300">
                  Nazwa przepisu *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl border border-stone-900/15 bg-white/70 px-3.5 py-2.5 text-sm text-stone-900 focus:border-amber-500 focus:outline-none dark:border-white/15 dark:bg-zinc-900/70 dark:text-stone-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300">
                  Kategoria
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as RecipeCategory)}
                  className="w-full rounded-xl border border-stone-900/15 bg-white/70 px-3.5 py-2.5 text-sm text-stone-900 focus:border-amber-500 focus:outline-none dark:border-white/15 dark:bg-zinc-900/70 dark:text-stone-100"
                >
                  {RECIPE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300">
                Krótki opis
              </label>
              <textarea
                rows={2}
                value={description}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Opcjonalny krótki opis lub wskazówka ogólna..."
                className="w-full rounded-xl border border-stone-900/15 bg-white/70 px-3.5 py-2 text-sm text-stone-900 focus:border-amber-500 focus:outline-none dark:border-white/15 dark:bg-zinc-900/70 dark:text-stone-100"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-medium text-stone-600 dark:text-stone-400">
                  <Clock className="size-3 text-amber-600 dark:text-amber-400" />
                  <span>Przygotowanie (min)</span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={prepTimeMinutes}
                  onChange={(e) => setPrepTimeMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full rounded-xl border border-stone-900/15 bg-white/70 px-3 py-2 text-sm text-stone-900 tabular-nums focus:border-amber-500 focus:outline-none dark:border-white/15 dark:bg-zinc-900/70 dark:text-stone-100"
                />
              </div>

              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-medium text-stone-600 dark:text-stone-400">
                  <Flame className="size-3 text-amber-600 dark:text-amber-400" />
                  <span>Obróbka (min)</span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={cookTimeMinutes}
                  onChange={(e) => setCookTimeMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full rounded-xl border border-stone-900/15 bg-white/70 px-3 py-2 text-sm text-stone-900 tabular-nums focus:border-amber-500 focus:outline-none dark:border-white/15 dark:bg-zinc-900/70 dark:text-stone-100"
                />
              </div>

              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-medium text-stone-600 dark:text-stone-400">
                  <Users className="size-3 text-amber-600 dark:text-amber-400" />
                  <span>Porcje</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={48}
                  value={servings}
                  onChange={(e) => setServings(Math.max(1, parseInt(e.target.value) || 2))}
                  className="w-full rounded-xl border border-stone-900/15 bg-white/70 px-3 py-2 text-sm text-stone-900 tabular-nums focus:border-amber-500 focus:outline-none dark:border-white/15 dark:bg-zinc-900/70 dark:text-stone-100"
                />
              </div>
            </div>
          </div>

          {/* Dwa duże przyciski dedykowanych okien: Składniki i Kroki */}
          <div className="space-y-3 border-t border-stone-900/10 pt-4 dark:border-white/10">
            <h3 className="text-sm font-semibold tracking-wide text-amber-800 uppercase dark:text-amber-300">
              Składniki i etapy przygotowania
            </h3>

            {/* Przycisk 1: Edycja składników */}
            <GlassCard
              variant="interactive"
              padding="sm"
              onClick={() => setIsIngredientsModalOpen(true)}
              className="cursor-pointer transition-all hover:scale-[1.01]"
            >
              <div className="flex items-center justify-between gap-4 p-1">
                <div className="flex items-center gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
                    <Utensils className="size-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-stone-900 dark:text-stone-50">
                        Edytuj składniki
                      </span>
                      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-900 dark:text-amber-200">
                        {ingredients.length}
                      </span>
                    </div>
                    <p className="line-clamp-1 text-xs text-stone-500 dark:text-stone-400">
                      {ingredientsSummary || 'Brak wpisanych składników'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                  <span>Edytuj</span>
                  <ChevronRight className="size-4" />
                </div>
              </div>
            </GlassCard>

            {/* Przycisk 2: Edycja kroków */}
            <GlassCard
              variant="interactive"
              padding="sm"
              onClick={() => setIsStepsModalOpen(true)}
              className="cursor-pointer transition-all hover:scale-[1.01]"
            >
              <div className="flex items-center justify-between gap-4 p-1">
                <div className="flex items-center gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/15 text-orange-700 dark:text-orange-300">
                    <ListOrdered className="size-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-stone-900 dark:text-stone-50">
                        Edytuj kroki
                      </span>
                      <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-xs font-bold text-orange-900 dark:text-orange-200">
                        {steps.length} kroków
                      </span>
                    </div>
                    <p className="line-clamp-1 text-xs text-stone-500 dark:text-stone-400">
                      Instrukcje krok po kroku i czasy minutników
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-xs font-semibold text-orange-700 dark:text-orange-300">
                  <span>Edytuj</span>
                  <ChevronRight className="size-4" />
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Przyciski główne zapisu / anulowania */}
          <div className="flex items-center justify-end gap-3 border-t border-stone-900/10 pt-4 dark:border-white/10">
            <GlassButton
              type="button"
              variant="secondary"
              size="md"
              disabled={isSaving}
              onClick={onClose}
            >
              Anuluj
            </GlassButton>
            <GlassButton
              type="submit"
              variant="primary"
              size="md"
              isLoading={isSaving}
              loadingText="Zapisywanie..."
              leftIcon={<Save className="size-4" />}
            >
              Zapisz wszystkie zmiany
            </GlassButton>
          </div>
        </form>
      </GlassModal>

      {/* Dedykowane duże okno edycji składników */}
      <RecipeIngredientsEditModal
        isOpen={isIngredientsModalOpen}
        onClose={() => setIsIngredientsModalOpen(false)}
        ingredients={ingredients}
        onSaveIngredients={(newIngredients) => {
          setIngredients(newIngredients)
        }}
      />

      {/* Dedykowane duże okno edycji kroków */}
      <RecipeStepsEditModal
        isOpen={isStepsModalOpen}
        onClose={() => setIsStepsModalOpen(false)}
        steps={steps}
        onSaveSteps={(newSteps) => {
          setSteps(newSteps)
        }}
      />
    </>
  )
}
