export interface GeminiConfig {
  apiKey: string;
  primaryModel: string;
  fallbackModel?: string;
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

export function normalizeModelName(model: string): string {
  return model.trim().replace(/^models\//, "");
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
    rawPrimary === undefined ? "gemini-flash-latest" : rawPrimary,
  );
  if (!primaryModel) {
    throw new GeminiConfigError("Brak skonfigurowanego modelu GEMINI_PRIMARY_MODEL.");
  }

  const rawFallback = envGetter("GEMINI_FALLBACK_MODEL");
  let fallbackModel: string | undefined = rawFallback
    ? normalizeModelName(rawFallback)
    : undefined;

  // Odrzucenie duplikatu: ten sam model nie może być wywoływany ponownie jako fallback
  if (fallbackModel && fallbackModel === primaryModel) {
    fallbackModel = undefined;
  }

  const imageModel = normalizeModelName(
    envGetter("GEMINI_IMAGE_MODEL") || "gemini-3.1-flash-lite-image",
  );

  const attemptTimeoutMs = parsePositiveInt(
    envGetter("GEMINI_ATTEMPT_TIMEOUT_MS"),
    18000,
    "GEMINI_ATTEMPT_TIMEOUT_MS",
  );
  const totalTimeoutMs = parsePositiveInt(
    envGetter("GEMINI_TOTAL_TIMEOUT_MS"),
    45000,
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
    primaryModel,
    fallbackModel,
    imageModel,
    attemptTimeoutMs,
    totalTimeoutMs,
    maxRetries,
    apiBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
  };
}
