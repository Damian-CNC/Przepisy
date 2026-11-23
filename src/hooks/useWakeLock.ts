import { useEffect, useRef, useState } from 'react'

export interface UseWakeLockResult {
  /** Czy przeglądarka obsługuje Screen Wake Lock API. */
  isSupported: boolean
  /** Czy blokada wygaszania ekranu jest aktualnie aktywna. */
  isActive: boolean
  /** Komunikat błędu, jeśli nie udało się uzyskać blokady. */
  error: string | null
}

function checkWakeLockSupport(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'wakeLock' in navigator &&
    typeof navigator.wakeLock?.request === 'function'
  )
}

/**
 * Automatycznie blokuje wygaszanie ekranu, gdy `enabled` jest true.
 * Odnawia blokadę przy powrocie do aplikacji oraz po dowolnej interakcji użytkownika
 * (rozwiązanie dla polityki iOS Safari wymagającej gestu użytkownika).
 */
export function useWakeLock(enabled: boolean): UseWakeLockResult {
  const isSupported = checkWakeLockSupport()
  const [isActive, setIsActive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sentinelRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    if (!enabled || !isSupported) {
      return
    }

    let cancelled = false

    const handleSentinelRelease = () => {
      if (cancelled) return
      sentinelRef.current = null
      setIsActive(false)
    }

    const releaseCurrentSentinel = async () => {
      const sentinel = sentinelRef.current
      sentinelRef.current = null
      if (!sentinel) return

      sentinel.removeEventListener('release', handleSentinelRelease)
      try {
        if (!sentinel.released) {
          await sentinel.release()
        }
      } catch {
        // Ignoruj błędy, jeśli przeglądarka unieważniła wskaźnik
      }
      if (!cancelled) {
        setIsActive(false)
      }
    }

    const requestLock = async () => {
      if (cancelled) return
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return
      }
      if (sentinelRef.current && !sentinelRef.current.released) {
        setIsActive(true)
        return
      }

      try {
        const sentinel = await navigator.wakeLock.request('screen')

        if (cancelled) {
          if (!sentinel.released) {
            await sentinel.release().catch(() => undefined)
          }
          return
        }

        sentinel.addEventListener('release', handleSentinelRelease, { once: true })
        sentinelRef.current = sentinel
        setIsActive(!sentinel.released)
        setError(null)
      } catch (err) {
        if (cancelled) return
        setIsActive(false)
        setError(
          err instanceof Error && err.message
            ? err.message
            : 'Nie udało się zablokować wygaszania ekranu.',
        )
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void requestLock()
      }
    }

    // Wymuszenie ponownego uzyskania blokady po geście użytkownika (np. na iOS Safari)
    const handleUserGesture = () => {
      if (!sentinelRef.current || sentinelRef.current.released) {
        void requestLock()
      }
    }

    void requestLock()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pointerdown', handleUserGesture, { passive: true })
    window.addEventListener('touchstart', handleUserGesture, { passive: true })
    window.addEventListener('keydown', handleUserGesture, { passive: true })

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pointerdown', handleUserGesture)
      window.removeEventListener('touchstart', handleUserGesture)
      window.removeEventListener('keydown', handleUserGesture)
      void releaseCurrentSentinel()
    }
  }, [enabled, isSupported])

  return {
    isSupported,
    isActive: enabled && isSupported ? isActive : false,
    error: enabled && isSupported ? error : null,
  }
}
