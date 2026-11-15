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
        "User-Agent": "Mozilla/5.0 (compatible; RecipeBot/1.0)",
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

    return await uploadBufferToStorage(new Uint8Array(arrayBuffer), contentType, userId);
  } catch {
    return null;
  }
}

/**
 * 2. Wyszukuje zdjęcie dania w sieci (Wikimedia Commons API - darmowe, bez klucza, stabilne HTTPS).
 */
export async function searchWebDishImage(
  query: string,
  userId?: string,
): Promise<string | null> {
  try {
    const cleanQuery = query.trim();
    if (!cleanQuery) return null;

    const searchUrl = new URL("https://commons.wikimedia.org/w/api.php");
    searchUrl.searchParams.set("action", "query");
    searchUrl.searchParams.set("generator", "search");
    searchUrl.searchParams.set("gsrsearch", `filetype:bitmap ${cleanQuery} food`);
    searchUrl.searchParams.set("gsrnamespace", "6");
    searchUrl.searchParams.set("gsrlimit", "3");
    searchUrl.searchParams.set("prop", "imageinfo");
    searchUrl.searchParams.set("iiprop", "url|mime");
    searchUrl.searchParams.set("iiurlwidth", "960");
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("origin", "*");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(searchUrl.toString(), {
      headers: { "User-Agent": "PrzepisyApp/1.0 (contact@example.com)" },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const json = await res.json();
    const pages = Object.values(json?.query?.pages ?? {}) as Array<{
      imageinfo?: Array<{ thumburl?: string; url?: string; mime?: string }>;
    }>;

    for (const page of pages) {
      const info = page.imageinfo?.[0];
      const candidateUrl = info?.thumburl || info?.url;
      if (candidateUrl) {
        const stored = await rehostExternalImage(candidateUrl, userId);
        if (stored) return stored;
        return candidateUrl;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 3. Generuje zdjęcie potrawy przez aktywny model Gemini Image (gemini-3.1-flash-lite-image / nano-banana-2.1)
 * i zapisuje je do Supabase Storage.
 */
export async function generateAiDishImage(
  config: GeminiConfig,
  dishTitle: string,
  userId?: string,
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    const url = `${config.apiBaseUrl}/models/${encodeURIComponent(config.imageModel)}:generateContent`;
    const prompt = `Editorial overhead food photography of ${dishTitle}, served on a ceramic plate on a warm rustic table, natural soft daylight, appetizing, ultra realistic, no text, no watermark.`;

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
      console.warn(`AI image generation failed with HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find(
      (p: { inlineData?: { data?: string; mimeType?: string } }) => p.inlineData?.data,
    );

    if (!imagePart?.inlineData?.data) return null;

    const mimeType = imagePart.inlineData.mimeType || "image/png";
    const binaryStr = atob(imagePart.inlineData.data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    return await uploadBufferToStorage(bytes, mimeType, userId);
  } catch (err) {
    console.warn("AI image generation exception:", err instanceof Error ? err.message : "unknown");
    return null;
  }
}

/**
 * Główny resolver zdjęcia:
 * 1) Jeśli podano externalImageUrl (np. z linku) -> re-hostuj do Supabase Storage.
 * 2) Jeśli tryb "web" -> szukaj w sieci, a w razie braku wyników wygeneruj przez AI.
 * 3) Jeśli tryb "ai" -> generuj przez AI, a w razie braku limitów wyszukaj w sieci.
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
  }

  if (params.mode === "ai") {
    const generated = await generateAiDishImage(params.config, params.dishQuery, params.userId);
    if (generated) return generated;
    return await searchWebDishImage(params.dishQuery, params.userId);
  }

  // Tryb domyślny "auto" lub "web": najpierw szukaj w sieci, potem generuj AI
  const webImg = await searchWebDishImage(params.dishQuery, params.userId);
  if (webImg) return webImg;

  return await generateAiDishImage(params.config, params.dishQuery, params.userId);
}
