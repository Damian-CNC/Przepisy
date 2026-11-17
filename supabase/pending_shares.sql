-- ============================================================================
-- Kolejka bezobsługowego udostępniania przepisów z telefonu (iOS Shortcuts -> PWA)
-- Skrypt idempotentny — bezpieczny do wielokrotnego uruchomienia w SQL Editor.
-- ============================================================================

create table if not exists public.pending_shares (
    id uuid primary key default uuid_generate_v4(),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    url text not null,
    raw_text text default '',
    source_platform text default 'instagram',
    consumed boolean default false,
    consumed_at timestamp with time zone
);

-- Indeksy dla natychmiastowego pobierania najnowszego oczekującego linku
create index if not exists pending_shares_active_idx 
    on public.pending_shares (consumed, created_at desc);

-- Włączenie Row Level Security (RLS)
alter table public.pending_shares enable row level security;

-- 1. Skrót Apple (Shortcuts) z publicznym kluczem anon może dodawać nowe linki do kolejki
drop policy if exists "Anonimowy zapis ze Skrotu Apple" on public.pending_shares;
create policy "Anonimowy zapis ze Skrotu Apple"
on public.pending_shares
for insert
to anon
with check (true);

-- 2. Zalogowani domownicy mają pełny dostęp do kolejki (odczyt, oznaczenie jako pobrany, czyszczenie)
drop policy if exists "Zalogowani domownicy obsluguja kolejke" on public.pending_shares;
create policy "Zalogowani domownicy obsluguja kolejke"
on public.pending_shares
for all
to authenticated
using (true)
with check (true);

-- 3. Włączenie Supabase Realtime dla tabeli pending_shares
alter table public.pending_shares replica identity full;

do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (
           select 1
           from pg_publication_tables
           where pubname = 'supabase_realtime'
             and schemaname = 'public'
             and tablename = 'pending_shares'
       ) then
        alter publication supabase_realtime add table public.pending_shares;
    end if;
end
$$;
