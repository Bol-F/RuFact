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
  for (const text of ["Bu xabar rost emas va uning manbasi yo‘q.", "Бу хабар рост эмас ва унинг манбаси йўқ.", "Бу хабар рост эмас.", "Yer tekis.",
    "Samarqand poytaxt.", "Samarqand O‘zbekistonning poytaxtidir.", "Самарканд Узбекистон пойтахти.", "Самарқанд Ўзбекистоннинг пойтахтидир."]) {
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
  assert.equal(detectTextLanguage("Москва — столица России, Ташкент — столица Узбекистана."), "ru");
  assert.equal(detectTextLanguage("Узбекское слово «пойтахт» значит столица."), "ru");
  assert.equal(detectTextLanguage("The word poytaxt means capital."), "en");
  assert.equal(detectTextLanguage("Ташкент, Самарканд, Бухара"), "ru");
  assert.equal(detectTextLanguage("London, Manchester, Samarkand"), "en");
});

test("Uzbek always uses guarded sources, never ML/JWT, for both alphabets, every UI locale and legacy opt-out", async () => {
  for (const text of ["Bu xabar rost emas.", "Бу хабар рост эмас.", "Samarqand poytaxt.", "Самарканд Узбекистон пойтахти."]) {
    for (const locale of ["uz", "ru", "en"]) {
      for (const useGemini of [undefined, true, false]) {
        for (const mlConfigured of [true, false]) {
          let sources = 0;
          let mlCalls = 0;
          const result = await resolveAnalysis({ text, locale, useGemini, mlConfigured }, {
            requestMl: async () => { mlCalls++; return { ok: false }; },
            getAssessment: async (inputText, outputLocale, inputLanguage) => {
              sources++;
              assert.equal(inputText, text);
              assert.equal(outputLocale, locale);
              assert.equal(inputLanguage, "uz");
              return { status: "unavailable", provider: "gemini", reason: "no-search-results" };
            },
          });
          assert.equal(sources, 1);
          assert.equal(mlCalls, 0);
          assert.equal(result.meta.inputLanguage, "uz");
          assert.equal(result.meta.externalSourcesChecked, false);
          assert.equal(result.confidence, 0);
          assert.equal(result.meta.engine, "unavailable");
          assert.equal(getPublicVerdict(result).label, "UNSURE");
          assert.equal(getPublicVerdict(result).confidence, null);
        }
      }
    }
  }
});

test("legacy opt-out cannot skip Uzbek checks, and thrown provider failures never fabricate an ML score", async () => {
  const dependencies = {
    requestMl: async () => { assert.fail("Uzbek must never request ML"); },
    getAssessment: async () => { throw new Error("Sensitive provider message"); },
  };
  const input = { text: "Bu xabar rost emas.", locale: "uz", mlConfigured: true };
  const optedOut = await resolveAnalysis({ ...input, useGemini: false }, dependencies);
  assert.deepEqual(optedOut.geminiReview, { status: "unavailable", provider: "gemini", reason: "upstream-error" });
  const failed = await resolveAnalysis(input, dependencies);
  assert.deepEqual(failed.geminiReview, { status: "unavailable", provider: "gemini", reason: "upstream-error" });
  assert.equal(failed.confidence, 0);
  assert.equal(getPublicVerdict(failed).confidence, null);
  assert.doesNotMatch(JSON.stringify(failed), /Sensitive/);
});

test("provider outages and quota refusals stay unavailable in every Uzbek script and UI language", async () => {
  for (const text of ["Bu xabar rost emas.", "Бу хабар рост эмас."]) {
    for (const locale of ["uz", "ru", "en"]) {
      for (const reason of ["not-configured", "search-not-configured", "search-error", "search-rate-limited", "no-search-results", "rate-limited", "timeout", "blocked", "invalid-response"]) {
        let mlCalls = 0;
        const result = await resolveAnalysis({ text, locale, useGemini: false, mlConfigured: true }, {
          requestMl: async () => { mlCalls++; return { ok: true, payload: { label: "REAL", confidence: 0.99 } }; },
          getAssessment: async () => ({ status: "unavailable", provider: "gemini", reason }),
        });
        assert.equal(mlCalls, 0);
        assert.equal(result.label, "UNSURE");
        assert.equal(result.confidence, 0);
        assert.equal(result.meta.externalSourcesChecked, false);
        assert.equal(result.geminiReview.reason, reason);
        assert.deepEqual(getPublicVerdict(result), { basis: "unavailable", label: "UNSURE", confidence: null, certainty: null, explanation: undefined });
      }
    }
  }
});

test("verified source conclusions are the public Uzbek verdict, without inventing an ML probability", async () => {
  for (const text of ["Toshkent O‘zbekistonning poytaxti.", "Тошкент Ўзбекистоннинг пойтахти."]) {
    for (const locale of ["uz", "ru", "en"]) {
      for (const label of ["REAL", "FAKE", "UNSURE"]) {
        const assessment = {
          status: "complete", provider: "gemini", model: "test", promptVersion: "misinfo-tavily-v4",
          label, certainty: "high", explanation: "Verified source evidence determines this test verdict.",
          warningSigns: [], coverage: "complete", externalSourcesChecked: true, searchQueries: [text],
          sources: [{ id: "source-1", title: "Test source", url: "https://example.org/source" }],
          claims: [{ id: "claim-1", quote: text, kind: "FACTUAL",
            assessment: label === "REAL" ? "SUPPORTED" : label === "FAKE" ? "CONTRADICTED" : "UNVERIFIED",
            explanation: "Verified source evidence determines this test claim.", needsExternalVerification: label === "UNSURE",
            evidence: label === "UNSURE" ? [] : [{ sourceId: "source-1", quote: "Exact supporting or contradicting evidence for the test." }], correction: null }],
        };
        let mlCalls = 0;
        const result = await resolveAnalysis({ text, locale, useGemini: false, mlConfigured: true }, {
          requestMl: async () => { mlCalls++; return { ok: false }; },
          getAssessment: async () => assessment,
        });
        assert.equal(mlCalls, 0);
        assert.equal(result.label, "UNSURE", "No statistical label is fabricated");
        assert.equal(result.meta.externalSourcesChecked, true);
        assert.equal(result.geminiReview.agreesWithPrimary, null);
        assert.deepEqual(getPublicVerdict(result), { basis: "sources", label, confidence: null, certainty: "high", explanation: assessment.explanation });
      }
    }
  }
});

test("Russian and English retain their separate statistical route and optional source opt-out", async () => {
  for (const text of ["Сегодня в Москве открылся новый городской парк.", "A new public park opened in London today."]) {
    for (const locale of ["uz", "ru", "en"]) {
      let mlCalls = 0;
      let sources = 0;
      const result = await resolveAnalysis({ text, locale, useGemini: false, mlConfigured: true }, {
        requestMl: async () => { mlCalls++; return { ok: true, payload: { label: "REAL", confidence: 0.88,
          meta: { engine: "external-model", engineVersion: "test", language: detectTextLanguage(text), externalSourcesChecked: false } } }; },
        getAssessment: async () => { sources++; return { status: "unavailable", provider: "gemini", reason: "not-configured" }; },
      });
      assert.equal(mlCalls, 1);
      assert.equal(sources, 0);
      assert.equal(result.meta.engine, "external-model");
      assert.equal(getPublicVerdict(result).basis, "statistical");
    }
  }
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
