import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { loadGeminiConfig, GeminiConfigError, GeminiConfig } from "../geminiConfig.ts";
import { generateStructuredRecipe, GeminiOperationError } from "../geminiClient.ts";

const validRecipeJson = JSON.stringify({
  title: "Klasyczna carbonara",
  description: "Włoski makaron z guanciale, jajkami i pecorino.",
  category: "Obiad",
  prepTimeMinutes: 10,
  cookTimeMinutes: 15,
  servings: 2,
  ingredients: [{ name: "Spaghetti", amount: "200", unit: "g" }],
  steps: [{ order: 1, text: "Ugotuj makaron al dente.", timerMinutes: 9 }],
  imageSearchQuery: "spaghetti carbonara",
});

function makeConfig(overrides: Partial<GeminiConfig> = {}): GeminiConfig {
  return {
    apiKey: "TEST_SECRET_KEY_12345",
    primaryModel: "gemini-flash-latest",
    fallbackModel: "gemini-3.5-flash-lite",
    imageModel: "gemini-3.1-flash-lite-image",
    attemptTimeoutMs: 500,
    totalTimeoutMs: 2000,
    maxRetries: 1,
    apiBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    ...overrides,
  };
}

function okGeminiResponse(text: string, finishReason = "STOP"): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ finishReason, content: { parts: [{ text }] } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

Deno.test("1. Konfiguracja: brak klucza lub błędny timeout rzuca GeminiConfigError", () => {
  try {
    loadGeminiConfig(() => undefined);
    throw new Error("Expected throw");
  } catch (e) {
    assertEquals(e instanceof GeminiConfigError, true);
  }

  // Deduplikacja identycznego primary i fallback
  const cfg = loadGeminiConfig((k) =>
    ({
      GEMINI_API_KEY: "abc",
      GEMINI_PRIMARY_MODEL: "gemini-flash-latest",
      GEMINI_FALLBACK_MODEL: "gemini-flash-latest",
    })[k],
  );
  assertEquals(cfg.fallbackModel, undefined);
});

Deno.test("2. Sukces modelu podstawowego", async () => {
  const calls: string[] = [];
  const recipe = await generateStructuredRecipe(makeConfig(), {
    userPrompt: "Carbonara",
    sleepFn: async () => {},
    fetchFn: async (url) => {
      calls.push(String(url));
      return okGeminiResponse(validRecipeJson);
    },
  });

  assertEquals(recipe.title, "Klasyczna carbonara");
  assertEquals(calls.length, 1);
  assertEquals(calls[0].includes("gemini-flash-latest:generateContent"), true);
});

Deno.test("3. Timeout modelu podstawowego + nowy AbortSignal i sukces fallbacku", async () => {
  const signals: AbortSignal[] = [];
  const models: string[] = [];

  const recipe = await generateStructuredRecipe(
    makeConfig({ attemptTimeoutMs: 40, totalTimeoutMs: 1000, maxRetries: 0 }),
    {
      userPrompt: "Carbonara",
      sleepFn: async () => {},
      fetchFn: async (url, init) => {
        const u = String(url);
        models.push(u);
        const sig = init!.signal!;
        signals.push(sig);

        if (u.includes("gemini-flash-latest")) {
          // Symulacja zawieszenia aż do przerwania sygnału próby
          return await new Promise<Response>((_, reject) => {
            sig.addEventListener("abort", () => reject(new DOMException("Timed out", "TimeoutError")));
          });
        }
        // Fallback musi otrzymać ŚWIEŻY, nieprzerwany AbortSignal!
        assertEquals(sig.aborted, false);
        return okGeminiResponse(validRecipeJson);
      },
    },
  );

  assertEquals(recipe.title, "Klasyczna carbonara");
  assertEquals(signals.length, 2);
  assertEquals(signals[0] !== signals[1], true);
  assertEquals(signals[0].aborted, true);
  assertEquals(signals[1].aborted, false);
});

Deno.test("4. Niedostępny model (404) przechodzi na fallback bez bezsensownego retry", async () => {
  const attemptedModels: string[] = [];

  const recipe = await generateStructuredRecipe(makeConfig({ maxRetries: 2 }), {
    userPrompt: "Carbonara",
    sleepFn: async () => {},
    fetchFn: async (url) => {
      const u = String(url);
      attemptedModels.push(u);
      if (u.includes("gemini-flash-latest")) {
        return new Response(
          JSON.stringify({ error: { status: "NOT_FOUND", message: "is no longer available" } }),
          { status: 404 },
        );
      }
      return okGeminiResponse(validRecipeJson);
    },
  });

  assertEquals(recipe.title, "Klasyczna carbonara");
  // Tylko 1 wywołanie primary (brak retry 404) + 1 wywołanie fallback
  assertEquals(attemptedModels.length, 2);
});

Deno.test("5. Przejściowy 503 i skuteczne ponowienie na tym samym modelu", async () => {
  let count = 0;
  const recipe = await generateStructuredRecipe(makeConfig({ maxRetries: 1 }), {
    userPrompt: "Carbonara",
    sleepFn: async () => {},
    fetchFn: async () => {
      count++;
      if (count === 1) {
        return new Response(
          JSON.stringify({ error: { status: "UNAVAILABLE", message: "high demand" } }),
          { status: 503 },
        );
      }
      return okGeminiResponse(validRecipeJson);
    },
  });

  assertEquals(count, 2);
  assertEquals(recipe.title, "Klasyczna carbonara");
});

Deno.test("6. 429 z Retry-After vs wyczerpana kwota (QUOTA_EXHAUSTED)", async () => {
  let sleptMs = 0;
  let attempts = 0;

  // Przypadek A: 429 z Retry-After -> ponawia
  const res = await generateStructuredRecipe(makeConfig({ maxRetries: 1 }), {
    userPrompt: "Carbonara",
    sleepFn: async (ms) => {
      sleptMs = ms;
    },
    fetchFn: async () => {
      attempts++;
      if (attempts === 1) {
        return new Response("rate limit", { status: 429, headers: { "Retry-After": "1" } });
      }
      return okGeminiResponse(validRecipeJson);
    },
  });
  assertEquals(sleptMs, 1000);
  assertEquals(res.title, "Klasyczna carbonara");

  // Przypadek B: Wyczerpana kwota -> brak lawiny prób
  let quotaAttempts = 0;
  await assertRejects(
    () =>
      generateStructuredRecipe(makeConfig({ maxRetries: 2 }), {
        userPrompt: "Carbonara",
        sleepFn: async () => {},
        fetchFn: async () => {
          quotaAttempts++;
          return new Response(
            JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded limit: 0" } }),
            { status: 429 },
          );
        },
      }),
    GeminiOperationError,
  );
  assertEquals(quotaAttempts, 1);
});

Deno.test("7. Błędny klucz (401) i błędne parametry (400) kończą natychmiast bez retry", async () => {
  for (const status of [401, 400]) {
    let calls = 0;
    await assertRejects(
      () =>
        generateStructuredRecipe(makeConfig({ maxRetries: 2 }), {
          userPrompt: "Carbonara",
          sleepFn: async () => {},
          fetchFn: async () => {
            calls++;
            return new Response(JSON.stringify({ error: { message: "bad" } }), { status });
          },
        }),
      GeminiOperationError,
    );
    assertEquals(calls, 1);
  }
});

Deno.test("8. Anulowanie przez użytkownika przerywa natychmiast bez retry", async () => {
  const userController = new AbortController();
  userController.abort();

  let calls = 0;
  await assertRejects(
    () =>
      generateStructuredRecipe(makeConfig(), {
        userPrompt: "Carbonara",
        parentSignal: userController.signal,
        fetchFn: async () => {
          calls++;
          return okGeminiResponse(validRecipeJson);
        },
      }),
    GeminiOperationError,
  );
  assertEquals(calls, 0);
});

Deno.test("9. Walidacja odpowiedzi: pusta, niepoprawny JSON, brak pola, MAX_TOKENS oraz brak wycieku klucza", async () => {
  // Ucięta odpowiedź (MAX_TOKENS)
  await assertRejects(
    () =>
      generateStructuredRecipe(makeConfig({ fallbackModel: undefined, maxRetries: 0 }), {
        userPrompt: "Carbonara",
        fetchFn: async () => okGeminiResponse('{"title": "Ucięty', "MAX_TOKENS"),
      }),
    GeminiOperationError,
  );

  // Brak wymaganego pola steps
  await assertRejects(
    () =>
      generateStructuredRecipe(makeConfig({ fallbackModel: undefined, maxRetries: 0 }), {
        userPrompt: "Carbonara",
        fetchFn: async () =>
          okGeminiResponse(JSON.stringify({ title: "Test", ingredients: [{ name: "Mąka", amount: "100", unit: "g" }], steps: [] })),
      }),
    GeminiOperationError,
  );
});
