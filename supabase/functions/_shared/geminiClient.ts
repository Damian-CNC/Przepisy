import { GeminiConfig } from "./geminiConfig.ts";
import {
  parseAndValidateRecipeJson,
  RECIPE_RESPONSE_SCHEMA,
  RECIPE_SYSTEM_INSTRUCTION,
  RecipeValidationError,
  ValidatedRecipePayload,
} from "./recipeSchema.ts";

export type GeminiErrorCategory =
  | "TIMEOUT"
  | "TRANSIENT_UNAVAILABLE"
  | "RATE_LIMITED"
  | "QUOTA_EXHAUSTED"
  | "MODEL_NOT_FOUND"
  | "AUTH_ERROR"
  | "BAD_REQUEST"
  | "SAFETY_BLOCKED"
  | "VALIDATION_ERROR"
  | "CONFIG_ERROR"
  | "CANCELLED";

export class GeminiOperationError extends Error {
  readonly category: GeminiErrorCategory;
  readonly httpStatus?: number;
  readonly retryAfterMs?: number;

  constructor(
    category: GeminiErrorCategory,
    message: string,
    options?: { httpStatus?: number; retryAfterMs?: number },
  ) {
    super(message);
    this.name = "GeminiOperationError";
    this.category = category;
    this.httpStatus = options?.httpStatus;
    this.retryAfterMs = options?.retryAfterMs;
  }
}

export interface GenerateRecipeOptions {
  userPrompt: string;
  systemInstruction?: string;
  inlineImages?: Array<{ mimeType: string; dataBase64: string }>;
  parentSignal?: AbortSignal;
  fetchFn?: typeof fetch;
  randomFn?: () => number;
  sleepFn?: (ms: number, signal?: AbortSignal) => Promise<void>;
  operationId?: string;
}

const MIN_ATTEMPT_BUDGET_MS = 2500;

function redactSecrets(text: string, apiKey?: string): string {
  let sanitized = text.replace(/AIza[0-9A-Za-z\-_]{20,}/g, "[REDACTED_KEY]");
  if (apiKey && apiKey.length > 4) {
    sanitized = sanitized.split(apiKey).join("[REDACTED_KEY]");
  }
  return sanitized;
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new GeminiOperationError("CANCELLED", "Operacja anulowana."));
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new GeminiOperationError("CANCELLED", "Operacja anulowana."));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function parseRetryAfterHeader(headerValue: string | null): number | undefined {
  if (!headerValue) return undefined;
  const seconds = Number(headerValue.trim());
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }
  const dateMs = Date.parse(headerValue);
  if (!Number.isNaN(dateMs)) {
    const diff = dateMs - Date.now();
    return diff > 0 ? diff : 0;
  }
  return undefined;
}

function getThinkingConfigForModel(model: string): Record<string, unknown> | undefined {
  // Modele Gemini 3.x / 3.8 / latest nie obsługują 'minimal' - 'low' zapobiega długiemu myśleniu i timeoutom
  if (model.includes("3.8") || model.includes("3.6") || model.includes("latest") || model.includes("gemini-3")) {
    return { thinkingLevel: "low" };
  }
  if (model.includes("flash-lite")) {
    return { thinkingLevel: "minimal" };
  }
  return undefined;
}

function classifyHttpError(
  status: number,
  bodyText: string,
  retryAfterHeader: string | null,
): GeminiOperationError {
  let rpcStatus = "";
  let apiMessage = bodyText;

  try {
    const parsed = JSON.parse(bodyText);
    if (parsed?.error) {
      rpcStatus = String(parsed.error.status ?? "");
      apiMessage = String(parsed.error.message ?? bodyText);
    }
  } catch {
    // Surowa treść odpowiedzi tekstowej
  }

  const lowerMsg = apiMessage.toLowerCase();

  if (status === 401 || status === 403 || rpcStatus === "UNAUTHENTICATED" || rpcStatus === "PERMISSION_DENIED") {
    return new GeminiOperationError("AUTH_ERROR", "Błąd uwierzytelniania lub brak uprawnień do API.", {
      httpStatus: status,
    });
  }

  if (
    status === 404 ||
    rpcStatus === "NOT_FOUND" ||
    lowerMsg.includes("no longer available") ||
    lowerMsg.includes("is not found for api version")
  ) {
    return new GeminiOperationError("MODEL_NOT_FOUND", "Wybrany model AI jest niedostępny lub wycofany.", {
      httpStatus: status,
    });
  }

  if (status === 429 || rpcStatus === "RESOURCE_EXHAUSTED") {
    const isHardQuota =
      lowerMsg.includes("quota") ||
      lowerMsg.includes("billing") ||
      lowerMsg.includes("limit: 0") ||
      lowerMsg.includes("per day");

    if (isHardQuota) {
      return new GeminiOperationError("QUOTA_EXHAUSTED", "Wyczerpano limit rozliczeniowy lub dzienną kwotę API.", {
        httpStatus: status,
      });
    }

    return new GeminiOperationError("RATE_LIMITED", "Chwilowy limit zapytań (429).", {
      httpStatus: status,
      retryAfterMs: parseRetryAfterHeader(retryAfterHeader),
    });
  }

  if (status === 400 || rpcStatus === "INVALID_ARGUMENT") {
    return new GeminiOperationError("BAD_REQUEST", "Nieprawidłowe parametry żądania do modelu AI.", {
      httpStatus: status,
    });
  }

  if (status === 408 || status === 504 || rpcStatus === "DEADLINE_EXCEEDED") {
    return new GeminiOperationError("TIMEOUT", "Przekroczono limit czasu odpowiedzi serwera AI.", {
      httpStatus: status,
    });
  }

  if (status === 500 || status === 502 || status === 503 || rpcStatus === "UNAVAILABLE") {
    return new GeminiOperationError("TRANSIENT_UNAVAILABLE", "Usługa AI jest chwilowo niedostępna.", {
      httpStatus: status,
      retryAfterMs: parseRetryAfterHeader(retryAfterHeader),
    });
  }

  return new GeminiOperationError("TRANSIENT_UNAVAILABLE", `Nieoczekiwany błąd usługi AI (HTTP ${status}).`, {
    httpStatus: status,
  });
}

function logEvent(payload: Record<string, unknown>, apiKey: string): void {
  const safeEntry = JSON.stringify({
    ts: new Date().toISOString(),
    service: "gemini-recipe-client",
    ...payload,
  });
  console.log(redactSecrets(safeEntry, apiKey));
}

export async function generateStructuredRecipe(
  config: GeminiConfig,
  options: GenerateRecipeOptions,
): Promise<ValidatedRecipePayload> {
  const opId = options.operationId ?? crypto.randomUUID();
  const fetchFn = options.fetchFn ?? fetch;
  const randomFn = options.randomFn ?? Math.random;
  const sleepFn = options.sleepFn ?? defaultSleep;
  const parentSignal = options.parentSignal;

  if (parentSignal?.aborted) {
    throw new GeminiOperationError("CANCELLED", "Operacja została anulowana przez użytkownika.");
  }

  const deadline = Date.now() + config.totalTimeoutMs;
  const modelsToTry: Array<{ model: string; stage: "primary" | "fallback" }> = [
    { model: config.primaryModel, stage: "primary" },
  ];

  if (config.fallbackModel && config.fallbackModel !== config.primaryModel) {
    modelsToTry.push({ model: config.fallbackModel, stage: "fallback" });
  }

  let lastError: GeminiOperationError = new GeminiOperationError(
    "TRANSIENT_UNAVAILABLE",
    "Nie udało się wygenerować przepisu.",
  );

  for (const target of modelsToTry) {
    const maxAttemptsForModel = 1 + config.maxRetries;

    for (let attempt = 1; attempt <= maxAttemptsForModel; attempt++) {
      if (parentSignal?.aborted) {
        throw new GeminiOperationError("CANCELLED", "Operacja została anulowana przez użytkownika.");
      }

      const remainingBudgetMs = deadline - Date.now();
      if (remainingBudgetMs < MIN_ATTEMPT_BUDGET_MS) {
        logEvent(
          {
            opId,
            stage: target.stage,
            model: target.model,
            attempt,
            remainingBudgetMs,
            outcome: "BUDGET_EXHAUSTED",
          },
          config.apiKey,
        );
        throw new GeminiOperationError(
          "TIMEOUT",
          "Przekroczono całkowity czas oczekiwania na wygenerowanie przepisu.",
        );
      }

      const attemptTimeoutMs = Math.min(config.attemptTimeoutMs, remainingBudgetMs);
      const attemptController = new AbortController();
      let timedOutThisAttempt = false;

      const onParentAbort = () => attemptController.abort(parentSignal?.reason);
      parentSignal?.addEventListener("abort", onParentAbort, { once: true });

      const attemptTimer = setTimeout(() => {
        timedOutThisAttempt = true;
        attemptController.abort(new DOMException("Attempt timed out", "TimeoutError"));
      }, attemptTimeoutMs);

      const attemptStart = Date.now();
      const stageLabel = attempt > 1 ? "retry" : target.stage;

      try {
        const parts: Array<Record<string, unknown>> = [{ text: options.userPrompt }];
        if (options.inlineImages?.length) {
          for (const img of options.inlineImages) {
            parts.push({
              inlineData: {
                mimeType: img.mimeType,
                data: img.dataBase64,
              },
            });
          }
        }

        const thinkingConfig = getThinkingConfigForModel(target.model);
        const generationConfig: Record<string, unknown> = {
          responseMimeType: "application/json",
          responseSchema: RECIPE_RESPONSE_SCHEMA,
          temperature: 0.4,
          maxOutputTokens: 4096,
          ...(thinkingConfig ? { thinkingConfig } : {}),
        };

        const url = `${config.apiBaseUrl}/models/${encodeURIComponent(target.model)}:generateContent`;

        const response = await fetchFn(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": config.apiKey,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: options.systemInstruction ?? RECIPE_SYSTEM_INSTRUCTION }],
            },
            contents: [{ role: "user", parts }],
            generationConfig,
          }),
          signal: attemptController.signal,
        });

        const durationMs = Date.now() - attemptStart;

        if (!response.ok) {
          const rawErr = await response.text();
          const classified = classifyHttpError(
            response.status,
            rawErr,
            response.headers.get("Retry-After"),
          );

          logEvent(
            {
              opId,
              stage: stageLabel,
              model: target.model,
              attempt,
              durationMs,
              httpStatus: response.status,
              errorCode: classified.category,
            },
            config.apiKey,
          );

          throw classified;
        }

        const data = await response.json();

        const blockReason = data?.promptFeedback?.blockReason;
        if (blockReason) {
          throw new GeminiOperationError(
            "SAFETY_BLOCKED",
            "Treść została zablokowana przez filtry bezpieczeństwa.",
          );
        }

        const candidate = data?.candidates?.[0];
        const finishReason = String(candidate?.finishReason ?? "");

        if (finishReason === "SAFETY" || finishReason === "RECITATION" || finishReason === "PROHIBITED_CONTENT") {
          throw new GeminiOperationError(
            "SAFETY_BLOCKED",
            "Odpowiedź została odrzucona ze względów bezpieczeństwa.",
          );
        }

        if (finishReason === "MAX_TOKENS") {
          throw new GeminiOperationError(
            "VALIDATION_ERROR",
            "Odpowiedź AI została ucięta z powodu przekroczenia limitu tokenów.",
          );
        }

        const rawText =
          candidate?.content?.parts
            ?.map((p: { text?: string }) => p.text ?? "")
            .join("") ?? "";

        const validated = parseAndValidateRecipeJson(rawText);

        logEvent(
          {
            opId,
            stage: stageLabel,
            model: target.model,
            attempt,
            durationMs,
            httpStatus: response.status,
            validation: "OK",
          },
          config.apiKey,
        );

        return validated;
      } catch (err) {
        const durationMs = Date.now() - attemptStart;
        let normalizedErr: GeminiOperationError;

        if (parentSignal?.aborted) {
          normalizedErr = new GeminiOperationError(
            "CANCELLED",
            "Operacja została anulowana przez użytkownika.",
          );
        } else if (timedOutThisAttempt) {
          normalizedErr = new GeminiOperationError(
            "TIMEOUT",
            `Przekroczono limit czasu próby (${attemptTimeoutMs} ms).`,
          );
          logEvent(
            {
              opId,
              stage: stageLabel,
              model: target.model,
              attempt,
              durationMs,
              errorCode: "TIMEOUT",
              attemptTimeoutMs,
            },
            config.apiKey,
          );
        } else if (err instanceof GeminiOperationError) {
          normalizedErr = err;
        } else if (err instanceof RecipeValidationError) {
          normalizedErr = new GeminiOperationError("VALIDATION_ERROR", err.message);
          logEvent(
            {
              opId,
              stage: stageLabel,
              model: target.model,
              attempt,
              durationMs,
              validation: "FAILED",
              errorCode: "VALIDATION_ERROR",
            },
            config.apiKey,
          );
        } else {
          normalizedErr = new GeminiOperationError(
            "TRANSIENT_UNAVAILABLE",
            "Błąd połączenia sieciowego z usługą AI.",
          );
          logEvent(
            {
              opId,
              stage: stageLabel,
              model: target.model,
              attempt,
              durationMs,
              errorCode: "NETWORK_ERROR",
            },
            config.apiKey,
          );
        }

        lastError = normalizedErr;

        // Błędy krytyczne lub nieponawialne — przerywamy natychmiast bez lawiny prób
        if (
          normalizedErr.category === "CANCELLED" ||
          normalizedErr.category === "AUTH_ERROR" ||
          normalizedErr.category === "BAD_REQUEST" ||
          normalizedErr.category === "QUOTA_EXHAUSTED" ||
          normalizedErr.category === "SAFETY_BLOCKED"
        ) {
          throw normalizedErr;
        }

        // Model niedostępny/wycofany -> nie ponawiaj na tym samym modelu, przejdź od razu do fallbacku
        if (normalizedErr.category === "MODEL_NOT_FOUND") {
          break;
        }

        // Błędy przejściowe (TIMEOUT, TRANSIENT_UNAVAILABLE, RATE_LIMITED, VALIDATION_ERROR):
        // Jeśli mamy jeszcze próbę dla TEGO samego modelu i budżet czasu pozwala — wykonaj backoff z jitterem
        if (attempt < maxAttemptsForModel) {
          const baseBackoffMs = Math.min(400 * Math.pow(2, attempt - 1), 2500);
          const jitteredMs = Math.round(baseBackoffMs * (0.5 + randomFn() * 0.5));
          const delayMs =
            normalizedErr.retryAfterMs !== undefined
              ? normalizedErr.retryAfterMs
              : jitteredMs;

          const remainingAfterWait = deadline - Date.now() - delayMs;
          if (remainingAfterWait < MIN_ATTEMPT_BUDGET_MS) {
            // Za mało budżetu na ponowienie po oczekiwaniu — przejdź dalej lub zgłoś timeout
            break;
          }

          if (delayMs > 0) {
            await sleepFn(delayMs, parentSignal);
          }
        }
      } finally {
        clearTimeout(attemptTimer);
        parentSignal?.removeEventListener("abort", onParentAbort);
      }
    }
  }

  throw lastError;
}
