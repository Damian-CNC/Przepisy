import { useCallback, useEffect, useState } from 'react'
import type { AuthError, Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

export interface UseAuthResult {
  session: Session | null
  user: User | null
  isLoading: boolean
  authError: string | null
  signInWithPassword: (email: string, password: string) => Promise<boolean>
  signInWithMagicLink: (email: string) => Promise<boolean>
  signOut: () => Promise<boolean>
  clearAuthError: () => void
}

function formatAuthErrorMessage(error: AuthError | Error): string {
  const raw = error.message.trim()
  const lower = raw.toLowerCase()

  if (lower.includes('invalid login credentials')) {
    return 'Nieprawidłowy adres e-mail lub hasło.'
  }
  if (lower.includes('email not confirmed')) {
    return 'Adres e-mail nie został jeszcze potwierdzony.'
  }
  if (lower.includes('user not found')) {
    return 'Nie znaleziono konta powiązanego z tym adresem e-mail.'
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Zbyt wiele prób logowania. Odczekaj chwilę i spróbuj ponownie.'
  }
  if (lower.includes('invalid email') || lower.includes('unable to validate email')) {
    return 'Podaj poprawny adres e-mail.'
  }

  return raw || 'Wystąpił błąd uwierzytelniania.'
}

/**
 * Zarządza sesją domownika w Supabase Auth (logowanie hasłem, Magic Link oraz wylogowanie).
 */
export function useAuth(): UseAuthResult {
  const configured = isSupabaseConfigured()
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(configured)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    if (!configured) {
      return
    }

    let isMounted = true

    const hydrateSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (!isMounted) return

        if (error) {
          setAuthError(formatAuthErrorMessage(error))
          setSession(null)
          setUser(null)
        } else {
          setSession(data.session)
          setUser(data.session?.user ?? null)
        }
      } catch (err) {
        if (!isMounted) return
        setAuthError(
          err instanceof Error ? formatAuthErrorMessage(err) : 'Nie udało się odczytać sesji.',
        )
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void hydrateSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      setIsLoading(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [configured])

  const clearAuthError = useCallback(() => {
    setAuthError(null)
  }, [])

  const signInWithPassword = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      if (!configured) {
        setAuthError('Brak konfiguracji Supabase w zmiennych środowiskowych.')
        return false
      }

      const cleanEmail = email.trim()
      if (!cleanEmail || !password) {
        setAuthError('Wpisz adres e-mail oraz hasło.')
        return false
      }

      setAuthError(null)

      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      })

      if (error) {
        setAuthError(formatAuthErrorMessage(error))
        return false
      }

      setSession(data.session)
      setUser(data.user)
      return true
    },
    [configured],
  )

  const signInWithMagicLink = useCallback(
    async (email: string): Promise<boolean> => {
      if (!configured) {
        setAuthError('Brak konfiguracji Supabase w zmiennych środowiskowych.')
        return false
      }

      const cleanEmail = email.trim()
      if (!cleanEmail) {
        setAuthError('Wpisz adres e-mail, aby wysłać jednorazowy link logowania.')
        return false
      }

      setAuthError(null)

      const emailRedirectTo = window.location.origin + import.meta.env.BASE_URL
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          emailRedirectTo,
        },
      })

      if (error) {
        setAuthError(formatAuthErrorMessage(error))
        return false
      }

      return true
    },
    [configured],
  )

  const signOut = useCallback(async (): Promise<boolean> => {
    if (!configured) {
      setSession(null)
      setUser(null)
      return true
    }

    setAuthError(null)
    const { error } = await supabase.auth.signOut()

    if (error) {
      setAuthError(formatAuthErrorMessage(error))
      return false
    }

    setSession(null)
    setUser(null)
    return true
  }, [configured])

  return {
    session,
    user,
    isLoading,
    authError,
    signInWithPassword,
    signInWithMagicLink,
    signOut,
    clearAuthError,
  }
}
