export interface PizzaCalculationInput {
  balls: number
  ballWeight: number // gramy
  hydration: number // %
  saltPerKg: number // g na kg mąki
  oilPerKg: number // g na kg mąki
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
  freshYeastGrams: number
  dryYeastGrams: number
  yeastPercentage: number
  effectiveHours: number
  roomHours: number
  fridgeHours: number
}

/**
 * Oblicza zalecaną ilość drożdży świeżych i suchych na podstawie
 * czasu w temperaturze pokojowej, czasu w lodówce oraz temperatury otoczenia.
 * Algorytm oparty na tabelach fermentacji KMP / Craig's Yeast Model.
 */
export function calculateYeastPercentage(
  totalHours: number,
  fridgeHours: number,
  roomTemp: number,
): { yeastPercentage: number; effectiveHours: number; roomHours: number; fridgeHours: number } {
  const safeTotalHours = Math.max(1, totalHours)
  const safeFridgeHours = Math.max(0, Math.min(safeTotalHours - 0.5, fridgeHours))
  const safeRoomHours = Math.max(0.5, safeTotalHours - safeFridgeHours)
  const safeTemp = Math.max(15, Math.min(32, roomTemp))

  // Współczynnik przyspieszenia temperatury pokojowej względem 21°C (Q10 ~ 2)
  const tempFactor = Math.pow(2, (safeTemp - 21) / 10)

  // 1 godzina w lodówce (ok. 4°C) odpowiada około 0.10 godziny w 21°C
  const effectiveHours = safeRoomHours * tempFactor + safeFridgeHours * 0.1

  // Dopasowany model potęgowy dla drożdży piekarskich świeżych (prasowanych)
  const rawYeastPct = 2.25 / Math.pow(effectiveHours, 1.05)

  // Bezpieczne granice (od 0.04% dla wielodniowych dojrzewań do max 2.5% dla super szybkich ciast)
  const clampedYeastPct = Math.max(0.04, Math.min(2.5, rawYeastPct))

  return {
    yeastPercentage: clampedYeastPct,
    effectiveHours: Math.round(effectiveHours * 10) / 10,
    roomHours: Math.round(safeRoomHours * 10) / 10,
    fridgeHours: Math.round(safeFridgeHours * 10) / 10,
  }
}

/**
 * Przelicza składniki ciasta metodą Baker's Percentages (procenty piekarskie).
 * Mąka jest bazą (100%), wszystkie pozostałe składniki są liczone w relacji do niej.
 */
export function calculatePizzaRecipe(input: PizzaCalculationInput): PizzaCalculationResult {
  const safeBalls = Math.max(1, Math.round(input.balls))
  const safeBallWeight = Math.max(50, input.ballWeight)
  const totalDoughWeight = safeBalls * safeBallWeight

  const safeHydration = Math.max(45, Math.min(95, input.hydration))
  const safeSaltPerKg = Math.max(0, Math.min(50, input.saltPerKg))
  const safeOilPerKg = Math.max(0, Math.min(100, input.oilPerKg))

  const yeastInfo = calculateYeastPercentage(
    input.totalHours,
    input.fridgeHours,
    input.roomTemp,
  )

  // Suma współczynników w relacji do mąki (Flour = 1.0)
  const hydrationRatio = safeHydration / 100
  const saltRatio = safeSaltPerKg / 1000
  const oilRatio = safeOilPerKg / 1000
  const yeastRatio = yeastInfo.yeastPercentage / 100

  const totalBakerRatio = 1 + hydrationRatio + saltRatio + oilRatio + yeastRatio

  // Obliczenie wagi mąki
  const rawFlour = totalDoughWeight / totalBakerRatio
  const flourGrams = Math.round(rawFlour)

  // Składniki pochodne
  const waterGrams = Math.round(rawFlour * hydrationRatio)
  const saltGrams = Math.round(rawFlour * saltRatio * 10) / 10
  const oilGrams = Math.round(rawFlour * oilRatio * 10) / 10

  const freshYeastGrams = Math.round(rawFlour * yeastRatio * 10) / 10
  const dryYeastGrams = Math.round((freshYeastGrams / 3.0) * 10) / 10

  return {
    totalDoughWeight,
    flourGrams,
    waterGrams,
    saltGrams,
    oilGrams,
    freshYeastGrams,
    dryYeastGrams,
    yeastPercentage: Math.round(yeastInfo.yeastPercentage * 100) / 100,
    effectiveHours: yeastInfo.effectiveHours,
    roomHours: yeastInfo.roomHours,
    fridgeHours: yeastInfo.fridgeHours,
  }
}
