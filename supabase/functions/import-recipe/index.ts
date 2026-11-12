import { createClient } from "npm:@supabase/supabase-js@2";
import { GoogleGenAI, Type } from "npm:@google/genai@^1.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ImportRecipeRequest {
  url?: string;
  rawText?: string;
  imageBase64?: string;
  mimeType?: string;
}

interface ApifyInstagramItem {
  caption?: string;
  displayUrl?: string;
  thumbnailUrl?: string;
  images?: string[];
}

type GeminiContentPart =
  | { text: string }
  | { inlineData: { data: string; mimeType: string } };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function isSafePublicHttpUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "::1" ||
    host.startsWith("fe80:") ||
    host.startsWith("fc") ||
    host.startsWith("fd")
  ) {
    return false;
  }

  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) {
      return false;
    }
  }

  return true;
}

function extractMetaContent(html: string, property: string): string | null {
  const forward = new RegExp(
    `<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']+)["']`,
    "i",
  );
  const reverse = new RegExp(
    `<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${property}["']`,
    "i",
  );
  const nameForward = new RegExp(
    `<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']+)["']`,
    "i",
  );
  const match = html.match(forward) || html.match(reverse) || html.match(nameForward);
  return match?.[1] ? decodeBasicHtmlEntities(match[1].trim()) : null;
}

function findJsonLdRecipe(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findJsonLdRecipe(item);
      if (found) return found;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  const rawType = obj["@type"];
  const types = Array.isArray(rawType) ? rawType : [rawType];
  if (types.some((t) => typeof t === "string" && t.toLowerCase().includes("recipe"))) {
    return obj;
  }
  if (obj["@graph"]) {
    return findJsonLdRecipe(obj["@graph"]);
  }
  return null;
}

function extractJsonLdImage(imageField: unknown): string | null {
  if (typeof imageField === "string" && imageField.startsWith("http")) {
    return imageField;
  }
  if (Array.isArray(imageField)) {
    for (const entry of imageField) {
      const found = extractJsonLdImage(entry);
      if (found) return found;
    }
  }
  if (imageField && typeof imageField === "object") {
    const obj = imageField as Record<string, unknown>;
    if (typeof obj.url === "string" && obj.url.startsWith("http")) {
      return obj.url;
    }
  }
  return null;
}

function extractRecipeJsonLdFromHtml(html: string): { text: string; imageUrl: string | null } {
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const parsed: unknown = JSON.parse(match[1].trim());
      const recipe = findJsonLdRecipe(parsed);
      if (recipe) {
        return {
          text: JSON.stringify(recipe).slice(0, 15000),
          imageUrl: extractJsonLdImage(recipe.image),
        };
      }
    } catch {
      // Ignoruj niepoprawne bloki JSON-LD
    }
  }
  return { text: "", imageUrl: null };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let payload: ImportRecipeRequest;
    try {
      payload = (await req.json()) as ImportRecipeRequest;
    } catch {
      return jsonResponse({ error: "Nieprawidłowe dane JSON w żądaniu." }, 400);
    }

    const url = typeof payload.url === "string" ? payload.url.trim() : "";
    const rawText = typeof payload.rawText === "string" ? payload.rawText.trim() : "";
    const rawImageBase64 =
      typeof payload.imageBase64 === "string" ? payload.imageBase64.trim() : "";
    const rawMimeType =
      typeof payload.mimeType === "string" ? payload.mimeType.trim() : "";

    if (!url && !rawText && !rawImageBase64) {
      return jsonResponse(
        { error: "Podaj link do przepisu, tekst lub zdjęcie potrawy." },
        400,
      );
    }

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    const geminiModel = Deno.env.get("GEMINI_MODEL") || "gemini-3.8-flash";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const apifyToken = Deno.env.get("APIFY_API_TOKEN");

    if (!geminiApiKey) {
      throw new Error("Brak klucza GEMINI_API_KEY w zmiennych środowiskowych Supabase.");
    }
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Brak zmiennych SUPABASE_URL lub SUPABASE_SERVICE_ROLE_KEY.");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });

    let extractedText = rawText;
    let externalImageUrl: string | null = null;
    let sourcePlatform = "manual";

    // 1. Obsługa ekstrakcji z URL (Instagram oraz strony WWW)
    if (url) {
      if (!isSafePublicHttpUrl(url)) {
        return jsonResponse(
          { error: "Podaj poprawny, publiczny adres URL zaczynający się od http:// lub https://." },
          400,
        );
      }

      const lowerUrl = url.toLowerCase();
      const isInstagram =
        lowerUrl.includes("instagram.com") || lowerUrl.includes("instagr.am");
      sourcePlatform = isInstagram ? "instagram" : "web";

      if (isInstagram && apifyToken) {
        try {
          const apifyRes = await fetch(
            `https://api.apify.com/v2/acts/apify~instagram-post-scraper/run-sync-get-dataset-items?token=${apifyToken}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ username: [url], resultsLimit: 1 }),
              signal: AbortSignal.timeout(25000),
            },
          );

          if (!apifyRes.ok) {
            console.warn(
              `Apify zwróciło status ${apifyRes.status}; przechodzę do fallbacku OpenGraph/Jina.`,
            );
          } else {
            const items: unknown = await apifyRes.json();
            if (Array.isArray(items) && items.length > 0) {
              const firstItem = items[0] as ApifyInstagramItem;
              if (typeof firstItem.caption === "string" && firstItem.caption.trim()) {
                extractedText += (extractedText ? "\n" : "") + firstItem.caption.trim();
              }
              const candidateImage =
                firstItem.displayUrl ||
                firstItem.thumbnailUrl ||
                (Array.isArray(firstItem.images) ? firstItem.images[0] : undefined);
              if (typeof candidateImage === "string" && candidateImage.trim()) {
                externalImageUrl = candidateImage.trim();
              }
            }
          }
        } catch (apifyErr) {
          console.warn(
            "Błąd wywołania Apify dla Instagrama; przechodzę do fallbacku:",
            apifyErr,
          );
        }
      }

      // Pobranie metadanych OpenGraph oraz JSON-LD Recipe bezpośrednio z HTML
      try {
        const pageRes = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7",
          },
          signal: AbortSignal.timeout(12000),
        });
        if (pageRes.ok) {
          const html = await pageRes.text();

          const jsonLd = extractRecipeJsonLdFromHtml(html);
          if (jsonLd.imageUrl && !externalImageUrl) {
            externalImageUrl = jsonLd.imageUrl;
          }
          if (jsonLd.text) {
            extractedText += (extractedText ? "\n" : "") + `JSON_LD_RECIPE:\n${jsonLd.text}`;
          }

          const ogImage =
            extractMetaContent(html, "og:image") ||
            extractMetaContent(html, "twitter:image");
          if (ogImage && !externalImageUrl) {
            externalImageUrl = ogImage;
          }

          const ogTitle = extractMetaContent(html, "og:title");
          const ogDescription =
            extractMetaContent(html, "og:description") ||
            extractMetaContent(html, "description");
          if (ogTitle || ogDescription) {
            extractedText +=
              (extractedText ? "\n" : "") +
              [ogTitle, ogDescription].filter(Boolean).join("\n");
          }
        }
      } catch (ogErr) {
        console.warn("Błąd pobierania bezpośredniego HTML/OpenGraph:", ogErr);
      }

      // Pobranie czystej treści strony przez Jina Reader (limit 15000 znaków)
      try {
        const jinaRes = await fetch(`https://r.jina.ai/${url}`, {
          headers: { Accept: "text/plain" },
          signal: AbortSignal.timeout(18000),
        });
        if (jinaRes.ok) {
          const jinaText = await jinaRes.text();
          if (jinaText.trim()) {
            extractedText += (extractedText ? "\n" : "") + jinaText.slice(0, 15000);
          }
        }
      } catch (jinaErr) {
        console.warn("Błąd pobierania treści przez Jina Reader:", jinaErr);
      }
    }

    // Sprawdzenie czy po próbie ekstrakcji mamy jakikolwiek tekst lub zdjęcie
    if (!extractedText.trim() && !rawImageBase64) {
      return jsonResponse(
        {
          error:
            "Nie udało się pobrać treści przepisu z podanego linku (np. prywatny profil lub blokada strony). Wklej opis rolki lub treść przepisu ręcznie.",
        },
        422,
      );
    }

    // 2. Trwały zapis okładki w Supabase Storage (aby link np. z IG nie wygasł)
    let permanentImageUrl: string | null = null;
    if (externalImageUrl && isSafePublicHttpUrl(externalImageUrl)) {
      try {
        const imgRes = await fetch(externalImageUrl, {
          signal: AbortSignal.timeout(10000),
        });
        if (imgRes.ok) {
          const rawContentType = imgRes.headers.get("content-type") || "";
          const contentType = rawContentType.split(";")[0].trim().toLowerCase();

          if (!contentType.startsWith("image/")) {
            console.warn(`Pominięto zapis okładki — nieprawidłowy MIME: ${contentType}`);
          } else {
            const arrayBuffer = await imgRes.arrayBuffer();
            if (arrayBuffer.byteLength > 10 * 1024 * 1024) {
              console.warn("Pominięto zapis okładki — plik przekracza 10 MB.");
            } else {
              let fileExt = "jpg";
              if (contentType.includes("png")) {
                fileExt = "png";
              } else if (contentType.includes("webp")) {
                fileExt = "webp";
              }

              const fileName = `imported/${crypto.randomUUID()}.${fileExt}`;

              const { error: uploadError } = await supabase.storage
                .from("recipe-images")
                .upload(fileName, arrayBuffer, { contentType, upsert: false });

              if (!uploadError) {
                const { data: publicUrlData } = supabase.storage
                  .from("recipe-images")
                  .getPublicUrl(fileName);
                permanentImageUrl = publicUrlData.publicUrl;
              } else {
                console.warn("Błąd zapisu okładki w Storage:", uploadError.message);
              }
            }
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
3. Przelicz wszystkie jednostki anglosaskie (cups, oz, lbs, fahrenheit) na polskie jednostki metryczne (g, ml, szt., łyżki, łyżeczki, °C).
4. Podziel przygotowanie na logiczne, pojedyncze kroki w stylu Thermomixa.
5. KLUCZOWE: W każdym kroku w polu "step_ingredients" wypisz DOKŁADNIE te składniki i ich ilości, które są dodawane lub używane w TYM konkretnym kroku (aby użytkownik podczas gotowania nie musiał wracać do ogólnej listy składników).
6. Jeśli w kroku występuje pieczenie, gotowanie, odstawienie lub smażenie przez określony czas, przelicz ten czas na sekundy i wpisz w pole "timer_seconds" (np. 10 minut = 600). Jeśli brak czasu, wpisz 0.
`.trim();

    const contents: GeminiContentPart[] = [{ text: prompt }];
    if (extractedText.trim()) {
      contents.push({ text: `TREŚĆ ŹRÓDŁOWA:\n${extractedText.trim()}` });
    }

    if (rawImageBase64) {
      if (!url) {
        sourcePlatform = "photo";
      }
      const dataUrlMatch = rawImageBase64.match(/^data:([^;]+);base64,(.+)$/);
      const resolvedMimeType = rawMimeType || dataUrlMatch?.[1] || "image/jpeg";
      const resolvedBase64 = dataUrlMatch?.[2] || rawImageBase64;

      contents.push({
        inlineData: {
          data: resolvedBase64,
          mimeType: resolvedMimeType,
        },
      });
    }

    const candidateModels = Array.from(
      new Set([
        geminiModel,
        "gemini-3.5-flash-lite",
        "gemini-flash-latest",
      ]),
    );

    const generateConfig = {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "Nazwa potrawy po polsku" },
          description: {
            type: Type.STRING,
            description: "Krótki, apetyczny opis potrawy (1-2 zdania)",
          },
          prep_time_minutes: {
            type: Type.INTEGER,
            description: "Czas przygotowania w minutach",
          },
          cook_time_minutes: {
            type: Type.INTEGER,
            description: "Czas gotowania/pieczenia w minutach",
          },
          servings: { type: Type.INTEGER, description: "Liczba porcji" },
          category: {
            type: Type.STRING,
            description:
              "Jedna z kategorii: Śniadanie, Obiad, Kolacja, Deser, Przekąska, Napój, Wypieki",
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
                instruction: {
                  type: Type.STRING,
                  description: "Jasna instrukcja co zrobić w tym kroku",
                },
                step_ingredients: {
                  type: Type.ARRAY,
                  description:
                    "Składniki dodawane konkretnie w tym kroku wraz z ilością",
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
                  description:
                    "Czas minutnika w sekundach (0 jeśli krok nie wymaga odliczania czasu)",
                },
                tip: {
                  type: Type.STRING,
                  description: "Opcjonalna wskazówka kulinarna do kroku",
                },
              },
              required: [
                "step_number",
                "instruction",
                "step_ingredients",
                "timer_seconds",
              ],
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
      },
    };

    let response: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null;
    const modelErrors: string[] = [];

    for (const modelName of candidateModels) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents,
          config: generateConfig,
        });
        break;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        modelErrors.push(`${modelName}: ${errMsg}`);
        console.warn(`Model ${modelName} niedostępny lub przeciążony, próbuję kolejny:`, errMsg);
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }

    if (!response) {
      const combined = modelErrors.join(" | ");
      const isOverloaded = combined.includes("503") || combined.includes("UNAVAILABLE") || combined.includes("429");
      return jsonResponse(
        {
          error: isOverloaded
            ? "Modele Gemini są chwilowo przeciążone. Spróbuj ponownie za kilkanaście sekund."
            : `Nie udało się przetworzyć przepisu przez Gemini API (${combined})`,
        },
        isOverloaded ? 503 : 502,
      );
    }

    const responseText = response.text;
    if (!responseText) {
      throw new Error("Model Gemini nie zwrócił odpowiedzi JSON.");
    }

    const parsedRecipe = JSON.parse(responseText) as Record<string, unknown>;

    return jsonResponse({
      recipe: {
        ...parsedRecipe,
        source_url: url || null,
        source_platform: sourcePlatform,
        image_url: permanentImageUrl,
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Błąd podczas importu przepisu";
    return jsonResponse({ error: message }, 500);
  }
});
