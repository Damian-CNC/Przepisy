import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type SourcePlatform = 'instagram' | 'web' | 'photo' | 'manual'

export type RecipeCategory =
  | 'Śniadanie'
  | 'Obiad'
  | 'Kolacja'
  | 'Deser'
  | 'Przekąska'
  | 'Napój'
  | 'Wypieki'
  | (string & {})

export type RecipeIngredient = {
  name: string
  amount: number
  unit: string
  category?: string
}

export type StepIngredient = {
  name: string
  amount: number
  unit: string
}

export type RecipeStep = {
  step_number: number
  instruction: string
  step_ingredients: StepIngredient[]
  timer_seconds: number
  tip?: string | null
}

export type RecipeNutrition = Record<string, number | string> | null

export type RecipeRow = {
  id: string
  created_at: string
  updated_at: string
  title: string
  description: string | null
  source_url: string | null
  source_platform: SourcePlatform | null
  image_url: string | null
  prep_time_minutes: number | null
  cook_time_minutes: number | null
  servings: number | null
  category: RecipeCategory | null
  tags: string[] | null
  is_favorite: boolean | null
  ingredients: RecipeIngredient[]
  steps: RecipeStep[]
  nutrition: RecipeNutrition
  created_by: string | null
}

export type RecipeInsert = {
  id?: string
  created_at?: string
  updated_at?: string
  title: string
  description?: string | null
  source_url?: string | null
  source_platform?: SourcePlatform | null
  image_url?: string | null
  prep_time_minutes?: number | null
  cook_time_minutes?: number | null
  servings?: number | null
  category?: RecipeCategory | null
  tags?: string[] | null
  is_favorite?: boolean | null
  ingredients?: RecipeIngredient[]
  steps?: RecipeStep[]
  nutrition?: RecipeNutrition
  created_by?: string | null
}

export type RecipeUpdate = Partial<RecipeInsert>

export type Database = {
  public: {
    Tables: {
      recipes: {
        Row: RecipeRow
        Insert: RecipeInsert
        Update: RecipeUpdate
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export const RECIPE_IMAGES_BUCKET = 'recipe-images'

function readEnvValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

const supabaseUrl = readEnvValue(import.meta.env.VITE_SUPABASE_URL)
const supabaseAnonKey =
  readEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY) ||
  readEnvValue(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)

export function isSupabaseConfigured(): boolean {
  return /^https?:\/\//i.test(supabaseUrl) && supabaseAnonKey.length > 0
}

const FALLBACK_SUPABASE_URL = 'https://placeholder.supabase.co'
const FALLBACK_SUPABASE_KEY = 'sb_publishable_placeholder'

export const supabase: SupabaseClient<Database> = createClient<Database>(
  isSupabaseConfigured() ? supabaseUrl : FALLBACK_SUPABASE_URL,
  isSupabaseConfigured() ? supabaseAnonKey : FALLBACK_SUPABASE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)

export type SupabaseConnectionStatus = {
  ok: boolean
  configured: boolean
  latencyMs: number
  error?: string
}

/**
 * Lekki ping diagnostyczny do tabeli `recipes` (wykorzystuje politykę RLS `Keep alive ping`).
 */
export async function checkSupabaseConnection(): Promise<SupabaseConnectionStatus> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      configured: false,
      latencyMs: 0,
      error: 'Brak konfiguracji VITE_SUPABASE_URL lub VITE_SUPABASE_ANON_KEY.',
    }
  }

  const startedAt = performance.now()

  try {
    const { error } = await supabase.from('recipes').select('id').limit(1)
    const latencyMs = Math.round(performance.now() - startedAt)

    if (error) {
      return {
        ok: false,
        configured: true,
        latencyMs,
        error: error.message,
      }
    }

    return {
      ok: true,
      configured: true,
      latencyMs,
    }
  } catch (err) {
    const latencyMs = Math.round(performance.now() - startedAt)
    return {
      ok: false,
      configured: true,
      latencyMs,
      error: err instanceof Error ? err.message : 'Nieznany błąd połączenia z Supabase.',
    }
  }
}

/**
 * Typowane helpery CRUD weryfikujące poprawne wnioskowanie typów (`RecipeRow`, nie `never`)
 * w `@supabase/supabase-js` v2.119+.
 */
export async function fetchRecipes() {
  return supabase
    .from('recipes')
    .select('*')
    .order('created_at', { ascending: false })
}

export async function insertRecipe(payload: RecipeInsert) {
  return supabase.from('recipes').insert(payload).select('*').single()
}

export async function updateRecipe(id: string, payload: RecipeUpdate) {
  return supabase.from('recipes').update(payload).eq('id', id).select('*').single()
}
