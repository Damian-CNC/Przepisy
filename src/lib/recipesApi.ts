import { uploadRecipeImage } from './imageCompression'
import {
  fetchRecipes,
  getSupabasePublicConfig,
  insertRecipe,
  isSupabaseConfigured,
  supabase,
  updateRecipe,
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

function normalizeIngredients(raw: unknown): RecipeIngredient[] {
  if (!Array.isArray(raw)) return []
  const result: RecipeIngredient[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const name = toNullableTrimmedString(record.name)
    if (!name) continue
    const amount = Math.max(0, toFiniteNumber(record.amount, 0))
    const unit = typeof record.unit === 'string' ? record.unit.trim() : ''
    const category = toNullableTrimmedString(record.category)

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
    const amount = Math.max(0, toFiniteNumber(record.amount, 0))
    const unit = typeof record.unit === 'string' ? record.unit.trim() : ''
    result.push({ name, amount, unit })
  }
  return result
}

function normalizeSteps(raw: unknown): RecipeStep[] {
  if (!Array.isArray(raw)) return []
  const normalized: RecipeStep[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const instruction = toNullableTrimmedString(record.instruction)
    if (!instruction) continue

    const stepNumber = toNonNegativeInt(record.step_number, normalized.length + 1, 1)
    const timerSeconds = toNonNegativeInt(record.timer_seconds, 0, 0)
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

const IMPORT_TIMEOUT_MS = 45_000

/**
 * Wywołuje Edge Function `import-recipe` z twardym limitem czasu 45 s oraz obsługą
 * anulowania (`AbortSignal`) i normalizuje wynik do bezpiecznego obiektu `RecipeInsert`.
 */
export async function importRecipeWithAi(payload: ImportRecipePayload): Promise<RecipeInsert> {
  assertSupabaseReady()

  const trimmedPayload = {
    url: payload.url?.trim() || undefined,
    rawText: payload.rawText?.trim() || undefined,
    imageBase64: payload.imageBase64?.trim() || undefined,
    mimeType: payload.mimeType?.trim() || undefined,
  }

  if (!trimmedPayload.url && !trimmedPayload.rawText && !trimmedPayload.imageBase64) {
    throw new Error('Podaj link do przepisu, tekst albo wybierz zdjęcie potrawy.')
  }

  const { url: supabaseUrl, anonKey } = getSupabasePublicConfig()
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token

  const controller = new AbortController()
  let timedOut = false

  const onExternalAbort = () => controller.abort()
  if (payload.signal) {
    if (payload.signal.aborted) {
      throw new Error('Analiza została przerwana.')
    }
    payload.signal.addEventListener('abort', onExternalAbort, { once: true })
  }

  const timeoutId = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, IMPORT_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/functions/v1/import-recipe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(trimmedPayload),
      signal: controller.signal,
    })
  } catch (err) {
    if (timedOut) {
      throw new Error(
        'Przetwarzanie trwało zbyt długo (ponad 45 s). Wklej opis rolki ręcznie poniżej lub użyj zakładki „Ze zdjęcia / Zrzutu”.',
      )
    }
    if (payload.signal?.aborted) {
      throw new Error('Analiza została anulowana.')
    }
    throw new Error(
      err instanceof Error && err.message
        ? `Błąd połączenia z serwerem AI: ${err.message}`
        : 'Błąd połączenia z serwerem AI.',
    )
  } finally {
    window.clearTimeout(timeoutId)
    payload.signal?.removeEventListener('abort', onExternalAbort)
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
      throw new Error('Brak uprawnień do importu AI. Zaloguj się ponownie i spróbuj jeszcze raz.')
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

  const rawRecipe =
    envelope.recipe && typeof envelope.recipe === 'object'
      ? (envelope.recipe as Record<string, unknown>)
      : envelope

  const title = toNullableTrimmedString(rawRecipe.title) ?? 'Nowy przepis'
  const category = (toNullableTrimmedString(rawRecipe.category) ?? 'Obiad') as RecipeCategory

  return {
    title,
    description: toNullableTrimmedString(rawRecipe.description),
    source_url: toNullableTrimmedString(rawRecipe.source_url) ?? trimmedPayload.url ?? null,
    source_platform: inferSourcePlatform(rawRecipe.source_platform, trimmedPayload),
    image_url: toNullableTrimmedString(rawRecipe.image_url),
    prep_time_minutes: toNonNegativeInt(rawRecipe.prep_time_minutes, 0, 0),
    cook_time_minutes: toNonNegativeInt(rawRecipe.cook_time_minutes, 0, 0),
    servings: toNonNegativeInt(rawRecipe.servings, 2, 1),
    category,
    tags: normalizeTags(rawRecipe.tags),
    is_favorite: false,
    ingredients: normalizeIngredients(rawRecipe.ingredients),
    steps: normalizeSteps(rawRecipe.steps),
    nutrition: normalizeNutrition(rawRecipe.nutrition),
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
  }

  const { data, error } = await insertRecipe(normalizedPayload)
  if (error) {
    throw new Error(`Nie udało się zapisać przepisu: ${error.message}`)
  }
  if (!data) {
    throw new Error('Przepis został zapisany, ale baza nie zwróciła utworzonego rekordu.')
  }
  return data
}

/**
 * Częściowo aktualizuje istniejący przepis w tabeli `recipes`.
 */
export async function patchRecipe(id: string, payload: RecipeUpdate): Promise<RecipeRow> {
  assertSupabaseReady()

  const { data, error } = await updateRecipe(id, payload)
  if (error) {
    throw new Error(`Nie udało się zaktualizować przepisu: ${error.message}`)
  }
  if (!data) {
    throw new Error('Nie znaleziono przepisu do aktualizacji.')
  }
  return data
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
