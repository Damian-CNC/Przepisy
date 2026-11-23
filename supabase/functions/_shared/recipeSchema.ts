export interface RecipeIngredient {
  name: string;
  amount: number | string;
  unit: string;
  category?: string;
}

export interface StepIngredient {
  name: string;
  amount: number;
  unit: string;
}

export interface RecipeStep {
  step_number: number;
  instruction: string;
  step_ingredients?: StepIngredient[];
  timer_seconds?: number;
  tip?: string | null;
  // Aliases dla kompatybilności wstecznej
  order?: number;
  text?: string;
  timerMinutes?: number | null;
}

export interface ValidatedRecipePayload {
  title: string;
  description: string;
  category: string;
  prep_time_minutes: number;
  prepTimeMinutes: number;
  cook_time_minutes: number;
  cookTimeMinutes: number;
  servings: number;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  imageSearchQuery: string;
}

/**
 * Instrukcja systemowa dla wszystkich operacji AI (tworzenie, import, edycja).
 * Zawiera regułę z punktu 13 (łączenie składników na ciasto metodą włoską)
 * oraz jednoznaczny podział składników na sekcje kulinarne (np. Ciasto, Farsz, Sos).
 */
export const RECIPE_SYSTEM_INSTRUCTION = `
Jesteś profesjonalnym Szefem Kuchni AI w polskiej aplikacji kulinarnej.
Twoim zadaniem jest tworzenie, strukturyzowanie lub edytowanie przepisów w języku polskim w formacie JSON zgodnym ze schematem.

KRYTYCZNE ZASADY KULINARNE:
1. ZASADA ŁĄCZENIA SKŁADNIKÓW NA CIASTO (METODA WŁOSKA) — DOTYCZY WYŁĄCZNIE KROKÓW (steps):
   - Ta zasada dotyczy WYŁĄCZNIE treści kroków przygotowania (steps[].instruction), NIGDY podziału składników (ingredients)!
   - Jeżeli w przepisie znajduje się polecenie typu „wymieszaj wszystkie składniki razem”, „dodaj wszystko na raz” (dla ciast, mas, naleśników, gofrów, biszkoptów itp.), w krokach przygotowania rozpisz to po włosku:
     a) W pierwszym kroku połącz składniki mokre (np. jajka, mleko, wodę, olej, roztopione masło, jogurt).
     b) W kolejnym kroku dodaj do nich składniki suche (np. mąkę, proszek do pieczenia, kakao, sól/cukier) i wymieszaj do połączenia.
   - WYJĄTEK (PRIORYTET AUTORA): Jeżeli autor przepisu podał własną kolejność (np. najpierw utrzeć masło z cukrem), zachowaj dokładnie kolejność autora.

2. PODZIAŁ SKŁADNIKÓW (ingredients[].category):
   - W polu "category" każdego składnika wpisz nazwę sekcji lub półwyrobu kulinarnego, np. "Ciasto", "Farsz", "Sos", "Polewa", "Kruszonka", "Zaparka", "Marynata", a jeśli danie nie ma wyraźnych podgrup — "Główne składniki".
   - BEZWZGLĘDNY ZAKAZ: Nigdy NIE wpisuj w polu category "Mokre" ani "Suche"! Składniki dzielimy według elementów potrawy, a nie ich stanu skupienia.

3. KROKI PRZYGOTOWANIA (steps):
   - Każdy krok MUSI mieć pola:
     - "step_number": kolejny numer kroku (1, 2, 3...)
     - "instruction": jasny, konkretny opis co zrobić w tym kroku
     - "step_ingredients": lista składników używanych w tym kroku z ilością i jednostką
     - "timer_seconds": czas trwania kroku w SEKUNDACH (np. 10 minut = 600, 30 minut = 1800, 1 minuta = 60). Jeśli krok nie ma timera, wpisz 0.
     - "tip": opcjonalna praktyczna wskazówka szefa kuchni lub null

4. KOMPLETNOŚĆ I PRECYZJA:
   - Podawaj konkretne ilości i jednostki (preferuj gramy 'g' dla wagi kuchennej, 'szt.', 'łyżeczka').
   - Pole imageSearchQuery wypełnij krótką, 2-4 wyrazową nazwą dania po angielsku do wyszukania zdjęcia (np. "fluffy shokupan japanese milk bread").
`.trim();

/**
 * Schemat OpenAPI dla Gemini Structured Output (responseSchema).
 */
export const RECIPE_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING", description: "Nazwa przepisu po polsku" },
    description: { type: "STRING", description: "Krótki, apetyczny opis dania (1-2 zdania)" },
    category: {
      type: "STRING",
      description: "Kategoria: Obiad, Śniadanie, Kolacja, Deser, Wypieki, Zupa, Przekąska, Napój",
    },
    prep_time_minutes: { type: "INTEGER", description: "Czas przygotowania w minutach" },
    cook_time_minutes: { type: "INTEGER", description: "Czas gotowania/pieczenia w minutach" },
    servings: { type: "INTEGER", description: "Liczba porcji" },
    ingredients: {
      type: "ARRAY",
      description: "Lista składników z podziałem na części dania w polu category",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING", description: "Nazwa składnika" },
          amount: { type: "NUMBER", description: "Ilość liczbowa (np. 200, 1.5, 0 dla 'wg uznania')" },
          unit: { type: "STRING", description: "Jednostka (np. g, szt., łyżeczka, szczypta)" },
          category: {
            type: "STRING",
            description: "Sekcja kulinarna: np. Ciasto, Farsz, Sos, Polewa, Główne składniki. ZAKAZ 'Mokre'/'Suche'!",
          },
        },
        required: ["name", "amount", "unit", "category"],
      },
    },
    steps: {
      type: "ARRAY",
      description: "Kolejne kroki przygotowania z instrukcją i timerem",
      items: {
        type: "OBJECT",
        properties: {
          step_number: { type: "INTEGER", description: "Numer kroku od 1" },
          instruction: { type: "STRING", description: "Instrukcja wykonania kroku" },
          step_ingredients: {
            type: "ARRAY",
            description: "Składniki dodawane w tym konkretnym kroku",
            items: {
              type: "OBJECT",
              properties: {
                name: { type: "STRING" },
                amount: { type: "NUMBER" },
                unit: { type: "STRING" },
              },
              required: ["name", "amount", "unit"],
            },
          },
          timer_seconds: {
            type: "INTEGER",
            description: "Czas timera w SEKUNDACH (np. 10 minut = 600). 0 jeśli brak timera.",
          },
          tip: { type: "STRING", nullable: true, description: "Wskazówka szefa kuchni lub null" },
        },
        required: ["step_number", "instruction"],
      },
    },
    imageSearchQuery: {
      type: "STRING",
      description: "Krótka angielska nazwa potrawy do wyszukiwania fotografii kulinarnych",
    },
  },
  required: [
    "title",
    "description",
    "category",
    "prep_time_minutes",
    "cook_time_minutes",
    "servings",
    "ingredients",
    "steps",
    "imageSearchQuery",
  ],
};

export class RecipeValidationError extends Error {
  readonly code = "VALIDATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "RecipeValidationError";
  }
}

function parseTimerSecondsFromInstruction(instruction: string, fallbackSeconds = 0): number {
  const safeFallback = Math.max(0, Math.round(Number(fallbackSeconds) || 0));
  if (!instruction || typeof instruction !== "string") return safeFallback;

  const clean = instruction.toLowerCase();
  const minMatch = clean.match(
    /(?:odstaw|piecz|gotuj|smaż|wyrastaj|duś|miksuj|studź|czekaj|pozostaw)?\s*(?:na|przez|ok\.?|około)?\s*(\d+(?:[.,]\d+)?)\s*(?:-|do)?\s*(?:\d+(?:[.,]\d+)?)?\s*(minut[yęa]?|min\b)/i,
  );
  if (minMatch) {
    const val = parseFloat(minMatch[1].replace(",", "."));
    if (Number.isFinite(val) && val > 0) {
      const expected = Math.round(val * 60);
      if (
        safeFallback === 0 ||
        safeFallback === Math.round(val) ||
        (val >= 2 && safeFallback === 60) ||
        Math.abs(safeFallback - expected) > 60
      ) {
        return expected;
      }
    }
  }

  const hourMatch = clean.match(
    /(\d+(?:[.,]\d+)?)\s*(?:-|do)?\s*(?:\d+(?:[.,]\d+)?)?\s*(godzin[yęa]?|godz\b|h\b)/i,
  );
  if (hourMatch) {
    const val = parseFloat(hourMatch[1].replace(",", "."));
    if (Number.isFinite(val) && val > 0) {
      const expected = Math.round(val * 3600);
      if (safeFallback === 0 || safeFallback < expected * 0.5) {
        return expected;
      }
    }
  }

  return safeFallback;
}

export function parseAndValidateRecipeJson(rawText: string): ValidatedRecipePayload {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new RecipeValidationError("Model zwrócił pustą odpowiedź.");
  }

  const cleaned = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new RecipeValidationError("Odpowiedź AI nie jest poprawnym formatem JSON.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new RecipeValidationError("Struktura przepisu jest nieprawidłowa.");
  }

  const obj = parsed as Record<string, unknown>;

  // Specjalne zabezpieczenie anty-halucynacyjne: gdy AI stwierdzi, że źródło nie jest przepisem
  if (
    typeof obj.title === "string" &&
    (obj.title.trim().toUpperCase() === "BRAK_PRZEPISU" ||
      obj.title.trim().toUpperCase().startsWith("BRAK_PRZEPISU") ||
      obj.title.trim().toLowerCase().includes("brak przepisu"))
  ) {
    const desc =
      typeof obj.description === "string" && obj.description.trim()
        ? obj.description.trim()
        : "W podanym źródle nie znaleziono przepisu kulinarnego.";
    return {
      title: "BRAK_PRZEPISU",
      description: desc,
      category: "Inne",
      prep_time_minutes: 0,
      prepTimeMinutes: 0,
      cook_time_minutes: 0,
      cookTimeMinutes: 0,
      servings: 1,
      ingredients: [],
      steps: [],
      imageSearchQuery: "",
    };
  }

  if (typeof obj.title !== "string" || obj.title.trim().length < 2) {
    throw new RecipeValidationError("Brak poprawnego tytułu przepisu.");
  }

  if (!Array.isArray(obj.ingredients) || obj.ingredients.length === 0) {
    throw new RecipeValidationError("Przepis nie zawiera listy składników.");
  }

  const ingredients: RecipeIngredient[] = obj.ingredients
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => {
      const name = String(item.name ?? "").trim();
      const amountVal = item.amount;
      const amountNum = typeof amountVal === "number" ? amountVal : parseFloat(String(amountVal ?? "0").replace(",", "."));
      const amount = Number.isFinite(amountNum) && amountNum >= 0 ? amountNum : 0;
      const unit = String(item.unit ?? "").trim();
      let category = item.category ? String(item.category).trim() : undefined;
      // Zabezpieczenie przed wpisaniem "Mokre"/"Suche" jako kategorii składnika
      if (category && /^(mokre|suche|mokry|suchy|płynne|sypkie)$/i.test(category)) {
        category = "Główne składniki";
      }
      return {
        name,
        amount,
        unit,
        category: category || "Główne składniki",
      };
    })
    .filter((ing) => ing.name.length > 0);

  if (ingredients.length === 0) {
    throw new RecipeValidationError("Lista poprawnych składników jest pusta.");
  }

  if (!Array.isArray(obj.steps) || obj.steps.length === 0) {
    throw new RecipeValidationError("Przepis nie zawiera kroków przygotowania.");
  }

  const steps: RecipeStep[] = obj.steps
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item, index) => {
      const stepNumber =
        typeof item.step_number === "number" && item.step_number > 0
          ? Math.round(item.step_number)
          : typeof item.order === "number" && item.order > 0
            ? Math.round(item.order)
            : index + 1;

      const instruction = String(item.instruction ?? item.text ?? "").trim();

      const rawTimerSeconds =
        typeof item.timer_seconds === "number" && item.timer_seconds >= 0
          ? Math.round(item.timer_seconds)
          : typeof item.timerMinutes === "number" && item.timerMinutes > 0
            ? Math.round(item.timerMinutes * 60)
            : 0;

      const timerSeconds = parseTimerSecondsFromInstruction(instruction, rawTimerSeconds);

      const stepIngredients: StepIngredient[] = Array.isArray(item.step_ingredients)
        ? (item.step_ingredients as Array<Record<string, unknown>>)
            .filter((si) => si && typeof si === "object" && Boolean(si.name))
            .map((si) => {
              const name = String(si.name).trim();
              const amtNum = typeof si.amount === "number" ? si.amount : parseFloat(String(si.amount ?? "0").replace(",", "."));
              return {
                name,
                amount: Number.isFinite(amtNum) ? amtNum : 0,
                unit: String(si.unit ?? "").trim(),
              };
            })
            .filter((si) => si.name.length > 0)
        : [];

      const tip = item.tip ? String(item.tip).trim() : null;

      return {
        step_number: stepNumber,
        instruction,
        step_ingredients: stepIngredients,
        timer_seconds: timerSeconds,
        tip,
        // Aliases
        order: stepNumber,
        text: instruction,
        timerMinutes: timerSeconds > 0 ? Math.round(timerSeconds / 60) : null,
      };
    })
    .filter((step) => step.instruction.length > 0);

  if (steps.length === 0) {
    throw new RecipeValidationError("Lista poprawnych kroków przygotowania jest pusta.");
  }

  const prepTime =
    typeof obj.prep_time_minutes === "number" && obj.prep_time_minutes >= 0
      ? Math.round(obj.prep_time_minutes)
      : typeof obj.prepTimeMinutes === "number" && obj.prepTimeMinutes >= 0
        ? Math.round(obj.prepTimeMinutes)
        : 15;

  const cookTime =
    typeof obj.cook_time_minutes === "number" && obj.cook_time_minutes >= 0
      ? Math.round(obj.cook_time_minutes)
      : typeof obj.cookTimeMinutes === "number" && obj.cookTimeMinutes >= 0
        ? Math.round(obj.cookTimeMinutes)
        : 0;

  return {
    title: obj.title.trim(),
    description: typeof obj.description === "string" ? obj.description.trim() : "",
    category: typeof obj.category === "string" && obj.category.trim() ? obj.category.trim() : "Obiad",
    prep_time_minutes: prepTime,
    prepTimeMinutes: prepTime,
    cook_time_minutes: cookTime,
    cookTimeMinutes: cookTime,
    servings: typeof obj.servings === "number" && obj.servings > 0 ? Math.round(obj.servings) : 2,
    ingredients,
    steps,
    imageSearchQuery:
      typeof obj.imageSearchQuery === "string" && obj.imageSearchQuery.trim()
        ? obj.imageSearchQuery.trim()
        : obj.title.trim(),
  };
}
