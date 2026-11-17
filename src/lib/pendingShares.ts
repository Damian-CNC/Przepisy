import { supabase, isSupabaseConfigured } from './supabase'

export interface PendingSharePayload {
  id: string
  url: string
  rawText: string
  sourcePlatform: string
}

/**
 * Sprawdza w Supabase, czy w ciągu ostatnich 3 minut Skrót iOS dodał oczekujący link.
 * Jeśli tak, natychmiast oznacza go jako zużyty (`consumed = true`) i zwraca link.
 */
export async function fetchAndConsumePendingShare(): Promise<PendingSharePayload | null> {
  if (!isSupabaseConfigured()) return null

  try {
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from('pending_shares')
      .select('id, url, raw_text, source_platform, created_at')
      .eq('consumed', false)
      .gt('created_at', threeMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(1)

    if (error || !data || data.length === 0) {
      return null
    }

    const share = data[0]

    // Natychmiastowe oznaczenie jako skonsumowane, aby nie otworzyło się dwukrotnie
    await supabase
      .from('pending_shares')
      .update({
        consumed: true,
        consumed_at: new Date().toISOString(),
      })
      .eq('id', share.id)

    return {
      id: share.id,
      url: share.url || '',
      rawText: share.raw_text || '',
      sourcePlatform: share.source_platform || 'instagram',
    }
  } catch {
    return null
  }
}

/**
 * Subskrybuje zdarzenia Supabase Realtime dla tabeli `pending_shares`.
 * Gdy Skrót Apple doda nowy link w czasie rzeczywistym (np. gdy aplikacja była już włączona),
 * od razu odpala callback z nowym linkiem.
 */
export function subscribeToPendingShares(
  onNewShare: (payload: PendingSharePayload) => void,
): () => void {
  if (!isSupabaseConfigured()) return () => {}

  try {
    const channelName = `realtime-pending-shares-${Math.random().toString(36).slice(2, 8)}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pending_shares' },
        async (change) => {
          const row = change.new as {
            id?: string
            url?: string
            raw_text?: string
            source_platform?: string
            consumed?: boolean
            created_at?: string
          }

          if (!row || !row.id || !row.url || row.consumed) return

          // Sprawdzamy, czy link nie jest przedawniony
          if (row.created_at) {
            const ageMs = Date.now() - new Date(row.created_at).getTime()
            if (ageMs > 3 * 60 * 1000) return
          }

          // Oznaczamy jako skonsumowane
          await supabase
            .from('pending_shares')
            .update({
              consumed: true,
              consumed_at: new Date().toISOString(),
            })
            .eq('id', row.id)

          onNewShare({
            id: row.id,
            url: row.url,
            rawText: row.raw_text || '',
            sourcePlatform: row.source_platform || 'instagram',
          })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  } catch {
    return () => {}
  }
}
