import assert from "node:assert/strict";
import test from "node:test";

import { analyzeText, getPublicVerdict } from "../lib/api.ts";
import { readClaimEvidence } from "../lib/claim-evidence.ts";
import { claimsCoverShortText, restoreClaimQuote } from "../lib/claim-text.ts";
import { DEFAULT_GEMINI_MODEL, requestGeminiAssessment } from "../lib/server/gemini-review-core.ts";

const TEST_TEXT =
  "Вода кипит при 100 градусах Цельсия при нормальном атмосферном давлении.";

test("marks sources as checked and removes the manual-search fallback", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body));
    assert.equal(request.useGemini, true);
    assert.equal(request.locale, "uz");

    return Response.json({
      label: "REAL",
      confidence: 0.82,
      geminiReview: {
        status: "complete",
        provider: "gemini",
        model: "gemini-3.5-flash-lite",
        promptVersion: "misinfo-tavily-v3",
        label: "REAL",
        certainty: "high",
        agreesWithPrimary: true,
        explanation:
          "Найденные источники подтверждают утверждение для указанного нормального давления.",
        warningSigns: [],
        claims: [
          {
            id: "claim-1",
            quote: TEST_TEXT.slice(0, -1),
            kind: "FACTUAL",
            assessment: "SUPPORTED",
            explanation:
              "Формулировка соответствует справочным данным при нормальном атмосферном давлении.",
            needsExternalVerification: false,
          },
        ],
        externalSourcesChecked: true,
        searchQueries: ["температура кипения воды нормальное давление"],
        sources: [
          {
            id: "source-1",
            title: "Справочник по температуре кипения воды",
            url: "https://example.org/water-boiling-point",
          },
        ],
      },
    });
  };

  try {
    const result = await analyzeText(TEST_TEXT, { useGemini: true });

    assert.equal(result.geminiReview?.status, "complete");
    assert.equal(result.meta?.externalSourcesChecked, true);
    assert.equal(result.sourceReview, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

const ORIGINAL_CLAIM = "Samarkand is the capital of Uzbekistan.";
const SOURCE_PASSAGE = "The capital of Uzbekistan is Tashkent, not Samarkand.";
const CLAIM_SOURCE = { id: "source-1", title: "Client round-trip reference", url: "https://example.org/client-reference", content: SOURCE_PASSAGE };
const CLAIM_REASON = "The supplied reference names Tashkent, not Samarkand, as the capital.";

async function validatedClaimReview(text = ORIGINAL_CLAIM, quote = text, options = {}) {
  const source = options.source ?? CLAIM_SOURCE;
  const passage = options.passage ?? source.content;
  const correction = options.correction === undefined
    ? { text: "Tashkent is the capital of Uzbekistan.", evidence: [{ sourceId: source.id, quote: passage }] }
    : options.correction;
  const payload = { label: "FAKE", certainty: "high", coverage: "complete", explanation: CLAIM_REASON, warningSigns: [],
    claims: [{ quote, kind: "FACTUAL", assessment: "CONTRADICTED", explanation: CLAIM_REASON,
      evidence: [{ sourceId: source.id, quote: passage }], correction }] };
  const review = await requestGeminiAssessment({
    text, locale: "en", model: DEFAULT_GEMINI_MODEL, apiKey: "client-round-trip-mock-key",
    evidence: { query: text, sources: [source] },
    fetchImpl: async () => Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(payload) }] } }] }),
  });
  assert.equal(review.status, "complete");
  return { ...review, agreesWithPrimary: null };
}

function sourceOnlyResponse(review) {
  return { label: "UNSURE", confidence: 0,
    meta: { engine: "unavailable", engineVersion: "client-source-only-test", externalSourcesChecked: false, inputLanguage: "uz" },
    geminiReview: review };
}

test("modern source-only reviews survive server-to-client whitespace, NFC and punctuation normalization", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const [text, quote, source, passage] of [
      [ORIGINAL_CLAIM, ORIGINAL_CLAIM.slice(0, -1), CLAIM_SOURCE, SOURCE_PASSAGE],
      [ORIGINAL_CLAIM.replace("is the", "is  the"), ORIGINAL_CLAIM, CLAIM_SOURCE, SOURCE_PASSAGE],
      [ORIGINAL_CLAIM.replace("is the", "is\tthe"), ORIGINAL_CLAIM, CLAIM_SOURCE, SOURCE_PASSAGE],
      ["Samarkand is the capital of Cafe\u0301 Republic.", "Samarkand is the capital of Café Republic.",
        { ...CLAIM_SOURCE, content: "The capital of Cafe\u0301 Republic is\nTashkent, not Samarkand." },
        "The capital of Café Republic is Tashkent, not Samarkand."],
    ]) {
      const review = await validatedClaimReview(text, quote, { source, passage });
      globalThis.fetch = async () => Response.json(sourceOnlyResponse(review));
      const result = await analyzeText(text, { locale: "en", useGemini: true });
      assert.equal(result.geminiReview?.status, "complete");
      assert.equal(getPublicVerdict(result).label, "FAKE");
      assert.equal(getPublicVerdict(result).basis, "sources");
      assert.equal(result.meta.externalSourcesChecked, true);
      assert.equal(result.geminiReview.claims[0].quote, text);
      assert.equal(result.geminiReview.claims[0].evidence[0].quote, source.content);
      assert.equal(result.sourceReview, undefined);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("client restores benign formatting on modern wire claims without changing their original wording", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const text = ORIGINAL_CLAIM.replace("is the", "is  the");
    const review = await validatedClaimReview(text);
    review.claims[0].quote = ORIGINAL_CLAIM.slice(0, -1);
    globalThis.fetch = async () => Response.json(sourceOnlyResponse(review));
    const result = await analyzeText(text, { locale: "en", useGemini: true });
    assert.equal(result.geminiReview?.status, "complete");
    assert.equal(result.geminiReview.claims[0].quote, text);
    assert.equal(getPublicVerdict(result).label, "FAKE");
  } finally { globalThis.fetch = originalFetch; }
});

test("an invalid optional server correction becomes null and preserves the validated contradiction", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const review = await validatedClaimReview(ORIGINAL_CLAIM, ORIGINAL_CLAIM, {
      correction: { text: "Tashkent is the capital of Uzbekistan.", evidence: [{ sourceId: CLAIM_SOURCE.id, quote: "This quotation does not occur in the source content." }] },
    });
    assert.equal(review.claims[0].correction, null);
    globalThis.fetch = async () => Response.json(sourceOnlyResponse(review));
    const result = await analyzeText(ORIGINAL_CLAIM, { locale: "en", useGemini: true });
    assert.equal(result.geminiReview?.status, "complete");
    assert.equal(result.geminiReview.claims[0].correction, null);
    assert.equal(getPublicVerdict(result).label, "FAKE");
    assert.deepEqual(result.geminiReview.claims[0].evidence, [{ sourceId: CLAIM_SOURCE.id, quote: SOURCE_PASSAGE }]);
  } finally { globalThis.fetch = originalFetch; }
});

test("modern client still rejects entity-only, negation, direction and number changes", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const [text, badQuote] of [
      ["Uzbekistan is capital of Tashkent", "Tashkent"],
      ["Tashkent is not the capital of Uzbekistan.", "Tashkent is the capital of Uzbekistan."],
      ["Uzbekistan is capital of Tashkent", "Tashkent is capital of Uzbekistan"],
      ["The population was 2.5 million in 2020.", "The population was 2.5 million in 2021."],
    ]) {
      const review = await validatedClaimReview(text, text, { correction: null });
      review.claims[0].quote = badQuote;
      globalThis.fetch = async () => Response.json(sourceOnlyResponse(review));
      const result = await analyzeText(text, { locale: "en", useGemini: true });
      assert.notEqual(result.geminiReview?.status, "complete");
      assert.equal(getPublicVerdict(result).label, "UNSURE");
      assert.equal(result.meta.externalSourcesChecked, false);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("normalized quotations cannot escape partial-grapheme boundaries", () => {
  const content = "Reference a\u0301\u030a follows in the source.";
  const quote = "Reference á";
  assert.equal(restoreClaimQuote(quote, content), null);
  assert.equal(readClaimEvidence([{ sourceId: CLAIM_SOURCE.id, quote }], [{ ...CLAIM_SOURCE, content }]), null);
  assert.equal(restoreClaimQuote("Reference á\u030a", content), "Reference a\u0301\u030a");
});

test("claim formatting normalization preserves signs, decimal punctuation, apostrophes and sentence type", () => {
  assert.equal(restoreClaimQuote("Tashkent is the capital.", "Tashkent is the capital?", true), null);
  assert.equal(restoreClaimQuote("Tashkent is the capital?", "Tashkent is the capital!", true), null);
  assert.equal(restoreClaimQuote("Tashkent is the capital", "Tashkent is the capital?", true), "Tashkent is the capital?");
  assert.equal(claimsCoverShortText(["5 degrees", "10 maximum"], "-5 degrees; 10 maximum"), false);
  assert.equal(claimsCoverShortText(["2", "5 degrees", "10 maximum"], "2.5 degrees; 10 maximum"), false);
  assert.equal(claimsCoverShortText(["O", "zbekiston", "Tashkent"], "O'zbekiston; Tashkent"), false);
  assert.equal(claimsCoverShortText(["-5 degrees", "10 maximum"], "-5 degrees; 10 maximum."), true);
});
