import assert from "node:assert/strict";
import test from "node:test";
import { analyzeText, getPublicVerdict } from "../lib/api.ts";
import { buildAnalysisReport } from "../lib/analysis-report.ts";

const text = "Trump has six wives";
const review = (label) => ({
  status: "complete", provider: "gemini", model: "test-model",
  promptVersion: "misinfo-tavily-v3", label, certainty: "medium",
  agreesWithPrimary: label === "UNSURE" ? null : label === "REAL",
  explanation: "Retrieved evidence contradicts the claim about six wives.",
  warningSigns: [], externalSourcesChecked: true, searchQueries: [text],
  claims: [{ id: "claim-1", quote: text, kind: "FACTUAL",
    assessment: label === "UNSURE" ? "UNVERIFIED" : "CONTRADICTED",
    explanation: "The cited reference does not support the number in this claim.",
    needsExternalVerification: label === "UNSURE" }],
  sources: [{ id: "source-1", title: "Example reference", url: "https://example.org/reference" }],
});
const statistical = {
  label: "REAL", confidence: 0.62,
  meta: { engine: "external-model", engineVersion: "english-test-model", language: "en", externalSourcesChecked: false },
};

test("contradicting sources lead the public conclusion, not statistical REAL", () => {
  const result = { ...statistical, geminiReview: review("FAKE") };
  assert.deepEqual(getPublicVerdict(result), {
    basis: "sources", label: "FAKE", confidence: null, certainty: "medium",
    explanation: result.geminiReview.explanation,
  });
  const report = buildAnalysisReport({ result, analyzedText: text, timestamp: "test", locale: "en" });
  assert.match(report, /Result: FAKE/);
  assert.doesNotMatch(report, /Result: REAL/);
  assert.match(report, /Statistical signal only: REAL · 62%/);
  assert.ok(report.indexOf("Result: FAKE") < report.indexOf("Statistical signal only"));
});

test("mixed/insufficient sources remain UNSURE even with a strong statistical prediction", () => {
  assert.equal(getPublicVerdict({ ...statistical, confidence: 0.99, geminiReview: review("UNSURE") }).label, "UNSURE");
  assert.equal(getPublicVerdict(statistical).basis, "statistical");
  assert.equal(getPublicVerdict({ label: "UNSURE", confidence: 0,
    meta: { engine: "unavailable", engineVersion: "no-model", externalSourcesChecked: false } }).confidence, null);
});

test("client accepts a source-only result and preserves English model metadata", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ ...statistical, geminiReview: review("FAKE") });
    const english = await analyzeText(text, { locale: "ru", useGemini: true });
    assert.equal(english.meta.language, "en");
    assert.equal(getPublicVerdict(english).label, "FAKE");
    const sourceOnly = { ...review("FAKE"), agreesWithPrimary: null };
    globalThis.fetch = async () => Response.json({
      label: "UNSURE", confidence: 0,
      meta: { engine: "unavailable", engineVersion: "no-model", externalSourcesChecked: false },
      geminiReview: sourceOnly,
    });
    const parsed = await analyzeText(text, { locale: "en", useGemini: true });
    assert.equal(parsed.geminiReview.status, "complete");
    assert.equal(getPublicVerdict(parsed).label, "FAKE");
  } finally { globalThis.fetch = originalFetch; }
});

test("client rejects UNSURE with a fabricated percentage or model status", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ ...statistical, label: "UNSURE" });
    await assert.rejects(() => analyzeText(text), /invalid shape/);
  } finally { globalThis.fetch = originalFetch; }
});
