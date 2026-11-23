export type PizzaStyleId = 'napoletana' | 'classica' | 'teglia'

export interface PizzaPreset {
  id: PizzaStyleId
  name: string
  shortName: string
  subtitle: string
  description: string
  defaultBalls: number
  defaultBallWeight: number // gramy
  defaultHydration: number // %
  defaultSaltPerKg: number // g na kg mąki
  defaultOilPerKg: number // g na kg mąki
  defaultTotalHours: number // h
  defaultFridgeHours: number // h
  defaultRoomTemp: number // °C
  bakingTempNote: string
}

export const PIZZA_PRESETS: Record<PizzaStyleId, PizzaPreset> = {
  napoletana: {
    id: 'napoletana',
    name: 'Pizza Napoletana',
    shortName: 'Napoletana',
    subtitle: 'Oryginalna neapolitańska',
    description: 'Miękkie, puszyste brzegi (cornicione), cienki środek. Wypiek w 430–480°C w 60–90 sekund.',
    defaultBalls: 4,
    defaultBallWeight: 250,
    defaultHydration: 65,
    defaultSaltPerKg: 28,
    defaultOilPerKg: 0,
    defaultTotalHours: 24,
    defaultFridgeHours: 18,
    defaultRoomTemp: 21,
    bakingTempNote: 'Piec do pizzy (np. Ooni, Effeuno) 430–480°C',
  },
  classica: {
    id: 'classica',
    name: 'Pizza Classica',
    shortName: 'Classica',
    subtitle: 'Chrupiąca cienka',
    description: 'Tradycyjna, równomiernie chrupka pizza z dodatkiem oliwy. Idealna do domowego piekarnika.',
    defaultBalls: 4,
    defaultBallWeight: 220,
    defaultHydration: 58,
    defaultSaltPerKg: 25,
    defaultOilPerKg: 25,
    defaultTotalHours: 8,
    defaultFridgeHours: 0,
    defaultRoomTemp: 21,
    bakingTempNote: 'Domowy piekarnik max (250–300°C) z kamieniem lub stalą',
  },
  teglia: {
    id: 'teglia',
    name: 'Pizza in Teglia alla Romana',
    shortName: 'Teglia Romana',
    subtitle: 'Rzymska z blachy',
    description: 'Wysoka hydratacja, chrupiący spód i lekki, napowietrzony miękisz. Długie dojrzewanie w chłodzie.',
    defaultBalls: 1,
    defaultBallWeight: 600,
    defaultHydration: 78,
    defaultSaltPerKg: 25,
    defaultOilPerKg: 20,
    defaultTotalHours: 48,
    defaultFridgeHours: 44,
    defaultRoomTemp: 21,
    bakingTempNote: 'Piekarnik 250–275°C na blasze posmarowanej oliwą',
  },
}
