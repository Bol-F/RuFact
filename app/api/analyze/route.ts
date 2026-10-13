import { NextResponse } from "next/server";

import type { AnalysisResponse } from "@/lib/api";
import type {
  GeminiReviewUnavailable,
} from "@/lib/gemini-review";
import {
  getGeminiAssessment,
  isGeminiReviewConfigured,
} from "@/lib/server/gemini-review";
import { createMlServiceAuthorization } from "@/lib/server/ml-service-auth";
import {
  rateLimitAnalysisRequest,
  rateLimitHeaders,
  rateLimitInternetRequest,
} from "@/lib/server/rate-limit";
import { createAbortScope } from "@/lib/server/abort-scope";
import { isAppLocale, type AppLocale } from "@/lib/i18n";
import type { TextLanguage } from "@/lib/text-language";
import { resolveAnalysis } from "@/lib/server/analysis-routing";
import { BodyTooLargeError, readBoundedText } from "@/lib/server/bounded-text";

const MAX_TEXT_LENGTH = 5_000;
const MAX_BODY_BYTES = 24_000;
const ML_TIMEOUT_MS = 8_000;
const MAX_ML_RESPONSE_BYTES = 128_000;
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

export const maxDuration = 30;

type MlSuccess = {
  ok: true;
  payload: AnalysisResponse;
};

type MlFailure = {
  ok: false;
  status: 422 | 502 | 503;
  message: string;
};

function jsonResponse(
  payload: unknown,
  status = 200,
  additionalHeaders?: HeadersInit,
) {
  return NextResponse.json(payload, {
    status,
    headers: { ...NO_STORE_HEADERS, ...Object.fromEntries(new Headers(additionalHeaders)) },
  });
}

function unavailable(
  reason: GeminiReviewUnavailable["reason"],
): GeminiReviewUnavailable {
  return { status: "unavailable", provider: "gemini", reason };
}

function isSameOriginRequest(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site") {
    return false;
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    return true;
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  if (!host) {
    return false;
  }

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function isAnalysisPayload(value: unknown): value is AnalysisResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Record<string, unknown>;
  return (
    (payload.label === "REAL" || payload.label === "FAKE") &&
    typeof payload.confidence === "number" &&
    Number.isFinite(payload.confidence) &&
    payload.confidence >= 0 &&
    payload.confidence <= 1 &&
    Boolean(payload.meta && typeof payload.meta === "object" &&
      ["ru", "en"].includes((payload.meta as Record<string, unknown>).language as string))
  );
}

async function requestMlPrediction(
  endpoint: string,
  text: string,
  requestSignal?: AbortSignal,
): Promise<MlSuccess | MlFailure> {
  const abortScope = createAbortScope(requestSignal, ML_TIMEOUT_MS);
  const requestBody = JSON.stringify({ text, language: "auto" });

  let authorization: ReturnType<typeof createMlServiceAuthorization>;
  try {
    authorization = createMlServiceAuthorization(requestBody);
  } catch {
    abortScope.cleanup();
    return {
      ok: false,
      status: 503,
      message: "ML-сервис не настроен безопасным образом.",
    };
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authorization.token}`,
        "Content-Type": "application/json",
        "X-Request-ID": authorization.requestId,
      },
      body: requestBody,
      cache: "no-store",
      signal: abortScope.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status === 422 ? 422 : 502,
        message: "ML-сервис вернул ошибку. Попробуйте повторить запрос позже.",
      };
    }

    const payload: unknown = JSON.parse(await readBoundedText(response, {
      maxBytes: MAX_ML_RESPONSE_BYTES,
      signal: abortScope.signal,
    }));
    if (!isAnalysisPayload(payload)) {
      return {
        ok: false,
        status: 502,
        message: "ML-сервис вернул некорректный ответ.",
      };
    }

    return { ok: true, payload };
  } catch {
    return {
      ok: false,
      status: 503,
      message:
        "ML-сервис временно недоступен. Проверьте его состояние и повторите запрос.",
    };
  } finally {
    abortScope.cleanup();
  }
}

async function getRateLimitedGeminiAssessment(
  request: Request,
  text: string,
  locale: AppLocale,
  inputLanguage: TextLanguage,
) {
  if (!isGeminiReviewConfigured()) {
    return getGeminiAssessment(text, locale, request.signal, inputLanguage);
  }

  const sourceLimit = await rateLimitInternetRequest(request);
  if (!sourceLimit.configured) return unavailable("search-error");
  if (!sourceLimit.allowed) return unavailable("search-rate-limited");

  return getGeminiAssessment(text, locale, request.signal, inputLanguage);
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return jsonResponse({ error: "Запрос отклонён." }, 403);
  }

  const rateLimit = await rateLimitAnalysisRequest(request);
  if (!rateLimit.configured) {
    return jsonResponse(
      { error: "Защита от перегрузки временно недоступна." },
      503,
    );
  }
  if (!rateLimit.allowed) {
    const retryAfter = Math.max(
      1,
      Math.ceil((rateLimit.reset - Date.now()) / 1_000),
    );
    return jsonResponse(
      { error: "Слишком много запросов. Попробуйте немного позже." },
      429,
      {
        ...rateLimitHeaders(rateLimit),
        "Retry-After": String(retryAfter),
      },
    );
  }

  const contentType =
    request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ??
    "";
  if (contentType !== "application/json") {
    return jsonResponse(
      { error: "Используйте Content-Type application/json." },
      415,
    );
  }

  let body: unknown;
  try {
    const rawBody = await readBoundedText(request, {
      maxBytes: MAX_BODY_BYTES,
      signal: request.signal,
    });
    body = JSON.parse(rawBody);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return jsonResponse({ error: "Тело запроса слишком большое." }, 413);
    }
    return jsonResponse(
      { error: "Тело запроса должно содержать JSON." },
      400,
    );
  }

  if (!body || typeof body !== "object" || !("text" in body)) {
    return jsonResponse({ error: "Добавьте поле text в запрос." }, 400);
  }

  const { text, useGemini, locale: requestedLocale } = body as {
    text?: unknown;
    useGemini?: unknown;
    locale?: unknown;
  };

  const locale: AppLocale = isAppLocale(requestedLocale) ? requestedLocale : "uz";

  if (
    typeof useGemini !== "undefined" &&
    typeof useGemini !== "boolean"
  ) {
    return jsonResponse(
      { error: "Поле useGemini должно быть логическим значением." },
      400,
    );
  }

  if (typeof text !== "string" || text.trim().length === 0) {
    return jsonResponse({ error: "Введите текст для проверки." }, 400);
  }

  const normalizedText = text.trim();

  if (normalizedText.length > MAX_TEXT_LENGTH) {
    return jsonResponse(
      { error: "Текст не должен превышать 5000 символов." },
      400,
    );
  }

  const mlEndpoint = process.env.ML_API_URL?.trim();

  return jsonResponse(await resolveAnalysis({
    text: normalizedText, locale, mlConfigured: Boolean(mlEndpoint),
    useGemini: typeof useGemini === "boolean" ? useGemini : undefined,
  }, {
    requestMl: text => mlEndpoint ? requestMlPrediction(mlEndpoint, text, request.signal)
      : Promise.resolve({ ok: false as const }),
    getAssessment: (text, outputLocale, inputLanguage) =>
      getRateLimitedGeminiAssessment(request, text, outputLocale, inputLanguage),
  }));
}
