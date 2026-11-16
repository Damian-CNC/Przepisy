import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Check } from 'lucide-react'
import type { RecipeIngredient } from '../../lib/supabase'
import { GlassButton, GlassCard, GlassModal } from '../ui'

export interface RecipeIngredientsEditModalProps {
  isOpen: boolean
  onClose: () => void
  ingredients: RecipeIngredient[]
  onSaveIngredients: (ingredients: RecipeIngredient[]) => void
}

export function RecipeIngredientsEditModal({
  isOpen,
  onClose,
  ingredients: initialIngredients,
  onSaveIngredients,
}: RecipeIngredientsEditModalProps) {
  const [items, setItems] = useState<RecipeIngredient[]>(() =>
    Array.isArray(initialIngredients) && initialIngredients.length > 0
      ? initialIngredients.map((i) => ({ ...i }))
      : [{ name: '', amount: 0, unit: 'g', category: 'Główne składniki' }],
  )
  const prevOpenRef = useRef(false)

  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      setItems(
        Array.isArray(initialIngredients) && initialIngredients.length > 0
          ? initialIngredients.map((i) => ({ ...i }))
          : [{ name: '', amount: 0, unit: 'g', category: 'Główne składniki' }],
      )
    }
    prevOpenRef.current = isOpen
  }, [isOpen, initialIngredients])

  const handleAddIngredient = () => {
    const lastCategory = items[items.length - 1]?.category?.trim() || 'Główne składniki'
    setItems((prev) => [
      ...prev,
      {
        name: '',
        amount: 0,
        unit: 'g',
        category: lastCategory,
      },
    ])
  }

  const handleRemoveIngredient = (index: number) => {
    setItems((prev) => {
      const next = prev.filter((_, i) => i !== index)
      return next.length > 0
        ? next
        : [{ name: '', amount: 0, unit: 'g', category: 'Główne składniki' }]
    })
  }

  const handleUpdate = (index: number, patch: Partial<RecipeIngredient>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  const handleSave = () => {
    const cleaned = items
      .map((item) => ({
        name: item.name.trim(),
        amount: Math.max(0, Number(item.amount) || 0),
        unit: item.unit.trim(),
        category: item.category?.trim() || undefined,
      }))
      .filter((item) => item.name.length > 0)

    onSaveIngredients(cleaned)
    onClose()
  }

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title="Edycja składników"
      subtitle={`Dostosuj nazwy, proporcje i sekcje składników (${items.length} pozycji).`}
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <GlassButton type="button" variant="ghost" size="md" onClick={onClose}>
            Anuluj
          </GlassButton>
          <GlassButton
            type="button"
            variant="primary"
            size="md"
            leftIcon={<Check className="size-4" />}
            onClick={handleSave}
          >
            Zatwierdź składniki
          </GlassButton>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="space-y-3">
          {items.map((item, idx) => (
            <GlassCard
              key={idx}
              variant="default"
              padding="sm"
              className="flex flex-col gap-2.5 sm:flex-row sm:items-center"
            >
              {/* Numer składnika */}
              <div className="hidden sm:flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-xs font-semibold text-amber-900 dark:text-amber-200">
                {idx + 1}
              </div>

              {/* Nazwa składnika */}
              <div className="flex-1 min-w-0">
                <label className="sr-only">Nazwa składnika {idx + 1}</label>
                <input
                  type="text"
                  placeholder="Nazwa składnika (np. Mąka pszenna)"
                  value={item.name}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(e) => handleUpdate(idx, { name: e.target.value })}
                  className="w-full rounded-xl border border-stone-900/15 bg-white/80 px-3 py-2 text-sm text-stone-900 focus:border-amber-500 focus:outline-none dark:border-white/15 dark:bg-zinc-900/80 dark:text-stone-100"
                />
              </div>

              {/* Ilość i jednostka */}
              <div className="flex items-center gap-2">
                <div className="w-24">
                  <label className="sr-only">Ilość</label>
                  <input
                    type="number"
                    step="any"
                    min={0}
                    placeholder="Ilość"
                    value={item.amount > 0 ? item.amount : ''}
                    onChange={(e) =>
                      handleUpdate(idx, { amount: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full rounded-xl border border-stone-900/15 bg-white/80 px-2.5 py-2 text-sm tabular-nums text-stone-900 focus:border-amber-500 focus:outline-none dark:border-white/15 dark:bg-zinc-900/80 dark:text-stone-100"
                  />
                </div>

                <div className="w-20">
                  <label className="sr-only">Jednostka</label>
                  <input
                    type="text"
                    placeholder="Jedn."
                    value={item.unit}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    onChange={(e) => handleUpdate(idx, { unit: e.target.value })}
                    className="w-full rounded-xl border border-stone-900/15 bg-white/80 px-2.5 py-2 text-sm text-stone-900 focus:border-amber-500 focus:outline-none dark:border-white/15 dark:bg-zinc-900/80 dark:text-stone-100"
                  />
                </div>

                {/* Sekcja / Kategoria */}
                <div className="w-32 min-w-0">
                  <label className="sr-only">Sekcja</label>
                  <input
                    type="text"
                    placeholder="Sekcja (np. Ciasto)"
                    value={item.category || ''}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    onChange={(e) => handleUpdate(idx, { category: e.target.value })}
                    className="w-full rounded-xl border border-stone-900/15 bg-white/80 px-2.5 py-2 text-xs text-stone-700 focus:border-amber-500 focus:outline-none dark:border-white/15 dark:bg-zinc-900/80 dark:text-stone-300"
                  />
                </div>

                {/* Przycisk usuwania */}
                <button
                  type="button"
                  aria-label={`Usuń składnik ${idx + 1}`}
                  onClick={() => handleRemoveIngredient(idx)}
                  className="rounded-xl p-2 text-stone-400 hover:bg-rose-500/15 hover:text-rose-600 transition-colors"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </GlassCard>
          ))}
        </div>

        {/* Przycisk dodania nowego składnika */}
        <GlassButton
          type="button"
          variant="secondary"
          size="lg"
          fullWidth
          leftIcon={<Plus className="size-4 text-amber-700 dark:text-amber-400" />}
          onClick={handleAddIngredient}
          className="border-dashed"
        >
          Dodaj kolejny składnik
        </GlassButton>
      </div>
    </GlassModal>
  )
}
