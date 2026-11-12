# PLAN WDROŻENIA APLIKACJI KULINARNEJ PWA ("NASZE PRZEPISY" - APPLE LIQUID GLASS EDITION)

## 0. DYREKTYWY OPERACYJNE DLA GOOGLE ANTIGRAVITY (PRZECZYTAJ PRZED STARTEM!)

Jesteś Głównym Architektem i Orkiestratorem w środowisku **Google Antigravity**. Twoim zadaniem jest zbudowanie od zera do stanu produkcyjnego prywatnej, dwuosobowej aplikacji PWA do gromadzenia, tłumaczenia i gotowania przepisów (w stylu ReciMe + Thermomix), hostowanej na **GitHub Pages** z backendem **Supabase** oraz **Google AI Studio (Gemini API)**.

### ZASADY BEZWZGLĘDNE (HARD RULES):
1. **Zasada "Pytaj, gdy nie wiesz" (Clarification First):**
   - Nigdy nie zgaduj kluczy API, nazw repozytoriów, adresów URL projektu Supabase ani preferencji użytkownika, jeśli nie są jawnie podane.
   - Przed rozpoczęciem każdego etapu wymagającego danych zewnętrznych (np. konfiguracja `.env`, połączenie z Supabase, wybór metody scrapowania Instagrama), **zatrzymaj się i zadaj użytkownikowi konkretne, krótkie pytania**.
2. **Architektura Wielu Subagentów (Multi-Agent Orchestration):**
   - Rozdzielaj pracę pomiędzy wyspecjalizowanych subagentów (twórz ich w miarę potrzeb dla równoległych lub specjalistycznych zadań):
     - **`Subagent-Architect-DB`**: Odpowiada za schemat SQL w Supabase, polityki bezpieczeństwa RLS, konfigurację Supabase Storage oraz kod Deno w Supabase Edge Functions + integrację z `@google/genai`.
     - **`Subagent-LiquidGlass-UI`**: Odpowiada za stworzenie `DESIGN.md` oraz implementację interfejsu w estetyce **Apple Liquid Glass (iOS 26 / visionOS)** przy użyciu wskazanych repozytoriów GitHub.
     - **`Subagent-Frontend-PWA`**: Odpowiada za logikę React + Vite + TypeScript, obsługę stanu, kompresję zdjęć, Web Share Target API, Screen Wake Lock API oraz tryb gotowania "Thermomix".
     - **`Subagent-QA-Auditor`**: Niezależny audytor uruchamiany **OBOWIĄZKOWO po każdym etapie**.
3. **Obowiązkowy Audyt Zgodności po każdym etapie (Zero-Error Gate):**
   - Żaden etap nie może zostać uznany za zakończony bez przeprowadzenia pełnego audytu przez `Subagent-QA-Auditor`.
   - Audyt obejmuje:
     1. `npm run typecheck` (`tsc --noEmit`) – 0 błędów typowania.
     2. `npm run lint` – 0 błędów ESLint.
     3. `npm run build` – czysty build produkcyjny bez błędów.
     4. Weryfikację wizualną i funkcjonalną zgodności z wymaganiami etapu oraz ze specyfikacją `DESIGN.md` (Apple Liquid Glass).
   - Jeśli pojawi się choćby 1 błąd, subagenci naprawiają go przed przejściem do kolejnego etapu.

---

## 1. DESIGN SYSTEM: APPLE LIQUID GLASS & REPOZYTORIA UI/UX

Aplikacja ma wyglądać nowocześnie, lekko i ultra-intuicyjnie, nawiązując do stylistyki **Apple Liquid Glass**. Wykorzystaj wiedzę, wzorce oraz komponenty z poniższych 14 repozytoriów GitHub:

### A. Repozytoria Reguł, Skilli i Architektury Designu (Zainstaluj / Pobierz wzorce do `.agent/skills` oraz `DESIGN.md`):
1. `nextlevelbuilder/ui-ux-pro-max-skill` – główne wytyczne UX/UI, hierarchia wizualna, ergonomia mobilna (obsługa jedną ręką w kuchni).
2. `google-labs-code/design.md` oraz `VoltAgent/awesome-design-md` – standard struktury pliku `DESIGN.md`, który musisz wygenerować w Etapie 1 jako pojedyncze źródło prawdy o wyglądzie aplikacji.
3. `emilkowalski/skills` – zasady fizyki animacji, płynne przejścia sprężynowe (spring animations), mikrointerakcje przy odhaczaniu składników i przełączaniu kroków.
4. `Leonxlnx/taste-skill` oraz `pbakaus/impeccable` – dbałość o detale wizualne (pixel-perfect spacing, subtelne cienie wewnętrzne, brak przeładowania interfejsu).
5. `greensock/gsap-skills` – płynne przejścia w karuzeli trybu "Gotuj krok po kroku" oraz animacje aktywnych minutników.

### B. Repozytoria Komponentów i Efektów Wizualnych:
6. `DavidHDev/react-bits` oraz `magicuidesign/magicui` – animowane karty przepisów, efekty świetlne (shimmer podczas importu AI), płynne listy i liczniki czasu.
7. `nexu-io/open-design` oraz `Nutlope/hallmark` – czyste, nowoczesne układy formularzy, modali importu i kart podglądu.
8. `oso95/scroll-world`, `DavidHDev/canvas-ui`, `enesozturk/dimensional-drawing` – inspiracje do płynnego przewijania z efektem paralaksy zdjęcia potrawy oraz trójwymiarowej głębi warstw szkła.

### C. Specyfikacja Techniczna "Apple Liquid Glass" (Wymagane klasy i tokeny CSS):
- **Powierzchnie (Glass Panels):** Wielowarstwowe rozmycie tła `backdrop-blur-2xl backdrop-saturate-150`, półprzezroczyste tła `bg-white/65 dark:bg-zinc-900/55`.
- **Refleksy świetlne (Specular Borders):** Krawędzie imitujące załamanie światła na szkle: `border border-white/40 dark:border-white/15` oraz cień wewnętrzny `shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.6),0_8px_32px_0_rgba(0,0,0,0.08)]`.
- **Tło aplikacji (Ambient Mesh Background):** Subtelne, rozmyte plamy kolorystyczne w tle (ciepłe odcienie kulinarne: szałwia, brzoskwinia, kremowa biel w trybie jasnym; głęboki grafit, bursztyn i szmaragd w trybie ciemnym), które przenikają przez półprzezroczyste karty Liquid Glass.
- **Pływająca Nawigacja i Dynamiczna Wyspa Timerów (Liquid Pill):** Dolny pasek nawigacji oraz górna pływająca kapsuła aktywnych minutników zawieszone nad treścią z zaokrągleniem `rounded-full`.

---

## 2. PLAN WDROŻENIA KROK PO KROKU

---

### ETAP 1: Inicjalizacja Projektu, Konfiguracja Środowiska i Plik `DESIGN.md`

**Cel:** Stworzenie szkieletu aplikacji React + Vite + TypeScript + Tailwind CSS, skonfigurowanie architektury pod GitHub Pages i wygenerowanie pliku `DESIGN.md`.

**Kroki dla Antigravity:**
1. **Zadaj pytania użytkownikowi:**
   - Jaka będzie dokładna nazwa repozytorium na GitHubie? (Wymagane do poprawnego ustawienia `base: '/nazwa-repo/'` w `vite.config.ts` dla GitHub Pages).
   - Czy posiadasz już utworzony projekt w Supabase oraz klucz API z Google AI Studio, czy mam przeprowadzić Cię przez ich pobranie?
2. Zainicjuj projekt: **Vite + React + TypeScript + Tailwind CSS**.
3. Zainstaluj niezbędne biblioteki:
   - `@supabase/supabase-js` (komunikacja z bazą, Auth i Storage)
   - `lucide-react` (ikony w stylu Apple SF Symbols)
   - `framer-motion` oraz `gsap` (animacje sprężynowe wg `emilkowalski/skills` i `greensock/gsap-skills`)
   - `browser-image-compression` (kompresja zdjęć do WebP przed wysyłką do Supabase Storage)
   - `canvas-confetti` (efekt ukończenia gotowania)
   - `vite-plugin-pwa` (obsługa PWA, manifestu i Web Share Target)
4. Niech `Subagent-LiquidGlass-UI` utworzy plik `DESIGN.md` bazując na wzorcach z `google-labs-code/design.md` oraz `nextlevelbuilder/ui-ux-pro-max-skill`, definiując komponenty bazowe: `GlassCard`, `GlassButton`, `GlassModal`, `GlassPill`.

> **AUDYT ZGODNOŚCI #1 (`Subagent-QA-Auditor`):**
> - Sprawdź poprawność instalacji paczek, konfigurację `vite.config.ts` i `tsconfig.json`.
> - Uruchom `npm run typecheck` oraz `npm run build`.
> - Zweryfikuj obecność i kompletność pliku `DESIGN.md`.
> - Raportuj wynik użytkownikowi przed przejściem do Etapu 2.

---

### ETAP 2: Wdrożenie Bazy Danych Supabase & Storage (Generowanie i wdrożenie SQL)

**Cel:** Przygotowanie pełnej struktury bazy danych PostgreSQL w Supabase, koszyka Storage na zdjęcia oraz polityk bezpieczeństwa (RLS) dla użytkownika i jego żony.

**Kroki dla Antigravity (`Subagent-Architect-DB`):**
1. Jeśli serwer Supabase MCP jest dostępny, wykonaj migrację bezpośrednio. Jeśli nie – wygeneruj plik `supabase/schema.sql` i poproś użytkownika o wklejenie go w **Supabase SQL Editor**.
2. **Kompletny kod SQL do wdrożenia (`supabase/schema.sql`):**

```sql
-- Włączenie rozszerzenia UUID
create extension if not exists "uuid-ossp";

-- 1. Tabela główna przepisów
create table public.recipes (
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
    -- Struktura JSONB składników ogólnych: [{ "name": "Mąka", "amount": 200, "unit": "g", "category": "Suche" }]
    ingredients jsonb not null default '[]'::jsonb,
    -- Struktura JSONB kroków pod tryb Thermomix:
    -- [{ "step_number": 1, "instruction": "Wymieszaj składniki...", "step_ingredients": [{ "name": "Mąka", "amount": 200, "unit": "g" }], "timer_seconds": 120, "tip": "Na wolnych obrotach" }]
    steps jsonb not null default '[]'::jsonb,
    nutrition jsonb default null,
    created_by uuid references auth.users(id) on delete set null
);

-- Indeksy dla szybkiego wyszukiwania
create index recipes_created_at_idx on public.recipes (created_at desc);
create index recipes_category_idx on public.recipes (category);
create index recipes_is_favorite_idx on public.recipes (is_favorite);

-- 2. Włączenie Row Level Security (RLS)
alter table public.recipes enable row level security;

-- Polityka: Tylko zalogowani użytkownicy (Ty i żona) mają pełny dostęp do wspólnej bazy przepisów
create policy "Wspolny dostep dla zalogowanych domownikow"
on public.recipes
for all
to authenticated
using (true)
with check (true);

-- Polityka dla budzika (Keep-Alive Cron): pozwala odpytać 1 rekord (tylko pole id) dla utrzymania aktywności bazy
create policy "Keep alive ping"
on public.recipes
for select
to anon
using (true);

-- 3. Utworzenie koszyka Supabase Storage na zdjęcia przepisów
insert into storage.buckets (id, name, public)
values ('recipe-images', 'recipe-images', true)
on conflict (id) do nothing;

-- Polityki Storage: Publiczny odczyt zdjęć, zapis/usuwanie tylko dla zalogowanych (Ciebie i żony)
create policy "Publiczny podglad zdjec przepisow"
on storage.objects for select
to public
using (bucket_id = 'recipe-images');

create policy "Zalogowani moga dodawac zdjecia"
on storage.objects for insert
to authenticated
with check (bucket_id = 'recipe-images');

create policy "Zalogowani moga usuwac zdjecia"
on storage.objects for delete
to authenticated
using (bucket_id = 'recipe-images');
```

3. Utwórz w kodzie klienta Supabase (`src/lib/supabase.ts`) wraz z pełnym typowaniem `Database` w TypeScript odpowiadającym powyższej tabeli.

> **AUDYT ZGODNOŚCI #2 (`Subagent-QA-Auditor`):**
> - Potwierdź z użytkownikiem, że tabele i koszyk `recipe-images` istnieją w Supabase, a w zakładce Authentication utworzono konta (lub jedno wspólne konto) dla niego i żony.
> - Sprawdź połączenie z Supabase i brak błędów kompilacji TypeScript (`npm run typecheck`).

---

### ETAP 3: Wdrożenie Supabase Edge Function (`import-recipe` + Gemini API + Pobieranie Zdjęć)

**Cel:** Stworzenie bezserwerowej funkcji w Supabase, która przyjmuje link (z Instagrama, TikToka, bloga kulinarnego), surowy tekst lub zdjęcie, pobiera okładkę potrawy na stałe do Supabase Storage, a następnie za pomocą **Google AI Studio (Gemini API)** automatycznie tłumaczy przepis na język polski, przelicza jednostki na metryczne (gramy/ml) i dzieli go na kroki w formacie Thermomix.

**Kroki dla Antigravity (`Subagent-Architect-DB`):**
1. Wygeneruj plik `supabase/functions/import-recipe/index.ts`.
2. **Kompletny kod Edge Function (`supabase/functions/import-recipe/index.ts`):**

```typescript
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { GoogleGenAI, Type } from "npm:@google/genai@^1.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { url, rawText, imageBase64, mimeType } = await req.json();

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apifyToken = Deno.env.get("APIFY_API_TOKEN"); // Opcjonalny dla bezpośrednich linków IG

    if (!geminiApiKey) {
      throw new Error("Brak klucza GEMINI_API_KEY w zmiennych środowiskowych Supabase.");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });

    let extractedText = rawText || "";
    let externalImageUrl: string | null = null;
    let sourcePlatform = "manual";

    // 1. Obsługa ekstrakcji z URL (Strony WWW oraz Instagram)
    if (url) {
      const isInstagram = url.includes("instagram.com");
      sourcePlatform = isInstagram ? "instagram" : "web";

      if (isInstagram && apifyToken) {
        // Automatyczny zrzut opisu i okładki z Instagrama przez Apify
        const apifyRes = await fetch(
          `https://api.apify.com/v2/acts/apify~instagram-post-scraper/run-sync-get-dataset-items?token=${apifyToken}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: [url], resultsLimit: 1 }),
          }
        );
        const items = await apifyRes.json();
        if (items && items.length > 0) {
          extractedText += "\n" + (items[0].caption || "");
          externalImageUrl = items[0].displayUrl || items[0].thumbnailUrl || null;
        }
      }

      // Pobranie metadanych OpenGraph (og:image, og:description) oraz treści przez Jina Reader
      try {
        const pageRes = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; RecipeBot/1.0)" },
        });
        const html = await pageRes.text();

        const ogImageMatch =
          html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
          html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
        if (ogImageMatch && !externalImageUrl) {
          externalImageUrl = ogImageMatch[1].replace(/&amp;/g, "&");
        }

        const ogDescMatch =
          html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
        if (ogDescMatch) {
          extractedText += "\n" + ogDescMatch[1];
        }

        // Pobranie czystej treści strony przez darmowy Jina Reader
        const jinaRes = await fetch(`https://r.jina.ai/${url}`);
        if (jinaRes.ok) {
          const jinaText = await jinaRes.text();
          extractedText += "\n" + jinaText.slice(0, 15000);
        }
      } catch (e) {
        console.warn("Błąd pobierania bezpośredniego HTML/Jina:", e);
      }
    }

    // 2. Pobranie zdjęcia ze źródła i trwały zapis w Supabase Storage (aby link z IG nie wygasł)
    let permanentImageUrl: string | null = null;
    if (externalImageUrl) {
      try {
        const imgRes = await fetch(externalImageUrl);
        if (imgRes.ok) {
          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          const arrayBuffer = await imgRes.arrayBuffer();
          const fileExt = contentType.includes("png") ? "png" : "jpg";
          const fileName = `imported/${crypto.randomUUID()}.${fileExt}`;

          const { error: uploadError } = await supabase.storage
            .from("recipe-images")
            .upload(fileName, arrayBuffer, { contentType, upsert: false });

          if (!uploadError) {
            const { data: publicUrlData } = supabase.storage
              .from("recipe-images")
              .getPublicUrl(fileName);
            permanentImageUrl = publicUrlData.publicUrl;
          }
        }
      } catch (imgErr) {
        console.warn("Nie udało się skopiować zdjęcia do Supabase Storage:", imgErr);
      }
    }

    // 3. Wywołanie Gemini API ze sztywnym schematem JSON (Structured Outputs pod Thermomix)
    const prompt = `
Jesteś profesjonalnym szefem kuchni i tłumaczem kulinarnym.
Przeanalizuj dostarczony materiał (tekst ze strony/Instagrama i/lub zdjęcie).
1. Wyciągnij kompletny przepis kulinarny.
2. PRZETŁUMACZ CAŁOŚĆ NA JĘZYK POLSKI.
3. Przelicz wszystkie jednostki anglosaskie (cups, oz, lbs, fahrenheit) na polskie jednostki metryczne (g, ml, szt., łyżki, łyżeczki, stopnie Celsjusza).
4. Podziel przygotowanie na logiczne, pojedyncze kroki w stylu Thermomixa.
5. KLUCZOWE: W każdym kroku w polu "step_ingredients" wypisz DOKŁADNIE te składniki i ich ilości, które są dodawane lub używane w TYM konkretnym kroku (aby użytkownik podczas gotowania nie musiał wracać do ogólnej listy składników).
6. Jeśli w kroku występuje pieczenie, gotowanie, odstawienie lub smażenie przez określony czas, przelicz ten czas na sekundy i wpisz w pole "timer_seconds" (np. 10 minut = 600). Jeśli brak czasu, wpisz 0.
`;

    const contents: any[] = [{ text: prompt }];
    if (extractedText.trim()) {
      contents.push({ text: `TREŚĆ ŹRÓDŁOWA:\n${extractedText}` });
    }
    if (imageBase64 && mimeType) {
      sourcePlatform = "photo";
      contents.push({
        inlineData: {
          data: imageBase64,
          mimeType: mimeType,
        },
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "Nazwa potrawy po polsku" },
            description: { type: Type.STRING, description: "Krótki, apetyczny opis potrawy (1-2 zdania)" },
            prep_time_minutes: { type: Type.INTEGER, description: "Czas przygotowania w minutach" },
            cook_time_minutes: { type: Type.INTEGER, description: "Czas gotowania/pieczenia w minutach" },
            servings: { type: Type.INTEGER, description: "Liczba porcji" },
            category: {
              type: Type.STRING,
              description: "Jedna z kategorii: Śniadanie, Obiad, Kolacja, Deser, Przekąska, Napój, Wypieki",
            },
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Tagi np. Szybkie, Włoskie, Wegetariańskie, Kurczak",
            },
            ingredients: {
              type: Type.ARRAY,
              description: "Pełna lista wszystkich składników",
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  amount: { type: Type.NUMBER },
                  unit: { type: Type.STRING },
                },
                required: ["name", "amount", "unit"],
              },
            },
            steps: {
              type: Type.ARRAY,
              description: "Kroki przygotowania w stylu Thermomix",
              items: {
                type: Type.OBJECT,
                properties: {
                  step_number: { type: Type.INTEGER },
                  instruction: { type: Type.STRING, description: "Jasna instrukcja co zrobić w tym kroku" },
                  step_ingredients: {
                    type: Type.ARRAY,
                    description: "Składniki dodawane konkretnie w tym kroku wraz z ilością",
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        name: { type: Type.STRING },
                        amount: { type: Type.NUMBER },
                        unit: { type: Type.STRING },
                      },
                      required: ["name", "amount", "unit"],
                    },
                  },
                  timer_seconds: {
                    type: Type.INTEGER,
                    description: "Czas minutnika w sekundach (0 jeśli krok nie wymaga odliczania czasu)",
                  },
                  tip: { type: Type.STRING, description: "Opcjonalna wskazówka kulinarna do kroku" },
                },
                required: ["step_number", "instruction", "step_ingredients", "timer_seconds"],
              },
            },
          },
          required: ["title", "prep_time_minutes", "cook_time_minutes", "servings", "category", "ingredients", "steps"],
        },
      },
    });

    const parsedRecipe = JSON.parse(response.text || "{}");

    return new Response(
      JSON.stringify({
        recipe: {
          ...parsedRecipe,
          source_url: url || null,
          source_platform: sourcePlatform,
          image_url: permanentImageUrl,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Błąd podczas importu przepisu" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

3. Poinstruuj użytkownika (lub wykonaj przez CLI), jak wdrożyć funkcję:
   - `npx supabase secrets set GEMINI_API_KEY=twoj_klucz_z_google_ai_studio`
   - `npx supabase functions deploy import-recipe --no-verify-jwt`

> **AUDYT ZGODNOŚCI #3 (`Subagent-QA-Auditor`):**
> - Przetestuj wywołanie funkcji `import-recipe` z przykładowym linkiem oraz tekstem w języku angielskim.
> - Sprawdź, czy odpowiedź zwraca poprawny JSON po polsku, z podzielonymi składnikami na kroki (`step_ingredients`) oraz zapisanym zdjęciem w Supabase Storage.

---

### ETAP 4: Frontend w stylu Apple Liquid Glass – Lista, Szczegóły, Dodawanie i Kompresja Zdjęć

**Cel:** Zbudowanie głównych widoków aplikacji z zachowaniem estetyki **Apple Liquid Glass** oraz synchronizacji w czasie rzeczywistym między telefonem użytkownika i żony.

**Kroki dla Antigravity (`Subagent-LiquidGlass-UI` & `Subagent-Frontend-PWA`):**
1. **Ekran Logowania (Domownicy):**
   - Szklany panel logowania e-mail/hasło (lub Magic Link) z zapamiętywaniem sesji na stałe (`persistSession: true`).
2. **Ekran Główny (Baza Przepisów):**
   - Pływający pasek wyszukiwania i filtrów kategorii wykonany w stylu Liquid Glass (`backdrop-blur-2xl`).
   - Siatka kart przepisów z dużymi zdjęciami, czasem przygotowania, oznaczeniem źródła (ikona Instagrama / Web / Własne) i przyciskiem Ulubione (serduszko z mikroanimacją wg `emilkowalski/skills`).
   - Subskrypcja Supabase Realtime na tabeli `recipes` – gdy żona doda lub zmieni przepis, lista odświeża się natychmiast bez przeładowania strony.
3. **Modal Importu "Jak w ReciMe" (Smart Importer):**
   - 3 zakładki w szklanej kapsule:
     1. **Z linku / Instagrama:** Pole na URL + opcjonalne pole na wklejenie skopiowanego opisu rolki (jako niezawodny fallback dla prywatnych kont IG).
     2. **Ze zdjęcia / Zrzutu ekranu:** Wybór z galerii lub zrobienie zdjęcia książki kucharskiej / ekranu (wysyła obraz do Gemini, które robi OCR + tłumaczenie!).
     3. **Wpisz ręcznie:** Klasyczny, wygodny formularz.
   - Animacja ładowania w stylu `magicuidesign/magicui` (efekt "AI mieli przepis, tłumaczy i waży składniki...").
4. **Obsługa i Kompresja Zdjęć:**
   - W każdym przepisie możliwość dodania lub podmiany zdjęcia potrawy z aparatu/galerii.
   - Zawsze przed uploadem do koszyka `recipe-images` przepuszczaj plik przez `browser-image-compression` (`maxSizeMB: 0.25`, `maxWidthOrHeight: 1400`, `fileType: 'image/webp'`).
5. **Widok Szczegółów Przepisu:**
   - Zdjęcie nagłówkowe z płynnym efektem paralaksy przy przewijaniu (`oso95/scroll-world`).
   - **Interaktywny przelicznik porcji** (np. zmiana z 2 na 4 porcje automatycznie przelicza gramatury na liście składników ORAZ wewnątrz poszczególnych kroków gotowania!).
   - Duży, wyróżniony przycisk pływający na dole ekranu: **„Rozpocznij gotowanie (Krok po kroku)”**.

> **AUDYT ZGODNOŚCI #4 (`Subagent-QA-Auditor`):**
> - Sprawdź `npm run typecheck`, `npm run lint`, `npm run build`.
> - Zweryfikuj kontrast tekstów na półprzezroczystych tłach Liquid Glass (zarówno na jasnych, jak i ciemnych zdjęciach potraw).
> - Przetestuj kompresję zdjęcia i zapis do Supabase Storage.

---

### ETAP 5: Tryb "Gotuj Krok po Kroku" (Thermomix Experience + Wake Lock + Timery)

**Cel:** Stworzenie flagowego trybu prowadzenia za rękę podczas gotowania.

**Kroki dla Antigravity (`Subagent-Frontend-PWA`):**
1. **Blokada Wygaszania Ekranu (Screen Wake Lock API):**
   - Utwórz custom hook `useWakeLock.ts`, który automatycznie wywołuje `navigator.wakeLock.request('screen')` po wejściu w tryb „Gotuj” i odnawia blokadę przy powrocie do karty (`visibilitychange`). Wyświetl małą ikonkę informującą, że ekran nie zgaśnie.
2. **Interfejs Karuzeli Kroków (Thermomix UI):**
   - Pełnoekranowy widok z paskiem postępu na górze (np. `Krok 3 z 7`).
   - **Sekcja "Dodaj w tym kroku":** Wyraźna szklana karta prezentująca wyłącznie składniki z `step.step_ingredients` (przeliczone przez aktualny mnożnik porcji!) z możliwością odhaczenia każdego składnika jednym stuknięciem palca.
   - **Sekcja Instrukcji:** Duża, czytelna czcionka (`text-xl md:text-2xl font-medium`), którą łatwo przeczytać z odległości 1 metra od blatu kuchennego.
3. **System Wbudowanych Minutników (Multi-Timer Liquid Island):**
   - Jeśli `step.timer_seconds > 0`, w kroku pojawia się duży przycisk w stylu Liquid Glass: **„Uruchom minutnik (np. 12:00)”** z możliwością pauzy, dodania +1 minuty i resetu.
   - Jeśli użytkownik przejdzie do kolejnego kroku, a minutnik nadal odlicza, minutnik dokuje się na górze ekranu jako pływająca kapsuła (**Liquid Dynamic Island**), pokazując odliczanie na żywo.
   - Po zakończeniu odliczania: wygeneruj przyjemny sygnał dźwiękowy przez **Web Audio API** (syntezator dźwięku dzwonka w przeglądarce – nie wymaga zewnętrznych plików MP3!) + wibrację (`navigator.vibrate([300, 100, 300])`).
4. **Nawigacja dla Brudnych Rąk:**
   - Bardzo duże przyciski „Poprzedni” / „Następny krok” na dole ekranu + obsługa gestów przesuwania palcem (swipe w lewo/prawo).
   - Na ostatnim kroku przycisk **„Gotowe! Smacznego 🎉”** wywołujący animację konfetti.

> **AUDYT ZGODNOŚCI #5 (`Subagent-QA-Auditor`):**
> - Przetestuj przeliczanie gramatur składników wewnątrz kroków po zmianie liczby porcji.
> - Zweryfikuj działanie wielu timerów jednocześnie i sygnału dźwiękowego Web Audio API.
> - Sprawdź poprawność zwalniania `WakeLock` po wyjściu z trybu gotowania.
> - Uruchom `npm run typecheck` i `npm run build`.

---

### ETAP 6: PWA, Web Share Target API & Skrót iOS ("Udostępnij do aplikacji jak w ReciMe")

**Cel:** Umożliwienie wysyłania postów bezpośrednio z aplikacji Instagram, TikTok czy przeglądarki Chrome/Safari jednym kliknięciem z systemowego menu „Udostępnij”.

**Kroki dla Antigravity (`Subagent-Frontend-PWA`):**
1. Skonfiguruj `vite-plugin-pwa` w `vite.config.ts` z pełnym `manifest.webmanifest`:
   ```json
   "share_target": {
     "action": "./",
     "method": "GET",
     "params": {
       "title": "shared_title",
       "text": "shared_text",
       "url": "shared_url"
     }
   }
   ```
2. W głównym komponencie `App.tsx` dodaj hook nasłuchujący parametry URL przy starcie aplikacji:
   - Odczytaj `shared_url`, `shared_text` lub `importUrl`.
   - Jeśli w `shared_text` znajduje się link (częste zachowanie Instagrama na Androidzie), wyciągnij go wyrażeniem regularnym `/(https?:\/\/[^\s]+)/g`.
   - Automatycznie otwórz Modal Importu i **od razu rozpocznij przetwarzanie przepisu przez AI**, wyświetlając podgląd zaimportowanego przepisu do zatwierdzenia jednym kliknięciem!
3. Dodaj w Ustawieniach aplikacji krótką, ilustrowaną kartę **„Jak udostępniać z Instagrama na iPhone (iOS)”**, która tłumaczy w 3 punktach, jak dodać systemowy Skrót (Shortcut) otwierający adres `https://<TWOJ_LOGIN>.github.io/<NAZWA_REPO>/?importUrl=[Skrót z menu Udostępnij]`.

> **AUDYT ZGODNOŚCI #6 (`Subagent-QA-Auditor`):**
> - Zasymuluj wejście na adres `/?shared_text=Sprawdz%20ten%20przepis%20https://www.instagram.com/p/xyz/` i sprawdź, czy aplikacja automatycznie uruchamia proces importu i czyści pasek adresu (`window.history.replaceState`).
> - Zweryfikuj poprawność generowania Service Workera i manifestu PWA podczas `npm run build`.

---

### ETAP 7: Wdrożenie na GitHub Pages + Automatyczny "Budzik" Supabase (GitHub Actions)

**Cel:** Zautomatyzowanie publikacji aplikacji na GitHub Pages oraz zabezpieczenie darmowej bazy Supabase przed zawieszeniem po 7 dniach bezczynności.

**Kroki dla Antigravity (`Subagent-Architect-DB`):**
1. Utwórz workflow wdrażający aplikację na GitHub Pages: `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: ["main"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: true

jobs:
  build-and-deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Build PWA
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
        run: npm run build

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: "./dist"

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

2. Utwórz workflow "Budzika" Supabase: `.github/workflows/supabase-keep-alive.yml`:

```yaml
name: Supabase Keep-Alive Ping

on:
  schedule:
    # Uruchamia się automatycznie co 3 dni o godzinie 08:00 UTC
    - cron: "0 8 */3 * *"
  workflow_dispatch:

jobs:
  ping-supabase:
    runs-on: ubuntu-latest
    steps:
      - name: Ping Supabase REST API
        env:
          SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
        run: |
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
            "${SUPABASE_URL}/rest/v1/recipes?select=id&limit=1" \
            -H "apikey: ${SUPABASE_ANON_KEY}" \
            -H "Authorization: Bearer ${SUPABASE_ANON_KEY}")
          echo "Supabase Keep-Alive HTTP Status: $STATUS"
          if [ "$STATUS" -ne 200 ]; then
            echo "Błąd pingowania Supabase!"
            exit 1
          fi
```

3. Wyświetl użytkownikowi krótką instrukcję końcową, jakie 2 sekrety (`VITE_SUPABASE_URL` oraz `VITE_SUPABASE_ANON_KEY`) należy dodać w ustawieniach repozytorium na GitHubie (`Settings -> Secrets and variables -> Actions`).

> **KOŃCOWY AUDYT ZGODNOŚCI E2E #7 (`Subagent-QA-Auditor`):**
> - Przeprowadź pełny przegląd wszystkich plików w projekcie.
> - Wykonaj `npm run typecheck`, `npm run lint`, `npm run build`.
> - Sprawdź responsywność wszystkich widoków (Mobile 375px, iPhone Pro Max 430px, Tablet/Desktop).
> - Potwierdź 100% zgodności z estetyką **Apple Liquid Glass** (`DESIGN.md`).
> - Przedstaw użytkownikowi podsumowanie gotowej aplikacji.