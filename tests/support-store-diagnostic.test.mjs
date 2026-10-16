import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  createDiagnosticRedisBoundary, DIAGNOSTIC_TTL_SECONDS, runSupportStoreDiagnostic,
} from "../scripts/check-support-store.mjs";
import {
  SUPPORT_APPROVE_SCRIPT, SUPPORT_PAYMENT_SCRIPT, SUPPORT_RELEASE_THANKS_SCRIPT,
  SUPPORT_THANKED_SCRIPT,
} from "../lib/server/support-store.ts";

const environment = { KV_REST_API_URL: "https://diagnostic.upstash.io", KV_REST_API_TOKEN: "synthetic-test-token" };

/** Stateful adapter for testing the diagnostic runner, not a substitute for real Lua execution. */
function fakeRedis() {
  const records = new Map();
  const calls = [];
  let clock = 1_000_000;
  const read = key => {
    const entry = records.get(key);
    if (entry && entry.expires <= clock) records.delete(key);
    return records.get(key);
  };
  const command = (method, args) => { clock += 5; calls.push({ method, args: structuredClone(args) }); };
  const put = (key, value, seconds) => records.set(key, {
    value: structuredClone(value), expires: seconds === undefined ? read(key)?.expires : clock + seconds * 1000,
  });
  return {
    records, calls,
    exists: async (...keys) => { command("exists", keys); return keys.filter(key => read(key)).length; },
    set: async (key, value, options) => {
      command("set", [key, value, options]);
      if (options.nx && read(key)) return null;
      put(key, value, options.ex); return "OK";
    },
    pttl: async key => { command("pttl", [key]); return read(key) ? read(key).expires - clock : -2; },
    pexpire: async (key, milliseconds) => {
      command("pexpire", [key, milliseconds]);
      if (!read(key)) return 0;
      read(key).expires = clock + milliseconds; return 1;
    },
    del: async (...keys) => { command("del", keys); return keys.filter(key => records.delete(key)).length; },
    eval: async (script, keys, args) => {
      command("eval", [script, keys, args]);
      const tx = structuredClone(read(keys[0])?.value);
      if (script === SUPPORT_APPROVE_SCRIPT) {
        const [id, amount, user, queryId, now, seconds] = args;
        if (!tx || !["uz", "ru", "en"].includes(tx.locale) || tx.id !== id || tx.currency !== "XTR" ||
            tx.amount !== amount || now >= tx.expiresAt || (tx.userId && tx.userId !== user)) return { approved: false };
        if (tx.status === "approved") return { approved: tx.userId === user && tx.queryId === queryId, locale: tx.locale };
        if (tx.status !== "pending") return { approved: false, locale: tx.locale };
        Object.assign(tx, { status: "approved", userId: user, queryId, approvedAt: now });
        put(keys[0], tx, seconds); return { approved: true, locale: tx.locale };
      }
      if (script === SUPPORT_PAYMENT_SCRIPT) {
        const [id, amount, user, chargeId, now, token, seconds, lease] = args;
        if (!tx || tx.id !== id || tx.currency !== "XTR" || tx.amount !== amount || tx.userId !== user ||
            typeof tx.approvedAt !== "number") return { status: "invalid" };
        const previous = read(keys[1])?.value;
        if (previous && previous !== id) return { status: "invalid" };
        let fresh = false;
        if (tx.status === "paid") {
          if (tx.telegramPaymentChargeId !== chargeId) return { status: "invalid" };
          if (tx.thankedAt) return { status: "done" };
          if (tx.thanksLeaseUntil > now) return { status: "busy" };
        } else if (tx.status === "approved") {
          if (previous) return { status: "invalid" };
          put(keys[1], id, seconds);
          Object.assign(tx, { status: "paid", paidAt: now, telegramPaymentChargeId: chargeId });
          delete tx.queryId; fresh = true;
        } else return { status: "invalid" };
        Object.assign(tx, { thanksLeaseToken: token, thanksLeaseUntil: now + lease });
        put(keys[0], tx, fresh ? seconds : undefined);
        return JSON.stringify({ status: "send", transaction: tx });
      }
      if (script === SUPPORT_THANKED_SCRIPT || script === SUPPORT_RELEASE_THANKS_SCRIPT) {
        if (!tx || tx.status !== "paid" || tx.thanksLeaseToken !== args[0]) return 0;
        if (script === SUPPORT_THANKED_SCRIPT) tx.thankedAt = args[1];
        delete tx.thanksLeaseToken; delete tx.thanksLeaseUntil;
        put(keys[0], tx); return 1;
      }
      throw new Error("Unexpected synthetic script");
    },
  };
}

test("default diagnostic makes no client, environment or network calls without explicit opt-in", async () => {
  const env = new Proxy({}, { get: () => { throw new Error("Environment read without opt-in"); } });
  const result = await runSupportStoreDiagnostic({ env, redisFactory: () => { throw new Error("Client constructed"); } });
  assert.deepEqual(result, { status: "skipped", checksPassed: 0, cleanup: "not-required" });
});

test("unknown arguments and missing/invalid Redis configuration fail before client construction", async () => {
  let clients = 0;
  const factory = async () => { clients += 1; return fakeRedis(); };
  for (const input of [
    { args: ["--enable-payments"], env: environment },
    { args: ["--live-redis"], env: {} },
    { args: ["--live-redis"], env: { ...environment, KV_REST_API_URL: "http://localhost" } },
    { args: ["--live-redis"], env: { ...environment, UPSTASH_REDIS_REST_TOKEN: "" } },
  ]) {
    const result = await runSupportStoreDiagnostic({ ...input, redisFactory: factory });
    assert.equal(result.status, "failed");
    assert.equal(result.cleanup, "not-required");
    assert.match(result.errorClass, /^(?:InvalidDiagnosticArguments|MissingRedisConfiguration|InvalidRedisConfiguration)$/u);
  }
  assert.equal(clients, 0);
});

test("runner exercises actual exported scripts through a bounded, isolated adapter and cleans exact keys", async () => {
  const redis = fakeRedis();
  let configuration;
  const result = await runSupportStoreDiagnostic({
    args: ["--live-redis"], env: environment,
    redisFactory: async config => { configuration = config; return redis; },
  });
  assert.deepEqual(result, { status: "passed", checksPassed: 27, cleanup: "complete" });
  assert.equal(configuration.retry, false);
  assert.equal(configuration.enableAutoPipelining, false);
  assert.equal(configuration.enableTelemetry, false);
  assert.notEqual(configuration.signal(), configuration.signal());
  assert.equal(redis.records.size, 0);
  const initialKeys = redis.calls[0].args;
  assert.equal(initialKeys.length, 5);
  assert.equal(new Set(initialKeys.map(key => key.split(":").slice(0, 3).join(":"))).size, 1);
  assert.ok(initialKeys.every(key => /^rufact:support-diagnostic:[a-f0-9]{48}:(?:transaction|charge):/u.test(key)));
  assert.deepEqual(redis.calls.find(call => call.method === "del").args, initialKeys);
  for (const call of redis.calls) {
    if (call.method === "set") assert.deepEqual(call.args[2], { nx: true, ex: DIAGNOSTIC_TTL_SECONDS });
    if (call.method !== "eval") continue;
    const [script, keys, args] = call.args;
    assert.ok([SUPPORT_APPROVE_SCRIPT, SUPPORT_PAYMENT_SCRIPT, SUPPORT_THANKED_SCRIPT, SUPPORT_RELEASE_THANKS_SCRIPT].includes(script));
    assert.ok(keys.every(key => initialKeys.includes(key)));
    if (script === SUPPORT_APPROVE_SCRIPT) assert.equal(args[5], 300);
    if (script === SUPPORT_PAYMENT_SCRIPT) assert.equal(args[6], 300);
  }
});

test("failures are redacted and cleanup still runs after an ambiguous Redis write", async () => {
  const redis = fakeRedis();
  const realEval = redis.eval;
  redis.eval = async (...args) => {
    await realEval(...args);
    throw new Error("PRIVATE Redis URL token payment metadata");
  };
  const result = await runSupportStoreDiagnostic({ args: ["--live-redis"], env: environment, redisFactory: async () => redis });
  assert.equal(result.status, "failed");
  assert.equal(result.errorClass, "RedisDiagnosticError");
  assert.equal(result.cleanup, "complete");
  assert.equal(redis.records.size, 0);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|token|https|payment metadata/u);
});

test("cleanup failure is visible but never includes raw SDK messages", async () => {
  const redis = fakeRedis();
  redis.del = async () => { throw new Error("PRIVATE SDK URL and token"); };
  const result = await runSupportStoreDiagnostic({ args: ["--live-redis"], env: environment, redisFactory: async () => redis });
  assert.equal(result.status, "failed");
  assert.equal(result.cleanup, "incomplete");
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|token|https/u);
  assert.ok([...redis.records.values()].every(entry => entry.expires <= 1_000_000 + 300_000 + 1_000));
});

test("unsafe namespaces, arbitrary Lua and non-enumerated keys cannot reach Redis", async () => {
  const redis = fakeRedis();
  const prefix = `rufact:support-diagnostic:${"a".repeat(48)}:`;
  const reference = "b".repeat(32);
  const key = `${prefix}transaction:${reference}`;
  assert.throws(() => createDiagnosticRedisBoundary(redis, "rufact:support:production:", [key]));
  assert.throws(() => createDiagnosticRedisBoundary(redis, prefix, ["live-financial-key"]));
  assert.throws(() => createDiagnosticRedisBoundary(redis, prefix, Array.from({ length: 7 }, (_, i) => `${prefix}transaction:${String(i).repeat(32)}`)));
  const boundary = createDiagnosticRedisBoundary(redis, prefix, [key]);
  await boundary.prepare();
  const callCount = redis.calls.length;
  await assert.rejects(boundary.adapter.set("live-financial-key", { id: reference }, { nx: true, ex: 1 }));
  await assert.rejects(boundary.adapter.eval("return redis.call('FLUSHALL')", [key], []));
  await assert.rejects(boundary.adapter.eval(SUPPORT_APPROVE_SCRIPT, [key], []));
  assert.equal(redis.calls.length, callCount);
  assert.equal(await boundary.cleanup(), "complete");
});

test("a collision with an existing synthetic namespace is not modified or deleted", async () => {
  const redis = fakeRedis();
  const prefix = `rufact:support-diagnostic:${"a".repeat(48)}:`;
  const key = `${prefix}charge:${createHash("sha256").update("existing").digest("hex")}`;
  redis.records.set(key, { value: "pre-existing", expires: 2_000_000 });
  const boundary = createDiagnosticRedisBoundary(redis, prefix, [key]);
  await assert.rejects(boundary.prepare(), { name: "DiagnosticNamespaceCollision" });
  assert.equal(await boundary.cleanup(), "not-required");
  assert.equal(redis.records.get(key).value, "pre-existing");
  assert.deepEqual(redis.calls.map(call => call.method), ["exists"]);
});
