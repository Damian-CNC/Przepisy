import { useMemo, useState } from 'react'
import {
  Calendar,
  Check,
  ChefHat,
  Flame,
  Minus,
  Pizza,
  Plus,
  RotateCcw,
} from 'lucide-react'
import { GlassButton, GlassCard, GlassPill, cn } from '../ui'
import type { RecipeInsert } from '../../lib/supabase'
import type { PizzaStyleId } from './pizzaPresets'
import { PIZZA_PRESETS } from './pizzaPresets'
import { calculatePizzaRecipe } from './pizzaMath'

export interface PizzaCalculatorViewProps {
  onSaveRecipe: (payload: RecipeInsert) => Promise<unknown>
  onNavigateToRecipes?: () => void
}

export function PizzaCalculatorView({
  onSaveRecipe,
  onNavigateToRecipes,
}: PizzaCalculatorViewProps) {
  const [selectedStyle, setSelectedStyle] = useState<PizzaStyleId>('napoletana')
  const preset = PIZZA_PRESETS[selectedStyle]

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

  // Reset do domyślnych dla aktualnego stylu
  const handleResetCurrent = () => {
    setBalls(preset.defaultBalls)
    setBallWeight(preset.defaultBallWeight)
    setHydration(preset.defaultHydration)
    setSaltPerKg(preset.defaultSaltPerKg)
    setOilPerKg(preset.defaultOilPerKg)
    setTotalHours(preset.defaultTotalHours)
    setFridgeHours(preset.defaultFridgeHours)
    setRoomTemp(preset.defaultRoomTemp)
    setSaveSuccess(false)
  }

  // Obliczenia na żywo (Baker's Math)
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
      const recipeDescription = `Wyliczone proporcje ciasta na ${preset.name} wg KMP: łączna masa ${results.totalDoughWeight}g, hydratacja ${hydration}%, fermentacja ${totalHours}h (${results.fridgeHours}h lodówka + ${results.roomHours}h temp. pokojowa ${roomTemp}°C).`

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
          instruction: `W misce lub dzieży rozpuść ${activeYeastAmount}g drożdży w około 90% przygotowanej chłodnej wody (${Math.round(results.waterGrams * 0.9)} ml). Stopniowo wsypuj mąkę (${results.flourGrams}g), mieszając łyżką lub hakem robota kuchennego.`,
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
                tip: 'Zimna fermentacja rozwija głęboki, orzechowy aromat i sprawia, że pizza jest lekkostrawna.',
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
        category: 'Obiad',
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
      {/* Nagłówek kalkulatora */}
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
            Precyzyjne proporcje ciasta wg Baker's Percentages &amp; Klubu Miłośników Pizzy
          </p>
        </div>

        <GlassButton
          type="button"
          variant="ghost"
          size="sm"
          leftIcon={<RotateCcw className="size-3.5" />}
          onClick={handleResetCurrent}
          className="self-start sm:self-auto"
        >
          Resetuj styl
        </GlassButton>
      </div>

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

      {/* 2. Główne karty parametrów */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Karta A: Ilość i wielkość porcji */}
        <GlassCard variant="default" padding="md" className="space-y-4">
          <div className="flex items-center justify-between border-b border-stone-200/50 dark:border-white/10 pb-2.5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 flex items-center gap-2">
              <span>Porcje i kulki</span>
            </h2>
            <GlassPill variant="tag" size="sm">
              Łącznie: {results.totalDoughWeight}g
            </GlassPill>
          </div>

          {/* Liczba kulek */}
          <div className="flex items-center justify-between gap-3">
            <div>
              <label htmlFor="pizza-balls-input" className="text-sm font-semibold text-stone-900 dark:text-stone-50 block">
                {selectedStyle === 'teglia' ? 'Liczba blach' : 'Liczba kulek (pizz)'}
              </label>
              <p className="text-xs text-stone-500">Ilość porcji do przygotowania</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setBalls((prev) => Math.max(1, prev - 1))}
                aria-label="Odejmij 1 kulkę"
                className="size-9 rounded-xl border border-stone-300 dark:border-stone-700 bg-white/70 dark:bg-stone-800 flex items-center justify-center text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 active:scale-95 cursor-pointer"
              >
                <Minus className="size-4" />
              </button>
              <input
                id="pizza-balls-input"
                type="number"
                min="1"
                max="50"
                value={balls}
                onChange={(e) => setBalls(Math.max(1, Number(e.target.value) || 1))}
                className="w-14 text-center font-bold text-base bg-stone-950/5 dark:bg-white/5 border border-stone-300/50 dark:border-white/10 rounded-xl py-1 text-stone-900 dark:text-stone-50"
              />
              <button
                type="button"
                onClick={() => setBalls((prev) => prev + 1)}
                aria-label="Dodaj 1 kulkę"
                className="size-9 rounded-xl border border-stone-300 dark:border-stone-700 bg-white/70 dark:bg-stone-800 flex items-center justify-center text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 active:scale-95 cursor-pointer"
              >
                <Plus className="size-4" />
              </button>
            </div>
          </div>

          {/* Waga kulki */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <label htmlFor="pizza-ball-weight-input" className="text-sm font-semibold text-stone-900 dark:text-stone-50">
                Waga kulki / porcji
              </label>
              <span className="text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                {ballWeight} g
              </span>
            </div>
            <input
              id="pizza-ball-weight-input"
              type="range"
              min="150"
              max={selectedStyle === 'teglia' ? '1200' : '380'}
              step="5"
              value={ballWeight}
              onChange={(e) => setBallWeight(Number(e.target.value))}
              className="w-full accent-amber-600 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] text-stone-600 dark:text-stone-400 font-mono">
              <span>{selectedStyle === 'teglia' ? '300g (mała blacha)' : '180g (cienka)'}</span>
              <span>{selectedStyle === 'teglia' ? '1200g (duża blacha)' : '350g (duża)'}</span>
            </div>
          </div>
        </GlassCard>

        {/* Karta B: Hydratacja, Sól i Tłuszcz */}
        <GlassCard variant="default" padding="md" className="space-y-4">
          <div className="flex items-center justify-between border-b border-stone-200/50 dark:border-white/10 pb-2.5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300">
              Parametry ciasta
            </h2>
            <span className="text-xs text-stone-500">Mąka = 100% bazy</span>
          </div>

          {/* Hydratacja */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="pizza-hydration-input" className="text-sm font-semibold text-stone-900 dark:text-stone-50">
                Hydratacja (woda / mąka)
              </label>
              <span className="text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                {hydration}%
              </span>
            </div>
            <input
              id="pizza-hydration-input"
              type="range"
              min="50"
              max="90"
              step="1"
              value={hydration}
              onChange={(e) => setHydration(Number(e.target.value))}
              className="w-full accent-amber-600 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] text-stone-600 dark:text-stone-400 font-mono">
              <span>55% (chrupiąca)</span>
              <span>65% (neapolitańska)</span>
              <span>80% (teglia)</span>
            </div>
          </div>

          {/* Sól i Oliwa */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="space-y-1">
              <label htmlFor="pizza-salt-input" className="text-xs font-semibold text-stone-700 dark:text-stone-300 block">
                Sól (g / kg mąki)
              </label>
              <input
                id="pizza-salt-input"
                type="number"
                min="0"
                max="50"
                value={saltPerKg}
                onChange={(e) => setSaltPerKg(Math.max(0, Number(e.target.value) || 0))}
                className="w-full text-center font-semibold bg-stone-950/5 dark:bg-white/5 border border-stone-300/50 dark:border-white/10 rounded-xl py-1 text-sm text-stone-900 dark:text-stone-50"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="pizza-oil-input" className="text-xs font-semibold text-stone-700 dark:text-stone-300 block">
                Oliwa (g / kg mąki)
              </label>
              <input
                id="pizza-oil-input"
                type="number"
                min="0"
                max="60"
                value={oilPerKg}
                onChange={(e) => setOilPerKg(Math.max(0, Number(e.target.value) || 0))}
                className="w-full text-center font-semibold bg-stone-950/5 dark:bg-white/5 border border-stone-300/50 dark:border-white/10 rounded-xl py-1 text-sm text-stone-900 dark:text-stone-50"
              />
            </div>
          </div>
        </GlassCard>

        {/* Karta C: Fermentacja i Drożdże */}
        <GlassCard variant="default" padding="md" className="space-y-4 md:col-span-2">
          <div className="flex items-center justify-between border-b border-stone-200/50 dark:border-white/10 pb-2.5">
            <div className="flex items-center gap-2">
              <Calendar className="size-4 text-amber-600" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300">
                Czas fermentacji i drożdże
              </h2>
            </div>
            <div className="flex items-center gap-1.5 bg-stone-200/70 dark:bg-stone-800 p-0.5 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setYeastType('fresh')}
                className={cn(
                  'px-2.5 py-1 rounded-lg transition-all cursor-pointer',
                  yeastType === 'fresh'
                    ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-50 shadow-sm'
                    : 'text-stone-600 dark:text-stone-400',
                )}
              >
                Świeże drożdże
              </button>
              <button
                type="button"
                onClick={() => setYeastType('dry')}
                className={cn(
                  'px-2.5 py-1 rounded-lg transition-all cursor-pointer',
                  yeastType === 'dry'
                    ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-50 shadow-sm'
                    : 'text-stone-600 dark:text-stone-400',
                )}
              >
                Suche (instant)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Czas całkowity */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs font-semibold text-stone-700 dark:text-stone-300">
                <label htmlFor="pizza-total-hours-input">Czas całkowity</label>
                <span className="font-bold text-amber-600">{totalHours} h</span>
              </div>
              <input
                id="pizza-total-hours-input"
                type="range"
                min="2"
                max="72"
                step="1"
                value={totalHours}
                onChange={(e) => {
                  const val = Number(e.target.value)
                  setTotalHours(val)
                  if (fridgeHours >= val) setFridgeHours(Math.max(0, val - 2))
                }}
                className="w-full accent-amber-600 cursor-pointer"
              />
              <p className="text-[11px] text-stone-600 dark:text-stone-400">Od zagniecenia do pieczenia</p>
            </div>

            {/* Czas w lodówce */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs font-semibold text-stone-700 dark:text-stone-300">
                <label htmlFor="pizza-fridge-hours-input">W tym w lodówce (~4°C)</label>
                <span className="font-bold text-sky-600">{fridgeHours} h</span>
              </div>
              <input
                id="pizza-fridge-hours-input"
                type="range"
                min="0"
                max={Math.max(0, totalHours - 1)}
                step="1"
                value={fridgeHours}
                onChange={(e) => setFridgeHours(Number(e.target.value))}
                className="w-full accent-sky-600 cursor-pointer"
              />
              <p className="text-[11px] text-stone-600 dark:text-stone-400">
                W temp. pokojowej: {results.roomHours} h
              </p>
            </div>

            {/* Temperatura otoczenia */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs font-semibold text-stone-700 dark:text-stone-300">
                <label htmlFor="pizza-room-temp-input">Temperatura pokojowa</label>
                <span className="font-bold text-rose-600">{roomTemp}°C</span>
              </div>
              <input
                id="pizza-room-temp-input"
                type="range"
                min="16"
                max="28"
                step="0.5"
                value={roomTemp}
                onChange={(e) => setRoomTemp(Number(e.target.value))}
                className="w-full accent-rose-600 cursor-pointer"
              />
              <p className="text-[11px] text-stone-600 dark:text-stone-400">Wpływa na tempo garowania</p>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* 3. WYNIKI WYMIAROWE (Karta podsumowania ciasta) */}
      <GlassCard
        variant="elevated"
        padding="lg"
        className="border-amber-500/40 shadow-xl bg-gradient-to-br from-white/90 via-amber-500/5 to-white/70 dark:from-stone-900/90 dark:via-amber-500/10 dark:to-stone-900/70"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-stone-200/60 dark:border-white/10 pb-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Wynik obliczeń dla {balls} {balls === 1 ? 'porcji' : 'porcji'} ({results.totalDoughWeight}g ciasta)
            </span>
            <h3 className="text-lg font-bold text-stone-900 dark:text-stone-50 mt-0.5">
              Składniki gotowe do odmierzenia
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <GlassButton
              type="button"
              variant="primary"
              size="md"
              isLoading={isSaving}
              leftIcon={<ChefHat className="size-4" />}
              onClick={() => void handleSaveToRecipes()}
            >
              {saveSuccess ? 'Zapisano przepis!' : 'Zapisz przepis do bazy'}
            </GlassButton>
          </div>
        </div>

        {saveSuccess && (
          <div className="mt-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 p-3 text-sm text-emerald-900 dark:text-emerald-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Check className="size-4.5 text-emerald-600" />
              <span>Przepis został pomyślnie dodany do Twojej bazy przepisów!</span>
            </div>
            {onNavigateToRecipes && (
              <button
                type="button"
                onClick={onNavigateToRecipes}
                className="text-xs font-bold underline hover:no-underline cursor-pointer"
              >
                Zobacz w przepisach &rarr;
              </button>
            )}
          </div>
        )}

        {/* Siatka gramatury składników */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5">
          {/* Mąka */}
          <div className="flex flex-col p-3 rounded-2xl bg-white/60 dark:bg-stone-800/60 border border-stone-200/50 dark:border-white/10">
            <span className="text-xs font-semibold text-stone-500 dark:text-stone-400">🌾 Mąka (100%)</span>
            <span className="text-2xl font-black text-stone-900 dark:text-stone-50 mt-1 tabular-nums">
              {results.flourGrams}
            </span>
            <span className="text-[11px] text-stone-500">gramów (typ 00)</span>
          </div>

          {/* Woda */}
          <div className="flex flex-col p-3 rounded-2xl bg-white/60 dark:bg-stone-800/60 border border-stone-200/50 dark:border-white/10">
            <span className="text-xs font-semibold text-sky-600 dark:text-sky-400">💧 Woda ({hydration}%)</span>
            <span className="text-2xl font-black text-sky-600 dark:text-sky-400 mt-1 tabular-nums">
              {results.waterGrams}
            </span>
            <span className="text-[11px] text-stone-500">ml / gramów</span>
          </div>

          {/* Drożdże */}
          <div className="flex flex-col p-3 rounded-2xl bg-white/60 dark:bg-stone-800/60 border border-stone-200/50 dark:border-white/10">
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
              🍞 {yeastType === 'fresh' ? 'Drożdże świeże' : 'Drożdże instant'}
            </span>
            <span className="text-2xl font-black text-amber-700 dark:text-amber-400 mt-1 tabular-nums">
              {yeastType === 'fresh' ? results.freshYeastGrams : results.dryYeastGrams}
            </span>
            <span className="text-[11px] text-stone-500">
              {yeastType === 'fresh' ? `(lub ${results.dryYeastGrams}g instant)` : `(lub ${results.freshYeastGrams}g świeżych)`}
            </span>
          </div>

          {/* Sól */}
          <div className="flex flex-col p-3 rounded-2xl bg-white/60 dark:bg-stone-800/60 border border-stone-200/50 dark:border-white/10">
            <span className="text-xs font-semibold text-stone-500 dark:text-stone-400">🧂 Sól</span>
            <span className="text-2xl font-black text-stone-900 dark:text-stone-50 mt-1 tabular-nums">
              {results.saltGrams}
            </span>
            <span className="text-[11px] text-stone-500">gramów ({saltPerKg}g/kg)</span>
          </div>

          {/* Oliwa */}
          <div className="flex flex-col p-3 rounded-2xl bg-white/60 dark:bg-stone-800/60 border border-stone-200/50 dark:border-white/10 col-span-2 sm:col-span-1">
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">🫒 Oliwa</span>
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
              {results.oilGrams}
            </span>
            <span className="text-[11px] text-stone-500">
              {results.oilGrams === 0 ? 'Bez oliwy w cieście' : 'gramów (EVOO)'}
            </span>
          </div>
        </div>

        {/* Wskazówka wypiekowa dla wybranego stylu */}
        <div className="mt-4 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 leading-relaxed flex items-start gap-2">
          <Flame className="size-4 shrink-0 text-amber-600 mt-0.5" />
          <div>
            <strong>Wypiek:</strong> {preset.bakingTempNote}. {preset.description}
          </div>
        </div>
      </GlassCard>
    </div>
  )
}
