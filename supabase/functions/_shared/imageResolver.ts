import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GeminiConfig } from "./geminiConfig.ts";

export interface WebImageCandidate {
  url: string;
  thumbnail: string;
  title: string;
}

function getStorageClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

async function uploadBufferToStorage(
  bytes: Uint8Array,
  mimeType: string,
  userId?: string,
): Promise<string | null> {
  const supabase = getStorageClient();
  if (!supabase) return null;

  const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const folder = userId || "public";
  const filePath = `${folder}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from("recipe-images")
    .upload(filePath, bytes, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) {
    console.error("Storage upload error:", error.message);
    return null;
  }

  const { data } = supabase.storage.from("recipe-images").getPublicUrl(filePath);
  return data?.publicUrl ?? null;
}

export async function rehostExternalImage(
  externalUrl: string,
  userId?: string,
): Promise<string | null> {
  try {
    if (!externalUrl || !/^https?:\/\//i.test(externalUrl)) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(externalUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return externalUrl;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) return externalUrl;

    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength < 1024 || arrayBuffer.byteLength > 8 * 1024 * 1024) {
      return externalUrl;
    }

    const uploaded = await uploadBufferToStorage(new Uint8Array(arrayBuffer), contentType, userId);
    return uploaded || externalUrl;
  } catch {
    return externalUrl || null;
  }
}

function cleanDishTitle(raw: string): string {
  return raw
    .replace(
      /^(przepis na|jak zrobić|jak upiec|domowe|domowy|domowa|tradycyjny|tradycyjna|klasyczny|klasyczna|prosty|prosta|szybki|szybka|pyszny|pyszna|wyśmienity|wyśmienita|najlepszy|najlepsza|chrupiący|chrupiąca|pieczony|pieczona|smażony|smażona|kremowa|kremowy)\s+/gi,
      "",
    )
    .trim();
}

function isFoodPhotoCandidate(url: string, title?: string): boolean {
  if (!url || typeof url !== "string") return false;
  const combined = `${url} ${title ?? ""}`.toLowerCase();

  if (
    combined.endsWith(".pdf") ||
    combined.endsWith(".svg") ||
    combined.endsWith(".gif") ||
    combined.endsWith(".ogg") ||
    combined.endsWith(".webm") ||
    combined.endsWith(".tif") ||
    combined.endsWith(".tiff")
  ) {
    return false;
  }

  // Rygorystyczny filtr: odrzucenie polityków, osób, instytucji, świątyń, obrazów i martwych natur
  const excludedKeywords = [
    "map", "mapa", "flag", "flaga", "logo", "diagram", "icon", "ikona", "herb",
    "chart", "poster", "plakat", "portrait", "portret", "stamp", "znaczek", "sign",
    "symbol", "building", "budynek", "maklowicz", "person", "osoba", "poseł", "posel",
    "minister", "sejm", "senat", "parliament", "author", "locator", "location", "schema",
    "monument", "pomnik", "church", "kościół", "street", "ulica", "city", "miasto",
    "town", "politician", "polityk", "deputy", "gurudwara", "temple", "świątynia",
    "still life", "martwa natura", "painting", "obraz", "drawing", "rysunek",
    "oil on canvas", "sketch", "szkic", "museum", "muzeum", "eierdoos",
  ];

  return !excludedKeywords.some((bad) => combined.includes(bad));
}

export const CURATED_FOOD_IMAGES: Array<{ pattern: RegExp; url: string }> = [
  { pattern: /(?:chleb|bułk|shokupan|naan|bagiet|pieczyw|toast|tost|chałk|flatbread)/i, url: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=80" },
  { pattern: /(?:makaron|pasta|spaghetti|carbonara|penne|tagliatelle|lasagn|bolognese)/i, url: "https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=1200&q=80" },
  { pattern: /(?:pizza|focaccia)/i, url: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80" },
  { pattern: /(?:burger|cheeseburger)/i, url: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80" },
  { pattern: /(?:zupa|krem|rosół|barszcz|żur|gulasz|chłodnik)/i, url: "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=1200&q=80" },
  { pattern: /(?:naleśnik|pancake|gofry|omlet|jajeczn)/i, url: "https://images.unsplash.com/photo-1528207776546-365bb710ee93?auto=format&fit=crop&w=1200&q=80" },
  { pattern: /(?:ciasto|sernik|szarlotka|tort|muffink|babeczk|deser|lody|tiramisu)/i, url: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1200&q=80" },
  { pattern: /(?:sałatk|salad|warzyw)/i, url: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1200&q=80" },
  { pattern: /(?:schabow|kotlet|stek|kurczak|mięs|indyk|kebab)/i, url: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80" },
  { pattern: /(?:ryb|łosoś|dorsz|krewetk|tuna|sushi|owoce morza)/i, url: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=1200&q=80" },
  { pattern: /(?:kawa|herbata|smoothie|koktajl|napój|sok)/i, url: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=1200&q=80" },
];

export function getCuratedFoodFallback(query: string): string {
  for (const item of CURATED_FOOD_IMAGES) {
    if (item.pattern.test(query)) {
      return item.url;
    }
  }
  return "https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=1200&q=80";
}

/**
 * Zwraca 4-6 dopasowanych zdjęć kulinarnych z sieci do wyboru dla użytkownika.
 * Przeszukuje sieć kulinarną (DuckDuckGo / blogi kulinarne) z fallbackiem do Commons i bazy curated.
 */
export async function searchWebFoodCandidates(
  query: string,
  limit = 4,
): Promise<WebImageCandidate[]> {
  const clean = cleanDishTitle(query);
  const searchQueries = [
    `${clean} przepis`,
    clean,
    `${clean} food`,
  ];

  for (const q of searchQueries) {
    try {
      const tokenController = new AbortController();
      const tokenTimer = setTimeout(() => tokenController.abort(), 4000);
      const tokenRes = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(q)}`, {
        signal: tokenController.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      clearTimeout(tokenTimer);

      if (!tokenRes.ok) continue;
      const tokenText = await tokenRes.text();
      const vqdMatch = tokenText.match(/vqd=([^&"']+)/i) || tokenText.match(/vqd=["']([^"']+)["']/i);
      if (!vqdMatch?.[1]) continue;

      const vqd = vqdMatch[1];
      const imgSearchUrl = `https://duckduckgo.com/i.js?l=pl-pl&o=json&q=${encodeURIComponent(q)}&vqd=${vqd}&f=,,,type:photo,&p=1`;

      const imgController = new AbortController();
      const imgTimer = setTimeout(() => imgController.abort(), 6000);
      const imgRes = await fetch(imgSearchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Referer: "https://duckduckgo.com/",
        },
        signal: imgController.signal,
      });
      clearTimeout(imgTimer);

      if (!imgRes.ok) continue;
      const json = await imgRes.json();
      const rawResults = json?.results as Array<{ image?: string; thumbnail?: string; title?: string }> | undefined;

      if (Array.isArray(rawResults) && rawResults.length > 0) {
        const filtered = rawResults
          .filter((item) => {
            const u = item.image || "";
            const t = item.title || "";
            return u.startsWith("http") && isFoodPhotoCandidate(u, t);
          })
          .slice(0, limit)
          .map((item) => ({
            url: item.image!,
            thumbnail: item.thumbnail || item.image!,
            title: item.title || clean,
          }));

        if (filtered.length >= Math.min(2, limit)) {
          return filtered;
        }
      }
    } catch {
      continue;
    }
  }

  // Fallback: Wikimedia Commons
  const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(clean + " food")}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|mime&format=json&origin=*`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(commonsUrl, {
      headers: { "User-Agent": "PrzepisyApp/2.0 (app@naszeprzepisy.pl)" },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const json = await res.json();
      const pages = Object.values(json?.query?.pages ?? {}) as any[];
      const commonsList: WebImageCandidate[] = [];

      for (const p of pages) {
        if (commonsList.length >= limit) break;
        const candidateUrl = p?.imageinfo?.[0]?.url;
        const mime = p?.imageinfo?.[0]?.mime || "";
        const titleStr = p?.title || "";

        if (
          candidateUrl &&
          (!mime || mime.startsWith("image/")) &&
          isFoodPhotoCandidate(candidateUrl, titleStr)
        ) {
          commonsList.push({
            url: candidateUrl,
            thumbnail: candidateUrl,
            title: titleStr.replace(/^File:/i, "").replace(/\.[^.]+$/, ""),
          });
        }
      }

      if (commonsList.length > 0) {
        return commonsList;
      }
    }
  } catch {}

  // Curated fallback
  const fallbackUrl = getCuratedFoodFallback(clean);
  return [
    {
      url: fallbackUrl,
      thumbnail: fallbackUrl,
      title: clean,
    },
  ];
}

/**
 * Wyszukuje jedno najlepsze zdjęcie dania w sieci (do automatycznego doboru przy imporcie).
 */
export async function searchWebDishImage(
  query: string,
  userId?: string,
): Promise<string | null> {
  const candidates = await searchWebFoodCandidates(query, 1);
  if (candidates.length > 0) {
    const candidate = candidates[0].url;
    const stored = await rehostExternalImage(candidate, userId);
    return stored || candidate;
  }
  return null;
}

/**
 * Generuje zdjęcie potrawy przez model Gemini Image i zapisuje je do Supabase Storage.
 */
export async function generateAiDishImage(
  config: GeminiConfig,
  dishTitle: string,
  userId?: string,
): Promise<string | null> {
  const prompt = `Close-up delicious food photography of ${dishTitle}, served fresh on a beautiful plate, natural warm kitchen lighting, appetizing, commercial culinary food styling, ultra detailed, no watermark.`;

  // 1. Próba przez Imagen 3 (:predict)
  try {
    const imagenUrl = `${config.apiBaseUrl}/models/imagen-3.0-generate-002:predict`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 16000);

    const res = await fetch(imagenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": config.apiKey,
      },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio: "1:1" },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      const b64 = data?.predictions?.[0]?.bytesBase64Encoded;
      if (b64) {
        const binaryStr = atob(b64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const stored = await uploadBufferToStorage(bytes, "image/jpeg", userId);
        if (stored) return stored;
      }
    }
  } catch {}

  // 2. Próba przez modele multimodalne (:generateContent)
  const candidateModels = [
    config.imageModel,
    "gemini-2.0-flash",
    "gemini-nano-banana-2.1",
    "gemini-3.1-flash-lite-image",
  ].filter(Boolean);

  const cleanModels = [...new Set(candidateModels.map((m) => m.replace(/^models\//, "")))];

  for (const model of cleanModels) {
    for (const modalities of [["TEXT", "IMAGE"], ["IMAGE"]]) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 16000);

        const url = `${config.apiBaseUrl}/models/${encodeURIComponent(model)}:generateContent`;

        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": config.apiKey,
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              responseModalities: modalities,
            },
          }),
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!res.ok) continue;

        const data = await res.json();
        const parts = data?.candidates?.[0]?.content?.parts ?? [];
        const imagePart = parts.find(
          (p: { inlineData?: { data?: string; mimeType?: string } }) => p.inlineData?.data,
        );

        if (!imagePart?.inlineData?.data) continue;

        const mimeType = imagePart.inlineData.mimeType || "image/png";
        const binaryStr = atob(imagePart.inlineData.data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        const stored = await uploadBufferToStorage(bytes, mimeType, userId);
        if (stored) return stored;
      } catch {
        continue;
      }
    }
  }

  return null;
}

export async function resolveRecipeImage(params: {
  config: GeminiConfig;
  dishQuery: string;
  mode: "auto" | "web" | "ai" | "none";
  externalImageUrl?: string | null;
  userId?: string;
}): Promise<string | null> {
  if (params.mode === "none") return null;

  if (params.externalImageUrl) {
    const rehosted = await rehostExternalImage(params.externalImageUrl, params.userId);
    if (rehosted) return rehosted;
    return params.externalImageUrl;
  }

  const query = params.dishQuery.trim();
  if (!query) {
    return getCuratedFoodFallback("obiad");
  }

  if (params.mode === "ai") {
    const generated = await generateAiDishImage(params.config, query, params.userId);
    if (generated) return generated;

    const web = await searchWebDishImage(query, params.userId);
    if (web) return web;

    return getCuratedFoodFallback(query);
  }

  const web = await searchWebDishImage(query, params.userId);
  if (web) return web;

  const generated = await generateAiDishImage(params.config, query, params.userId);
  if (generated) return generated;

  return getCuratedFoodFallback(query);
}
