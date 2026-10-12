import assert from "node:assert/strict";
import test from "node:test";
import { Redis } from "@upstash/redis";
import { botCopy, formatTelegramAssessment, formatTelegramChat, handleTelegramMessage, parseTelegramUpdate, verifyTelegramSecret } from "../lib/server/telegram-core.ts";
import { telegramKeyboard, telegramNotice } from "../lib/server/telegram-ui.ts";

const message = { updateId: 1, chatId: 123, messageId: 42, text: "Ўзбекистон пойтахти Тошкент.", language: "uz" };
const assessment = {
  status: "complete", provider: "gemini", label: "REAL", certainty: "high",
  explanation: "Manba tasdiqlaydi.", warningSigns: [], claims: [],
  sources: [{ id: "s1", title: "Official source", url: "https://example.org/source" }],
  externalSourcesChecked: true, searchQueries: [], model: "test", promptVersion: "misinfo-tavily-v3",
};

function harness() {
  const values = new Map();
  const sent = [];
  const assessed = [];
  const limits = [];
  const ttls = new Map();
  const operations = [];
  const deps = {
    store: {
      get: async key => { operations.push({ method: "get", key }); return values.get(key) ?? null; },
      getMany: async keys => { operations.push({ method: "getMany", keys }); return keys.map(key => values.get(key) ?? null); },
      set: async (key, value, ttl) => { operations.push({ method: "set", key, ttl }); values.set(key, value); ttls.set(key, ttl); },
      setMany: async entries => {
        operations.push({ method: "setMany", entries });
        for (const { key, value, ttl } of entries) { values.set(key, value); ttls.set(key, ttl); }
      },
      remove: async key => { operations.push({ method: "remove", key }); values.delete(key); },
      removeMany: async keys => { operations.push({ method: "removeMany", keys }); for (const key of keys) values.delete(key); },
      claim: async (key, value) => { operations.push({ method: "claim", key }); if (values.has(key)) return false; values.set(key, value); return true; },
      release: async (key, value) => { operations.push({ method: "release", key }); if (values.get(key) === value) values.delete(key); },
    },
    userKey: id => `hashed-${id}`,
    lockToken: () => "lease-owner",
    limit: async (id, internet) => { limits.push({ id, internet }); return { allowed: true, configured: true }; },
    assess: async (text, locale) => { assessed.push({ text, locale }); return assessment; },
    send: async (incoming, text, locale, chatMode) => { sent.push({ incoming, text, locale, chatMode }); },
  };
  return { deps, values, sent, assessed, limits, ttls, operations };
}

test("webhook requires a strong exact shared secret", () => {
  const secret = "telegram-test-secret-at-least-32-chars";
  assert.equal(verifyTelegramSecret(secret, secret), true);
  assert.equal(verifyTelegramSecret(secret + "x", secret), false);
  assert.equal(verifyTelegramSecret(null, secret), false);
  assert.equal(verifyTelegramSecret("short", "short"), false);
  assert.equal(verifyTelegramSecret(" "+secret, secret), false);
});

test("only valid private human messages are accepted; captions and forwarded text work", () => {
  const raw = { update_id: 1, message: { message_id: 42, chat: { id: 123, type: "private" }, from: { id: 123, is_bot: false, language_code: "uz" }, text: message.text, forward_origin: { type: "channel" } } };
  assert.deepEqual(parseTelegramUpdate(raw), message);
  assert.equal(parseTelegramUpdate({ ...raw, message: { ...raw.message, chat: { id: 123, type: "group" } } }), null);
  assert.equal(parseTelegramUpdate({ ...raw, message: { ...raw.message, from: { id: 999, is_bot: false } } }), null);
  assert.equal(parseTelegramUpdate({ ...raw, update_id: "1" }), null);
  assert.equal(parseTelegramUpdate({ ...raw, message: { ...raw.message, from: { id: 123, is_bot: true } } }), null);
  assert.equal(parseTelegramUpdate({ ...raw, message: { ...raw.message, text: undefined, caption: "Photo caption" } }).text, "Photo caption");
});

test("source checking handles Uzbek Cyrillic and completed deliveries are deduplicated", async () => {
  const { deps, sent, assessed, limits, values } = harness();
  assert.equal(await handleTelegramMessage(message, deps), "done");
  assert.deepEqual(assessed, [{ text: message.text, locale: "uz" }]);
  assert.match(sent[0].text, /https:\/\/example.org\/source/);
  assert.equal(limits.filter(limit => limit.internet).length, 1);
  assert.equal(await handleTelegramMessage(message, deps), "duplicate");
  assert.equal(sent.length, 1);
  assert.equal(assessed.length, 1);
  assert.equal(values.has("update:1:reply"), false);
});

test("language commands persist without consuming the internet budget", async () => {
  const { deps, assessed, sent, limits } = harness();
  await handleTelegramMessage({ ...message, text: "/en" }, deps);
  await handleTelegramMessage({ ...message, updateId: 2, text: "/check Tashkent is the capital of Uzbekistan." }, deps);
  assert.equal(sent[0].locale, "en");
  assert.deepEqual(assessed, [{ text: "Tashkent is the capital of Uzbekistan.", locale: "en" }]);
  assert.equal(limits.filter(limit => limit.internet).length, 1);
});

test("forget deletes language settings and help, invalid lengths and media never search", async () => {
  const { deps, values, assessed } = harness();
  await handleTelegramMessage({ ...message, text: "/ru" }, deps);
  await handleTelegramMessage({ ...message, updateId: 2, text: "/forget" }, deps);
  assert.equal(values.has("language:hashed-123"), false);
  for (const [index, text] of ["/help", "/privacy", "", "a".repeat(5001)].entries()) {
    await handleTelegramMessage({ ...message, updateId: index + 3, text }, deps);
  }
  assert.equal(assessed.length, 0);
});

test("delivery retries reuse a cached reply without another search or rate-limit charge", async () => {
  const { deps, assessed, limits, sent, values } = harness();
  const original = deps.send;
  deps.send = async () => { throw new Error("Transport unavailable"); };
  await assert.rejects(handleTelegramMessage(message, deps));
  assert.equal(values.has("update:1:lock"), false);
  assert.equal(values.has("update:1:done"), false);
  deps.send = original;
  await handleTelegramMessage(message, deps);
  assert.equal(assessed.length, 1);
  assert.equal(limits.length, 2);
  assert.equal(sent.length, 1);
});

test("concurrent deliveries wait for the original and do not call providers", async () => {
  const { deps, values, assessed } = harness();
  values.set("update:1:lock", "another-owner");
  assert.equal(await handleTelegramMessage(message, deps), "busy");
  assert.equal(assessed.length, 0);
});

test("quota denial and protection outages never call providers", async () => {
  const { deps, assessed, sent } = harness();
  deps.limit = async () => ({ allowed: false, configured: true });
  await handleTelegramMessage(message, deps);
  assert.equal(sent[0].text, telegramNotice(botCopy.uz.limited));
  deps.limit = async () => ({ allowed: false, configured: false });
  await assert.rejects(handleTelegramMessage({ ...message, updateId: 2 }, deps));
  assert.equal(assessed.length, 0);
});

test("failed checks are never presented as true and unsafe links are omitted", () => {
  assert.equal(formatTelegramAssessment({ status: "unavailable", provider: "gemini", reason: "rate-limited" }, "en"), botCopy.en.unavailable);
  const result = formatTelegramAssessment({ ...assessment, explanation: "<b>Claim</b>", sources: [{ id: "x", title: "Fake", url: "javascript:alert(1)" }], claims: Array.from({ length: 6 }, () => ({ quote: "x".repeat(320), explanation: "y".repeat(500) })) }, "en");
  assert.ok(result.length <= 4096);
  assert.doesNotMatch(result, /javascript:/);
  assert.match(result, /&lt;b&gt;Claim&lt;\/b&gt;/);
});

test("localized navigation buttons select language and mode without searching", async () => {
  const { deps, assessed, sent } = harness();
  for (const [index, text] of ["🌐 Til / Language", "🇬🇧 English", "🔎 Check text"].entries()) {
    await handleTelegramMessage({ ...message, updateId: index + 1, text }, deps);
  }
  assert.equal(assessed.length, 0);
  assert.equal(sent[1].locale, "en");
  assert.match(sent[2].text, /Fact-check mode/);
  assert.equal(telegramKeyboard("en", "https://example.org", true).keyboard[0].length, 3);
});

test("AI chat remembers follow-ups, clears context and preserves fact-check mode", async () => {
  const { deps, values, assessed } = harness();
  const conversations = [];
  deps.chat = async messages => { conversations.push(messages); return { status: "complete", text: "Answer [1]", sources: assessment.sources }; };
  for (const [index, text] of ["💬 AI chat", "First question", "Follow-up", "/new", "New question", "/check", "A claim"].entries()) await handleTelegramMessage({ ...message, updateId: index + 1, text }, deps);
  assert.equal(conversations.length, 3);
  assert.equal(conversations[1].length, 3);
  assert.equal(conversations[2].length, 1);
  assert.equal(assessed.length, 1);
  await handleTelegramMessage({ ...message, updateId: 8, text: "/forget" }, deps);
  assert.equal(values.has("chat:hashed-123"), false);
  assert.equal(values.has("mode:hashed-123"), false);
});

test("AI chat delivery retries do not regenerate an answer", async () => {
  const { deps, sent } = harness(); let calls = 0;
  deps.chat = async () => { calls++; return { status: "complete", text: "Answer [1]", sources: assessment.sources }; };
  await handleTelegramMessage({ ...message, text: "/chat" }, deps);
  const original = deps.send;
  deps.send = async () => { throw new Error("Offline"); };
  const follow = { ...message, updateId: 2, text: "Question" };
  await assert.rejects(handleTelegramMessage(follow, deps)); deps.send = original;
  await handleTelegramMessage(follow, deps);
  assert.equal(calls, 1); assert.equal(sent.length, 2);
});

test("a conversation lease serializes separate updates and HTML cannot be injected", async () => {
  const { deps, values, assessed } = harness();
  values.set("conversation:hashed-123:lock", "another-owner");
  assert.equal(await handleTelegramMessage(message, deps), "busy"); assert.equal(assessed.length, 0);
  const html = formatTelegramChat({ status: "complete", text: "<a href='evil'>Oops</a>".repeat(200), sources: assessment.sources }, "en");
  assert.ok(html.length < 4096); assert.match(html, /&lt;a/); assert.doesNotMatch(html, /<a href='evil'/);
});

test("chat mode survives expired content and stops only on an explicit exit", async () => {
  const { deps, values, ttls, assessed } = harness();
  const conversations = [];
  deps.chat = async messages => { conversations.push(messages); return { status: "complete", text: "Answer", sources: [] }; };
  await handleTelegramMessage({ ...message, text: "/chat First factual question" }, deps);
  assert.equal(values.get("mode:hashed-123"), "chat");
  assert.equal(ttls.get("mode:hashed-123"), undefined);
  assert.equal(ttls.get("chat:hashed-123"), 1800);
  values.delete("chat:hashed-123"); // Simulate idle context expiry, not an exit.
  await handleTelegramMessage({ ...message, updateId: 2, text: "Another factual question" }, deps);
  assert.equal(conversations.length, 2);
  assert.equal(conversations[1].length, 1);
  assert.equal(assessed.length, 0);
  await handleTelegramMessage({ ...message, updateId: 3, text: "⏹ Chatni tugatish" }, deps);
  assert.equal(values.has("mode:hashed-123"), false);
  assert.equal(values.has("chat:hashed-123"), false);
  await handleTelegramMessage({ ...message, updateId: 4, text: "A claim" }, deps);
  assert.equal(assessed.length, 1);
});

test("introductions have no irrelevant sources and consume no internet quota", async () => {
  const { deps, limits, sent, values } = harness();
  deps.chat = async () => { throw new Error("Should not call provider"); };
  await handleTelegramMessage({ ...message, text: "/chat" }, deps);
  await handleTelegramMessage({ ...message, updateId: 2, text: "who are you ?" }, deps);
  assert.match(sent[1].text, /RuFact/);
  assert.doesNotMatch(sent[1].text, /<a |Manbalar|<i>/);
  assert.equal(limits.filter(limit => limit.internet).length, 0);
  assert.equal(JSON.parse(values.get("chat:hashed-123")).length, 2);
});

test("stop clears chat even after quota denial, and new always starts chat", async () => {
  const { deps, values } = harness();
  await handleTelegramMessage({ ...message, text: "/new" }, deps);
  assert.equal(values.get("mode:hashed-123"), "chat");
  deps.limit = async () => ({ allowed: false, configured: true });
  await handleTelegramMessage({ ...message, updateId: 2, text: "/stop" }, deps);
  assert.equal(values.has("mode:hashed-123"), false);
  const keyboard = telegramKeyboard("en", "https://example.org", false, true);
  assert.equal(keyboard.keyboard[0][1].text, "⏹ End chat");
  assert.equal(keyboard.keyboard[1][1].web_app.url, "https://example.org/chat");
  assert.equal(keyboard.is_persistent, true);
});

test("fresh source checks batch bounded state/cache I/O instead of repeated Redis calls", async () => {
  const { deps, operations, limits, sent, ttls } = harness();
  await handleTelegramMessage(message, deps);
  // Previous implementation: 18 store requests. Two final releases now run together.
  assert.equal(operations.length, 10);
  assert.deepEqual(operations.filter(item => item.method === "get").map(item => item.key), ["update:1:done", "update:1:done"]);
  assert.deepEqual(operations.find(item => item.method === "getMany").keys, [
    "mode:hashed-123", "language:hashed-123", "update:1:reply", "update:1:format", "update:1:locale",
  ]);
  const cacheWrite = operations.find(item => item.method === "setMany");
  assert.equal(cacheWrite.entries.length, 3);
  assert.ok(cacheWrite.entries.every(entry => entry.ttl === 2 * 86_400));
  assert.equal(ttls.get("update:1:done"), 2 * 86_400);
  assert.equal(limits.length, 2); // Same general + per-user/global source budget wrapper.
  assert.equal(sent[0].chatMode, false);
});

test("existing chat uses a local mode snapshot and migrates its old TTL once per update", async () => {
  const { deps, operations, values, ttls, sent } = harness();
  values.set("mode:hashed-123", "chat");
  ttls.set("mode:hashed-123", 1800); // Earlier deployments expired the preference.
  deps.chat = async () => ({ status: "complete", text: "A sourced answer", sources: assessment.sources });
  await handleTelegramMessage({ ...message, text: "What is the capital of Uzbekistan?" }, deps);
  // Previous implementation: 22 store requests; now 13 operations/12 RTT stages.
  assert.equal(operations.length, 13);
  assert.equal(operations.filter(item => item.method === "set" && item.key === "mode:hashed-123").length, 1);
  assert.equal(ttls.get("mode:hashed-123"), undefined);
  assert.equal(ttls.get("chat:hashed-123"), 1800);
  assert.equal(sent[0].chatMode, true);
  assert.equal(operations.filter(item => item.method === "get" && item.key === "mode:hashed-123").length, 0);
});

test("cached legacy delivery preserves its format and response locale without providers", async () => {
  const { deps, values, limits, assessed, sent, operations } = harness();
  values.set("language:hashed-123", "ru");
  values.set("update:1:reply", "Cached English reply");
  values.set("update:1:locale", "en");
  // A pre-HTML cached reply has no format marker.
  await handleTelegramMessage(message, deps);
  assert.equal(sent[0].text, telegramNotice("Cached English reply"));
  assert.equal(sent[0].locale, "en");
  assert.equal(assessed.length, 0);
  assert.equal(limits.length, 0);
  assert.equal(operations.filter(item => item.method === "getMany").length, 1);
  assert.equal(operations.filter(item => item.method === "get").length, 2);
});

test("failed completion leaves the retry cache and retries never consume providers again", async () => {
  const { deps, values, assessed, sent } = harness();
  const originalSet = deps.store.set;
  deps.store.set = async (key, ...args) => {
    if (key === "update:1:done") throw new Error("Completion write failed");
    return originalSet(key, ...args);
  };
  await assert.rejects(handleTelegramMessage(message, deps), /Completion write failed/);
  assert.equal(sent.length, 1);
  assert.ok(values.has("update:1:reply"));
  assert.equal(values.has("update:1:done"), false);
  assert.equal(values.has("update:1:lock"), false);
  assert.equal(values.has("conversation:hashed-123:lock"), false);
  deps.store.set = originalSet;
  await handleTelegramMessage(message, deps);
  assert.equal(assessed.length, 1);
  assert.equal(sent.length, 2); // At-least-once transport is unchanged.
});

test("cleanup failure after durable completion is still deduplicated", async () => {
  const { deps, values, assessed, sent } = harness();
  deps.store.removeMany = async () => { throw new Error("Cleanup unavailable"); };
  await assert.rejects(handleTelegramMessage(message, deps), /Cleanup unavailable/);
  assert.equal(values.get("update:1:done"), "1");
  assert.ok(values.has("update:1:reply")); // It still has its bounded 48-hour TTL.
  assert.equal(await handleTelegramMessage(message, deps), "duplicate");
  assert.equal(assessed.length, 1);
  assert.equal(sent.length, 1);
});

test("failed batch cache write prevents delivery and releases both leases", async () => {
  const { deps, values, sent } = harness();
  deps.store.setMany = async () => { throw new Error("Cache transaction failed"); };
  await assert.rejects(handleTelegramMessage(message, deps), /Cache transaction failed/);
  assert.equal(sent.length, 0);
  assert.equal(values.has("update:1:reply"), false);
  assert.equal(values.has("update:1:lock"), false);
  assert.equal(values.has("conversation:hashed-123:lock"), false);
});

test("state snapshot errors fail closed before providers and release both leases", async () => {
  const { deps, values, assessed, limits, sent } = harness();
  deps.store.getMany = async () => { throw new Error("State unavailable"); };
  await assert.rejects(handleTelegramMessage(message, deps), /State unavailable/);
  assert.equal(assessed.length, 0);
  assert.equal(limits.length, 0);
  assert.equal(sent.length, 0);
  assert.equal(values.has("update:1:lock"), false);
  assert.equal(values.has("conversation:hashed-123:lock"), false);
});

test("independent lease releases both finish even when one release fails", async () => {
  const { deps } = harness();
  const released = [];
  deps.store.release = async key => {
    released.push(`started:${key}`);
    if (key.startsWith("conversation:")) throw new Error("Conversation release failed");
    await new Promise(resolve => setImmediate(resolve));
    released.push(`finished:${key}`);
  };
  await assert.rejects(handleTelegramMessage(message, deps), /Conversation release failed/);
  assert.deepEqual(released, [
    "started:conversation:hashed-123:lock", "started:update:1:lock", "finished:update:1:lock",
  ]);
});

test("parallel releases cannot remove leases that have a different owner", async () => {
  const { deps, values } = harness();
  deps.send = async () => {
    values.set("conversation:hashed-123:lock", "next-owner");
    values.set("update:1:lock", "next-owner");
  };
  await handleTelegramMessage(message, deps);
  assert.equal(values.get("conversation:hashed-123:lock"), "next-owner");
  assert.equal(values.get("update:1:lock"), "next-owner");
});

test("native Redis SDK batching reduces simulated transport round trips without network", async () => {
  const { deps } = harness();
  const values = new Map();
  const requests = [];
  function execute(command) {
    const [operation, key, ...args] = command;
    switch (operation.toUpperCase()) {
      case "GET": return values.get(key) ?? null;
      case "MGET": return [key, ...args].map(name => values.get(name) ?? null);
      case "SET":
        if (args.includes("nx") && values.has(key)) return null;
        values.set(key, args[0]);
        return "OK";
      case "DEL": {
        let deleted = 0;
        for (const name of [key, ...args]) if (values.delete(name)) deleted++;
        return deleted;
      }
      case "EVAL": {
        // The only scripts here are the existing token-checked lease releases.
        const [lease, token] = args.slice(1);
        return values.get(lease) === token && values.delete(lease) ? 1 : 0;
      }
      default: throw new Error(`Unexpected mocked Redis command: ${operation}`);
    }
  }
  // A custom Requester never fetches a URL or reads real credentials. Each call
  // corresponds to one HTTP request in the production SDK transport.
  const redis = new Redis({
    request: async request => {
      requests.push(request);
      return request.path?.length
        ? request.body.map(command => ({ result: execute(command) }))
        : { result: execute(request.body) };
    },
  }).autoPipeline();
  deps.store = {
    get: key => redis.get(key),
    getMany: keys => redis.mget(...keys),
    set: async (key, value, ttl) => { await redis.set(key, value, ttl === undefined ? undefined : { ex: ttl }); },
    setMany: async entries => {
      const transaction = redis.multi();
      for (const { key, value, ttl } of entries) transaction.set(key, value, ttl === undefined ? undefined : { ex: ttl });
      await transaction.exec();
    },
    remove: async key => { await redis.del(key); },
    removeMany: async keys => { await redis.del(...keys); },
    claim: async (key, token, ttl) => await redis.set(key, token, { nx: true, ex: ttl }) === "OK",
    release: async (key, token) => {
      await redis.eval('if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end', [key], [token]);
    },
  };
  await handleTelegramMessage(message, deps);
  assert.equal(requests.length, 9); // Before: 18 transport round trips.
  assert.ok(requests.some(request => request.path?.[0] === "multi-exec" && request.body.length === 3));
  assert.equal(requests.at(-1).body.length, 2); // Both lease releases in one pipeline.
  requests.length = 0;
  values.set("mode:hashed-123", "chat");
  deps.chat = async () => ({ status: "complete", text: "Answer", sources: assessment.sources });
  await handleTelegramMessage({ ...message, updateId: 2, text: "What is the capital of Uzbekistan?" }, deps);
  assert.equal(requests.length, 12); // Before: 22 transport round trips.
});
