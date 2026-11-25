import type { AlcoholTypeId } from './tincturePresets'

export interface TinctureCalculationInput {
  fruitKg: number
  targetAbv: number // % np. 35
  alcoholType: AlcoholTypeId
  customAbv?: number // np. 60
  sugarGramsPerKg: number // g na kg owoców
  alcoholRatioLitersPerKg?: number // domyślnie 1.0 L na 1 kg owoców
  fruitJuiceYieldLitersPerKg: number // np. 0.65 dla malin
}

export interface TinctureCalculationResult {
  fruitGrams: number
  targetAbv: number
  baseAlcoholName: string
  baseAlcoholAbv: number
  
  // Wymiary składników
  baseAlcoholMl: number
  spirit95Ml: number // jeśli to mix 1:1
  vodka40Ml: number  // jeśli to mix 1:1
  waterMl: number
  sugarGrams: number
  
  // Pochodne parametry
  estimatedJuiceMl: number
  sugarSyrupVolumeMl: number
  finalVolumeMl: number
  finalBottlesHalfLiter: number
  actualFinalAbv: number
  isDilutionWarning: boolean
  warningMessage?: string
}

/**
 * Oblicza proporcje nalewki z uwzględnieniem soku owocowego,
 * przyrostu objętości syropu cukrowego (1kg cukru ~ 0.625L)
 * oraz zjawiska kontrakcji objętościowej mieszanin wodno-alkoholowych.
 */
export function calculateTinctureRecipe(input: TinctureCalculationInput): TinctureCalculationResult {
  const safeFruitKg = Math.max(0.1, input.fruitKg)
  const safeTargetAbv = Math.max(15, Math.min(70, input.targetAbv))
  const targetRatio = safeTargetAbv / 100

  // Ustalenie stężenia alkoholu bazowego
  let baseAbv = 0.85
  let baseName = 'Spirytus 85%'
  if (input.alcoholType === 'spirit_95') {
    baseAbv = 0.95
    baseName = 'Spirytus 95%'
  } else if (input.alcoholType === 'vodka_40') {
    baseAbv = 0.40
    baseName = 'Wódka 40%'
  } else if (input.alcoholType === 'mix_67') {
    baseAbv = 0.675
    baseName = 'Spirytus 95% + Wódka 40% (1:1)'
  } else if (input.alcoholType === 'custom') {
    baseAbv = Math.max(0.20, Math.min(0.98, (input.customAbv ?? 60) / 100))
    baseName = `Własny alkohol (${Math.round(baseAbv * 100)}%)`
  }

  // 1. Sok z owoców
  const estimatedJuiceLiters = safeFruitKg * input.fruitJuiceYieldLitersPerKg
  const estimatedJuiceMl = Math.round(estimatedJuiceLiters * 1000)

  // 2. Cukier
  const safeSugarPerKg = Math.max(0, input.sugarGramsPerKg)
  const sugarGrams = Math.round(safeFruitKg * safeSugarPerKg)
  const sugarKg = sugarGrams / 1000

  // 1 kg cukru po rozpuszczeniu daje ok. 0.625 litra objętości płynu
  const sugarSyrupVolumeLiters = sugarKg * 0.625
  const sugarSyrupVolumeMl = Math.round(sugarSyrupVolumeLiters * 1000)

  // 3. Ilość alkoholu bazowego (standardowo 1 litr na 1 kg owoców do dobrej maceracji)
  const ratioLiters = input.alcoholRatioLitersPerKg ?? 1.0
  const baseAlcoholLiters = safeFruitKg * ratioLiters
  const baseAlcoholMl = Math.round(baseAlcoholLiters * 1000)

  // Czysty etanol w nastawie
  const pureEthanolLiters = baseAlcoholLiters * baseAbv

  // Objętość docelowa gotowej nalewki aby uzyskać pożądany % ABV
  const targetFinalVolumeLiters = pureEthanolLiters / targetRatio

  // Składniki już obecne w nalewce (bez dodatkowej wody)
  const nonWaterLiters = baseAlcoholLiters + estimatedJuiceLiters + sugarSyrupVolumeLiters

  // Zjawisko kontrakcji (ok. 2.5% skurczu objętości przy mieszaniu alkoholu z wodą)
  const contractionFactor = 0.975

  // Wymagana woda do dolania
  const rawWaterLiters = (targetFinalVolumeLiters / contractionFactor) - nonWaterLiters

  let waterMl = 0
  let isDilutionWarning = false
  let warningMessage: string | undefined

  if (rawWaterLiters > 0.01) {
    waterMl = Math.round(rawWaterLiters * 1000)
  } else if (rawWaterLiters < -0.05) {
    // Sok i cukier już same z siebie rozcieńczyły nalewkę poniżej docelowej mocy!
    isDilutionWarning = true
    const maxPossibleAbv = Math.round(
      (pureEthanolLiters / (nonWaterLiters * contractionFactor)) * 1000
    ) / 10
    warningMessage = `Sok z owoców i cukier naturalnie rozcieńczą ten alkohol do ok. ${maxPossibleAbv}%. Aby osiągnąć ${safeTargetAbv}%, użyj mocniejszego alkoholu (np. czystego spirytusu 95%) lub zwiększ jego ilość.`
  }

  // Rzeczywista końcowa objętość
  const finalVolumeLiters = (baseAlcoholLiters + estimatedJuiceLiters + sugarSyrupVolumeLiters + (waterMl / 1000)) * contractionFactor
  const finalVolumeMl = Math.round(finalVolumeLiters * 1000)
  const finalBottlesHalfLiter = Math.round((finalVolumeLiters / 0.5) * 10) / 10

  // Rzeczywista wyliczona moc końcowa
  const actualFinalAbv = Math.round((pureEthanolLiters / finalVolumeLiters) * 1000) / 10

  // Podział na spirytus i wódkę, jeśli wybrano mix 1:1
  let spirit95Ml = 0
  let vodka40Ml = 0
  if (input.alcoholType === 'mix_67') {
    spirit95Ml = Math.round(baseAlcoholMl / 2)
    vodka40Ml = baseAlcoholMl - spirit95Ml
  }

  return {
    fruitGrams: Math.round(safeFruitKg * 1000),
    targetAbv: safeTargetAbv,
    baseAlcoholName: baseName,
    baseAlcoholAbv: Math.round(baseAbv * 100),
    baseAlcoholMl,
    spirit95Ml,
    vodka40Ml,
    waterMl,
    sugarGrams,
    estimatedJuiceMl,
    sugarSyrupVolumeMl,
    finalVolumeMl,
    finalBottlesHalfLiter,
    actualFinalAbv,
    isDilutionWarning,
    warningMessage,
  }
}
