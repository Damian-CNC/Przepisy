import { useCallback, useEffect, useState } from 'react'

export type RecipeGridLayout = 'default' | 'compact2'

const STORAGE_KEY = 'nasze-przepisy-grid-layout'
const SYNC_EVENT = 'nasze-przepisy-grid-layout-change'

function readStoredLayout(): RecipeGridLayout {
  if (typeof window === 'undefined') return 'default'
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'compact2' ? 'compact2' : 'default'
  } catch {
    return 'default'
  }
}

/**
 * Synchronizuje wybór układu kafelków (1 kolumna vs 2 obok siebie) między wszystkimi zakładkami.
 */
export function useRecipeGridLayout(): [RecipeGridLayout, (next: RecipeGridLayout) => void] {
  const [layout, setLayoutState] = useState<RecipeGridLayout>(readStoredLayout)

  useEffect(() => {
    const handleSync = () => {
      setLayoutState(readStoredLayout())
    }
    window.addEventListener(SYNC_EVENT, handleSync)
    window.addEventListener('storage', handleSync)
    return () => {
      window.removeEventListener(SYNC_EVENT, handleSync)
      window.removeEventListener('storage', handleSync)
    }
  }, [])

  const setLayout = useCallback((next: RecipeGridLayout) => {
    setLayoutState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
      window.dispatchEvent(new Event(SYNC_EVENT))
    } catch {
      // Ignoruj błędy dostępu do localStorage
    }
  }, [])

  return [layout, setLayout]
}
