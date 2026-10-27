import assert from "node:assert/strict";
import test from "node:test";

import { requestTavilyEvidence } from "../lib/server/tavily-search.ts";

const TEST_KEY = "tvly-test-only-key";
const TEST_TEXT =
  "Учёные заявили, что горячая вода полностью очищает организм от токсинов.";

test("sends a server-authenticated Tavily request and validates sources", async () => {
  let capturedInput;
  let capturedInit;
  const result = await requestTavilyEvidence({
    text: TEST_TEXT,
    locale: "uz",
    apiKey: TEST_KEY,
    fetchImpl: async (input, init) => {
      capturedInput = input;
      capturedInit = init;
      return Response.json({
        query: TEST_TEXT,
        results: [
          {
            title: "Медицинский обзор",
            url: "https://example.org/medical-review",
            content: "Доказательств полного очищения организма горячей водой нет.",
            score: 0.91,
          },
          {
            title: "Небезопасная ссылка",
            url: "javascript:alert(1)",
            content: "Этот результат должен быть отброшен.",
          },
          {
            title: "URL с учётными данными",
            url: "https://user:password@example.org/private",
            content: "Этот результат также должен быть отброшен.",
          },
        ],
      });
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.evidence, {
    query: TEST_TEXT,
    sources: [
      {
        id: "source-1",
        title: "Медицинский обзор",
        url: "https://example.org/medical-review",
        content: "Доказательств полного очищения организма горячей водой нет.",
      },
    ],
  });

  const headers = new Headers(capturedInit.headers);
  const bodyText = String(capturedInit.body);
  const body = JSON.parse(bodyText);
  assert.equal(String(capturedInput), "https://api.tavily.com/search");
  assert.equal(headers.get("authorization"), `Bearer ${TEST_KEY}`);
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(bodyText.includes(TEST_KEY), false);
  assert.equal(body.search_depth, "basic");
  assert.equal(body.language, "uz");
  assert.equal(body.max_results, 6);
  assert.equal(body.include_raw_content, false);
  assert.equal(body.safe_search, true);
  assert.equal("include_domains" in body, false);
  assert.equal("include_domains_mode" in body, false);
});

test("empty preferred domains do not send an invalid domain mode", async () => {
  let body;
  await requestTavilyEvidence({
    text: TEST_TEXT,
    apiKey: TEST_KEY,
    preferredDomains: [],
    fetchImpl: async (_input, init) => {
      body = JSON.parse(init.body);
      return Response.json({ query: TEST_TEXT, results: [] });
    },
  });
  assert.equal("include_domains" in body, false);
  assert.equal("include_domains_mode" in body, false);
});

test("maps exhausted credits and empty results to typed failures", async () => {
  const rateLimited = await requestTavilyEvidence({
    text: TEST_TEXT,
    apiKey: TEST_KEY,
    fetchImpl: async () => new Response("quota", { status: 432 }),
  });
  const empty = await requestTavilyEvidence({
    text: TEST_TEXT,
    apiKey: TEST_KEY,
    fetchImpl: async () => Response.json({ query: TEST_TEXT, results: [] }),
  });

  assert.deepEqual(rateLimited, { ok: false, reason: "search-rate-limited" });
  assert.deepEqual(empty, { ok: false, reason: "no-search-results" });
});

test("aborts a slow Tavily request", async () => {
  let sawAbort = false;
  const result = await requestTavilyEvidence({
    text: TEST_TEXT,
    apiKey: TEST_KEY,
    timeoutMs: 5,
    fetchImpl: (_input, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener(
          "abort",
          () => {
            sawAbort = true;
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      }),
  });

  assert.equal(sawAbort, true);
  assert.deepEqual(result, { ok: false, reason: "search-error" });
});
