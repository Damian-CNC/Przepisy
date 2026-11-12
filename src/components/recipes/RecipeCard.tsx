import { motion, useReducedMotion } from 'framer-motion'
import { ChefHat, Clock, Heart, Users } from 'lucide-react'
import type { RecipeRow } from '../../lib/supabase'
import { GlassCard, cn } from '../ui'
import { getSourceMeta } from './recipeMeta'

export interface RecipeCardProps {
  recipe: RecipeRow
  onSelect: (recipe: RecipeRow) => void
  onToggleFavorite: (id: string) => void | Promise<unknown>
}

function getTotalMinutes(recipe: RecipeRow): number {
  const prep = typeof recipe.prep_time_minutes === 'number' ? Math.max(0, recipe.prep_time_minutes) : 0
  const cook = typeof recipe.cook_time_minutes === 'number' ? Math.max(0, recipe.cook_time_minutes) : 0
  return prep + cook
}

/**
 * Karta przepisu w siatce Liquid Glass z ochroną kontrastu i niezależnym przyciskiem Ulubione.
 */
export function RecipeCard({ recipe, onSelect, onToggleFavorite }: RecipeCardProps) {
  const prefersReducedMotion = useReducedMotion()
  const { label: sourceLabel, Icon: SourceIcon } = getSourceMeta(recipe.source_platform)
  const totalMinutes = getTotalMinutes(recipe)
  const servings = recipe.servings && recipe.servings > 0 ? recipe.servings : 2
  const isFavorite = Boolean(recipe.is_favorite)

  return (
    <GlassCard variant="interactive" padding="none" className="h-full">
      <article className="relative flex h-full flex-col">
        {/* Główny przycisk otwierający szczegóły przepisu (rodzeństwo przycisku Ulubione) */}
        <button
          type="button"
          onClick={() => onSelect(recipe)}
          aria-label={`Otwórz przepis: ${recipe.title}`}
          className={cn(
            'group flex h-full w-full cursor-pointer flex-col text-left',
            'focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-amber-600 dark:focus-visible:outline-amber-400',
          )}
        >
          {/* Zdjęcie potrawy lub ciepły kulinarny gradient placeholder */}
          <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-amber-200/85 via-orange-200/75 to-emerald-200/75 dark:from-amber-950/80 dark:via-stone-800 dark:to-emerald-950/75">
            {recipe.image_url ? (
              <img
                src={recipe.image_url}
                alt={recipe.title}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ChefHat
                  className="size-16 text-amber-900/35 dark:text-amber-300/30"
                  aria-hidden="true"
                />
              </div>
            )}

            {/* Warstwa gwarantująca wysoki kontrast na jasnych i ciemnych zdjęciach */}
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/15"
              aria-hidden="true"
            />

            {/* Górna kapsuła źródła */}
            <div className="absolute top-3 left-3 pr-14">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-zinc-950/70 px-3 py-1 text-xs font-medium text-white backdrop-blur-xl">
                <SourceIcon className="size-3.5 text-amber-300" aria-hidden="true" />
                <span>{sourceLabel}</span>
              </span>
            </div>

            {/* Dolny tytuł i czas całkowity na zdjęciu */}
            <div className="absolute inset-x-3.5 bottom-3 flex items-end justify-between gap-2 text-white">
              <div className="min-w-0 flex-1">
                {recipe.category && (
                  <p className="truncate text-xs font-semibold tracking-wide text-amber-200 uppercase">
                    {recipe.category}
                  </p>
                )}
                <h2 className="mt-0.5 line-clamp-2 text-lg leading-snug font-semibold tracking-tight text-white sm:text-xl">
                  {recipe.title}
                </h2>
              </div>

              {totalMinutes > 0 && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/25 bg-zinc-950/75 px-2.5 py-1 text-xs font-semibold text-white tabular-nums backdrop-blur-xl">
                  <Clock className="size-3.5 text-amber-300" aria-hidden="true" />
                  <span>{totalMinutes} min</span>
                </span>
              )}
            </div>
          </div>

          {/* Dolna sekcja metadanych */}
          <div className="flex flex-1 flex-col justify-between gap-3 p-4 sm:p-5">
            {recipe.description ? (
              <p className="line-clamp-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                {recipe.description}
              </p>
            ) : (
              <p className="text-sm text-stone-500 dark:text-stone-400">
                {recipe.ingredients.length > 0
                  ? `${recipe.ingredients.length} składników • ${recipe.steps.length} kroków`
                  : 'Gotowy do przygotowania'}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-900/10 bg-white/60 px-2.5 py-1 text-xs font-medium text-stone-700 tabular-nums dark:border-white/10 dark:bg-white/10 dark:text-stone-200">
                  <Users className="size-3.5 text-amber-700 dark:text-amber-400" aria-hidden="true" />
                  <span>{servings} porcje</span>
                </span>
                {recipe.steps.length > 0 && (
                  <span className="inline-flex items-center rounded-full border border-stone-900/10 bg-white/60 px-2.5 py-1 text-xs font-medium text-stone-700 tabular-nums dark:border-white/10 dark:bg-white/10 dark:text-stone-200">
                    {recipe.steps.length} kroków
                  </span>
                )}
              </div>

              <span className="text-sm font-semibold text-amber-700 transition-transform group-hover:translate-x-0.5 dark:text-amber-400">
                Otwórz →
              </span>
            </div>
          </div>
        </button>

        {/* Przycisk Ulubione jako rodzeństwo względem przycisku otwierającego przepis */}
        <motion.button
          type="button"
          aria-label={
            isFavorite
              ? `Usuń przepis ${recipe.title} z ulubionych`
              : `Dodaj przepis ${recipe.title} do ulubionych`
          }
          aria-pressed={isFavorite}
          onClick={() => {
            void onToggleFavorite(recipe.id)
          }}
          whileTap={prefersReducedMotion ? undefined : { scale: 0.84 }}
          animate={
            prefersReducedMotion
              ? undefined
              : isFavorite
                ? { scale: [1, 1.18, 1] }
                : { scale: 1 }
          }
          transition={{ type: 'spring', stiffness: 520, damping: 24 }}
          className={cn(
            'absolute top-2.5 right-2.5 z-10 inline-flex size-11 cursor-pointer items-center justify-center rounded-full',
            'border border-white/35 bg-zinc-950/60 text-white backdrop-blur-xl',
            'hover:bg-zinc-950/75',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400',
          )}
        >
          <Heart
            className={cn(
              'size-5 transition-colors duration-150',
              isFavorite ? 'fill-rose-500 text-rose-500' : 'text-white',
            )}
            aria-hidden="true"
          />
        </motion.button>
      </article>
    </GlassCard>
  )
}
