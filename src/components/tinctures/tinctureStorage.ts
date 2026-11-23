import type { TinctureFruitId } from './tincturePresets'

export type TinctureSugarProfiles = Record<TinctureFruitId, number>

export const DEFAULT_SUGAR_PROFILES: TinctureSugarProfiles = {
  malina: 300,
  cytryna: 380,
  wisnia: 350,
  wlasna: 300,
}

const STORAGE_KEY = 'nasze-przepisy:tincture-sugar-profiles'

export function loadTinctureSugarProfiles(): TinctureSugarProfiles {
  if (typeof window === 'undefined') return DEFAULT_SUGAR_PROFILES
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SUGAR_PROFILES
    const parsed = JSON.parse(raw) as Partial<TinctureSugarProfiles>
    return {
      malina: typeof parsed.malina === 'number' ? parsed.malina : DEFAULT_SUGAR_PROFILES.malina,
      cytryna: typeof parsed.cytryna === 'number' ? parsed.cytryna : DEFAULT_SUGAR_PROFILES.cytryna,
      wisnia: typeof parsed.wisnia === 'number' ? parsed.wisnia : DEFAULT_SUGAR_PROFILES.wisnia,
      wlasna: typeof parsed.wlasna === 'number' ? parsed.wlasna : DEFAULT_SUGAR_PROFILES.wlasna,
    }
  } catch {
    return DEFAULT_SUGAR_PROFILES
  }
}

export function saveTinctureSugarProfiles(profiles: TinctureSugarProfiles): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
  } catch {}
}
