const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AssistantMode = "discover" | "edit" | "generate-image";

interface AiAssistantRequest {
  mode?: unknown;
  userPrompt?: unknown;
  currentRecipe?: unknown;
  useWebSearch?: unknown;
  title?: unknown;
  description?: unknown;
  category?: unknown;
  forceGenerate?: unknown;
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
      description:
        "Pełna lista wszystkich składników, OBOWIĄZKOWO podzielona na półwyroby/sekcje w polu category",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          amount: { type: "NUMBER" },
          unit: {
            type: "STRING",
            description:
              "Jednostka pod wagę kuchenną: preferuj 'g' (przelicz ml, l, szklanki, cups, oz na gramy). Dozwolone też 'łyżeczka', 'łyżeczki', 'szczypta', 'szt.', 'ząbek', 'wg uznania'. ZAKAZ 'ml', 'l', 'szklanka', 'cup'.",
          },
          category: {
            type: "STRING",
            description:
              "OBOWIĄZKOWA nazwa półwyrobu/sekcji (np. Zaparka, Ciasto, Farsz, Ciasto na pierogi, Sos, Polewa, Wykończenie i pieczenie). Nigdy nie zostawiaj pustego pola.",
          },
        },
        required: ["name", "amount", "unit", "category"],
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
            description: "Jasna instrukcja co zrobić w tym kroku (płyny i sypkie podawaj w gramach 'g')",
          },
          step_ingredients: {
            type: "ARRAY",
            description: "Składniki dodawane konkretnie w tym kroku wraz z ilością w gramach",
            items: {
              type: "OBJECT",
              properties: {
                name: { type: "STRING" },
                amount: { type: "NUMBER" },
                unit: {
                  type: "STRING",
                  description:
                    "Preferuj 'g' (ZAKAZ 'ml', 'l', 'szklanka', 'cup'). Dozwolone też małe miary jak 'łyżeczka', 'szczypta', 'szt.'.",
                },
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

function decodeBase64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function isSafeHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function readPngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (
    bytes.byteLength < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    return null;
  }
  const width =
    ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0;
  const height =
    ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0;
  return width > 0 && height > 0 ? { width, height } : null;
}

function readJpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.byteLength < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset + 8 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
      return width > 0 && height > 0 ? { width, height } : null;
    }
    if (offset + 3 >= bytes.byteLength) break;
    const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (segmentLength < 2) break;
    offset += 2 + segmentLength;
  }
  return null;
}

function isHighQualityRasterImage(rawBytes: ArrayBuffer | Uint8Array, contentType: string): boolean {
  const normalizedType = contentType.split(";")[0].trim().toLowerCase();
  if (
    !normalizedType.startsWith("image/") ||
    normalizedType.includes("svg") ||
    normalizedType.includes("icon") ||
    normalizedType.includes("gif")
  ) {
    return false;
  }

  const bytes = rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes);
  if (bytes.byteLength < 20_000 || bytes.byteLength > 6 * 1024 * 1024) {
    return false;
  }

  const dims = readPngDimensions(bytes) ?? readJpegDimensions(bytes);
  if (dims) {
    return dims.width >= 400 && dims.height >= 300;
  }

  return bytes.byteLength >= 30_000;
}

async function uploadBytesToSupabaseStorage(
  supabaseUrl: string,
  supabaseServiceKey: string,
  bytes: ArrayBuffer | Uint8Array,
  contentType: string,
  folder = "generated",
  enforceQuality = false,
): Promise<string | null> {
  try {
    const normalizedType = contentType.split(";")[0].trim().toLowerCase();
    if (!normalizedType.startsWith("image/") || normalizedType.includes("svg")) return null;
    if (enforceQuality && !isHighQualityRasterImage(bytes, normalizedType)) return null;
    if (bytes.byteLength === 0 || bytes.byteLength > 6 * 1024 * 1024) return null;

    let fileExt = "jpg";
    if (normalizedType.includes("png")) fileExt = "png";
    else if (normalizedType.includes("webp")) fileExt = "webp";

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
          signal: AbortSignal.timeout(14000),
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

async function downloadAndUploadQualityImage(
  supabaseUrl: string,
  supabaseServiceKey: string,
  imageUrl: string,
  referer?: string,
  folder = "web-search",
): Promise<string | null> {
  if (!isSafeHttpUrl(imageUrl)) return null;
  if (/favicon|sprite|logo|avatar|profile_pic|emoji|blank\.png/i.test(imageUrl)) {
    return null;
  }
  try {
    const imgRes = await fetch(imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        ...(referer ? { Referer: referer } : {}),
      },
      redirect: "follow",
      signal: AbortSignal.timeout(6500),
    });
    if (!imgRes.ok) return null;
    const contentType = imgRes.headers.get("content-type") || "image/jpeg";
    const bytes = await imgRes.arrayBuffer();
    return await uploadBytesToSupabaseStorage(
      supabaseUrl,
      supabaseServiceKey,
      bytes,
      contentType,
      folder,
      true,
    );
  } catch {
    return null;
  }
}

function extractImageFromHtml(html: string): string | null {
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    const imageMatch = match[1].match(/"image"\s*:\s*(?:"(https?:\/\/[^"]+)"|\[\s*"(https?:\/\/[^"]+)"|[^}]*"url"\s*:\s*"(https?:\/\/[^"]+)")/i);
    const url = imageMatch?.[1] || imageMatch?.[2] || imageMatch?.[3];
    if (url) return url;
  }

  const ogMatch =
    html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i) ||
    html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);
  return ogMatch?.[1]?.replace(/&amp;/g, "&").trim() || null;
}

async function searchWebRecipePhotosViaGrounding(
  geminiApiKey: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
  title: string,
): Promise<string | null> {
  const cleanTitle = title.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  if (!cleanTitle) return null;

  try {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiApiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `Znajdź najpopularniejsze sprawdzone przepisy ze zdjęciem na potrawę: "${cleanTitle}".`,
                },
              ],
            },
          ],
          tools: [{ google_search: {} }],
        }),
        signal: AbortSignal.timeout(9000),
      },
    );
    if (!res.ok) return null;

    const json = (await res.json()) as GeminiApiResponse;
    const pageUrls = Array.from(
      new Set(
        (json.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
          .map((chunk) => chunk.web?.uri?.trim())
          .filter((u): u is string => Boolean(u && isSafeHttpUrl(u))),
      ),
    ).slice(0, 4);

    if (pageUrls.length === 0) return null;

    const htmlResults = await Promise.allSettled(
      pageUrls.map((pageUrl) =>
        fetch(pageUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(4500),
        }).then(async (r) => ({
          pageUrl: r.url || pageUrl,
          html: r.ok ? (await r.text()).slice(0, 220000) : "",
        })),
      ),
    );

    for (const outcome of htmlResults) {
      if (outcome.status !== "fulfilled" || !outcome.value.html) continue;
      const candidateImg = extractImageFromHtml(outcome.value.html);
      if (!candidateImg) continue;
      const uploaded = await downloadAndUploadQualityImage(
        supabaseUrl,
        supabaseServiceKey,
        candidateImg,
        outcome.value.pageUrl,
        "web-search",
      );
      if (uploaded) return uploaded;
    }
  } catch (err) {
    console.warn("Wyszukiwanie zdjęcia potrawy w sieci nie powiodło się:", err);
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
      )}&gsrlimit=3&prop=pageimages&pithumbsize=1200&format=json&origin=*`;
      const res = await fetch(searchUrl, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        query?: {
          pages?: Record<string, { thumbnail?: { source?: string } }>;
        };
      };
      const pages = Object.values(data.query?.pages ?? {});
      for (const page of pages) {
        const src = page.thumbnail?.source;
        if (src && src.startsWith("https://") && !/\.svg(\?|$)/i.test(src)) {
          const uploaded = await downloadAndUploadQualityImage(
            supabaseUrl,
            supabaseServiceKey,
            src,
            undefined,
            "web-search",
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
  supabaseUrl?: string;
  supabaseServiceKey?: string;
  title: string;
  description?: string | null;
  category?: string | null;
  forceGenerate?: boolean;
}): Promise<string | null> {
  if (!params.supabaseUrl || !params.supabaseServiceKey) return null;

  // Gdy użytkownik nie wymusił generowania AI ręcznie — najpierw szukamy zdjęcia w internecie
  if (!params.forceGenerate) {
    const webPhoto = await searchWebRecipePhotosViaGrounding(
      params.geminiApiKey,
      params.supabaseUrl,
      params.supabaseServiceKey,
      params.title,
    );
    if (webPhoto) return webPhoto;

    const wikiPhoto = await tryWikipediaFoodThumbnail(
      params.supabaseUrl,
      params.supabaseServiceKey,
      params.title,
    );
    if (wikiPhoto) return wikiPhoto;
  }

  // W ostateczności (lub po kliknięciu ręcznego „Generuj zdjęcie”) — generujemy obraz Gemini
  return await tryGenerateFoodCoverWithGemini(
    params.geminiApiKey,
    params.supabaseUrl,
    params.supabaseServiceKey,
    params.title,
    params.description,
    params.category,
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
    if (mode !== "discover" && mode !== "edit" && mode !== "generate-image") {
      return jsonResponse(
        {
          error:
            'Nieprawidłowy parametr "mode". Oczekiwano "discover", "edit" lub "generate-image".',
        },
        400,
      );
    }

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      throw new Error("Brak klucza GEMINI_API_KEY w zmiennych środowiskowych Supabase.");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (mode === ("generate-image" satisfies AssistantMode)) {
      const title = typeof payload.title === "string" ? payload.title.trim() : "";
      if (!title) {
        return jsonResponse({ error: "Podaj nazwę potrawy do wygenerowania zdjęcia." }, 400);
      }
      if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error("Brak konfiguracji Storage w zmiennych środowiskowych Supabase.");
      }

      const description =
        typeof payload.description === "string" ? payload.description.trim() : null;
      const category = typeof payload.category === "string" ? payload.category.trim() : null;
      const forceGenerate = payload.forceGenerate === true;

      const imageUrl = await generateAndUploadFoodCover({
        geminiApiKey,
        supabaseUrl,
        supabaseServiceKey,
        title,
        description,
        category,
        forceGenerate,
      });

      if (!imageUrl) {
        return jsonResponse(
          { error: "Nie udało się teraz wygenerować ani dobrać zdjęcia dla tej potrawy." },
          502,
        );
      }

      return jsonResponse({ image_url: imageUrl });
    }

    const userPrompt =
      typeof payload.userPrompt === "string" ? payload.userPrompt.trim() : "";
    if (!userPrompt) {
      return jsonResponse(
        { error: "Podaj opis lub polecenie w polu userPrompt." },
        400,
      );
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
2. KONWERSJA NA WAGĘ KUCHENNĄ (GRAMY): Użytkownik gotuje na wadze cyfrowej — ZAWSZE przeliczaj mililitry (ml), litry (l), szklanki, kubki (cups), uncje (oz, fl oz) na GRAMY ("g") z uwzględnieniem gęstości (np. 110 ml mleka -> 113 g, 100 ml oleju -> 92 g, 1 szklanka mąki -> 135 g). ZAKAZ używania jednostek "ml", "l", "szklanka", "cup" w składnikach i w krokach! Małe miary przypraw ("łyżeczka", "łyżeczki", "szczypta", "szt.", "ząbek", "wg uznania") mogą zostać.
3. Jeśli składnik nie ma dokładnej ilości (np. "sól do smaku", "olej do smażenia"), ustaw amount na 0, a w unit wpisz np. "wg uznania" lub "do smażenia" — NIGDY nie wymyślaj sztucznego "1 szt.".
4. KRYTYCZNE — OBOWIĄZKOWY PODZIAŁ NA PÓŁWYROBY (SEKCJE): Każdy składnik w "ingredients" MUSI mieć wypełnione pole "category" nazwą półwyrobu/etapu (NIGDY puste!). Nawet jeśli źródłowy przepis ma jedną płaską listę, podziel składniki według kroków przygotowania (np. "Zaparka", "Ciasto główne", "Farsz", "Sos", "Posmarowanie i wykończenie", "Baza", "Dodatki"). Jeśli składnik pojawia się w dwóch etapach (np. mleko lub mąka w Zaparce i w Cieście), wypisz go osobno w obu sekcjach.
5. Podziel przygotowanie na logiczne kroki w stylu Thermomix, numerując "step_number" kolejno od 1 (1, 2, 3...).
6. W każdym kroku w "step_ingredients" wypisz DOKŁADNIE te składniki i ich ilości (w gramach!), które są używane/dodawane w tym kroku.
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

      const recipeTitle =
        typeof parsedRecipe.title === "string" ? parsedRecipe.title.trim() : "";
      const recipeDesc =
        typeof parsedRecipe.description === "string" ? parsedRecipe.description.trim() : null;
      const recipeCat =
        typeof parsedRecipe.category === "string" ? parsedRecipe.category.trim() : null;

      const generatedImageUrl = recipeTitle
        ? await generateAndUploadFoodCover({
            geminiApiKey,
            supabaseUrl,
            supabaseServiceKey,
            title: recipeTitle,
            description: recipeDesc,
            category: recipeCat,
          })
        : null;

      return jsonResponse({
        recipe: {
          ...parsedRecipe,
          source_url: sourceUrl,
          source_platform: useWebSearch ? "web" : "ai",
          image_url: generatedImageUrl,
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
6. KONWERSJA NA WAGĘ (GRAMY): Używaj gramów ("g") zamiast mililitrów ("ml"), litrów ("l") i szklanek ("szklanka"/"cup"), również w krokach; małe miary typu "łyżeczka", "szczypta", "szt." i amount = 0 ("wg uznania") mogą zostać. Zachowaj podział wszystkich składników na półwyroby w polu "category".

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
