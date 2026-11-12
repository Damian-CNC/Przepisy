import { useEffect, useRef, useState } from 'react'

export interface UseWakeLockResult {
  /** Whether the browser supports the Screen Wake Lock API. */
  isSupported: boolean
  /** Whether a screen wake lock is currently active. */
  isActive: boolean
  /** Localized error message if acquiring the wake lock failed. */
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
 * Automatically acquires and maintains a Screen Wake Lock while `enabled` is true.
 * Re-requests the lock when the tab becomes visible again and releases it on disable or unmount.
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
        // Ignore release errors when the browser already invalidated the sentinel
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

    void requestLock()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      void releaseCurrentSentinel()
    }
  }, [enabled, isSupported])

  return {
    isSupported,
    isActive: enabled && isSupported ? isActive : false,
    error: enabled && isSupported ? error : null,
  }
}
