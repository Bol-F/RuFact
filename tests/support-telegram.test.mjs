import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { handleTelegramMessage, handleTelegramPaymentUpdate, parseTelegramPaymentUpdate, parseTelegramUpdate } from "../lib/server/telegram-core.ts";
import { telegramButtonCommand, telegramKeyboard, telegramSupportCopy } from "../lib/server/telegram-ui.ts";
import { createSupportService, createTelegramSupportProvider, supportPaymentCopy } from "../lib/server/support-core.ts";
import { telegramCommandRegistrations } from "../scripts/telegram-commands.mjs";
import { STARS_AMOUNTS, STARS_MIN_AMOUNT, STARS_MAX_AMOUNT } from "../lib/support.ts";

const incoming = { updateId: 1, chatId: 123, messageId: 42, text: "/donate", language: "uz" };
const ordinary = { update_id: 1, message: { message_id: 42, chat: { id: 123, type: "private" }, from: { id: 123, is_bot: false }, text: "A claim" } };
const checkout = { update_id: 2, pre_checkout_query: { id: "checkout-1", from: { id: 123, is_bot: false }, currency: "XTR", total_amount: 50, invoice_payload: "rufact:v1:test" } };
const successful = { update_id: 3, message: { ...ordinary.message, text: undefined, successful_payment: { currency: "XTR", total_amount: 50, invoice_payload: "rufact:v1:test", telegram_payment_charge_id: "telegram-charge-1", provider_payment_charge_id: "" } } };

function harness() {
  const values = new Map();
  const sent = [];
  const invoices = [];
  const limits = [];
  const invoiceLimits = [];
  const deps = {
    store: {
      get: async key => values.get(key) ?? null,
      getMany: async keys => keys.map(key => values.get(key) ?? null),
      set: async (key, value) => { values.set(key, value); },
      setMany: async entries => { for (const { key, value } of entries) values.set(key, value); },
      remove: async key => { values.delete(key); },
      removeMany: async keys => { for (const key of keys) values.delete(key); },
      claim: async (key, token) => { if (values.has(key)) return false; values.set(key, token); return true; },
      release: async (key, token) => { if (values.get(key) === token) values.delete(key); },
    },
    userKey: id => `hashed-${id}`,
    lockToken: () => "lease-owner",
    limit: async (identifier, internet) => { limits.push({ identifier, internet }); return { allowed: true, configured: true }; },
    assess: async () => { throw new Error("Support must not call fact-checking"); },
    chat: async () => { throw new Error("Support must not call AI chat"); },
    send: async (message, text, locale, chatMode) => { sent.push({ message, text, locale, chatMode }); },
    support: {
      starsEnabled: true,
      contactUrl: "https://t.me/example_owner",
      limit: async identifier => { invoiceLimits.push(identifier); return { allowed: true, configured: true }; },
      createInvoice: async input => { invoices.push(input); return { url: "https://t.me/$test_invoice_1" }; },
    },
  };
  return { deps, values, sent, invoices, limits, invoiceLimits };
}

test("payment parser discriminates private confirmations and checkout without ordinary chat fallback", async () => {
  assert.equal(parseTelegramPaymentUpdate(ordinary), null);
  assert.equal(parseTelegramPaymentUpdate(checkout).kind, "pre_checkout");
  assert.equal(parseTelegramPaymentUpdate(successful).kind, "successful_payment");
  assert.equal(parseTelegramUpdate(checkout), null);
  assert.equal(parseTelegramUpdate(successful), null);
  const calls = [];
  const handlers = { preCheckout: async event => calls.push(["checkout", event]), successfulPayment: async event => calls.push(["success", event]) };
  await handleTelegramPaymentUpdate(parseTelegramPaymentUpdate(checkout), handlers);
  await handleTelegramPaymentUpdate(parseTelegramPaymentUpdate(successful), handlers);
  assert.deepEqual(calls[0], ["checkout", { queryId: "checkout-1", userId: 123, currency: "XTR", totalAmount: 50, invoicePayload: "rufact:v1:test" }]);
  assert.deepEqual(calls[1], ["success", { chatId: 123, userId: 123, currency: "XTR", totalAmount: 50, invoicePayload: "rufact:v1:test", telegramPaymentChargeId: "telegram-charge-1", providerPaymentChargeId: "" }]);
});

test("invalid payment service messages, bots, groups, edits and ambiguous envelopes are harmless", async () => {
  const cases = [
    { ...successful, message: { ...successful.message, successful_payment: null } },
    { ...successful, message: { ...successful.message, successful_payment: {} } },
    { ...successful, message: { ...successful.message, successful_payment: { ...successful.message.successful_payment, total_amount: "50" } } },
    { ...successful, message: { ...successful.message, successful_payment: { ...successful.message.successful_payment, telegram_payment_charge_id: "x".repeat(257) } } },
    { ...successful, message: { ...successful.message, successful_payment: { ...successful.message.successful_payment, is_recurring: true } } },
    { ...successful, message: { ...successful.message, from: { id: 123, is_bot: true } } },
    { ...successful, message: { ...successful.message, from: { id: 999, is_bot: false } } },
    { ...successful, message: { ...successful.message, chat: { id: 123, type: "group" } } },
    { update_id: 3, edited_message: successful.message },
    { ...checkout, message: ordinary.message },
    { ...checkout, callback_query: { id: "unrelated" } },
    { ...successful, edited_message: ordinary.message },
    { ...checkout, pre_checkout_query: { ...checkout.pre_checkout_query, from: { id: 123, is_bot: true } } },
  ];
  for (const update of cases) {
    const parsed = parseTelegramPaymentUpdate(update);
    assert.equal(parsed.kind, "ignored_payment");
    assert.equal(parseTelegramUpdate(update), null);
    await handleTelegramPaymentUpdate(parsed, { preCheckout: async () => assert.fail(), successfulPayment: async () => assert.fail() });
  }
});

test("checkout financial mismatches reach the payment validator for an explicit refusal", () => {
  for (const overrides of [{ currency: "USD" }, { total_amount: 51 }, { invoice_payload: "untrusted" }]) {
    const event = parseTelegramPaymentUpdate({ ...checkout, pre_checkout_query: { ...checkout.pre_checkout_query, ...overrides } });
    assert.equal(event.kind, "pre_checkout");
  }
  const malformed = parseTelegramPaymentUpdate({ ...checkout, pre_checkout_query: { ...checkout.pre_checkout_query, currency: [], total_amount: "50", invoice_payload: "a".repeat(129) } });
  assert.deepEqual(malformed.event, { queryId: "checkout-1", userId: 123, currency: "", totalAmount: -1, invoicePayload: "" });
});

test("checkout forwards bounded language preferences even when financial fields need refusal", () => {
  for (const languageCode of ["ru", "en", "ru-RU", "en-GB", "uz-Cyrl"]) {
    const parsed = parseTelegramPaymentUpdate({ ...checkout, pre_checkout_query: {
      ...checkout.pre_checkout_query,
      from: { ...checkout.pre_checkout_query.from, language_code: languageCode },
      currency: [], total_amount: "50", invoice_payload: null,
    } });
    assert.equal(parsed.kind, "pre_checkout");
    assert.deepEqual(parsed.event, { queryId: "checkout-1", userId: 123, languageCode, currency: "", totalAmount: -1, invoicePayload: "" });
  }
  for (const invalid of ["en".repeat(17), "en\n", "<b>ru</b>", "en US", null, 42, []]) {
    const parsed = parseTelegramPaymentUpdate({ ...checkout, pre_checkout_query: {
      ...checkout.pre_checkout_query, from: { ...checkout.pre_checkout_query.from, language_code: invalid },
    } });
    assert.equal(parsed.kind, "pre_checkout");
    assert.equal(Object.hasOwn(parsed.event, "languageCode"), false);
  }
});

test("parsed checkout reaches the real HTTP adapter with a localised refusal and no AI or storage calls", async () => {
  const token = ["123456789", "mock_token_never_for_real_payments"].join(":");
  for (const [languageCode, locale] of [["ru-RU", "ru"], ["en-GB", "en"], ["uz-Cyrl", "uz"]]) {
    const requests = [];
    const provider = createTelegramSupportProvider(token, async (url, options) => {
      requests.push({ url, options, body: JSON.parse(options.body) });
      return Response.json({ ok: true, result: true });
    });
    const service = createSupportService({ enabled: false, store: null, provider, now: () => 100_000, randomReference: () => assert.fail("No transaction should be created") });
    const parsed = parseTelegramPaymentUpdate({ ...checkout, pre_checkout_query: {
      ...checkout.pre_checkout_query,
      from: { ...checkout.pre_checkout_query.from, language_code: languageCode },
      total_amount: "invalid", invoice_payload: null,
    } });
    await handleTelegramPaymentUpdate(parsed, {
      preCheckout: service.handleStarsPreCheckout,
      successfulPayment: async () => assert.fail("Not a successful payment"),
    });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, `https://api.telegram.org/bot${token}/answerPreCheckoutQuery`);
    assert.deepEqual(requests[0].body, { pre_checkout_query_id: "checkout-1", ok: false, error_message: supportPaymentCopy[locale].checkoutError });
    assert.equal(requests[0].options.redirect, "error");
    assert.equal(requests[0].options.cache, "no-store");
    assert.ok(requests[0].options.signal instanceof AbortSignal);
    assert.equal(parseTelegramUpdate({ ...checkout, pre_checkout_query: { ...checkout.pre_checkout_query, total_amount: "invalid" } }), null);
  }
});

test("payment dispatch propagates storage/transport failures for webhook retries, without touching AI limits", async () => {
  const error = new Error("Temporary storage outage");
  await assert.rejects(handleTelegramPaymentUpdate(parseTelegramPaymentUpdate(successful), {
    preCheckout: async () => assert.fail(), successfulPayment: async () => { throw error; },
  }), candidate => candidate === error);
});

test("donate menu and amounts are localised, keep chat/check mode and use only the invoice budget", async () => {
  for (const locale of ["uz", "ru", "en"]) {
    for (const chatMode of [false, true]) {
      const { deps, values, sent, invoices, limits, invoiceLimits } = harness();
      if (chatMode) { values.set("mode:hashed-123", "chat"); values.set("chat:hashed-123", "preserved context"); }
      await handleTelegramMessage({ ...incoming, text: telegramSupportCopy[locale].button, language: locale }, deps);
      assert.ok(sent[0].text.includes(telegramSupportCopy[locale].choose));
      for (const [index, amount] of STARS_AMOUNTS.entries()) {
        await handleTelegramMessage({ ...incoming, updateId: index + 2, text: `${amount} ⭐`, language: locale }, deps);
      }
      assert.deepEqual(invoices, STARS_AMOUNTS.map(amount => ({ amount, locale, telegramUserId: 123 })));
      assert.equal(invoiceLimits.length, 3);
      assert.ok(limits.every(item => !item.internet));
      assert.ok(sent.every(item => item.chatMode === chatMode));
      if (chatMode) {
        assert.equal(values.get("mode:hashed-123"), "chat");
        assert.equal(values.get("chat:hashed-123"), "preserved context");
      } else assert.equal(values.has("mode:hashed-123"), false);
      assert.ok(sent[1].text.includes(telegramSupportCopy[locale].pending));
      assert.match(sent[1].text, /href="https:\/\/t.me\/\$test_invoice_1"/);
    }
  }
});

test("invalid, disabled, unconfigured and rate-limited donation requests never create an invoice", async () => {
  const { deps, invoices, invoiceLimits, sent } = harness();
  for (const [index, value] of ["0", "10001", "-100", "50.0", "50 100", "1e2", "<b>50</b>", "Infinity", "NaN", "9007199254740992"].entries()) {
    await handleTelegramMessage({ ...incoming, updateId: index + 1, text: `/donate ${value}` }, deps);
  }
  assert.equal(invoiceLimits.length, 0);
  deps.support.starsEnabled = false;
  await handleTelegramMessage({ ...incoming, updateId: 20, text: "/donate 50" }, deps);
  assert.ok(sent.at(-1).text.includes(telegramSupportCopy.uz.disabled));
  deps.support.starsEnabled = true;
  deps.support.limit = async () => ({ allowed: false, configured: true });
  await handleTelegramMessage({ ...incoming, updateId: 21, text: "/donate 50" }, deps);
  deps.support.limit = async () => ({ allowed: false, configured: false });
  await handleTelegramMessage({ ...incoming, updateId: 22, text: "/donate 50" }, deps);
  deps.support = undefined;
  await handleTelegramMessage({ ...incoming, updateId: 23, text: "/donate 50" }, deps);
  assert.equal(invoices.length, 0);
});

test("Telegram custom donation commands accept whole Stars within the application range in each language", async () => {
  const amounts = [STARS_MIN_AMOUNT, 7, 15, 50, 100, 250, STARS_MAX_AMOUNT];
  for (const locale of ["uz", "ru", "en"]) {
    const { deps, invoices, invoiceLimits, sent } = harness();
    for (const [index, amount] of amounts.entries()) {
      await handleTelegramMessage({ ...incoming, updateId: index + 1, text: `/donate ${amount}`, language: locale }, deps);
      assert.ok(sent.at(-1).text.includes(`${amount} ⭐`));
    }
    assert.deepEqual(invoices, amounts.map(amount => ({ amount, locale, telegramUserId: 123 })));
    assert.equal(invoiceLimits.length, amounts.length);
    assert.ok(telegramSupportCopy[locale].choose.includes("/donate 15"));
    assert.ok(telegramSupportCopy[locale].invalid.includes(String(STARS_MAX_AMOUNT)));
  }
});

test("invoice delivery retries reuse the cached URL and duplicate updates create no second invoice", async () => {
  const { deps, invoices, invoiceLimits, sent } = harness();
  const send = deps.send;
  const message = { ...incoming, text: "/donate 100", language: "en" };
  deps.send = async () => { throw new Error("Offline"); };
  await assert.rejects(handleTelegramMessage(message, deps));
  deps.send = send;
  await handleTelegramMessage(message, deps);
  assert.equal(await handleTelegramMessage(message, deps), "duplicate");
  assert.equal(invoices.length, 1);
  assert.equal(invoiceLimits.length, 1);
  assert.equal(sent.length, 1);
});

test("unsafe invoice URLs and provider error details are never echoed", async () => {
  const { deps, sent } = harness();
  deps.support.createInvoice = async () => { throw new Error("https://api.telegram.org/botSECRET/Bad details"); };
  await handleTelegramMessage({ ...incoming, text: "/donate 50" }, deps);
  deps.support.createInvoice = async () => ({ url: "https://attacker.example/$invoice" });
  await handleTelegramMessage({ ...incoming, updateId: 2, text: "/donate 50" }, deps);
  assert.ok(sent.every(item => item.text.includes(telegramSupportCopy.uz.unavailable)));
  assert.ok(sent.every(item => !/SECRET|attacker|Bad details/u.test(item.text)));
});

test("payment support and terms remain available after message quota denial and preserve AI mode", async () => {
  const { deps, values, sent, invoices } = harness();
  values.set("mode:hashed-123", "chat");
  deps.limit = async () => ({ allowed: false, configured: true });
  for (const [index, text] of ["/paysupport", "/terms", "/privacy"].entries()) {
    await handleTelegramMessage({ ...incoming, updateId: index + 1, text, language: "en" }, deps);
  }
  assert.ok(sent[0].text.includes(telegramSupportCopy.en.contactLink));
  assert.ok(sent[1].text.includes(telegramSupportCopy.en.termsBody));
  assert.ok(sent[2].text.includes(telegramSupportCopy.en.retention));
  assert.equal(values.get("mode:hashed-123"), "chat");
  assert.equal(invoices.length, 0);
});

test("keyboard support navigation preserves existing controls and registers correct Telegram update types", async () => {
  for (const locale of ["uz", "ru", "en"]) {
    for (const chatMode of [false, true]) {
      const keyboard = telegramKeyboard(locale, "https://rufact.vercel.app", false, chatMode);
      assert.ok(keyboard.keyboard.flat().some(button => button.text === telegramSupportCopy[locale].button));
      const amounts = telegramKeyboard(locale, "https://rufact.vercel.app", false, chatMode, true);
      assert.deepEqual(amounts.keyboard[0].map(button => telegramButtonCommand(button.text)), ["/donate 5", "/donate 10", "/donate 25"]);
    }
  }
  const setup = await readFile(new URL("../scripts/setup-telegram.mjs", import.meta.url), "utf8");
  assert.match(setup, /allowed_updates: \["message", "pre_checkout_query"\]/u);
  assert.match(setup, /await call\("setMyCommands", registration\)/u);
  assert.doesNotMatch(setup, /allowed_updates: \[[^\]]*"successful_payment"/u);
});

test("old persistent Stars buttons still map to supported commands without advertising old presets", () => {
  for (const amount of [5, 10, 25, 50, 100, 250]) assert.equal(telegramButtonCommand(`${amount} ⭐`), `/donate ${amount}`);
  for (const text of ["0 ⭐", "10001 ⭐", "-1 ⭐", "1.5 ⭐", "1e2 ⭐"]) assert.equal(telegramButtonCommand(text), text);
});

test("Telegram registers full Uzbek, Russian and English menus with an Uzbek default", () => {
  const registrations = telegramCommandRegistrations();
  assert.deepEqual(registrations.map(menu => menu.language_code ?? "default"), ["default", "uz", "ru", "en"]);
  assert.deepEqual(registrations[0].commands, registrations[1].commands);
  const expectedCommands = ["start", "chat", "check", "new", "stop", "uz", "ru", "en", "help", "donate", "paysupport", "terms", "privacy", "forget"];
  for (const menu of registrations) {
    assert.ok(menu.commands.length <= 100);
    assert.deepEqual(menu.commands.map(entry => entry.command), expectedCommands);
    for (const entry of menu.commands) {
      assert.match(entry.command, /^[a-z0-9_]{1,32}$/u);
      assert.ok([...entry.description].length >= 1 && [...entry.description].length <= 256);
      assert.ok(!/[\r\n]/u.test(entry.description));
    }
  }
  assert.match(registrations[1].commands.find(entry => entry.command === "forget").description, /Sozlamalar va suhbat kontekstini/u);
  assert.match(registrations[2].commands.find(entry => entry.command === "forget").description, /настройки и контекст/u);
  assert.match(registrations[3].commands.find(entry => entry.command === "forget").description, /settings and conversation context/u);
  const nonLanguageCommands = expectedCommands.filter(command => !["uz", "ru", "en"].includes(command));
  for (const command of nonLanguageCommands) {
    const localised = registrations.slice(1).map(menu => menu.commands.find(entry => entry.command === command).description);
    assert.equal(new Set(localised).size, 3, command);
  }
});
