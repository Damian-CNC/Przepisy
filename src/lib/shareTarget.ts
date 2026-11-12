export interface SharedImportPayload {
  url: string
  rawText: string
  title: string
}

const PENDING_SHARE_STORAGE_KEY = 'nasze-przepisy:pending-share'
const URL_IN_TEXT_REGEX = /(https?:\/\/[^\s]+)/g
const TRAILING_PUNCTUATION_REGEX = /[.,)!?'">]+$/

let inMemoryPendingShare: SharedImportPayload | null = null

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
 * Zapisuje udostępniony link lub tekst w `sessionStorage`, aby przetrwał logowanie.
 */
export function savePendingSharePayload(payload: SharedImportPayload): void {
  inMemoryPendingShare = payload
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(PENDING_SHARE_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Ignorujemy błąd zapisu w trybie prywatnym lub przy blokadzie storage
  }
}

/**
 * Odczytuje i jednorazowo usuwa zapisany ładunek udostępniania z `sessionStorage`.
 */
export function consumePendingSharePayload(): SharedImportPayload | null {
  const memoryFallback = inMemoryPendingShare
  inMemoryPendingShare = null

  if (typeof window === 'undefined') return memoryFallback
  try {
    const raw = window.sessionStorage.getItem(PENDING_SHARE_STORAGE_KEY)
    if (!raw) return memoryFallback
    window.sessionStorage.removeItem(PENDING_SHARE_STORAGE_KEY)

    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return memoryFallback

    const record = parsed as Record<string, unknown>
    const url = typeof record.url === 'string' ? record.url.trim() : ''
    const rawText = typeof record.rawText === 'string' ? record.rawText.trim() : ''
    const title = typeof record.title === 'string' ? record.title.trim() : ''

    if (!url && !rawText && !title) return memoryFallback

    return { url, rawText, title }
  } catch {
    return memoryFallback
  }
}
