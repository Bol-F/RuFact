import { createHash } from "node:crypto";
import type { Redis } from "@upstash/redis";
import {
  SUPPORT_PENDING_RETENTION_SECONDS, SUPPORT_RECEIPT_RETENTION_SECONDS, SUPPORT_THANKS_LEASE_MS,
  type SupportStore, type SupportTransaction,
} from "./support-core.ts";

// Every state transition is one bounded atomic script; no read/modify/write race.
export const SUPPORT_APPROVE_SCRIPT = `-- rufact-support-approve-v1
local raw = redis.call('GET', KEYS[1])
if not raw then return cjson.encode({approved=false}) end
local decoded, tx = pcall(cjson.decode, raw)
if not decoded or type(tx) ~= 'table' then return cjson.encode({approved=false}) end
local amount, user, now = tonumber(ARGV[2]), ARGV[3], tonumber(ARGV[5])
if tx.locale ~= 'uz' and tx.locale ~= 'ru' and tx.locale ~= 'en' then return cjson.encode({approved=false}) end
if tx.id ~= ARGV[1] or tx.currency ~= 'XTR' or tx.amount ~= amount or
  type(tx.expiresAt) ~= 'number' or now >= tx.expiresAt or
  (tx.userId and tx.userId ~= user) then return cjson.encode({approved=false, locale=tx.locale}) end
if tx.status == 'approved' then
  return cjson.encode({approved=tx.userId == user and tx.queryId == ARGV[4], locale=tx.locale})
end
if tx.status ~= 'pending' then return cjson.encode({approved=false, locale=tx.locale}) end
tx.status, tx.userId, tx.queryId, tx.approvedAt = 'approved', user, ARGV[4], now
redis.call('SET', KEYS[1], cjson.encode(tx), 'EX', ARGV[6])
return cjson.encode({approved=true, locale=tx.locale})
`;

export const SUPPORT_PAYMENT_SCRIPT = `-- rufact-support-payment-v1
local raw = redis.call('GET', KEYS[1])
if not raw then return cjson.encode({status='invalid'}) end
local decoded, tx = pcall(cjson.decode, raw)
if not decoded or type(tx) ~= 'table' then return cjson.encode({status='invalid'}) end
local amount, user, now = tonumber(ARGV[2]), ARGV[3], tonumber(ARGV[5])
if tx.id ~= ARGV[1] or tx.currency ~= 'XTR' or tx.amount ~= amount or tx.userId ~= user or
  type(tx.approvedAt) ~= 'number' or
  (tx.locale ~= 'uz' and tx.locale ~= 'ru' and tx.locale ~= 'en') then
  return cjson.encode({status='invalid'})
end
local previous = redis.call('GET', KEYS[2])
local newPayment = false
if previous and previous ~= ARGV[1] then return cjson.encode({status='invalid'}) end
if tx.status == 'paid' then
  if tx.telegramPaymentChargeId ~= ARGV[4] then return cjson.encode({status='invalid'}) end
  if tx.thankedAt then return cjson.encode({status='done'}) end
  if tx.thanksLeaseUntil and tx.thanksLeaseUntil > now then return cjson.encode({status='busy'}) end
elseif tx.status == 'approved' then
  if previous then return cjson.encode({status='invalid'}) end
  -- Charge IDs are unique per bot. Both this index and the receipt change atomically.
  redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[7])
  tx.status, tx.paidAt, tx.telegramPaymentChargeId = 'paid', now, ARGV[4]
  tx.queryId = nil
  newPayment = true
else return cjson.encode({status='invalid'}) end
tx.thanksLeaseToken, tx.thanksLeaseUntil = ARGV[6], now + tonumber(ARGV[8])
if newPayment then
  redis.call('SET', KEYS[1], cjson.encode(tx), 'EX', ARGV[7])
else redis.call('SET', KEYS[1], cjson.encode(tx), 'KEEPTTL') end
return cjson.encode({status='send', transaction=tx})
`;

export const SUPPORT_THANKED_SCRIPT = `-- rufact-support-thanked-v1
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local decoded, tx = pcall(cjson.decode, raw)
if not decoded or type(tx) ~= 'table' or tx.status ~= 'paid' or tx.thanksLeaseToken ~= ARGV[1] then return 0 end
tx.thankedAt, tx.thanksLeaseToken, tx.thanksLeaseUntil = tonumber(ARGV[2]), nil, nil
redis.call('SET', KEYS[1], cjson.encode(tx), 'KEEPTTL')
return 1
`;

export const SUPPORT_RELEASE_THANKS_SCRIPT = `-- rufact-support-release-thanks-v1
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local decoded, tx = pcall(cjson.decode, raw)
if not decoded or type(tx) ~= 'table' or tx.status ~= 'paid' or tx.thanksLeaseToken ~= ARGV[1] then return 0 end
tx.thanksLeaseToken, tx.thanksLeaseUntil = nil, nil
redis.call('SET', KEYS[1], cjson.encode(tx), 'KEEPTTL')
return 1
`;

function resultObject(value: unknown): Record<string, unknown> {
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Support storage returned an invalid result");
  return parsed as Record<string, unknown>;
}

export function createRedisSupportStore(redis: Pick<Redis, "set" | "eval">, prefix: string): SupportStore {
  const transactionKey = (id: string) => `${prefix}transaction:${id}`;
  return {
    create: async transaction => await redis.set(transactionKey(transaction.id), transaction, { nx: true, ex: SUPPORT_PENDING_RETENTION_SECONDS }) === "OK",
    approve: async input => {
      const result = resultObject(await redis.eval(SUPPORT_APPROVE_SCRIPT, [transactionKey(input.id)], [
        input.id, input.amount, String(input.userId), input.queryId, input.now, SUPPORT_RECEIPT_RETENTION_SECONDS,
      ]));
      if (typeof result.approved !== "boolean") throw new Error("Support storage returned an invalid result");
      const locale = result.locale === "uz" || result.locale === "ru" || result.locale === "en" ? result.locale : undefined;
      return { approved: result.approved, ...(locale ? { locale } : {}) };
    },
    recordPayment: async input => {
      const chargeKey = `${prefix}charge:${createHash("sha256").update(input.chargeId).digest("hex")}`;
      const result = resultObject(await redis.eval(SUPPORT_PAYMENT_SCRIPT, [transactionKey(input.id), chargeKey], [
        input.id, input.amount, String(input.userId), input.chargeId, input.now, input.thanksToken,
        SUPPORT_RECEIPT_RETENTION_SECONDS, SUPPORT_THANKS_LEASE_MS,
      ]));
      if (result.status === "done" || result.status === "busy" || result.status === "invalid") return { status: result.status };
      const tx = result.transaction as SupportTransaction | undefined;
      if (result.status !== "send" || !tx || tx.id !== input.id || tx.status !== "paid" || tx.currency !== "XTR" ||
          tx.amount !== input.amount || tx.userId !== String(input.userId) || tx.telegramPaymentChargeId !== input.chargeId ||
          tx.thanksLeaseToken !== input.thanksToken || !["uz", "ru", "en"].includes(tx.locale)) throw new Error("Support storage returned an invalid result");
      return { status: "send", transaction: tx };
    },
    completeThanks: async (id, token, now) => await redis.eval(SUPPORT_THANKED_SCRIPT, [transactionKey(id)], [token, now]) === 1,
    releaseThanks: async (id, token) => { await redis.eval(SUPPORT_RELEASE_THANKS_SCRIPT, [transactionKey(id)], [token]); },
  };
}
