import { loadGeminiConfig, GeminiConfigError } from "../_shared/geminiConfig.ts";
import { generateStructuredRecipe, GeminiOperationError } from "../_shared/geminiClient.ts";
import { resolveRecipeImage } from "../_shared/imageResolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function extractMetaImage(html: string, baseUrl: string): string | null {
  const ogMatch =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (!ogMatch?.[1]) return null;
  try {
    return new URL(ogMatch[1], baseUrl).toString();
  } catch {
    return null;
  }
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 14000);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const config = loadGeminiConfig();
    const body = await req.json();

    const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
    const rawText = String(body.text ?? body.rawText ?? "").trim();
    const userId = typeof body.userId === "string" ? body.userId : undefined;
    const inlineImages = Array.isArray(body.images)
      ? body.images
      : body.imageBase64
        ? [{ mimeType: String(body.mimeType || "image/jpeg"), dataBase64: String(body.imageBase64) }]
        : undefined;

    let fetchedContent = "";
    let extractedImageUrl: string | null = null;

    if (rawUrl) {
      try {
        const pageController = new AbortController();
        const pageTimer = setTimeout(() => pageController.abort(), 8000);
        const pageRes = await fetch(rawUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
            "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
          },
          signal: pageController.signal,
        });
        clearTimeout(pageTimer);

        if (pageRes.ok) {
          const html = await pageRes.text();
          extractedImageUrl = extractMetaImage(html, rawUrl);
          fetchedContent = stripHtmlToText(html);
        }
      } catch {
        // Jeśli strona (np. Instagram) blokuje bezpośredni fetch, parsujemy z samego tekstu/tytułu udostępnienia
      }
    }

    const combinedSource = [
      rawUrl ? `Adres URL: ${rawUrl}` : "",
      rawText ? `Treść / opis udostępnienia:\n${rawText}` : "",
      fetchedContent ? `Treść pobrana ze strony:\n${fetchedContent}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    if (!combinedSource && !inlineImages?.length) {
      return new Response(
        JSON.stringify({ code: "BAD_REQUEST", error: "Brak linku, tekstu lub zdjęcia do zaimportowania." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userPrompt = `Wyodrębnij i uporządkuj przepis kulinarny z poniższego źródła (link, post z Instagrama, tekst lub zdjęcie). Przetłumacz na język polski jeśli źródło jest w innym języku.\n\n<untrusted_recipe_source>\n${combinedSource}\n</untrusted_recipe_source>`;

    const recipe = await generateStructuredRecipe(config, {
      userPrompt,
      inlineImages,
      parentSignal: req.signal,
    });

    const imageUrl = await resolveRecipeImage({
      config,
      dishQuery: recipe.imageSearchQuery || recipe.title,
      mode: "auto",
      externalImageUrl: extractedImageUrl,
      userId,
    });

    return new Response(
      JSON.stringify({
        recipe: {
          ...recipe,
          source_url: rawUrl || null,
          ...(imageUrl ? { image_url: imageUrl } : {}),
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const isConfig = err instanceof GeminiConfigError;
    const isOp = err instanceof GeminiOperationError;
    const status = isConfig ? 503 : isOp && err.category === "TIMEOUT" ? 504 : isOp && err.category === "RATE_LIMITED" ? 429 : 502;
    const code = isConfig ? "CONFIG_ERROR" : isOp ? err.category : "TRANSIENT_UNAVAILABLE";
    const message =
      code === "TIMEOUT"
        ? "Importowanie przepisu trwało zbyt długo. Spróbuj ponownie."
        : code === "RATE_LIMITED"
          ? "Usługa jest chwilowo obciążona. Spróbuj ponownie za chwilę."
          : code === "CONFIG_ERROR"
            ? "Funkcja AI jest chwilowo niedostępna."
            : code === "VALIDATION_ERROR"
              ? "Nie udało się poprawnie odczytać przepisu ze źródła. Spróbuj ponownie."
              : "Nie udało się teraz zaimportować przepisu. Spróbuj ponownie za chwilę.";

    return new Response(
      JSON.stringify({ code, error: message }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
