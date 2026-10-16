import { createHash, randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createRedisSupportStore,
  SUPPORT_APPROVE_SCRIPT,
  SUPPORT_PAYMENT_SCRIPT,
  SUPPORT_RELEASE_THANKS_SCRIPT,
  SUPPORT_THANKED_SCRIPT,
} from "../lib/server/support-store.ts";

export const DIAGNOSTIC_TTL_SECONDS = 300;
const DIAGNOSTIC_PREFIX = /^rufact:support-diagnostic:[a-f0-9]{48}:$/u;
const REFERENCE = /^[A-Za-z0-9_-]{32}$/u;
const MAX_KEYS = 6;
const SHORT_TTL_MS = 180_000;

class DiagnosticError extends Error {
  constructor(name) {
    super("Support store diagnostic failed");
    this.name = name;
  }
}

function requireDiagnostic(condition, name = "DiagnosticAssertionError") {
  if (!condition) throw new DiagnosticError(name);
}

/** Only explicitly enumerated, initially absent synthetic keys may be touched. */
export function createDiagnosticRedisBoundary(redis, prefix, exactKeys) {
  requireDiagnostic(DIAGNOSTIC_PREFIX.test(prefix), "UnsafeDiagnosticNamespace");
  requireDiagnostic(Array.isArray(exactKeys) && exactKeys.length > 0 && exactKeys.length <= MAX_KEYS,
    "UnsafeDiagnosticKeySet");
  const permitted = new Set(exactKeys);
  requireDiagnostic(permitted.size === exactKeys.length, "UnsafeDiagnosticKeySet");
  for (const key of permitted) {
    requireDiagnostic(typeof key === "string" && key.startsWith(prefix), "UnsafeDiagnosticKey");
    const suffix = key.slice(prefix.length);
    requireDiagnostic(/^transaction:[A-Za-z0-9_-]{32}$/u.test(suffix) || /^charge:[a-f0-9]{64}$/u.test(suffix),
      "UnsafeDiagnosticKey");
  }
  requireDiagnostic([...permitted].filter(key => key.startsWith(`${prefix}transaction:`)).length <= 3,
    "UnsafeDiagnosticKeySet");
  let prepared = false;
  let closed = false;
  const checkKey = key => {
    requireDiagnostic(prepared && !closed && permitted.has(key), "UnsafeDiagnosticKey");
  };
  const adapter = {
    set: async (key, value, options) => {
      checkKey(key);
      requireDiagnostic(key === `${prefix}transaction:${value?.id}` && REFERENCE.test(value?.id) &&
        options?.nx === true && Number.isInteger(options.ex), "UnsafeDiagnosticWrite");
      return redis.set(key, value, { nx: true, ex: DIAGNOSTIC_TTL_SECONDS });
    },
    eval: async (script, keys, args) => {
      const definitions = new Map([
        [SUPPORT_APPROVE_SCRIPT, { keys: 1, args: 6, expiry: 5 }],
        [SUPPORT_PAYMENT_SCRIPT, { keys: 2, args: 8, expiry: 6 }],
        [SUPPORT_THANKED_SCRIPT, { keys: 1, args: 2 }],
        [SUPPORT_RELEASE_THANKS_SCRIPT, { keys: 1, args: 1 }],
      ]);
      const definition = definitions.get(script);
      requireDiagnostic(definition && Array.isArray(keys) && keys.length === definition.keys &&
        Array.isArray(args) && args.length === definition.args, "UnsafeDiagnosticScript");
      keys.forEach(checkKey);
      requireDiagnostic(keys[0].startsWith(`${prefix}transaction:`), "UnsafeDiagnosticKey");
      if (script === SUPPORT_APPROVE_SCRIPT || script === SUPPORT_PAYMENT_SCRIPT) {
        requireDiagnostic(keys[0] === `${prefix}transaction:${args[0]}`, "UnsafeDiagnosticKey");
      }
      if (script === SUPPORT_PAYMENT_SCRIPT) {
        requireDiagnostic(keys[1] === `${prefix}charge:${createHash("sha256").update(args[3]).digest("hex")}`,
          "UnsafeDiagnosticKey");
      }
      const boundedArgs = [...args];
      if (definition.expiry !== undefined) boundedArgs[definition.expiry] = DIAGNOSTIC_TTL_SECONDS;
      // The exact exported production Lua is executed; only its TTL argument is bounded.
      return redis.eval(script, keys, boundedArgs);
    },
  };
  return {
    adapter,
    prepare: async () => {
      requireDiagnostic(!prepared && !closed, "UnsafeDiagnosticState");
      requireDiagnostic(await redis.exists(...permitted) === 0, "DiagnosticNamespaceCollision");
      prepared = true;
    },
    ttl: async key => { checkKey(key); return redis.pttl(key); },
    shortenTtl: async key => {
      checkKey(key);
      requireDiagnostic(await redis.pexpire(key, SHORT_TTL_MS) === 1);
      const ttl = await redis.pttl(key);
      requireDiagnostic(ttl > 0 && ttl <= SHORT_TTL_MS);
      return ttl;
    },
    cleanup: async () => {
      if (!prepared || closed) return "not-required";
      closed = true;
      // Never use key discovery, a broad prefix, live financial keys, SCAN or FLUSH.
      await redis.del(...permitted);
      return await redis.exists(...permitted) === 0 ? "complete" : "incomplete";
    },
  };
}

function credentialsFromEnvironment(env) {
  const url = (env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL)?.trim();
  const token = (env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN)?.trim();
  requireDiagnostic(Boolean(url && token), "MissingRedisConfiguration");
  let parsed;
  try { parsed = new URL(url); } catch { throw new DiagnosticError("InvalidRedisConfiguration"); }
  requireDiagnostic(parsed.protocol === "https:" && parsed.hostname.endsWith(".upstash.io") &&
    !parsed.username && !parsed.password && !parsed.port && parsed.pathname === "/" &&
    !parsed.search && !parsed.hash, "InvalidRedisConfiguration");
  return { url, token };
}

async function defaultRedisFactory(configuration) {
  const { Redis } = await import("@upstash/redis");
  return new Redis(configuration);
}

function safeErrorClass(error) {
  if (error instanceof DiagnosticError) return error.name;
  if (error?.name === "TimeoutError" || error?.name === "AbortError") return "RedisTimeout";
  return "RedisDiagnosticError";
}

export async function runSupportStoreDiagnostic({
  args = [], env = {}, redisFactory = defaultRedisFactory,
} = {}) {
  let checksPassed = 0;
  let cleanup = "not-required";
  let boundary;
  let errorClass;
  try {
    requireDiagnostic(args.every(arg => arg === "--live-redis") && args.length <= 1,
      "InvalidDiagnosticArguments");
    if (!args.includes("--live-redis")) return { status: "skipped", checksPassed, cleanup };
    const credentials = credentialsFromEnvironment(env);
    const redis = await redisFactory({
      ...credentials, retry: false, signal: () => AbortSignal.timeout(2_500),
      enableAutoPipelining: false, enableTelemetry: false, latencyLogging: false,
    });
    const prefix = `rufact:support-diagnostic:${randomBytes(24).toString("hex")}:`;
    const references = Array.from({ length: 3 }, () => randomBytes(24).toString("base64url"));
    const chargeIds = ["synthetic-diagnostic-charge-a", "synthetic-diagnostic-charge-b"];
    const transactionKeys = references.map(id => `${prefix}transaction:${id}`);
    const chargeKeys = chargeIds.map(id => `${prefix}charge:${createHash("sha256").update(id).digest("hex")}`);
    boundary = createDiagnosticRedisBoundary(redis, prefix, [...transactionKeys, ...chargeKeys]);
    await boundary.prepare();
    const store = createRedisSupportStore(boundary.adapter, prefix);
    const check = condition => { requireDiagnostic(condition); checksPassed += 1; };
    const checkTtlNotExtended = async (key, previous) => {
      const ttl = await boundary.ttl(key);
      check(ttl > 0 && ttl <= previous);
    };
    const payer = 4_503_599_627_370_123;
    const now = Date.now();
    const transaction = index => ({
      id: references[index], amount: 100, currency: "XTR", locale: "en", userId: String(payer),
      createdAt: now, expiresAt: now + 900_000, status: "pending",
    });
    check(await store.create(transaction(0)));
    check(!await store.create(transaction(0)));
    const pendingTtl = await boundary.ttl(transactionKeys[0]);
    check(pendingTtl > 0 && pendingTtl <= DIAGNOSTIC_TTL_SECONDS * 1000);
    const approval = { id: references[0], amount: 100, userId: payer, queryId: "synthetic-query-a", now };
    check(!(await store.approve({ ...approval, userId: payer + 1 })).approved);
    check(!(await store.approve({ ...approval, amount: 50 })).approved);
    check((await store.approve(approval)).approved);
    const approvedTtl = await boundary.shortenTtl(transactionKeys[0]);
    check((await store.approve(approval)).approved);
    await checkTtlNotExtended(transactionKeys[0], approvedTtl);
    check(!(await store.approve({ ...approval, queryId: "synthetic-other-query" })).approved);
    const payment = {
      id: references[0], amount: 100, userId: payer, chargeId: chargeIds[0],
      now, thanksToken: "synthetic-lease-a",
    };
    check((await store.recordPayment({ ...payment, userId: payer + 1 })).status === "invalid");
    check((await store.recordPayment({ ...payment, amount: 50 })).status === "invalid");
    const paid = await store.recordPayment(payment);
    check(paid.status === "send" && paid.transaction.userId === String(payer));
    const receiptTtl = await boundary.shortenTtl(transactionKeys[0]);
    const chargeTtl = await boundary.shortenTtl(chargeKeys[0]);
    check((await store.recordPayment({ ...payment, thanksToken: "synthetic-lease-b" })).status === "busy");
    await store.releaseThanks(references[0], "synthetic-wrong-lease");
    check((await store.recordPayment(payment)).status === "busy");
    await store.releaseThanks(references[0], payment.thanksToken);
    const retry = { ...payment, thanksToken: "synthetic-lease-b" };
    check((await store.recordPayment(retry)).status === "send");
    await checkTtlNotExtended(transactionKeys[0], receiptTtl);
    check(!await store.completeThanks(references[0], "synthetic-wrong-lease", now));
    check(await store.completeThanks(references[0], retry.thanksToken, now));
    check((await store.recordPayment(payment)).status === "done");
    await checkTtlNotExtended(transactionKeys[0], receiptTtl);
    await checkTtlNotExtended(chargeKeys[0], chargeTtl);
    check(await store.create(transaction(1)));
    check((await store.approve({ ...approval, id: references[1], queryId: "synthetic-query-b" })).approved);
    check((await store.recordPayment({ ...payment, id: references[1] })).status === "invalid");
    check((await store.recordPayment({ ...payment, chargeId: chargeIds[1] })).status === "invalid");
    check(await store.create({ ...transaction(2), currency: "USD" }));
    check(!(await store.approve({ ...approval, id: references[2] })).approved);
  } catch (error) {
    errorClass = safeErrorClass(error);
  } finally {
    if (boundary) {
      try { cleanup = await boundary.cleanup(); } catch { cleanup = "incomplete"; }
    }
  }
  return {
    status: errorClass || cleanup === "incomplete" ? "failed" : "passed",
    checksPassed, cleanup, ...(errorClass ? { errorClass } : {}),
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const report = await runSupportStoreDiagnostic({ args: process.argv.slice(2), env: process.env });
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exitCode = report.status === "failed" ? 1 : 0;
}
