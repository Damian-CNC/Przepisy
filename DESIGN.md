# DESIGN.md — Nasze Przepisy (Apple Liquid Glass Edition)

> **Pojedyncze źródło prawdy (Single Source of Truth)** dla warstwy wizualnej, tokenów projektowych, ergonomii oraz komponentów bazowych PWA **„Nasze Przepisy”**.  
> Opracowane na bazie estetyki **Apple Liquid Glass (iOS 26 / visionOS)**, standardu `google-labs-code/design.md` oraz wytycznych ergonomicznych `nextlevelbuilder/ui-ux-pro-max-skill` i fizyki animacji `emilkowalski/skills`.

---

## 1. Filozofia Designu i Ergonomia Kuchenna

Aplikacja jest prywatną, dwuosobową książką kucharską zaprojektowaną do pracy **w warunkach kuchennych** (przy blacie, często z mokrymi lub brudnymi rękami, jedną ręką, w zmiennym oświetleniu dziennym i wieczornym).

### Kluczowe filary:
1. **Optyczna głębia Liquid Glass:** Interfejs zbudowany jest z warstw półprzezroczystego szkła zawieszonych nad ciepłym, kulinarnym tłem Ambient Mesh. Załamanie światła na krawędziach (specular highlights) i wielowarstwowe rozmycie (`backdrop-blur-2xl backdrop-saturate-150`) nadają lekkość bez poświęcania czytelności.
2. **Ergonomia jednej ręki (Thumb Zone):** Główne akcje (pływająca nawigacja, przycisk „Rozpocznij gotowanie”, „Następny krok”) znajdują się w dolnej strefie kciuka z poszanowaniem bezpiecznych marginesów (`env(safe-area-inset-bottom)`).
3. **Duże cele dotykowe (Tap Targets):**
   - Minimalny rozmiar każdego interaktywnego przycisku / pigułki nawigacyjnej: **`44px × 44px`** (`min-h-11`).
   - W trybie gotowania „Krok po kroku” oraz przyciskach głównych (`lg`): **`52px–56px`** (`min-h-13`), aby można było trafić nawet zewnętrzną stroną dłoni lub knykciem.
4. **Czytelność z odległości 1 metra:**
   - W widoku normalnym minimalny kontrast tekstu na szkle wynosi **WCAG AA (>= 4.5:1)**.
   - W trybie gotowania instrukcje kroków wykorzystują duży, czytelny krój (`text-xl md:text-2xl font-medium leading-relaxed`) i podwyższony kontrast (**>= 7:1**), a liczby (gramatury, timery) korzystają z `tabular-nums`.
5. **Spokój wizualny (Content-First):** Zero zbędnych obramowań i dekoracyjnego szumu — głównym bohaterem są zdjęcia potraw i czytelna lista składników dla bieżącego kroku.

---

## 2. Paleta Kolorów i Ambient Mesh Background

Aplikacja wspiera natywnie tryb jasny i ciemny (`color-scheme: light dark` na `:root` + `<meta name="color-scheme" content="light dark">`), automatycznie dostosowując natywne paski przewijania, formularze i powierzchnie szkła.

### 2.1. Tryb jasny (Light Mode — Poranna Kuchnia)
| Rola | Nazwa | Wartość / Token | Zastosowanie |
| :--- | :--- | :--- | :--- |
| **Canvas Tła** | Kremowa Biel | `#FBF8F3` (`--canvas-bg`) | Bazowe tło pod warstwą Ambient Mesh |
| **Mesh 1 (Góra lewo)** | Szałwia (Sage) | `rgba(167, 198, 172, 0.55)` | Chłodny ziołowy akcent przenikający przez szkło |
| **Mesh 2 (Środek prawo)** | Ciepła Brzoskwinia | `rgba(246, 190, 152, 0.55)` | Apetyczne ocieplenie kompozycji |
| **Mesh 3 (Dół środek)** | Kremowa Wanilia / Bursztyn | `rgba(244, 214, 166, 0.50)` | Miękka podstawa dla dolnej nawigacji |
| **Powierzchnia Szkła** | Glass Panel | `bg-white/65` | Karty, panele filtrów, sekcje treści |
| **Szkło Podniesione** | Glass Elevated | `bg-white/75` | Modale, aktywne karty, pływająca wyspa |
| **Tekst Główny** | Warm Stone 900 | `#1C1917` | Nagłówki, instrukcje gotowania, nazwy składników |
| **Tekst Drugorzędny** | Warm Stone 600 | `#57534E` | Metadane, opisy, podpowiedzi |
| **Akcent Główny** | Culinary Amber | `#B45309` / `#D97706` | Główne CTA, aktywne stany, akcent minutników |
| **Akcent Ziołowy** | Kitchen Sage | `#15803D` | Sukces, odhaczone składniki, status „Gotowe” |
| **Niebezpieczeństwo** | Tomato Crimson | `#DC2626` | Usuwanie przepisu, reset destrukcyjny |

### 2.2. Tryb ciemny (Dark Mode — Wieczorne Gotowanie)
| Rola | Nazwa | Wartość / Token | Zastosowanie |
| :--- | :--- | :--- | :--- |
| **Canvas Tła** | Głęboki Grafit (`zinc-950`) | `#09090B` (`--canvas-bg`) | Bazowe tło o niskiej emisji światła wieczorem |
| **Mesh 1 (Góra lewo)** | Głęboki Szmaragd | `rgba(6, 78, 59, 0.45)` | Szlachetny ziołowy ton w tle |
| **Mesh 2 (Środek prawo)** | Palony Bursztyn | `rgba(146, 64, 14, 0.35)` | Ciepły kulinarny blask |
| **Mesh 3 (Dół środek)** | Ciemna Szałwia | `rgba(20, 83, 45, 0.30)` | Głębia pod dolną kapsułą nawigacji |
| **Powierzchnia Szkła** | Glass Panel Dark | `bg-zinc-900/55` | Karty, panele, listy |
| **Szkło Podniesione** | Glass Elevated Dark | `bg-zinc-900/75` | Modale `<dialog>`, aktywna wyspa timerów |
| **Tekst Główny** | Warm Cream | `#FAF8F5` | Wysoki kontrast bez rażącej czystej bieli |
| **Tekst Drugorzędny** | Warm Stone 400 | `#A8A29E` | Metadane, etykiety pomocnicze |
| **Akcent Główny** | Warm Amber 400/500 | `#F59E0B` / `#FBBF24` | Główne CTA, podświetlenia, minutniki |
| **Akcent Ziołowy** | Emerald 400 | `#34D399` | Odhaczone składniki, potwierdzenia |
| **Niebezpieczeństwo** | Coral Red 400 | `#F87171` | Akcje destrukcyjne |

---

## 3. Tokeny i Klasy Apple Liquid Glass

### 3.1. Powierzchnie Szklane (Glass Panels)
Każda powierzchnia szklana łączy rozmycie, podbicie nasycenia barw tła (by kolory potraw i Ambient Mesh zachowały świeżość) oraz półprzezroczyste wypełnienie:
- **Standardowy panel (Glass Default):**
  ```txt
  backdrop-blur-2xl backdrop-saturate-150 bg-white/65 dark:bg-zinc-900/55
  ```
- **Podniesiony panel / Modal (Glass Elevated):**
  ```txt
  backdrop-blur-2xl backdrop-saturate-150 bg-white/78 dark:bg-zinc-900/72
  ```

### 3.2. Refleksy Świetlne (Specular Borders & Shadows)
Krawędzie imitują załamanie światła na fazowanym szkle — górna i obrysowa linia światła wewnętrznego plus miękki cień kierunkowy:
- **Obramowanie (Specular Border):**
  ```txt
  border border-white/40 dark:border-white/15
  ```
- **Cień z wewnętrznym refleksem (Specular Shadow):**
  - Tryb jasny:
    ```txt
    shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.6),0_8px_32px_0_rgba(0,0,0,0.08)]
    ```
  - Tryb ciemny:
    ```txt
    dark:shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.12),0_12px_40px_0_rgba(0,0,0,0.45)]
    ```

### 3.3. Pływająca Nawigacja i Dynamiczna Wyspa Timerów (Liquid Pill)
- Pełne zaokrąglenie `rounded-full`.
- Zawieszone nad treścią (`fixed` / `sticky` z bezpiecznymi marginesami `bottom-4` lub `top-4`).
- Przepuszczają przewijaną treść pod spodem dzięki `backdrop-blur-2xl backdrop-saturate-150`.

### 3.4. Czytelność na zdjęciach potraw
Na miniaturach i zdjęciach hero napisy i znaczniki (czas przygotowania, źródło, serduszko ulubionych) są zawsze chronione gradientem przyciemniającym (`bg-gradient-to-t from-black/75 via-black/25 to-transparent`) lub zamknięte w kapsułach `GlassPill`.

---

## 4. Typografia, Hierarchia i Siatka Odstępów

- **Rodzina kroju:** Systemowy stos Apple SF Pro (`-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", system-ui, sans-serif`).
- **Skala typograficzna:**
  - `Display / Hero`: `text-3xl sm:text-4xl font-semibold tracking-tight` (tytuł aplikacji / główny nagłówek widoku).
  - `Card Title / Modal Title`: `text-lg sm:text-xl font-semibold tracking-tight`.
  - `Cooking Instruction (1 m distance)`: `text-xl md:text-2xl font-medium leading-relaxed`.
  - `Body`: `text-base leading-relaxed`.
  - `Meta / Badge`: `text-xs sm:text-sm font-medium`.
  - `Numeric / Timer`: `tabular-nums font-semibold tracking-tight`.
- **Siatka odstępów (4px / 8px Grid):**
  - Zaokrąglenia: `rounded-3xl` (24px) dla kart `GlassCard` i modali `GlassModal`, `rounded-2xl` (16px) dla przycisków `GlassButton`, `rounded-full` dla `GlassPill`.
  - Odstępy wewnętrzne kart: `p-4` (`sm`), `p-5 sm:p-6` (`md`), `p-6 sm:p-8` (`lg`).
  - Odstępy między elementami siatki: `gap-3` / `gap-4` / `gap-6`.

---

## 5. Fizyka Animacji (Motion & Spring Physics)

Wzorce ruchu oparte o `framer-motion` i wytyczne `emilkowalski/skills`:
- **Mikrointerakcja naciśnięcia (Tactile Spring):**
  - `whileTap={{ scale: 0.97 }}`
  - `transition={{ type: 'spring', stiffness: 500, damping: 32, mass: 0.8 }}`
- **Wejście kart i elementów list (Gentle Spring):**
  - `initial={{ opacity: 0, y: 12, scale: 0.98 }}`
  - `animate={{ opacity: 1, y: 0, scale: 1 }}`
  - `transition={{ type: 'spring', stiffness: 360, damping: 28 }}`
- **Animacja natywnego `<dialog>` w Top Layer:**
  - Wykorzystuje natywne `@starting-style`, `transition-property: opacity, transform, display, overlay;` oraz `transition-behavior: allow-discrete;` z fallbackiem `[data-closing]` dla przeglądarek bez pełnego wsparcia `overlay`.
- **Poszanowanie `prefers-reduced-motion`:**
  - W JS: hook `useReducedMotion()` z `framer-motion` wyłącza animacje skali/przesunięcia.
  - W CSS: ruch tła Ambient Mesh (`ambient-drift`) oraz skalowanie modala są zamknięte w `@media (prefers-reduced-motion: no-preference)`. Przy `prefers-reduced-motion: reduce` pozostaje jedynie krótkie przenikanie (`0.1s`).

---

## 6. Specyfikacja Komponentów Bazowych (`src/components/ui/`)

### 6.1. `GlassCard` (`src/components/ui/GlassCard.tsx`)
Kontener prezentacyjny w estetyce Liquid Glass.
- **Warianty (`variant`):**
  - `default`: Standardowa karta szklana (`bg-white/65 dark:bg-zinc-900/55`), specularyzowane obramowanie, miękki cień.
  - `elevated`: Podniesiona warstwa (`bg-white/78 dark:bg-zinc-900/75`), mocniejsza separacja od tła.
  - `interactive`: Wariant klikalny/dotykowy oparty o `motion.div` z delikatnym uniesieniem przy najechaniu i sprężynowym ugięciem przy kliknięciu (`whileTap`), opcjonalnym `onClick` i obsługą klawiatury (`Enter` / `Space` lub semantycznym przyciskiem wewnątrz).
- **Padding (`padding`):** `'none' | 'sm' | 'md' | 'lg'` (domyślnie `'md'`).

### 6.2. `GlassButton` (`src/components/ui/GlassButton.tsx`)
Przycisk z fizyką spring i celami dotykowymi dostosowanymi do kuchni.
- **Warianty (`variant`):**
  - `primary`: Ciepły bursztynowy gradient z refleksem świetlnym u góry i białym tekstem wysokiego kontrastu (`from-amber-600 to-amber-700 dark:from-amber-500 dark:to-amber-600`).
  - `secondary`: Szklana powierzchnia Liquid Glass (`bg-white/70 dark:bg-zinc-800/65`) ze specular border.
  - `ghost`: Przezroczyste tło, subtelne rozświetlenie szkła na hover/active.
  - `danger`: Czerwony akcent szklany (`bg-red-600/90 text-white` / subtelne światło krawędziowe) dla akcji destrukcyjnych.
- **Rozmiary (`size`):**
  - `sm`: `min-h-9 px-3.5 text-sm` (elementy pomocnicze).
  - `md`: `min-h-11 px-5 text-base` (**min. 44px wysokości** — standard dotykowy).
  - `lg`: `min-h-13 px-6 text-lg` (**min. 52px wysokości** — tryb gotowania).
- **Właściwości dodatkowe:** `leftIcon`, `rightIcon`, `isLoading`, `loadingText`, `fullWidth`.

### 6.3. `GlassModal` (`src/components/ui/GlassModal.tsx`)
Natywny modal oparty o element `<dialog>` w Top Layer przeglądarki.
- **Zasady platformowe (Modern Web Standards):**
  - Otwierany przez `dialogRef.current?.showModal()` i zamykany przez `dialogRef.current?.close()`.
  - **Zakaz** ręcznego dodawania `role="dialog"`, `aria-modal`, własnego focus-trapa czy przełączania `inert` — przeglądarka zapewnia to natywnie dla `showModal()`.
  - Nazwa dostępnościowa przez `aria-labelledby` (wskazujące na `<h2>` z unikalnym `useId()`) lub `aria-label`, gdy nagłówek jest ukryty.
  - Atrybut `closedby="any"` (lub `'closerequest'` / `'none'`) z lekkim fallbackiem w JS dla przeglądarek bez `'closedBy' in HTMLDialogElement.prototype` (weryfikacja `pointerdown` i `pointerup` poza `getBoundingClientRect()`).
  - Synchronizacja stanu `isOpen` przez zdarzenie `close` (z czyszczeniem `dialog.returnValue = ''`).
  - Brak blokowania scrolla na `html`/`body` (`overflow: hidden`) — zamiast tego CSS `dialog:modal { overscroll-behavior: contain; }` oraz `dialog::backdrop { overflow: hidden; overscroll-behavior: contain; }`.

### 6.4. `GlassPill` (`src/components/ui/GlassPill.tsx`)
Komponent kapsułowy (`rounded-full`) dla pływającej nawigacji, filtrów kategorii, tagów oraz **Dynamicznej Wyspy Timerów**.
- **Warianty (`variant`):**
  - `surface`: Neutralna kapsuła szklana (kontener pływającej nawigacji, nieaktywne filtry).
  - `active`: Wyróżniona kapsuła aktywnego filtra / zakładki (bursztynowy lub ciemny kontrastowy wypełniacz z wewnętrznym refleksem).
  - `island`: Ciemniejsza, wysoko kontrastowa kapsuła dla Dynamicznej Wyspy Timerów na górze ekranu (wyraźne odliczanie w `tabular-nums`).
  - `tag`: Lekka etykieta metadanych (np. `25 min`, `Instagram`, `2 porcje`).
- **Interaktywność:** Gdy przekazano `onClick` lub `as="button"`, renderuje natywny `<button type="button">` z minimalną wysokością `44px` dla rozmiarów `md`/`lg` oraz sprężynową animacją `whileTap`.

### 6.5. `AmbientBackground` (`src/components/ui/AmbientBackground.tsx`)
Stała warstwa tła (`fixed inset-0 -z-10 pointer-events-none`) generująca miękkie, kulinarne plamy kolorystyczne (szałwia, brzoskwinia, wanilia w light mode; grafit, szmaragd, bursztyn w dark mode), które nadają głębię panelom Liquid Glass. Animacja dryfu działa wyłącznie przy `prefers-reduced-motion: no-preference`.
