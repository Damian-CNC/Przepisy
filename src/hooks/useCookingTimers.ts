import { useCallback, useEffect, useRef, useState } from 'react'
import { playTimerDoneChime, unlockCookingAudio } from '../lib/cookingAudio'

export type CookingTimerStatus = 'idle' | 'running' | 'paused' | 'finished'

export interface CookingTimer {
  id: string
  stepIndex: number
  stepNumber: number
  label: string
  initialSeconds: number
  remainingSeconds: number
  status: CookingTimerStatus
  endTimestampMs: number | null
}

export interface UseCookingTimersResult {
  timers: CookingTimer[]
  startTimer: (
    stepIndex: number,
    stepNumber: number,
    label: string,
    durationSeconds: number,
  ) => void
  pauseTimer: (id: string) => void
  resumeTimer: (id: string) => void
  addMinute: (id: string) => void
  resetTimer: (id: string) => void
  dismissTimer: (id: string) => void
  clearAllTimers: () => void
}

function buildTimerId(stepIndex: number): string {
  return `step-${stepIndex}`
}

function computeRemainingSeconds(endTimestampMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((endTimestampMs - nowMs) / 1000))
}

/**
 * Manages multiple concurrent step-linked kitchen timers using wall-clock `endTimestampMs`
 * so countdowns stay accurate even when the browser throttles background timers.
 */
export function useCookingTimers(): UseCookingTimersResult {
  const [timers, setTimers] = useState<CookingTimer[]>([])
  const notifiedFinishedIdsRef = useRef<Set<string>>(new Set())

  const syncTimersWithClock = useCallback(() => {
    const now = Date.now()
    setTimers((prev) => {
      let changed = false
      const next = prev.map((timer) => {
        if (timer.status !== 'running' || timer.endTimestampMs === null) {
          return timer
        }

        const remaining = computeRemainingSeconds(timer.endTimestampMs, now)
        if (remaining <= 0) {
          changed = true
          return {
            ...timer,
            remainingSeconds: 0,
            status: 'finished' as const,
            endTimestampMs: null,
          }
        }

        if (remaining !== timer.remainingSeconds) {
          changed = true
          return {
            ...timer,
            remainingSeconds: remaining,
          }
        }

        return timer
      })

      return changed ? next : prev
    })
  }, [])

  const hasRunningTimers = timers.some((timer) => timer.status === 'running')

  useEffect(() => {
    if (!hasRunningTimers) return

    const intervalId = window.setInterval(syncTimersWithClock, 250)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncTimersWithClock()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [hasRunningTimers, syncTimersWithClock])

  // Play chime once per transition into 'finished' (StrictMode-safe outside state updaters)
  useEffect(() => {
    const activeIds = new Set(timers.map((timer) => timer.id))

    for (const knownId of notifiedFinishedIdsRef.current) {
      if (!activeIds.has(knownId)) {
        notifiedFinishedIdsRef.current.delete(knownId)
      }
    }

    let shouldChime = false
    for (const timer of timers) {
      if (timer.status === 'finished') {
        if (!notifiedFinishedIdsRef.current.has(timer.id)) {
          notifiedFinishedIdsRef.current.add(timer.id)
          shouldChime = true
        }
      } else {
        notifiedFinishedIdsRef.current.delete(timer.id)
      }
    }

    if (shouldChime) {
      playTimerDoneChime()
    }
  }, [timers])

  const startTimer = useCallback(
    (stepIndex: number, stepNumber: number, label: string, durationSeconds: number) => {
      const safeDuration = Math.max(1, Math.round(durationSeconds))
      unlockCookingAudio()

      const id = buildTimerId(stepIndex)
      const now = Date.now()
      const endTimestampMs = now + safeDuration * 1000
      const cleanLabel = label.trim() || `Krok ${stepNumber}`

      setTimers((prev) => {
        const existingIndex = prev.findIndex((timer) => timer.id === id)
        const nextTimer: CookingTimer = {
          id,
          stepIndex,
          stepNumber,
          label: cleanLabel,
          initialSeconds: safeDuration,
          remainingSeconds: safeDuration,
          status: 'running',
          endTimestampMs,
        }

        if (existingIndex === -1) {
          return [...prev, nextTimer]
        }

        return prev.map((item, idx) => (idx === existingIndex ? nextTimer : item))
      })
    },
    [],
  )

  const pauseTimer = useCallback((id: string) => {
    const now = Date.now()
    setTimers((prev) =>
      prev.map((timer) => {
        if (timer.id !== id || timer.status !== 'running') return timer
        const remaining =
          timer.endTimestampMs !== null
            ? computeRemainingSeconds(timer.endTimestampMs, now)
            : timer.remainingSeconds

        if (remaining <= 0) {
          return {
            ...timer,
            remainingSeconds: 0,
            status: 'finished',
            endTimestampMs: null,
          }
        }

        return {
          ...timer,
          remainingSeconds: remaining,
          status: 'paused',
          endTimestampMs: null,
        }
      }),
    )
  }, [])

  const resumeTimer = useCallback((id: string) => {
    unlockCookingAudio()
    const now = Date.now()

    setTimers((prev) =>
      prev.map((timer) => {
        if (timer.id !== id) return timer
        if (timer.status !== 'paused' && timer.status !== 'idle') return timer
        const remaining = Math.max(1, timer.remainingSeconds)
        return {
          ...timer,
          remainingSeconds: remaining,
          status: 'running',
          endTimestampMs: now + remaining * 1000,
        }
      }),
    )
  }, [])

  const addMinute = useCallback((id: string) => {
    unlockCookingAudio()
    const now = Date.now()

    setTimers((prev) =>
      prev.map((timer) => {
        if (timer.id !== id) return timer

        if (timer.status === 'running' && timer.endTimestampMs !== null) {
          const nextEnd = Math.max(now, timer.endTimestampMs) + 60_000
          return {
            ...timer,
            endTimestampMs: nextEnd,
            remainingSeconds: computeRemainingSeconds(nextEnd, now),
          }
        }

        if (timer.status === 'finished') {
          const nextEnd = now + 60_000
          return {
            ...timer,
            status: 'running',
            endTimestampMs: nextEnd,
            remainingSeconds: 60,
          }
        }

        return {
          ...timer,
          remainingSeconds: timer.remainingSeconds + 60,
        }
      }),
    )
  }, [])

  const resetTimer = useCallback((id: string) => {
    setTimers((prev) =>
      prev.map((timer) => {
        if (timer.id !== id) return timer
        return {
          ...timer,
          remainingSeconds: timer.initialSeconds,
          status: 'idle',
          endTimestampMs: null,
        }
      }),
    )
  }, [])

  const dismissTimer = useCallback((id: string) => {
    setTimers((prev) => prev.filter((timer) => timer.id !== id))
  }, [])

  const clearAllTimers = useCallback(() => {
    setTimers([])
  }, [])

  return {
    timers,
    startTimer,
    pauseTimer,
    resumeTimer,
    addMinute,
    resetTimer,
    dismissTimer,
    clearAllTimers,
  }
}
