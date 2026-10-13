import assert from "node:assert/strict";
import test from "node:test";
import { requestGeminiAssessment, DEFAULT_GEMINI_MODEL } from "../lib/server/gemini-review-core.ts";
import { analyzeText, getPublicVerdict } from "../lib/api.ts";
import { deriveClaimLabel, readClaimEvidence, resolveClaimEvidence } from "../lib/claim-evidence.ts";
import { claimsCoverShortText, isSingleShortStatement, restoreClaimQuote } from "../lib/claim-text.ts";

const TEXT = "Samarkand is the capital of Uzbekistan.";
const SOURCE_TEXT = "Article 6. The capital of the Republic of Uzbekistan shall be the city of Tashkent.";
const SOURCE = { id: "source-1", title: "Constitution — Article 6", url: "https://constitution.gov.uz/en", content: SOURCE_TEXT };
const PASSAGES = [{ sourceId: "source-1", quote: SOURCE_TEXT }];
const REASON = "The supplied constitutional passage names Tashkent, not Samarkand, as the capital.";
const CORRECTION = "Tashkent is the capital of Uzbekistan.";
const evidence = { query: TEXT, sources: [SOURCE] };

function payload(overrides = {}) {
  return { label: "FAKE", certainty: "high", explanation: REASON, warningSigns: [], coverage: "complete",
    claims: [{ quote: TEXT, kind: "FACTUAL", assessment: "CONTRADICTED", explanation: REASON,
      evidence: PASSAGES, correction: { text: CORRECTION, evidence: PASSAGES } }], ...overrides };
}
function envelope(value) {
  return { candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(value) }] } }] };
}
async function assess(value = payload(), text = TEXT, locale = "en", sources = evidence.sources) {
  return requestGeminiAssessment({ text, locale, evidence: { query: text, sources }, model: DEFAULT_GEMINI_MODEL,
    apiKey: "correction-test-only-key", fetchImpl: async () => Response.json(envelope(value)) });
}
function clientResponse(value = payload()) {
  return { label: "REAL", confidence: 0.62,
    meta: { engine: "external-model", engineVersion: "test-en", language: "en", externalSourcesChecked: false },
    geminiReview: { ...value, status: "complete", provider: "gemini", model: DEFAULT_GEMINI_MODEL,
      promptVersion: "misinfo-tavily-v4", agreesWithPrimary: value.label === "UNSURE" ? null : value.label === "REAL",
      externalSourcesChecked: true, searchQueries: [TEXT], sources: [{ id: SOURCE.id, title: SOURCE.title, url: SOURCE.url }],
      claims: value.claims.map((claim, index) => ({ ...claim, id: `claim-${index + 1}`,
        needsExternalVerification: claim.kind === "FACTUAL" && ["MIXED", "UNVERIFIED"].includes(claim.assessment) })) } };
}

test("returns exact claim, specific reason, separately evidenced correction in all response languages", async () => {
  for (const [locale, text, correction] of [
    ["en", TEXT, CORRECTION],
    ["ru", "Самарканд — столица Узбекистана.", "Ташкент — столица Узбекистана."],
    ["uz", "Samarqand O‘zbekistonning poytaxti.", "Toshkent O‘zbekistonning poytaxti."],
    ["uz", "Самарқанд Ўзбекистоннинг пойтахти.", "Тошкент Ўзбекистоннинг пойтахти."],
  ]) {
    const value = payload();
    value.claims[0].quote = text;
    value.claims[0].correction = { text: correction, evidence: PASSAGES };
    const result = await assess(value, text, locale);
    assert.equal(result.status, "complete");
    assert.equal(result.promptVersion, "misinfo-tavily-v4");
    assert.equal(result.label, "FAKE");
    assert.equal(result.claims[0].quote, text);
    assert.equal(result.claims[0].correction.text, correction);
    assert.deepEqual(result.claims[0].evidence, PASSAGES);
    assert.deepEqual(result.claims[0].correction.evidence, PASSAGES);
  }
});

test("contradiction does not require an invented replacement; missing evidence stays unsure", async () => {
  const contradicted = payload();
  contradicted.claims[0].correction = null;
  const result = await assess(contradicted);
  assert.equal(result.status, "complete");
  assert.equal(result.claims[0].correction, null);
  const unknown = payload({ label: "UNSURE", certainty: "low" });
  Object.assign(unknown.claims[0], { assessment: "UNVERIFIED", evidence: [], correction: null });
  const unverified = await assess(unknown);
  assert.equal(unverified.status, "complete");
  assert.equal(unverified.label, "UNSURE");
  assert.equal(unverified.claims[0].correction, null);
});

test("rejects missing proof, unknown sources, invented/paraphrased passages and unsafe URLs", async () => {
  for (const passage of [[], [{ sourceId: "made-up", quote: SOURCE_TEXT }],
    [{ sourceId: SOURCE.id, quote: "A fabricated passage which never occurred in these sources." }],
    [{ sourceId: SOURCE.id, quote: "The capital [...] Tashkent." }],
    [{ sourceId: SOURCE.id, quote: "Uzbekistan's capital happens to be Tashkent." }]]) {
    const value = payload();
    value.claims[0].evidence = passage;
    assert.equal((await assess(value)).reason, "invalid-response");
  }
  for (const url of ["javascript:alert(1)", "http://example.org", "https://name:password@example.org"]) {
    assert.equal((await assess(payload(), TEXT, "en", [{ ...SOURCE, url }])).reason, "invalid-response");
  }
});

test("omits unsupported optional corrections without losing independently evidenced contradictions", async () => {
  const missingProof = payload();
  missingProof.claims[0].correction.evidence = [];
  const inventedProof = payload();
  inventedProof.claims[0].correction.evidence = [{ sourceId: SOURCE.id, quote: "This invented quotation must be rejected." }];
  const noChange = payload();
  noChange.claims[0].correction.text = TEXT;
  const oversized = payload();
  oversized.claims[0].correction.text = "x".repeat(321);
  const malformed = payload();
  malformed.claims[0].correction = { text: CORRECTION, evidence: PASSAGES, invented: true };
  for (const value of [missingProof, inventedProof, noChange, oversized, malformed]) {
    const result = await assess(value);
    assert.equal(result.status, "complete");
    assert.equal(result.label, "FAKE");
    assert.equal(result.claims[0].correction, null);
    assert.deepEqual(result.claims[0].evidence, PASSAGES);
  }
});

test("rejects corrections attached to non-contradicted claims", async () => {
  for (const assessment of ["SUPPORTED", "UNVERIFIED", "MIXED", "NOT_APPLICABLE"]) {
    const value = payload();
    Object.assign(value.claims[0], { assessment, kind: assessment === "NOT_APPLICABLE" ? "OPINION" : "FACTUAL" });
    assert.equal((await assess(value)).reason, "invalid-response");
  }
});

test("requires complete short claim meaning, including negation, relationship direction and numbers", async () => {
  for (const [text, badQuote] of [["Uzbekistan is capital of Tashkent", "Tashkent"],
    ["Tashkent is not the capital of Uzbekistan.", "the capital of Uzbekistan"],
    ["Uzbekistan is capital of Tashkent", "Tashkent is capital of Uzbekistan"],
    ["Tashkent is not the capital of Uzbekistan.", "Tashkent is the capital of Uzbekistan."],
    ["The population was 2.5 million in 2020.", "The population was 2.5 million in 2021."],
    [TEXT, TEXT.toLowerCase()]]) {
    const value = payload();
    value.claims[0].quote = badQuote;
    assert.equal((await assess(value, text)).reason, "invalid-response");
  }
  const reversed = payload();
  reversed.claims[0].quote = "Uzbekistan is capital of Tashkent";
  assert.equal((await assess(reversed, reversed.claims[0].quote)).status, "complete");
});

test("restores actual submitted punctuation and whitespace without changing the proposition", async () => {
  for (const [text, quote] of [[TEXT, TEXT.slice(0, -1)],
    [TEXT.slice(0, -1), TEXT],
    [TEXT.replace("is the", "is  the"), TEXT],
    [TEXT.replace("is the", "is\tthe"), TEXT]]) {
    const value = payload(); value.claims[0].quote = quote;
    const result = await assess(value, text);
    assert.equal(result.status, "complete");
    assert.equal(result.label, "FAKE");
    assert.equal(result.claims[0].quote, text);
  }
  assert.equal(restoreClaimQuote("The capital...", "The capital", true), null);
  assert.equal(restoreClaimQuote("The amount is 2,5.", "The amount is 2.5.", true), null);
});

test("evidence retains source whitespace and NFC-equivalent characters, but never paraphrases", async () => {
  const content = SOURCE_TEXT.replace("of the Republic", "of\nthe  Republic");
  const result = await assess(payload(), TEXT, "en", [{ ...SOURCE, content }]);
  assert.equal(result.status, "complete");
  assert.equal(result.claims[0].evidence[0].quote, content);
  assert.equal(result.claims[0].correction.evidence[0].quote, content);
  const unicode = { ...SOURCE, content: "Cafe\u0301 is mentioned in the reference passage." };
  assert.deepEqual(readClaimEvidence([{ sourceId: SOURCE.id, quote: "Café is mentioned in the reference passage." }], [unicode]),
    [{ sourceId: SOURCE.id, quote: unicode.content }]);
  assert.equal(restoreClaimQuote("Café is mentioned.", "Cafe\u0301 is mentioned.", true), "Cafe\u0301 is mentioned.");
  assert.equal(readClaimEvidence([{ sourceId: SOURCE.id, quote: "The reference talks about a cafe." }], [unicode]), null);
});

test("short separated clauses allow multiple complete claims but cannot drop lexical qualifiers", async () => {
  const first = "Samarkand is the capital of Uzbekistan";
  const second = "Tashkent is the capital of Uzbekistan";
  const text = `${first}; ${second}.`;
  const value = payload();
  value.claims[0].quote = first;
  value.claims.push({ quote: `${second}.`, kind: "FACTUAL", assessment: "SUPPORTED", explanation: "The reference establishes that Tashkent is the capital.", evidence: PASSAGES, correction: null });
  assert.equal(isSingleShortStatement(text), false);
  assert.equal((await assess(value, text)).label, "FAKE");
  assert.equal((await assess(value, text.replace("; ", "\n"))).label, "FAKE");
  assert.equal(claimsCoverShortText([first, `${second}.`], text), true);
  assert.equal(claimsCoverShortText(["Uzbekistan", "Tashkent"], "Uzbekistan\nis capital of Tashkent"), false);
  const incomplete = structuredClone(value);
  incomplete.claims = [incomplete.claims[1]];
  incomplete.label = "REAL";
  assert.equal((await assess(incomplete, text)).reason, "invalid-response");
});

test("computes claim verdicts consistently; partial all-supported checks cannot become REAL", async () => {
  const mismatch = await assess(payload({ label: "REAL", explanation: "The checked information is fully supported and correct." }));
  assert.equal(mismatch.status, "complete");
  assert.equal(mismatch.label, "FAKE");
  assert.match(mismatch.explanation, /contradict/u);
  assert.doesNotMatch(mismatch.explanation, /fully supported/u);
  const partial = payload({ coverage: "partial", label: "UNSURE", certainty: "low" });
  Object.assign(partial.claims[0], { assessment: "SUPPORTED", correction: null });
  assert.equal((await assess(partial)).label, "UNSURE");
  partial.label = "REAL";
  assert.equal((await assess(partial)).label, "UNSURE");
  assert.equal(deriveClaimLabel([{ kind: "OPINION", assessment: "NOT_APPLICABLE" }]), "UNSURE");
  assert.equal(deriveClaimLabel([{ kind: "FACTUAL", assessment: "SUPPORTED" }, { kind: "FACTUAL", assessment: "CONTRADICTED" }]), "FAKE");
});

test("caps evidence/correction sizes, rejects duplicates and missing v4 fields", async () => {
  for (const mutate of [
    value => { delete value.coverage; }, value => { delete value.claims[0].correction; },
    value => { delete value.claims[0].evidence; },
    value => { value.claims[0].evidence = [...PASSAGES, ...PASSAGES]; },
    value => { value.claims[0].evidence = [{ sourceId: SOURCE.id, quote: "x".repeat(361) }]; },
  ]) { const value = payload(); mutate(value); assert.equal((await assess(value)).reason, "invalid-response"); }
});

test("client preserves v4 corrections and evidence, but rejects malformed provenance and inconsistent labels", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json(clientResponse());
    const result = await analyzeText(TEXT, { locale: "en", useGemini: true });
    assert.equal(getPublicVerdict(result).label, "FAKE");
    assert.deepEqual(result.geminiReview.claims[0].correction, { text: CORRECTION, evidence: PASSAGES });
    for (const mutate of [
      response => { delete response.geminiReview.coverage; },
      response => { response.geminiReview.claims[0].correction.evidence[0].sourceId = "unknown"; },
      response => { response.geminiReview.label = "REAL"; response.geminiReview.agreesWithPrimary = true; },
      response => { response.geminiReview.claims[0].quote = "Uzbekistan"; },
      response => { response.geminiReview.claims[0].correction.evidence = []; },
    ]) {
      const response = structuredClone(clientResponse()); mutate(response);
      globalThis.fetch = async () => Response.json(response);
      const invalid = await analyzeText(TEXT, { useGemini: true });
      assert.notEqual(invalid.geminiReview?.status, "complete");
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("provenance helpers validate exact passages while presentation resolves bounded safe references", () => {
  assert.deepEqual(readClaimEvidence(PASSAGES, [SOURCE]), PASSAGES);
  assert.equal(readClaimEvidence([{ ...PASSAGES[0], extra: true }], [SOURCE]), null);
  assert.equal(resolveClaimEvidence(PASSAGES, [{ ...SOURCE, url: "javascript:alert(1)" }]).length, 0);
  assert.deepEqual(resolveClaimEvidence(undefined, [SOURCE]), []);
  assert.equal(resolveClaimEvidence(PASSAGES, [SOURCE])[0].source.id, SOURCE.id);
});
