import assert from "node:assert/strict";
import test from "node:test";
import { detectTextLanguage } from "../lib/text-language.ts";
import { resolveAnalysis } from "../lib/server/analysis-routing.ts";
import { analyzeText, getCalculationAnalysis, getPublicVerdict } from "../lib/api.ts";

test("whole arithmetic equations bypass every model/source dependency in all UI locales", async () => {
  for (const locale of ["uz", "ru", "en"]) {
    for (const text of ["2+2=4", "2+2=5", "0.1+0.2=0.3", "1/3=2/6"]) {
      for (const useGemini of [undefined, true, false]) {
        const result = await resolveAnalysis({ text, locale, useGemini, mlConfigured: false }, {
          requestMl: async () => { assert.fail("Arithmetic must not call ML"); },
          getAssessment: async () => { assert.fail("Arithmetic must not call search or Gemini"); },
        });
        assert.deepEqual(result, getCalculationAnalysis(text, locale));
        assert.equal(result.geminiReview, undefined);
        assert.equal(result.meta.externalSourcesChecked, false);
        assert.equal(result.meta.engine, "calculation");
        assert.equal(getPublicVerdict(result).confidence, null);
        assert.equal(getPublicVerdict(result).label, text === "2+2=5" ? "FAKE" : "REAL");
      }
    }
  }
});

test("invalid math or math inside a factual paragraph never replaces source verification", async () => {
  for (const text of ["2+2=4. The earth is flat.", "1/0=0", "2+2=4 or 2+2=5"]) {
    let assessments = 0;
    const result = await resolveAnalysis({ text, locale: "en", useGemini: true, mlConfigured: false }, {
      requestMl: async () => { assert.fail("No model configured"); },
      getAssessment: async () => { assessments += 1; return { status: "unavailable", provider: "gemini", reason: "no-search-results" }; },
    });
    assert.equal(assessments, 1);
    assert.equal(result.calculation, undefined);
    assert.equal(getPublicVerdict(result).label, "UNSURE");
  }
});

test("client recomputes math and rejects spoofed correctness, probabilities, sources and mismatched text", async () => {
  const originalFetch = globalThis.fetch;
  const valid = getCalculationAnalysis("2+2=5", "en");
  try {
    globalThis.fetch = async () => Response.json({ ...valid, explanation: "Incorrect stale server description" });
    const result = await analyzeText("2+2=5", { locale: "en", useGemini: true });
    assert.deepEqual(result, valid);
    assert.equal(result.sourceReview, undefined);
    for (const invalid of [
      { ...valid, label: "REAL" }, { ...valid, confidence: 1 },
      { ...valid, calculation: { ...valid.calculation, leftValue: "5", correct: true } },
      { ...valid, calculation: { ...valid.calculation, expression: "2+2=4" } },
      { ...valid, meta: { ...valid.meta, externalSourcesChecked: true } },
      { ...valid, geminiReview: { status: "unavailable", provider: "gemini", reason: "not-configured" } },
      { ...valid, meta: { ...valid.meta, engine: "external-model" } },
    ]) {
      globalThis.fetch = async () => Response.json(invalid);
      await assert.rejects(() => analyzeText("2+2=5"), /invalid shape/);
    }
    globalThis.fetch = async () => Response.json(valid);
    await assert.rejects(() => analyzeText("2+2=4"), /invalid shape/);
    await assert.rejects(() => analyzeText("2+2=5 and a fake claim"), /invalid shape/);
  } finally { globalThis.fetch = originalFetch; }
});

test("Uzbek routing accepts both alphabets and common apostrophe variants", () => {
  for (const apostrophe of ["'", "‘", "’", "ʻ", "ʼ", "`", "´"]) {
    assert.equal(detectTextLanguage(`Toshkent O${apostrophe}zbekistonning poytaxti.`), "uz");
  }
  for (const text of ["Bu xabar rost emas va uning manbasi yo‘q.", "Бу хабар рост эмас ва унинг манбаси йўқ.", "Бу хабар рост эмас.", "Yer tekis."]) {
    assert.equal(detectTextLanguage(text), "uz");
  }
});

test("quoted Uzbek names do not override English or Russian prose", () => {
  assert.equal(detectTextLanguage("This article quotes O‘zbekiston but has no Uzbek prose."), "en");
  assert.equal(detectTextLanguage("В статье говорится об Узбекистане: Ўзбекистон."), "ru");
  assert.equal(detectTextLanguage("Trump has six wives"), "en");
  assert.equal(detectTextLanguage("1234 https://example.org/english"), "unknown");
  assert.equal(detectTextLanguage("中文文本"), "unknown");
  assert.equal(detectTextLanguage("abc абв"), "unknown");
  assert.equal(detectTextLanguage("https://example.org/english Bu xabar rost emas."), "uz");
});

test("Uzbek needs no ML configuration or JWT, and output locale does not change input routing", async () => {
  for (const locale of ["uz", "ru", "en"]) {
    let sources = 0;
    const result = await resolveAnalysis({ text: "Бу хабар рост эмас.", locale, mlConfigured: false }, {
      requestMl: async () => { assert.fail("Uzbek must never request ML"); },
      getAssessment: async (text, outputLocale, inputLanguage) => {
        sources += 1;
        assert.equal(text, "Бу хабар рост эмас.");
        assert.equal(outputLocale, locale);
        assert.equal(inputLanguage, "uz");
        return { status: "unavailable", provider: "gemini", reason: "no-search-results" };
      },
    });
    assert.equal(sources, 1);
    assert.equal(result.meta.inputLanguage, "uz");
    assert.equal(getPublicVerdict(result).label, "UNSURE");
  }
});

test("opt-out and thrown provider failures cannot become a fabricated Uzbek score", async () => {
  const dependencies = {
    requestMl: async () => { assert.fail("Uzbek must never request ML"); },
    getAssessment: async () => { throw new Error("Sensitive provider message"); },
  };
  const input = { text: "Bu xabar rost emas.", locale: "uz", mlConfigured: true };
  const optedOut = await resolveAnalysis({ ...input, useGemini: false }, dependencies);
  assert.equal(optedOut.geminiReview, undefined);
  const failed = await resolveAnalysis(input, dependencies);
  assert.deepEqual(failed.geminiReview, { status: "unavailable", provider: "gemini", reason: "upstream-error" });
  assert.equal(failed.confidence, 0);
  assert.equal(getPublicVerdict(failed).confidence, null);
  assert.doesNotMatch(JSON.stringify(failed), /Sensitive/);
});

test("client keeps Uzbek source-only metadata but never trusts checked=true without valid evidence", async () => {
  const originalFetch = globalThis.fetch;
  const text = "Toshkent O‘zbekistonning poytaxti.";
  const neutral = { label: "UNSURE", confidence: 0, signals: [], evidence: [],
    meta: { engine: "unavailable", engineVersion: "uzbek-source-only-v1", inputLanguage: "uz", externalSourcesChecked: true } };
  try {
    globalThis.fetch = async () => Response.json(neutral);
    const unchecked = await analyzeText(text);
    assert.equal(unchecked.meta.inputLanguage, "uz");
    assert.equal(unchecked.meta.externalSourcesChecked, false);
    globalThis.fetch = async () => Response.json({ ...neutral, geminiReview: {
      status: "complete", provider: "gemini", model: "test-model", promptVersion: "misinfo-tavily-v3",
      label: "REAL", certainty: "high", agreesWithPrimary: null, explanation: "The source supports this claim.",
      warningSigns: [], externalSourcesChecked: true, searchQueries: [text],
      sources: [{ id: "source-1", title: "Reference", url: "https://example.org/reference" }],
      claims: [{ id: "claim-1", quote: text, kind: "FACTUAL", assessment: "SUPPORTED", explanation: "The source supports this claim.", needsExternalVerification: false }],
    } });
    const checked = await analyzeText(text, { locale: "en", useGemini: true });
    assert.equal(checked.meta.externalSourcesChecked, true);
    assert.equal(getPublicVerdict(checked).label, "REAL");
    assert.equal(getPublicVerdict(checked).confidence, null);
    assert.equal(checked.meta.language, undefined);
  } finally { globalThis.fetch = originalFetch; }
});
