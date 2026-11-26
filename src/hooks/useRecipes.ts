import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import {
  createRecipe,
  deleteRecipeById,
  extractLinkedRecipes,
  listRecipes,
  patchRecipe,
  replaceRecipeImage,
  toggleFavoriteRecipe,
} from '../lib/recipesApi'
import {
  isSupabaseConfigured,
  supabase,
  type RecipeInsert,
  type RecipeRow,
  type RecipeUpdate,
} from '../lib/supabase'

export interface UseRecipesOptions {
  /** Określa, czy pobieranie i subskrypcja Realtime mają być aktywne (np. `Boolean(user)`). */
  enabled?: boolean
}

export interface UseRecipesResult {
  recipes: RecipeRow[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
  toggleFavorite: (id: string) => Promise<RecipeRow | null>
  addRecipe: (payload: RecipeInsert) => Promise<RecipeRow>
  updateRecipeItem: (id: string, payload: RecipeUpdate) => Promise<RecipeRow>
  removeRecipe: (id: string) => Promise<void>
  updatePhoto: (id: string, file: File) => Promise<RecipeRow>
}

function sortRecipesByNewest(items: RecipeRow[]): RecipeRow[] {
  return [...items].sort((a, b) => {
    const timeA = Date.parse(a.created_at) || 0
    const timeB = Date.parse(b.created_at) || 0
    return timeB - timeA
  })
}

function sanitizeRecipeRow(row: RecipeRow): RecipeRow {
  return {
    ...row,
    ingredients: Array.isArray(row.ingredients) ? row.ingredients : [],
    steps: Array.isArray(row.steps) ? row.steps : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    linked_recipes: extractLinkedRecipes(row),
  }
}

function upsertRecipeInList(list: RecipeRow[], incoming: RecipeRow): RecipeRow[] {
  const existing = list.find((item) => item.id === incoming.id)
  const merged: RecipeRow = existing
    ? {
        ...existing,
        ...incoming,
        // Ochrona przed zjawiskiem PostgreSQL TOAST w Supabase Realtime:
        // Przy aktualizacji tylko kolumny (np. is_favorite), kolumny jsonb/text[]
        // mogą nie zostać przesłane i przyjść jako null/undefined.
        ingredients:
          Array.isArray(incoming.ingredients) && incoming.ingredients.length > 0
            ? incoming.ingredients
            : existing.ingredients ?? [],
        steps:
          Array.isArray(incoming.steps) && incoming.steps.length > 0
            ? incoming.steps
            : existing.steps ?? [],
        tags:
          Array.isArray(incoming.tags) && incoming.tags.length > 0
            ? incoming.tags
            : existing.tags ?? [],
        linked_recipes:
          Array.isArray(incoming.linked_recipes)
            ? incoming.linked_recipes
            : (existing.linked_recipes ?? extractLinkedRecipes(incoming)),
      }
    : sanitizeRecipeRow(incoming)

  const next = existing
    ? list.map((item) => (item.id === incoming.id ? merged : item))
    : [merged, ...list]
  return sortRecipesByNewest(next)
}

function toPolishErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message.trim() ? err.message : fallback
}

const RECIPES_CACHE_KEY = 'nasze-przepisy-recipes-cache-v1'

function readCachedRecipes(): RecipeRow[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECIPES_CACHE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return sortRecipesByNewest((parsed as RecipeRow[]).map(sanitizeRecipeRow))
  } catch {
    return []
  }
}

function writeCachedRecipes(items: RecipeRow[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(RECIPES_CACHE_KEY, JSON.stringify(items))
  } catch {
    // Ignoruj błędy przepełnienia localStorage / trybu prywatnego
  }
}

function clearCachedRecipes(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(RECIPES_CACHE_KEY)
  } catch {
    // Ignoruj błędy dostępu do localStorage
  }
}

/**
 * Pobiera przepisy z Supabase, synchronizuje zmiany na żywo przez Supabase Realtime
 * i udostępnia operacje CRUD z optymistyczną aktualizacją interfejsu oraz lokalnym cachem SWR.
 */
export function useRecipes(options: UseRecipesOptions = {}): UseRecipesResult {
  const { enabled } = options
  const configured = isSupabaseConfigured()
  const isSyncActive = configured && enabled !== false

  const [recipes, setRecipes] = useState<RecipeRow[]>(() =>
    configured && enabled !== false ? readCachedRecipes() : [],
  )
  const [isLoading, setIsLoading] = useState<boolean>(
    () => isSyncActive && readCachedRecipes().length === 0,
  )
  const [error, setError] = useState<string | null>(null)

  const recipesRef = useRef<RecipeRow[]>(recipes)
  useEffect(() => {
    recipesRef.current = recipes
    if (isSyncActive) {
      writeCachedRecipes(recipes)
    } else if (enabled === false) {
      clearCachedRecipes()
    }
  }, [recipes, isSyncActive, enabled])

  const refresh = useCallback(async () => {
    if (!isSyncActive) {
      setRecipes([])
      clearCachedRecipes()
      setIsLoading(false)
      return
    }

    if (recipesRef.current.length === 0) {
      setIsLoading(true)
    }
    setError(null)

    try {
      const data = await listRecipes()
      setRecipes(sortRecipesByNewest(data.map(sanitizeRecipeRow)))
    } catch (err) {
      setError(toPolishErrorMessage(err, 'Nie udało się pobrać listy przepisów.'))
    } finally {
      setIsLoading(false)
    }
  }, [isSyncActive])

  useEffect(() => {
    if (!isSyncActive) {
      return
    }

    let isMounted = true
    let channel: ReturnType<typeof supabase.channel> | null = null

    const startSync = async () => {
      // Jeśli wywołano hook bez jawnej flagi `enabled`, upewnij się, że istnieje aktywna sesja domownika.
      if (enabled === undefined) {
        const { data } = await supabase.auth.getSession()
        if (!isMounted) return
        if (!data.session) {
          setRecipes([])
          setIsLoading(false)
          return
        }
      }

      if (recipesRef.current.length === 0) {
        setIsLoading(true)
      }
      setError(null)

      try {
        const data = await listRecipes()
        if (!isMounted) return
        setRecipes(sortRecipesByNewest(data.map(sanitizeRecipeRow)))
      } catch (err) {
        if (!isMounted) return
        setError(toPolishErrorMessage(err, 'Nie udało się pobrać listy przepisów.'))
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }

      if (!isMounted) return

      channel = supabase
        .channel('recipes-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'recipes' },
          (payload: RealtimePostgresChangesPayload<RecipeRow>) => {
            if (!isMounted) return

            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              const incoming = payload.new as RecipeRow
              if (incoming?.id) {
                setRecipes((prev) => upsertRecipeInList(prev, incoming))
              }
              return
            }

            if (payload.eventType === 'DELETE') {
              const deletedId = (payload.old as Partial<RecipeRow> | null)?.id
              if (deletedId) {
                setRecipes((prev) => prev.filter((item) => item.id !== deletedId))
              }
            }
          },
        )
        .subscribe()
    }

    void startSync()

    return () => {
      isMounted = false
      if (channel) {
        void supabase.removeChannel(channel)
      }
    }
  }, [isSyncActive, enabled])

  const toggleFavorite = useCallback(async (id: string): Promise<RecipeRow | null> => {
    const previous = recipesRef.current.find((item) => item.id === id)
    if (!previous) return null

    const nextFavorite = !previous.is_favorite
    setError(null)

    setRecipes((prev) =>
      prev.map((item) => (item.id === id ? { ...item, is_favorite: nextFavorite } : item)),
    )

    try {
      const updated = await toggleFavoriteRecipe(id, nextFavorite)
      setRecipes((prev) => upsertRecipeInList(prev, updated))
      return updated
    } catch (err) {
      setRecipes((prev) => prev.map((item) => (item.id === id ? previous : item)))
      setError(toPolishErrorMessage(err, 'Nie udało się zmienić statusu ulubionego przepisu.'))
      return null
    }
  }, [])

  const addRecipe = useCallback(async (payload: RecipeInsert): Promise<RecipeRow> => {
    const tempId = `optimistic-${crypto.randomUUID()}`
    const now = new Date().toISOString()
    const optimisticRow: RecipeRow = {
      id: tempId,
      created_at: now,
      updated_at: now,
      title: payload.title.trim() || 'Nowy przepis',
      description: payload.description ?? null,
      source_url: payload.source_url ?? null,
      source_platform: payload.source_platform ?? 'manual',
      image_url: payload.image_url ?? null,
      prep_time_minutes: payload.prep_time_minutes ?? 0,
      cook_time_minutes: payload.cook_time_minutes ?? 0,
      servings: payload.servings ?? 2,
      category: payload.category ?? 'Obiad',
      tags: payload.tags ?? [],
      is_favorite: payload.is_favorite ?? false,
      ingredients: payload.ingredients ?? [],
      steps: payload.steps ?? [],
      nutrition: payload.nutrition ?? null,
      created_by: payload.created_by ?? null,
    }

    setError(null)
    setRecipes((prev) => [optimisticRow, ...prev])

    try {
      const created = await createRecipe(payload)
      setRecipes((prev) => {
        const filtered = prev.filter((item) => item.id !== tempId && item.id !== created.id)
        return sortRecipesByNewest([created, ...filtered])
      })
      return created
    } catch (err) {
      setRecipes((prev) => prev.filter((item) => item.id !== tempId))
      const message = toPolishErrorMessage(err, 'Nie udało się dodać przepisu.')
      setError(message)
      throw err instanceof Error ? err : new Error(message)
    }
  }, [])

  const updateRecipeItem = useCallback(
    async (id: string, payload: RecipeUpdate): Promise<RecipeRow> => {
      const previous = recipesRef.current.find((item) => item.id === id)
      setError(null)

      if (previous) {
        const optimistic: RecipeRow = {
          ...previous,
          ...payload,
          updated_at: new Date().toISOString(),
        }
        setRecipes((prev) => prev.map((item) => (item.id === id ? optimistic : item)))
      }

      try {
        const updated = await patchRecipe(id, payload)
        setRecipes((prev) => upsertRecipeInList(prev, updated))
        return updated
      } catch (err) {
        if (previous) {
          setRecipes((prev) => prev.map((item) => (item.id === id ? previous : item)))
        }
        const message = toPolishErrorMessage(err, 'Nie udało się zaktualizować przepisu.')
        setError(message)
        throw err instanceof Error ? err : new Error(message)
      }
    },
    [],
  )

  const removeRecipe = useCallback(async (id: string): Promise<void> => {
    const previous = recipesRef.current.find((item) => item.id === id)
    setError(null)
    setRecipes((prev) => prev.filter((item) => item.id !== id))

    try {
      await deleteRecipeById(id)
    } catch (err) {
      if (previous) {
        setRecipes((prev) => upsertRecipeInList(prev, previous))
      }
      const message = toPolishErrorMessage(err, 'Nie udało się usunąć przepisu.')
      setError(message)
      throw err instanceof Error ? err : new Error(message)
    }
  }, [])

  const updatePhoto = useCallback(async (id: string, file: File): Promise<RecipeRow> => {
    const previous = recipesRef.current.find((item) => item.id === id)
    const previewUrl = URL.createObjectURL(file)
    setError(null)

    if (previous) {
      setRecipes((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, image_url: previewUrl, updated_at: new Date().toISOString() }
            : item,
        ),
      )
    }

    try {
      const updated = await replaceRecipeImage(id, file)
      setRecipes((prev) => upsertRecipeInList(prev, updated))
      return updated
    } catch (err) {
      if (previous) {
        setRecipes((prev) => prev.map((item) => (item.id === id ? previous : item)))
      }
      const message = toPolishErrorMessage(err, 'Nie udało się zaktualizować zdjęcia przepisu.')
      setError(message)
      throw err instanceof Error ? err : new Error(message)
    } finally {
      URL.revokeObjectURL(previewUrl)
    }
  }, [])

  return {
    recipes: isSyncActive ? recipes : [],
    isLoading: isSyncActive ? isLoading : false,
    error: isSyncActive ? error : null,
    refresh,
    toggleFavorite,
    addRecipe,
    updateRecipeItem,
    removeRecipe,
    updatePhoto,
  }
}
