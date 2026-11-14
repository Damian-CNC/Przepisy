import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertCircle, RefreshCw, RotateCcw } from 'lucide-react'
import { AmbientBackground } from './AmbientBackground'
import { GlassButton } from './GlassButton'
import { GlassCard } from './GlassCard'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary przechwycił błąd:', error, errorInfo)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  private handleReload = () => {
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="relative isolate flex min-h-dvh flex-col items-center justify-center bg-[#fbf8f3] px-4 text-stone-900 dark:bg-zinc-950 dark:text-stone-50">
          <AmbientBackground />
          <GlassCard variant="elevated" padding="lg" className="w-full max-w-md text-center">
            <div className="mx-auto flex flex-col items-center gap-4 py-4">
              <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-600 dark:text-rose-400">
                <AlertCircle className="size-7" aria-hidden="true" />
              </div>

              <div className="space-y-2">
                <h1 className="text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
                  Coś poszło nie tak
                </h1>
                <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                  Wystąpił nieoczekiwany problem z wyświetleniem tego widoku. Twoje dane i przepisy
                  w bazie są bezpieczne.
                </p>
                {this.state.error?.message && (
                  <p className="rounded-lg bg-stone-900/5 p-2 text-xs font-mono text-stone-700 dark:bg-white/5 dark:text-stone-300">
                    {this.state.error.message}
                  </p>
                )}
              </div>

              <div className="flex w-full flex-col gap-2.5 sm:flex-row">
                <GlassButton
                  variant="secondary"
                  size="md"
                  onClick={this.handleReset}
                  leftIcon={<RotateCcw className="size-4" aria-hidden="true" />}
                  className="flex-1"
                >
                  Spróbuj ponownie
                </GlassButton>
                <GlassButton
                  variant="primary"
                  size="md"
                  onClick={this.handleReload}
                  leftIcon={<RefreshCw className="size-4" aria-hidden="true" />}
                  className="flex-1"
                >
                  Odśwież
                </GlassButton>
              </div>
            </div>
          </GlassCard>
        </div>
      )
    }

    return this.props.children
  }
}
