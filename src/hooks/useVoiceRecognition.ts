import { useCallback, useEffect, useRef, useState } from 'react'

interface SpeechRecognitionAlternativeLike {
  readonly transcript: string
  readonly confidence: number
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean
  readonly length: number
  item(index: number): SpeechRecognitionAlternativeLike
  readonly [index: number]: SpeechRecognitionAlternativeLike
}

interface SpeechRecognitionResultListLike {
  readonly length: number
  item(index: number): SpeechRecognitionResultLike
  readonly [index: number]: SpeechRecognitionResultLike
}

interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultListLike
}

interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string
  readonly message?: string
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  onstart: ((event: Event) => void) | null
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: ((event: Event) => void) | null
  start(): void
  stop(): void
  abort(): void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

interface SpeechRecognitionWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

export interface UseVoiceRecognitionOptions {
  lang?: string
  interimResults?: boolean
  continuous?: boolean
  onFinalResult?: (text: string) => void
}

export interface UseVoiceRecognitionResult {
  isSupported: boolean
  isListening: boolean
  transcript: string
  interimTranscript: string
  error: string | null
  startListening: () => void
  stopListening: () => void
  resetTranscript: () => void
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const win = window as SpeechRecognitionWindow
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null
}

function mapSpeechRecognitionError(code: string): string | null {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Brak dostępu do mikrofonu. Zezwól na dostęp w ustawieniach przeglądarki.'
    case 'no-speech':
      return 'Nie wykryto mowy. Spróbuj powiedzieć jeszcze raz.'
    case 'audio-capture':
      return 'Nie znaleziono mikrofonu lub jest on używany przez inną aplikację.'
    case 'network':
      return 'Błąd sieci podczas rozpoznawania mowy. Sprawdź połączenie z internetem.'
    case 'language-not-supported':
      return 'Wybrany język nie jest obsługiwany przez rozpoznawanie mowy w tej przeglądarce.'
    case 'aborted':
      return null
    default:
      return 'Nie udało się rozpoznać mowy. Spróbuj ponownie.'
  }
}

/**
 * Opakowuje natywne Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`)
 * z obsługą języka polskiego, transkrypcją na żywo i bezpiecznym fallbackiem.
 */
export function useVoiceRecognition(
  options?: UseVoiceRecognitionOptions,
): UseVoiceRecognitionResult {
  const lang = options?.lang ?? 'pl-PL'
  const interimResults = options?.interimResults ?? true
  const continuous = options?.continuous ?? false

  const [isSupported] = useState<boolean>(() => getSpeechRecognitionConstructor() !== null)
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const onFinalResultRef = useRef<((text: string) => void) | undefined>(options?.onFinalResult)
  const isUnmountedRef = useRef(false)

  useEffect(() => {
    onFinalResultRef.current = options?.onFinalResult
  }, [options?.onFinalResult])

  useEffect(() => {
    isUnmountedRef.current = false
    return () => {
      isUnmountedRef.current = true
      const instance = recognitionRef.current
      recognitionRef.current = null
      if (instance) {
        instance.onstart = null
        instance.onresult = null
        instance.onerror = null
        instance.onend = null
        try {
          instance.abort()
        } catch {
          // Ignore errors if recognition already ended
        }
      }
    }
  }, [])

  const stopListening = useCallback(() => {
    const instance = recognitionRef.current
    if (!instance) {
      setIsListening(false)
      return
    }
    try {
      instance.stop()
    } catch {
      // Ignore if already stopped
    }
    setIsListening(false)
  }, [])

  const resetTranscript = useCallback(() => {
    setTranscript('')
    setInterimTranscript('')
    setError(null)
  }, [])

  const startListening = useCallback(() => {
    const RecognitionCtor = getSpeechRecognitionConstructor()
    if (!RecognitionCtor) {
      setError('Twoja przeglądarka nie obsługuje rozpoznawania mowy.')
      return
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort()
      } catch {
        // Ignore abort errors before starting a new session
      }
      recognitionRef.current = null
    }

    setError(null)
    setInterimTranscript('')

    const recognition = new RecognitionCtor()
    recognition.lang = lang
    recognition.interimResults = interimResults
    recognition.continuous = continuous
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      if (isUnmountedRef.current) return
      setIsListening(true)
    }

    recognition.onresult = (event) => {
      if (isUnmountedRef.current) return

      let finalPart = ''
      let interimPart = ''

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        const alt = result?.[0]
        const chunk = alt?.transcript ?? ''
        if (!chunk) continue

        if (result.isFinal) {
          finalPart += `${chunk} `
        } else {
          interimPart += `${chunk} `
        }
      }

      const cleanedInterim = interimPart.trim()
      setInterimTranscript(cleanedInterim)

      const cleanedFinal = finalPart.trim()
      if (cleanedFinal) {
        setTranscript((prev) => (prev ? `${prev} ${cleanedFinal}` : cleanedFinal))
        setInterimTranscript('')
        onFinalResultRef.current?.(cleanedFinal)
      }
    }

    recognition.onerror = (event) => {
      if (isUnmountedRef.current) return
      const mapped = mapSpeechRecognitionError(event.error)
      if (mapped) {
        setError(mapped)
      }
      setIsListening(false)
      setInterimTranscript('')
    }

    recognition.onend = () => {
      if (isUnmountedRef.current) return
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null
      }
      setIsListening(false)
      setInterimTranscript('')
    }

    recognitionRef.current = recognition

    try {
      recognition.start()
    } catch (err) {
      recognitionRef.current = null
      setIsListening(false)
      setError(
        err instanceof Error && err.message
          ? `Nie udało się uruchomić mikrofonu: ${err.message}`
          : 'Nie udało się uruchomić rozpoznawania mowy.',
      )
    }
  }, [continuous, interimResults, lang])

  return {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    error,
    startListening,
    stopListening,
    resetTranscript,
  }
}
