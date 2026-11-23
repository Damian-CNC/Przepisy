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

/**
 * Wykrywa ściany logowania, blokady botów i strony przekierowań społecznościowych,
 * które nie zawierają przepisu, a powodowałyby halucynacje modelu AI.
 */
function isLoginWallOrAuthBlock(content: string): boolean {
  if (!content) return false;
  const lower = content.toLowerCase();
  return (
    lower.includes("log in or sign up to view") ||
    lower.includes("log into facebook") ||
    lower.includes("zaloguj się do facebooka") ||
    lower.includes("zaloguj się lub zarejestruj") ||
    lower.includes("musisz się zalogować") ||
    lower.includes("zobacz posty, zdjęcia i nie tylko na facebooku") ||
    lower.includes("explore the things you love") ||
    lower.includes("facebook - log in or sign up") ||
    lower.includes("login • instagram") ||
    lower.includes("welcome back to instagram") ||
    lower.includes("attention required! | cloudflare") ||
    lower.includes("challenge-platform") ||
    lower.includes("just a moment...") ||
    lower.includes("please verify you are a human") ||
    lower.includes("enable javascript and cookies to continue") ||
    (lower.includes("access denied") && lower.includes("forbidden"))
  );
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
    let hitLoginWall = false;
    let isFacebook = false;

    if (rawUrl) {
      const lowerUrl = rawUrl.toLowerCase();
      const isInstagram = lowerUrl.includes("instagram.com") || lowerUrl.includes("instagr.am");
      isFacebook = lowerUrl.includes("facebook.com") || lowerUrl.includes("fb.watch") || lowerUrl.includes("fb.me");
      const apifyToken = Deno.env.get("APIFY_API_TOKEN");

      let gotInstagramCaption = false;
      let gotFacebookPost = false;

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
              if (caption && !isLoginWallOrAuthBlock(caption)) {
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

      // 2. Ekstrakcja z Facebooka przez Apify (jeśli token jest skonfigurowany w Supabase Secrets)
      if (isFacebook && apifyToken) {
        try {
          const apifyController = new AbortController();
          const apifyTimer = setTimeout(() => apifyController.abort(), 15000);
          const apifyRes = await fetch(
            `https://api.apify.com/v2/acts/apify~facebook-posts-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(apifyToken)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ startUrls: [{ url: rawUrl }], resultsLimit: 1 }),
              signal: apifyController.signal,
            },
          );
          clearTimeout(apifyTimer);

          if (apifyRes.ok) {
            const items = (await apifyRes.json()) as Array<Record<string, unknown>>;
            if (Array.isArray(items) && items.length > 0) {
              const firstItem = items[0];
              const postText =
                (typeof firstItem.text === "string" && firstItem.text.trim()) ||
                (typeof firstItem.postText === "string" && firstItem.postText.trim()) ||
                (typeof firstItem.caption === "string" && firstItem.caption.trim()) ||
                (typeof firstItem.message === "string" && firstItem.message.trim()) ||
                "";

              if (postText && !isLoginWallOrAuthBlock(postText)) {
                fetchedContent += (fetchedContent ? "\n\n" : "") + `TREŚĆ POSTA Z FACEBOOKA:\n${postText}`;
                if (postText.length > 30) {
                  gotFacebookPost = true;
                }
              }

              const candidateImg =
                (typeof firstItem.mediaUrl === "string" && firstItem.mediaUrl) ||
                (typeof firstItem.imageUrl === "string" && firstItem.imageUrl) ||
                (typeof firstItem.thumbnail === "string" && firstItem.thumbnail);

              if (candidateImg) {
                extractedImageUrl = candidateImg;
              }
            }
          }
        } catch (err) {
          console.warn("Apify Facebook fetch error:", err instanceof Error ? err.message : "unknown");
        }
      }

      // 3. Jeśli nie mamy treści z Instagrama/Facebooka lub to zwykła strona WWW:
      if (!gotInstagramCaption && !gotFacebookPost) {
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
            if (isLoginWallOrAuthBlock(jinaText)) {
              hitLoginWall = true;
            } else if (jinaText && jinaText.length > 60) {
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
            const userAgent = isFacebook
              ? "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"
              : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

            const pageRes = await fetch(rawUrl, {
              headers: {
                "User-Agent": userAgent,
                "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
              },
              signal: pageController.signal,
            });
            clearTimeout(pageTimer);

            if (pageRes.ok) {
              const html = await pageRes.text();
              if (isLoginWallOrAuthBlock(html)) {
                hitLoginWall = true;
              } else {
                if (!extractedImageUrl) {
                  extractedImageUrl = extractMetaImage(html, rawUrl);
                }
                const stripped = stripHtmlToText(html);
                if (isLoginWallOrAuthBlock(stripped)) {
                  hitLoginWall = true;
                } else if (stripped.length > 60) {
                  fetchedContent += (fetchedContent ? "\n\n" : "") + stripped;
                }
              }
            }
          } catch {
            // Kontynuujemy z danymi przesłanymi przez użytkownika
          }
        }
      }
    }

    // Sprawdzamy czy mamy jakąkolwiek realną treść (tekst lub zdjęcie).
    // Sam adres URL bez pobranej zawartości nie wystarcza — model AI nie ma przeglądarki
    // i bez treści zacząłby zgadywać / wymyślać losowy przepis!
    const hasActualContent = Boolean(
      (fetchedContent && fetchedContent.trim().length > 30) ||
      (rawText && rawText.trim().length > 10) ||
      (inlineImages && inlineImages.length > 0)
    );

    if (!hasActualContent) {
      if (isFacebook || hitLoginWall) {
        return new Response(
          JSON.stringify({
            code: "LOGIN_WALL_BLOCKED",
            error:
              "Facebook wymaga logowania i blokuje bezpośredni odczyt tego posta przez link. " +
              "Aby dodać ten przepis bez problemu, skopiuj treść posta z Facebooka i wklej ją w polu 'Skopiowany opis' (lub dodaj zrzut ekranu w zakładce 'Ze zdjęcia') – AI odczyta go w 2 sekundy!",
          }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (rawUrl) {
        return new Response(
          JSON.stringify({
            code: "CONTENT_UNAVAILABLE",
            error:
              "Nie udało się odczytać treści z podanego adresu WWW (strona blokuje automatyczny dostęp lub jest niedostępna). " +
              "Skopiuj tekst przepisu ręcznie lub dodaj jego zrzut ekranu.",
          }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ code: "BAD_REQUEST", error: "Brak linku, tekstu lub zdjęcia do zaimportowania." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const combinedSource = [
      rawUrl ? `Adres URL: ${rawUrl}` : "",
      rawText ? `Treść / opis udostępnienia:\n${rawText}` : "",
      fetchedContent ? `Treść pobrana ze strony:\n${fetchedContent}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const userPrompt = `Wyodrębnij i uporządkuj przepis kulinarny z poniższego źródła (link, post z mediów społecznościowych, tekst lub zdjęcie). Przetłumacz na język polski jeśli źródło jest w innym języku.

KRYTYCZNE ZABEZPIECZENIE ANTY-HALUCYNACYJNE:
Sprawdź, czy dostarczone źródło rzeczywiście zawiera przepis kulinarny (listę składników potrawy lub instrukcję przygotowania).
Jeśli źródło NIE ZAWIERA przepisu kulinarnego (jest to strona logowania, post towarzyski bez przepisu kulinarnego, reklama, artykuł niekulinarny lub błąd serwisu), BEZWZGLĘDNIE NIE WYMYŚLAJ ŻADNEGO PRZEPISU!
W takim wypadku:
- W polu "title" wpisz dokładnie: "BRAK_PRZEPISU"
- W polu "description" opisz po polsku, dlaczego źródło nie zawiera przepisu kulinarnego.

<untrusted_recipe_source>
${combinedSource}
</untrusted_recipe_source>`;

    const recipe = await generateStructuredRecipe(config, {
      userPrompt,
      inlineImages,
      parentSignal: req.signal,
    });

    if (
      recipe.title === "BRAK_PRZEPISU" ||
      recipe.title.toLowerCase().startsWith("brak_przepisu") ||
      recipe.title.toLowerCase().includes("brak przepisu")
    ) {
      const errorDetail =
        recipe.description && !recipe.description.toLowerCase().includes("brak_przepisu")
          ? recipe.description
          : "W dostarczonym źródle nie znaleziono przepisu kulinarnego. Upewnij się, że link lub tekst zawiera składniki i opis przygotowania.";

      return new Response(
        JSON.stringify({ code: "NO_RECIPE_FOUND", error: errorDetail }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

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
              ? (err instanceof Error && err.message ? err.message : "Nie udało się poprawnie odczytać przepisu ze źródła. Spróbuj ponownie.")
              : (err instanceof Error && err.message ? err.message : "Nie udało się teraz zaimportować przepisu. Spróbuj ponownie za chwilę.");

    return new Response(
      JSON.stringify({ code, error: message }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
