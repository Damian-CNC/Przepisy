import { useState, useEffect, useRef } from 'react'
import {
  Plus,
  Trash2,
  Clock,
  ArrowUp,
  ArrowDown,
  Check,
  Lightbulb,
} from 'lucide-react'
import type { RecipeStep } from '../../lib/supabase'
import { GlassButton, GlassCard, GlassModal } from '../ui'

export interface RecipeStepsEditModalProps {
  isOpen: boolean
  onClose: () => void
  steps: RecipeStep[]
  onSaveSteps: (steps: RecipeStep[]) => void
}

interface EditableStepRow {
  id: string
  instruction: string
  timerMinutes: string
  tip: string
}

function mapStepsToEditable(source: RecipeStep[]): EditableStepRow[] {
  if (!Array.isArray(source) || source.length === 0) {
    return [
      {
        id: '1',
        instruction: '',
        timerMinutes: '',
        tip: '',
      },
    ]
  }
  return source.map((st, i) => {
    const minutes =
      typeof st.timer_seconds === 'number' && st.timer_seconds > 0
        ? String(Math.round(st.timer_seconds / 60))
        : ''
    return {
      id: `${i}-${st.step_number ?? i + 1}`,
      instruction: st.instruction || '',
      timerMinutes: minutes,
      tip: st.tip || '',
    }
  })
}

export function RecipeStepsEditModal({
  isOpen,
  onClose,
  steps: initialSteps,
  onSaveSteps,
}: RecipeStepsEditModalProps) {
  const [items, setItems] = useState<EditableStepRow[]>(() =>
    mapStepsToEditable(initialSteps),
  )
  const prevOpenRef = useRef(false)

  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      setItems(mapStepsToEditable(initialSteps))
    }
    prevOpenRef.current = isOpen
  }, [isOpen, initialSteps])

  const handleAddStep = () => {
    setItems((prev) => [
      ...prev,
      {
        id: String(Date.now() + Math.random()),
        instruction: '',
        timerMinutes: '',
        tip: '',
      },
    ])
  }

  const handleRemoveStep = (index: number) => {
    setItems((prev) => {
      const next = prev.filter((_, i) => i !== index)
      return next.length > 0
        ? next
        : [
            {
              id: String(Date.now()),
              instruction: '',
              timerMinutes: '',
              tip: '',
            },
          ]
    })
  }

  const handleMoveStep = (fromIndex: number, toIndex: number) => {
    setItems((prev) => {
      if (toIndex < 0 || toIndex >= prev.length) return prev
      const updated = [...prev]
      const [moved] = updated.splice(fromIndex, 1)
      updated.splice(toIndex, 0, moved)
      return updated
    })
  }

  const handleUpdate = (index: number, patch: Partial<EditableStepRow>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  const handleSave = () => {
    const cleaned: RecipeStep[] = items
      .map((item, idx) => {
        const rawMinutes = parseFloat(item.timerMinutes) || 0
        const timerSeconds = Math.max(0, Math.round(rawMinutes * 60))
        return {
          step_number: idx + 1,
          instruction: item.instruction.trim(),
          step_ingredients: [],
          timer_seconds: timerSeconds,
          tip: item.tip.trim() || null,
        }
      })
      .filter((st) => st.instruction.length > 0)

    onSaveSteps(cleaned)
    onClose()
  }

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title="Edycja kroków przygotowania"
      subtitle={`Wygodna edycja treści instrukcji i minutników (${items.length} kroków).`}
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
            Zatwierdź kroki
          </GlassButton>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="space-y-4">
          {items.map((item, idx) => (
            <GlassCard key={item.id} variant="default" padding="md" className="space-y-3">
              {/* Nagłówek pojedynczego kroku */}
              <div className="flex items-center justify-between gap-2 border-b border-stone-900/10 pb-2 dark:border-white/10">
                <div className="flex items-center gap-2">
                  <span className="inline-flex size-7 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-zinc-950">
                    {idx + 1}
                  </span>
                  <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                    Krok {idx + 1}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Przesuń krok w górę"
                    disabled={idx === 0}
                    onClick={() => handleMoveStep(idx, idx - 1)}
                    className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-500/10 hover:text-stone-700 disabled:opacity-30 dark:hover:text-stone-200"
                  >
                    <ArrowUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Przesuń krok w dół"
                    disabled={idx === items.length - 1}
                    onClick={() => handleMoveStep(idx, idx + 1)}
                    className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-500/10 hover:text-stone-700 disabled:opacity-30 dark:hover:text-stone-200"
                  >
                    <ArrowDown className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Usuń krok ${idx + 1}`}
                    onClick={() => handleRemoveStep(idx)}
                    className="rounded-lg p-1.5 text-stone-400 hover:bg-rose-500/15 hover:text-rose-600 transition-colors"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>

              {/* Treść instrukcji */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700 dark:text-stone-300">
                  Instrukcja przygotowania *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Opisz dokładnie, co należy zrobić w tym kroku..."
                  value={item.instruction}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(e) => handleUpdate(idx, { instruction: e.target.value })}
                  className="w-full rounded-xl border border-stone-900/15 bg-white/80 p-3 text-sm leading-relaxed text-stone-900 focus:border-amber-500 focus:outline-none dark:border-white/15 dark:bg-zinc-900/80 dark:text-stone-100"
                />
              </div>

              {/* Minutnik i wskazówka */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-stone-600 dark:text-stone-400">
                    <Clock className="size-3.5 text-amber-600 dark:text-amber-400" />
                    <span>Minutnik (opcjonalny czas w minutach)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="np. 15 (minut)"
                    value={item.timerMinutes}
                    onChange={(e) => handleUpdate(idx, { timerMinutes: e.target.value })}
                    className="w-full rounded-xl border border-stone-900/15 bg-white/80 px-3 py-2 text-sm tabular-nums text-stone-900 focus:border-amber-500 focus:outline-none dark:border-white/15 dark:bg-zinc-900/80 dark:text-stone-100"
                  />
                </div>

                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-stone-600 dark:text-stone-400">
                    <Lightbulb className="size-3.5 text-amber-600 dark:text-amber-400" />
                    <span>Wskazówka szefa kuchni (opcjonalnie)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="np. Nie otwieraj piekarnika przez pierwsze 10 min..."
                    value={item.tip}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    onChange={(e) => handleUpdate(idx, { tip: e.target.value })}
                    className="w-full rounded-xl border border-stone-900/15 bg-white/80 px-3 py-2 text-sm text-stone-900 focus:border-amber-500 focus:outline-none dark:border-white/15 dark:bg-zinc-900/80 dark:text-stone-100"
                  />
                </div>
              </div>
            </GlassCard>
          ))}
        </div>

        {/* Przycisk dodania kolejnego kroku */}
        <GlassButton
          type="button"
          variant="secondary"
          size="lg"
          fullWidth
          leftIcon={<Plus className="size-4 text-amber-700 dark:text-amber-400" />}
          onClick={handleAddStep}
          className="border-dashed"
        >
          Dodaj kolejny krok ({items.length + 1})
        </GlassButton>
      </div>
    </GlassModal>
  )
}
