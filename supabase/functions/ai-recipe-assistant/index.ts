import { loadGeminiConfig, GeminiConfigError } from "../_shared/geminiConfig.ts";
import { generateStructuredRecipe, GeminiOperationError } from "../_shared/geminiClient.ts";
import {
  resolveRecipeImage,
  searchWebFoodCandidates,
  rehostExternalImage,
  generateAiDishImage,
} from "../_shared/imageResolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function mapErrorToHttp(err: unknown): { status: number; code: string; message: string } {
  if (err instanceof GeminiConfigError) {
    return { status: 503, code: "CONFIG_ERROR", message: "Funkcja AI jest chwilowo niedostępna." };
  }
  if (err instanceof GeminiOperationError) {
    switch (err.category) {
      case "TIMEOUT":
        return { status: 504, code: "TIMEOUT", message: "Generowanie przepisu trwało zbyt długo. Spróbuj ponownie." };
      case "RATE_LIMITED":
      case "QUOTA_EXHAUSTED":
        return { status: 429, code: "RATE_LIMITED", message: "Usługa jest chwilowo obciążona. Spróbuj ponownie za chwilę." };
      case "VALIDATION_ERROR":
        return { status: 422, code: "VALIDATION_ERROR", message: "Nie udało się poprawnie odczytać przepisu. Spróbuj ponownie." };
      case "CONFIG_ERROR":
      case "AUTH_ERROR":
      case "MODEL_NOT_FOUND":
        return { status: 503, code: "CONFIG_ERROR", message: "Funkcja AI jest chwilowo niedostępna." };
      case "CANCELLED":
        return { status: 499, code: "CANCELLED", message: "Anulowano generowanie przepisu." };
      default:
        return { status: 502, code: "TRANSIENT_UNAVAILABLE", message: "Nie udało się teraz wygenerować przepisu. Spróbuj ponownie za chwilę." };
    }
  }
  return { status: 500, code: "TRANSIENT_UNAVAILABLE", message: "Nie udało się teraz wygenerować przepisu. Spróbuj ponownie za chwilę." };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const config = loadGeminiConfig();
    const body = await req.json();

    const userId = typeof body.userId === "string" ? body.userId : undefined;

    // Tryb wyszukiwania wielu zdjęć do wyboru dla użytkownika (Google/DuckDuckGo Images)
    if (body.mode === "search-images") {
      const query = String(body.query ?? body.title ?? "").trim();
      if (!query) {
        return new Response(
          JSON.stringify({ code: "BAD_REQUEST", error: "Podaj nazwę potrawy do wyszukania zdjęć." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const limit = typeof body.limit === "number" && body.limit > 0 ? Math.min(body.limit, 8) : 4;
      const candidates = await searchWebFoodCandidates(query, limit);

      return new Response(
        JSON.stringify({ images: candidates }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Tryb trwałego rehostingu wybranego zdjęcia do Supabase Storage
    if (body.mode === "rehost-image") {
      const externalUrl = String(body.image_url ?? body.url ?? "").trim();
      if (!externalUrl) {
        return new Response(
          JSON.stringify({ code: "BAD_REQUEST", error: "Podaj adres URL zdjęcia do zapisania." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const storedUrl = await rehostExternalImage(externalUrl, userId);

      return new Response(
        JSON.stringify({ image_url: storedUrl || externalUrl }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Tryb dedykowany: dobór lub generowanie zdjęcia potrawy
    if (body.mode === "generate-image") {
      const title = String(body.title ?? body.prompt ?? body.userPrompt ?? "").trim();
      if (!title) {
        return new Response(
          JSON.stringify({ code: "BAD_REQUEST", error: "Podaj nazwę przepisu, aby wyszukać lub wygenerować zdjęcie." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const forceGenerate = Boolean(body.forceGenerate);

      if (forceGenerate) {
        const aiUrl = await generateAiDishImage(config, title, userId);
        if (aiUrl) {
          return new Response(
            JSON.stringify({ image_url: aiUrl, source: "ai" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        // Gdy generowanie AI nie powiodło się (np. darmowy klucz bez limitu obrazów),
        // zwracamy 4 pasujące propozycje z sieci, aby użytkownik sam wybrał
        const candidates = await searchWebFoodCandidates(title, 4);
        return new Response(
          JSON.stringify({
            image_url: candidates[0]?.url || null,
            ai_unavailable: true,
            message: "Generowanie AI jest niedostępne na darmowym kluczu Google API. Wybierz jedno ze zdjęć z sieci.",
            fallback_images: candidates,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const imageUrl = await resolveRecipeImage({
        config,
        dishQuery: title,
        mode: "auto",
        userId,
      });

      return new Response(
        JSON.stringify({ image_url: imageUrl }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const mode = body.mode === "edit" ? "edit" : "create";
    const prompt = String(body.prompt ?? body.userPrompt ?? "").trim();
    const imageMode = (body.imageMode ?? (mode === "create" ? "auto" : "none")) as "auto" | "web" | "ai" | "none";

    if (!prompt) {
      return new Response(
        JSON.stringify({ code: "BAD_REQUEST", error: "Wpisz opis przepisu lub polecenie edycji." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const existing = body.existingRecipe ?? body.currentRecipe ?? {};
    const userPrompt =
      mode === "edit"
        ? `Zmodyfikuj poniższy istniejący przepis zgodnie z poleceniem użytkownika.\nPolecenie użytkownika: ${prompt}\n\n<untrusted_recipe_source>\n${JSON.stringify(existing)}\n</untrusted_recipe_source>`
        : `Przygotuj kompletny przepis kulinarny na podstawie opisu użytkownika:\n<untrusted_recipe_source>\n${prompt}\n</untrusted_recipe_source>`;

    const recipe = await generateStructuredRecipe(config, {
      userPrompt,
      parentSignal: req.signal,
    });

    const imageUrl =
      imageMode !== "none"
        ? await resolveRecipeImage({
            config,
            dishQuery: recipe.imageSearchQuery || recipe.title,
            mode: imageMode,
            userId,
          })
        : null;

    return new Response(
      JSON.stringify({
        recipe: {
          ...recipe,
          ...(imageUrl ? { image_url: imageUrl } : {}),
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const mapped = mapErrorToHttp(err);
    return new Response(
      JSON.stringify({ code: mapped.code, error: mapped.message }),
      { status: mapped.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
