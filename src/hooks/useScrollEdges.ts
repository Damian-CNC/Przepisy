import { useCallback, useEffect, useState, type RefObject } from 'react'

export interface ScrollEdgeState {
  canScrollStart: boolean
  canScrollEnd: boolean
}

const EDGE_THRESHOLD_PX = 4

/**
 * Obserwuje przewijany kontener w osi pionowej lub poziomej i zwraca,
 * czy istnieje ukryta treść przed początkiem lub za końcem obszaru przewijania.
 */
export function useScrollEdges<T extends HTMLElement>(
  ref: RefObject<T | null>,
  direction: 'vertical' | 'horizontal',
  refreshDependency?: unknown,
): ScrollEdgeState {
  const [edges, setEdges] = useState<ScrollEdgeState>({
    canScrollStart: false,
    canScrollEnd: false,
  })

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return

    const nextStart =
      direction === 'vertical'
        ? el.scrollTop > EDGE_THRESHOLD_PX
        : el.scrollLeft > EDGE_THRESHOLD_PX

    const nextEnd =
      direction === 'vertical'
        ? el.scrollTop + el.clientHeight < el.scrollHeight - EDGE_THRESHOLD_PX
        : el.scrollLeft + el.clientWidth < el.scrollWidth - EDGE_THRESHOLD_PX

    setEdges((prev) =>
      prev.canScrollStart === nextStart && prev.canScrollEnd === nextEnd
        ? prev
        : { canScrollStart: nextStart, canScrollEnd: nextEnd },
    )
  }, [direction, ref])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const rafId = window.requestAnimationFrame(measure)
    el.addEventListener('scroll', measure, { passive: true })

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(measure)
      resizeObserver.observe(el)
      if (el.firstElementChild) {
        resizeObserver.observe(el.firstElementChild)
      }
    }

    return () => {
      window.cancelAnimationFrame(rafId)
      el.removeEventListener('scroll', measure)
      resizeObserver?.disconnect()
    }
  }, [measure, ref, refreshDependency])

  return edges
}
