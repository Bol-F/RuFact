import "server-only";

import type { GeminiReviewUnavailable } from "../gemini-review";
import {
  DEFAULT_GEMINI_MODEL,
  requestGeminiAssessment,
  type GeminiAssessment,
} from "./gemini-review-core";
import { requestTavilyEvidence } from "./tavily-search";
import type { AppLocale } from "../i18n";
import { detectTextLanguage, type TextLanguage } from "../text-language";

const ALLOWED_GEMINI_MODELS = new Set([
  DEFAULT_GEMINI_MODEL,
  "gemini-3.8-flash",
]);

function unavailable(
  reason: GeminiReviewUnavailable["reason"],
): GeminiReviewUnavailable {
  return {
    status: "unavailable",
    provider: "gemini",
    reason,
  };
}

function isEnabled() {
  return process.env.GEMINI_REVIEW_ENABLED?.trim().toLowerCase() === "true";
}

export function configuredModel() {
  const requested = process.env.GEMINI_MODEL?.trim();
  return requested && ALLOWED_GEMINI_MODELS.has(requested)
    ? requested
    : DEFAULT_GEMINI_MODEL;
}

export function isGeminiReviewConfigured() {
  return (
    isEnabled() &&
    Boolean(process.env.GEMINI_API_KEY?.trim()) &&
    Boolean(process.env.TAVILY_API_KEY?.trim())
  );
}

export async function getGeminiAssessment(
  text: string,
  locale: AppLocale = "uz",
  signal?: AbortSignal,
  inputLanguage: TextLanguage = detectTextLanguage(text),
): Promise<GeminiAssessment> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!isEnabled() || !apiKey) return unavailable("not-configured");

  const tavilyApiKey = process.env.TAVILY_API_KEY?.trim();
  if (!tavilyApiKey) return unavailable("search-not-configured");

  const search = await requestTavilyEvidence({
    text,
    locale: inputLanguage === "unknown" ? locale : inputLanguage,
    apiKey: tavilyApiKey,
    signal,
  });
  if (!search.ok) return unavailable(search.reason);

  return requestGeminiAssessment({
    text,
    apiKey,
    model: configuredModel(),
    evidence: search.evidence,
    locale,
    signal,
  });
}
