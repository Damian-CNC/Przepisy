const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AssistantMode = "discover" | "edit";

interface AiAssistantRequest {
  mode?: unknown;
  userPrompt?: unknown;
  currentRecipe?: unknown;
  useWebSearch?: unknown;
}

interface GeminiCandidatePart {
  text?: string;
}

interface GroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
}

interface GeminiApiResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiCandidatePart[];
    };
    groundingMetadata?: {
      groundingChunks?: GroundingChunk[];
    };
  }>;
  error?: {
    message?: string;
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const RECIPE_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING", description: "Nazwa potrawy po polsku" },
    description: {
      type: "STRING",
      description: "Krótki, apetyczny opis potrawy (1-2 zdania)",
    },
    prep_time_minutes: {
      type: "INTEGER",
      description: "Czas przygotowania w minutach",
    },
    cook_time_minutes: {
      type: "INTEGER",
      description: "Czas gotowania/pieczenia w minutach",
    },
    servings: { type: "INTEGER", description: "Liczba porcji" },
    category: {
      type: "STRING",
      description:
        "Jedna z kategorii: Śniadanie, Obiad, Kolacja, Deser, Przekąska, Napój, Wypieki",
    },
    tags: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Tagi np. Szybkie, Włoskie, Wegetariańskie, Kurczak",
    },
    ingredients: {
      type: "ARRAY",
      description: "Pełna lista wszystkich składników",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          amount: { type: "NUMBER" },
          unit: { type: "STRING" },
          category: {
            type: "STRING",
            description:
              "Nazwa sekcji z przepisu (np. Zaparka, Ciasto, Farsz, Ciasto na pierogi, Sos, Polewa). Zostaw puste, jeśli przepis nie dzieli składników na sekcje.",
          },
        },
        required: ["name", "amount", "unit"],
      },
    },
    steps: {
      type: "ARRAY",
      description: "Kroki przygotowania w stylu Thermomix",
      items: {
        type: "OBJECT",
        properties: {
          step_number: { type: "INTEGER" },
          instruction: {
            type: "STRING",
            description: "Jasna instrukcja co zrobić w tym kroku",
          },
          step_ingredients: {
            type: "ARRAY",
            description: "Składniki dodawane konkretnie w tym kroku wraz z ilością",
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
            description:
              "Czas minutnika w sekundach (0 jeśli krok nie wymaga odliczania czasu)",
          },
          tip: {
            type: "STRING",
            description: "Opcjonalna wskazówka kulinarna do kroku",
          },
        },
        required: ["step_number", "instruction", "step_ingredients", "timer_seconds"],
      },
    },
  },
  required: [
    "title",
    "prep_time_minutes",
    "cook_time_minutes",
    "servings",
    "category",
    "ingredients",
    "steps",
  ],
};

interface GeminiSuccess {
  ok: true;
  text: string;
  sourceUrl: string | null;
}

interface GeminiFailure {
  ok: false;
  errors: string[];
}

async function callGeminiWithFallback(
  apiKey: string,
  models: string[],
  requestPayload: Record<string, unknown>,
  timeoutMs = 22000,
): Promise<GeminiSuccess | GeminiFailure> {
  const serializedBody = JSON.stringify(requestPayload);
  const errors: string[] = [];

  for (const modelName of models) {
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: serializedBody,
          signal: AbortSignal.timeout(timeoutMs),
        },
      );

      const geminiJson = (await geminiRes.json()) as GeminiApiResponse;

      if (!geminiRes.ok) {
        throw new Error(geminiJson.error?.message || `HTTP ${geminiRes.status}`);
      }

      const firstCandidate = geminiJson.candidates?.[0];
      const text = (firstCandidate?.content?.parts ?? [])
        .map((part) => (typeof part.text === "string" ? part.text : ""))
        .filter(Boolean)
        .join("\n")
        .trim();

      if (!text) {
        throw new Error("Pusta odpowiedź modelu Gemini.");
      }

      const chunks = firstCandidate?.groundingMetadata?.groundingChunks ?? [];
      const rawUri = chunks[0]?.web?.uri;
      const sourceUrl =
        typeof rawUri === "string" && rawUri.trim() ? rawUri.trim() : null;

      return { ok: true, text, sourceUrl };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push(`${modelName}: ${errMsg}`);
      console.warn(`Model ${modelName} nie odpowiedział:`, errMsg);
    }
  }

  return { ok: false, errors };
}

function geminiErrorResponse(errors: string[]): Response {
  const combined = errors.join(" | ");
  const isOverloaded =
    combined.includes("503") ||
    combined.includes("UNAVAILABLE") ||
    combined.includes("429");
  return jsonResponse(
    {
      error: isOverloaded
        ? "Modele Gemini są chwilowo przeciążone. Spróbuj ponownie za kilkanaście sekund."
        : `Nie udało się przetworzyć przepisu przez Gemini API (${combined})`,
    },
    isOverloaded ? 503 : 502,
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Obsługiwane są wyłącznie żądania POST." }, 405);
  }

  try {
    let payload: AiAssistantRequest;
    try {
      payload = (await req.json()) as AiAssistantRequest;
    } catch {
      return jsonResponse({ error: "Nieprawidłowe dane JSON w żądaniu." }, 400);
    }

    const mode = payload.mode;
    if (mode !== "discover" && mode !== "edit") {
      return jsonResponse(
        { error: 'Nieprawidłowy parametr "mode". Oczekiwano "discover" lub "edit".' },
        400,
      );
    }

    const userPrompt =
      typeof payload.userPrompt === "string" ? payload.userPrompt.trim() : "";
    if (!userPrompt) {
      return jsonResponse(
        { error: "Podaj opis lub polecenie w polu userPrompt." },
        400,
      );
    }

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      throw new Error("Brak klucza GEMINI_API_KEY w zmiennych środowiskowych Supabase.");
    }

    const configuredModel = (Deno.env.get("GEMINI_MODEL") || "").trim();
    const candidateModels = Array.from(
      new Set(
        [configuredModel, "gemini-2.5-flash", "gemini-flash-latest"].filter(Boolean),
      ),
    );

    if (mode === ("discover" satisfies AssistantMode)) {
      const useWebSearch = payload.useWebSearch === true;
      let webContext = "";
      let sourceUrl: string | null = null;

      if (useWebSearch) {
        const searchPrompt = `
Znajdź sprawdzony, szczegółowy przepis kulinarny odpowiadający poniższemu zapytaniu użytkownika.
Podaj dokładną listę składników z ilościami (wraz z ewentualnym podziałem na sekcje), czasy przygotowania i pieczenia/gotowania, liczbę porcji oraz kolejne kroki przygotowania.

ZAPYTANIE UŻYTKOWNIKA:
${userPrompt}
`.trim();

        const searchResult = await callGeminiWithFallback(
          geminiApiKey,
          candidateModels,
          {
            contents: [{ role: "user", parts: [{ text: searchPrompt }] }],
            tools: [{ google_search: {} }],
          },
          20000,
        );

        if (searchResult.ok) {
          webContext = searchResult.text;
          sourceUrl = searchResult.sourceUrl;
        } else {
          console.warn(
            "Wyszukiwanie w sieci (google_search) nie powiodło się, przechodzę do generowania bez kontekstu z sieci:",
            searchResult.errors.join(" | "),
          );
        }
      }

      const structurePrompt = `
Jesteś profesjonalnym szefem kuchni (Szef Kuchni AI) i ekspertem kulinarnym.
${
  webContext
    ? "Na podstawie znalezionych informacji z sieci oraz zapytania użytkownika przygotuj kompletny, dopracowany przepis po polsku."
    : "Na podstawie zapytania użytkownika stwórz od podstaw kompletny, sprawdzony i pyszny przepis kulinarny po polsku."
}

ZASADY OBOWIĄZKOWE:
1. Całość tekstu (tytuł, opis, składniki, kroki, wskazówki, tagi) musi być w języku polskim.
2. Stosuj polskie jednostki metryczne (g, ml, szt., łyżki, łyżeczki, °C).
3. Jeśli składnik nie ma dokładnej ilości (np. "sól do smaku", "olej do smażenia"), ustaw amount na 0, a w unit wpisz np. "wg uznania" lub "do smażenia" — NIGDY nie wymyślaj sztucznego "1 szt.".
4. Jeśli przepis naturalnie dzieli składniki na sekcje (np. "Zaparka", "Ciasto", "Farsz", "Sos", "Polewa", "Marynata"), wpisz nazwę sekcji w pole "category" każdego składnika tej sekcji i zachowaj czystą nazwę w "name". Jeśli przepis nie wymaga sekcji, zostaw "category" puste.
5. Podziel przygotowanie na logiczne kroki w stylu Thermomix, numerując "step_number" kolejno od 1 (1, 2, 3...).
6. W każdym kroku w "step_ingredients" wypisz DOKŁADNIE te składniki i ich ilości, które są używane/dodawane w tym kroku (spójne z główną listą "ingredients").
7. W "timer_seconds" podaj czas odliczania w sekundach dla kroków wymagających gotowania, pieczenia, smażenia lub odstawienia (np. 10 min = 600). Jeśli brak czasu, wpisz 0.

ZAPYTANIE UŻYTKOWNIKA:
${userPrompt}
${webContext ? `\nMATERIAŁ ŹRÓDŁOWY Z SIECI:\n${webContext.slice(0, 14000)}` : ""}
`.trim();

      const structuredResult = await callGeminiWithFallback(
        geminiApiKey,
        candidateModels,
        {
          contents: [{ role: "user", parts: [{ text: structurePrompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: RECIPE_RESPONSE_SCHEMA,
          },
        },
        24000,
      );

      if (!structuredResult.ok) {
        return geminiErrorResponse(structuredResult.errors);
      }

      const parsedRecipe = JSON.parse(structuredResult.text) as Record<string, unknown>;

      return jsonResponse({
        recipe: {
          ...parsedRecipe,
          source_url: sourceUrl,
          source_platform: useWebSearch ? "web" : "ai",
        },
      });
    }

    // Tryb "edit"
    if (!isPlainObject(payload.currentRecipe)) {
      return jsonResponse(
        { error: 'Brak poprawnego obiektu "currentRecipe" dla trybu edycji.' },
        400,
      );
    }

    const currentRecipe = payload.currentRecipe;

    const editPrompt = `
Jesteś inteligentnym asystentem edycji przepisów kulinarnych.
Użytkownik chce zmodyfikować istniejący przepis zgodnie ze swoim poleceniem (tekstowym lub głosowym).

ZASADY OBOWIĄZKOWE:
1. Zachowaj wszystkie niezmienione elementy przepisu w nienaruszonej postaci (tytuł, opis, czasy, porcje, kategorię, tagi, składniki, kroki — zmieniaj TYLKO to, co wynika z polecenia użytkownika lub co musi zostać zaktualizowane dla spójności).
2. Pola metadanych rekordu (id, created_at, image_url, source_url, source_platform, is_favorite, created_by) pozostają po stronie systemu niezmienione.
3. Wprowadź żądaną modyfikację precyzyjnie (np. zmiana liczby porcji z proporcjonalnym przeliczeniem składników, zamiana składnika, dodanie/usunięcie kroku, zmiana czasu lub temperatury).
4. Poprawnie przenumeruj wszystkie kroki w "step_number" kolejno od 1 (1, 2, 3...).
5. Utrzymuj pełną spójność między główną listą "ingredients" (włącznie z polem "category" dla sekcji, jeśli występują) a cząstkowymi listami "step_ingredients" oraz "timer_seconds" w każdym kroku.
6. Stosuj polskie jednostki metryczne (g, ml, szt., łyżki, łyżeczki, °C) oraz amount = 0 dla ilości "wg uznania".

AKTUALNY PRZEPIS (JSON):
${JSON.stringify(currentRecipe)}

POLECENIE EDYCJI UŻYTKOWNIKA:
${userPrompt}
`.trim();

    const editResult = await callGeminiWithFallback(
      geminiApiKey,
      candidateModels,
      {
        contents: [{ role: "user", parts: [{ text: editPrompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RECIPE_RESPONSE_SCHEMA,
        },
      },
      24000,
    );

    if (!editResult.ok) {
      return geminiErrorResponse(editResult.errors);
    }

    const updatedRecipe = JSON.parse(editResult.text) as Record<string, unknown>;

    return jsonResponse({
      recipe: {
        ...currentRecipe,
        ...updatedRecipe,
        id: currentRecipe.id,
        created_at: currentRecipe.created_at,
        image_url: currentRecipe.image_url,
        source_url: currentRecipe.source_url,
        source_platform: currentRecipe.source_platform,
        is_favorite: currentRecipe.is_favorite,
        created_by: currentRecipe.created_by,
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Błąd podczas pracy asystenta AI przepisu";
    return jsonResponse({ error: message }, 500);
  }
});
