/**
 * Sprawdza aktualizację Service Workera PWA (szczególnie przydatne w aplikacji
 * dodanej do ekranu głównego na iOS/Androidzie, gdzie brak przycisku odświeżania przeglądarki).
 * Zwraca `true`, jeśli wykryto i aktywowano nową wersję aplikacji (nastąpi przeładowanie).
 */
export async function checkAndApplyPwaUpdate(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return false
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) {
      return false
    }

    const hadController = Boolean(navigator.serviceWorker.controller)
    let controllerChanged = false
    let cleanupTimer: number | undefined
    let resolveWait: ((changed: boolean) => void) | undefined

    const onControllerChange = () => {
      controllerChanged = true
      if (cleanupTimer !== undefined) {
        window.clearTimeout(cleanupTimer)
      }
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      resolveWait?.(true)
    }

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    const waitForControllerChange = () =>
      new Promise<boolean>((resolve) => {
        if (controllerChanged) {
          resolve(true)
          return
        }
        resolveWait = resolve
        // Bezpieczny limit czasu oczekiwania na aktywację nowego SW
        cleanupTimer = window.setTimeout(() => {
          navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
          resolve(controllerChanged)
        }, 3000)
      })

    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' })
    }

    await registration.update()

    if (controllerChanged && hadController) {
      window.location.reload()
      return true
    }

    // Jeśli pojawił się nowy instalujący lub oczekujący worker, dajmy mu chwilę na przejęcie kontroli
    if (registration.installing || registration.waiting) {
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' })
      }
      const updated = await waitForControllerChange()
      if (updated && hadController) {
        window.location.reload()
        return true
      }
    } else {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }

    return false
  } catch {
    return false
  }
}
