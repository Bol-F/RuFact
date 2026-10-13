import assert from "node:assert/strict";
import test from "node:test";

import {
  BodyTooLargeError,
  readBoundedText,
} from "../lib/server/bounded-text.ts";
import { requestTavilyEvidence } from "../lib/server/tavily-search.ts";
import {
  DEFAULT_GEMINI_MODEL,
  requestGeminiAssessment,
} from "../lib/server/gemini-review-core.ts";

const encoder = new TextEncoder();

function streamedBody(chunks, declaredLength) {
  let reads = 0;
  const cancellations = [];
  const body = new ReadableStream({
    pull(controller) {
      if (reads === chunks.length) {
        controller.close();
      } else {
        controller.enqueue(chunks[reads++]);
      }
    },
    cancel(reason) {
      cancellations.push(reason);
    },
  }, { highWaterMark: 0 });
  const headers = new Headers();
  if (declaredLength !== undefined) headers.set("content-length", declaredLength);
  return { body, headers, cancellations, reads: () => reads };
}

test("reads exact byte boundaries and split UTF-8 characters correctly", async () => {
  const text = "Ўзбекистон O‘zbekiston 🌍";
  const bytes = encoder.encode(text);
  const source = streamedBody([...bytes].map(byte => new Uint8Array([byte])));
  assert.equal(await readBoundedText(source, { maxBytes: bytes.length }), text);
  assert.equal(source.body.locked, false);
  assert.deepEqual(source.cancellations, []);
  assert.equal(await readBoundedText(new Response(null), { maxBytes: 0 }), "");
});

test("rejects oversized Content-Length before reading and cancels the body", async () => {
  for (const declaredLength of ["9", "999999999999999999999999999999999999999999999999999999"]) {
    const source = streamedBody([encoder.encode("small")], declaredLength);
    await assert.rejects(readBoundedText(source, { maxBytes: 8 }), BodyTooLargeError);
    assert.equal(source.reads(), 0);
    assert.equal(source.cancellations.length, 1);
    assert.ok(source.cancellations[0] instanceof BodyTooLargeError);
    assert.equal(source.body.locked, false);
  }
});

test("limits actual streamed bytes with missing, deceptive or invalid Content-Length", async () => {
  for (const declaredLength of [undefined, "1", "not-a-length", "-10", "1e3"]) {
    const source = streamedBody([
      encoder.encode("1234"), encoder.encode("56789"), encoder.encode("must not be read"),
    ], declaredLength);
    await assert.rejects(readBoundedText(source, { maxBytes: 8 }), BodyTooLargeError);
    assert.equal(source.reads(), 2);
    assert.equal(source.cancellations.length, 1);
    assert.equal(source.body.locked, false);
  }
});

test("rejects oversized multi-byte chunks before decoding or reading the rest", async () => {
  const source = streamedBody([encoder.encode("🌍🌍"), encoder.encode("next")]);
  await assert.rejects(readBoundedText(source, { maxBytes: 7 }), BodyTooLargeError);
  assert.equal(source.reads(), 1);
  assert.equal(source.cancellations.length, 1);
});

test("rejects malformed UTF-8 and non-byte chunks, releasing the reader", async () => {
  for (const chunk of [new Uint8Array([0xff]), "not a byte chunk"]) {
    const source = streamedBody([chunk, encoder.encode("unread")]);
    await assert.rejects(readBoundedText(source, { maxBytes: 100 }), TypeError);
    assert.equal(source.reads(), 1);
    assert.equal(source.cancellations.length, 1);
    assert.equal(source.body.locked, false);
  }
  const incomplete = streamedBody([new Uint8Array([0xe2, 0x82])]);
  await assert.rejects(readBoundedText(incomplete, { maxBytes: 2 }), TypeError);
  assert.equal(incomplete.body.locked, false);
});

test("propagates stream errors without retaining the reader lock", async () => {
  const failure = new Error("upstream stream failed");
  const body = new ReadableStream({ pull(controller) { controller.error(failure); } });
  await assert.rejects(readBoundedText({ body, headers: new Headers() }, { maxBytes: 8 }), error => error === failure);
  assert.equal(body.locked, false);
});

test("cancels pre-aborted and pending bodies using the original abort reason", async () => {
  const alreadyAborted = new AbortController();
  const earlyReason = new DOMException("Already stopped", "AbortError");
  alreadyAborted.abort(earlyReason);
  const earlySource = streamedBody([encoder.encode("unread")]);
  await assert.rejects(readBoundedText(earlySource, {
    maxBytes: 8, signal: alreadyAborted.signal,
  }), error => error === earlyReason);
  assert.equal(earlySource.reads(), 0);
  assert.deepEqual(earlySource.cancellations, [earlyReason]);

  const controller = new AbortController();
  const cancellations = [];
  const body = new ReadableStream({ cancel(reason) { cancellations.push(reason); } });
  const pending = readBoundedText({ body, headers: new Headers() }, {
    maxBytes: 8, signal: controller.signal,
  });
  const reason = new DOMException("Stopped while reading", "AbortError");
  controller.abort(reason);
  await assert.rejects(pending, error => error === reason);
  // The abort listener plus cleanup may call cancel twice; the stream's hook runs once.
  assert.deepEqual(cancellations, [reason]);
  assert.equal(body.locked, false);
});

test("does not block on a stalled cancellation hook", async () => {
  const body = new ReadableStream({
    pull(controller) { controller.enqueue(encoder.encode("oversized")); },
    cancel() { return new Promise(() => {}); },
  }, { highWaterMark: 0 });
  await assert.rejects(readBoundedText({ body, headers: new Headers() }, { maxBytes: 1 }), BodyTooLargeError);
  assert.equal(body.locked, false);
});

test("validates byte limits without consuming a body", async () => {
  for (const maxBytes of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const source = streamedBody([encoder.encode("unread")]);
    await assert.rejects(readBoundedText(source, { maxBytes }), RangeError);
    assert.equal(source.reads(), 0);
    assert.equal(source.body.locked, false);
  }
});

const providerText = "Toshkent O‘zbekistonning poytaxti.";
const evidence = {
  query: providerText,
  sources: [{ id: "source-1", title: "Official information", url: "https://example.org/official", content: "Tashkent is the capital of Uzbekistan." }],
};

test("Tavily and Gemini stop oversized streaming responses with existing typed failures", async () => {
  for (const declaredLength of [undefined, "1", "999999"] ) {
    const tavilyBody = streamedBody([
      new Uint8Array(256_001), encoder.encode("unread"),
    ], declaredLength);
    const tavily = await requestTavilyEvidence({
      text: providerText, apiKey: "test-only-tavily-key",
      fetchImpl: async () => new Response(tavilyBody.body, { headers: tavilyBody.headers }),
    });
    assert.deepEqual(tavily, { ok: false, reason: "search-error" });
    assert.equal(tavilyBody.cancellations.length, 1);
    assert.equal(tavilyBody.reads(), declaredLength === "999999" ? 0 : 1);

    const geminiBody = streamedBody([
      new Uint8Array(128_001), encoder.encode("unread"),
    ], declaredLength);
    const gemini = await requestGeminiAssessment({
      text: providerText, apiKey: "test-only-gemini-key", model: DEFAULT_GEMINI_MODEL, evidence,
      fetchImpl: async () => new Response(geminiBody.body, { headers: geminiBody.headers }),
    });
    assert.deepEqual(gemini, { status: "unavailable", provider: "gemini", reason: "invalid-response" });
    assert.equal(geminiBody.cancellations.length, 1);
    assert.equal(geminiBody.reads(), declaredLength === "999999" ? 0 : 1);
  }
});

test("provider deadlines cancel a stalled body after successful response headers", async () => {
  for (const provider of ["tavily", "gemini"]) {
    const cancellations = [];
    const body = new ReadableStream({ cancel(reason) { cancellations.push(reason); } });
    const common = {
      text: providerText, apiKey: "test-only-key", timeoutMs: 10,
      fetchImpl: async () => new Response(body),
    };
    const result = provider === "tavily"
      ? await requestTavilyEvidence(common)
      : await requestGeminiAssessment({ ...common, model: DEFAULT_GEMINI_MODEL, evidence });
    assert.deepEqual(result, provider === "tavily"
      ? { ok: false, reason: "search-error" }
      : { status: "unavailable", provider: "gemini", reason: "timeout" });
    assert.equal(cancellations.length, 1);
    assert.equal(cancellations[0].name, "TimeoutError");
    assert.equal(body.locked, false);
  }
});
