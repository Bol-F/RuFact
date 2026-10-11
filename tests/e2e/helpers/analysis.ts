import type { AnalysisResponse } from "../../../lib/api";

// Deterministic UI results: no Gemini, Tavily or deployed ML service is called.
export function analysisFixture(label: AnalysisResponse["label"] = "REAL", confidence = 0.83): AnalysisResponse {
  return {
    label,
    confidence,
    explanation: "A submitted result for deterministic analyzer UI regression coverage.",
    meta: {
      engine: "external-model",
      engineVersion: "analyzer-ui-regression-v1",
      externalSourcesChecked: false,
    },
  };
}
