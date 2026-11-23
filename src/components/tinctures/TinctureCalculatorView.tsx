import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChefHat,
  Minus,
  Plus,
  Sliders,
  Wine,
} from 'lucide-react'
import { GlassButton, GlassCard, GlassPill, cn } from '../ui'
import type { RecipeInsert } from '../../lib/supabase'
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
}

export function TinctureCalculatorView({
  onSaveRecipe,
  onNavigateToRecipes,
}: TinctureCalculatorViewProps) {
  // Wybór owocu
  const [selectedFruit, setSelectedFruit] = useState<TinctureFruitId>('malina')
  const preset = TINCTURE_PRESETS[selectedFruit]

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
        category: 'Napój',
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-9 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-700 dark:text-rose-300">
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

        <GlassButton
          type="button"
          variant="secondary"
          size="sm"
          leftIcon={<Sliders className="size-3.5" />}
          onClick={() => setIsSettingsModalOpen(true)}
          className="self-start sm:self-auto"
        >
          Ustawienia cukru
        </GlassButton>
      </div>

      {/* 1. Kafelki wyboru nalewki */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {(Object.keys(TINCTURE_PRESETS) as TinctureFruitId[]).map((id) => {
          const item = TINCTURE_PRESETS[id]
          const isSelected = selectedFruit === id

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
              <div className="flex items-center justify-between gap-1">
                <span className="text-sm font-bold text-stone-900 dark:text-stone-50">
                  {item.shortName}
                </span>
                {isSelected && (
                  <span className="flex size-4.5 items-center justify-center rounded-full bg-rose-600 text-white dark:bg-rose-500 dark:text-stone-950">
                    <Check className="size-2.5 stroke-[3]" />
                  </span>
                )}
              </div>
              <p className="text-[11px] text-rose-700 dark:text-rose-300 font-medium mt-0.5">
                {sugarProfiles[id] ?? item.defaultSugarGramsPerKg}g cukru / kg
              </p>
            </button>
          )
        })}
      </div>

      {/* 2. Główne karty parametrów */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Karta A: Owoce i moc nalewki */}
        <GlassCard variant="default" padding="md" className="space-y-4">
          <div className="flex items-center justify-between border-b border-stone-200/50 dark:border-white/10 pb-2.5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300">
              Owoce i moc nalewki
            </h2>
            <GlassPill variant="tag" size="sm">
              Cukier: {currentSugarPerKg} g/kg
            </GlassPill>
          </div>

          {/* Waga owoców */}
          <div className="flex items-center justify-between gap-3">
            <div>
              <label htmlFor="tincture-fruit-weight-input" className="text-sm font-semibold text-stone-900 dark:text-stone-50 block">
                Waga owoców
              </label>
              <p className="text-xs text-stone-500">Ilość świeżych owoców</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setFruitKg((prev) => Math.max(0.1, Math.round((prev - 0.1) * 10) / 10))}
                aria-label="Odejmij 0.1 kg"
                className="size-9 rounded-xl border border-stone-300 dark:border-stone-700 bg-white/70 dark:bg-stone-800 flex items-center justify-center text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 active:scale-95 cursor-pointer"
              >
                <Minus className="size-4" />
              </button>
              <div className="flex items-center gap-1 bg-stone-950/5 dark:bg-white/5 border border-stone-300/50 dark:border-white/10 rounded-xl px-2.5 py-1">
                <input
                  id="tincture-fruit-weight-input"
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="50"
                  value={fruitKg}
                  onChange={(e) => setFruitKg(Math.max(0.1, Number(e.target.value) || 0.1))}
                  className="w-12 text-center font-bold text-base bg-transparent text-stone-900 dark:text-stone-50"
                />
                <span className="text-xs font-semibold text-stone-500">kg</span>
              </div>
              <button
                type="button"
                onClick={() => setFruitKg((prev) => Math.round((prev + 0.1) * 10) / 10)}
                aria-label="Dodaj 0.1 kg"
                className="size-9 rounded-xl border border-stone-300 dark:border-stone-700 bg-white/70 dark:bg-stone-800 flex items-center justify-center text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 active:scale-95 cursor-pointer"
              >
                <Plus className="size-4" />
              </button>
            </div>
          </div>

          {/* Docelowa moc nalewki */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <label htmlFor="tincture-target-abv-input" className="text-sm font-semibold text-stone-900 dark:text-stone-50">
                Docelowa moc gotowej nalewki
              </label>
              <span className="text-base font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                {targetAbv}% vol
              </span>
            </div>
            <input
              id="tincture-target-abv-input"
              type="range"
              min="20"
              max="50"
              step="1"
              value={targetAbv}
              onChange={(e) => setTargetAbv(Number(e.target.value))}
              className="w-full accent-rose-600 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] text-stone-600 dark:text-stone-400 font-mono">
              <span>25% (lekka)</span>
              <span>35% (tradycyjna)</span>
              <span>45% (mocna)</span>
            </div>
          </div>
        </GlassCard>

        {/* Karta B: Alkohol bazowy */}
        <GlassCard variant="default" padding="md" className="space-y-3.5">
          <div className="flex items-center justify-between border-b border-stone-200/50 dark:border-white/10 pb-2.5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300">
              Używany alkohol bazowy
            </h2>
            <span className="text-xs text-stone-500">Moc wyjściowa</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(Object.keys(TINCTURE_ALCOHOL_TYPES) as AlcoholTypeId[]).map((id) => {
              const alc = TINCTURE_ALCOHOL_TYPES[id]
              const isSelected = alcoholType === id

              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setAlcoholType(id)}
                  className={cn(
                    'p-2.5 rounded-xl border text-left transition-all cursor-pointer text-xs',
                    isSelected
                      ? 'border-rose-500/60 bg-rose-500/10 font-bold text-stone-900 dark:text-stone-50 shadow-sm'
                      : 'border-stone-200/70 dark:border-white/10 text-stone-600 dark:text-stone-400 hover:bg-stone-100/50 dark:hover:bg-stone-800/50',
                  )}
                >
                  <div className="font-semibold">{alc.name}</div>
                  <div className="text-[10px] text-stone-500 mt-0.5 line-clamp-1">{alc.note}</div>
                </button>
              )
            })}
          </div>

          {alcoholType === 'custom' && (
            <div className="space-y-1 pt-1">
              <div className="flex justify-between text-xs font-semibold">
                <label htmlFor="tincture-custom-abv-input">Moc własnego alkoholu</label>
                <span className="text-rose-600">{customAbv}%</span>
              </div>
              <input
                id="tincture-custom-abv-input"
                type="range"
                min="30"
                max="95"
                step="1"
                value={customAbv}
                onChange={(e) => setCustomAbv(Number(e.target.value))}
                className="w-full accent-rose-600 cursor-pointer"
              />
            </div>
          )}
        </GlassCard>
      </div>

      {/* Ostrzeżenie jeśli owoce mocno rozcieńczają */}
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-stone-200/60 dark:border-white/10 pb-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-400">
              Wyliczone proporcje dla {fruitKg} kg owoców &bull; Moc docelowa {results.actualFinalAbv}% vol
            </span>
            <h3 className="text-lg font-bold text-stone-900 dark:text-stone-50 mt-0.5">
              Składniki gotowe do nastawienia nalewki
            </h3>
          </div>

          <GlassButton
            type="button"
            variant="primary"
            size="md"
            isLoading={isSaving}
            leftIcon={<ChefHat className="size-4" />}
            onClick={() => void handleSaveToRecipes()}
          >
            {saveSuccess ? 'Zapisano nalewkę!' : 'Zapisz przepis do bazy'}
          </GlassButton>
        </div>

        {saveSuccess && (
          <div className="mt-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 p-3 text-sm text-emerald-900 dark:text-emerald-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Check className="size-4.5 text-emerald-600" />
              <span>Przepis na nalewkę został pomyślnie zapisany w Twojej książce przepisów!</span>
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

        {/* Siatka składników */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          {/* Alkohol */}
          <div className="flex flex-col p-3 rounded-2xl bg-white/60 dark:bg-stone-800/60 border border-stone-200/50 dark:border-white/10">
            <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">
              🍸 {results.spirit95Ml > 0 ? 'Alkohol (1:1)' : 'Alkohol bazowy'}
            </span>
            <span className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1 tabular-nums">
              {results.baseAlcoholMl}
            </span>
            <span className="text-[11px] text-stone-500">
              {results.spirit95Ml > 0
                ? `${results.spirit95Ml}ml spir. + ${results.vodka40Ml}ml wódki`
                : `ml ${results.baseAlcoholName}`}
            </span>
          </div>

          {/* Woda */}
          <div className="flex flex-col p-3 rounded-2xl bg-white/60 dark:bg-stone-800/60 border border-stone-200/50 dark:border-white/10">
            <span className="text-xs font-semibold text-sky-600 dark:text-sky-400">💧 Woda do dolania</span>
            <span className="text-2xl font-black text-sky-600 dark:text-sky-400 mt-1 tabular-nums">
              {results.waterMl}
            </span>
            <span className="text-[11px] text-stone-500">
              {results.waterMl === 0 ? 'Nie potrzeba dolewać' : 'ml (przegotowana)'}
            </span>
          </div>

          {/* Cukier */}
          <div className="flex flex-col p-3 rounded-2xl bg-white/60 dark:bg-stone-800/60 border border-stone-200/50 dark:border-white/10">
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">🍬 Cukier</span>
            <span className="text-2xl font-black text-amber-700 dark:text-amber-400 mt-1 tabular-nums">
              {results.sugarGrams}
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
    </div>
  )
}
