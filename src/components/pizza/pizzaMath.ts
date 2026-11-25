export interface PizzaCalculationInput {
  balls: number
  ballWeight: number // gramy
  hydration: number // %
  saltPerKg: number // g na kg mąki
  oilPerKg: number // g na kg mąki
  sugarPerKg?: number // g na kg mąki
  totalHours: number // h
  fridgeHours: number // h
  roomTemp: number // °C
}

export interface PizzaCalculationResult {
  totalDoughWeight: number
  flourGrams: number
  waterGrams: number
  saltGrams: number
  oilGrams: number
  sugarGrams: number
  freshYeastGrams: number
  dryYeastGrams: number
  yeastPercentage: number
  effectiveHours: number
  roomHours: number
  fridgeHours: number
}

/**
 * Oblicza zalecaną ilość drożdży świeżych i suchych na podstawie
 * modelu fermentacji ciasta.
 */
export function calculateYeastPercentage(
  totalHours: number,
  fridgeHours: number,
  roomTemp: number,
): { yeastPercentage: number; effectiveHours: number; roomHours: number; fridgeHours: number } {
  const safeTotalHours = Math.max(1, totalHours)
  const safeFridgeHours = Math.max(0, Math.min(safeTotalHours - 0.5, fridgeHours))
  const safeRoomHours = Math.max(0.5, safeTotalHours - safeFridgeHours)
  const safeTemp = Math.max(15, Math.min(35, roomTemp))

  const tempFactor = Math.pow(1.114, safeTemp - 20)
  const effectiveHours = Math.max(0.5, safeRoomHours * tempFactor + safeFridgeHours * 0.19)

  const rawYeastPct = 2.59 / Math.pow(effectiveHours, 1.23)
  const clampedYeastPct = Math.max(0.01, Math.min(3.0, rawYeastPct))

  return {
    yeastPercentage: clampedYeastPct,
    effectiveHours: Math.round(effectiveHours * 10) / 10,
    roomHours: Math.round(safeRoomHours * 10) / 10,
    fridgeHours: Math.round(safeFridgeHours * 10) / 10,
  }
}

/**
 * Przelicza składniki ciasta metodą Baker's Percentages.
 * Mąka jest bazą (100%), dzielimy wagę ciasta przez (1 + hydratacja + sól + oliwa + cukier).
 */
export function calculatePizzaRecipe(input: PizzaCalculationInput): PizzaCalculationResult {
  const safeBalls = Math.max(1, Math.round(input.balls))
  const safeBallWeight = Math.max(50, input.ballWeight)
  const totalDoughWeight = safeBalls * safeBallWeight

  const safeHydration = Math.max(45, Math.min(95, input.hydration))
  const safeSaltPerKg = Math.max(0, Math.min(50, input.saltPerKg))
  const safeOilPerKg = Math.max(0, Math.min(100, input.oilPerKg))
  const safeSugarPerKg = Math.max(0, Math.min(60, input.sugarPerKg ?? 0))

  const yeastInfo = calculateYeastPercentage(
    input.totalHours,
    input.fridgeHours,
    input.roomTemp,
  )

  const hydrationRatio = safeHydration / 100
  const saltRatio = safeSaltPerKg / 1000
  const oilRatio = safeOilPerKg / 1000
  const sugarRatio = safeSugarPerKg / 1000

  const bakerRatio = 1 + hydrationRatio + saltRatio + oilRatio + sugarRatio
  const rawFlour = totalDoughWeight / bakerRatio
  const flourGrams = Math.round(rawFlour)

  const waterGrams = Math.round(rawFlour * hydrationRatio)
  const saltGrams = Math.round(rawFlour * saltRatio * 10) / 10
  const oilGrams = Math.round(rawFlour * oilRatio * 10) / 10
  const sugarGrams = Math.round(rawFlour * sugarRatio * 10) / 10

  const rawFreshYeast = flourGrams * (yeastInfo.yeastPercentage / 100)
  const freshYeastGrams = Math.round(rawFreshYeast * 100) / 100
  const dryYeastGrams = Math.max(0.01, Math.round((freshYeastGrams / 3.0) * 100) / 100)

  return {
    totalDoughWeight,
    flourGrams,
    waterGrams,
    saltGrams,
    oilGrams,
    sugarGrams,
    freshYeastGrams,
    dryYeastGrams,
    yeastPercentage: Math.round(yeastInfo.yeastPercentage * 1000) / 1000,
    effectiveHours: yeastInfo.effectiveHours,
    roomHours: yeastInfo.roomHours,
    fridgeHours: yeastInfo.fridgeHours,
  }
}
