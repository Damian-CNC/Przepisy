export const DEFAULT_RECIPE_MODEL = "gemini-3.5-flash-lite";
export const FALLBACK_RECIPE_MODEL = "gemini-3.8-flash";
export const HIGH_QUALITY_RECIPE_MODEL = "gemini-4-hydrogen";

export const RECIPE_MODELS = [
  DEFAULT_RECIPE_MODEL,
  FALLBACK_RECIPE_MODEL,
  HIGH_QUALITY_RECIPE_MODEL,
] as const;

export interface GeminiConfig {
  apiKey: string;
  recipeModels: string[];
  primaryModel: string;
  fallbackModel?: string;
  highQualityModel?: string;
  imageModel: string;
  attemptTimeoutMs: number;
  totalTimeoutMs: number;
  maxRetries: number;
  apiBaseUrl: string;
}

export class GeminiConfigError extends Error {
  readonly code = "CONFIG_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "GeminiConfigError";
  }
}

function parsePositiveInt(
  raw: string | undefined,
  defaultValue: number,
  name: string,
): number {
  if (raw === undefined || raw.trim() === "") {
    return defaultValue;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new GeminiConfigError(
      `Niepoprawna wartość zmiennej ${name}: oczekiwano dodatniej liczby całkowitej.`,
    );
  }
  return parsed;
}

function parseNonNegativeInt(
  raw: string | undefined,
  defaultValue: number,
  name: string,
): number {
  if (raw === undefined || raw.trim() === "") {
    return defaultValue;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 5) {
    throw new GeminiConfigError(
      `Niepoprawna wartość zmiennej ${name}: oczekiwano liczby całkowitej z zakresu 0..5.`,
    );
  }
  return parsed;
}

const DEPRECATED_MODELS = new Set([
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-exp",
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
  "gemini-1.5-pro",
]);

export function normalizeModelName(model: string): string {
  const cleaned = model.trim().replace(/^models\//, "");
  if (DEPRECATED_MODELS.has(cleaned)) {
    return DEFAULT_RECIPE_MODEL;
  }
  return cleaned;
}

export function loadGeminiConfig(
  envGetter: (key: string) => string | undefined = (k) => Deno.env.get(k),
): GeminiConfig {
  const apiKey = envGetter("GEMINI_API_KEY")?.trim() ?? "";
  if (!apiKey) {
    throw new GeminiConfigError("Brak wymaganego sekretu GEMINI_API_KEY.");
  }

  const rawPrimary = envGetter("GEMINI_PRIMARY_MODEL");
  const primaryModel = normalizeModelName(
    rawPrimary === undefined ? DEFAULT_RECIPE_MODEL : rawPrimary,
  );
  if (!primaryModel) {
    throw new GeminiConfigError("Brak skonfigurowanego modelu GEMINI_PRIMARY_MODEL.");
  }

  const rawFallback = envGetter("GEMINI_FALLBACK_MODEL");
  let fallbackModel: string | undefined =
    rawFallback === undefined
      ? FALLBACK_RECIPE_MODEL
      : rawFallback.trim()
        ? normalizeModelName(rawFallback)
        : undefined;

  // Deduplikacja identycznego primary i fallback
  if (fallbackModel && fallbackModel === primaryModel) {
    fallbackModel = undefined;
  }

  const rawHighQuality = envGetter("GEMINI_HIGH_QUALITY_MODEL");
  let highQualityModel: string | undefined =
    rawHighQuality === undefined
      ? HIGH_QUALITY_RECIPE_MODEL
      : rawHighQuality.trim()
        ? normalizeModelName(rawHighQuality)
        : undefined;

  if (
    highQualityModel &&
    (highQualityModel === primaryModel || highQualityModel === fallbackModel)
  ) {
    highQualityModel = undefined;
  }

  const recipeModels = [
    primaryModel,
    ...(fallbackModel ? [fallbackModel] : []),
    ...(highQualityModel ? [highQualityModel] : []),
  ];

  const imageModel = normalizeModelName(
    envGetter("GEMINI_IMAGE_MODEL") || "gemini-3.1-flash-lite-image",
  );

  const attemptTimeoutMs = parsePositiveInt(
    envGetter("GEMINI_ATTEMPT_TIMEOUT_MS"),
    14000,
    "GEMINI_ATTEMPT_TIMEOUT_MS",
  );
  const totalTimeoutMs = parsePositiveInt(
    envGetter("GEMINI_TOTAL_TIMEOUT_MS"),
    40000,
    "GEMINI_TOTAL_TIMEOUT_MS",
  );

  if (attemptTimeoutMs > totalTimeoutMs) {
    throw new GeminiConfigError(
      "GEMINI_ATTEMPT_TIMEOUT_MS nie może przekraczać GEMINI_TOTAL_TIMEOUT_MS.",
    );
  }

  const maxRetries = parseNonNegativeInt(
    envGetter("GEMINI_MAX_RETRIES"),
    1,
    "GEMINI_MAX_RETRIES",
  );

  return {
    apiKey,
    recipeModels,
    primaryModel,
    fallbackModel,
    highQualityModel,
    imageModel,
    attemptTimeoutMs,
    totalTimeoutMs,
    maxRetries,
    apiBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
  };
}
