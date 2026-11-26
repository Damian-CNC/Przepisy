import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChefHat,
  Minus,
  Plus,
  Settings,
  Wine,
} from 'lucide-react'
import { GlassButton, GlassCard, cn } from '../ui'
import { RecipeCard } from '../recipes/RecipeCard'
import { RecipeGridToggle } from '../recipes/RecipeGridToggle'
import { useRecipeGridLayout } from '../../hooks/useRecipeGridLayout'
import { isTinctureRecipe } from '../recipes/recipeMeta'
import type { RecipeInsert, RecipeRow } from '../../lib/supabase'
import type { AlcoholTypeId, TinctureFruitId } from './tincturePresets'
import { TINCTURE_ALCOHOL_TYPES, TINCTURE_PRESETS } from './tincturePresets'
import { calculateTinctureRecipe } from './tinctureMath'
import {
  loadTinctureSugarProfiles,
  saveTinctureSugarProfiles,
  type TinctureSugarProfiles,
} from './tinctureStorage'
import { TinctureSettingsModal } from './TinctureSettingsModal'

export interface TinctureCalculatorViewProps {
  onSaveRecipe: (payload: RecipeInsert) => Promise<unknown>
  onNavigateToRecipes?: () => void
  recipes?: RecipeRow[]
  onSelectRecipe?: (id: string) => void
  onToggleFavorite?: (id: string) => void | Promise<unknown>
}

export function TinctureCalculatorView({
  onSaveRecipe,
  onNavigateToRecipes: _onNavigateToRecipes,
  recipes = [],
  onSelectRecipe,
  onToggleFavorite,
}: TinctureCalculatorViewProps) {
  const [subView, setSubView] = useState<'calculator' | 'recipes'>('calculator')
  const [gridLayout, setGridLayout] = useRecipeGridLayout()

  // Wybór owocu
  const [selectedFruit, setSelectedFruit] = useState<TinctureFruitId>('malina')
  const preset = TINCTURE_PRESETS[selectedFruit]

  // Przepisy powiązane z nalewkami
  const tinctureRecipes = useMemo(() => recipes.filter(isTinctureRecipe), [recipes])

  // Profile cukru załadowane z pamięci telefonu
  const [sugarProfiles, setSugarProfiles] = useState<TinctureSugarProfiles>(() =>
    loadTinctureSugarProfiles(),
  )
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)

  // Parametry wejściowe
  const [fruitKg, setFruitKg] = useState(1.0)
  const [targetAbv, setTargetAbv] = useState(preset.defaultTargetAbv)
  const [alcoholType, setAlcoholType] = useState<AlcoholTypeId>(preset.defaultAlcoholType)
  const [customAbv, setCustomAbv] = useState(60)

  // Stan zapisu przepisu
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Pobranie aktualnego cukru dla wybranego owocu z profili
  const currentSugarPerKg = sugarProfiles[selectedFruit] ?? preset.defaultSugarGramsPerKg

  // Zmiana wybranego owocu
  const handleSelectFruit = (id: TinctureFruitId) => {
    const nextPreset = TINCTURE_PRESETS[id]
    setSelectedFruit(id)
    setTargetAbv(nextPreset.defaultTargetAbv)
    setAlcoholType(nextPreset.defaultAlcoholType)
    setSaveSuccess(false)
  }

  // Obliczenia na żywo
  const results = useMemo(() => {
    return calculateTinctureRecipe({
      fruitKg,
      targetAbv,
      alcoholType,
      customAbv,
      sugarGramsPerKg: currentSugarPerKg,
      fruitJuiceYieldLitersPerKg: preset.defaultJuiceYieldLitersPerKg,
    })
  }, [fruitKg, targetAbv, alcoholType, customAbv, currentSugarPerKg, preset.defaultJuiceYieldLitersPerKg])

  // Zapis przepisu do bazy Supabase
  const handleSaveToRecipes = async () => {
    setIsSaving(true)
    setSaveSuccess(false)

    try {
      const recipeTitle = `${preset.name} domowa (${results.targetAbv}% vol, ${fruitKg} kg)`
      const recipeDescription = `Precyzyjnie wyliczona nalewka: ${fruitKg} kg owoców, moc docelowa ${results.targetAbv}% vol, cukier ${results.sugarGrams}g (${currentSugarPerKg}g/kg). Szacowana objętość gotowego trunku: ${Math.round(results.finalVolumeMl / 100) / 10} L (${results.finalBottlesHalfLiter} butelki 0.5L).`

      const ingredients = [
        { name: `${preset.name.replace(/ówka$/i, 'y')} (świeże owoce)`, amount: results.fruitGrams, unit: 'g', category: 'Owoce' },
      ]

      if (results.spirit95Ml > 0 && results.vodka40Ml > 0) {
        ingredients.push(
          { name: 'Spirytus rektyfikowany 95%', amount: results.spirit95Ml, unit: 'ml', category: 'Alkohol' },
          { name: 'Wódka czysta 40%', amount: results.vodka40Ml, unit: 'ml', category: 'Alkohol' },
        )
      } else {
        ingredients.push({
          name: results.baseAlcoholName,
          amount: results.baseAlcoholMl,
          unit: 'ml',
          category: 'Alkohol',
        })
      }

      ingredients.push({
        name: 'Cukier biały (lub trzcinowy)',
        amount: results.sugarGrams,
        unit: 'g',
        category: 'Słodzidła',
      })

      if (results.waterMl > 0) {
        ingredients.push({
          name: 'Woda przegotowana lub źródlana',
          amount: results.waterMl,
          unit: 'ml',
          category: 'Mokre',
        })
      }

      const steps = preset.instructions.map((instr, idx) => ({
        step_number: idx + 1,
        instruction: instr,
        step_ingredients: [],
        timer_seconds: idx === 1 ? 14 * 86400 : 0, // 2 tygodnie timera dla maceracji
        tip: idx === 0 ? `Użyj dokładnie ${results.baseAlcoholMl} ml alkoholu bazowego.` : undefined,
      }))

      const payload: RecipeInsert = {
        title: recipeTitle,
        description: recipeDescription,
        category: 'Nalewki',
        tags: ['Nalewka', preset.shortName, `${results.targetAbv}% vol`],
        servings: Math.max(1, Math.round(results.finalBottlesHalfLiter)),
        prep_time_minutes: 30,
        cook_time_minutes: 0,
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
      {/* Nagłówek kalkulatora nalewek */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-700 dark:text-rose-300">
              <Wine className="size-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-stone-900 dark:text-stone-50">
              Kalkulator Nalewek
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400">
            Obliczanie proporcji owoców, wody, alkoholu i cukru z uwzględnieniem soku i kontrakcji
          </p>
        </div>

        {subView === 'calculator' && (
          <GlassButton
            type="button"
            variant="secondary"
            size="md"
            aria-label="Ustawienia cukru"
            onClick={() => setIsSettingsModalOpen(true)}
            className="size-11 shrink-0 !gap-0 !px-0"
          >
            <Settings className="size-4.5" aria-hidden="true" />
          </GlassButton>
        )}
      </div>

      {/* 2 Opcje u góry: 1. Kalkulator, 2. Przepisy (Liquid Glass kapsuła z płynnym wskaźnikiem) */}
      <div className="liquid-glass relative grid grid-cols-2 items-center p-1 rounded-full max-w-xs mx-auto w-full">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] transition-transform duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform motion-reduce:transition-none"
          style={{ transform: `translate3d(${subView === 'recipes' ? '100%' : '0%'}, 0, 0)` }}
        >
          <div className="size-full rounded-full bg-rose-600 dark:bg-rose-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_2px_8px_rgba(225,29,72,0.3)]" />
        </div>
        <button
          type="button"
          onClick={() => setSubView('calculator')}
          className={cn(
            'relative z-10 py-1.5 px-3 text-xs sm:text-sm font-semibold rounded-full transition-colors duration-200 cursor-pointer text-center',
            subView === 'calculator'
              ? 'text-white dark:text-stone-950 font-bold'
              : 'text-stone-700 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100',
          )}
        >
          Kalkulator
        </button>
        <button
          type="button"
          onClick={() => setSubView('recipes')}
          className={cn(
            'relative z-10 py-1.5 px-3 text-xs sm:text-sm font-semibold rounded-full transition-colors duration-200 cursor-pointer text-center',
            subView === 'recipes'
              ? 'text-white dark:text-stone-950 font-bold'
              : 'text-stone-700 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100',
          )}
        >
          Przepisy {tinctureRecipes.length > 0 && `(${tinctureRecipes.length})`}
        </button>
      </div>

      {/* WIDOK: ZAPISANE PRZEPISY NALEWEK */}
      {subView === 'recipes' ? (
        <div>
          {tinctureRecipes.length === 0 ? (
            <GlassCard variant="elevated" padding="lg" className="text-center py-12">
              <div className="flex flex-col items-center gap-3 max-w-sm mx-auto">
                <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-700 dark:text-rose-300">
                  <Wine className="size-7" />
                </div>
                <h3 className="text-base sm:text-lg font-bold text-stone-900 dark:text-stone-50">
                  Brak zapisanych nalewek
                </h3>
                <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-300">
                  Wylicz precyzyjne proporcje w kalkulatorze i kliknij „Zapisz przepis”, a pojawi się na tej liście.
                </p>
                <GlassButton
                  type="button"
                  variant="primary"
                  size="md"
                  leftIcon={<Wine className="size-4" />}
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
                aria-label="Zapisane nalewki"
                className={
                  gridLayout === 'compact2'
                    ? 'grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3'
                    : 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3'
                }
              >
                {tinctureRecipes.map((item) => (
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
        /* WIDOK: KALKULATOR NALEWEK */
        <>
          {/* 1. Kafelki wyboru nalewki */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {(Object.keys(TINCTURE_PRESETS) as TinctureFruitId[]).map((id) => {
              const item = TINCTURE_PRESETS[id]
              const isSelected = selectedFruit === id
              const emoji = id === 'malina' ? '🍇' : id === 'cytryna' ? '🍋' : id === 'wisnia' ? '🍒' : '🍏'

              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleSelectFruit(id)}
                  className={cn(
                    'flex flex-col text-left p-3 rounded-2xl border transition-all duration-200 cursor-pointer',
                    isSelected
                      ? 'border-rose-500/60 bg-rose-500/10 shadow-lg shadow-rose-500/10 dark:border-rose-400/50 dark:bg-rose-500/15'
                      : 'border-stone-900/10 bg-white/40 hover:bg-white/70 dark:border-white/10 dark:bg-stone-900/40 dark:hover:bg-stone-900/70',
                  )}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-base">{emoji}</span>
                    {isSelected && (
                      <span className="flex size-4.5 items-center justify-center rounded-full bg-rose-600 text-white dark:bg-rose-500 dark:text-stone-950">
                        <Check className="size-3 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-bold text-stone-900 dark:text-stone-50 mt-1">
                    {item.name}
                  </span>
                  <span className="text-[11px] text-rose-700 dark:text-rose-300 font-medium mt-0.5">
                    {item.steepingWeeks} maceracji
                  </span>
                </button>
              )
            })}
          </div>

          {/* 2. Karty wprowadzania parametrów */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Karta A: Ilość owoców */}
            <GlassCard variant="default" padding="md" className="space-y-4">
              <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                <span>{selectedFruit === 'malina' ? '🍇' : selectedFruit === 'cytryna' ? '🍋' : selectedFruit === 'wisnia' ? '🍒' : '🍏'}</span> Masa owoców
              </h2>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
                  <label htmlFor="tincture-fruit-kg" className="text-stone-600 dark:text-stone-300">Waga owoców</label>
                  <span className="font-bold text-rose-700 dark:text-rose-300 tabular-nums">
                    {fruitKg.toFixed(2)} kg ({results.fruitGrams} g)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <GlassButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    aria-label="Odejmij 50 g"
                    disabled={fruitKg <= 0.1}
                    onClick={() => setFruitKg((prev) => Math.max(0.1, Math.round((prev - 0.05) * 100) / 100))}
                    className="size-9 px-0 shrink-0"
                  >
                    <Minus className="size-3.5" />
                  </GlassButton>
                  <input
                    id="tincture-fruit-kg"
                    type="range"
                    min={0.1}
                    max={3.0}
                    step={0.05}
                    value={fruitKg}
                    onChange={(e) => setFruitKg(Number(e.target.value))}
                    className="w-full accent-rose-500 cursor-pointer"
                  />
                  <GlassButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    aria-label="Dodaj 50 g"
                    disabled={fruitKg >= 3.0}
                    onClick={() => setFruitKg((prev) => Math.min(3.0, Math.round((prev + 0.05) * 100) / 100))}
                    className="size-9 px-0 shrink-0"
                  >
                    <Plus className="size-3.5" />
                  </GlassButton>
                </div>
                <div className="flex justify-between text-[10px] text-stone-500">
                  <span>100 g</span>
                  <span>1.5 kg</span>
                  <span>3 kg</span>
                </div>
              </div>

              {/* Szacunek soku */}
              <div className="pt-2 border-t border-stone-200/60 dark:border-white/10 flex justify-between items-center text-xs">
                <span className="text-stone-500">Szacowany sok z owoców:</span>
                <span className="font-semibold text-stone-800 dark:text-stone-200 tabular-nums">
                  {results.estimatedJuiceMl} ml
                </span>
              </div>
            </GlassCard>

            {/* Karta B: Alkohol bazowy */}
            <GlassCard variant="default" padding="md" className="space-y-4">
              <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                <span>🥃</span> Rodzaj alkoholu
              </h2>

              <div className="space-y-1.5">
                <label htmlFor="tincture-alcohol-type" className="text-xs font-medium text-stone-600 dark:text-stone-300">
                  Alkohol do zalania owoców
                </label>
                <select
                  id="tincture-alcohol-type"
                  value={alcoholType}
                  onChange={(e) => setAlcoholType(e.target.value as AlcoholTypeId)}
                  className="w-full rounded-xl border border-stone-300 dark:border-white/15 bg-white/70 dark:bg-stone-800/80 px-3 py-2 text-xs font-semibold text-stone-900 dark:text-stone-50 focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  {(Object.keys(TINCTURE_ALCOHOL_TYPES) as AlcoholTypeId[]).map((typeId) => (
                    <option key={typeId} value={typeId}>
                      {TINCTURE_ALCOHOL_TYPES[typeId].name} ({Math.round(TINCTURE_ALCOHOL_TYPES[typeId].abv * 100)}% vol)
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-stone-500">
                  {TINCTURE_ALCOHOL_TYPES[alcoholType].note}
                </p>
              </div>

              {alcoholType === 'custom' && (
                <div className="space-y-1.5 pt-2 border-t border-stone-200/60 dark:border-white/10">
                  <div className="flex justify-between text-xs font-medium">
                    <label htmlFor="tincture-custom-abv" className="text-stone-600 dark:text-stone-300">Własna moc alkoholu</label>
                    <span className="font-bold text-rose-700 dark:text-rose-300 tabular-nums">
                      {customAbv}% vol
                    </span>
                  </div>
                  <input
                    id="tincture-custom-abv"
                    type="range"
                    min={35}
                    max={96}
                    step={1}
                    value={customAbv}
                    onChange={(e) => setCustomAbv(Number(e.target.value))}
                    className="w-full accent-rose-500 cursor-pointer"
                  />
                </div>
              )}
            </GlassCard>

            {/* Karta C: Moc docelowa & Cukier */}
            <GlassCard variant="default" padding="md" className="space-y-4">
              <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                <span>🎯</span> Moc i słodycz
              </h2>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
                  <label htmlFor="tincture-target-abv" className="text-stone-600 dark:text-stone-300">Moc gotowej nalewki</label>
                  <span className="font-bold text-rose-700 dark:text-rose-300 tabular-nums">
                    {targetAbv}% vol
                  </span>
                </div>
                <input
                  id="tincture-target-abv"
                  type="range"
                  min={20}
                  max={60}
                  step={1}
                  value={targetAbv}
                  onChange={(e) => setTargetAbv(Number(e.target.value))}
                  className="w-full accent-rose-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-stone-500">
                  <span>20% (lekka)</span>
                  <span>40% (standard)</span>
                  <span>60% (mocna)</span>
                </div>
              </div>

              {/* Informacja o cukrze z ustawień */}
              <div className="pt-2 border-t border-stone-200/60 dark:border-white/10 flex items-center justify-between text-xs">
                <div>
                  <span className="text-stone-500">Cukier w profilu:</span>
                  <p className="font-bold text-stone-800 dark:text-stone-200">
                    {currentSugarPerKg} g / kg
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSettingsModalOpen(true)}
                  className="text-rose-700 dark:text-rose-300 text-xs font-semibold hover:underline cursor-pointer"
                >
                  Zmień &rarr;
                </button>
              </div>
            </GlassCard>
          </div>

          {/* Ostrzeżenie o zbyt niskim stężeniu */}
          {results.isDilutionWarning && results.warningMessage && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
              <AlertTriangle className="size-4.5 shrink-0 text-amber-600 mt-0.5" />
              <p className="leading-relaxed">{results.warningMessage}</p>
            </div>
          )}

          {/* 3. WYNIKI WYMIAROWE (Karta receptury) */}
          <GlassCard
            variant="elevated"
            padding="lg"
            className="border-rose-500/40 shadow-xl bg-gradient-to-br from-white/90 via-rose-500/5 to-white/70 dark:from-stone-900/90 dark:via-rose-500/10 dark:to-stone-900/70"
          >
            <div className="border-b border-stone-200/60 dark:border-white/10 pb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-400">
                Wyliczone proporcje dla {fruitKg} kg owoców &bull; Moc docelowa {results.actualFinalAbv}% vol
              </span>
              <h3 className="text-lg font-bold text-stone-900 dark:text-stone-50 mt-0.5">
                Składniki gotowe do nastawienia nalewki
              </h3>
            </div>

            {/* Siatka składników */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
              {/* Alkohol */}
              <div className="flex flex-col p-3 rounded-2xl bg-white/60 dark:bg-stone-800/60 border border-stone-200/50 dark:border-white/10">
                <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                  🍸 {results.spirit95Ml > 0 ? 'Alkohol (1:1)' : 'Alkohol bazowy'}
                </span>
                <span className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1 tabular-nums">
                  {results.baseAlcoholMl} ml
                </span>
                <span className="text-[11px] text-stone-500">
                  {results.spirit95Ml > 0
                    ? `${results.spirit95Ml}ml spirytusu + ${results.vodka40Ml}ml wódki`
                    : `${results.baseAlcoholName}`}
                </span>
              </div>

              {/* Woda */}
              <div className="flex flex-col p-3 rounded-2xl bg-white/60 dark:bg-stone-800/60 border border-stone-200/50 dark:border-white/10">
                <span className="text-xs font-semibold text-sky-600 dark:text-sky-400">💧 Woda do dolania</span>
                <span className="text-2xl font-black text-sky-600 dark:text-sky-400 mt-1 tabular-nums">
                  {results.waterMl} ml
                </span>
                <span className="text-[11px] text-stone-500">
                  {results.waterMl === 0 ? 'Nie potrzeba dolewać' : 'ml (przegotowana)'}
                </span>
              </div>

              {/* Cukier */}
              <div className="flex flex-col p-3 rounded-2xl bg-white/60 dark:bg-stone-800/60 border border-stone-200/50 dark:border-white/10">
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">🍬 Cukier</span>
                <span className="text-2xl font-black text-amber-700 dark:text-amber-400 mt-1 tabular-nums">
                  {results.sugarGrams} g
                </span>
                <span className="text-[11px] text-stone-500">
                  gramów ({currentSugarPerKg}g / kg owoców)
                </span>
              </div>

              {/* Objętość końcowa */}
              <div className="flex flex-col p-3 rounded-2xl bg-white/60 dark:bg-stone-800/60 border border-stone-200/50 dark:border-white/10">
                <span className="text-xs font-semibold text-stone-500 dark:text-stone-400">🍾 Objętość trunku</span>
                <span className="text-2xl font-black text-stone-900 dark:text-stone-50 mt-1 tabular-nums">
                  {Math.round(results.finalVolumeMl / 100) / 10} L
                </span>
                <span className="text-[11px] text-stone-500">
                  ok. {results.finalBottlesHalfLiter} butelki (0.5L)
                </span>
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
                {saveSuccess ? 'Zapisano nalewkę!' : 'Dodaj przepis'}
              </GlassButton>

              {saveSuccess && (
                <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/30 p-3 text-sm text-emerald-900 dark:text-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Check className="size-4.5 text-emerald-600 shrink-0" />
                    <span>Przepis na nalewkę został pomyślnie zapisany w Twojej bazie przepisów!</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSubView('recipes')}
                    className="text-xs font-bold underline hover:no-underline cursor-pointer text-emerald-800 dark:text-emerald-300 self-start sm:self-auto"
                  >
                    Zobacz zapisane nalewki &rarr;
                  </button>
                </div>
              )}
            </div>

            {/* Instrukcja krok po kroku */}
            <div className="mt-5 space-y-2 border-t border-stone-200/60 dark:border-white/10 pt-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300">
                Etapy przygotowania ({preset.steepingWeeks} maceracji)
              </h4>
              <ol className="space-y-1.5 text-xs text-stone-600 dark:text-stone-300 list-decimal list-inside leading-relaxed">
                {preset.instructions.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          </GlassCard>

          {/* Modal ustawień profili cukru */}
          <TinctureSettingsModal
            isOpen={isSettingsModalOpen}
            onClose={() => setIsSettingsModalOpen(false)}
            currentProfiles={sugarProfiles}
            onUpdateProfiles={(updated) => {
              setSugarProfiles(updated)
              saveTinctureSugarProfiles(updated)
            }}
          />
        </>
      )}
    </div>
  )
}
