export type PizzaStyleId = 'napoletana' | 'classica' | 'teglia' | 'ny2h'

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
  defaultSugarPerKg?: number // g na kg mąki
  defaultTotalHours: number // h
  defaultFridgeHours: number // h
  defaultRoomTemp: number // °C
  defaultYeastType?: 'fresh' | 'dry'
  bakingTempNote: string
  bakingProcedure: string
}

export const PIZZA_PRESETS: Record<PizzaStyleId, PizzaPreset> = {
  napoletana: {
    id: 'napoletana',
    name: 'Pizza Napoletana',
    shortName: 'Napoletana',
    subtitle: 'Oryginalna neapolitańska',
    description:
      'Miękkie, puszyste brzegi (cornicione) i cienki, elastyczny środek. Tradycyjne ciasto bez dodatku oliwy i cukru.',
    defaultBalls: 4,
    defaultBallWeight: 250,
    defaultHydration: 65,
    defaultSaltPerKg: 28,
    defaultOilPerKg: 0,
    defaultSugarPerKg: 0,
    defaultTotalHours: 24,
    defaultFridgeHours: 18,
    defaultRoomTemp: 21,
    defaultYeastType: 'fresh',
    bakingTempNote: 'Piec do pizzy (np. Ooni, Effeuno) 430–480°C',
    bakingProcedure:
      'Rozciągaj kulkę wyłącznie dłońmi od środka ku brzegom, zostawiając powietrze w rancie. Piecz na rozgrzanym kamieniu w 430–480°C przez 60–90 sekund.',
  },
  classica: {
    id: 'classica',
    name: 'Pizza Classica',
    shortName: 'Classica',
    subtitle: 'Chrupiąca cienka',
    description:
      'Tradycyjna, równomiernie chrupka pizza z dodatkiem oliwy. Idealna do wypieku w domowym piekarniku.',
    defaultBalls: 4,
    defaultBallWeight: 220,
    defaultHydration: 58,
    defaultSaltPerKg: 25,
    defaultOilPerKg: 25,
    defaultSugarPerKg: 0,
    defaultTotalHours: 8,
    defaultFridgeHours: 0,
    defaultRoomTemp: 21,
    defaultYeastType: 'fresh',
    bakingTempNote: 'Domowy piekarnik max (250–300°C) z kamieniem lub stalą',
    bakingProcedure:
      'Nagrzej kamień lub stal do pizzy przez min. 45 minut na najwyższej temperaturze piekarnika. Piecz ok. 6–8 minut do złotego, chrupiącego spodu.',
  },
  teglia: {
    id: 'teglia',
    name: 'Pizza in Teglia alla Romana',
    shortName: 'Teglia Romana',
    subtitle: 'Rzymska z blachy',
    description:
      'Wysoka hydratacja, chrupiący spód i lekki, mocno napowietrzony miękisz dzięki długiemu dojrzewaniu w chłodzie.',
    defaultBalls: 1,
    defaultBallWeight: 600,
    defaultHydration: 78,
    defaultSaltPerKg: 25,
    defaultOilPerKg: 20,
    defaultSugarPerKg: 0,
    defaultTotalHours: 48,
    defaultFridgeHours: 44,
    defaultRoomTemp: 21,
    defaultYeastType: 'fresh',
    bakingTempNote: 'Piekarnik 250–275°C na blasze posmarowanej oliwą',
    bakingProcedure:
      'Rozprowadź ciasto delikatnie na naoliwionej blasze. Piecz najpierw na dolnej półce z samym sosem przez ok. 8–10 min, następnie dodaj mozzarellę i dopiecz 4–5 min.',
  },
  ny2h: {
    id: 'ny2h',
    name: 'Pizza w 2h (New York Style)',
    shortName: 'Pizza w 2h',
    subtitle: 'New York Style (bez miksera)',
    description:
      'Szybka, chrupiąca pizza w stylu nowojorskim z dodatkiem odrobiny cukru i oliwy. Gotowa już po 2 godzinach (optymalnie 3–6h), idealna do domowego piekarnika lub na żeliwną patelnię.',
    defaultBalls: 2,
    defaultBallWeight: 320,
    defaultHydration: 62,
    defaultSaltPerKg: 27,
    defaultOilPerKg: 14,
    defaultSugarPerKg: 15,
    defaultTotalHours: 2,
    defaultFridgeHours: 0,
    defaultRoomTemp: 21,
    defaultYeastType: 'dry',
    bakingTempNote: 'Piekarnik max (~275–300°C, termoobieg + grill) lub patelnia stalowa/żeliwna',
    bakingProcedure:
      'Wyrabiaj ciasto ręcznie 5–7 min, odstaw na 45 min, podziel na kulki i zostaw na 1,5–2h (optymalnie 3–6h). Rozciągaj na grubej warstwie semoliny (lub mąki kukurydzianej). Piecz na 2. półce od góry na nagrzanym kamieniu/stali (30–45 min nagrzewania) przez 5–7 min w trybie termoobieg + górny grill, albo na naoliwionej patelni żeliwnej.',
  },
}
