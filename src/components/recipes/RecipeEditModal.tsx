import { useState, type FormEvent } from 'react'
import {
  AlertCircle,
  Clock,
  Flame,
  Plus,
  Save,
  Timer,
  Trash2,
  Users,
  Utensils,
} from 'lucide-react'
import type { RecipeCategory, RecipeIngredient, RecipeRow, RecipeStep, RecipeUpdate } from '../../lib/supabase'
import { GlassButton, GlassCard, GlassModal, cn } from '../ui'
import { RECIPE_CATEGORIES } from './recipeMeta'

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

  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleAddIngredient = () => {
    setIngredients((prev) => [
      ...prev,
      { name: '', amount: 0, unit: 'g', category: prev[prev.length - 1]?.category || 'Główne składniki' },
    ])
  }

  const handleRemoveIngredient = (index: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== index))
  }

  const handleUpdateIngredient = (index: number, patch: Partial<RecipeIngredient>) => {
    setIngredients((prev) =>
      prev.map((ing, i) => (i === index ? { ...ing, ...patch } : ing)),
    )
  }

  const handleAddStep = () => {
    setSteps((prev) => [
      ...prev,
      {
        step_number: prev.length + 1,
        instruction: '',
        step_ingredients: [],
        timer_seconds: 0,
        tip: null,
      },
    ])
  }

  const handleRemoveStep = (index: number) => {
    setSteps((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((st, i) => ({ ...st, step_number: i + 1 })),
    )
  }

  const handleUpdateStep = (index: number, patch: Partial<RecipeStep>) => {
    setSteps((prev) =>
      prev.map((st, i) => (i === index ? { ...st, ...patch } : st)),
    )
  }

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
      setSaveError('Dodaj przynajmniej jeden składnik.')
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
      setSaveError('Dodaj przynajmniej jeden krok przygotowania.')
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

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={() => {
        if (!isSaving) onClose()
      }}
      title="Edycja przepisu i kroków"
      subtitle={`Wprowadź ręczne zmiany w przepisie „${recipe.title}”.`}
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

        {/* Składniki */}
        <div className="space-y-3 border-t border-stone-900/10 pt-4 dark:border-white/10">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold tracking-wide text-amber-800 uppercase dark:text-amber-300">
              <Utensils className="size-4" />
              <span>Składniki ({ingredients.length})</span>
            </h3>
            <GlassButton
              type="button"
              variant="secondary"
              size="sm"
              leftIcon={<Plus className="size-3.5" />}
              onClick={handleAddIngredient}
            >
              Dodaj składnik
            </GlassButton>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {ingredients.map((ing, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Nazwa składnika"
                  value={ing.name}
                  onChange={(e) => handleUpdateIngredient(idx, { name: e.target.value })}
                  className="flex-2 min-w-0 rounded-xl border border-stone-900/15 bg-white/70 px-3 py-1.5 text-sm text-stone-900 focus:border-amber-500 focus:outline-none dark:border-white/15 dark:bg-zinc-900/70 dark:text-stone-100"
                />
                <input
                  type="number"
                  placeholder="Ilość"
                  step="any"
                  value={ing.amount > 0 ? ing.amount : ''}
                  onChange={(e) =>
                    handleUpdateIngredient(idx, { amount: parseFloat(e.target.value) || 0 })
                  }
                  className="w-20 rounded-xl border border-stone-900/15 bg-white/70 px-2 py-1.5 text-sm text-stone-900 tabular-nums focus:border-amber-500 focus:outline-none dark:border-white/15 dark:bg-zinc-900/70 dark:text-stone-100"
                />
                <input
                  type="text"
                  placeholder="Jedn."
                  value={ing.unit}
                  onChange={(e) => handleUpdateIngredient(idx, { unit: e.target.value })}
                  className="w-16 rounded-xl border border-stone-900/15 bg-white/70 px-2 py-1.5 text-sm text-stone-900 focus:border-amber-500 focus:outline-none dark:border-white/15 dark:bg-zinc-900/70 dark:text-stone-100"
                />
                <input
                  type="text"
                  placeholder="Sekcja (np. Ciasto)"
                  value={ing.category || ''}
                  onChange={(e) => handleUpdateIngredient(idx, { category: e.target.value })}
                  className="flex-1 min-w-0 rounded-xl border border-stone-900/15 bg-white/70 px-2.5 py-1.5 text-xs text-stone-700 focus:border-amber-500 focus:outline-none dark:border-white/15 dark:bg-zinc-900/70 dark:text-stone-300"
                />
                <button
                  type="button"
                  aria-label="Usuń składnik"
                  onClick={() => handleRemoveIngredient(idx)}
                  className="rounded-lg p-1.5 text-stone-400 hover:bg-rose-500/15 hover:text-rose-500 transition-colors"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Kroki przygotowania */}
        <div className="space-y-3 border-t border-stone-900/10 pt-4 dark:border-white/10">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold tracking-wide text-amber-800 uppercase dark:text-amber-300">
              <span>Kroki przygotowania ({steps.length})</span>
            </h3>
            <GlassButton
              type="button"
              variant="secondary"
              size="sm"
              leftIcon={<Plus className="size-3.5" />}
              onClick={handleAddStep}
            >
              Dodaj krok
            </GlassButton>
          </div>

          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {steps.map((st, idx) => (
              <GlassCard key={idx} variant="default" padding="sm" className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                    Krok {idx + 1}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 text-xs text-stone-600 dark:text-stone-300">
                      <Timer className="size-3.5 text-amber-600 dark:text-amber-400" />
                      <span>Minutnik (sek):</span>
                      <input
                        type="number"
                        min={0}
                        step={10}
                        value={st.timer_seconds || 0}
                        onChange={(e) =>
                          handleUpdateStep(idx, { timer_seconds: Math.max(0, parseInt(e.target.value) || 0) })
                        }
                        className="w-16 rounded-lg border border-stone-900/15 bg-white/70 px-2 py-1 text-xs text-stone-900 tabular-nums focus:border-amber-500 focus:outline-none dark:border-white/15 dark:bg-zinc-900/70 dark:text-stone-100"
                      />
                    </div>
                    <button
                      type="button"
                      aria-label="Usuń krok"
                      onClick={() => handleRemoveStep(idx)}
                      disabled={steps.length <= 1}
                      className={cn(
                        'rounded-lg p-1 text-stone-400 transition-colors',
                        steps.length > 1
                          ? 'hover:bg-rose-500/15 hover:text-rose-500 cursor-pointer'
                          : 'opacity-30 cursor-not-allowed',
                      )}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>

                <textarea
                  rows={2}
                  required
                  placeholder="Instrukcja wykonania kroku..."
                  value={st.instruction}
                  onChange={(e) => handleUpdateStep(idx, { instruction: e.target.value })}
                  className="w-full rounded-xl border border-stone-900/15 bg-white/70 px-3 py-2 text-sm text-stone-900 focus:border-amber-500 focus:outline-none dark:border-white/15 dark:bg-zinc-900/70 dark:text-stone-100"
                />
              </GlassCard>
            ))}
          </div>
        </div>

        {/* Dolne przyciski zapisu */}
        <div className="flex justify-end gap-3 border-t border-stone-900/10 pt-4 dark:border-white/10">
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
            type="submit"
            variant="primary"
            size="md"
            isLoading={isSaving}
            loadingText="Zapisywanie..."
            leftIcon={<Save className="size-4" />}
          >
            Zapisz zmiany
          </GlassButton>
        </div>
      </form>
    </GlassModal>
  )
}
