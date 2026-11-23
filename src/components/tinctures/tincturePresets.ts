export type TinctureFruitId = 'malina' | 'cytryna' | 'wisnia' | 'wlasna'

export type AlcoholTypeId = 'spirit_95' | 'vodka_40' | 'mix_67' | 'custom'

export interface TinctureFruitPreset {
  id: TinctureFruitId
  name: string
  shortName: string
  subtitle: string
  description: string
  defaultJuiceYieldLitersPerKg: number // litry soku z 1 kg owoców
  defaultTargetAbv: number // % vol
  defaultSugarGramsPerKg: number // g cukru na 1 kg owoców
  sugarRange: { min: number; max: number; step: number }
  defaultAlcoholType: AlcoholTypeId
  steepingWeeks: string
  instructions: string[]
}

export const TINCTURE_PRESETS: Record<TinctureFruitId, TinctureFruitPreset> = {
  malina: {
    id: 'malina',
    name: 'Malinówka',
    shortName: 'Malinówka',
    subtitle: 'Nalewka z malin',
    description: 'Aromatyczna, soczysta i rubinowa nalewka. Owoce bardzo chętnie oddają sok i barwę.',
    defaultJuiceYieldLitersPerKg: 0.65,
    defaultTargetAbv: 35,
    defaultSugarGramsPerKg: 300,
    sugarRange: { min: 150, max: 600, step: 25 },
    defaultAlcoholType: 'mix_67',
    steepingWeeks: '2–3 tygodnie',
    instructions: [
      'Oczyszczone maliny wrzuć do słoja i zalej alkoholem o mocy ok. 60–65%.',
      'Odstaw słój w ciemne, ciepłe miejsce na 2–3 tygodnie, od czasu do czasu delikatnie nim potrząsając.',
      'Po 3 tygodniach zlej aromatyczny nalew alkoholowy do osobnego naczynia i szczelnie zamknij.',
      'Owoce pozostałe w słoju zasyp wyliczoną ilością cukru. Odstaw na 7–10 dni, aż cukier całkowicie wyciągnie resztę soku.',
      'Zlej powstały syrop cukrowy, połącz z wcześniej odlanym alkoholem i przegotowaną wodą.',
      'Przefiltruj nalewkę przez gazę lub filtr do kawy i rozlej do butelek. Odstaw na min. 3 miesiące do dojrzewania.',
    ],
  },
  cytryna: {
    id: 'cytryna',
    name: 'Cytrynówka',
    shortName: 'Cytrynówka',
    subtitle: 'Nalewka cytrynowa (Limoncello style)',
    description: 'Orzeźwiająca, słoneczna nalewka z aromatycznych żółtych skórek i świeżo wyciśniętego soku.',
    defaultJuiceYieldLitersPerKg: 0.45,
    defaultTargetAbv: 32,
    defaultSugarGramsPerKg: 380,
    sugarRange: { min: 200, max: 650, step: 25 },
    defaultAlcoholType: 'spirit_95',
    steepingWeeks: '2–4 dni (skórki)',
    instructions: [
      'Cytryny dokładnie sparz wrzątkiem i wyszoruj szczoteczką. Obierz samą żółtą skórkę (bez białego gorzkiego albedo).',
      'Skórki zalej spirytusem i odstaw na 2–4 dni (nie dłużej, aby nie wyciągnąć goryczki).',
      'Z obranych cytryn wyciśnij sok. Odcedź pestki.',
      'W ciepłej wodzie rozpuść wyliczoną ilość cukru, a następnie wymieszaj z sokiem z cytryn.',
      'Zlej żółty nalew alkoholowy ze skórek i powoli połącz z przestudzonym syropem z sokiem (nalewka naturalnie zmatowieje).',
      'Przelej do butelek i odstaw na min. 1–2 tygodnie w chłodne miejsce (najlepiej smakuje mocno schłodzona).',
    ],
  },
  wisnia: {
    id: 'wisnia',
    name: 'Wiśniówka',
    shortName: 'Wiśniówka',
    subtitle: 'Klasyczna nalewka z wiśni',
    description: 'Królowa polskich nalewek. Głęboki bordowy kolor, lekko migdałowa nuta i wytworny bukiet.',
    defaultJuiceYieldLitersPerKg: 0.58,
    defaultTargetAbv: 38,
    defaultSugarGramsPerKg: 350,
    sugarRange: { min: 200, max: 600, step: 25 },
    defaultAlcoholType: 'spirit_95',
    steepingWeeks: '4–6 tygodni',
    instructions: [
      'Wiśnie umyj i usuń ogonki. Wydryluj owoce, zostawiając około 10–15% pestek dla szlachetnego migdałowego posmaku.',
      'Owoce umieść w słoju i zalej alkoholem o mocy ok. 65–70%.',
      'Odstaw w nasłonecznione lub ciepłe miejsce na 4–6 tygodni, potrząsając słojem co kilka dni.',
      'Po 6 tygodniach zlej nalew alkoholowy. Owoce w słoju zasyp wyliczoną ilością cukru na 2–3 tygodnie, aż do całkowitego rozpuszczenia.',
      'Zlej wytworzony gęsty syrop wiśniowy i połącz go z nalewem alkoholowym oraz ewentualną wyliczoną wodą.',
      'Odstaw do sklarowania na 2 tygodnie, przefiltruj i zabutelkuje. Najlepsza po minimum 6 miesiącach leżakowania.',
    ],
  },
  wlasna: {
    id: 'wlasna',
    name: 'Własna nalewka',
    shortName: 'Inny owoc',
    subtitle: 'Dowolne owoce (aronia, pigwa, śliwka)',
    description: 'Uniwersalny kalkulator do tworzenia własnych autorskich nastawów owocowych.',
    defaultJuiceYieldLitersPerKg: 0.50,
    defaultTargetAbv: 35,
    defaultSugarGramsPerKg: 300,
    sugarRange: { min: 100, max: 700, step: 25 },
    defaultAlcoholType: 'mix_67',
    steepingWeeks: '3–6 tygodni',
    instructions: [
      'Owoce dokładnie umyj, osusz i przygotuj (większe pokrój, twarde np. pigwę zetrzyj lub poszatkuj).',
      'Zalej owoce alkoholem o pożądanej mocy maceracji (50–70%).',
      'Maceruj w słoju przez 3–6 tygodni zależnie od twardości owoców.',
      'Zlej nalew, zasyp owoce cukrem na 1–2 tygodnie, po czym połącz frakcję alkoholową z syropem i wodą.',
      'Przefiltruj i odstaw do leżakowania w chłodnym, ciemnym miejscu.',
    ],
  },
}

export const TINCTURE_ALCOHOL_TYPES: Record<AlcoholTypeId, { name: string; abv: number; note: string }> = {
  spirit_95: {
    name: 'Spirytus 95%',
    abv: 0.95,
    note: 'Czysty spirytus rektyfikowany (95% vol)',
  },
  vodka_40: {
    name: 'Wódka 40%',
    abv: 0.40,
    note: 'Czysta wódka (40% vol)',
  },
  mix_67: {
    name: 'Spirytus + Wódka 1:1 (~67.5%)',
    abv: 0.675,
    note: 'Tradycyjna mieszanka 1:1 dająca idealną moc maceracji',
  },
  custom: {
    name: 'Własny alkohol',
    abv: 0.60,
    note: 'Wpisz własne stężenie (np. domowy destylat)',
  },
}
