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

function sourceReview(claimOverrides = {}, reviewOverrides = {}) {
  return {
    status: "complete", provider: "gemini", model: "test-model", promptVersion: "misinfo-tavily-v4", coverage: "complete",
    label: "FAKE", certainty: "high", agreesWithPrimary: null,
    explanation: "The capital claim is contradicted by a source.", warningSigns: [],
    externalSourcesChecked: true, searchQueries: ["Uzbekistan capital"],
    sources: [{ id: "s1", title: "Constitution, Article 6", url: "https://example.org/constitution" }],
    claims: [{
      id: "capital", quote: "Samarkand is the capital of Uzbekistan.",
      kind: "FACTUAL", assessment: "CONTRADICTED", needsExternalVerification: false,
      explanation: "The source states that Tashkent, not Samarkand, is the capital.",
      evidence: [{ sourceId: "s1", quote: "The capital of the Republic of Uzbekistan is the city of Tashkent." }],
      correction: { text: "Tashkent is the capital of Uzbekistan.", evidence: [{ sourceId: "s1", quote: "The capital of the Republic of Uzbekistan is the city of Tashkent." }] },
      ...claimOverrides,
    }],
    ...reviewOverrides,
  };
}

function correctionReport(locale = "en", claimOverrides, reviewOverrides) {
  return buildAnalysisReport({
    locale, timestamp: "now", analyzedText: "Samarkand is the capital of Uzbekistan.",
    result: { label: "REAL", confidence: 0.8, geminiReview: sourceReview(claimOverrides, reviewOverrides) },
  });
}

test("reports preserve the false claim, its reason and a source-backed correction", () => {
  const report = correctionReport();
  assert.match(report, /Your claim: «Samarkand is the capital of Uzbekistan\.»/u);
  assert.match(report, /Why: The source states that Tashkent, not Samarkand, is the capital\./u);
  assert.match(report, /Correct fact: Tashkent is the capital of Uzbekistan\./u);
});

test("reports localize why, correction and evidence labels in all three languages", () => {
  for (const [locale, claim, why, correction, evidence] of [
    ["en", "Your claim", "Why", "Correct fact", "Evidence"],
    ["ru", "Ваше утверждение", "Почему", "Верный факт", "Доказательство"],
    ["uz", "Sizning da’vongiz", "Nega", "To‘g‘ri fakt", "Dalil"],
  ]) {
    const report = correctionReport(locale);
    assert.ok(report.includes(`${claim}: «Samarkand is the capital of Uzbekistan.»`));
    assert.ok(report.includes(`${why}: The source states that Tashkent, not Samarkand, is the capital.`));
    assert.ok(report.includes(`${correction}: Tashkent is the capital of Uzbekistan.`));
    assert.ok(report.includes(`${evidence}: «The capital of the Republic of Uzbekistan is the city of Tashkent.»`));
    assert.ok(report.includes("Constitution, Article 6"));
    assert.ok(report.includes("https://example.org/constitution"));
  }
});

test("reports do not invent replacements for legacy, unverified or unevidenced corrections", () => {
  for (const override of [
    { evidence: undefined, correction: undefined },
    { assessment: "UNVERIFIED" },
    { correction: { text: "An unsupported replacement.", evidence: [] } },
    { correction: { text: "An unsupported replacement.", evidence: [{ sourceId: "missing", quote: "A passage from an unknown source." }] } },
  ]) {
    const report = correctionReport("en", override);
    assert.doesNotMatch(report, /Correct fact:/u);
    assert.doesNotMatch(report, /An unsupported replacement/u);
  }
});

test("reports suppress unsafe evidence URLs and retain full negation and reasons", () => {
  const unsafe = correctionReport("en", undefined, {
    sources: [{ id: "s1", title: "Unsafe source", url: "javascript:alert(1)" }],
  });
  assert.doesNotMatch(unsafe, /javascript:|Correct fact:|Evidence:/u);
  const quote = `${"A qualification before the actual assertion. ".repeat(5)}Samarkand is not the capital.`;
  const explanation = `${"Detailed source context. ".repeat(12)}Tashkent is the capital, not Samarkand.`;
  const report = correctionReport("en", { quote, explanation });
  assert.ok(report.includes(quote));
  assert.ok(report.includes(explanation));
});

test("reports prioritize contradicted factual claims and prevent a false green v4 heading", () => {
  const review = sourceReview();
  const supported = { ...review.claims[0], id: "supported", quote: "A separate true claim.", assessment: "SUPPORTED", correction: null };
  const report = correctionReport("en", undefined, { label: "REAL", claims: [supported, review.claims[0]] });
  const falseClaim = report.indexOf("Your claim: «Samarkand");
  assert.ok(falseClaim >= 0 && falseClaim < report.indexOf("Your claim: «A separate true claim"));
  assert.match(report, /GEMINI SOURCE REVIEW\nResult: FAKE/u);
});

test("reports clearly mark partial source coverage and never label it all supported", () => {
  const review = sourceReview({ assessment: "SUPPORTED", correction: null });
  const report = correctionReport("en", undefined, { label: "REAL", coverage: "partial", claims: review.claims });
  assert.match(report, /GEMINI SOURCE REVIEW\nResult: UNSURE/u);
  assert.match(report, /Only some claims were checked\. The remaining statements have not been verified\./u);
});
