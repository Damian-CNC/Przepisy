import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GeminiConfig } from "./geminiConfig.ts";

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

/**
 * 1. Pobiera zewnętrzny URL zdjęcia (np. og:image ze strony lub Instagrama)
 * i zapisuje go w Supabase Storage, aby uniknąć wygasania linków CDN i blokad CORS.
 */
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

    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) return null;

    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength < 1024 || arrayBuffer.byteLength > 8 * 1024 * 1024) {
      return null;
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

function getSearchVariants(title: string): string[] {
  const clean = cleanDishTitle(title);
  const variants = [clean];
  const words = clean.split(/\s+/);
  if (words.length > 1) {
    const lastWord = words[words.length - 1];
    if (/^[A-Z]/.test(lastWord) || lastWord.length >= 4) {
      variants.push(lastWord);
    }
    variants.push(words.slice(1).join(" "));
  }
  return [...new Set(variants.filter((v) => v.length >= 3))];
}

function isFoodPhotoCandidate(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  const lower = url.toLowerCase();
  if (
    lower.endsWith(".pdf") ||
    lower.endsWith(".svg") ||
    lower.endsWith(".gif") ||
    lower.endsWith(".ogg") ||
    lower.endsWith(".webm")
  ) {
    return false;
  }
  const excludedKeywords = [
    "map", "mapa", "flag", "flaga", "logo", "diagram", "icon", "herb",
    "chart", "poster", "portrait", "stamp", "sign", "symbol", "building",
    "maklowicz", "person", "author", "locator", "location", "schema",
    "monument", "church", "street", "city", "town"
  ];
  return !excludedKeywords.some((bad) => lower.includes(bad));
}

export const CURATED_FOOD_IMAGES: Array<{ pattern: RegExp; url: string }> = [
  { pattern: /(?:chleb|bułk|shokupan|bagiet|pieczyw|toast|tost|chałk)/i, url: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=80" },
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
 * 2. Wyszukuje zdjęcie dania w sieci (Wikimedia Commons + Wikipedia pl/en).
 */
export async function searchWebDishImage(
  query: string,
  userId?: string,
): Promise<string | null> {
  const variants = getSearchVariants(query);

  for (const variant of variants) {
    const endpoints = [
      `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(variant)}&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url|mime&format=json&origin=*`,
      `https://pl.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(variant)}&gsrlimit=3&prop=pageimages&pithumbsize=1000&format=json&origin=*`,
      `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(variant)}&gsrlimit=3&prop=pageimages&pithumbsize=1000&format=json&origin=*`,
    ];

    for (const ep of endpoints) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(ep, {
          headers: {
            "User-Agent": "PrzepisyApp/2.0 (app@naszeprzepisy.pl)",
            Accept: "application/json",
          },
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!res.ok) continue;
        const text = await res.text();
        let json: Record<string, unknown> | null = null;
        try {
          json = JSON.parse(text) as Record<string, unknown>;
        } catch {
          continue;
        }

        const queryObj = json?.query as Record<string, unknown> | undefined;
        const pages = Object.values((queryObj?.pages as Record<string, unknown>) ?? {});

        for (const p of pages) {
          const pageRecord = p as Record<string, unknown>;
          const thumbObj = pageRecord?.thumbnail as Record<string, unknown> | undefined;
          const imageinfoArr = pageRecord?.imageinfo as Array<Record<string, unknown>> | undefined;
          const candidateUrl =
            typeof thumbObj?.source === "string"
              ? thumbObj.source
              : typeof imageinfoArr?.[0]?.url === "string"
                ? imageinfoArr[0].url
                : "";

          const mime = typeof imageinfoArr?.[0]?.mime === "string" ? imageinfoArr[0].mime : "";

          if (
            candidateUrl &&
            (!mime || mime.startsWith("image/")) &&
            isFoodPhotoCandidate(candidateUrl)
          ) {
            const stored = await rehostExternalImage(candidateUrl, userId);
            return stored || candidateUrl;
          }
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

/**
 * 3. Generuje zdjęcie potrawy przez model Gemini Image i zapisuje je do Supabase Storage.
 */
export async function generateAiDishImage(
  config: GeminiConfig,
  dishTitle: string,
  userId?: string,
): Promise<string | null> {
  const candidateModels = [
    config.imageModel,
    "gemini-nano-banana-2.1",
    "gemini-3.1-flash-lite-image",
    "gemini-3-flash-image",
  ].filter(Boolean);

  const cleanModels = [...new Set(candidateModels.map((m) => m.replace(/^models\//, "")))];

  const prompt = `Editorial overhead food photography of ${dishTitle}, served on a ceramic plate on a warm rustic table, natural soft daylight, appetizing, ultra realistic, professional culinary magazine style, no text, no watermark.`;

  for (const model of cleanModels) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 18000);

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
            responseModalities: ["IMAGE"],
          },
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        continue;
      }

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

  return null;
}

/**
 * Główny resolver zdjęcia:
 * 1) Jeśli podano externalImageUrl -> re-hostuj do Supabase Storage.
 * 2) Jeśli tryb "ai" -> generuj przez AI, w razie braku limitów wyszukaj w sieci, na koniec curated fallback.
 * 3) Jeśli tryb "web" / "auto" -> szukaj w sieci, w razie braku wygeneruj przez AI, na koniec curated fallback.
 * Gwarancja: ZAWSZE zwraca poprawny adres URL zdjęcia dla podanej potrawy.
 */
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

  // Domyślnie "auto" lub "web"
  const web = await searchWebDishImage(query, params.userId);
  if (web) return web;

  const generated = await generateAiDishImage(params.config, query, params.userId);
  if (generated) return generated;

  return getCuratedFoodFallback(query);
}
