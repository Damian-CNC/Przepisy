import { uploadRecipeImage } from './imageCompression'
import {
  fetchRecipes,
  getSupabasePublicConfig,
  insertRecipe,
  isSupabaseConfigured,
  supabase,
  updateRecipe,
  type LinkedRecipeItem,
  type RecipeCategory,
  type RecipeIngredient,
  type RecipeInsert,
  type RecipeNutrition,
  type RecipeRow,
  type RecipeStep,
  type RecipeUpdate,
  type SourcePlatform,
  type StepIngredient,
} from './supabase'

export function extractLinkedRecipes(recipe: RecipeRow | null | undefined): LinkedRecipeItem[] {
  if (!recipe) return []
  if (Array.isArray(recipe.linked_recipes) && recipe.linked_recipes.length > 0) {
    return recipe.linked_recipes.filter(
      (item): item is LinkedRecipeItem =>
        Boolean(
          item &&
            typeof item === 'object' &&
            typeof item.recipe_id === 'string' &&
            item.recipe_id.trim() &&
            typeof item.label === 'string',
        ),
    )
  }
  if (recipe.nutrition && typeof recipe.nutrition === 'object') {
    const raw = (recipe.nutrition as Record<string, unknown>).linked_recipes
    if (Array.isArray(raw)) {
      return raw.filter(
        (item): item is LinkedRecipeItem =>
          Boolean(
            item &&
              typeof item === 'object' &&
              typeof item.recipe_id === 'string' &&
              item.recipe_id.trim() &&
              typeof item.label === 'string',
          ),
      )
    }
  }
  return []
}

export interface ImportRecipePayload {
  url?: string
  rawText?: string
  imageBase64?: string
  mimeType?: string
  signal?: AbortSignal
}

const VALID_SOURCE_PLATFORMS: ReadonlySet<SourcePlatform> = new Set([
  'instagram',
  'web',
  'photo',
  'manual',
  'ai',
])

function assertSupabaseReady(): void {
  if (!isSupabaseConfigured()) {
    throw new Error('Brak konfiguracji Supabase. Uzupełnij zmienne środowiskowe VITE_SUPABASE_URL i VITE_SUPABASE_ANON_KEY.')
  }
}

function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.').trim())
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return fallback
}

function toNonNegativeInt(value: unknown, fallback: number, min = 0): number {
  const num = toFiniteNumber(value, fallback)
  return Math.max(min, Math.round(num))
}

function toNullableTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Zwraca bezpieczny adres URL (`http:` lub `https:`), odrzucając schematy typu `javascript:`.
 */
export function toSafeHttpUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null
  try {
    const parsed = new URL(rawUrl.trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null
  } catch {
    return null
  }
}

function inferSourcePlatform(
  rawPlatform: unknown,
  payload?: ImportRecipePayload,
): SourcePlatform {
  if (
    typeof rawPlatform === 'string' &&
    VALID_SOURCE_PLATFORMS.has(rawPlatform as SourcePlatform)
  ) {
    return rawPlatform as SourcePlatform
  }
  if (payload?.imageBase64) return 'photo'
  if (payload?.url) {
    const lowerUrl = payload.url.toLowerCase()
    if (lowerUrl.includes('instagram.com') || lowerUrl.includes('instagr.am')) {
      return 'instagram'
    }
    return 'web'
  }
  return 'manual'
}

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }
  return result
}

function estimateLiquidDensity(name: string): number {
  const lower = name.toLowerCase()
  if (/(olej|oliw|tłuszcz|masło klarowane)/i.test(lower)) return 0.92
  if (/(miód|miodu|syrop|melas)/i.test(lower)) return 1.4
  if (/(śmietan|mleko|mleka|kefir|maślank|jogurt)/i.test(lower)) return 1.03
  return 1
}

function estimateCupGrams(name: string): number {
  const lower = name.toLowerCase()
  if (/(cukier puder|cukru pudru)/i.test(lower)) return 160
  if (/(cukier|cukru|ryż|kasza|kaszy|sól)/i.test(lower)) return 200
  if (/(mąka|mąki|skrobia|kakao)/i.test(lower)) return 135
  if (/(płatk|orzech|wiórk|bułka tarta|bułki tartej|migdał)/i.test(lower)) return 110
  if (/(masło|masła)/i.test(lower)) return 225
  if (/(olej|oliw)/i.test(lower)) return 220
  if (/(miód|miodu|syrop)/i.test(lower)) return 340
  if (/(woda|wody|mleko|mleka|śmietan|bulion|wywar|sok|wino|kefir)/i.test(lower)) return 250
  return 200
}

/**
 * Konwertuje jednostki objętościowe (`ml`, `l`, `szklanka`, `cup`, `fl oz`, `oz`, `lb`) na gramy (`g`)
 * pod wagę kuchenną, pozostawiając małe jednostki kuchenne (`łyżeczka`, `szczypta`, `szt.`).
 */
function convertMeasurementToWeight(
  name: string,
  amount: number,
  rawUnit: string,
): { amount: number; unit: string } {
  const unit = rawUnit.trim()
  if (!unit || !Number.isFinite(amount) || amount <= 0) {
    return { amount, unit }
  }

  const normalized = unit.toLowerCase().replace(/\.+$/, '').trim()
  const roundGrams = (value: number) =>
    value < 5 ? Math.round(value * 10) / 10 : Math.round(value)

  if (normalized === 'ml' || normalized === 'mililitr' || normalized === 'mililitry' || normalized === 'mililitrów') {
    return { amount: roundGrams(amount * estimateLiquidDensity(name)), unit: 'g' }
  }

  if (normalized === 'l' || normalized === 'litr' || normalized === 'litry' || normalized === 'litrów') {
    return { amount: roundGrams(amount * 1000 * estimateLiquidDensity(name)), unit: 'g' }
  }

  if (/^(szkl|szklank[aie]|szklanek|cup|cups)$/.test(normalized)) {
    return { amount: roundGrams(amount * estimateCupGrams(name)), unit: 'g' }
  }

  if (normalized === 'fl oz' || normalized === 'fl. oz') {
    return { amount: roundGrams(amount * 29.57 * estimateLiquidDensity(name)), unit: 'g' }
  }

  if (normalized === 'oz' || normalized === 'uncja' || normalized === 'uncje' || normalized === 'uncji') {
    return { amount: roundGrams(amount * 28.35), unit: 'g' }
  }

  if (normalized === 'lb' || normalized === 'lbs' || normalized === 'funt' || normalized === 'funty') {
    return { amount: roundGrams(amount * 453.6), unit: 'g' }
  }

  return { amount, unit }
}

function normalizeIngredients(raw: unknown): RecipeIngredient[] {
  if (!Array.isArray(raw)) return []
  const result: RecipeIngredient[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const name = toNullableTrimmedString(record.name)
    if (!name) continue
    const rawAmount = Math.max(0, toFiniteNumber(record.amount, 0))
    const rawUnit = typeof record.unit === 'string' ? record.unit.trim() : ''
    const { amount, unit } = convertMeasurementToWeight(name, rawAmount, rawUnit)
    const rawCategory = toNullableTrimmedString(record.category)
    const category =
      rawCategory && !/^(mokre|suche|mokry|suchy|płynne|sypkie)$/i.test(rawCategory)
        ? rawCategory
        : undefined

    result.push(category ? { name, amount, unit, category } : { name, amount, unit })
  }
  return result
}

function normalizeStepIngredients(raw: unknown): StepIngredient[] {
  if (!Array.isArray(raw)) return []
  const result: StepIngredient[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const name = toNullableTrimmedString(record.name)
    if (!name) continue
    const rawAmount = Math.max(0, toFiniteNumber(record.amount, 0))
    const rawUnit = typeof record.unit === 'string' ? record.unit.trim() : ''
    const { amount, unit } = convertMeasurementToWeight(name, rawAmount, rawUnit)
    result.push({ name, amount, unit })
  }
  return result
}

export function sanitizeStepTimer(instruction: string, reportedSeconds: number): number {
  const safeSeconds = Math.max(0, Math.round(Number(reportedSeconds) || 0))
  if (!instruction || typeof instruction !== 'string') return safeSeconds

  const clean = instruction.toLowerCase()

  // Wzorzec na minuty: np. "odstaw na 10 minut", "10 min", "25 minut", "15-20 minut"
  const minuteMatch = clean.match(
    /(?:odstaw|piecz|gotuj|smaż|wyrastaj|duś|miksuj|studź|czekaj|pozostaw)?\s*(?:na|przez|ok\.?|około)?\s*(\d+(?:[.,]\d+)?)\s*(?:-|do)?\s*(?:\d+(?:[.,]\d+)?)?\s*(minut[yęa]?|min\b)/i,
  )
  if (minuteMatch) {
    const rawNum = parseFloat(minuteMatch[1].replace(',', '.'))
    if (Number.isFinite(rawNum) && rawNum > 0) {
      const expectedSeconds = Math.round(rawNum * 60)
      if (
        safeSeconds === 0 ||
        safeSeconds === Math.round(rawNum) ||
        (rawNum >= 2 && safeSeconds === 60) ||
        Math.abs(safeSeconds - expectedSeconds) > 60
      ) {
        return expectedSeconds
      }
    }
  }

  // Wzorzec na godziny: np. "1 godzina", "2 godziny", "1.5 godz"
  const hourMatch = clean.match(
    /(\d+(?:[.,]\d+)?)\s*(?:-|do)?\s*(?:\d+(?:[.,]\d+)?)?\s*(godzin[yęa]?|godz\b|h\b)/i,
  )
  if (hourMatch) {
    const rawNum = parseFloat(hourMatch[1].replace(',', '.'))
    if (Number.isFinite(rawNum) && rawNum > 0) {
      const expectedSeconds = Math.round(rawNum * 3600)
      if (safeSeconds === 0 || safeSeconds < expectedSeconds * 0.5) {
        return expectedSeconds
      }
    }
  }

  return safeSeconds
}

function normalizeSteps(raw: unknown): RecipeStep[] {
  if (!Array.isArray(raw)) return []
  const normalized: RecipeStep[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const instruction =
      toNullableTrimmedString(record.instruction) ??
      toNullableTrimmedString(record.text) ??
      toNullableTrimmedString(record.description) ??
      toNullableTrimmedString(record.step)
    if (!instruction) continue

    const stepNumber =
      toNonNegativeInt(record.step_number, 0, 0) ||
      toNonNegativeInt(record.order, 0, 0) ||
      normalized.length + 1

    const rawTimerMinutes =
      typeof record.timerMinutes === 'number' && record.timerMinutes > 0
        ? Math.round(record.timerMinutes * 60)
        : 0

    const rawTimerSeconds =
      toNonNegativeInt(record.timer_seconds, 0, 0) ||
      rawTimerMinutes

    const timerSeconds = sanitizeStepTimer(instruction, rawTimerSeconds)
    const stepIngredients = normalizeStepIngredients(record.step_ingredients)
    const tip = toNullableTrimmedString(record.tip)

    normalized.push({
      step_number: stepNumber,
      instruction,
      step_ingredients: stepIngredients,
      timer_seconds: timerSeconds,
      tip,
    })
  }

  return normalized
    .sort((a, b) => a.step_number - b.step_number)
    .map((step, index) => ({
      ...step,
      step_number: index + 1,
    }))
}

function normalizeNutrition(raw: unknown): RecipeNutrition {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const result: Record<string, number | string> = {}
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof val === 'number' && Number.isFinite(val)) {
      result[key] = val
    } else if (typeof val === 'string' && val.trim()) {
      result[key] = val.trim()
    }
  }
  return Object.keys(result).length > 0 ? result : null
}

const IMPORT_TIMEOUT_MS = 120_000

interface InvokeEdgeFunctionOptions {
  signal?: AbortSignal
  timeoutMs?: number
  authErrorMsg?: string
  timeoutErrorMsg?: string
}

async function invokeEdgeFunction<TResponse>(
  functionName: string,
  body: unknown,
  options?: InvokeEdgeFunctionOptions,
): Promise<TResponse> {
  assertSupabaseReady()

  const { url: supabaseUrl, anonKey } = getSupabasePublicConfig()
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token

  const timeoutMs = options?.timeoutMs ?? IMPORT_TIMEOUT_MS
  const controller = new AbortController()
  let timedOut = false

  const onExternalAbort = () => controller.abort()
  if (options?.signal) {
    if (options.signal.aborted) {
      throw new Error('Operacja została przerwana.')
    }
    options.signal.addEventListener('abort', onExternalAbort, { once: true })
  }

  const timeoutId = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  let response: Response
  try {
    response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    if (timedOut) {
      throw new Error(
        options?.timeoutErrorMsg ??
          'Przetwarzanie trwało zbyt długo (ponad 2 min). Spróbuj ponownie.',
      )
    }
    if (options?.signal?.aborted) {
      throw new Error('Operacja została anulowana.')
    }
    throw new Error(
      err instanceof Error && err.message
        ? `Błąd połączenia z serwerem AI: ${err.message}`
        : 'Błąd połączenia z serwerem AI.',
    )
  } finally {
    window.clearTimeout(timeoutId)
    options?.signal?.removeEventListener('abort', onExternalAbort)
  }

  let data: unknown = null
  try {
    data = await response.json()
  } catch {
    data = null
  }

  if (!response.ok) {
    const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : null
    const serverMsg =
      record && typeof record.error === 'string' && record.error.trim()
        ? record.error.trim()
        : null

    if (serverMsg) {
      throw new Error(serverMsg)
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        options?.authErrorMsg ??
          'Brak uprawnień do asystenta AI. Zaloguj się ponownie i spróbuj jeszcze raz.',
      )
    }
    if (response.status === 429 || response.status === 503) {
      throw new Error('Asystent AI jest chwilowo przeciążony. Spróbuj ponownie za kilkanaście sekund.')
    }
    throw new Error(`Błąd serwera podczas przetwarzania przepisu (HTTP ${response.status}).`)
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Asystent AI zwrócił pustą odpowiedź. Spróbuj ponownie.')
  }

  const envelope = data as Record<string, unknown>
  if (typeof envelope.error === 'string' && envelope.error.trim()) {
    throw new Error(envelope.error.trim())
  }

  return data as TResponse
}

function extractRawRecipeRecord(envelope: Record<string, unknown>): Record<string, unknown> {
  return envelope.recipe && typeof envelope.recipe === 'object'
    ? (envelope.recipe as Record<string, unknown>)
    : envelope
}

function normalizeAiRecipeInsert(
  rawRecipe: Record<string, unknown>,
  defaults: {
    sourceUrl?: string | null
    sourcePlatform: SourcePlatform
  },
): RecipeInsert {
  const title = toNullableTrimmedString(rawRecipe.title) ?? 'Nowy przepis'
  const category = (toNullableTrimmedString(rawRecipe.category) ?? 'Obiad') as RecipeCategory

  return {
    title,
    description: toNullableTrimmedString(rawRecipe.description),
    source_url:
      toSafeHttpUrl(toNullableTrimmedString(rawRecipe.source_url)) ??
      toSafeHttpUrl(defaults.sourceUrl),
    source_platform: defaults.sourcePlatform,
    image_url: toNullableTrimmedString(rawRecipe.image_url),
    prep_time_minutes:
      toNonNegativeInt(rawRecipe.prep_time_minutes, 0, 0) ||
      toNonNegativeInt(rawRecipe.prepTimeMinutes, 0, 0),
    cook_time_minutes:
      toNonNegativeInt(rawRecipe.cook_time_minutes, 0, 0) ||
      toNonNegativeInt(rawRecipe.cookTimeMinutes, 0, 0),
    servings: toNonNegativeInt(rawRecipe.servings, 2, 1),
    category,
    tags: normalizeTags(rawRecipe.tags),
    is_favorite: false,
    ingredients: normalizeIngredients(rawRecipe.ingredients),
    steps: normalizeSteps(rawRecipe.steps),
    nutrition: normalizeNutrition(rawRecipe.nutrition),
    linked_recipes: Array.isArray(rawRecipe.linked_recipes) ? rawRecipe.linked_recipes : [],
  }
}

/**
 * Wywołuje Edge Function `import-recipe` z twardym limitem czasu 45 s oraz obsługą
 * anulowania (`AbortSignal`) i normalizuje wynik do bezpiecznego obiektu `RecipeInsert`.
 */
export async function importRecipeWithAi(payload: ImportRecipePayload): Promise<RecipeInsert> {
  const trimmedPayload = {
    url: payload.url?.trim() || undefined,
    rawText: payload.rawText?.trim() || undefined,
    imageBase64: payload.imageBase64?.trim() || undefined,
    mimeType: payload.mimeType?.trim() || undefined,
  }

  if (!trimmedPayload.url && !trimmedPayload.rawText && !trimmedPayload.imageBase64) {
    throw new Error('Podaj link do przepisu, tekst albo wybierz zdjęcie potrawy.')
  }

  const envelope = await invokeEdgeFunction<Record<string, unknown>>(
    'import-recipe',
    trimmedPayload,
    {
      signal: payload.signal,
      timeoutMs: IMPORT_TIMEOUT_MS,
      authErrorMsg: 'Brak uprawnień do importu AI. Zaloguj się ponownie i spróbuj jeszcze raz.',
      timeoutErrorMsg:
        'Przetwarzanie trwało zbyt długo (ponad 2 min). Wklej opis rolki ręcznie poniżej lub użyj zakładki „Ze zdjęcia / Zrzutu”.',
    },
  )

  const rawRecipe = extractRawRecipeRecord(envelope)
  return normalizeAiRecipeInsert(rawRecipe, {
    sourceUrl: trimmedPayload.url ?? null,
    sourcePlatform: inferSourcePlatform(rawRecipe.source_platform, trimmedPayload),
  })
}

export async function generateOrEditRecipeWithAi(params: {
  mode: 'create' | 'edit'
  prompt: string
  existingRecipe?: unknown
  imageMode?: 'auto' | 'web' | 'ai' | 'none'
  userId?: string
  signal?: AbortSignal
}): Promise<RecipeInsert> {
  const envelope = await invokeEdgeFunction<Record<string, unknown>>(
    'ai-recipe-assistant',
    {
      mode: params.mode,
      prompt: params.prompt,
      existingRecipe: params.existingRecipe,
      imageMode: params.imageMode ?? (params.mode === 'create' ? 'auto' : 'none'),
      userId: params.userId,
    },
    {
      signal: params.signal,
      timeoutMs: IMPORT_TIMEOUT_MS,
      authErrorMsg: 'Brak uprawnień do asystenta AI. Zaloguj się ponownie i spróbuj jeszcze raz.',
    },
  )

  const rawRecipe = extractRawRecipeRecord(envelope)
  return normalizeAiRecipeInsert(rawRecipe, {
    sourcePlatform: 'ai',
  })
}

export async function importRecipeFromSource(params: {
  url?: string
  text?: string
  images?: Array<{ mimeType: string; dataBase64: string }>
  userId?: string
  signal?: AbortSignal
}): Promise<RecipeInsert> {
  const envelope = await invokeEdgeFunction<Record<string, unknown>>(
    'import-recipe',
    {
      url: params.url,
      text: params.text,
      images: params.images,
      userId: params.userId,
    },
    {
      signal: params.signal,
      timeoutMs: IMPORT_TIMEOUT_MS,
      authErrorMsg: 'Brak uprawnień do importu AI. Zaloguj się ponownie i spróbuj jeszcze raz.',
    },
  )

  const rawRecipe = extractRawRecipeRecord(envelope)
  return normalizeAiRecipeInsert(rawRecipe, {
    sourceUrl: params.url ?? null,
    sourcePlatform: inferSourcePlatform(rawRecipe.source_platform, { url: params.url, rawText: params.text }),
  })
}

/**
 * Tworzy lub wyszukuje przepis przy użyciu Edge Function `ai-recipe-assistant` (`mode: 'discover'`).
 */
export async function discoverRecipeWithAi(payload: {
  userPrompt: string
  useWebSearch: boolean
  imageMode?: 'auto' | 'web' | 'ai' | 'none'
  signal?: AbortSignal
}): Promise<RecipeInsert> {
  const userPrompt = payload.userPrompt.trim()
  if (!userPrompt) {
    throw new Error('Opisz, na co masz ochotę lub podaj dostępne składniki.')
  }

  const envelope = await invokeEdgeFunction<Record<string, unknown>>(
    'ai-recipe-assistant',
    {
      mode: 'discover',
      userPrompt,
      prompt: userPrompt,
      useWebSearch: payload.useWebSearch,
      imageMode: payload.imageMode ?? (payload.useWebSearch ? 'web' : 'auto'),
    },
    {
      signal: payload.signal,
      timeoutMs: IMPORT_TIMEOUT_MS,
      authErrorMsg: 'Brak uprawnień do asystenta AI. Zaloguj się ponownie i spróbuj jeszcze raz.',
    },
  )

  const rawRecipe = extractRawRecipeRecord(envelope)
  const serverPlatform =
    typeof rawRecipe.source_platform === 'string' &&
    VALID_SOURCE_PLATFORMS.has(rawRecipe.source_platform as SourcePlatform)
      ? (rawRecipe.source_platform as SourcePlatform)
      : null

  return normalizeAiRecipeInsert(rawRecipe, {
    sourcePlatform: serverPlatform ?? (payload.useWebSearch ? 'web' : 'ai'),
  })
}

const CLIENT_CURATED_FOOD_IMAGES: Array<{ match: RegExp; url: string }> = [
  { match: /(?:chleb|bułk|shokupan|bagiet|pieczyw|toast|tost|chałk)/i, url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=80' },
  { match: /(?:makaron|pasta|spaghetti|carbonara|penne|tagliatelle|lasagn|bolognese)/i, url: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=1200&q=80' },
  { match: /(?:pizza|focaccia)/i, url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80' },
  { match: /(?:burger|cheeseburger)/i, url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80' },
  { match: /(?:zupa|krem|rosół|barszcz|żur|gulasz|chłodnik)/i, url: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=1200&q=80' },
  { match: /(?:naleśnik|pancake|gofry|omlet|jajeczn)/i, url: 'https://images.unsplash.com/photo-1528207776546-365bb710ee93?auto=format&fit=crop&w=1200&q=80' },
  { match: /(?:ciasto|sernik|szarlotka|tort|muffink|babeczk|deser|lody|tiramisu)/i, url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1200&q=80' },
  { match: /(?:sałatk|salad|warzyw)/i, url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1200&q=80' },
  { match: /(?:schabow|kotlet|stek|kurczak|mięs|indyk|kebab)/i, url: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80' },
  { match: /(?:ryb|łosoś|dorsz|krewetk|tuna|sushi|owoce morza)/i, url: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=1200&q=80' },
  { match: /(?:kawa|herbata|smoothie|koktajl|napój|sok)/i, url: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=1200&q=80' },
]

export function getClientCuratedFoodCover(title: string, category?: string | null): string {
  const combined = `${title} ${category ?? ''}`.toLowerCase()
  for (const item of CLIENT_CURATED_FOOD_IMAGES) {
    if (item.match.test(combined)) {
      return item.url
    }
  }
  return 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=1200&q=80'
}

function cleanClientDishTitle(raw: string): string {
  return raw
    .replace(
      /^(przepis na|jak zrobić|jak upiec|domowe|domowy|domowa|tradycyjny|tradycyjna|klasyczny|klasyczna|prosty|prosta|szybki|szybka|pyszny|pyszna|wyśmienity|wyśmienita|najlepszy|najlepsza|chrupiący|chrupiąca|pieczony|pieczona|smażony|smażona|kremowa|kremowy)\s+/gi,
      '',
    )
    .trim()
}

function isClientFoodPhotoCandidate(url: string, title?: string): boolean {
  if (!url || typeof url !== 'string') return false
  const combined = `${url} ${title ?? ''}`.toLowerCase()
  if (
    combined.endsWith('.pdf') ||
    combined.endsWith('.svg') ||
    combined.endsWith('.gif') ||
    combined.endsWith('.ogg') ||
    combined.endsWith('.webm') ||
    combined.endsWith('.tif') ||
    combined.endsWith('.tiff')
  ) {
    return false
  }
  const excluded = [
    'map', 'mapa', 'flag', 'flaga', 'logo', 'diagram', 'icon', 'ikona', 'herb',
    'chart', 'poster', 'plakat', 'portrait', 'portret', 'stamp', 'znaczek', 'sign',
    'symbol', 'building', 'budynek', 'maklowicz', 'person', 'osoba', 'poseł', 'posel',
    'minister', 'sejm', 'senat', 'parliament', 'author', 'locator', 'location', 'schema',
    'monument', 'pomnik', 'church', 'kościół', 'street', 'ulica', 'city', 'miasto',
    'town', 'politician', 'polityk', 'deputy', 'gurudwara', 'temple', 'świątynia',
    'still life', 'martwa natura', 'painting', 'obraz', 'drawing', 'rysunek',
    'oil on canvas', 'sketch', 'szkic', 'museum', 'muzeum', 'eierdoos',
  ]
  return !excluded.some((bad) => combined.includes(bad))
}

function getClientCulinarySearchQueries(title: string): string[] {
  const clean = cleanClientDishTitle(title)
  const words = clean.split(/\s+/)
  const queries: string[] = []

  const isBakery = /(?:chleb|bułk|naan|bagiet|ciast|tost|pancake|naleśnik|focaccia|pita|shokupan|chałk)/i.test(clean)
  const isPasta = /(?:makaron|pasta|spaghetti|carbonara|penne|tagliatelle|lasagn|bolognese)/i.test(clean)
  const isSoup = /(?:zupa|rosół|barszcz|krem|żur|gulasz)/i.test(clean)

  if (isBakery) {
    if (words.length > 1) queries.push(`${words[words.length - 1]} bread`)
    queries.push(`${clean} bread`)
  } else if (isPasta) {
    if (words.length > 1) queries.push(`${words[words.length - 1]} pasta`)
    queries.push(`${clean} pasta`)
  } else if (isSoup) {
    queries.push(`${clean} soup`)
  }

  queries.push(`${clean} food`)
  queries.push(`${clean} dish`)
  if (words.length > 1) {
    queries.push(`${words[words.length - 1]} food`)
    queries.push(`${words[words.length - 1]} dish`)
  }
  queries.push(clean)

  return [...new Set(queries.filter((q) => q.length >= 3))]
}

export interface WebImageCandidate {
  url: string
  thumbnail: string
  title: string
}

export async function searchFoodPhotoCandidates(
  query: string,
  limit = 4,
): Promise<WebImageCandidate[]> {
  const clean = cleanClientDishTitle(query)

  // 1. Próba przez Edge Function (DuckDuckGo / Bing Image Search)
  try {
    const res = await invokeEdgeFunction<{ images?: WebImageCandidate[] }>(
      'ai-recipe-assistant',
      {
        mode: 'search-images',
        query: clean,
        limit,
      },
      { timeoutMs: 6000 },
    )
    if (Array.isArray(res?.images) && res.images.length > 0) {
      return res.images.slice(0, limit)
    }
  } catch {
    // Fallback poniżej
  }

  // 2. Client-Side fallback przez Wikimedia Commons
  const queries = getClientCulinarySearchQueries(clean)
  const results: WebImageCandidate[] = []

  for (const q of queries) {
    if (results.length >= limit) break
    const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=6&prop=imageinfo&iiprop=url|mime&format=json&origin=*`

    try {
      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), 4000)
      const res = await fetch(searchUrl, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })
      window.clearTimeout(timer)

      if (!res.ok) continue
      const text = await res.text()
      let json: Record<string, unknown> | null = null
      try {
        json = JSON.parse(text) as Record<string, unknown>
      } catch {
        continue
      }

      const queryObj = json?.query as Record<string, unknown> | undefined
      const pages = Object.values((queryObj?.pages as Record<string, unknown>) ?? {})

      for (const p of pages) {
        if (results.length >= limit) break
        const pageRecord = p as Record<string, unknown>
        const titleStr = typeof pageRecord.title === 'string' ? pageRecord.title : ''
        const imageinfoArr = pageRecord?.imageinfo as Array<Record<string, unknown>> | undefined
        const candidateUrl = typeof imageinfoArr?.[0]?.url === 'string' ? imageinfoArr[0].url : ''
        const mime = typeof imageinfoArr?.[0]?.mime === 'string' ? imageinfoArr[0].mime : ''

        if (
          candidateUrl &&
          (!mime || mime.startsWith('image/')) &&
          isClientFoodPhotoCandidate(candidateUrl, titleStr) &&
          !results.some((r) => r.url === candidateUrl)
        ) {
          results.push({
            url: candidateUrl,
            thumbnail: candidateUrl,
            title: titleStr.replace(/^File:/i, '').replace(/\.[^.]+$/, ''),
          })
        }
      }
    } catch {
      continue
    }
  }

  if (results.length > 0) {
    return results
  }

  // 3. Ostateczny fallback: curated HD food cover
  const fallback = getClientCuratedFoodCover(clean, null)
  return [
    {
      url: fallback,
      thumbnail: fallback,
      title: clean,
    },
  ]
}

export async function rehostRecipeImage(imageUrl: string, recipeId?: string): Promise<string> {
  const safe = toSafeHttpUrl(imageUrl)
  if (!safe) throw new Error('Niepoprawny adres URL zdjęcia.')

  // Próba rehostu do Supabase Storage przez Edge Function
  try {
    const res = await invokeEdgeFunction<{ image_url?: string }>(
      'ai-recipe-assistant',
      {
        mode: 'rehost-image',
        url: safe,
        recipeId,
      },
      { timeoutMs: 8000 },
    )
    if (res?.image_url) {
      return res.image_url
    }
  } catch {}

  return safe
}

export async function resolveFoodCoverClientSide(
  title: string,
  category?: string | null,
): Promise<string> {
  const candidates = await searchFoodPhotoCandidates(title, 1)
  if (candidates.length > 0 && candidates[0].url) {
    return candidates[0].url
  }
  return getClientCuratedFoodCover(title, category)
}

/**
 * Dobiera z sieci (Google / DuckDuckGo / kulinaria) zdjęcie okładki dania.
 */
export async function generateRecipeCoverImage(payload: {
  title: string
  description?: string | null
  category?: string | null
  forceGenerate?: boolean
  signal?: AbortSignal
}): Promise<{ imageUrl: string; aiUnavailable?: boolean }> {
  const title = payload.title.trim()
  if (!title) {
    throw new Error('Podaj nazwę potrawy, aby dobrać zdjęcie.')
  }

  // 1. Próba przez backend Edge Function (Wyszukanie zdjęcia w sieci + rehosting)
  try {
    const envelope = await invokeEdgeFunction<Record<string, unknown>>(
      'ai-recipe-assistant',
      {
        mode: 'generate-image',
        title,
        description: payload.description?.trim() || undefined,
        category: payload.category?.trim() || undefined,
      },
      {
        signal: payload.signal,
        timeoutMs: 8000,
        authErrorMsg: 'Brak uprawnień do asystenta AI.',
      },
    )

    const imageUrl = toSafeHttpUrl(toNullableTrimmedString(envelope?.image_url))
    if (imageUrl) {
      return { imageUrl }
    }
  } catch (backendErr) {
    console.warn('Backend image resolver unavailable:', backendErr)
  }

  const fallback = await resolveFoodCoverClientSide(title, payload.category)
  return { imageUrl: fallback }
}

export interface RecipeEditDiffItem {
  label: string
  detail: string
  kind: 'added' | 'removed' | 'updated'
}

export interface EditRecipeWithAiResult {
  updatedFields: RecipeUpdate
  previewRecipe: RecipeRow
  changes: RecipeEditDiffItem[]
}

function formatIngredientQuantityLabel(ingredient: RecipeIngredient): string {
  const unit = ingredient.unit.trim()
  if (ingredient.amount > 0) {
    const rounded = Math.round(ingredient.amount * 100) / 100
    const amountStr = Number.isInteger(rounded) ? String(rounded) : String(rounded)
    return unit ? `${amountStr} ${unit}` : amountStr
  }
  return unit || 'według uznania'
}

function formatDiffTimerLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'brak'
  const rounded = Math.round(seconds)
  if (rounded < 60) return `${rounded} s`
  const mins = Math.floor(rounded / 60)
  const secs = rounded % 60
  return secs === 0 ? `${mins} min` : `${mins} min ${secs} s`
}

function isOrderedSubsequence(sub: string[], full: string[]): boolean {
  if (sub.length === 0) return true
  let subIdx = 0
  for (const item of full) {
    if (item === sub[subIdx]) {
      subIdx += 1
      if (subIdx === sub.length) return true
    }
  }
  return false
}

function haveSameMultiset(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((item, idx) => item === sortedB[idx])
}

/**
 * Porównuje dwa stany przepisu i buduje czytelną listę zmian po polsku
 * do wyświetlenia przed zapisaniem modyfikacji zaproponowanych przez AI.
 */
export function buildRecipeEditDiff(before: RecipeRow, after: RecipeRow): RecipeEditDiffItem[] {
  const changes: RecipeEditDiffItem[] = []

  const beforeTitle = before.title.trim()
  const afterTitle = after.title.trim()
  if (beforeTitle !== afterTitle) {
    changes.push({
      label: 'Tytuł',
      detail: `„${beforeTitle}” → „${afterTitle}”`,
      kind: 'updated',
    })
  }

  const beforeDesc = (before.description ?? '').trim()
  const afterDesc = (after.description ?? '').trim()
  if (beforeDesc !== afterDesc) {
    if (!beforeDesc && afterDesc) {
      changes.push({ label: 'Opis', detail: 'Dodano opis przepisu', kind: 'added' })
    } else if (beforeDesc && !afterDesc) {
      changes.push({ label: 'Opis', detail: 'Usunięto opis przepisu', kind: 'removed' })
    } else {
      changes.push({ label: 'Opis', detail: 'Zaktualizowano opis przepisu', kind: 'updated' })
    }
  }

  const beforeCat = (before.category ?? '').trim()
  const afterCat = (after.category ?? '').trim()
  if (beforeCat !== afterCat) {
    changes.push({
      label: 'Kategoria',
      detail: `${beforeCat || 'Brak'} → ${afterCat || 'Brak'}`,
      kind: 'updated',
    })
  }

  if ((before.servings ?? null) !== (after.servings ?? null)) {
    changes.push({
      label: 'Porcje',
      detail: `${before.servings ?? '—'} → ${after.servings ?? '—'}`,
      kind: 'updated',
    })
  }

  const beforePrep = before.prep_time_minutes ?? 0
  const afterPrep = after.prep_time_minutes ?? 0
  if (beforePrep !== afterPrep) {
    changes.push({
      label: 'Czas przygotowania',
      detail: `${beforePrep} min → ${afterPrep} min`,
      kind: 'updated',
    })
  }

  const beforeCook = before.cook_time_minutes ?? 0
  const afterCook = after.cook_time_minutes ?? 0
  if (beforeCook !== afterCook) {
    changes.push({
      label: 'Czas gotowania',
      detail: `${beforeCook} min → ${afterCook} min`,
      kind: 'updated',
    })
  }

  // Dopasowanie składników w dwóch przebiegach: najpierw (nazwa + sekcja), potem sama nazwa
  const beforePool = before.ingredients.map((ing, index) => ({
    index,
    ing,
    nameKey: ing.name.trim().toLowerCase(),
    sectionKey: (ing.category ?? '').trim().toLowerCase(),
    matched: false,
  }))
  const afterMatched = new Array<RecipeIngredient | null>(after.ingredients.length).fill(null)

  after.ingredients.forEach((afterIng, afterIdx) => {
    const nameKey = afterIng.name.trim().toLowerCase()
    const sectionKey = (afterIng.category ?? '').trim().toLowerCase()
    const exact = beforePool.find(
      (entry) => !entry.matched && entry.nameKey === nameKey && entry.sectionKey === sectionKey,
    )
    if (exact) {
      exact.matched = true
      afterMatched[afterIdx] = exact.ing
    }
  })

  after.ingredients.forEach((afterIng, afterIdx) => {
    if (afterMatched[afterIdx]) return
    const nameKey = afterIng.name.trim().toLowerCase()
    const byName = beforePool.find((entry) => !entry.matched && entry.nameKey === nameKey)
    if (byName) {
      byName.matched = true
      afterMatched[afterIdx] = byName.ing
    }
  })

  after.ingredients.forEach((afterIng, afterIdx) => {
    const prevIng = afterMatched[afterIdx]
    if (!prevIng) {
      changes.push({
        label: 'Dodano składnik',
        detail: `${afterIng.name} (${formatIngredientQuantityLabel(afterIng)})`,
        kind: 'added',
      })
      return
    }

    const amountChanged =
      prevIng.amount !== afterIng.amount || prevIng.unit.trim() !== afterIng.unit.trim()
    const prevSection = (prevIng.category ?? '').trim()
    const nextSection = (afterIng.category ?? '').trim()
    const sectionChanged = prevSection !== nextSection

    if (amountChanged || sectionChanged) {
      const parts: string[] = []
      if (amountChanged) {
        parts.push(
          `${formatIngredientQuantityLabel(prevIng)} → ${formatIngredientQuantityLabel(afterIng)}`,
        )
      }
      if (sectionChanged) {
        parts.push(`sekcja „${prevSection || 'Brak'}” → „${nextSection || 'Brak'}”`)
      }
      changes.push({
        label: 'Zmieniono składnik',
        detail: `${afterIng.name}: ${parts.join(', ')}`,
        kind: 'updated',
      })
    }
  })

  for (const entry of beforePool) {
    if (!entry.matched) {
      changes.push({
        label: 'Usunięto składnik',
        detail: `${entry.ing.name} (${formatIngredientQuantityLabel(entry.ing)})`,
        kind: 'removed',
      })
    }
  }

  // Porównanie kroków przygotowania (liczba, kolejność, treść i timery)
  const beforeTexts = before.steps.map((s) => s.instruction.trim())
  const afterTexts = after.steps.map((s) => s.instruction.trim())

  if (before.steps.length !== after.steps.length) {
    const delta = after.steps.length - before.steps.length
    changes.push({
      label: 'Liczba kroków',
      detail: `${before.steps.length} → ${after.steps.length} (${delta > 0 ? `+${delta}` : delta})`,
      kind: delta > 0 ? 'added' : 'removed',
    })

    const pureInsertion =
      afterTexts.length > beforeTexts.length && isOrderedSubsequence(beforeTexts, afterTexts)
    const pureRemoval =
      afterTexts.length < beforeTexts.length && isOrderedSubsequence(afterTexts, beforeTexts)

    if (!pureInsertion && !pureRemoval) {
      changes.push({
        label: 'Treść kroków',
        detail: 'Zaktualizowano instrukcje w krokach przygotowania',
        kind: 'updated',
      })
    }
  } else {
    const samePositionTexts = beforeTexts.every((text, idx) => text === afterTexts[idx])
    if (!samePositionTexts) {
      if (haveSameMultiset(beforeTexts, afterTexts)) {
        changes.push({
          label: 'Kolejność kroków',
          detail: 'Zmieniono kolejność kroków przygotowania',
          kind: 'updated',
        })
      } else {
        const changedStepNumbers: number[] = []
        for (let i = 0; i < after.steps.length; i += 1) {
          const prevStep = before.steps[i]
          const nextStep = after.steps[i]
          if (
            prevStep.instruction.trim() !== nextStep.instruction.trim() ||
            (prevStep.tip ?? '').trim() !== (nextStep.tip ?? '').trim()
          ) {
            changedStepNumbers.push(i + 1)
          }
        }
        if (changedStepNumbers.length > 0) {
          changes.push({
            label: 'Treść kroków',
            detail:
              changedStepNumbers.length <= 4
                ? `Zaktualizowano ${changedStepNumbers.length === 1 ? 'krok' : 'kroki'}: ${changedStepNumbers.join(', ')}`
                : `Zaktualizowano ${changedStepNumbers.length} kroków przygotowania`,
            kind: 'updated',
          })
        }
      }
    } else {
      const tipsChanged = before.steps.some(
        (step, idx) => (step.tip ?? '').trim() !== (after.steps[idx]?.tip ?? '').trim(),
      )
      if (tipsChanged) {
        changes.push({
          label: 'Wskazówki w krokach',
          detail: 'Zaktualizowano wskazówki przy krokach',
          kind: 'updated',
        })
      }
    }
  }

  if (before.steps.length === after.steps.length) {
    const timerDiffs: Array<{ stepNumber: number; prev: number; next: number }> = []
    for (let i = 0; i < after.steps.length; i += 1) {
      const prevTimer = before.steps[i]?.timer_seconds ?? 0
      const nextTimer = after.steps[i]?.timer_seconds ?? 0
      if (prevTimer !== nextTimer) {
        timerDiffs.push({ stepNumber: i + 1, prev: prevTimer, next: nextTimer })
      }
    }
    if (timerDiffs.length > 0 && timerDiffs.length <= 3) {
      for (const item of timerDiffs) {
        changes.push({
          label: `Timer w kroku ${item.stepNumber}`,
          detail: `${formatDiffTimerLabel(item.prev)} → ${formatDiffTimerLabel(item.next)}`,
          kind: item.prev === 0 ? 'added' : item.next === 0 ? 'removed' : 'updated',
        })
      }
    } else if (timerDiffs.length > 3) {
      changes.push({
        label: 'Timery w krokach',
        detail: `Zmieniono timery w ${timerDiffs.length} krokach`,
        kind: 'updated',
      })
    }
  } else {
    const beforeTimers = before.steps.map((s) => s.timer_seconds || 0).filter((t) => t > 0)
    const afterTimers = after.steps.map((s) => s.timer_seconds || 0).filter((t) => t > 0)
    const timersDiffer =
      beforeTimers.length !== afterTimers.length ||
      beforeTimers.some((t, idx) => t !== afterTimers[idx])
    if (timersDiffer) {
      changes.push({
        label: 'Timery w krokach',
        detail: 'Zaktualizowano czasy timerów w krokach',
        kind: 'updated',
      })
    }
  }

  return changes
}

/**
 * Modyfikuje istniejący przepis za pomocą Edge Function `ai-recipe-assistant` (`mode: 'edit'`),
 * zachowuje metadane źródłowe i wylicza podsumowanie zmian przed zapisem.
 */
export async function editRecipeWithAi(payload: {
  currentRecipe: RecipeRow
  userPrompt: string
  signal?: AbortSignal
}): Promise<EditRecipeWithAiResult> {
  const userPrompt = payload.userPrompt.trim()
  if (!userPrompt) {
    throw new Error('Opisz, co chcesz zmienić w przepisie.')
  }

  const envelope = await invokeEdgeFunction<Record<string, unknown>>(
    'ai-recipe-assistant',
    {
      mode: 'edit',
      userPrompt,
      currentRecipe: payload.currentRecipe,
    },
    {
      signal: payload.signal,
      timeoutMs: IMPORT_TIMEOUT_MS,
      authErrorMsg: 'Brak uprawnień do asystenta AI. Zaloguj się ponownie i spróbuj jeszcze raz.',
    },
  )

  const rawRecipe = extractRawRecipeRecord(envelope)
  const { currentRecipe } = payload

  const updatedFields: RecipeUpdate = {
    title: toNullableTrimmedString(rawRecipe.title) ?? currentRecipe.title,
    description:
      'description' in rawRecipe
        ? toNullableTrimmedString(rawRecipe.description)
        : currentRecipe.description,
    prep_time_minutes:
      'prep_time_minutes' in rawRecipe
        ? toNonNegativeInt(rawRecipe.prep_time_minutes, currentRecipe.prep_time_minutes ?? 0, 0)
        : currentRecipe.prep_time_minutes,
    cook_time_minutes:
      'cook_time_minutes' in rawRecipe
        ? toNonNegativeInt(rawRecipe.cook_time_minutes, currentRecipe.cook_time_minutes ?? 0, 0)
        : currentRecipe.cook_time_minutes,
    servings:
      'servings' in rawRecipe
        ? toNonNegativeInt(rawRecipe.servings, currentRecipe.servings ?? 2, 1)
        : currentRecipe.servings,
    category: (toNullableTrimmedString(rawRecipe.category) ??
      currentRecipe.category ??
      'Obiad') as RecipeCategory,
    tags: Array.isArray(rawRecipe.tags)
      ? normalizeTags(rawRecipe.tags)
      : (currentRecipe.tags ?? []),
    ingredients: Array.isArray(rawRecipe.ingredients)
      ? normalizeIngredients(rawRecipe.ingredients)
      : currentRecipe.ingredients,
    steps: Array.isArray(rawRecipe.steps)
      ? normalizeSteps(rawRecipe.steps)
      : currentRecipe.steps,
    nutrition:
      'nutrition' in rawRecipe
        ? normalizeNutrition(rawRecipe.nutrition)
        : currentRecipe.nutrition,
    linked_recipes:
      'linked_recipes' in rawRecipe && Array.isArray(rawRecipe.linked_recipes)
        ? rawRecipe.linked_recipes
        : currentRecipe.linked_recipes ?? [],
  }

  const previewRecipe: RecipeRow = {
    ...currentRecipe,
    title: updatedFields.title ?? currentRecipe.title,
    description: updatedFields.description ?? null,
    prep_time_minutes: updatedFields.prep_time_minutes ?? null,
    cook_time_minutes: updatedFields.cook_time_minutes ?? null,
    servings: updatedFields.servings ?? null,
    category: updatedFields.category ?? currentRecipe.category,
    tags: updatedFields.tags ?? currentRecipe.tags,
    ingredients: updatedFields.ingredients ?? currentRecipe.ingredients,
    steps: updatedFields.steps ?? currentRecipe.steps,
    nutrition: updatedFields.nutrition ?? null,
    linked_recipes: updatedFields.linked_recipes ?? currentRecipe.linked_recipes ?? [],
    // Zachowaj oryginalne metadane przepisu
    id: currentRecipe.id,
    image_url: currentRecipe.image_url,
    source_url: currentRecipe.source_url,
    source_platform: currentRecipe.source_platform,
    is_favorite: currentRecipe.is_favorite,
    created_at: currentRecipe.created_at,
    created_by: currentRecipe.created_by,
  }

  const changes = buildRecipeEditDiff(currentRecipe, previewRecipe)

  return {
    updatedFields,
    previewRecipe,
    changes,
  }
}

/**
 * Pobiera listę wszystkich przepisów posortowanych od najnowszych.
 */
export async function listRecipes(): Promise<RecipeRow[]> {
  assertSupabaseReady()

  const { data, error } = await fetchRecipes()
  if (error) {
    throw new Error(`Nie udało się pobrać przepisów: ${error.message}`)
  }
  return data ?? []
}

/**
 * Zapisuje nowy przepis w tabeli `recipes`.
 */
export async function createRecipe(payload: RecipeInsert): Promise<RecipeRow> {
  assertSupabaseReady()

  const normalizedPayload: RecipeInsert = {
    ...payload,
    title: payload.title.trim() || 'Nowy przepis',
    tags: payload.tags ?? [],
    ingredients: payload.ingredients ?? [],
    steps: payload.steps ?? [],
    is_favorite: payload.is_favorite ?? false,
    servings: payload.servings && payload.servings > 0 ? payload.servings : 2,
    linked_recipes: Array.isArray(payload.linked_recipes) ? payload.linked_recipes : [],
  }

  const { data, error } = await insertRecipe(normalizedPayload)
  if (error) {
    const errMsg = (error.message || '').toLowerCase()
    // Fallback gdyby kolumna linked_recipes nie istniała jeszcze w bazie Supabase
    if (
      normalizedPayload.linked_recipes &&
      normalizedPayload.linked_recipes.length > 0 &&
      errMsg.includes('linked_recipes') &&
      (errMsg.includes('column') || errMsg.includes('schema') || errMsg.includes('does not exist'))
    ) {
      const { linked_recipes, ...restPayload } = normalizedPayload
      const existingNutrition =
        normalizedPayload.nutrition && typeof normalizedPayload.nutrition === 'object'
          ? normalizedPayload.nutrition
          : {}
      const fallbackPayload: RecipeInsert = {
        ...restPayload,
        nutrition: {
          ...existingNutrition,
          linked_recipes,
        },
      }
      const fallbackRes = await insertRecipe(fallbackPayload)
      if (fallbackRes.error) {
        throw new Error(`Nie udało się zapisać przepisu: ${fallbackRes.error.message}`)
      }
      if (!fallbackRes.data) {
        throw new Error('Przepis został zapisany, ale baza nie zwróciła utworzonego rekordu.')
      }
      return {
        ...fallbackRes.data,
        linked_recipes: linked_recipes ?? [],
      }
    }
    throw new Error(`Nie udało się zapisać przepisu: ${error.message}`)
  }
  if (!data) {
    throw new Error('Przepis został zapisany, ale baza nie zwróciła utworzonego rekordu.')
  }
  return {
    ...data,
    linked_recipes: extractLinkedRecipes(data),
  }
}

/**
 * Częściowo aktualizuje istniejący przepis w tabeli `recipes`.
 */
export async function patchRecipe(id: string, payload: RecipeUpdate): Promise<RecipeRow> {
  assertSupabaseReady()

  const { data, error } = await updateRecipe(id, payload)
  if (error) {
    const errMsg = (error.message || '').toLowerCase()
    // Fallback gdyby kolumna linked_recipes nie istniała jeszcze w bazie Supabase
    if (
      payload.linked_recipes !== undefined &&
      errMsg.includes('linked_recipes') &&
      (errMsg.includes('column') || errMsg.includes('schema') || errMsg.includes('does not exist'))
    ) {
      const { linked_recipes, ...restPayload } = payload
      const existingNutrition =
        payload.nutrition && typeof payload.nutrition === 'object' ? payload.nutrition : {}
      const fallbackPayload: RecipeUpdate = {
        ...restPayload,
        nutrition: {
          ...existingNutrition,
          linked_recipes,
        },
      }
      const fallbackRes = await updateRecipe(id, fallbackPayload)
      if (fallbackRes.error) {
        throw new Error(`Nie udało się zaktualizować przepisu: ${fallbackRes.error.message}`)
      }
      if (!fallbackRes.data) {
        throw new Error('Nie znaleziono przepisu do aktualizacji.')
      }
      return {
        ...fallbackRes.data,
        linked_recipes: linked_recipes ?? [],
      }
    }

    throw new Error(`Nie udało się zaktualizować przepisu: ${error.message}`)
  }
  if (!data) {
    throw new Error('Nie znaleziono przepisu do aktualizacji.')
  }
  return {
    ...data,
    linked_recipes: extractLinkedRecipes(data),
  }
}

/**
 * Przełącza status ulubionego przepisu.
 */
export async function toggleFavoriteRecipe(id: string, isFavorite: boolean): Promise<RecipeRow> {
  return patchRecipe(id, { is_favorite: isFavorite })
}

/**
 * Usuwa przepis o podanym identyfikatorze.
 */
export async function deleteRecipeById(id: string): Promise<void> {
  assertSupabaseReady()

  const { error } = await supabase.from('recipes').delete().eq('id', id)
  if (error) {
    throw new Error(`Nie udało się usunąć przepisu: ${error.message}`)
  }
}

/**
 * Kompresuje nowe zdjęcie, wysyła je do Supabase Storage i zapisuje nowy `image_url` w przepisie.
 */
export async function replaceRecipeImage(id: string, file: File): Promise<RecipeRow> {
  const publicUrl = await uploadRecipeImage(file)
  return patchRecipe(id, { image_url: publicUrl })
}

/**
 * Przelicza ilość składnika proporcjonalnie do docelowej liczby porcji.
 */
export function scaleIngredientAmount(
  amount: number,
  baseServings: number,
  targetServings: number,
): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  if (!Number.isFinite(targetServings) || targetServings <= 0) return 0
  if (!Number.isFinite(baseServings) || baseServings <= 0) {
    return Math.round(amount * 1000) / 1000
  }

  const scaled = (amount * targetServings) / baseServings
  return Math.round(scaled * 1000) / 1000
}

/**
 * Formatuje przeliczoną ilość składnika w sposób czytelny w kuchni (zaokrąglenie do 1 miejsca, bez zbędnych zer).
 */
export function formatScaledAmount(
  amount: number,
  baseServings: number,
  targetServings: number,
): string {
  const scaled = scaleIngredientAmount(amount, baseServings, targetServings)
  if (scaled <= 0) return '0'

  const rounded = Math.round(scaled * 10) / 10
  if (rounded === 0) {
    return '0.1'
  }

  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(/\.0$/, '')
}

export interface IngredientSectionGroup {
  section: string | null
  items: RecipeIngredient[]
}

/**
 * Grupuje składniki według nazwy sekcji (`category`, np. „Zaparka”, „Ciasto”, „Farsz”)
 * z zachowaniem kolejności występowania w przepisie.
 */
export function groupIngredientsBySection(
  ingredients: RecipeIngredient[],
): IngredientSectionGroup[] {
  if (ingredients.length === 0) return []

  const groups: Array<{ key: string; section: string | null; items: RecipeIngredient[] }> = []
  const byKey = new Map<string, number>()
  let hasNamedSections = false

  for (const ing of ingredients) {
    const cleaned = typeof ing.category === 'string' ? ing.category.trim().replace(/:+$/, '') : ''
    const section = cleaned.length > 0 ? cleaned : null
    if (section) hasNamedSections = true

    const key = section ? section.toLowerCase() : '__none__'
    const existingIndex = byKey.get(key)
    if (existingIndex !== undefined) {
      groups[existingIndex].items.push(ing)
    } else {
      byKey.set(key, groups.length)
      groups.push({ key, section, items: [ing] })
    }
  }

  if (!hasNamedSections) {
    return [{ section: null, items: ingredients }]
  }

  return groups.map((group) => ({
    section: group.section ?? 'Pozostałe',
    items: group.items,
  }))
}
