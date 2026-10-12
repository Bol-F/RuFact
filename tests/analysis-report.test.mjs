import assert from "node:assert/strict";
import test from "node:test";

import { buildAnalysisReport } from "../lib/analysis-report.ts";

test("builds a plain-text report with claims and safety wording", () => {
  const report = buildAnalysisReport({
    analyzedText: "Проверяемое утверждение.",
    timestamp: "1 окт. 2026, 12:30",
    result: {
      label: "FAKE",
      confidence: 0.72,
      explanation: "В тексте недостаточно подтверждающих деталей.",
      signals: [
        {
          id: "signal-1",
          title: "Нет источника",
          description: "Первоисточник не назван.",
          tone: "risk",
          severity: "high",
          evidenceIds: [],
        },
      ],
      geminiReview: {
        status: "complete",
        provider: "gemini",
        model: "test-model",
        promptVersion: "misinfo-tavily-v3",
        label: "UNSURE",
        certainty: "low",
        agreesWithPrimary: null,
        explanation: "Недостаточно данных для уверенной оценки.",
        warningSigns: [],
        claims: [
          {
            id: "claim-1",
            quote: "Проверяемое утверждение",
            kind: "FACTUAL",
            assessment: "UNVERIFIED",
            explanation: "В самом тексте нет подтверждения.",
            needsExternalVerification: true,
          },
        ],
        externalSourcesChecked: true,
        searchQueries: ["Проверяемое утверждение источник"],
        sources: [
          {
            id: "source-1",
            title: "Официальный источник",
            url: "https://example.org/source",
          },
        ],
      },
    },
  });

  assert.match(report, /Результат: НЕЯСНО/u);
  assert.doesNotMatch(report, /Уверенность модели в этом ответе: 72%/u);
  assert.match(report, /Проверяемое утверждение/u);
  assert.match(report, /FACTUAL \/ UNVERIFIED/u);
  assert.match(report, /Официальный источник/u);
  assert.match(report, /https:\/\/example\.org\/source/u);
  assert.match(report, /не окончательный фактологический вердикт/u);
  assert.match(report, /Tavily выполнил интернет-поиск/u);
});

test("clamps confidence in exported reports", () => {
  const report = buildAnalysisReport({
    analyzedText: "Текст",
    timestamp: "сейчас",
    result: { label: "REAL", confidence: 12 },
  });

  assert.match(report, /100%/u);
  assert.doesNotMatch(report, /1200%/u);
});
