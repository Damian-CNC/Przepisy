/**
 * Sprawdza aktualizację Service Workera PWA oraz aktualny hash paczki na serwerze
 * (przydatne w aplikacji dodanej do ekranu głównego na iOS/Androidzie).
 * Zwraca `true`, jeśli wykryto nową wersję aplikacji i uruchomiono przeładowanie.
 */

function getCurrentBundleSrc(): string | null {
  if (typeof document === 'undefined') return null
  const script = document.querySelector<HTMLScriptElement>(
    'script[type="module"][src*="/assets/index-"]',
  )
  return script?.getAttribute('src') ?? null
}

async function hasNewerBundleOnServer(): Promise<boolean> {
  const currentSrc = getCurrentBundleSrc()
  if (!currentSrc) return false

  try {
    const baseUrl = import.meta.env.BASE_URL || '/'
    const checkUrl = `${baseUrl}${baseUrl.endsWith('/') ? '' : '/'}index.html?_=${Date.now()}`
    const response = await fetch(checkUrl, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    })
    if (!response.ok) return false

    const html = await response.text()
    const match = html.match(/src=["']([^"']*\/assets\/index-[^"']+\.js)["']/i)
    const serverSrc = match?.[1] ?? null

    return Boolean(serverSrc && serverSrc !== currentSrc)
  } catch {
    return false
  }
}

export async function checkAndApplyPwaUpdate(): Promise<boolean> {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration()

      if (registration) {
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

        const attachInstallingTracker = (worker: ServiceWorker | null) => {
          if (!worker) return
          if (worker.state === 'installed') {
            worker.postMessage({ type: 'SKIP_WAITING' })
            return
          }
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed') {
              worker.postMessage({ type: 'SKIP_WAITING' })
            }
          })
        }

        navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

        const onUpdateFound = () => {
          attachInstallingTracker(registration.installing)
        }
        registration.addEventListener('updatefound', onUpdateFound)

        const waitForControllerChange = () =>
          new Promise<boolean>((resolve) => {
            if (controllerChanged) {
              resolve(true)
              return
            }
            resolveWait = resolve
            cleanupTimer = window.setTimeout(() => {
              navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
              resolve(controllerChanged)
            }, 8000)
          })

        try {
          if (registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' })
          }
          attachInstallingTracker(registration.installing)

          await registration.update()

          if (controllerChanged && hadController) {
            window.location.reload()
            return true
          }

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
        } finally {
          registration.removeEventListener('updatefound', onUpdateFound)
          if (cleanupTimer !== undefined) {
            window.clearTimeout(cleanupTimer)
          }
        }
      }
    }

    // Fallback: nawet jeśli Service Worker zaktualizował się wcześniej w tle (autoUpdate),
    // sprawdzamy czy na serwerze jest nowszy plik index-*.js niż aktualnie uruchomiony w pamięci.
    if (await hasNewerBundleOnServer()) {
      window.location.reload()
      return true
    }

    return false
  } catch {
    return false
  }
}
