import { useState, type FormEvent } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChefHat,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  Sparkles,
} from 'lucide-react'
import { isSupabaseConfigured } from '../../lib/supabase'
import type { SharedImportPayload } from '../../lib/shareTarget'
import { GlassButton, GlassCard, GlassPill, cn } from '../ui'

export interface AuthScreenProps {
  authError: string | null
  pendingShare?: SharedImportPayload | null
  onSignInWithPassword: (email: string, password: string) => Promise<boolean>
  onSignInWithMagicLink: (email: string) => Promise<boolean>
  onClearError: () => void
}

type AuthMode = 'password' | 'magic-link'

const INPUT_BASE_CLASS = cn(
  'w-full min-h-12 rounded-2xl px-4 text-base',
  'bg-white/75 text-stone-900 placeholder:text-stone-500',
  'dark:bg-zinc-950/65 dark:text-stone-50 dark:placeholder:text-stone-400',
  'border border-stone-900/15 dark:border-white/15',
  'shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]',
  'transition-colors duration-150',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:focus-visible:outline-amber-400',
)

/**
 * Ekran logowania domowników w estetyce Apple Liquid Glass (hasło lub Magic Link).
 */
export function AuthScreen({
  authError,
  pendingShare,
  onSignInWithPassword,
  onSignInWithMagicLink,
  onClearError,
}: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [magicLinkSentTo, setMagicLinkSentTo] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  const supabaseReady = isSupabaseConfigured()
  const visibleError = localError ?? authError

  const handleModeSwitch = (nextMode: AuthMode) => {
    setMode(nextMode)
    setLocalError(null)
    setMagicLinkSentTo(null)
    onClearError()
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) return

    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setLocalError('Wpisz adres e-mail domownika.')
      return
    }

    if (mode === 'password' && !password) {
      setLocalError('Wpisz hasło do konta.')
      return
    }

    setLocalError(null)
    setMagicLinkSentTo(null)
    setIsSubmitting(true)

    try {
      if (mode === 'password') {
        await onSignInWithPassword(trimmedEmail, password)
      } else {
        const sent = await onSignInWithMagicLink(trimmedEmail)
        if (sent) {
          setMagicLinkSentTo(trimmedEmail)
        }
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] sm:px-6">
      <GlassCard variant="elevated" padding="lg" className="w-full">
        <div className="flex flex-col gap-6">
          {/* Logo i nagłówek */}
          <header className="flex flex-col items-center text-center">
            <div
              className={cn(
                'mb-4 inline-flex size-16 items-center justify-center rounded-3xl',
                'bg-gradient-to-br from-amber-500/25 via-orange-400/20 to-emerald-500/20',
                'border border-white/50 dark:border-white/15',
                'shadow-[inset_0_1px_1px_rgba(255,255,255,0.65),0_10px_28px_rgba(180,83,9,0.18)]',
              )}
              aria-hidden="true"
            >
              <ChefHat className="size-8 text-amber-700 dark:text-amber-300" />
            </div>

            <GlassPill
              variant="tag"
              size="sm"
              leftIcon={<Sparkles className="size-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />}
              className="mb-3"
            >
              Prywatna kuchnia domowników
            </GlassPill>

            <h1 className="text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
              Nasze Przepisy
            </h1>
            <p className="mt-2 max-w-sm text-base leading-relaxed text-stone-600 dark:text-stone-300">
              Zaloguj się, aby korzystać ze wspólnej bazy przepisów i trybu gotowania krok po kroku.
            </p>
          </header>

          {pendingShare && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-2xl border border-emerald-600/30 bg-emerald-500/12 p-3.5 text-sm text-emerald-950 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-100"
            >
              <Sparkles className="mt-0.5 size-4 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
              <div className="min-w-0 space-y-1">
                <p className="font-semibold">
                  Przepis czeka na import!
                </p>
                <p className="text-xs leading-relaxed opacity-90">
                  Zaloguj się raz w tej przeglądarce (Safari na iOS przechowuje sesję osobno od
                  ikony na ekranie głównym), a AI od razu go przetłumaczy.
                </p>
                {(pendingShare.url || pendingShare.rawText) && (
                  <p className="truncate font-mono text-xs opacity-80">
                    {pendingShare.url || pendingShare.rawText}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Przełącznik trybu logowania */}
          <div
            role="group"
            aria-label="Metoda logowania"
            className={cn(
              'grid grid-cols-2 gap-1.5 rounded-2xl p-1.5',
              'bg-stone-900/5 dark:bg-white/5',
              'border border-stone-900/10 dark:border-white/10',
            )}
          >
            <button
              type="button"
              aria-pressed={mode === 'password'}
              onClick={() => handleModeSwitch('password')}
              className={cn(
                'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium transition-all',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:focus-visible:outline-amber-400',
                mode === 'password'
                  ? 'border border-amber-700/25 bg-white text-stone-950 shadow-sm dark:border-amber-400/40 dark:bg-amber-500 dark:text-zinc-950'
                  : 'border border-transparent text-stone-700 hover:bg-white/50 dark:text-stone-300 dark:hover:bg-white/10',
              )}
            >
              <KeyRound className="size-4 shrink-0" aria-hidden="true" />
              <span>Hasło</span>
            </button>

            <button
              type="button"
              aria-pressed={mode === 'magic-link'}
              onClick={() => handleModeSwitch('magic-link')}
              className={cn(
                'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium transition-all',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:focus-visible:outline-amber-400',
                mode === 'magic-link'
                  ? 'border border-amber-700/25 bg-white text-stone-950 shadow-sm dark:border-amber-400/40 dark:bg-amber-500 dark:text-zinc-950'
                  : 'border border-transparent text-stone-700 hover:bg-white/50 dark:text-stone-300 dark:hover:bg-white/10',
              )}
            >
              <Mail className="size-4 shrink-0" aria-hidden="true" />
              <span>Magic Link</span>
            </button>
          </div>

          {!supabaseReady && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-2xl border border-amber-500/35 bg-amber-500/12 p-3.5 text-sm text-amber-950 dark:text-amber-200"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                Brak zmiennych środowiskowych <code className="font-mono">VITE_SUPABASE_URL</code> lub{' '}
                <code className="font-mono">VITE_SUPABASE_ANON_KEY</code>. Uzupełnij plik{' '}
                <code className="font-mono">.env.local</code>, aby połączyć się z bazą domowników.
              </span>
            </div>
          )}

          {/* Formularz logowania */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate={false}>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="auth-email"
                className="text-sm font-medium text-stone-800 dark:text-stone-200"
              >
                Adres e-mail
              </label>
              <input
                type="email"
                id="auth-email"
                name="email"
                autoComplete="username"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                required
                enterKeyHint={mode === 'password' ? 'next' : 'done'}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (localError) setLocalError(null)
                  if (authError) onClearError()
                }}
                placeholder="np. domownik@naszakuchnia.pl"
                className={INPUT_BASE_CLASS}
              />
            </div>

            {mode === 'password' && (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="auth-password"
                  className="text-sm font-medium text-stone-800 dark:text-stone-200"
                >
                  Hasło
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="auth-password"
                    name="password"
                    autoComplete="current-password"
                    required
                    enterKeyHint="done"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      if (localError) setLocalError(null)
                      if (authError) onClearError()
                    }}
                    placeholder="Wpisz lub wklej hasło"
                    className={cn(INPUT_BASE_CLASS, 'pr-14')}
                  />
                  <button
                    type="button"
                    aria-pressed={showPassword}
                    aria-label={showPassword ? 'Ukryj hasło' : 'Pokaż hasło'}
                    onClick={() => setShowPassword((prev) => !prev)}
                    className={cn(
                      'absolute right-1.5 inline-flex size-11 cursor-pointer items-center justify-center rounded-xl',
                      'text-stone-600 hover:bg-stone-900/5 hover:text-stone-900',
                      'dark:text-stone-300 dark:hover:bg-white/10 dark:hover:text-stone-50',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:focus-visible:outline-amber-400',
                    )}
                  >
                    {showPassword ? (
                      <EyeOff className="size-5" aria-hidden="true" />
                    ) : (
                      <Eye className="size-5" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Komunikaty błędów i statusów w aria-live="polite" */}
            <div aria-live="polite" className="min-h-1">
              {visibleError && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-2xl border border-red-500/35 bg-red-500/12 p-3.5 text-sm font-medium text-red-900 dark:border-red-400/35 dark:bg-red-500/15 dark:text-red-200"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{visibleError}</span>
                </div>
              )}

              {magicLinkSentTo && (
                <div
                  role="status"
                  className="flex items-start gap-2.5 rounded-2xl border border-emerald-600/35 bg-emerald-500/12 p-3.5 text-sm font-medium text-emerald-950 dark:border-emerald-400/35 dark:bg-emerald-500/15 dark:text-emerald-200"
                >
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>
                    Wysłaliśmy link logowania na adres <strong>{magicLinkSentTo}</strong>. Otwórz
                    wiadomość e-mail na tym urządzeniu, aby wejść do kuchni.
                  </span>
                </div>
              )}
            </div>

            <GlassButton
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              isLoading={isSubmitting}
              loadingText={mode === 'password' ? 'Logowanie...' : 'Wysyłanie linku...'}
              className="mt-1"
            >
              {mode === 'password' ? 'Zaloguj się' : 'Wyślij link logowania'}
            </GlassButton>
          </form>
        </div>
      </GlassCard>
    </main>
  )
}
