import assert from "node:assert/strict";
import test from "node:test";
import { detectTextLanguage } from "../lib/text-language.ts";
import { resolveAnalysis } from "../lib/server/analysis-routing.ts";
import { analyzeText, getPublicVerdict } from "../lib/api.ts";

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
