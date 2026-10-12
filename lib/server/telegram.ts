import "server-only";

import { createHmac, createHash, randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";
import { getGeminiAssessment } from "./gemini-review";
import { redisCredentials, rateLimitTelegramInternet, rateLimitTelegramRequest } from "./rate-limit";
import { handleTelegramMessage, type TelegramMessage, type TelegramStore } from "./telegram-core";
import { telegramButtonCommand, telegramKeyboard } from "./telegram-ui";
import { getAiChatReply } from "./ai-chat";

const localStore = new Map<string, { value: string; expiry: number }>();
let redisClient: Redis | undefined;

function createStore(botToken: string): TelegramStore {
  const credentials = redisCredentials();
  if (!credentials && process.env.NODE_ENV === "production") throw new Error("Telegram Redis is not configured");
  const namespace = process.env.RATE_LIMIT_NAMESPACE?.trim().replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48) || "rufact";
  const prefix = `${namespace}:telegram:${createHash("sha256").update(botToken).digest("hex").slice(0, 16)}:`;
  if (credentials) {
    redisClient ??= new Redis({ ...credentials, retry: false, signal: () => AbortSignal.timeout(2500) });
    const redis = redisClient;
    return {
      get: key => redis.get<string>(prefix + key),
      getMany: keys => redis.mget<(string | null)[]>(...keys.map(key => prefix + key)),
      set: async (key, value, ttl) => { await redis.set(prefix + key, value, ttl === undefined ? undefined : { ex: ttl }); },
      setMany: async entries => {
        const transaction = redis.multi();
        for (const { key, value, ttl } of entries) {
          transaction.set(prefix + key, value, ttl === undefined ? undefined : { ex: ttl });
        }
        await transaction.exec();
      },
      remove: async key => { await redis.del(prefix + key); },
      removeMany: async keys => { await redis.del(...keys.map(key => prefix + key)); },
      claim: async (key, token, ttl) => await redis.set(prefix + key, token, { nx: true, ex: ttl }) === "OK",
      release: async (key, token) => {
        await redis.eval('if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end', [prefix + key], [token]);
      },
    };
  }
  function read(key: string) {
    const item = localStore.get(prefix + key);
    if (item && item.expiry > Date.now()) return item.value;
    localStore.delete(prefix + key);
    return null;
  }
  function write(key: string, value: string, ttl?: number) {
    if (localStore.size >= 2000) {
      for (const [name, item] of localStore) if (item.expiry <= Date.now()) localStore.delete(name);
      if (localStore.size >= 2000) throw new Error("Local Telegram store is full");
    }
    localStore.set(prefix + key, { value, expiry: ttl === undefined ? Infinity : Date.now() + ttl * 1000 });
  }
  return {
    get: async key => read(key),
    getMany: async keys => keys.map(read),
    set: async (key, value, ttl) => { write(key, value, ttl); },
    setMany: async entries => {
      // Check capacity before writing so a failed local batch leaves no partial cache.
      for (const [name, item] of localStore) if (item.expiry <= Date.now()) localStore.delete(name);
      const additional = new Set(entries.map(entry => prefix + entry.key).filter(key => !localStore.has(key))).size;
      if (localStore.size + additional > 2000) throw new Error("Local Telegram store is full");
      for (const { key, value, ttl } of entries) {
        localStore.set(prefix + key, { value, expiry: ttl === undefined ? Infinity : Date.now() + ttl * 1000 });
      }
    },
    remove: async key => { localStore.delete(prefix + key); },
    removeMany: async keys => { for (const key of keys) localStore.delete(prefix + key); },
    claim: async (key, token, ttl) => {
      if (read(key)) return false;
      write(key, token, ttl);
      return true;
    },
    release: async (key, token) => { if (read(key) === token) localStore.delete(prefix + key); },
  };
}

export async function processTelegramMessage(message: TelegramMessage, botToken: string) {
  const secret = process.env.RATE_LIMIT_HASH_SECRET?.trim();
  if (process.env.NODE_ENV === "production" && (!secret || secret.length < 32)) throw new Error("Telegram protection is not configured");
  return handleTelegramMessage(message, {
    store: createStore(botToken),
    userKey: id => createHmac("sha256", secret || "local-telegram-development").update(String(id)).digest("hex"),
    lockToken: randomUUID,
    limit: (identifier, internet) => internet ? rateLimitTelegramInternet(identifier) : rateLimitTelegramRequest(identifier),
    assess: (text, locale) => getGeminiAssessment(text, locale, AbortSignal.timeout(25_000)),
    chat: (messages, locale) => getAiChatReply(messages, locale),
    typing: async incoming => {
      await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: incoming.chatId, action: "typing" }),
        signal: AbortSignal.timeout(2000), cache: "no-store",
      });
    },
    send: async (incoming, text, locale, chatMode) => {
      const webUrl = process.env.TELEGRAM_WEB_APP_URL?.trim() || "https://rufact.vercel.app";
      const url = new URL(webUrl);
      if (url.protocol !== "https:" || url.username || url.password) throw new Error("Invalid Telegram website URL");
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: incoming.chatId,
          text,
          parse_mode: "HTML",
          // Chat reads as one conversation; assessments retain their quoted input.
          ...(chatMode ? {} : { reply_parameters: { message_id: incoming.messageId, allow_sending_without_reply: true } }),
          link_preview_options: { is_disabled: true },
          reply_markup: telegramKeyboard(locale, url.href, telegramButtonCommand(incoming.text) === "/language", chatMode),
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error("Telegram delivery failed");
      const body = await response.json() as { ok?: boolean };
      if (body.ok !== true) throw new Error("Telegram delivery failed");
    },
  });
}
