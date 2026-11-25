import { useMemo, useState } from 'react'
import {
  Check,
  ChefHat,
  Flame,
  Minus,
  Pizza,
  Plus,
} from 'lucide-react'
import { GlassButton, GlassCard, cn } from '../ui'
import { RecipeCard } from '../recipes/RecipeCard'
import { RecipeGridToggle } from '../recipes/RecipeGridToggle'
import { useRecipeGridLayout } from '../../hooks/useRecipeGridLayout'
import { isPizzaRecipe } from '../recipes/recipeMeta'
import type { RecipeInsert, RecipeRow } from '../../lib/supabase'
import type { PizzaStyleId } from './pizzaPresets'
import { PIZZA_PRESETS } from './pizzaPresets'
import { calculatePizzaRecipe } from './pizzaMath'

export interface PizzaCalculatorViewProps {
  onSaveRecipe: (payload: RecipeInsert) => Promise<unknown>
  onNavigateToRecipes?: () => void
  recipes?: RecipeRow[]
  onSelectRecipe?: (id: string) => void
  onToggleFavorite?: (id: string) => void | Promise<unknown>
}

export function PizzaCalculatorView({
  onSaveRecipe,
  onNavigateToRecipes: _onNavigateToRecipes,
  recipes = [],
  onSelectRecipe,
  onToggleFavorite,
}: PizzaCalculatorViewProps) {
  const [subView, setSubView] = useState<'calculator' | 'recipes'>('calculator')
  const [gridLayout, setGridLayout] = useRecipeGridLayout()
  const [selectedStyle, setSelectedStyle] = useState<PizzaStyleId>('napoletana')
  const preset = PIZZA_PRESETS[selectedStyle]

  // Przepisy powiązane z pizzą
  const pizzaRecipes = useMemo(() => recipes.filter(isPizzaRecipe), [recipes])

  // Parametry wejściowe kalkulatora
  const [balls, setBalls] = useState(preset.defaultBalls)
  const [ballWeight, setBallWeight] = useState(preset.defaultBallWeight)
  const [hydration, setHydration] = useState(preset.defaultHydration)
  const [saltPerKg, setSaltPerKg] = useState(preset.defaultSaltPerKg)
  const [oilPerKg, setOilPerKg] = useState(preset.defaultOilPerKg)
  const [totalHours, setTotalHours] = useState(preset.defaultTotalHours)
  const [fridgeHours, setFridgeHours] = useState(preset.defaultFridgeHours)
  const [roomTemp, setRoomTemp] = useState(preset.defaultRoomTemp)
  const [yeastType, setYeastType] = useState<'fresh' | 'dry'>('fresh')

  // Stan zapisu przepisu
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Zmiana stylu pizzy – ładuje domyślne parametry stylu
  const handleSelectStyle = (id: PizzaStyleId) => {
    const nextPreset = PIZZA_PRESETS[id]
    setSelectedStyle(id)
    setBalls(nextPreset.defaultBalls)
    setBallWeight(nextPreset.defaultBallWeight)
    setHydration(nextPreset.defaultHydration)
    setSaltPerKg(nextPreset.defaultSaltPerKg)
    setOilPerKg(nextPreset.defaultOilPerKg)
    setTotalHours(nextPreset.defaultTotalHours)
    setFridgeHours(nextPreset.defaultFridgeHours)
    setRoomTemp(nextPreset.defaultRoomTemp)
    setSaveSuccess(false)
  }

  // Obliczenia na żywo (Baker's Math wg KMP)
  const results = useMemo(() => {
    return calculatePizzaRecipe({
      balls,
      ballWeight,
      hydration,
      saltPerKg,
      oilPerKg,
      totalHours,
      fridgeHours,
      roomTemp,
    })
  }, [balls, ballWeight, hydration, saltPerKg, oilPerKg, totalHours, fridgeHours, roomTemp])

  // Zapisanie wyliczonego przepisu do bazy Supabase
  const handleSaveToRecipes = async () => {
    setIsSaving(true)
    setSaveSuccess(false)

    try {
      const activeYeastAmount = yeastType === 'fresh' ? results.freshYeastGrams : results.dryYeastGrams
      const yeastLabel = yeastType === 'fresh' ? 'Drożdże świeże' : 'Drożdże instant (suche)'

      const recipeTitle = `${preset.name} (${balls} ${balls === 1 ? 'porcja' : balls < 5 ? 'kulki' : 'kulek'} × ${ballWeight}g)`
      const recipeDescription = `Wyliczone proporcje ciasta na ${preset.name}: łączna masa ${results.totalDoughWeight}g, hydratacja ${hydration}%, fermentacja ${totalHours}h (${results.fridgeHours}h lodówka + ${results.roomHours}h temp. pokojowa ${roomTemp}°C).`

      const ingredients = [
        { name: 'Mąka pszenna (najlepiej typ 00)', amount: results.flourGrams, unit: 'g', category: 'Suche' },
        { name: 'Woda (chłodna)', amount: results.waterGrams, unit: 'ml', category: 'Mokre' },
        { name: yeastLabel, amount: activeYeastAmount, unit: 'g', category: 'Drożdże' },
        { name: 'Sól drobna', amount: results.saltGrams, unit: 'g', category: 'Przyprawy' },
      ]

      if (results.oilGrams > 0) {
        ingredients.push({
          name: 'Oliwa z oliwek z pierwszego tłoczenia',
          amount: results.oilGrams,
          unit: 'g',
          category: 'Mokre',
        })
      }

      const steps = [
        {
          step_number: 1,
          instruction: `W misce lub dzieży rozpuść ${activeYeastAmount}g drożdży w około 90% przygotowanej chłodnej wody (${Math.round(results.waterGrams * 0.9)} ml). Stopniowo wsypuj mąkę (${results.flourGrams}g), mieszając łyżką lub hakiem robota kuchennego.`,
          step_ingredients: [
            { name: 'Mąka pszenna typ 00', amount: results.flourGrams, unit: 'g' },
            { name: 'Woda', amount: Math.round(results.waterGrams * 0.9), unit: 'ml' },
            { name: yeastLabel, amount: activeYeastAmount, unit: 'g' },
          ],
          timer_seconds: 300,
          tip: 'Woda powinna być chłodna (ok. 16–18°C), aby ciasto nie nagrzało się zbyt mocno przy wyrabianiu.',
        },
        {
          step_number: 2,
          instruction: `Gdy mąka wchłonie płyn, dodaj sól (${results.saltGrams}g) rozpuszczoną w reszcie wody (${Math.round(results.waterGrams * 0.1)} ml)${results.oilGrams > 0 ? ` oraz oliwę (${results.oilGrams}g)` : ''}. Wyrabiaj ciasto przez 10–12 minut do uzyskania gładkiej, sprężystej powierzchni (test okna).`,
          step_ingredients: [
            { name: 'Sól', amount: results.saltGrams, unit: 'g' },
            ...(results.oilGrams > 0 ? [{ name: 'Oliwa z oliwek', amount: results.oilGrams, unit: 'g' }] : []),
          ],
          timer_seconds: 600,
          tip: 'Sól dodajemy zawsze pod koniec, aby nie zaburzyć wczesnego rozwoju siatki glutenowej i drożdży.',
        },
        {
          step_number: 3,
          instruction: `Uformuj kulę, przykryj szczelnie miską i pozostaw na 30 minut odpoczynku (autoliza/relaksacja). Wykonaj 2–3 serie składań (slap and fold).`,
          step_ingredients: [],
          timer_seconds: 1800,
          tip: 'Składania znacząco wzmacniają strukturę glutenu bez konieczności długiego męczenia ciasta.',
        },
        ...(results.fridgeHours > 0
          ? [
              {
                step_number: 4,
                instruction: `Włóż ciasto w szczelnie zamkniętym pojemniku posmarowanym oliwą do lodówki (ok. 4°C) na ${results.fridgeHours} godzin zimnej fermentacji.`,
                step_ingredients: [],
                timer_seconds: results.fridgeHours * 3600,
                tip: 'Zimna fermentacja rozwija głęboki, aromatyczny profil i sprawia, że pizza jest wyjątkowo lekkostrawna.',
              },
              {
                step_number: 5,
                instruction: `Wyjmij ciasto z lodówki na ${results.roomHours} godzin przed planowanym pieczeniem. Podziel na ${balls} kulek po ${ballWeight}g, uformuj naprężone kulki i ułóż w pojemniku do garowania w temp. pokojowej (${roomTemp}°C).`,
                step_ingredients: [],
                timer_seconds: results.roomHours * 3600,
                tip: 'Kulki muszą osiągnąć temperaturę pokojową i podwoić objętość – wtedy ciasto rozciąga się z łatwością bez kurczenia.',
              },
            ]
          : [
              {
                step_number: 4,
                instruction: `Podziel ciasto na ${balls} kulek po ${ballWeight}g, uformuj naprężone kule i ułóż w zamkniętym pojemniku w temperaturze pokojowej (${roomTemp}°C) na ${results.roomHours} godzin garowania.`,
                step_ingredients: [],
                timer_seconds: results.roomHours * 3600,
                tip: 'Kulki powinny podwoić objętość i być miękkie jak poduszeczka.',
              },
            ]),
        {
          step_number: results.fridgeHours > 0 ? 6 : 5,
          instruction: `Rozciągaj kulki wyłącznie dłońmi (nigdy wałkiem!), wypychając powietrze z wnętrza do brzegów (cornicione). Nałóż sos pomidorowy, ulubione dodatki i piecz: ${preset.bakingTempNote}.`,
          step_ingredients: [],
          timer_seconds: selectedStyle === 'napoletana' ? 90 : 360,
          tip: 'Piec lub piekarnik z kamieniem/stalą powinien być nagrzewany na maksymalnej temperaturze przez minimum 45–60 minut.',
        },
      ]

      const payload: RecipeInsert = {
        title: recipeTitle,
        description: recipeDescription,
        category: 'Pizza',
        tags: ['Pizza', preset.shortName, `${hydration}% hydratacja`, `${totalHours}h`],
        servings: balls,
        prep_time_minutes: 25,
        cook_time_minutes: selectedStyle === 'napoletana' ? 2 : 10,
        ingredients,
        steps,
        source_platform: 'manual',
      }

      await onSaveRecipe(payload)
      setSaveSuccess(true)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto px-4 py-4 sm:px-6">
      {/* Nagłówek widoku */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-9 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
              <Pizza className="size-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-stone-900 dark:text-stone-50">
              Kalkulator Pizzy
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400">
            Precyzyjne proporcje ciasta i fermentacji na domową pizzę
          </p>
        </div>
      </div>

      {/* 2 Opcje u góry: 1. Kalkulator, 2. Przepisy */}
      <div className="flex items-center justify-center p-1 rounded-2xl bg-stone-900/5 dark:bg-white/10 backdrop-blur-xl border border-stone-900/10 dark:border-white/15 max-w-xs mx-auto w-full shadow-sm">
        <button
          type="button"
          onClick={() => setSubView('calculator')}
          className={cn(
            'relative flex-1 py-1.5 px-3 text-xs sm:text-sm font-semibold rounded-xl transition-all duration-200 cursor-pointer text-center',
            subView === 'calculator'
              ? 'bg-amber-500 text-white shadow-sm dark:bg-amber-500 dark:text-stone-950 font-bold'
              : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200',
          )}
        >
          Kalkulator
        </button>
        <button
          type="button"
          onClick={() => setSubView('recipes')}
          className={cn(
            'relative flex-1 py-1.5 px-3 text-xs sm:text-sm font-semibold rounded-xl transition-all duration-200 cursor-pointer text-center',
            subView === 'recipes'
              ? 'bg-amber-500 text-white shadow-sm dark:bg-amber-500 dark:text-stone-950 font-bold'
              : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200',
          )}
        >
          Przepisy {pizzaRecipes.length > 0 && `(${pizzaRecipes.length})`}
        </button>
      </div>

      {/* WIDOK: ZAPISANE PRZEPISY PIZZY */}
      {subView === 'recipes' ? (
        <div>
          {pizzaRecipes.length === 0 ? (
            <GlassCard variant="elevated" padding="lg" className="text-center py-12">
              <div className="flex flex-col items-center gap-3 max-w-sm mx-auto">
                <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
                  <Pizza className="size-7" />
                </div>
                <h3 className="text-base sm:text-lg font-bold text-stone-900 dark:text-stone-50">
                  Brak zapisanych przepisów na pizzę
                </h3>
                <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-300">
                  Wylicz idealne proporcje ciasta w kalkulatorze i kliknij „Zapisz przepis”, a pojawi się na tej liście.
                </p>
                <GlassButton
                  type="button"
                  variant="primary"
                  size="md"
                  leftIcon={<Pizza className="size-4" />}
                  onClick={() => setSubView('calculator')}
                  className="mt-2"
                >
                  Przejdź do kalkulatora
                </GlassButton>
              </div>
            </GlassCard>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-end">
                <RecipeGridToggle layout={gridLayout} onChange={setGridLayout} />
              </div>
              <section
                aria-label="Zapisane przepisy na pizzę"
                className={
                  gridLayout === 'compact2'
                    ? 'grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3'
                    : 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3'
                }
              >
                {pizzaRecipes.map((item) => (
                  <RecipeCard
                    key={item.id}
                    recipe={item}
                    compact={gridLayout === 'compact2'}
                    onSelect={(r) => onSelectRecipe?.(r.id)}
                    onToggleFavorite={onToggleFavorite ? (id) => void onToggleFavorite(id) : () => {}}
                  />
                ))}
              </section>
            </div>
          )}
        </div>
      ) : (
        /* WIDOK: KALKULATOR PIZZY */
        <>
          {/* 1. Kafelki wyboru stylu pizzy */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(Object.keys(PIZZA_PRESETS) as PizzaStyleId[]).map((id) => {
              const item = PIZZA_PRESETS[id]
              const isSelected = selectedStyle === id

              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleSelectStyle(id)}
                  className={cn(
                    'flex flex-col text-left p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer',
                    isSelected
                      ? 'border-amber-500/60 bg-amber-500/10 shadow-lg shadow-amber-500/10 dark:border-amber-400/50 dark:bg-amber-500/15'
                      : 'border-stone-900/10 bg-white/40 hover:bg-white/70 dark:border-white/10 dark:bg-stone-900/40 dark:hover:bg-stone-900/70',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-stone-900 dark:text-stone-50">
                      {item.shortName}
                    </span>
                    {isSelected && (
                      <span className="flex size-5 items-center justify-center rounded-full bg-amber-600 text-white dark:bg-amber-500 dark:text-stone-950">
                        <Check className="size-3 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-300 font-medium mt-0.5">
                    {item.subtitle}
                  </p>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1.5 leading-snug line-clamp-2">
                    {item.description}
                  </p>
                </button>
              )
            })}
          </div>

          {/* 2. Karty wprowadzania parametrów */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Karta A: Kulki i waga */}
            <GlassCard variant="default" padding="md" className="space-y-4">
              <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                <span>🍕</span> Ilość i wielkość
              </h2>

              {/* Liczba kulek */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
                  <label htmlFor="pizza-balls" className="text-stone-600 dark:text-stone-300">Liczba porcji (kulek)</label>
                  <span className="font-bold text-amber-700 dark:text-amber-300 tabular-nums">
                    {balls} {balls === 1 ? 'kulka' : balls < 5 ? 'kulki' : 'kulek'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <GlassButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    aria-label="Odejmij kulkę"
                    disabled={balls <= 1}
                    onClick={() => setBalls((prev) => Math.max(1, prev - 1))}
                    className="size-9 px-0 shrink-0"
                  >
                    <Minus className="size-3.5" />
                  </GlassButton>
                  <input
                    id="pizza-balls"
                    type="range"
                    min={1}
                    max={20}
                    step={1}
                    value={balls}
                    onChange={(e) => setBalls(Number(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                  <GlassButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    aria-label="Dodaj kulkę"
                    onClick={() => setBalls((prev) => Math.min(20, prev + 1))}
                    className="size-9 px-0 shrink-0"
                  >
                    <Plus className="size-3.5" />
                  </GlassButton>
                </div>
              </div>

              {/* Waga kulki */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
                  <label htmlFor="pizza-ball-weight" className="text-stone-600 dark:text-stone-300">Waga jednej kulki</label>
                  <span className="font-bold text-amber-700 dark:text-amber-300 tabular-nums">
                    {ballWeight} g
                  </span>
                </div>
                <input
                  id="pizza-ball-weight"
                  type="range"
                  min={180}
                  max={450}
                  step={5}
                  value={ballWeight}
                  onChange={(e) => setBallWeight(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-stone-500">
                  <span>180g (lekka)</span>
                  <span>250g (standard)</span>
                  <span>450g (blacha)</span>
                </div>
              </div>

              {/* Podsumowanie łącznej masy */}
              <div className="pt-2 border-t border-stone-200/60 dark:border-white/10 flex justify-between items-center text-xs">
                <span className="text-stone-500">Łączna masa ciasta:</span>
                <span className="font-black text-stone-900 dark:text-stone-50 tabular-nums">
                  {results.totalDoughWeight} g
                </span>
              </div>
            </GlassCard>

            {/* Karta B: Receptura i składniki */}
            <GlassCard variant="default" padding="md" className="space-y-4">
              <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                <span>💧</span> Proporcje piekarskie
              </h2>

              {/* Hydratacja % */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
                  <label htmlFor="pizza-hydration" className="text-stone-600 dark:text-stone-300">Hydratacja wody</label>
                  <span className="font-bold text-sky-700 dark:text-sky-300 tabular-nums">
                    {hydration}%
                  </span>
                </div>
                <input
                  id="pizza-hydration"
                  type="range"
                  min={50}
                  max={85}
                  step={1}
                  value={hydration}
                  onChange={(e) => setHydration(Number(e.target.value))}
                  className="w-full accent-sky-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-stone-500">
                  <span>50% (sztywna)</span>
                  <span>65% (klasyk)</span>
                  <span>85% (wysoka)</span>
                </div>
              </div>

              {/* Sól g/kg */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
                  <label htmlFor="pizza-salt" className="text-stone-600 dark:text-stone-300">Sól na 1kg mąki</label>
                  <span className="font-bold text-stone-700 dark:text-stone-300 tabular-nums">
                    {saltPerKg} g/kg
                  </span>
                </div>
                <input
                  id="pizza-salt"
                  type="range"
                  min={20}
                  max={35}
                  step={1}
                  value={saltPerKg}
                  onChange={(e) => setSaltPerKg(Number(e.target.value))}
                  className="w-full accent-stone-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-stone-500">
                  <span>20 g/kg</span>
                  <span>28 g/kg</span>
                  <span>35 g/kg</span>
                </div>
              </div>

              {/* Oliwa g/kg (ukryta dla Napoletany) */}
              {selectedStyle !== 'napoletana' && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium">
                    <label htmlFor="pizza-oil" className="text-stone-600 dark:text-stone-300">Oliwa na 1kg mąki</label>
                    <span className="font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                      {oilPerKg} g/kg
                    </span>
                  </div>
                  <input
                    id="pizza-oil"
                    type="range"
                    min={0}
                    max={40}
                    step={2}
                    value={oilPerKg}
                    onChange={(e) => setOilPerKg(Number(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-stone-500">
                    <span>0g (bez oliwy)</span>
                    <span>20g (Rzymska)</span>
                    <span>40g (Teglia)</span>
                  </div>
                </div>
              )}
            </GlassCard>

            {/* Karta C: Fermentacja i Drożdże */}
            <GlassCard variant="default" padding="md" className="space-y-4">
              <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                <span>⏱️</span> Czas i temperatura
              </h2>

              {/* Czas całkowity */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
                  <label htmlFor="pizza-total-hours" className="text-stone-600 dark:text-stone-300">Czas całkowity dojrzewania</label>
                  <span className="font-bold text-amber-700 dark:text-amber-300 tabular-nums">
                    {totalHours} godz.
                  </span>
                </div>
                <input
                  id="pizza-total-hours"
                  type="range"
                  min={2}
                  max={72}
                  step={1}
                  value={totalHours}
                  onChange={(e) => {
                    const nextTotal = Number(e.target.value)
                    setTotalHours(nextTotal)
                    if (fridgeHours >= nextTotal) {
                      setFridgeHours(Math.max(0, nextTotal - 2))
                    }
                  }}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              {/* Czas w lodówce */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
                  <label htmlFor="pizza-fridge-hours" className="text-stone-600 dark:text-stone-300">W tym czas w lodówce (~4°C)</label>
                  <span className="font-bold text-indigo-700 dark:text-indigo-300 tabular-nums">
                    {fridgeHours} godz.
                  </span>
                </div>
                <input
                  id="pizza-fridge-hours"
                  type="range"
                  min={0}
                  max={Math.max(0, totalHours - 1)}
                  step={1}
                  value={fridgeHours}
                  onChange={(e) => setFridgeHours(Number(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-stone-500">
                  <span>Pokojowa: {results.roomHours}h</span>
                  <span>Lodówka: {results.fridgeHours}h</span>
                </div>
              </div>

              {/* Temperatura otoczenia */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
                  <label htmlFor="pizza-room-temp" className="text-stone-600 dark:text-stone-300">Temperatura otoczenia</label>
                  <span className="font-bold text-rose-700 dark:text-rose-300 tabular-nums">
                    {roomTemp}°C
                  </span>
                </div>
                <input
                  id="pizza-room-temp"
                  type="range"
                  min={18}
                  max={30}
                  step={1}
                  value={roomTemp}
                  onChange={(e) => setRoomTemp(Number(e.target.value))}
                  className="w-full accent-rose-500 cursor-pointer"
                />
              </div>

              {/* Wybór rodzaju drożdży */}
              <div className="pt-2 border-t border-stone-200/60 dark:border-white/10 flex items-center justify-between text-xs">
                <span className="text-stone-600 dark:text-stone-400 font-medium">Rodzaj drożdży:</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setYeastType('fresh')}
                    className={cn(
                      'px-2 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer',
                      yeastType === 'fresh'
                        ? 'bg-amber-500 text-white shadow-sm dark:bg-amber-500 dark:text-stone-950'
                        : 'bg-stone-200/60 dark:bg-stone-800 text-stone-700 dark:text-stone-300',
                    )}
                  >
                    Świeże
                  </button>
                  <button
                    type="button"
                    onClick={() => setYeastType('dry')}
                    className={cn(
                      'px-2 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer',
                      yeastType === 'dry'
                        ? 'bg-amber-500 text-white shadow-sm dark:bg-amber-500 dark:text-stone-950'
                        : 'bg-stone-200/60 dark:bg-stone-800 text-stone-700 dark:text-stone-300',
                    )}
                  >
                    Suche (instant)
                  </button>
                </div>
              </div>
            </GlassCard>
          </div>

          {/* 3. Panel wyników – dokładne składniki do zważenia */}
          <GlassCard variant="elevated" padding="lg" className="border-amber-500/30">
            <div className="pb-4 border-b border-stone-200/60 dark:border-white/10">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                Wynik obliczeń dla {balls} {balls === 1 ? 'porcji' : 'porcji'} ({results.totalDoughWeight}g ciasta)
              </span>
              <h3 className="text-lg font-bold text-stone-900 dark:text-stone-50 mt-0.5">
                Składniki gotowe do odmierzenia
              </h3>
            </div>

            <div
              className={cn(
                'mt-5 grid grid-cols-2 gap-3',
                selectedStyle === 'napoletana' ? 'sm:grid-cols-4' : 'sm:grid-cols-5',
              )}
            >
              {/* Mąka */}
              <div className="flex flex-col p-3 rounded-2xl bg-white/60 dark:bg-stone-800/60 border border-stone-200/50 dark:border-white/10">
                <span className="text-xs font-semibold text-stone-500 dark:text-stone-400">🌾 Mąka (100%)</span>
                <span className="text-2xl font-black text-stone-900 dark:text-stone-50 mt-1 tabular-nums">
                  {results.flourGrams} g
                </span>
                <span className="text-[11px] text-stone-500">najlepiej typ 00</span>
              </div>

              {/* Woda */}
              <div className="flex flex-col p-3 rounded-2xl bg-white/60 dark:bg-stone-800/60 border border-stone-200/50 dark:border-white/10">
                <span className="text-xs font-semibold text-sky-600 dark:text-sky-400">💧 Woda ({hydration}%)</span>
                <span className="text-2xl font-black text-sky-600 dark:text-sky-400 mt-1 tabular-nums">
                  {results.waterGrams} ml
                </span>
                <span className="text-[11px] text-stone-500">ml / gramów</span>
              </div>

              {/* Drożdże */}
              <div className="flex flex-col p-3 rounded-2xl bg-white/60 dark:bg-stone-800/60 border border-stone-200/50 dark:border-white/10">
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  🍞 {yeastType === 'fresh' ? 'Drożdże świeże' : 'Drożdże instant'}
                </span>
                <span className="text-2xl font-black text-amber-700 dark:text-amber-400 mt-1 tabular-nums">
                  {yeastType === 'fresh' ? results.freshYeastGrams : results.dryYeastGrams} g
                </span>
                <span className="text-[11px] text-stone-500">
                  {yeastType === 'fresh'
                    ? `(lub ${results.dryYeastGrams}g instant)`
                    : `(lub ${results.freshYeastGrams}g świeżych)`}
                </span>
              </div>

              {/* Sól */}
              <div className="flex flex-col p-3 rounded-2xl bg-white/60 dark:bg-stone-800/60 border border-stone-200/50 dark:border-white/10">
                <span className="text-xs font-semibold text-stone-500 dark:text-stone-400">🧂 Sól</span>
                <span className="text-2xl font-black text-stone-900 dark:text-stone-50 mt-1 tabular-nums">
                  {results.saltGrams} g
                </span>
                <span className="text-[11px] text-stone-500">({saltPerKg}g/kg mąki)</span>
              </div>

              {/* Oliwa (ukryta dla Napoletany) */}
              {selectedStyle !== 'napoletana' && (
                <div className="flex flex-col p-3 rounded-2xl bg-white/60 dark:bg-stone-800/60 border border-stone-200/50 dark:border-white/10 col-span-2 sm:col-span-1">
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">🫒 Oliwa</span>
                  <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
                    {results.oilGrams} g
                  </span>
                  <span className="text-[11px] text-stone-500">
                    {results.oilGrams === 0 ? 'Bez oliwy w cieście' : 'gramów (EVOO)'}
                  </span>
                </div>
              )}
            </div>

            {/* Wskazówka wypiekowa dla wybranego stylu */}
            <div className="mt-4 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 leading-relaxed flex items-start gap-2">
              <Flame className="size-4 shrink-0 text-amber-600 mt-0.5" />
              <div>
                <strong>Wypiek:</strong> {preset.bakingTempNote}. {preset.description}
              </div>
            </div>

            {/* Przycisk zapisu przepisu pod składnikami */}
            <div className="mt-5 flex flex-col gap-3">
              <GlassButton
                type="button"
                variant="primary"
                size="md"
                fullWidth
                isLoading={isSaving}
                leftIcon={<ChefHat className="size-4" />}
                onClick={() => void handleSaveToRecipes()}
              >
                {saveSuccess ? 'Zapisano przepis!' : 'Dodaj przepis'}
              </GlassButton>

              {saveSuccess && (
                <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/30 p-3 text-sm text-emerald-900 dark:text-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Check className="size-4.5 text-emerald-600 shrink-0" />
                    <span>Przepis został pomyślnie zapisany w Twojej bazie przepisów!</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSubView('recipes')}
                    className="text-xs font-bold underline hover:no-underline cursor-pointer text-emerald-800 dark:text-emerald-300 self-start sm:self-auto"
                  >
                    Zobacz zapisane pizze &rarr;
                  </button>
                </div>
              )}
            </div>
          </GlassCard>
        </>
      )}
    </div>
  )
}
