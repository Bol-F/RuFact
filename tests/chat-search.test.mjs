import assert from "node:assert/strict";
import test from "node:test";
import { requestChatEvidence } from "../lib/server/chat-search.ts";
import { requestAiChat } from "../lib/server/ai-chat-core.ts";

const TEST_KEY = "tvly-chat-test-only-key";
const preferredDomains = ["president.uz", "gov.uz", "lex.uz", "kun.uz", "daryo.uz"];
const globalSource = {
  title: "International source returned by search",
  url: "https://www.who.int/news-room/fact-sheets",
  content: "A relevant international source snippet for the question.",
};

test("Uzbek Latin and Cyrillic chat prefer local sources in one search without restricting the wider web", async () => {
  for (const question of ["Sog‘liq haqidagi bu da’vo to‘g‘rimi?", "Соғлиқ ҳақидаги бу даъво тўғрими?"]) {
    const calls = [];
    let generated = 0;
    const messages = [{ role: "user", content: question }];
    const result = await requestAiChat(messages, "uz", {
      search: (text, locale) => requestChatEvidence({
        text, locale, apiKey: TEST_KEY,
        fetchImpl: async (input, init) => {
          calls.push({ input: String(input), body: JSON.parse(init.body) });
          assert.equal(new Headers(init.headers).get("authorization"), `Bearer ${TEST_KEY}`);
          return Response.json({
            query: question,
            results: [
              { title: "Local news", url: "https://kun.uz/news/test", content: "Local reporting snippet." },
              globalSource,
              { ...globalSource, url: "javascript:alert(1)" },
              { ...globalSource, url: "https://user:pass@example.org/private" },
            ],
          });
        },
      }),
      generate: async (instructions, history) => {
        generated++;
        assert.deepEqual(history, messages);
        assert.ok(instructions.includes(globalSource.content));
        return "Manbalar solishtirildi [1] [2].";
      },
    });
    assert.equal(calls.length, 1, "Preference must not fan out into per-domain searches");
    assert.equal(calls[0].input, "https://api.tavily.com/search");
    assert.equal(calls[0].body.query, question, "Keep the user's script and question intact");
    assert.deepEqual(calls[0].body.include_domains, preferredDomains);
    assert.equal(calls[0].body.include_domains_mode, "prefer");
    assert.equal(calls[0].body.search_depth, "basic");
    assert.equal(calls[0].body.language, "uz");
    assert.equal(calls[0].body.filter_by_language, false);
    assert.equal("country" in calls[0].body, false);
    assert.equal("exclude_domains" in calls[0].body, false);
    assert.equal(generated, 1);
    assert.equal(result.status, "complete");
    assert.deepEqual(result.sources.map(source => source.url), ["https://kun.uz/news/test", globalSource.url]);
  }
});

test("RU and EN chat omit Uzbek ranking preferences and an unspecified locale uses the Uzbek default", async () => {
  for (const locale of ["ru", "en", undefined]) {
    let calls = 0;
    const result = await requestChatEvidence({
      text: "A factual question", locale, apiKey: TEST_KEY,
      fetchImpl: async (_input, init) => {
        calls++;
        const body = JSON.parse(init.body);
        assert.equal(body.language, locale ?? "uz");
        if (locale) {
          assert.equal("include_domains" in body, false);
          assert.equal("include_domains_mode" in body, false);
        } else {
          assert.deepEqual(body.include_domains, preferredDomains);
          assert.equal(body.include_domains_mode, "prefer");
        }
        return Response.json({ query: body.query, results: [globalSource] });
      },
    });
    assert.equal(result.ok, true);
    assert.equal(calls, 1);
  }
});

test("empty, exhausted and invalid preferred searches fail closed without another search or generation", async () => {
  for (const response of [
    () => Response.json({ query: "Savol", results: [] }),
    () => new Response("quota", { status: 429 }),
    () => new Response("quota", { status: 432 }),
    () => new Response("quota", { status: 433 }),
    () => new Response("upstream failure", { status: 500 }),
    () => new Response("not JSON"),
  ]) {
    let searched = 0;
    let generated = 0;
    const result = await requestAiChat([{ role: "user", content: "Yangilikdagi bu da’vo to‘g‘rimi?" }], "uz", {
      search: (text, locale) => requestChatEvidence({
        text, locale, apiKey: TEST_KEY,
        fetchImpl: async () => { searched++; return response(); },
      }),
      generate: async () => { generated++; return "Unsupported answer"; },
    });
    assert.deepEqual(result, { status: "unavailable", reason: "search-unavailable" });
    assert.equal(searched, 1);
    assert.equal(generated, 0);
  }
});

test("cancelling or timing out Uzbek search prevents answer generation", async () => {
  for (const cancellation of ["already-aborted", "during-request", "timeout"]) {
    const controller = new AbortController();
    if (cancellation === "already-aborted") controller.abort();
    let searched = 0;
    let sawAbort = false;
    let generated = 0;
    const result = await requestAiChat([{ role: "user", content: "Yangilikdagi bu da’vo to‘g‘rimi?" }], "uz", {
      search: (text, locale) => requestChatEvidence({
        text, locale, apiKey: TEST_KEY,
        signal: controller.signal,
        timeoutMs: cancellation === "timeout" ? 5 : 1000,
        fetchImpl: async (_input, init) => {
          searched++;
          return new Promise((_resolve, reject) => {
            const abort = () => {
              sawAbort = true;
              reject(init.signal.reason ?? new DOMException("Aborted", "AbortError"));
            };
            if (init.signal.aborted) abort();
            else {
              init.signal.addEventListener("abort", abort, { once: true });
              if (cancellation === "during-request") controller.abort();
            }
          });
        },
      }),
      generate: async () => { generated++; return "Unsupported answer"; },
    });
    assert.deepEqual(result, { status: "unavailable", reason: "search-unavailable" });
    assert.equal(searched, 1);
    assert.equal(sawAbort, true);
    assert.equal(generated, 0);
  }
});
