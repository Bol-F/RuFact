import type { AppLocale } from "../i18n.ts";
import { isStarsAmount, type StarsAmount, type SupportAvailability } from "../support.ts";
import { readBoundedText } from "./bounded-text.ts";

export const SUPPORT_PENDING_USABLE_MS = 15 * 60 * 1000;
export const SUPPORT_PENDING_RETENTION_SECONDS = 24 * 60 * 60;
export const SUPPORT_RECEIPT_RETENTION_SECONDS = 90 * 24 * 60 * 60;
export const SUPPORT_THANKS_LEASE_MS = 30_000;
export const SUPPORT_PAYLOAD_PREFIX = "rufact_support_v1:";

export type SupportErrorCode = "disabled" | "invalid-input" | "unavailable" | "invalid-payment";
export class SupportError extends Error {
  readonly code: SupportErrorCode;
  constructor(code: SupportErrorCode) {
    super(code === "invalid-input" ? "Invalid support request" : code === "disabled" ? "Support payments are unavailable" : "Support operation could not be completed");
    this.name = "SupportError";
    this.code = code;
  }
}

export interface SupportTransaction {
  id: string;
  amount: StarsAmount;
  currency: "XTR";
  locale: AppLocale;
  createdAt: number;
  expiresAt: number;
  status: "pending" | "approved" | "paid";
  // Decimal text preserves all Telegram's 52-bit identifiers through Redis Lua cjson (14-digit precision).
  userId?: string;
  queryId?: string;
  approvedAt?: number;
  paidAt?: number;
  telegramPaymentChargeId?: string;
  thankedAt?: number;
  thanksLeaseToken?: string;
  thanksLeaseUntil?: number;
}

export interface SupportPreCheckoutEvent {
  queryId: string;
  userId: number;
  currency: string;
  totalAmount: number;
  invoicePayload: string;
  languageCode?: string;
}

export interface SupportSuccessfulPaymentEvent {
  chatId: number;
  userId: number;
  currency: string;
  totalAmount: number;
  invoicePayload: string;
  telegramPaymentChargeId: string;
  providerPaymentChargeId?: string;
}

export interface SupportStore {
  create(transaction: SupportTransaction): Promise<boolean>;
  approve(input: { id: string; amount: StarsAmount; userId: number; queryId: string; now: number }): Promise<{ approved: boolean; locale?: AppLocale }>;
  recordPayment(input: { id: string; amount: StarsAmount; userId: number; chargeId: string; now: number; thanksToken: string }): Promise<
    { status: "send"; transaction: SupportTransaction } | { status: "done" | "busy" | "invalid" }
  >;
  completeThanks(id: string, token: string, now: number): Promise<boolean>;
  releaseThanks(id: string, token: string): Promise<void>;
}

export interface SupportProvider {
  createInvoice(input: { title: string; description: string; payload: string; amount: StarsAmount }): Promise<string>;
  answerPreCheckout(queryId: string, approved: boolean, errorMessage?: string): Promise<void>;
  thank(chatId: number, text: string): Promise<void>;
}

interface SupportDependencies {
  enabled: boolean;
  store: SupportStore | null;
  provider: SupportProvider;
  now: () => number;
  randomReference: () => string;
}

export const supportPaymentCopy = {
  uz: {
    title: "RuFact’ni qo‘llab-quvvatlash",
    description: "RuFact uchun bir martalik, ixtiyoriy yordam. Xizmatdan bepul foydalanish uchun to‘lov shart emas.",
    checkoutError: "To‘lov hozir mavjud emas yoki hisob muddati tugagan. /donate orqali yangi hisob yarating.",
    thanks: (amount: number) => `❤️ RuFact’ni qo‘llab-quvvatlaganingiz uchun rahmat!\n\nTelegram ${amount} ⭐ to‘lovini tasdiqladi. Bu bir martalik, ixtiyoriy yordam.\n\nTo‘lov bo‘yicha yordam yoki qaytarish so‘rovi: /paysupport`,
  },
  ru: {
    title: "Поддержка RuFact",
    description: "Разовая добровольная поддержка RuFact. Платить для бесплатного использования сервиса не требуется.",
    checkoutError: "Оплата временно недоступна или срок счёта истёк. Создайте новый счёт через /donate.",
    thanks: (amount: number) => `❤️ Спасибо за поддержку RuFact!\n\nTelegram подтвердил платёж ${amount} ⭐. Это разовая добровольная поддержка.\n\nПомощь с платежом или запрос возврата: /paysupport`,
  },
  en: {
    title: "Support RuFact",
    description: "One-time voluntary support for RuFact. Payment is not required to use the free service.",
    checkoutError: "Payments are unavailable or this invoice has expired. Create a new invoice using /donate.",
    thanks: (amount: number) => `❤️ Thank you for supporting RuFact!\n\nTelegram confirmed your ${amount} ⭐ payment. This is one-time, voluntary support.\n\nPayment help or refund requests: /paysupport`,
  },
} as const;

export function isTelegramUserId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value < 2 ** 52;
}

/** The non-secret numeric bot identity is stable when BotFather rotates its API token. */
export function supportBotId(token: unknown): string | null {
  if (typeof token !== "string") return null;
  const match = /^([1-9]\d{4,15}):[A-Za-z0-9_-]{20,100}$/u.exec(token);
  return match && isTelegramUserId(Number(match[1])) ? match[1] : null;
}

function validIdentifier(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max && !/[\u0000-\u0020\u007f]/u.test(value);
}

export function supportReference(payload: unknown): string | null {
  if (typeof payload !== "string" || !payload.startsWith(SUPPORT_PAYLOAD_PREFIX)) return null;
  const id = payload.slice(SUPPORT_PAYLOAD_PREFIX.length);
  return /^[A-Za-z0-9_-]{32}$/u.test(id) ? id : null;
}

/** Reject executable, credential-bearing, local-network and control-character URLs. */
export function safeSupportContactUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 500 || /[\u0000-\u0020\u007f\\]/u.test(value)) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const validHostname = host.length <= 253 && host.split(".").every(label =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label));
    if (url.protocol !== "https:" || url.username || url.password || url.port || !host.includes(".") ||
        !validHostname || /^\d[\d.]*$/u.test(host) ||
        host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") ||
        host === "localhost" || host.includes("..")) return null;
    return url.href;
  } catch { return null; }
}

export function supportAvailabilityFromEnvironment(env: Record<string, string | undefined>): SupportAvailability {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const redisUrl = (env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL)?.trim();
  const redisToken = (env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN)?.trim();
  const secret = env.RATE_LIMIT_HASH_SECRET?.trim();
  const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const contactUrl = safeSupportContactUrl(env.SUPPORT_CONTACT_URL?.trim());
  return {
    starsEnabled: env.SUPPORT_STARS_ENABLED === "true" && Boolean(supportBotId(token) &&
      safeSupportContactUrl(redisUrl) && redisToken && secret && secret.length >= 32 && contactUrl &&
      webhookSecret && /^[A-Za-z0-9_-]{32,256}$/u.test(webhookSecret)),
    walletEnabled: false,
    contactUrl,
  };
}

/** HTTP adapter is injectable so tests never contact Telegram or create real invoices. */
export function createTelegramSupportProvider(botToken: string | null, fetchFn: typeof fetch = fetch): SupportProvider {
  async function call(method: string, body: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    if (!botToken || !supportBotId(botToken)) throw new SupportError("unavailable");
    try {
      const signal = AbortSignal.timeout(timeoutMs);
      const response = await fetchFn(`https://api.telegram.org/bot${botToken}/${method}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        signal, cache: "no-store", redirect: "error",
      });
      if (!response.ok) throw new SupportError("unavailable");
      const data: unknown = JSON.parse(await readBoundedText(response, { maxBytes: 16_384, signal }));
      if (!data || typeof data !== "object" || !("ok" in data) || data.ok !== true || !("result" in data)) throw new SupportError("unavailable");
      return data.result;
    } catch {
      // Never propagate fetch URLs, provider bodies or Redis command arguments into logs.
      throw new SupportError("unavailable");
    }
  }
  return {
    createInvoice: async input => {
      const result = await call("createInvoiceLink", {
        title: input.title, description: input.description, payload: input.payload,
        provider_token: "", currency: "XTR", prices: [{ label: input.title, amount: input.amount }],
        // No subscription, tips, delivery or personal payment credentials are requested.
      }, 5000);
      if (typeof result !== "string") throw new SupportError("unavailable");
      return result;
    },
    answerPreCheckout: async (queryId, approved, errorMessage) => {
      const result = await call("answerPreCheckoutQuery", {
        pre_checkout_query_id: queryId, ok: approved,
        ...(approved ? {} : { error_message: errorMessage }),
      }, 3000);
      if (result !== true) throw new SupportError("unavailable");
    },
    thank: async (chatId, text) => {
      const result = await call("sendMessage", { chat_id: chatId, text, link_preview_options: { is_disabled: true } }, 5000);
      if (!result || typeof result !== "object" || !("message_id" in result) ||
          !Number.isSafeInteger(result.message_id) || Number(result.message_id) <= 0 || !("chat" in result) ||
          !result.chat || typeof result.chat !== "object" || !("id" in result.chat) || result.chat.id !== chatId) throw new SupportError("unavailable");
    },
  };
}

function validInvoiceUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048 || /[\u0000-\u0020\u007f\\]/u.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "t.me" && !url.username && !url.password && !url.port &&
      /^\/\$[A-Za-z0-9_-]+$/u.test(url.pathname) && !url.search && !url.hash;
  } catch { return false; }
}

export function createSupportService(deps: SupportDependencies) {
  return {
    async createStarsInvoice(input: { amount: number; locale: AppLocale; telegramUserId?: number }): Promise<{ url: string }> {
      if (!deps.enabled || !deps.store) throw new SupportError("disabled");
      if (!isStarsAmount(input.amount) || !["uz", "ru", "en"].includes(input.locale) ||
          (input.telegramUserId !== undefined && !isTelegramUserId(input.telegramUserId))) throw new SupportError("invalid-input");
      const id = deps.randomReference();
      if (!/^[A-Za-z0-9_-]{32}$/u.test(id)) throw new SupportError("unavailable");
      const now = deps.now();
      const transaction: SupportTransaction = {
        id, amount: input.amount, currency: "XTR", locale: input.locale,
        createdAt: now, expiresAt: now + SUPPORT_PENDING_USABLE_MS, status: "pending",
        ...(input.telegramUserId === undefined ? {} : { userId: String(input.telegramUserId) }),
      };
      try {
        // Persist before the provider call; no invoice can be accepted without a known record.
        if (!await deps.store.create(transaction)) throw new SupportError("unavailable");
        const copy = supportPaymentCopy[input.locale];
        const url = await deps.provider.createInvoice({ title: copy.title, description: copy.description, payload: SUPPORT_PAYLOAD_PREFIX + id, amount: input.amount });
        if (!validInvoiceUrl(url)) throw new SupportError("unavailable");
        return { url };
      } catch { throw new SupportError("unavailable"); }
    },

    async handleStarsPreCheckout(event: SupportPreCheckoutEvent): Promise<void> {
      if (!validIdentifier(event.queryId, 256)) throw new SupportError("invalid-input");
      let approved = false;
      const incomingLocale = event.languageCode?.toLowerCase().split("-", 1)[0];
      let locale: AppLocale = incomingLocale === "ru" || incomingLocale === "en" ? incomingLocale : "uz";
      const id = supportReference(event.invoicePayload);
      if (deps.enabled && deps.store && id && event.currency === "XTR" && isStarsAmount(event.totalAmount) && isTelegramUserId(event.userId)) {
        try {
          // One atomic reservation binds both payer and checkout query before Telegram is told OK.
          const result = await deps.store.approve({ id, amount: event.totalAmount, userId: event.userId, queryId: event.queryId, now: deps.now() });
          approved = result.approved;
          if (result.locale && result.locale in supportPaymentCopy) locale = result.locale;
        } catch { approved = false; }
      }
      try { await deps.provider.answerPreCheckout(event.queryId, approved, approved ? undefined : supportPaymentCopy[locale].checkoutError); }
      catch { throw new SupportError("unavailable"); }
    },

    async handleStarsSuccessfulPayment(event: SupportSuccessfulPaymentEvent): Promise<void> {
      const id = supportReference(event.invoicePayload);
      if (!id || event.currency !== "XTR" || !isStarsAmount(event.totalAmount) || !isTelegramUserId(event.userId) ||
          event.chatId !== event.userId || !validIdentifier(event.telegramPaymentChargeId, 256)) throw new SupportError("invalid-payment");
      // Do not inspect enabled: disabling new invoices must not discard an already charged receipt.
      if (!deps.store) throw new SupportError("unavailable");
      const token = deps.randomReference();
      if (!/^[A-Za-z0-9_-]{32}$/u.test(token)) throw new SupportError("unavailable");
      try {
        const outcome = await deps.store.recordPayment({ id, amount: event.totalAmount, userId: event.userId, chargeId: event.telegramPaymentChargeId, now: deps.now(), thanksToken: token });
        if (outcome.status === "invalid") throw new SupportError("invalid-payment");
        if (outcome.status === "done") return;
        if (outcome.status === "busy") throw new SupportError("unavailable");
        if (outcome.status !== "send") throw new SupportError("unavailable");
        try {
          await deps.provider.thank(event.chatId, supportPaymentCopy[outcome.transaction.locale].thanks(outcome.transaction.amount));
          if (!await deps.store.completeThanks(id, token, deps.now())) throw new SupportError("unavailable");
        } catch {
          await deps.store.releaseThanks(id, token).catch(() => undefined);
          throw new SupportError("unavailable");
        }
      } catch (error) {
        if (error instanceof SupportError) throw error;
        throw new SupportError("unavailable");
      }
    },
  };
}
