import { LayoutGrid, Rows3 } from 'lucide-react'
import type { RecipeGridLayout } from '../../hooks/useRecipeGridLayout'
import { cn } from '../ui'

export interface RecipeGridToggleProps {
  layout: RecipeGridLayout
  onChange: (next: RecipeGridLayout) => void
  className?: string
}

export function RecipeGridToggle({ layout, onChange, className }: RecipeGridToggleProps) {
  return (
    <div
      role="group"
      aria-label="Układ kafelków przepisów"
      className={cn(
        'liquid-glass inline-flex shrink-0 items-center rounded-full p-1',
        className,
      )}
    >
      <button
        type="button"
        aria-label="Widok standardowy (1 kafelek w rzędzie)"
        aria-pressed={layout === 'default'}
        onClick={() => onChange('default')}
        className={cn(
          'inline-flex size-8 cursor-pointer items-center justify-center rounded-xl transition-all duration-200',
          layout === 'default'
            ? 'bg-amber-500 text-white shadow-sm dark:bg-amber-500 dark:text-stone-950'
            : 'text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100',
        )}
      >
        <Rows3 className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Widok kompaktowy (2 kafelki obok siebie)"
        aria-pressed={layout === 'compact2'}
        onClick={() => onChange('compact2')}
        className={cn(
          'inline-flex size-8 cursor-pointer items-center justify-center rounded-xl transition-all duration-200',
          layout === 'compact2'
            ? 'bg-amber-500 text-white shadow-sm dark:bg-amber-500 dark:text-stone-950'
            : 'text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100',
        )}
      >
        <LayoutGrid className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}
