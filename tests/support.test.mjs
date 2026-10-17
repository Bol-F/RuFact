import assert from "node:assert/strict";
import test from "node:test";
import { STARS_AMOUNTS, STARS_MIN_AMOUNT, STARS_MAX_AMOUNT, isStarsAmount } from "../lib/support.ts";
import {
  createSupportService, createTelegramSupportProvider, safeSupportContactUrl, supportAvailabilityFromEnvironment,
  supportReference, supportBotId, supportPaymentCopy, SUPPORT_PAYLOAD_PREFIX, SUPPORT_PENDING_USABLE_MS,
  SUPPORT_PENDING_RETENTION_SECONDS, SUPPORT_RECEIPT_RETENTION_SECONDS, SUPPORT_THANKS_LEASE_MS,
} from "../lib/server/support-core.ts";
import {
  createRedisSupportStore, SUPPORT_APPROVE_SCRIPT, SUPPORT_PAYMENT_SCRIPT,
  SUPPORT_THANKED_SCRIPT, SUPPORT_RELEASE_THANKS_SCRIPT,
} from "../lib/server/support-store.ts";

const ref = "A".repeat(32);
const anotherRef = "B".repeat(32);
const payload = SUPPORT_PAYLOAD_PREFIX + ref;
const checkout = { queryId: "query-1", userId: 123, currency: "XTR", totalAmount: 100, invoicePayload: payload };
const payment = { chatId: 123, userId: 123, currency: "XTR", totalAmount: 100, invoicePayload: payload, telegramPaymentChargeId: "charge-1" };
const validEnv = {
  SUPPORT_STARS_ENABLED: "true", SUPPORT_WALLET_ENABLED: "true",
  TELEGRAM_BOT_TOKEN: "123456789:" + "mock_token_".repeat(4),
  TELEGRAM_WEBHOOK_SECRET: "safe_webhook_secret_".repeat(3),
  UPSTASH_REDIS_REST_URL: "https://test.upstash.io", UPSTASH_REDIS_REST_TOKEN: "test-token",
  RATE_LIMIT_HASH_SECRET: "x".repeat(32), SUPPORT_CONTACT_URL: "https://t.me/example_support",
};

/** Atomic Redis operations mocked locally. No real provider or financial transaction is used. */
function harness() {
  let now = 100_000;
  let enabled = true;
  let nextRef = ref;
  const records = new Map();
  const charges = new Map();
  const invoices = [];
  const answers = [];
  const thanks = [];
  const calls = [];
  const store = {
    create: async tx => { calls.push("create"); if (records.has(tx.id)) return false; records.set(tx.id, structuredClone(tx)); return true; },
    approve: async ({ id, amount, userId, queryId, now }) => {
      calls.push("approve");
      const tx = records.get(id);
      if (!tx) return { approved: false };
      if (tx.amount !== amount || tx.currency !== "XTR" || now >= tx.expiresAt || (tx.userId !== undefined && tx.userId !== String(userId))) return { approved: false, locale: tx.locale };
      if (tx.status === "approved") return { approved: tx.userId === String(userId) && tx.queryId === queryId, locale: tx.locale };
      if (tx.status !== "pending") return { approved: false, locale: tx.locale };
      Object.assign(tx, { status: "approved", userId: String(userId), queryId, approvedAt: now });
      return { approved: true, locale: tx.locale };
    },
    recordPayment: async ({ id, amount, userId, chargeId, now, thanksToken }) => {
      calls.push("recordPayment");
      const tx = records.get(id);
      if (!tx || tx.currency !== "XTR" || tx.amount !== amount || tx.userId !== String(userId) || tx.approvedAt === undefined ||
          (charges.has(chargeId) && charges.get(chargeId) !== id)) return { status: "invalid" };
      if (tx.status === "paid") {
        if (tx.telegramPaymentChargeId !== chargeId) return { status: "invalid" };
        if (tx.thankedAt !== undefined) return { status: "done" };
        if (tx.thanksLeaseUntil > now) return { status: "busy" };
      } else if (tx.status === "approved") {
        if (charges.has(chargeId)) return { status: "invalid" };
        charges.set(chargeId, id);
        Object.assign(tx, { status: "paid", paidAt: now, telegramPaymentChargeId: chargeId });
        delete tx.queryId;
      } else return { status: "invalid" };
      Object.assign(tx, { thanksLeaseToken: thanksToken, thanksLeaseUntil: now + SUPPORT_THANKS_LEASE_MS });
      return { status: "send", transaction: structuredClone(tx) };
    },
    completeThanks: async (id, token, at) => {
      calls.push("completeThanks"); const tx = records.get(id);
      if (tx?.status !== "paid" || tx.thanksLeaseToken !== token) return false;
      tx.thankedAt = at; delete tx.thanksLeaseToken; delete tx.thanksLeaseUntil; return true;
    },
    releaseThanks: async (id, token) => {
      const tx = records.get(id);
      if (tx?.thanksLeaseToken === token) { delete tx.thanksLeaseToken; delete tx.thanksLeaseUntil; }
    },
  };
  const provider = {
    createInvoice: async input => { calls.push("providerInvoice"); invoices.push(input); return "https://t.me/$invoice_123"; },
    answerPreCheckout: async (id, approved, error) => { calls.push("answer"); answers.push({ id, approved, error }); },
    thank: async (chatId, text) => { thanks.push({ chatId, text }); },
  };
  const service = (overrides = {}) => createSupportService({ enabled, store, provider, now: () => now, randomReference: () => nextRef, ...overrides });
  return { service, store, provider, records, charges, invoices, answers, thanks, calls,
    advance: ms => { now += ms; }, disable: () => { enabled = false; }, setRef: value => { nextRef = value; } };
}

async function approvedHarness(locale = "en") {
  const h = harness();
  await h.service().createStarsInvoice({ amount: 100, locale });
  await h.service().handleStarsPreCheckout(checkout);
  return h;
}

test("Stars presets are 5/10/25 and custom amounts require bounded safe integer numbers", () => {
  assert.deepEqual(STARS_AMOUNTS, [5, 10, 25]);
  assert.equal(STARS_MIN_AMOUNT, 1);
  assert.equal(STARS_MAX_AMOUNT, 10_000);
  for (const amount of [...STARS_AMOUNTS, STARS_MIN_AMOUNT, 7, 49, 50, 100, 250, 500, STARS_MAX_AMOUNT]) {
    assert.equal(isStarsAmount(amount), true, String(amount));
  }
  for (const bad of [0, -0, -1, -50, 1.1, 50.5, STARS_MAX_AMOUNT + 1, Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER + 1, "5", "15", "1e2", "", true, false, null, undefined, Infinity, -Infinity, NaN, {}, [], 1n]) {
    assert.equal(isStarsAmount(bad), false, String(bad));
  }
});

test("custom amounts and existing 50/100/250 invoices preserve exact amount binding and idempotent receipts", async () => {
  for (const amount of [STARS_MIN_AMOUNT, 7, 15, 50, 100, 250, STARS_MAX_AMOUNT]) {
    const h = harness();
    const service = h.service();
    await service.createStarsInvoice({ amount, locale: "en", telegramUserId: 123 });
    assert.equal(h.invoices[0].amount, amount);
    assert.equal(h.records.get(ref).amount, amount);
    const event = { ...checkout, totalAmount: amount };
    const wrongAmount = amount === STARS_MAX_AMOUNT ? amount - 1 : amount + 1;
    await service.handleStarsPreCheckout({ ...event, totalAmount: wrongAmount });
    assert.equal(h.answers.at(-1).approved, false);
    assert.equal(h.records.get(ref).status, "pending");
    await service.handleStarsPreCheckout(event);
    await service.handleStarsPreCheckout(event);
    assert.equal(h.answers.at(-1).approved, true);
    const paid = { ...payment, totalAmount: amount };
    await assert.rejects(service.handleStarsSuccessfulPayment({ ...paid, totalAmount: wrongAmount }), error => error.code === "invalid-payment");
    assert.equal(h.charges.size, 0);
    assert.equal(h.thanks.length, 0);
    await service.handleStarsSuccessfulPayment(paid);
    await service.handleStarsSuccessfulPayment(paid);
    assert.equal(h.records.get(ref).status, "paid");
    assert.equal(h.records.get(ref).amount, amount);
    assert.equal(h.charges.size, 1);
    assert.equal(h.thanks.length, 1);
    assert.equal(h.thanks[0].text, supportPaymentCopy.en.thanks(amount));
  }
});

test("invalid custom amounts cannot create a pending record or contact the invoice provider", async () => {
  for (const amount of [0, -1, 0.5, 15.5, STARS_MAX_AMOUNT + 1, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, -Infinity, "15", null, true]) {
    const h = harness();
    await assert.rejects(h.service().createStarsInvoice({ amount, locale: "en" }), error => error.code === "invalid-input");
    assert.deepEqual(h.calls, []);
    assert.equal(h.records.size, 0);
    assert.equal(h.invoices.length, 0);
  }
});

test("invalid custom payment amounts cannot reach ledger transitions or send a thank-you", async () => {
  for (const totalAmount of [0, -1, 15.5, STARS_MAX_AMOUNT + 1, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, "15", null]) {
    const h = harness();
    await h.service().handleStarsPreCheckout({ ...checkout, totalAmount });
    assert.deepEqual(h.calls, ["answer"]);
    assert.equal(h.answers[0].approved, false);
    await assert.rejects(h.service().handleStarsSuccessfulPayment({ ...payment, totalAmount }), error => error.code === "invalid-payment");
    assert.deepEqual(h.calls, ["answer"]);
    assert.equal(h.charges.size, 0);
    assert.equal(h.thanks.length, 0);
  }
});

test("payments are disabled by default, missing config fails closed, and Wallet cannot be activated by its flag", () => {
  assert.deepEqual(supportAvailabilityFromEnvironment({}), { starsEnabled: false, walletEnabled: false, contactUrl: null });
  assert.deepEqual(supportAvailabilityFromEnvironment(validEnv), { starsEnabled: true, walletEnabled: false, contactUrl: validEnv.SUPPORT_CONTACT_URL });
  for (const key of ["SUPPORT_STARS_ENABLED", "TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "RATE_LIMIT_HASH_SECRET", "SUPPORT_CONTACT_URL"]) {
    assert.equal(supportAvailabilityFromEnvironment({ ...validEnv, [key]: undefined }).starsEnabled, false, key);
  }
  for (const value of ["false", "TRUE", "1", "true "]) assert.equal(supportAvailabilityFromEnvironment({ ...validEnv, SUPPORT_STARS_ENABLED: value }).starsEnabled, false);
  assert.equal(supportAvailabilityFromEnvironment({ ...validEnv, RATE_LIMIT_HASH_SECRET: "short" }).starsEnabled, false);
  assert.equal(supportAvailabilityFromEnvironment({ ...validEnv, UPSTASH_REDIS_REST_URL: "http://localhost" }).starsEnabled, false);
  for (const value of ["short", "a".repeat(257), "safe-secret-with-unsupported!characters"]) {
    assert.equal(supportAvailabilityFromEnvironment({ ...validEnv, TELEGRAM_WEBHOOK_SECRET: value }).starsEnabled, false);
  }
  for (const bad of ["00000:" + "mock_token_".repeat(4), "4503599627370496:" + "mock_token_".repeat(4), "12345:short"]) {
    assert.equal(supportBotId(bad), null);
    assert.equal(supportAvailabilityFromEnvironment({ ...validEnv, TELEGRAM_BOT_TOKEN: bad }).starsEnabled, false);
  }
  assert.equal(supportBotId(validEnv.TELEGRAM_BOT_TOKEN), "123456789");
  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, ...rest } = validEnv;
  assert.equal(supportAvailabilityFromEnvironment({ ...rest, KV_REST_API_URL: UPSTASH_REDIS_REST_URL, KV_REST_API_TOKEN: UPSTASH_REDIS_REST_TOKEN }).starsEnabled, true);
});

test("payment contact rejects executable, local, credential-bearing and malformed URLs", () => {
  for (const bad of ["javascript:alert(1)", "http://example.org", "https://localhost/pay", "https://127.0.0.1/pay", "https://[::1]/", "https://private.local/", "https://user:secret@example.org/", "https://example.org:8080/", "https://example.org/\n", "https://example.org\\evil", "https://example..org/", "https://./", "https://.example/", "https://-invalid.example/", "https://invalid-.example/"]) {
    assert.equal(safeSupportContactUrl(bad), null, bad);
  }
  assert.equal(safeSupportContactUrl("https://github.com/Bol-F/RuFact/issues"), "https://github.com/Bol-F/RuFact/issues");
});

test("each language creates a pending record before provider invocation and exposes only the invoice URL", async () => {
  for (const locale of ["uz", "ru", "en"]) {
    const h = harness();
    const result = await h.service().createStarsInvoice({ amount: 100, locale, telegramUserId: 123 });
    assert.deepEqual(result, { url: "https://t.me/$invoice_123" });
    assert.deepEqual(h.calls, ["create", "providerInvoice"]);
    assert.equal(h.records.get(ref).status, "pending");
    assert.equal(h.records.get(ref).userId, "123");
    assert.equal(h.records.get(ref).expiresAt - h.records.get(ref).createdAt, SUPPORT_PENDING_USABLE_MS);
    assert.equal(h.invoices[0].payload, payload);
    assert.equal(h.invoices[0].description, supportPaymentCopy[locale].description);
  }
});

test("invoice validation prevents invalid amounts, locales, identities and predictable or colliding references", async () => {
  const h = harness();
  for (const input of [{ amount: "100", locale: "en" }, { amount: 100, locale: "es" }, { amount: 50.1, locale: "en" }, { amount: 100, locale: "en", telegramUserId: -123 }]) {
    await assert.rejects(h.service().createStarsInvoice(input), error => error.code === "invalid-input");
  }
  assert.equal(h.invoices.length, 0);
  h.setRef("short");
  await assert.rejects(h.service().createStarsInvoice({ amount: 50, locale: "en" }), error => error.code === "unavailable");
  h.setRef(ref);
  await h.service().createStarsInvoice({ amount: 50, locale: "en" });
  await assert.rejects(h.service().createStarsInvoice({ amount: 50, locale: "en" }), error => error.code === "unavailable");
  assert.equal(h.invoices.length, 1);
  assert.equal(supportReference(payload), ref);
  for (const bad of [ref, payload + "!", SUPPORT_PAYLOAD_PREFIX + "short", null]) assert.equal(supportReference(bad), null);
});

test("disabled or Redis-unavailable invoice creation does not call Telegram; failures never leak upstream secrets", async () => {
  const h = harness();
  for (const overrides of [{ enabled: false }, { store: null }]) await assert.rejects(h.service(overrides).createStarsInvoice({ amount: 100, locale: "en" }), error => error.code === "disabled");
  h.store.create = async () => { throw new Error("Redis URL secret-token command sensitive-identifier"); };
  await assert.rejects(h.service().createStarsInvoice({ amount: 100, locale: "en" }), error => error.code === "unavailable" && !/secret|Redis/u.test(error.message));
  assert.equal(h.invoices.length, 0);
});

test("provider errors and non-Telegram invoice URLs are rejected without a public payment success", async () => {
  for (const result of ["https://evil.example/$invoice", "javascript:alert(1)", "https://t.me/user", "https://user:pass@t.me/$invoice", "https://t.me/$invoice?redirect=evil"]) {
    const h = harness(); h.provider.createInvoice = async () => result;
    await assert.rejects(h.service().createStarsInvoice({ amount: 100, locale: "en" }), error => error.code === "unavailable");
    assert.equal(h.records.get(ref).status, "pending");
  }
});

test("precheckout atomically reserves one payer and query, duplicate same query is idempotent", async () => {
  const h = harness();
  await h.service().createStarsInvoice({ amount: 100, locale: "ru" });
  await Promise.all([h.service().handleStarsPreCheckout(checkout), h.service().handleStarsPreCheckout({ ...checkout, userId: 456, queryId: "query-2" })]);
  assert.equal(h.answers.filter(answer => answer.approved).length, 1);
  assert.equal(h.records.get(ref).userId, "123");
  await h.service().handleStarsPreCheckout(checkout);
  assert.equal(h.answers.at(-1).approved, true);
  await h.service().handleStarsPreCheckout({ ...checkout, queryId: "query-3" });
  assert.equal(h.answers.at(-1).approved, false);
  assert.equal(h.answers.at(-1).error, supportPaymentCopy.ru.checkoutError);
});

test("wrong currency, amount, payload, payer, expiration, disabled config or Redis failure rejects precheckout", async () => {
  for (const patch of [{ currency: "USD" }, { totalAmount: 50 }, { totalAmount: 100.1 }, { invoicePayload: "forged" }, { userId: 456 }]) {
    const h = harness();
    await h.service().createStarsInvoice({ amount: 100, locale: "en", telegramUserId: 123 });
    await h.service().handleStarsPreCheckout({ ...checkout, ...patch });
    assert.equal(h.answers.at(-1).approved, false, JSON.stringify(patch));
    assert.equal(h.records.get(ref).status, "pending");
  }
  const h = harness(); await h.service().createStarsInvoice({ amount: 100, locale: "en" });
  h.advance(SUPPORT_PENDING_USABLE_MS);
  await h.service().handleStarsPreCheckout(checkout);
  assert.equal(h.answers.at(-1).approved, false);
  assert.equal(h.answers.at(-1).error, supportPaymentCopy.en.checkoutError);
  await h.service({ enabled: false }).handleStarsPreCheckout(checkout);
  assert.equal(h.answers.at(-1).approved, false);
  h.store.approve = async () => { throw new Error("secret"); };
  await h.service().handleStarsPreCheckout(checkout);
  assert.equal(h.answers.at(-1).approved, false);
  await assert.rejects(h.service().handleStarsPreCheckout({ ...checkout, queryId: "" }), error => error.code === "invalid-input");
  await h.service({ enabled: false }).handleStarsPreCheckout({ ...checkout, languageCode: "ru-RU" });
  assert.equal(h.answers.at(-1).error, supportPaymentCopy.ru.checkoutError);
});

test("successful payment requires a prior approval and verified payer, currency, expected amount and charge", async () => {
  for (const patch of [{ currency: "USD" }, { totalAmount: 50 }, { totalAmount: 100.1 }, { userId: 456, chatId: 456 }, { chatId: -1 }, { invoicePayload: "forged" }, { telegramPaymentChargeId: "" }]) {
    const h = await approvedHarness();
    await assert.rejects(h.service().handleStarsSuccessfulPayment({ ...payment, ...patch }), error => error.code === "invalid-payment");
    assert.equal(h.thanks.length, 0);
    assert.equal(h.charges.size, 0);
  }
  const h = harness(); await h.service().createStarsInvoice({ amount: 100, locale: "en" });
  await assert.rejects(h.service().handleStarsSuccessfulPayment(payment), error => error.code === "invalid-payment");
  assert.equal(h.records.get(ref).status, "pending");
});

test("all 52 bits of a Telegram payer ID survive the Redis JSON/Lua boundary as decimal text", async () => {
  const userId = 2 ** 52 - 1;
  for (const fromWebsite of [true, false]) {
    const h = harness();
    await h.service().createStarsInvoice({ amount: 100, locale: "en", ...(fromWebsite ? {} : { telegramUserId: userId }) });
    await h.service().handleStarsPreCheckout({ ...checkout, userId });
    assert.equal(h.answers.at(-1).approved, true);
    // Redis cjson numbers would lose precision here; identifiers are JSON strings instead.
    const roundTripped = JSON.parse(JSON.stringify(h.records.get(ref)));
    assert.equal(roundTripped.userId, "4503599627370495");
    h.records.set(ref, roundTripped);
    await h.service().handleStarsSuccessfulPayment({ ...payment, userId, chatId: userId });
    assert.equal(h.records.get(ref).status, "paid");
    assert.equal(h.thanks[0].chatId, userId);
  }
});

test("one confirmed receipt, localized thanks and duplicate webhook deliveries are idempotent", async () => {
  for (const locale of ["uz", "ru", "en"]) {
    const h = await approvedHarness(locale);
    await h.service().handleStarsSuccessfulPayment(payment);
    await h.service().handleStarsSuccessfulPayment(payment);
    assert.equal(h.records.get(ref).status, "paid");
    assert.equal(h.charges.size, 1);
    assert.equal(h.thanks.length, 1);
    assert.equal(h.thanks[0].text, supportPaymentCopy[locale].thanks(100));
    assert.equal(h.thanks[0].chatId, 123);
    assert.equal(h.records.get(ref).queryId, undefined);
    await assert.rejects(h.service().handleStarsSuccessfulPayment({ ...payment, telegramPaymentChargeId: "charge-2" }), error => error.code === "invalid-payment");
  }
});

test("approved delayed success is recorded even after the flag is disabled or invoice usability expires", async () => {
  const h = await approvedHarness();
  h.advance(20 * 24 * 60 * 60 * 1000); h.disable();
  await h.service().handleStarsSuccessfulPayment(payment);
  assert.equal(h.records.get(ref).status, "paid");
  assert.equal(h.thanks.length, 1);
});

test("a Telegram charge cannot be replayed against another legitimate invoice", async () => {
  const h = await approvedHarness();
  await h.service().handleStarsSuccessfulPayment(payment);
  h.setRef(anotherRef);
  await h.service().createStarsInvoice({ amount: 100, locale: "en" });
  const secondPayload = SUPPORT_PAYLOAD_PREFIX + anotherRef;
  await h.service().handleStarsPreCheckout({ ...checkout, invoicePayload: secondPayload, queryId: "second" });
  await assert.rejects(h.service().handleStarsSuccessfulPayment({ ...payment, invoicePayload: secondPayload }), error => error.code === "invalid-payment");
  assert.equal(h.records.get(anotherRef).status, "approved");
  assert.equal(h.charges.size, 1);
});

test("concurrent success deliveries cannot record duplicate payments or concurrently thank twice", async () => {
  const h = await approvedHarness();
  let unblock; const blocked = new Promise(resolve => { unblock = resolve; });
  h.provider.thank = async () => { h.thanks.push({}); await blocked; };
  const first = h.service().handleStarsSuccessfulPayment(payment);
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(h.service().handleStarsSuccessfulPayment(payment), error => error.code === "unavailable");
  assert.equal(h.charges.size, 1); assert.equal(h.thanks.length, 1);
  unblock(); await first;
  await h.service().handleStarsSuccessfulPayment(payment);
  assert.equal(h.thanks.length, 1);
});

test("failed thank-you delivery is retryable without charging or recording again; stale leases expire", async () => {
  const h = await approvedHarness();
  h.provider.thank = async () => { throw new Error("secret-url"); };
  await assert.rejects(h.service().handleStarsSuccessfulPayment(payment), error => error.code === "unavailable" && !error.message.includes("secret"));
  assert.equal(h.records.get(ref).status, "paid"); assert.equal(h.charges.size, 1);
  h.provider.thank = async (_chat, text) => { h.thanks.push(text); };
  h.records.get(ref).thanksLeaseUntil = 140_000;
  await assert.rejects(h.service().handleStarsSuccessfulPayment(payment), error => error.code === "unavailable");
  h.advance(40_001);
  await h.service().handleStarsSuccessfulPayment(payment);
  assert.equal(h.thanks.length, 1); assert.equal(h.charges.size, 1);
});

test("Redis failure during successful payment fails closed and requests webhook retry", async () => {
  const h = await approvedHarness();
  h.store.recordPayment = async () => { throw new Error("Redis command with payment metadata"); };
  await assert.rejects(h.service().handleStarsSuccessfulPayment(payment), error => error.code === "unavailable" && !error.message.includes("Redis"));
  await assert.rejects(h.service({ store: null }).handleStarsSuccessfulPayment(payment), error => error.code === "unavailable");
  assert.equal(h.thanks.length, 0); assert.equal(h.charges.size, 0);
});

test("HTTP provider uses legitimate XTR, empty provider token, a single price and no recurring payments", async () => {
  const requests = [];
  const provider = createTelegramSupportProvider(validEnv.TELEGRAM_BOT_TOKEN, async (url, options) => {
    requests.push({ url, options, body: JSON.parse(options.body) });
    return Response.json({ ok: true, result: url.endsWith("createInvoiceLink") ? "https://t.me/$invoice" : url.endsWith("sendMessage") ? { message_id: 1, chat: { id: 123 } } : true });
  });
  await provider.createInvoice({ title: "Support RuFact", description: "Voluntary support", payload, amount: 100 });
  await provider.answerPreCheckout("query", true);
  await provider.answerPreCheckout("query", false, "Please create a new invoice.");
  await provider.thank(123, "Thank you");
  assert.deepEqual(requests[0].body, { title: "Support RuFact", description: "Voluntary support", payload, provider_token: "", currency: "XTR", prices: [{ label: "Support RuFact", amount: 100 }] });
  assert.deepEqual(requests[1].body, { pre_checkout_query_id: "query", ok: true });
  assert.deepEqual(requests[2].body, { pre_checkout_query_id: "query", ok: false, error_message: "Please create a new invoice." });
  for (const request of requests) {
    assert.equal(request.options.cache, "no-store"); assert.equal(request.options.redirect, "error");
    assert.ok(request.options.signal instanceof AbortSignal);
  }
});

test("HTTP transport redacts errors, rejects non-ok and oversized responses, and never retries", async () => {
  for (const response of [new Response("secret-provider-error", { status: 500 }), Response.json({ ok: false, description: "secret" }), Response.json({ ok: true }), new Response("x".repeat(16_385))]) {
    let calls = 0;
    const provider = createTelegramSupportProvider(validEnv.TELEGRAM_BOT_TOKEN, async () => { calls++; return response; });
    await assert.rejects(provider.answerPreCheckout("query", true), error => error.code === "unavailable" && !/secret|https/u.test(error.message));
    assert.equal(calls, 1);
  }
  const provider = createTelegramSupportProvider(null, async () => { throw new Error("must not call"); });
  await assert.rejects(provider.answerPreCheckout("query", false), error => error.code === "unavailable");
  const malformedThanks = createTelegramSupportProvider(validEnv.TELEGRAM_BOT_TOKEN, async () => Response.json({ ok: true, result: false }));
  await assert.rejects(malformedThanks.thank(123, "thanks"), error => error.code === "unavailable");
});

test("Redis adapter uses NX pending creation, one atomic transition, bounded retention and hashed unique charge keys", async () => {
  const h = await approvedHarness(); const tx = h.records.get(ref);
  const operations = [];
  let returnValue = { approved: true, locale: "en" };
  const redis = {
    set: async (...args) => { operations.push({ method: "set", args }); return "OK"; },
    eval: async (...args) => { operations.push({ method: "eval", args }); return returnValue; },
  };
  const store = createRedisSupportStore(redis, "rufact:support:testbot:");
  await store.create(tx);
  assert.deepEqual(operations[0].args[2], { nx: true, ex: SUPPORT_PENDING_RETENTION_SECONDS });
  await store.approve({ id: ref, amount: 100, userId: 123, queryId: "query", now: 100_000 });
  assert.equal(operations[1].args[0], SUPPORT_APPROVE_SCRIPT);
  assert.equal(operations[1].args[2][2], "123");
  assert.equal(operations[1].args[2].at(-1), SUPPORT_RECEIPT_RETENTION_SECONDS);
  returnValue = { status: "done" };
  await store.recordPayment({ id: ref, amount: 100, userId: 123, chargeId: "private-charge-id", now: 100_000, thanksToken: ref });
  assert.equal(operations[2].args[0], SUPPORT_PAYMENT_SCRIPT);
  assert.equal(operations[2].args[2][2], "123");
  assert.equal(operations[2].args[1].length, 2);
  assert.match(operations[2].args[1][1], /:charge:[a-f0-9]{64}$/u);
  assert.doesNotMatch(operations[2].args[1][1], /private-charge-id/u);
  assert.equal(operations[2].args[2][6], SUPPORT_RECEIPT_RETENTION_SECONDS);
  returnValue = 1;
  assert.equal(await store.completeThanks(ref, ref, 100_001), true);
  assert.equal(operations[3].args[0], SUPPORT_THANKED_SCRIPT);
  await store.releaseThanks(ref, ref);
  assert.equal(operations[4].args[0], SUPPORT_RELEASE_THANKS_SCRIPT);
  // The Lua script enforces payer/query/amount and charge replay checks within the same Redis turn.
  assert.match(SUPPORT_APPROVE_SCRIPT, /tx\.queryId == ARGV\[4\]/u);
  assert.match(SUPPORT_APPROVE_SCRIPT, /now >= tx\.expiresAt/u);
  assert.match(SUPPORT_PAYMENT_SCRIPT, /previous ~= ARGV\[1\]/u);
  assert.match(SUPPORT_PAYMENT_SCRIPT, /tx\.telegramPaymentChargeId ~= ARGV\[4\]/u);
  assert.doesNotMatch(SUPPORT_APPROVE_SCRIPT + SUPPORT_PAYMENT_SCRIPT, /tonumber\(ARGV\[3\]\)/u);
  assert.match(SUPPORT_THANKED_SCRIPT, /KEEPTTL/u);
});

test("Redis adapter rejects malformed transition results rather than treating errors as successful payments", async () => {
  const redis = { set: async () => "OK", eval: async () => ({ unexpected: "secret" }) };
  const store = createRedisSupportStore(redis, "test:");
  await assert.rejects(store.approve({ id: ref, amount: 100, userId: 123, queryId: "query", now: 1 }), /invalid result/u);
  await assert.rejects(store.recordPayment({ id: ref, amount: 100, userId: 123, chargeId: "charge", now: 1, thanksToken: ref }), /invalid result/u);
});
