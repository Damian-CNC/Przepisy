export interface SharedImportPayload {
  url: string
  rawText: string
  title: string
}

interface StoredPendingShare {
  payload: SharedImportPayload
  savedAt: number
}

const PENDING_SHARE_STORAGE_KEY = 'nasze-przepisy:pending-share'
const PENDING_SHARE_TTL_MS = 15 * 60 * 1000
const URL_IN_TEXT_REGEX = /(https?:\/\/[^\s]+)/g
const TRAILING_PUNCTUATION_REGEX = /[.,)!?'">]+$/

let inMemoryPendingShare: StoredPendingShare | null = null

function extractValidHttpUrl(source: string): { url: string; rawMatch: string } | null {
  if (!source.trim()) return null

  const matches = source.matchAll(URL_IN_TEXT_REGEX)
  for (const match of matches) {
    const rawMatch = match[0]
    const cleaned = rawMatch.replace(TRAILING_PUNCTUATION_REGEX, '')
    if (!cleaned) continue

    try {
      const parsed = new URL(cleaned)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return { url: parsed.toString(), rawMatch }
      }
    } catch {
      // Pomijamy niepoprawny fragment i sprawdzamy kolejne dopasowanie
    }
  }

  return null
}

function normalizePayload(raw: unknown): SharedImportPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const url = typeof record.url === 'string' ? record.url.trim() : ''
  const rawText = typeof record.rawText === 'string' ? record.rawText.trim() : ''
  const title = typeof record.title === 'string' ? record.title.trim() : ''
  if (!url && !rawText && !title) return null
  return { url, rawText, title }
}

/**
 * Odczytuje parametry Web Share Target API (`shared_url`, `shared_text`, `shared_title`)
 * oraz Skrótu iOS (`importUrl`) z adresu URL aplikacji.
 */
export function parseShareTargetParams(search: string): SharedImportPayload | null {
  if (!search || search === '?') return null

  const params = new URLSearchParams(search)
  const importUrl = (params.get('importUrl') ?? '').trim()
  const sharedUrl = (params.get('shared_url') ?? '').trim()
  const sharedText = (params.get('shared_text') ?? '').trim()
  const sharedTitle = (params.get('shared_title') ?? '').trim()

  if (!importUrl && !sharedUrl && !sharedText && !sharedTitle) {
    return null
  }

  const extractedFromImportUrl = extractValidHttpUrl(importUrl)
  const extractedFromSharedUrl = extractValidHttpUrl(sharedUrl)
  const extractedFromSharedText = extractValidHttpUrl(sharedText)

  const matched =
    extractedFromImportUrl ?? extractedFromSharedUrl ?? extractedFromSharedText

  if (matched) {
    const remainingText = sharedText
      ? sharedText
          .replace(matched.rawMatch, '')
          .replace(matched.url, '')
          .trim()
      : ''

    return {
      url: matched.url,
      rawText: remainingText,
      title: sharedTitle,
    }
  }

  const combinedText =
    sharedText && sharedTitle
      ? sharedText.includes(sharedTitle)
        ? sharedText
        : `${sharedTitle}\n${sharedText}`
      : sharedText || sharedTitle

  if (!combinedText) {
    return null
  }

  return {
    url: '',
    rawText: combinedText,
    title: sharedTitle,
  }
}

/**
 * Zapisuje udostępniony link lub tekst w `localStorage` (ważny 15 minut),
 * aby przetrwał logowanie w Safari lub przekierowanie z Magic Linka.
 */
export function savePendingSharePayload(payload: SharedImportPayload): void {
  const entry: StoredPendingShare = { payload, savedAt: Date.now() }
  inMemoryPendingShare = entry
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PENDING_SHARE_STORAGE_KEY, JSON.stringify(entry))
  } catch {
    // Ignorujemy błąd zapisu w trybie prywatnym lub przy blokadzie storage
  }
}

function readStoredEntry(): StoredPendingShare | null {
  if (typeof window === 'undefined') return inMemoryPendingShare

  try {
    const raw = window.localStorage.getItem(PENDING_SHARE_STORAGE_KEY)
    if (!raw) return inMemoryPendingShare

    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return inMemoryPendingShare

    const record = parsed as Record<string, unknown>
    const savedAt = typeof record.savedAt === 'number' ? record.savedAt : Date.now()
    if (Date.now() - savedAt > PENDING_SHARE_TTL_MS) {
      window.localStorage.removeItem(PENDING_SHARE_STORAGE_KEY)
      return null
    }

    const payload = normalizePayload(record.payload ?? parsed)
    if (!payload) return inMemoryPendingShare

    return { payload, savedAt }
  } catch {
    return inMemoryPendingShare
  }
}

/**
 * Sprawdza bez usuwania, czy w pamięci oczekuje przepis do automatycznego importu po zalogowaniu.
 */
export function peekPendingSharePayload(): SharedImportPayload | null {
  const entry = readStoredEntry()
  if (!entry) return null
  if (Date.now() - entry.savedAt > PENDING_SHARE_TTL_MS) return null
  return entry.payload
}

/**
 * Odczytuje i jednorazowo usuwa zapisany ładunek udostępniania.
 */
export function consumePendingSharePayload(): SharedImportPayload | null {
  const entry = readStoredEntry()
  inMemoryPendingShare = null

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(PENDING_SHARE_STORAGE_KEY)
    } catch {
      // Ignorujemy błąd czyszczenia storage
    }
  }

  if (!entry) return null
  if (Date.now() - entry.savedAt > PENDING_SHARE_TTL_MS) return null
  return entry.payload
}
