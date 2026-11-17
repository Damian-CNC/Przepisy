import { useEffect, useMemo, useRef, useState } from 'react'
import {
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
  const [copiedType, setCopiedType] = useState<'standard' | 'chrome' | 'queueUrl' | 'anonKey' | null>(null)
  const [statusAnnouncement, setStatusAnnouncement] = useState('')

  const copyTimerRef = useRef<number | null>(null)
  const lastAnnouncementRef = useRef('')

  const appBaseUrl = useMemo(() => resolveAppBaseUrl(), [])
  const standardShortcutUrl = `${appBaseUrl}?importUrl=`
  const chromeShortcutUrl = `${appBaseUrl.replace(/^https?:\/\//, 'googlechromes://')}?importUrl=`
  const chromeTemplateUrl = `${chromeShortcutUrl}[Skrót z menu Udostępnij]`

  const supabaseQueueUrl = 'https://itordauatieafxhqbxfi.supabase.co/rest/v1/pending_shares'
  const supabaseAnonKey = 'sb_publishable_LjydtS7mOXN5cpBR5t3AIw_oyCm4p1d'

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
    setCopiedType(null)
    setStatusAnnouncement('')
    onClose()
  }

  const announceCopyResult = (
    type: 'standard' | 'chrome' | 'queueUrl' | 'anonKey',
    success: boolean,
  ) => {
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current)
    }

    const typeLabels: Record<typeof type, string> = {
      standard: 'standardowy adres',
      chrome: 'adres dla Google Chrome',
      queueUrl: 'adres URL kolejki Supabase',
      anonKey: 'klucz API (apikey)',
    }

    const baseMessage = success
      ? `Skopiowano ${typeLabels[type]} do schowka!`
      : 'Nie udało się skopiować. Zaznacz i skopiuj ręcznie.'

    const uniqueAnnouncement =
      baseMessage === lastAnnouncementRef.current ? `${baseMessage}\u00A0` : baseMessage
    lastAnnouncementRef.current = baseMessage

    setCopiedType(success ? type : null)
    setStatusAnnouncement('')
    window.requestAnimationFrame(() => {
      setStatusAnnouncement(uniqueAnnouncement)
    })

    copyTimerRef.current = window.setTimeout(() => {
      setCopiedType(null)
      setStatusAnnouncement('')
      copyTimerRef.current = null
    }, 2600)
  }

  const handleCopy = async (type: 'standard' | 'chrome' | 'queueUrl' | 'anonKey') => {
    let targetText = standardShortcutUrl
    if (type === 'chrome') targetText = chromeShortcutUrl
    else if (type === 'queueUrl') targetText = supabaseQueueUrl
    else if (type === 'anonKey') targetText = supabaseAnonKey

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(targetText)
        announceCopyResult(type, true)
        return
      }
      throw new Error('Brak Async Clipboard API')
    } catch {
      const ok = legacyCopyToClipboard(targetText)
      announceCopyResult(type, ok)
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
                  <div className="min-w-0 flex-1 space-y-3.5">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-stone-900 dark:text-stone-50">
                      <Sparkles className="size-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
                      <span>Metoda 1: 100% Bezobsługowa z pulpitu (Zalecana)</span>
                    </div>
                    <p className="text-sm leading-relaxed text-stone-700 dark:text-stone-300">
                      W Skrócie dodaj akcję <strong>„Pobierz zawartość adresu URL”</strong> (POST), która w ułamku sekundy przekazuje rolkę do bazy i otwiera aplikację z ekranu początkowego:
                    </p>

                    {/* Szczegóły żądania POST */}
                    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2.5 dark:border-amber-400/20 dark:bg-amber-500/10">
                      <div>
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                          1. Adres URL kolejki (metoda POST):
                        </span>
                        <div className="mt-1 rounded-xl border border-stone-900/10 bg-white/60 px-3 py-1.5 text-xs font-mono break-all text-stone-800 dark:border-white/10 dark:bg-black/40 dark:text-stone-200">
                          {supabaseQueueUrl}
                        </div>
                        <div className="mt-1.5">
                          <GlassButton
                            type="button"
                            variant="primary"
                            size="sm"
                            leftIcon={<Copy className="size-3.5" />}
                            onClick={() => void handleCopy('queueUrl')}
                          >
                            {copiedType === 'queueUrl' ? 'Skopiowano adres URL!' : 'Kopiuj adres kolejki'}
                          </GlassButton>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-amber-500/20">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                          2. Nagłówki żądania (Headers):
                        </span>
                        <div className="mt-1 space-y-1 text-xs font-mono text-stone-700 dark:text-stone-300">
                          <div><strong>Content-Type:</strong> application/json</div>
                          <div className="break-all"><strong>apikey:</strong> {supabaseAnonKey}</div>
                        </div>
                        <div className="mt-1.5">
                          <GlassButton
                            type="button"
                            variant="secondary"
                            size="sm"
                            leftIcon={<Copy className="size-3.5" />}
                            onClick={() => void handleCopy('anonKey')}
                          >
                            {copiedType === 'anonKey' ? 'Skopiowano klucz!' : 'Kopiuj klucz API (apikey)'}
                          </GlassButton>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-amber-500/20">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                          3. Treść żądania (JSON):
                        </span>
                        <p className="mt-1 text-xs text-stone-600 dark:text-stone-300">
                          Dodaj pole o kluczu <code>url</code> i jako wartość wstaw <strong>Dane wejściowe skrótu</strong>.
                        </p>
                      </div>

                      <div className="pt-2 border-t border-amber-500/20">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                          4. Następna akcja w Skrócie:
                        </span>
                        <p className="mt-1 text-xs font-medium text-amber-900 dark:text-amber-200">
                          Dodaj akcję <strong>„Otwórz aplikację”</strong> → wybierz <strong>Nasze Przepisy</strong> (skrót z ekranu).
                        </p>
                      </div>
                    </div>

                    {/* Metoda alternatywna: przez link URL w przeglądarce */}
                    <div className="pt-2 border-t border-stone-200 dark:border-white/10 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-700 dark:text-stone-300">
                        <Link2 className="size-3.5" />
                        <span>Metoda 2: Bezpośrednio przez Google Chrome (akcja Otwórz adresy URL)</span>
                      </div>
                      <div className="rounded-xl border border-stone-900/10 bg-stone-950/5 px-3 py-1.5 text-xs font-mono break-all text-stone-800 select-all dark:border-white/10 dark:bg-black/35 dark:text-stone-200">
                        {chromeTemplateUrl}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <GlassButton
                          type="button"
                          variant="secondary"
                          size="sm"
                          leftIcon={<Copy className="size-3.5" />}
                          onClick={() => void handleCopy('chrome')}
                        >
                          {copiedType === 'chrome' ? 'Skopiowano adres Chrome!' : 'Kopiuj link dla Chrome'}
                        </GlassButton>
                        <GlassButton
                          type="button"
                          variant="ghost"
                          size="sm"
                          leftIcon={<Copy className="size-3.5" />}
                          onClick={() => void handleCopy('standard')}
                        >
                          {copiedType === 'standard' ? 'Skopiowano!' : 'Kopiuj link https:// (Safari)'}
                        </GlassButton>
                      </div>
                    </div>

                    {statusAnnouncement && (
                      <p
                        role="status"
                        aria-live="polite"
                        className="text-xs font-medium text-emerald-700 dark:text-emerald-300"
                      >
                        {statusAnnouncement}
                      </p>
                    )}
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
