import type { AnalysisResponse } from "../api.ts";
import type { AppLocale } from "../i18n";
import { detectTextLanguage, type TextLanguage } from "../text-language.ts";
import type { GeminiAssessment } from "./gemini-review-core";

interface AnalysisRoutingInput {
  text: string;
  locale: AppLocale;
  useGemini?: boolean;
  mlConfigured: boolean;
}

interface AnalysisRoutingDependencies {
  requestMl: (text: string) => Promise<{ ok: true; payload: AnalysisResponse } | { ok: false }>;
  // Production supplies the rate-limited, server-authenticated wrapper, not raw provider fetches.
  getAssessment: (text: string, locale: AppLocale, inputLanguage: TextLanguage) => Promise<GeminiAssessment>;
}

/** Orchestrate after HTTP validation/rate limiting. Uzbek never consumes ML capacity or needs its JWT. */
export async function resolveAnalysis(
  input: AnalysisRoutingInput,
  dependencies: AnalysisRoutingDependencies,
): Promise<AnalysisResponse> {
  const inputLanguage = detectTextLanguage(input.text);
  const isUzbek = inputLanguage === "uz";
  const needsSources = input.useGemini === true || (isUzbek && input.useGemini === undefined);
  const canRunMl = input.mlConfigured && (inputLanguage === "ru" || inputLanguage === "en");
  const [mlResult, assessment] = await Promise.all([
    canRunMl ? dependencies.requestMl(input.text).catch(() => ({ ok: false as const }))
      : Promise.resolve({ ok: false as const }),
    needsSources ? dependencies.getAssessment(input.text, input.locale, inputLanguage).catch(() => ({
      status: "unavailable" as const, provider: "gemini" as const, reason: "upstream-error" as const,
    })) : Promise.resolve(null),
  ]);
  const result: AnalysisResponse = mlResult.ok ? {
    ...mlResult.payload,
    meta: mlResult.payload.meta ? { ...mlResult.payload.meta, inputLanguage }
      : undefined,
  } : {
    label: "UNSURE", confidence: 0, signals: [], evidence: [],
    meta: { engine: "unavailable", engineVersion: isUzbek ? "uzbek-source-only-v1" : "no-statistical-model",
      inputLanguage, externalSourcesChecked: false },
  };
  if (!assessment) return result;
  return {
    ...result,
    meta: result.meta ? { ...result.meta, externalSourcesChecked: assessment.status === "complete" }
      : undefined,
    geminiReview: assessment.status === "unavailable" ? assessment : {
      ...assessment,
      agreesWithPrimary: result.label === "UNSURE" || assessment.label === "UNSURE" ? null
        : result.label === assessment.label,
    },
  };
}
