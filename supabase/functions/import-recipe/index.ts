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
      const lowerUrl = rawUrl.toLowerCase();
      const isInstagram = lowerUrl.includes("instagram.com") || lowerUrl.includes("instagr.am");
      const apifyToken = Deno.env.get("APIFY_API_TOKEN");

      let gotInstagramCaption = false;

      // 1. Ekstrakcja z Instagrama przez Apify (jeśli token jest skonfigurowany w Supabase Secrets)
      if (isInstagram && apifyToken) {
        try {
          const apifyController = new AbortController();
          const apifyTimer = setTimeout(() => apifyController.abort(), 15000);
          const apifyRes = await fetch(
            `https://api.apify.com/v2/acts/apify~instagram-post-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(apifyToken)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ username: [rawUrl], resultsLimit: 1 }),
              signal: apifyController.signal,
            },
          );
          clearTimeout(apifyTimer);

          if (apifyRes.ok) {
            const items = (await apifyRes.json()) as Array<Record<string, unknown>>;
            if (Array.isArray(items) && items.length > 0) {
              const firstItem = items[0];
              const caption = typeof firstItem.caption === "string" ? firstItem.caption.trim() : "";
              if (caption) {
                fetchedContent += (fetchedContent ? "\n\n" : "") + `OPIS POSTA INSTAGRAM:\n${caption}`;
                if (caption.length > 30) {
                  gotInstagramCaption = true;
                }
              }

              const candidateImg =
                (typeof firstItem.displayUrl === "string" && firstItem.displayUrl) ||
                (typeof firstItem.thumbnailUrl === "string" && firstItem.thumbnailUrl) ||
                (typeof firstItem.thumbnailSrc === "string" && firstItem.thumbnailSrc) ||
                (typeof firstItem.imageUrl === "string" && firstItem.imageUrl) ||
                (typeof firstItem.coverUrl === "string" && firstItem.coverUrl);

              if (candidateImg) {
                extractedImageUrl = candidateImg;
              }
            }
          }
        } catch (err) {
          console.warn("Apify Instagram fetch error:", err instanceof Error ? err.message : "unknown");
        }
      }

      // 2. Jeśli nie mamy treści z Instagrama lub to zwykła strona WWW:
      if (!gotInstagramCaption) {
        try {
          // Pobieramy przez czytnik Markdown Jina AI (omija blokady botów większości portali)
          const jinaController = new AbortController();
          const jinaTimer = setTimeout(() => jinaController.abort(), 10000);
          const jinaRes = await fetch(`https://r.jina.ai/${rawUrl}`, {
            headers: { Accept: "text/plain" },
            signal: jinaController.signal,
          });
          clearTimeout(jinaTimer);

          if (jinaRes.ok) {
            const jinaText = (await jinaRes.text()).slice(0, 15000);
            if (jinaText && jinaText.length > 60) {
              fetchedContent += (fetchedContent ? "\n\n" : "") + jinaText;
            }
          }
        } catch {
          // Kontynuujemy ze standardowym fetchem HTML
        }

        if (!isInstagram && !fetchedContent) {
          try {
            const pageController = new AbortController();
            const pageTimer = setTimeout(() => pageController.abort(), 8000);
            const pageRes = await fetch(rawUrl, {
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
                "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
              },
              signal: pageController.signal,
            });
            clearTimeout(pageTimer);

            if (pageRes.ok) {
              const html = await pageRes.text();
              if (!extractedImageUrl) {
                extractedImageUrl = extractMetaImage(html, rawUrl);
              }
              fetchedContent += (fetchedContent ? "\n\n" : "") + stripHtmlToText(html);
            }
          } catch {
            // Kontynuujemy z danymi przesłanymi przez użytkownika
          }
        }
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
