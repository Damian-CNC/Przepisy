import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  Link2,
  LogOut,
  Mail,
  Plus,
  Share2,
  Smartphone,
  Sparkles,
} from 'lucide-react'
import { GlassButton, GlassCard, GlassModal, GlassPill } from '../ui'

export interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  userEmail: string | null | undefined
  isSigningOut: boolean
  onSignOut: () => Promise<void> | void
}

type CopyStatus = 'idle' | 'copied' | 'failed'

function resolveAppBaseUrl(): string {
  if (typeof window === 'undefined') {
    return 'https://twoj-login.github.io/Przepisy/'
  }

  try {
    return new URL(import.meta.env.BASE_URL || '/', window.location.origin).toString()
  } catch {
    return `${window.location.origin}/`
  }
}

function legacyCopyToClipboard(text: string): boolean {
  if (typeof document === 'undefined' || !document.body) return false

  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  field.style.cssText = 'position:fixed;inset-block-start:0;opacity:0;pointer-events:none'
  document.body.append(field)
  field.select()

  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    field.remove()
  }
}

/**
 * Modal ustawień łączący dane konta domownika, wylogowanie oraz instrukcję Skrótu iOS i PWA Android.
 */
export function SettingsModal({
  isOpen,
  onClose,
  userEmail,
  isSigningOut,
  onSignOut,
}: SettingsModalProps) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
  const [statusAnnouncement, setStatusAnnouncement] = useState('')

  const copyTimerRef = useRef<number | null>(null)
  const lastAnnouncementRef = useRef('')

  const appBaseUrl = useMemo(() => resolveAppBaseUrl(), [])
  const shortcutPrefixUrl = `${appBaseUrl}?importUrl=`
  const shortcutTemplateUrl = `${shortcutPrefixUrl}[Skrót z menu Udostępnij]`

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current)
      }
    }
  }, [])

  const handleClose = () => {
    if (isSigningOut) return
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current)
      copyTimerRef.current = null
    }
    setCopyStatus('idle')
    setStatusAnnouncement('')
    onClose()
  }

  const announceCopyResult = (nextStatus: 'copied' | 'failed') => {
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current)
    }

    const baseMessage =
      nextStatus === 'copied'
        ? 'Skopiowano adres dla Skrótu iOS do schowka.'
        : 'Nie udało się skopiować adresu. Zaznacz i skopiuj go ręcznie.'

    const uniqueAnnouncement =
      baseMessage === lastAnnouncementRef.current ? `${baseMessage}\u00A0` : baseMessage
    lastAnnouncementRef.current = baseMessage

    setCopyStatus(nextStatus)
    setStatusAnnouncement('')
    window.requestAnimationFrame(() => {
      setStatusAnnouncement(uniqueAnnouncement)
    })

    copyTimerRef.current = window.setTimeout(() => {
      setCopyStatus('idle')
      setStatusAnnouncement('')
      copyTimerRef.current = null
    }, 2600)
  }

  const handleCopyShortcutUrl = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shortcutPrefixUrl)
        announceCopyResult('copied')
        return
      }
      throw new Error('Brak Async Clipboard API')
    } catch {
      const ok = legacyCopyToClipboard(shortcutPrefixUrl)
      announceCopyResult(ok ? 'copied' : 'failed')
    }
  }

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={handleClose}
      closedBy={isSigningOut ? 'none' : 'any'}
      title="Ustawienia"
      subtitle="Konto domownika oraz szybkie udostępnianie przepisów z telefonu."
      size="md"
      footer={
        <GlassButton
          variant="secondary"
          size="md"
          disabled={isSigningOut}
          onClick={handleClose}
        >
          Zamknij
        </GlassButton>
      }
    >
      <div className="flex flex-col gap-5">
        {/* Sekcja 1: Konto domownika */}
        <GlassCard variant="default" padding="md">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex size-8 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
                  <Mail className="size-4" aria-hidden="true" />
                </span>
                <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">
                  Konto domownika
                </p>
              </div>
              <p className="truncate text-base font-semibold text-stone-900 dark:text-stone-50">
                {userEmail ?? 'Domownik'}
              </p>
              <p className="text-xs text-stone-600 dark:text-stone-300">
                Synchronizacja przepisów w czasie rzeczywistym jest aktywna.
              </p>
            </div>

            <GlassButton
              variant="danger"
              size="md"
              isLoading={isSigningOut}
              loadingText="Wylogowywanie..."
              leftIcon={<LogOut className="size-4" aria-hidden="true" />}
              onClick={() => void onSignOut()}
              className="shrink-0"
            >
              Wyloguj się
            </GlassButton>
          </div>
        </GlassCard>

        {/* Sekcja 2: Skrót iOS (Shortcuts) */}
        <section aria-labelledby="ios-shortcut-heading" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex size-9 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
                <Share2 className="size-4.5" aria-hidden="true" />
              </span>
              <h3
                id="ios-shortcut-heading"
                className="text-base font-semibold text-stone-900 dark:text-stone-50"
              >
                Jak udostępniać z Instagrama na iPhone (iOS)
              </h3>
            </div>
            <GlassPill variant="tag" size="sm">
              3 proste kroki
            </GlassPill>
          </div>

          <ol className="flex flex-col gap-3">
            {/* Krok 1 */}
            <li>
              <GlassCard variant="default" padding="sm">
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-600 text-sm font-semibold text-white tabular-nums dark:bg-amber-500 dark:text-zinc-950"
                  >
                    1
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-stone-900 dark:text-stone-50">
                      <Plus className="size-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
                      <span>Utwórz nowy skrót w aplikacji Skróty</span>
                    </div>
                    <p className="text-sm leading-relaxed text-stone-700 dark:text-stone-300">
                      Otwórz aplikację <strong>Skróty (Shortcuts)</strong> na iPhonie, kliknij{' '}
                      <strong>+</strong>, włącz opcję{' '}
                      <strong>„Pokaż w arkuszu udostępniania”</strong> (Show in Share Sheet) i
                      ustaw przyjmowanie <strong>Adresów URL / Tekstu</strong>.
                    </p>
                  </div>
                </div>
              </GlassCard>
            </li>

            {/* Krok 2 */}
            <li>
              <GlassCard variant="default" padding="sm">
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-600 text-sm font-semibold text-white tabular-nums dark:bg-amber-500 dark:text-zinc-950"
                  >
                    2
                  </span>
                  <div className="min-w-0 flex-1 space-y-2.5">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-stone-900 dark:text-stone-50">
                      <Link2 className="size-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
                      <span>Dodaj akcję „URL” z szablonem aplikacji</span>
                    </div>
                    <p className="text-sm leading-relaxed text-stone-700 dark:text-stone-300">
                      Wklej poniższy początek adresu i zaraz po znaku <code>=</code> wstaw zmienną{' '}
                      <strong>Skrót z menu Udostępnij</strong> (Shortcut Input):
                    </p>

                    <div className="rounded-2xl border border-stone-900/10 bg-stone-950/5 px-3 py-2.5 text-xs font-mono break-all text-stone-800 select-all dark:border-white/10 dark:bg-black/35 dark:text-stone-200">
                      {shortcutTemplateUrl}
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <GlassButton
                        type="button"
                        variant="primary"
                        size="md"
                        leftIcon={
                          copyStatus === 'copied' ? (
                            <Check className="size-4" aria-hidden="true" />
                          ) : copyStatus === 'failed' ? (
                            <AlertCircle className="size-4" aria-hidden="true" />
                          ) : (
                            <Copy className="size-4" aria-hidden="true" />
                          )
                        }
                        onClick={() => void handleCopyShortcutUrl()}
                      >
                        {copyStatus === 'copied'
                          ? 'Skopiowano adres!'
                          : 'Kopiuj adres dla Skrótu iOS'}
                      </GlassButton>

                      <span
                        role="status"
                        aria-live="polite"
                        className="text-xs font-medium text-emerald-700 dark:text-emerald-300"
                      >
                        {statusAnnouncement}
                      </span>
                    </div>
                  </div>
                </div>
              </GlassCard>
            </li>

            {/* Krok 3 */}
            <li>
              <GlassCard variant="default" padding="sm">
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-600 text-sm font-semibold text-white tabular-nums dark:bg-amber-500 dark:text-zinc-950"
                  >
                    3
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-stone-900 dark:text-stone-50">
                      <ExternalLink
                        className="size-4 shrink-0 text-amber-700 dark:text-amber-300"
                        aria-hidden="true"
                      />
                      <span>Dodaj akcję „Otwórz adresy URL” (Open URLs)</span>
                    </div>
                    <p className="text-sm leading-relaxed text-stone-700 dark:text-stone-300">
                      Gotowe! Od tej pory w rolce na Instagramie klikasz{' '}
                      <em>Udostępnij → Twój Skrót</em>, a przepis automatycznie otworzy się i
                      przetłumaczy na polski <Sparkles className="inline size-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />.
                    </p>
                  </div>
                </div>
              </GlassCard>
            </li>
          </ol>
        </section>

        {/* Sekcja 3: Wskazówka dla Androida (Web Share Target API) */}
        <GlassCard variant="default" padding="sm">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
              <Smartphone className="size-4.5" aria-hidden="true" />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-stone-900 dark:text-stone-50">
                Używasz telefonu z Androidem?
              </p>
              <p className="text-sm leading-relaxed text-stone-700 dark:text-stone-300">
                Otwórz aplikację w przeglądarce <strong>Chrome</strong> i wybierz z menu{' '}
                <em>Zainstaluj aplikację</em> — wtedy <strong>Nasze Przepisy</strong> pojawią się
                bezpośrednio w systemowym menu <em>Udostępnij</em> na Instagramie i TikToku.
              </p>
            </div>
          </div>
        </GlassCard>
      </div>
    </GlassModal>
  )
}
