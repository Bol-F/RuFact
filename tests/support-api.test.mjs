import assert from "node:assert/strict";
import test from "node:test";
import { getTranslations } from "../lib/i18n.ts";
import { supportCopy } from "../lib/support-copy.ts";

import { handleSupportStarsRequest } from "../lib/server/support-http.ts";
import { SupportError } from "../lib/server/support-core.ts";
import { rateLimitSupportRequest, rateLimitTelegramSupport } from "../lib/server/rate-limit.ts";

function request(body = { amount: 100, locale: "uz" }, headers = {}, method = "POST") {
  return new Request("https://rufact.example/api/support/stars", {
    method,
    headers: { origin: "https://rufact.example", "content-type": "application/json", ...headers },
    ...(method === "GET" ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}

function dependencies(overrides = {}) {
  const calls = [];
  return {
    calls,
    enabled: () => true,
    limit: async () => ({ allowed: true, configured: true, limit: 5, remaining: 4, reset: Date.now() + 60_000 }),
    createInvoice: async input => {
      calls.push(input);
      return { url: "https://t.me/$mock_invoice", privateReference: "never-send-this" };
    },
    ...overrides,
  };
}

test("existing i18n exposes complete non-empty Support translations in all three languages", () => {
  for (const locale of ["uz", "ru", "en"]) {
    const copy = getTranslations(locale).support;
    assert.deepEqual(copy, supportCopy[locale]);
    assert.deepEqual(Object.keys(copy).sort(), Object.keys(supportCopy.en).sort());
    assert.ok(Object.values(copy).every(value => typeof value === "string" && value.trim().length > 0));
  }
});

test("website invoice endpoint returns only a URL, no success or financial identifiers", async () => {
  for (const locale of ["uz", "ru", "en"]) {
    for (const amount of [50, 100, 250]) {
      const deps = dependencies();
      const response = await handleSupportStarsRequest(request({ amount, locale }), deps);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { url: "https://t.me/$mock_invoice" });
      assert.deepEqual(deps.calls, [{ amount, locale }]);
      assert.match(response.headers.get("cache-control"), /no-store/);
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    }
  }
});

test("disabled or missing configuration never calls the limiter or payment provider", async () => {
  const deps = dependencies({ enabled: () => false, limit: () => assert.fail("unexpected rate-limit call") });
  const response = await handleSupportStarsRequest(request(), deps);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "disabled" });
  assert.equal(deps.calls.length, 0);
});

test("only same-origin JSON POST requests can create invoices", async () => {
  for (const [source, status] of [
    [request(undefined, {}, "GET"), 405],
    [request(undefined, { origin: "https://other.example" }), 403],
    [request(undefined, { origin: "null" }), 403],
    [request(undefined, { "sec-fetch-site": "cross-site" }), 403],
    [request(undefined, { "sec-fetch-site": "same-site" }), 403],
    [request(undefined, { "content-type": "text/plain" }), 415],
  ]) {
    const deps = dependencies();
    const response = await handleSupportStarsRequest(source, deps);
    assert.equal(response.status, status);
    assert.equal(deps.calls.length, 0);
  }
  const missingOrigin = request();
  missingOrigin.headers.delete("origin");
  assert.equal((await handleSupportStarsRequest(missingOrigin, dependencies())).status, 403);
});

test("malformed amounts, locale, extra payment status, identity and arrays are rejected", async () => {
  for (const body of [
    "{", "", null, [], 50, { amount: 100 }, { locale: "en" },
    { amount: "50", locale: "en" }, { amount: 100.5, locale: "en" },
    { amount: -50, locale: "en" }, { amount: 0, locale: "en" },
    { amount: 500, locale: "en" }, { amount: 100, locale: "unknown" },
    { amount: 100, locale: "en", paid: true }, { amount: 100, locale: "en", telegramUserId: 42 },
    { amount: 100, locale: "en", currency: "XTR" },
  ]) {
    const deps = dependencies();
    assert.equal((await handleSupportStarsRequest(request(body), deps)).status, 400, JSON.stringify(body));
    assert.equal(deps.calls.length, 0);
  }
});

test("body limit applies to actual streamed bytes, forged length, and declared size", async () => {
  for (const headers of [{}, { "content-length": "1" }, { "content-length": "2000" }]) {
    const deps = dependencies();
    const response = await handleSupportStarsRequest(request(" ".repeat(1200), headers), deps);
    assert.equal(response.status, 413);
    assert.equal(deps.calls.length, 0);
  }
});

test("aborted requests cannot create invoices", async () => {
  const controller = new AbortController();
  controller.abort();
  const source = new Request(request(), { signal: controller.signal });
  const deps = dependencies();
  assert.equal((await handleSupportStarsRequest(source, deps)).status, 400);
  assert.equal(deps.calls.length, 0);
});

test("invoice limit exhaustion and protection failure are fail-closed", async () => {
  for (const configured of [true, false]) {
    const deps = dependencies({ limit: async () => ({ configured, allowed: false, limit: 5, remaining: 0, reset: Date.now() + 20_000 }) });
    const response = await handleSupportStarsRequest(request(), deps);
    assert.equal(response.status, configured ? 429 : 503);
    if (configured) assert.ok(Number(response.headers.get("retry-after")) > 0);
    assert.equal(deps.calls.length, 0);
  }
});

test("Redis, provider and disabled errors return sanitized messages", async () => {
  for (const error of [new Error("https://api.telegram.org/botSECRET/redis?payload=PRIVATE"), new SupportError("disabled")]) {
    const deps = dependencies({ createInvoice: async () => { throw error; } });
    const response = await handleSupportStarsRequest(request(), deps);
    assert.equal(response.status, 503);
    const text = await response.text();
    assert.doesNotMatch(text, /SECRET|PRIVATE|telegram.org|redis/);
  }
  const deps = dependencies({ limit: async () => { throw new Error("SECRET"); } });
  assert.deepEqual(await (await handleSupportStarsRequest(request(), deps)).json(), { error: "unavailable" });
});

test("unsafe invoice redirects never leave the server", async () => {
  for (const url of ["javascript:alert(1)", "https://t.me.evil.example/$x", "https://evil.example/$x", "https://t.me/$ok?redirect=evil", "https://user:secret@t.me/$x"]) {
    const response = await handleSupportStarsRequest(request(), dependencies({ createInvoice: async () => ({ url }) }));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "unavailable" });
  }
});

test("production invoice limits never fall back to local memory when Redis is missing", async () => {
  const keys = ["NODE_ENV", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "RATE_LIMIT_HASH_SECRET"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    process.env.NODE_ENV = "production";
    process.env.RATE_LIMIT_HASH_SECRET = "test-support-hmac-secret-at-least-32-characters";
    for (const result of [await rateLimitSupportRequest(request()), await rateLimitTelegramSupport("test-payer-hmac")]) {
      assert.equal(result.configured, false);
      assert.equal(result.allowed, false);
    }
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
