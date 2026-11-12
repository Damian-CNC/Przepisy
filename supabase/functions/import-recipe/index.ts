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

interface ApifyChildPost {
  displayUrl?: string;
  thumbnailUrl?: string;
}

interface ApifyInstagramItem {
  caption?: string;
  displayUrl?: string;
  thumbnailUrl?: string;
  thumbnailSrc?: string;
  imageUrl?: string;
  coverUrl?: string;
  images?: string[];
  childPosts?: ApifyChildPost[];
}

type GeminiPart =
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
          text: JSON.stringify(recipe).slice(0, 12000),
          imageUrl: extractJsonLdImage(recipe.image),
        };
      }
    } catch {
      // Ignoruj niepoprawne bloki JSON-LD
    }
  }
  return { text: "", imageUrl: null };
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

async function uploadBytesToSupabaseStorage(
  supabaseUrl: string,
  supabaseServiceKey: string,
  bytes: ArrayBuffer | Uint8Array,
  contentType: string,
  folder = "imported",
): Promise<string | null> {
  try {
    const normalizedType = contentType.split(";")[0].trim().toLowerCase();
    if (!normalizedType.startsWith("image/")) {
      return null;
    }

    const byteLength = bytes instanceof Uint8Array ? bytes.byteLength : bytes.byteLength;
    if (byteLength === 0 || byteLength > 6 * 1024 * 1024) {
      return null;
    }

    let fileExt = "jpg";
    if (normalizedType.includes("png")) {
      fileExt = "png";
    } else if (normalizedType.includes("webp")) {
      fileExt = "webp";
    }

    const fileName = `${folder}/${crypto.randomUUID()}.${fileExt}`;
    const baseUrl = supabaseUrl.replace(/\/+$/, "");

    const uploadRes = await fetch(`${baseUrl}/storage/v1/object/recipe-images/${fileName}`, {
      method: "POST",
      headers: {
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
        "Content-Type": normalizedType,
        "x-upsert": "false",
      },
      body: bytes,
      signal: AbortSignal.timeout(8000),
    });

    if (!uploadRes.ok) {
      console.warn("Błąd zapisu okładki w Storage:", uploadRes.status);
      return null;
    }

    return `${baseUrl}/storage/v1/object/public/recipe-images/${fileName}`;
  } catch (err) {
    console.warn("Nie udało się zapisać okładki w Supabase Storage:", err);
    return null;
  }
}

async function uploadImageToSupabaseStorage(
  supabaseUrl: string,
  supabaseServiceKey: string,
  externalImageUrl: string,
  referer?: string,
): Promise<string | null> {
  if (!isSafePublicHttpUrl(externalImageUrl)) return null;

  try {
    const imgRes = await fetch(externalImageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        ...(referer ? { Referer: referer } : {}),
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!imgRes.ok) return null;

    const rawContentType = imgRes.headers.get("content-type") || "";
    const contentLength = Number(imgRes.headers.get("content-length") || "0");
    if (contentLength > 6 * 1024 * 1024) {
      return null;
    }

    const arrayBuffer = await imgRes.arrayBuffer();
    return await uploadBytesToSupabaseStorage(
      supabaseUrl,
      supabaseServiceKey,
      arrayBuffer,
      rawContentType,
      "imported",
    );
  } catch (err) {
    console.warn("Nie udało się skopiować zdjęcia do Supabase Storage:", err);
    return null;
  }
}

function decodeBase64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function tryGenerateFoodCoverWithGemini(
  geminiApiKey: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
  title: string,
  description?: string | null,
  category?: string | null,
): Promise<string | null> {
  const prompt = `Professional overhead editorial food photography of finished dish: "${title}"${
    category ? ` (${category})` : ""
  }.${description ? ` Context: ${description}.` : ""} Warm natural kitchen daylight, appetizing plated homemade food, shallow depth of field, high detail, photorealistic, no text, no watermarks, no logos.`;

  const imageModels = ["gemini-2.5-flash-image", "gemini-2.0-flash-exp-image-generation"];
  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: { aspectRatio: "4:3" },
    },
  });

  for (const modelName of imageModels) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": geminiApiKey,
          },
          body,
          signal: AbortSignal.timeout(13000),
        },
      );
      if (!res.ok) continue;

      const json = (await res.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{
              inlineData?: { mimeType?: string; data?: string };
            }>;
          };
        }>;
      };

      const imagePart = (json.candidates?.[0]?.content?.parts ?? []).find(
        (part) => typeof part.inlineData?.data === "string" && part.inlineData.data.length > 100,
      );
      if (!imagePart?.inlineData?.data) continue;

      const mimeType = imagePart.inlineData.mimeType || "image/png";
      const bytes = decodeBase64ToUint8Array(imagePart.inlineData.data);
      const uploaded = await uploadBytesToSupabaseStorage(
        supabaseUrl,
        supabaseServiceKey,
        bytes,
        mimeType,
        "generated",
      );
      if (uploaded) return uploaded;
    } catch (err) {
      console.warn(`Generowanie okładki modelem ${modelName} nie powiodło się:`, err);
    }
  }

  return null;
}

async function tryWikipediaFoodThumbnail(
  supabaseUrl: string,
  supabaseServiceKey: string,
  title: string,
): Promise<string | null> {
  const cleanTitle = title.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  if (!cleanTitle) return null;

  for (const lang of ["pl", "en"]) {
    try {
      const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
        cleanTitle,
      )}&gsrlimit=3&prop=pageimages&pithumbsize=1000&format=json&origin=*`;
      const res = await fetch(searchUrl, { signal: AbortSignal.timeout(4500) });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        query?: {
          pages?: Record<string, { thumbnail?: { source?: string } }>;
        };
      };
      const pages = Object.values(data.query?.pages ?? {});
      for (const page of pages) {
        const src = page.thumbnail?.source;
        if (src && isSafePublicHttpUrl(src) && !/\.svg(\?|$)/i.test(src)) {
          const uploaded = await uploadImageToSupabaseStorage(
            supabaseUrl,
            supabaseServiceKey,
            src,
          );
          if (uploaded) return uploaded;
        }
      }
    } catch {
      // Spróbuj kolejnej wersji językowej
    }
  }
  return null;
}

async function generateAndUploadFoodCover(params: {
  geminiApiKey: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
  title: string;
  description?: string | null;
  category?: string | null;
}): Promise<string | null> {
  const aiCover = await tryGenerateFoodCoverWithGemini(
    params.geminiApiKey,
    params.supabaseUrl,
    params.supabaseServiceKey,
    params.title,
    params.description,
    params.category,
  );
  if (aiCover) return aiCover;

  return await tryWikipediaFoodThumbnail(
    params.supabaseUrl,
    params.supabaseServiceKey,
    params.title,
  );
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
    const geminiModel = Deno.env.get("GEMINI_MODEL") || "gemini-3.5-flash-lite";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const apifyToken = Deno.env.get("APIFY_API_TOKEN");

    if (!geminiApiKey) {
      throw new Error("Brak klucza GEMINI_API_KEY w zmiennych środowiskowych Supabase.");
    }
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Brak zmiennych SUPABASE_URL lub SUPABASE_SERVICE_ROLE_KEY.");
    }

    let extractedText = rawText;
    let externalImageUrl: string | null = null;
    let sourcePlatform = "manual";

    // 1. Ekstrakcja z URL (lekka, równoległa, bez dużych bibliotek)
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

      let apifyGotCaption = false;

      if (isInstagram && apifyToken) {
        try {
          const apifyRes = await fetch(
            `https://api.apify.com/v2/acts/apify~instagram-post-scraper/run-sync-get-dataset-items?token=${apifyToken}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ username: [url], resultsLimit: 1 }),
              signal: AbortSignal.timeout(18000),
            },
          );

          if (apifyRes.ok) {
            const items: unknown = await apifyRes.json();
            if (Array.isArray(items) && items.length > 0) {
              const firstItem = items[0] as ApifyInstagramItem;
              if (typeof firstItem.caption === "string" && firstItem.caption.trim()) {
                extractedText += (extractedText ? "\n" : "") + firstItem.caption.trim();
                if (firstItem.caption.trim().length > 40) {
                  apifyGotCaption = true;
                }
              }
              const candidateImage =
                firstItem.displayUrl ||
                firstItem.thumbnailUrl ||
                firstItem.thumbnailSrc ||
                firstItem.imageUrl ||
                firstItem.coverUrl ||
                (Array.isArray(firstItem.images) ? firstItem.images[0] : undefined) ||
                firstItem.childPosts?.[0]?.displayUrl ||
                firstItem.childPosts?.[0]?.thumbnailUrl;
              if (typeof candidateImage === "string" && candidateImage.trim()) {
                externalImageUrl = candidateImage.trim();
              }
            }
          }
        } catch (apifyErr) {
          console.warn("Błąd wywołania Apify dla Instagrama:", apifyErr);
        }
      }

      // Dla zwykłych stron pobieramy HTML + Jina równolegle; dla IG pomijamy ciężki HTML jeśli brak potrzeby
      const [htmlOutcome, jinaOutcome] = await Promise.allSettled([
        isInstagram
          ? Promise.resolve("")
          : fetch(url, {
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7",
              },
              signal: AbortSignal.timeout(8000),
            }).then(async (res) => (res.ok ? (await res.text()).slice(0, 350000) : "")),
        apifyGotCaption
          ? Promise.resolve("")
          : fetch(`https://r.jina.ai/${url}`, {
              headers: { Accept: "text/plain" },
              signal: AbortSignal.timeout(9000),
            }).then(async (res) => (res.ok ? (await res.text()).slice(0, 15000) : "")),
      ]);

      if (htmlOutcome.status === "fulfilled" && htmlOutcome.value) {
        const html = htmlOutcome.value;
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

      if (jinaOutcome.status === "fulfilled" && jinaOutcome.value.trim()) {
        const jinaText = jinaOutcome.value.trim();
        const isInstagramBlockWall =
          isInstagram &&
          /sorry,\s*this page isn't available|log in to instagram|create an account|something went wrong/i.test(
            jinaText,
          ) &&
          jinaText.length < 1800;
        if (!isInstagramBlockWall) {
          extractedText += (extractedText ? "\n" : "") + jinaText.slice(0, 14000);
          if (!externalImageUrl) {
            const mdImgMatch = jinaText.match(
              /!\[[^\]]*\]\((https:\/\/[^)\s]+)\)/,
            );
            const mdUrl = mdImgMatch?.[1];
            if (mdUrl && !/profile|avatar|icon|logo|emoji/i.test(mdUrl)) {
              externalImageUrl = mdUrl;
            }
          }
        }
      }
    }

    if (!extractedText.trim() && !rawImageBase64) {
      return jsonResponse(
        {
          error:
            "Nie udało się automatycznie pobrać opisu tego posta (np. Instagram zablokował odczyt). Skopiuj opis rolki ręcznie i wklej go poniżej, albo użyj zakładki „Ze zdjęcia / Zrzutu”.",
        },
        422,
      );
    }

    // 2. Zapis okładki w Supabase Storage (opcjonalny, równoległy z Gemini REST lub przed)
    const prompt = `
Jesteś profesjonalnym szefem kuchni i tłumaczem kulinarnym.
Przeanalizuj dostarczony materiał (tekst ze strony/Instagrama i/lub zdjęcie).
1. Wyciągnij kompletny przepis kulinarny.
2. PRZETŁUMACZ CAŁOŚĆ NA JĘZYK POLSKI (jeśli już jest po polsku, zachowaj dokładne ilości i nazwy).
3. Przelicz wszystkie jednostki anglosaskie (cups, oz, lbs, fahrenheit) na polskie jednostki metryczne (g, ml, szt., łyżki, łyżeczki, °C).
4. Podziel przygotowanie na logiczne, pojedyncze kroki w stylu Thermomixa.
5. KLUCZOWE: W każdym kroku w polu "step_ingredients" wypisz DOKŁADNIE te składniki i ich ilości, które są dodawane lub używane w TYM konkretnym kroku (aby użytkownik podczas gotowania nie musiał wracać do ogólnej listy składników).
6. Jeśli w kroku występuje pieczenie, gotowanie, odstawienie lub smażenie przez określony czas, przelicz ten czas na sekundy i wpisz w pole "timer_seconds" (np. 10 minut = 600). Jeśli brak czasu, wpisz 0.
7. Jeśli składnik nie ma podanej dokładnej ilości (np. "olej do posmarowania", "sól do smaku"), ustaw amount na 0 i wpisz w unit np. "wg uznania" lub "do posmarowania" — NIGDY nie wymyślaj na siłę "1 szt.".
8. Jeśli składnik ma podany zamiennik lub alternatywę (np. "15 g świeżych drożdży lub 8 g suszonych"), zachowaj ten dopisek w polu name (np. "świeże drożdże (lub 8 g suszonych)").
9. BARDZO WAŻNE — SEKCJE SKŁADNIKÓW: Jeśli przepis dzieli składniki na części/sekcje (np. "Zaparka", "Ciasto", "Farsz", "Ciasto na pierogi", "Sos", "Krem", "Polewa", "Marynata", "Nadzienie"), wpisz dokładną nazwę sekcji w pole "category" każdego składnika z tej sekcji (np. "Zaparka", "Ciasto", "Farsz"), zachowując kolejność sekcji z przepisu oraz czystą nazwę składnika w polu "name" (bez dopisywania sekcji w nawiasie). Jeśli przepis nie ma podziału na sekcje, zostaw "category" puste.
`.trim();

    const parts: GeminiPart[] = [{ text: prompt }];
    if (extractedText.trim()) {
      parts.push({ text: `TREŚĆ ŹRÓDŁOWA:\n${extractedText.trim()}` });
    }

    if (rawImageBase64) {
      if (!url) {
        sourcePlatform = "photo";
      }
      const dataUrlMatch = rawImageBase64.match(/^data:([^;]+);base64,(.+)$/);
      const resolvedMimeType = rawMimeType || dataUrlMatch?.[1] || "image/jpeg";
      const resolvedBase64 = dataUrlMatch?.[2] || rawImageBase64;

      parts.push({
        inlineData: {
          data: resolvedBase64,
          mimeType: resolvedMimeType,
        },
      });
    }

    const candidateModels = Array.from(
      new Set([geminiModel, "gemini-flash-latest", "gemini-3.8-flash"]),
    );

    const requestBody = JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RECIPE_RESPONSE_SCHEMA,
      },
    });

    const imageUploadPromise = externalImageUrl
      ? uploadImageToSupabaseStorage(
          supabaseUrl,
          supabaseServiceKey,
          externalImageUrl,
          sourcePlatform === "instagram" ? "https://www.instagram.com/" : url || undefined,
        )
      : Promise.resolve<string | null>(null);

    let generatedText: string | null = null;
    const modelErrors: string[] = [];

    for (const modelName of candidateModels) {
      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": geminiApiKey,
            },
            body: requestBody,
            signal: AbortSignal.timeout(22000),
          },
        );

        const geminiJson = (await geminiRes.json()) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
          }>;
          error?: { message?: string };
        };

        if (!geminiRes.ok) {
          throw new Error(geminiJson.error?.message || `HTTP ${geminiRes.status}`);
        }

        const text = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
          throw new Error("Pusta odpowiedź modelu Gemini.");
        }

        generatedText = text;
        break;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        modelErrors.push(`${modelName}: ${errMsg}`);
        console.warn(`Model ${modelName} nie odpowiedział:`, errMsg);
      }
    }

    const permanentImageUrl = await imageUploadPromise;

    if (!generatedText) {
      const combined = modelErrors.join(" | ");
      const isOverloaded =
        combined.includes("503") || combined.includes("UNAVAILABLE") || combined.includes("429");
      return jsonResponse(
        {
          error: isOverloaded
            ? "Modele Gemini są chwilowo przeciążone. Spróbuj ponownie za kilkanaście sekund."
            : `Nie udało się przetworzyć przepisu przez Gemini API (${combined})`,
        },
        isOverloaded ? 503 : 502,
      );
    }

    const parsedRecipe = JSON.parse(generatedText) as Record<string, unknown>;

    let finalImageUrl = permanentImageUrl;
    if (!finalImageUrl && !rawImageBase64) {
      const recipeTitle =
        typeof parsedRecipe.title === "string" ? parsedRecipe.title.trim() : "";
      const recipeDesc =
        typeof parsedRecipe.description === "string" ? parsedRecipe.description.trim() : null;
      const recipeCat =
        typeof parsedRecipe.category === "string" ? parsedRecipe.category.trim() : null;

      if (recipeTitle) {
        finalImageUrl = await generateAndUploadFoodCover({
          geminiApiKey,
          supabaseUrl,
          supabaseServiceKey,
          title: recipeTitle,
          description: recipeDesc,
          category: recipeCat,
        });
      }
    }

    return jsonResponse({
      recipe: {
        ...parsedRecipe,
        source_url: url || null,
        source_platform: sourcePlatform,
        image_url: finalImageUrl,
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Błąd podczas importu przepisu";
    return jsonResponse({ error: message }, 500);
  }
});
