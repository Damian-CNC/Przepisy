import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { MotionConfig } from 'framer-motion'
import {
  AlertCircle,
  ChefHat,
  Heart,
  Link2,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  X,
} from 'lucide-react'
import { RecipeCard } from './components/recipes/RecipeCard'
import { RecipeGridToggle } from './components/recipes/RecipeGridToggle'
import { useRecipeGridLayout } from './hooks/useRecipeGridLayout'
import {
  RECIPE_CATEGORIES,
  isPizzaRecipe,
  isTinctureRecipe,
} from './components/recipes/recipeMeta'
import { BottomTabBar, type NavigationTab } from './components/navigation/BottomTabBar'
import {
  AmbientBackground,
  GlassButton,
  GlassCard,
  GlassPill,
  cn,
} from './components/ui'
import { ChefHatLoader } from './components/ui/ChefHatLoader'
import { useAuth } from './hooks/useAuth'
import { useRecipes } from './hooks/useRecipes'
import { useWakeLock } from './hooks/useWakeLock'
import { checkAndApplyPwaUpdate } from './lib/pwaUpdate'
import {
  fetchAndConsumePendingShare,
  subscribeToPendingShares,
} from './lib/pendingShares'
import {
  checkClipboardForRecipeUrl,
  consumePendingSharePayload,
  dismissClipboardUrl,
  parseShareTargetFromLocation,
  parseShareTargetParams,
  peekPendingSharePayload,
  savePendingSharePayload,
  type SharedImportPayload,
} from './lib/shareTarget'
import type { RecipeRow } from './lib/supabase'

const CookingModeView = lazy(() =>
  import('./components/cooking/CookingModeView').then((mod) => ({
    default: mod.CookingModeView,
  })),
)

const AuthScreen = lazy(() =>
  import('./components/auth/AuthScreen').then((mod) => ({
    default: mod.AuthScreen,
  })),
)

const RecipeDetailView = lazy(() =>
  import('./components/recipes/RecipeDetailView').then((mod) => ({
    default: mod.RecipeDetailView,
  })),
)

const SmartImportModal = lazy(() =>
  import('./components/recipes/SmartImportModal').then((mod) => ({
    default: mod.SmartImportModal,
  })),
)

const SettingsModal = lazy(() =>
  import('./components/settings/SettingsModal').then((mod) => ({
    default: mod.SettingsModal,
  })),
)

const PizzaCalculatorView = lazy(() =>
  import('./components/pizza/PizzaCalculatorView').then((mod) => ({
    default: mod.PizzaCalculatorView,
  })),
)

const TinctureCalculatorView = lazy(() =>
  import('./components/tinctures/TinctureCalculatorView').then((mod) => ({
    default: mod.TinctureCalculatorView,
  })),
)

const FILTER_OPTIONS = ['Wszystkie', 'Ulubione', ...RECIPE_CATEGORIES] as const
type FilterOption = string

interface CookingSessionState {
  recipe: RecipeRow
  targetServings: number
}

interface ActiveShareImportState {
  url: string
  rawText: string
  autoAnalyze: boolean
}

export function App() {
  // Globalna blokada wygaszania ekranu w całej aplikacji
  useWakeLock(true)

  // Blokada przeciągania aplikacji góra/dół poza ramy (rubber-band / pull-to-refresh na iOS i Android)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    let startX = 0
    let startY = 0

    const isInScrollableContainer = (target: EventTarget | null, deltaY: number): boolean => {
      let el = target instanceof HTMLElement ? target : null
      while (el && el !== document.body && el !== document.documentElement) {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
          return true
        }
        const style = window.getComputedStyle(el)
        const overflowY = style.overflowY
        if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
          const canScrollUp = el.scrollTop > 0
          const canScrollDown = el.scrollTop + el.clientHeight < el.scrollHeight - 1
          if ((deltaY > 0 && canScrollUp) || (deltaY < 0 && canScrollDown)) {
            return true
          }
        }
        el = el.parentElement
      }
      return false
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        startX = e.touches[0].clientX
        startY = e.touches[0].clientY
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const deltaX = e.touches[0].clientX - startX
      const deltaY = e.touches[0].clientY - startY

      if (Math.abs(deltaY) <= Math.abs(deltaX) || Math.abs(deltaY) <= 2) return
      if (isInScrollableContainer(e.target, deltaY)) return

      const atTop = window.scrollY <= 0
      const atBottom =
        window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1

      if ((atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
        e.preventDefault()
      }
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: false })

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
    }
  }, [])

  const {
    user,
    isLoading: isAuthLoading,
    authError,
    signInWithPassword,
    signInWithMagicLink,
    signOut,
    clearAuthError,
  } = useAuth()

  const {
    recipes,
    isLoading: isRecipesLoading,
    error: recipesError,
    refresh,
    toggleFavorite,
    addRecipe,
    updateRecipeItem,
    removeRecipe,
    updatePhoto,
  } = useRecipes({ enabled: Boolean(user) })

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFilter, setSelectedFilter] = useState<FilterOption>('Wszystkie')
  const [gridLayout, setGridLayout] = useRecipeGridLayout()
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null)
  const [recipeHistory, setRecipeHistory] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<NavigationTab>('recipes')
  const [hasVisitedPizza, setHasVisitedPizza] = useState(false)
  const [hasVisitedTinctures, setHasVisitedTinctures] = useState(false)

  // Prefetch głównych podwidoków w czasie bezczynności przeglądarki
  useEffect(() => {
    if (!user || typeof window === 'undefined') return
    const timer = window.setTimeout(() => {
      void import('./components/recipes/RecipeDetailView')
      void import('./components/pizza/PizzaCalculatorView')
      void import('./components/tinctures/TinctureCalculatorView')
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [user])
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [isManualRefreshing, setIsManualRefreshing] = useState(false)
  const [cookingSession, setCookingSession] = useState<CookingSessionState | null>(null)
  const [activeShareImport, setActiveShareImport] = useState<ActiveShareImportState | null>(null)
  const [detectedClipboardUrl, setDetectedClipboardUrl] = useState<string | null>(null)
  const [pendingShareNotice, setPendingShareNotice] = useState<SharedImportPayload | null>(() => {
    if (typeof window === 'undefined') return null
    const fromUrl = parseShareTargetFromLocation() ?? parseShareTargetParams(window.location.search)
    if (fromUrl) {
      savePendingSharePayload(fromUrl)
      return fromUrl
    }
    return peekPendingSharePayload()
  })

  // Nasłuchiwanie na nowe udostępnienia w URL oraz sprawdzanie schowka po powrocie do aplikacji
  useEffect(() => {
    if (typeof window === 'undefined') return

    const checkIncomingShare = async () => {
      // 1. Sprawdź, czy w adresie URL (search, hash lub href) pojawił się parametr importUrl
      const parsedShare = parseShareTargetFromLocation()
      if (parsedShare) {
        savePendingSharePayload(parsedShare)
        const cleanUrl = `${window.location.pathname}${window.location.hash.split('?')[0]}`
        window.history.replaceState({}, document.title, cleanUrl)
        if (user && !isAuthLoading) {
          setActiveShareImport({
            url: parsedShare.url,
            rawText: parsedShare.rawText,
            autoAnalyze: true,
          })
          setIsImportModalOpen(true)
        }
        return
      }

      // 2. Sprawdź kolejkę bezobsługową w Supabase (gdy Skrót iOS dodał link do bazy)
      if (user && !isAuthLoading && !isImportModalOpen) {
        const pendingShare = await fetchAndConsumePendingShare()
        if (pendingShare && pendingShare.url) {
          setActiveShareImport({
            url: pendingShare.url,
            rawText: pendingShare.rawText,
            autoAnalyze: true,
          })
          setIsImportModalOpen(true)
          return
        }
      }

      // 3. Jeśli brak w kolejce, sprawdź schowek jako rezerwowe rozwiązanie
      if (user && !isAuthLoading && !isImportModalOpen && document.visibilityState === 'visible') {
        const clipboardUrl = await checkClipboardForRecipeUrl()
        if (clipboardUrl) {
          setDetectedClipboardUrl(clipboardUrl)
        }
      }
    }

    void checkIncomingShare()

    const onVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        void checkIncomingShare()
      }
    }

    window.addEventListener('visibilitychange', onVisibilityOrFocus)
    window.addEventListener('focus', onVisibilityOrFocus)
    window.addEventListener('pageshow', onVisibilityOrFocus)
    window.addEventListener('popstate', onVisibilityOrFocus)
    window.addEventListener('hashchange', onVisibilityOrFocus)

    return () => {
      window.removeEventListener('visibilitychange', onVisibilityOrFocus)
      window.removeEventListener('focus', onVisibilityOrFocus)
      window.removeEventListener('pageshow', onVisibilityOrFocus)
      window.removeEventListener('popstate', onVisibilityOrFocus)
      window.removeEventListener('hashchange', onVisibilityOrFocus)
    }
  }, [user, isAuthLoading, isImportModalOpen])

  // Subskrypcja na żywo do kolejki pending_shares (dla natychmiastowego otwarcia, gdy aplikacja jest już włączona)
  useEffect(() => {
    if (!user || isAuthLoading) return

    const unsubscribe = subscribeToPendingShares((share) => {
      if (share.url) {
        setActiveShareImport({
          url: share.url,
          rawText: share.rawText,
          autoAnalyze: true,
        })
        setIsImportModalOpen(true)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [user, isAuthLoading])

  useEffect(() => {
    if (isAuthLoading || !user) return

    const payloadToOpen = consumePendingSharePayload()
    if (!payloadToOpen) return

    let consumed = false
    const timeoutId = window.setTimeout(() => {
      consumed = true
      setPendingShareNotice(null)
      setActiveShareImport({
        url: payloadToOpen.url,
        rawText: payloadToOpen.rawText,
        autoAnalyze: true,
      })
      setIsImportModalOpen(true)
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
      if (!consumed) {
        // Jeśli efekt zostanie wyczyszczony przed odpaleniem timera (np. w React StrictMode),
        // zachowujemy ładunek ponownie, aby drugie uruchomienie mogło go przejąć.
        savePendingSharePayload(payloadToOpen)
      }
    }
  }, [isAuthLoading, user])

  const selectedRecipe = useMemo(
    () => recipes.find((item) => item.id === selectedRecipeId) ?? null,
    [recipes, selectedRecipeId],
  )

  const activeCookingRecipe = useMemo(
    () =>
      cookingSession
        ? recipes.find((item) => item.id === cookingSession.recipe.id) ?? cookingSession.recipe
        : null,
    [cookingSession, recipes],
  )

  // Przepisy główne (bez pizzy i nalewek, które mają własne zakładki)
  const mainRecipes = useMemo(
    () => recipes.filter((recipe) => !isPizzaRecipe(recipe) && !isTinctureRecipe(recipe)),
    [recipes],
  )

  const filteredRecipes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return mainRecipes.filter((recipe) => {
      if (selectedFilter === 'Ulubione' && !recipe.is_favorite) {
        return false
      }
      if (
        selectedFilter !== 'Wszystkie' &&
        selectedFilter !== 'Ulubione' &&
        (recipe.category ?? '').toLowerCase() !== selectedFilter.toLowerCase()
      ) {
        return false
      }

      if (!query) return true

      const inTitle = recipe.title.toLowerCase().includes(query)
      const inDescription = (recipe.description ?? '').toLowerCase().includes(query)
      const inCategory = (recipe.category ?? '').toLowerCase().includes(query)
      const inTags =
        Array.isArray(recipe.tags) &&
        recipe.tags.some((tag) => (tag ?? '').toLowerCase().includes(query))
      const inIngredients =
        Array.isArray(recipe.ingredients) &&
        recipe.ingredients.some((ing) => (ing?.name ?? '').toLowerCase().includes(query))

      return inTitle || inDescription || inCategory || inTags || inIngredients
    })
  }, [mainRecipes, searchQuery, selectedFilter])

  const handleSignOut = async () => {
    if (isSigningOut) return
    setIsSigningOut(true)
    try {
      const ok = await signOut()
      if (ok) {
        setIsSettingsModalOpen(false)
        setCookingSession(null)
        setSelectedRecipeId(null)
        setRecipeHistory([])
        setSearchQuery('')
        setSelectedFilter('Wszystkie')
      }
    } finally {
      setIsSigningOut(false)
    }
  }

  const handleSelectRecipe = (id: string) => {
    setRecipeHistory([id])
    setSelectedRecipeId(id)
    if (typeof window !== 'undefined') {
      window.history.pushState({ appNav: 'recipe', id }, '')
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    }
  }

  const handleNavigateToLinkedRecipe = (targetId: string) => {
    setRecipeHistory((prev) => [...prev, targetId])
    setSelectedRecipeId(targetId)
    if (typeof window !== 'undefined') {
      window.history.pushState({ appNav: 'recipe', id: targetId }, '')
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    }
  }

  const handleStartCookingSession = (recipe: RecipeRow, targetServings: number) => {
    setCookingSession({ recipe, targetServings })
    if (typeof window !== 'undefined') {
      window.history.pushState({ appNav: 'cooking', id: recipe.id }, '')
    }
  }

  const handleBackFromRecipe = () => {
    if (typeof window !== 'undefined' && (window.history.state as { appNav?: string } | null)?.appNav === 'recipe') {
      window.history.back()
      return
    }
    if (recipeHistory.length > 1) {
      const nextHistory = recipeHistory.slice(0, -1)
      setRecipeHistory(nextHistory)
      setSelectedRecipeId(nextHistory[nextHistory.length - 1])
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
      }
    } else {
      setRecipeHistory([])
      setSelectedRecipeId(null)
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
      }
    }
  }

  const handleExitCooking = () => {
    if (typeof window !== 'undefined' && (window.history.state as { appNav?: string } | null)?.appNav === 'cooking') {
      window.history.back()
      return
    }
    setCookingSession(null)
  }

  // Obsługa systemowego cofania / gestu wstecz na iPhone (History API popstate)
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handlePopState = () => {
      if (cookingSession) {
        setCookingSession(null)
        return
      }
      if (recipeHistory.length > 1) {
        const nextHistory = recipeHistory.slice(0, -1)
        setRecipeHistory(nextHistory)
        setSelectedRecipeId(nextHistory[nextHistory.length - 1])
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
        return
      }
      if (selectedRecipeId !== null) {
        setRecipeHistory([])
        setSelectedRecipeId(null)
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [cookingSession, recipeHistory, selectedRecipeId])

  const handleRefreshAll = async () => {
    if (isManualRefreshing) return
    setIsManualRefreshing(true)
    try {
      await Promise.all([refresh(), checkAndApplyPwaUpdate()])
    } finally {
      setIsManualRefreshing(false)
    }
  }

  const isRefreshBusy = isManualRefreshing || (isRecipesLoading && recipes.length > 0)

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-dvh overflow-x-clip text-stone-900 dark:text-stone-50">
        <AmbientBackground />

        {isAuthLoading ? (
          <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-4">
            <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 text-center">
              <ChefHatLoader />
              <p className="text-base font-medium text-stone-700 dark:text-stone-200">
                Otwieramy Waszą książkę kucharską...
              </p>
            </div>
          </main>
        ) : !user ? (
          <Suspense
            fallback={
              <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-4">
                <ChefHatLoader />
              </main>
            }
          >
            <AuthScreen
              authError={authError}
              pendingShare={pendingShareNotice}
              onSignInWithPassword={signInWithPassword}
              onSignInWithMagicLink={signInWithMagicLink}
              onClearError={clearAuthError}
            />
          </Suspense>
        ) : (
          <>
            {/* Pływający baner wykrytego linku ze schowka (dla Skrótów iOS / Chrome) */}
            {detectedClipboardUrl && !isImportModalOpen && (
              <aside
                aria-label="Wykryto link ze schowka"
                className="fixed top-4 inset-x-4 z-50 mx-auto max-w-lg"
              >
                <GlassCard variant="elevated" padding="sm" className="border-amber-500/50 shadow-2xl backdrop-blur-2xl">
                  <div className="flex items-center justify-between gap-3 p-1">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-rose-500 text-white shadow-sm">
                        <Link2 className="size-4.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-stone-900 dark:text-stone-50 truncate">
                          Wykryto link z Instagrama w schowku!
                        </p>
                        <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                          {detectedClipboardUrl}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <GlassButton
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          const urlToAdd = detectedClipboardUrl
                          dismissClipboardUrl(urlToAdd)
                          setDetectedClipboardUrl(null)
                          setActiveShareImport({
                            url: urlToAdd,
                            rawText: '',
                            autoAnalyze: true,
                          })
                          setIsImportModalOpen(true)
                        }}
                      >
                        Dodaj przepis
                      </GlassButton>
                      <button
                        type="button"
                        aria-label="Zamknij powiadomienie"
                        onClick={() => {
                          dismissClipboardUrl(detectedClipboardUrl)
                          setDetectedClipboardUrl(null)
                        }}
                        className="rounded-lg p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors cursor-pointer"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  </div>
                </GlassCard>
              </aside>
            )}

            {cookingSession && activeCookingRecipe ? (
              <Suspense
                fallback={
                  <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-4">
                    <GlassCard variant="elevated" padding="lg" className="w-full text-center">
                      <div className="flex flex-col items-center gap-4">
                        <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
                          <ChefHat
                            className="size-7 animate-pulse motion-reduce:animate-none"
                            aria-hidden="true"
                          />
                        </div>
                        <p className="text-base font-medium text-stone-700 dark:text-stone-200">
                          Uruchamiamy tryb gotowania...
                        </p>
                      </div>
                    </GlassCard>
                  </main>
                }
              >
                <CookingModeView
                  key={activeCookingRecipe.id}
                  recipe={activeCookingRecipe}
                  targetServings={cookingSession.targetServings}
                  onExit={handleExitCooking}
                  onUpdateRecipe={updateRecipeItem}
                />
              </Suspense>
            ) : selectedRecipe ? (
              <Suspense
                fallback={
                  <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-4">
                    <ChefHatLoader />
                  </main>
                }
              >
                <RecipeDetailView
                  key={selectedRecipe.id}
                  recipe={selectedRecipe}
                  allRecipes={recipes}
                  onBack={handleBackFromRecipe}
                  onSelectRecipe={handleNavigateToLinkedRecipe}
                  hasPreviousRecipe={recipeHistory.length > 1}
                  onToggleFavorite={toggleFavorite}
                  onUpdatePhoto={updatePhoto}
                  onUpdateRecipe={updateRecipeItem}
                  onRemoveRecipe={removeRecipe}
                  onStartCooking={handleStartCookingSession}
                />
              </Suspense>
            ) : (
              <>
                {(activeTab === 'pizza' || hasVisitedPizza) && (
                  <div
                    className={cn(
                      activeTab === 'pizza'
                        ? 'tab-view-enter pb-28 pt-[calc(env(safe-area-inset-top,0px)+0.25rem)]'
                        : 'hidden',
                    )}
                  >
                    <Suspense
                      fallback={
                        <div className="flex min-h-[45vh] items-center justify-center">
                          <ChefHatLoader />
                        </div>
                      }
                    >
                      <PizzaCalculatorView
                        recipes={recipes}
                        onSelectRecipe={handleSelectRecipe}
                        onToggleFavorite={toggleFavorite}
                        onSaveRecipe={async (payload) => {
                          const created = await addRecipe(payload)
                          return created
                        }}
                        onNavigateToRecipes={() => {
                          setActiveTab('recipes')
                          setSelectedRecipeId(null)
                        }}
                      />
                    </Suspense>
                  </div>
                )}

                {(activeTab === 'tinctures' || hasVisitedTinctures) && (
                  <div
                    className={cn(
                      activeTab === 'tinctures'
                        ? 'tab-view-enter pb-28 pt-[calc(env(safe-area-inset-top,0px)+0.25rem)]'
                        : 'hidden',
                    )}
                  >
                    <Suspense
                      fallback={
                        <div className="flex min-h-[45vh] items-center justify-center">
                          <ChefHatLoader />
                        </div>
                      }
                    >
                      <TinctureCalculatorView
                        recipes={recipes}
                        onSelectRecipe={handleSelectRecipe}
                        onToggleFavorite={toggleFavorite}
                        onSaveRecipe={async (payload) => {
                          const created = await addRecipe(payload)
                          return created
                        }}
                        onNavigateToRecipes={() => {
                          setActiveTab('recipes')
                          setSelectedRecipeId(null)
                        }}
                      />
                    </Suspense>
                  </div>
                )}

                <div
                  className={cn(
                    activeTab === 'recipes' ? 'tab-view-enter pb-28' : 'hidden',
                  )}
                >
                <header className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] sm:gap-5 sm:px-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex items-center gap-2">
                        <GlassPill
                          variant="tag"
                          size="sm"
                          leftIcon={
                            <ChefHat
                              className="size-3.5 text-amber-700 dark:text-amber-400"
                              aria-hidden="true"
                            />
                          }
                        >
                          <span className="tabular-nums">
                            {mainRecipes.length}{' '}
                            {mainRecipes.length === 1
                              ? 'przepis'
                              : mainRecipes.length >= 2 && mainRecipes.length <= 4
                                ? 'przepisy'
                                : 'przepisów'}
                          </span>
                        </GlassPill>
                      </div>
                      <h1 className="text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl dark:text-stone-50">
                        Nasze Przepisy
                      </h1>
                    </div>

                    {/* Akcje w prawym górnym rogu */}
                    <div className="flex shrink-0 items-center gap-2 pt-0.5">
                      {/* Mobilny przycisk Odśwież — idealnie wyśrodkowana ikona */}
                      <GlassButton
                        variant="secondary"
                        size="md"
                        aria-label="Odśwież przepisy i sprawdź aktualizację aplikacji"
                        disabled={isRefreshBusy}
                        onClick={() => void handleRefreshAll()}
                        className="size-11 !gap-0 !px-0 sm:hidden"
                      >
                        <RefreshCw
                          className={cn(
                            'size-4.5',
                            isRefreshBusy && 'animate-spin motion-reduce:animate-none',
                          )}
                          aria-hidden="true"
                        />
                      </GlassButton>

                      {/* Desktopowy przycisk Odśwież z etykietą */}
                      <GlassButton
                        variant="secondary"
                        size="md"
                        isLoading={isRefreshBusy}
                        onClick={() => void handleRefreshAll()}
                        leftIcon={<RefreshCw className="size-4" aria-hidden="true" />}
                        className="hidden sm:inline-flex"
                      >
                        Odśwież
                      </GlassButton>

                      <GlassButton
                        variant="primary"
                        size="md"
                        leftIcon={<Plus className="size-4" aria-hidden="true" />}
                        onClick={() => setIsImportModalOpen(true)}
                        className="hidden sm:inline-flex"
                      >
                        Dodaj przepis
                      </GlassButton>

                      {/* Ustawienia zawsze w prawym górnym rogu */}
                      <GlassButton
                        variant="secondary"
                        size="md"
                        aria-label="Ustawienia"
                        onClick={() => setIsSettingsModalOpen(true)}
                        className="size-11 !gap-0 !px-0"
                      >
                        <Settings className="size-4.5" aria-hidden="true" />
                      </GlassButton>
                    </div>
                  </div>

                  {/* Mobilny przycisk Dodaj przepis */}
                  <GlassButton
                    variant="primary"
                    size="md"
                    fullWidth
                    leftIcon={<Plus className="size-4" aria-hidden="true" />}
                    onClick={() => setIsImportModalOpen(true)}
                    className="sm:hidden"
                  >
                    Dodaj przepis
                  </GlassButton>

                  {/* Pływający pasek wyszukiwania + przełącznik widoku kafelków po prawej */}
                  <div className="flex items-center gap-2.5">
                    <search className="min-w-0 flex-1">
                      <form
                        onSubmit={(e) => e.preventDefault()}
                        className="liquid-glass flex items-center gap-2 rounded-full px-3.5 py-0.5"
                      >
                        <label htmlFor="recipe-search" className="sr-only">
                          Szukaj przepisu po nazwie lub składniku
                        </label>
                        <Search
                          className="ml-1 size-4.5 shrink-0 text-stone-500 dark:text-stone-400"
                          aria-hidden="true"
                        />
                        <input
                          id="recipe-search"
                          name="q"
                          type="search"
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          enterKeyHint="search"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Szukaj po tytule, składniku lub tagu..."
                          className={cn(
                            'min-h-10 w-full bg-transparent text-base text-stone-900 placeholder:text-stone-500',
                            'dark:text-stone-50 dark:placeholder:text-stone-400',
                            'focus:outline-none',
                          )}
                        />
                        {searchQuery && (
                          <button
                            type="button"
                            aria-label="Wyczyść wyszukiwanie"
                            onClick={() => setSearchQuery('')}
                            className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-stone-600 hover:bg-stone-900/5 dark:text-stone-300 dark:hover:bg-white/10"
                          >
                            <X className="size-4" aria-hidden="true" />
                          </button>
                        )}
                      </form>
                    </search>

                    <RecipeGridToggle
                      layout={gridLayout}
                      onChange={setGridLayout}
                      className="h-[46px]"
                    />
                  </div>

                  {/* Pigułki filtrów kategorii */}
                  <div
                    role="group"
                    aria-label="Filtry kategorii przepisów"
                    className="flex w-full items-center gap-2 overflow-x-auto py-2 -my-1 px-1 -mx-1 sm:flex-wrap sm:overflow-visible no-scrollbar"
                  >
                    {FILTER_OPTIONS.map((category) => {
                      const active = selectedFilter === category
                      return (
                        <GlassPill
                          key={category}
                          as="button"
                          variant={active ? 'active' : 'surface'}
                          size="md"
                          aria-pressed={active}
                          leftIcon={
                            category === 'Ulubione' ? (
                              <Heart
                                className={cn(
                                  'size-4',
                                  active ? 'fill-current' : 'text-rose-500',
                                )}
                                aria-hidden="true"
                              />
                            ) : undefined
                          }
                          onClick={() => setSelectedFilter(category)}
                          className="shrink-0 whitespace-nowrap"
                        >
                          {category}
                        </GlassPill>
                      )
                    })}
                  </div>
                </header>

                <main className="mx-auto mt-5 flex w-full max-w-5xl flex-col gap-6 px-4 sm:px-6">
                  {/* Błąd pobierania/operacji */}
                  {recipesError && (
                    <div
                      role="alert"
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/35 bg-red-500/12 p-4 text-sm font-medium text-red-900 dark:border-red-400/35 dark:bg-red-500/15 dark:text-red-200"
                    >
                      <div className="flex items-center gap-2.5">
                        <AlertCircle className="size-5 shrink-0" aria-hidden="true" />
                        <span>{recipesError}</span>
                      </div>
                      <GlassButton
                        variant="secondary"
                        size="sm"
                        onClick={() => void refresh()}
                      >
                        Spróbuj ponownie
                      </GlassButton>
                    </div>
                  )}

                  {/* Ładowanie przepisów – animowana czapka kucharska */}
                  {isRecipesLoading && recipes.length === 0 ? (
                    <section
                      aria-label="Ładowanie przepisów"
                      role="status"
                      aria-live="polite"
                      className="flex min-h-[45vh] flex-col items-center justify-center gap-3 py-10 text-center"
                    >
                      <ChefHatLoader />
                      <p className="text-sm font-medium text-stone-600 dark:text-stone-300">
                        Wczytujemy Wasze przepisy...
                      </p>
                    </section>
                  ) : mainRecipes.length === 0 ? (
                    /* Stan pusty: brak jakichkolwiek przepisów */
                    <GlassCard variant="elevated" padding="lg" className="text-center">
                      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-6">
                        <div className="inline-flex size-16 items-center justify-center rounded-3xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
                          <Sparkles className="size-8" aria-hidden="true" />
                        </div>
                        <div className="space-y-1.5">
                          <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-50">
                            Książka kucharska czeka na pierwszy przepis
                          </h2>
                          <p className="text-base leading-relaxed text-stone-600 dark:text-stone-300">
                            Wklej link do rolki z Instagrama, zrób zdjęcie strony z książki albo wpisz
                            ulubione danie ręcznie.
                          </p>
                        </div>
                        <GlassButton
                          variant="primary"
                          size="lg"
                          leftIcon={<Plus className="size-5" aria-hidden="true" />}
                          onClick={() => setIsImportModalOpen(true)}
                        >
                          Dodaj pierwszy przepis
                        </GlassButton>
                      </div>
                    </GlassCard>
                  ) : filteredRecipes.length === 0 ? (
                    /* Stan pusty: brak wyników wyszukiwania / filtra */
                    <GlassCard variant="default" padding="lg" className="text-center">
                      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-4">
                        <Search className="size-10 text-stone-400" aria-hidden="true" />
                        <div className="space-y-1">
                          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-50">
                            Brak pasujących przepisów
                          </h2>
                          <p className="text-sm text-stone-600 dark:text-stone-300">
                            Żaden przepis nie pasuje do wybranych filtrów lub zapytania.
                          </p>
                        </div>
                        <GlassButton
                          variant="secondary"
                          size="md"
                          onClick={() => {
                            setSearchQuery('')
                            setSelectedFilter('Wszystkie')
                          }}
                        >
                          Pokaż wszystkie przepisy
                        </GlassButton>
                      </div>
                    </GlassCard>
                  ) : (
                    /* Siatka kart przepisów */
                    <section
                      aria-label="Lista przepisów"
                      className={
                        gridLayout === 'compact2'
                          ? 'grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3'
                          : 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3'
                      }
                    >
                      {filteredRecipes.map((recipe) => (
                        <RecipeCard
                          key={recipe.id}
                          recipe={recipe}
                          compact={gridLayout === 'compact2'}
                          onSelect={(item) => handleSelectRecipe(item.id)}
                          onToggleFavorite={toggleFavorite}
                        />
                      ))}
                    </section>
                  )}
                </main>
                </div>
              </>
            )}

            {/* Modal Smart Importer */}
            {isImportModalOpen && (
              <Suspense fallback={null}>
                <SmartImportModal
                  isOpen={isImportModalOpen}
                  onClose={() => {
                    setIsImportModalOpen(false)
                    setActiveShareImport(null)
                  }}
                  initialUrl={activeShareImport?.url ?? ''}
                  initialRawText={activeShareImport?.rawText ?? ''}
                  autoAnalyze={activeShareImport?.autoAnalyze ?? false}
                  onAutoAnalyzeConsumed={() =>
                    setActiveShareImport((prev) => (prev ? { ...prev, autoAnalyze: false } : prev))
                  }
                  onSaveRecipe={async (payload) => {
                    const created = await addRecipe(payload)
                    handleSelectRecipe(created.id)
                    return created
                  }}
                />
              </Suspense>
            )}

            {/* Modal Ustawień (Konto domownika, Wylogowanie i Skrót iOS) */}
            {isSettingsModalOpen && (
              <Suspense fallback={null}>
                <SettingsModal
                  isOpen={isSettingsModalOpen}
                  onClose={() => setIsSettingsModalOpen(false)}
                  userEmail={user.email}
                  isSigningOut={isSigningOut}
                  onSignOut={handleSignOut}
                />
              </Suspense>
            )}

            {/* Dolny pasek nawigacyjny w stylu iOS (3 zakładki) */}
            <BottomTabBar
              activeTab={activeTab}
              onSelectTab={(tab) => {
                if (tab === 'pizza') setHasVisitedPizza(true)
                if (tab === 'tinctures') setHasVisitedTinctures(true)
                setActiveTab(tab)
                if (tab !== 'recipes' || selectedRecipeId !== null) {
                  setSelectedRecipeId(null)
                  setRecipeHistory([])
                }
                if (typeof window !== 'undefined') {
                  window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
                }
              }}
              hidden={Boolean(cookingSession) || Boolean(selectedRecipeId) || isSigningOut}
            />
          </>
        )}
      </div>
    </MotionConfig>
  )
}

export default App
