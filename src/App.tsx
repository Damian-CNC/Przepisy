import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { MotionConfig } from 'framer-motion'
import {
  AlertCircle,
  ChefHat,
  Heart,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  X,
} from 'lucide-react'
import { AuthScreen } from './components/auth/AuthScreen'
import { RecipeCard } from './components/recipes/RecipeCard'
import { RecipeDetailView } from './components/recipes/RecipeDetailView'
import { RECIPE_CATEGORIES } from './components/recipes/recipeMeta'
import { SmartImportModal } from './components/recipes/SmartImportModal'
import { SettingsModal } from './components/settings/SettingsModal'
import {
  AmbientBackground,
  GlassButton,
  GlassCard,
  GlassPill,
  cn,
} from './components/ui'
import { useAuth } from './hooks/useAuth'
import { useRecipes } from './hooks/useRecipes'
import { checkAndApplyPwaUpdate } from './lib/pwaUpdate'
import {
  consumePendingSharePayload,
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
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [isManualRefreshing, setIsManualRefreshing] = useState(false)
  const [cookingSession, setCookingSession] = useState<CookingSessionState | null>(null)
  const [activeShareImport, setActiveShareImport] = useState<ActiveShareImportState | null>(null)
  const [pendingShareNotice, setPendingShareNotice] = useState<SharedImportPayload | null>(() => {
    if (typeof window === 'undefined') return null
    const fromUrl = parseShareTargetParams(window.location.search)
    if (fromUrl) {
      savePendingSharePayload(fromUrl)
      return fromUrl
    }
    return peekPendingSharePayload()
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const parsedShare = parseShareTargetParams(window.location.search)
    if (!parsedShare) return

    savePendingSharePayload(parsedShare)
    const cleanUrl = `${window.location.pathname}${window.location.hash}`
    window.history.replaceState({}, document.title, cleanUrl)
  }, [])

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

  const filteredRecipes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return recipes.filter((recipe) => {
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
      const inTags = (recipe.tags ?? []).some((tag) => tag.toLowerCase().includes(query))
      const inIngredients = recipe.ingredients.some((ing) =>
        ing.name.toLowerCase().includes(query),
      )

      return inTitle || inDescription || inCategory || inTags || inIngredients
    })
  }, [recipes, searchQuery, selectedFilter])

  const handleSignOut = async () => {
    if (isSigningOut) return
    setIsSigningOut(true)
    try {
      const ok = await signOut()
      if (ok) {
        setIsSettingsModalOpen(false)
        setCookingSession(null)
        setSelectedRecipeId(null)
        setSearchQuery('')
        setSelectedFilter('Wszystkie')
      }
    } finally {
      setIsSigningOut(false)
    }
  }

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
            <GlassCard variant="elevated" padding="lg" className="w-full text-center">
              <div className="flex flex-col items-center gap-4">
                <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
                  <ChefHat className="size-7 animate-pulse motion-reduce:animate-none" aria-hidden="true" />
                </div>
                <p className="text-base font-medium text-stone-700 dark:text-stone-200">
                  Otwieramy Waszą książkę kucharską...
                </p>
              </div>
            </GlassCard>
          </main>
        ) : !user ? (
          <AuthScreen
            authError={authError}
            pendingShare={pendingShareNotice}
            onSignInWithPassword={signInWithPassword}
            onSignInWithMagicLink={signInWithMagicLink}
            onClearError={clearAuthError}
          />
        ) : (
          <>
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
                  onExit={() => setCookingSession(null)}
                  onUpdateRecipe={updateRecipeItem}
                />
              </Suspense>
            ) : selectedRecipe ? (
              <RecipeDetailView
                key={selectedRecipe.id}
                recipe={selectedRecipe}
                onBack={() => setSelectedRecipeId(null)}
                onToggleFavorite={toggleFavorite}
                onUpdatePhoto={updatePhoto}
                onUpdateRecipe={updateRecipeItem}
                onRemoveRecipe={removeRecipe}
                onStartCooking={(recipe, targetServings) =>
                  setCookingSession({ recipe, targetServings })
                }
              />
            ) : (
              <div className="pb-10">
                <header className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] sm:gap-5 sm:px-6">
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
                            {recipes.length}{' '}
                            {recipes.length === 1
                              ? 'przepis'
                              : recipes.length >= 2 && recipes.length <= 4
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
                        leftIcon={<Sparkles className="size-4" aria-hidden="true" />}
                        onClick={() => setIsImportModalOpen(true)}
                        className="hidden sm:inline-flex"
                      >
                        Dodaj przepis AI
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

                  {/* Mobilny przycisk Dodaj przepis AI (jeden, bez duplikacji na dole) */}
                  <GlassButton
                    variant="primary"
                    size="md"
                    fullWidth
                    leftIcon={<Sparkles className="size-4" aria-hidden="true" />}
                    onClick={() => setIsImportModalOpen(true)}
                    className="sm:hidden"
                  >
                    Dodaj przepis AI
                  </GlassButton>

                  {/* Pływający pasek wyszukiwania w semantycznym elemencie <search> */}
                  <search>
                    <form
                      onSubmit={(e) => e.preventDefault()}
                      className={cn(
                        'flex items-center gap-2 rounded-3xl px-3 py-1.5',
                        'backdrop-blur-2xl backdrop-saturate-150',
                        'bg-white/70 dark:bg-zinc-900/65',
                        'border border-white/50 dark:border-white/15',
                        'shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.65),0_10px_32px_0_rgba(28,25,23,0.08)]',
                        'dark:shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.12),0_14px_38px_0_rgba(0,0,0,0.45)]',
                      )}
                    >
                      <label htmlFor="recipe-search" className="sr-only">
                        Szukaj przepisu po nazwie lub składniku
                      </label>
                      <Search
                        className="ml-1.5 size-5 shrink-0 text-stone-500 dark:text-stone-400"
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
                          'min-h-12 w-full bg-transparent text-base text-stone-900 placeholder:text-stone-500',
                          'dark:text-stone-50 dark:placeholder:text-stone-400',
                          'focus:outline-none',
                        )}
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          aria-label="Wyczyść wyszukiwanie"
                          onClick={() => setSearchQuery('')}
                          className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-stone-600 hover:bg-stone-900/5 dark:text-stone-300 dark:hover:bg-white/10"
                        >
                          <X className="size-4" aria-hidden="true" />
                        </button>
                      )}
                    </form>
                  </search>

                  {/* Pigułki filtrów kategorii */}
                  <div
                    role="group"
                    aria-label="Filtry kategorii przepisów"
                    className="flex w-full items-center gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible"
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

                  {/* Szkielety ładowania */}
                  {isRecipesLoading && recipes.length === 0 ? (
                    <section
                      aria-label="Ładowanie przepisów"
                      className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
                    >
                      {[0, 1, 2, 3].map((idx) => (
                        <GlassCard
                          key={idx}
                          variant="default"
                          padding="none"
                          className="magic-shimmer"
                        >
                          <div className="aspect-[4/3] w-full bg-stone-900/10 dark:bg-white/10" />
                          <div className="space-y-3 p-5">
                            <div className="h-5 w-3/4 rounded-full bg-stone-900/10 dark:bg-white/10" />
                            <div className="h-4 w-1/2 rounded-full bg-stone-900/10 dark:bg-white/10" />
                          </div>
                        </GlassCard>
                      ))}
                    </section>
                  ) : recipes.length === 0 ? (
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
                      className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
                    >
                      {filteredRecipes.map((recipe) => (
                        <RecipeCard
                          key={recipe.id}
                          recipe={recipe}
                          onSelect={(item) => setSelectedRecipeId(item.id)}
                          onToggleFavorite={toggleFavorite}
                        />
                      ))}
                    </section>
                  )}
                </main>
              </div>
            )}

            {/* Modal Smart Importer */}
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
                setSelectedRecipeId(created.id)
                return created
              }}
            />

            {/* Modal Ustawień (Konto domownika, Wylogowanie i Skrót iOS) */}
            <SettingsModal
              isOpen={isSettingsModalOpen}
              onClose={() => setIsSettingsModalOpen(false)}
              userEmail={user.email}
              isSigningOut={isSigningOut}
              onSignOut={handleSignOut}
            />
          </>
        )}
      </div>
    </MotionConfig>
  )
}

export default App
