-- ============================================================================
-- Nasze Przepisy - Schemat Bazy Danych Supabase (PostgreSQL, RLS, Storage)
-- Skrypt idempotentny — bezpieczny do wielokrotnego uruchomienia w SQL Editor.
-- ============================================================================

-- Włączenie rozszerzenia UUID
create extension if not exists "uuid-ossp";

-- 1. Tabela główna przepisów
create table if not exists public.recipes (
    id uuid primary key default uuid_generate_v4(),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    title text not null,
    description text,
    source_url text,
    source_platform text default 'manual', -- 'instagram', 'web', 'photo', 'manual'
    image_url text,
    prep_time_minutes integer default 0,
    cook_time_minutes integer default 0,
    servings integer default 2,
    category text default 'Obiad',
    tags text[] default '{}',
    is_favorite boolean default false,
    -- Struktura JSONB składników ogólnych:
    -- [{ "name": "Mąka", "amount": 200, "unit": "g", "category": "Suche" }]
    ingredients jsonb not null default '[]'::jsonb,
    -- Struktura JSONB kroków pod tryb Thermomix:
    -- [{ "step_number": 1, "instruction": "Wymieszaj składniki...", "step_ingredients": [{ "name": "Mąka", "amount": 200, "unit": "g" }], "timer_seconds": 120, "tip": "Na wolnych obrotach" }]
    steps jsonb not null default '[]'::jsonb,
    nutrition jsonb default null,
    created_by uuid references auth.users(id) on delete set null
);

-- Indeksy dla szybkiego wyszukiwania
create index if not exists recipes_created_at_idx on public.recipes (created_at desc);
create index if not exists recipes_category_idx on public.recipes (category);
create index if not exists recipes_is_favorite_idx on public.recipes (is_favorite);

-- Automatyczna aktualizacja kolumny updated_at przy UPDATE
create or replace function public.handle_recipes_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
    new.updated_at = timezone('utc'::text, now());
    return new;
end;
$$;

drop trigger if exists set_recipes_updated_at on public.recipes;
create trigger set_recipes_updated_at
before update on public.recipes
for each row
execute function public.handle_recipes_updated_at();

-- 2. Włączenie Row Level Security (RLS)
alter table public.recipes enable row level security;

-- Polityka: Tylko zalogowani użytkownicy (Ty i żona) mają pełny dostęp do wspólnej bazy przepisów
drop policy if exists "Wspolny dostep dla zalogowanych domownikow" on public.recipes;
create policy "Wspolny dostep dla zalogowanych domownikow"
on public.recipes
for all
to authenticated
using (true)
with check (true);

-- Polityka dla budzika (Keep-Alive Cron): pozwala odpytać 1 rekord (tylko pole id) dla utrzymania aktywności bazy
drop policy if exists "Keep alive ping" on public.recipes;
create policy "Keep alive ping"
on public.recipes
for select
to anon
using (true);

-- 3. Utworzenie koszyka Supabase Storage na zdjęcia przepisów
insert into storage.buckets (id, name, public)
values ('recipe-images', 'recipe-images', true)
on conflict (id) do update set public = excluded.public;

-- Polityki Storage: Publiczny odczyt zdjęć, zapis/usuwanie tylko dla zalogowanych (Ciebie i żony)
drop policy if exists "Publiczny podglad zdjec przepisow" on storage.objects;
create policy "Publiczny podglad zdjec przepisow"
on storage.objects for select
to public
using (bucket_id = 'recipe-images');

drop policy if exists "Zalogowani moga dodawac zdjecia" on storage.objects;
create policy "Zalogowani moga dodawac zdjecia"
on storage.objects for insert
to authenticated
with check (bucket_id = 'recipe-images');

drop policy if exists "Zalogowani moga usuwac zdjecia" on storage.objects;
create policy "Zalogowani moga usuwac zdjecia"
on storage.objects for delete
to authenticated
using (bucket_id = 'recipe-images');

-- 4. Włączenie Supabase Realtime dla tabeli recipes (synchronizacja na żywo między telefonami)
do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (
           select 1
           from pg_publication_tables
           where pubname = 'supabase_realtime'
             and schemaname = 'public'
             and tablename = 'recipes'
       ) then
        alter publication supabase_realtime add table public.recipes;
    end if;
end
$$;
