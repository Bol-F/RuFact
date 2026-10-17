import { timingSafeEqual } from "node:crypto";
import type { AppLocale } from "../i18n";
import type { GeminiAssessment } from "./gemini-review-core";
import { escapeTelegramHtml, telegramButtonCommand, telegramNotice, telegramSupportCopy, telegramUi } from "./telegram-ui.ts";
import { parseChatMessages, recentChatMessages, safeChatSources, type ChatMessage, type ChatReply } from "../chat.ts";
import { localChatReply } from "../chat-local.ts";
import { claimCopy } from "../claim-copy.ts";
import { deriveClaimLabel, resolveClaimEvidence, safeSourceHref } from "../claim-evidence.ts";
import type { GeminiClaim } from "../gemini-review";
import { arithmeticCopy, arithmeticExplanation, evaluateArithmeticClaim, type ArithmeticClaimResult } from "../arithmetic.ts";
import { isStarsAmount } from "../support.ts";

export interface TelegramMessage {
  updateId: number;
  chatId: number;
  messageId: number;
  text: string;
  language: AppLocale;
}

export const botCopy = {
  uz: {
    welcome: "RuFact — matn va manbalarni tekshirish.\n\nMatn yuboring yoki xabarni shu yerga forward qiling (5000 belgigacha). O‘zbek lotin va kirill, rus va ingliz tillari qo‘llanadi.\n\n/uz /ru /en — javob tili\n/help — yordam\n/privacy — maxfiylik\n\nTekshirish uchun matn Tavily va Google Gemini xizmatlariga yuboriladi. Shaxsiy yoki maxfiy ma’lumot yubormang.",
    selected: "Javob tili: O‘zbekcha. Matn yuboring (lotin yoki kirill).",
    privacy: "Fakt savollari va qisqa kontekst Tavily va Google Gemini’ga yuboriladi. Salomlashish va tanishish uchun tashqi qidiruv ishlatilmaydi. Oxirgi 3 savol-javob Redis’da 30 daqiqa harakatsizlikdan keyin o‘chadi; /new yoki /stop ularni darhol o‘chiradi. Chat rejimi /stop, /check yoki /forget tanlamaguningizcha saqlanadi. Til 30 kun, yetkazish va takrorlar holati 48 soat saqlanadi. Qayta yetkazish uchun javob 48 soatgacha saqlanishi mumkin. /forget — barcha sozlamalar va kontekstni o‘chirish. Telegram xabarlarni o‘z qoidalariga ko‘ra saqlaydi. Maxfiy ma’lumot yubormang.",
    forgotten: "Til, chat rejimi va suhbat konteksti o‘chirildi.",
    unsupported: "Matn yuboring yoki matnli xabarni forward qiling. Fayl yuklash uchun saytni oching.",
    tooLong: "Matn 5000 belgidan oshmasligi kerak. Uni qismlarga bo‘lib yuboring.",
    limited: "So‘rovlar limiti tugadi. Birozdan keyin qayta urinib ko‘ring.",
    unavailable: "Manbalarni hozir tekshirib bo‘lmadi. Bu matn rost yoki yolg‘on degani emas. Keyinroq qayta urinib ko‘ring.",
    sources: "Manbalar", claims: "Da’volar", title: "RuFact · Manbalar bo‘yicha tekshiruv", open: "RuFact saytini ochish",
    disclaimer: "Baho topilgan manbalarga asoslanadi. Muhim da’volarni asl manbada tekshiring.",
    labels: { REAL: "Manbalar tasdiqlaydi", FAKE: "Manbalar qarshi dalil ko‘rsatadi", UNSURE: "Dalil yetarli emas / aralash" },
  },
  ru: {
    welcome: "RuFact — проверка текста по источникам.\n\nПришлите текст или перешлите сообщение (до 5000 символов). Поддерживаются узбекский (латиница и кириллица), русский и английский.\n\n/uz /ru /en — язык ответа\n/help — помощь\n/privacy — конфиденциальность\n\nДля проверки текст отправляется Tavily и Google Gemini. Не отправляйте личные или секретные данные.",
    selected: "Язык ответа: Русский. Пришлите текст для проверки.",
    privacy: "Фактические вопросы и краткий контекст отправляются Tavily и Google Gemini. Приветствия и знакомство не используют внешний поиск. Последние 3 пары сообщений удаляются из Redis через 30 минут бездействия; /new или /stop удаляет их сразу. Режим чата сохраняется до /stop, /check или /forget. Язык хранится 30 дней; доставка и повторы — 48 часов. Ответ для повторной доставки может храниться до 48 часов. /forget удаляет настройки и контекст. Telegram хранит сообщения по своим правилам. Не отправляйте секретные данные.",
    forgotten: "Язык, режим чата и контекст разговора удалены.",
    unsupported: "Пришлите текст или перешлите текстовое сообщение. Для загрузки файла откройте сайт.",
    tooLong: "Максимум 5000 символов. Отправьте текст частями.",
    limited: "Лимит запросов исчерпан. Повторите попытку позже.",
    unavailable: "Сейчас не удалось проверить источники. Это не означает, что текст правдивый или ложный. Попробуйте позже.",
    sources: "Источники", claims: "Утверждения", title: "RuFact · Проверка по источникам", open: "Открыть сайт RuFact",
    disclaimer: "Оценка основана на найденных источниках. Важные утверждения проверяйте в первоисточниках.",
    labels: { REAL: "Источники подтверждают", FAKE: "Источники показывают противоречия", UNSURE: "Недостаточно / смешанные данные" },
  },
  en: {
    welcome: "RuFact — check text against sources.\n\nSend text or forward a message (up to 5000 characters). Uzbek (Latin and Cyrillic), Russian and English are supported.\n\n/uz /ru /en — response language\n/help — help\n/privacy — privacy\n\nChecks send text to Tavily and Google Gemini. Do not send personal or confidential information.",
    selected: "Response language: English. Send a text to check.",
    privacy: "Factual questions and short context go to Tavily and Google Gemini. Greetings and introductions use no external search. The last 3 exchanges expire from Redis after 30 minutes of inactivity; /new or /stop clears them immediately. Chat mode remains until /stop, /check or /forget. Language expires after 30 days; duplicate and delivery state after 48 hours. Replies awaiting delivery can be stored for up to 48 hours. /forget removes settings and context. Telegram retains messages under its own policies. Don’t send confidential data.",
    forgotten: "Your language, chat mode and conversation context were removed.",
    unsupported: "Send text or forward a text message. Open the website to upload a file.",
    tooLong: "Maximum 5000 characters. Send the text in smaller parts.",
    limited: "The request limit has been reached. Try again later.",
    unavailable: "Sources could not be checked right now. This does not mean the text is true or false. Please try later.",
    sources: "Sources", claims: "Claims", title: "RuFact · Source check", open: "Open RuFact website",
    disclaimer: "This assessment uses the sources found. Check important claims in the original sources.",
    labels: { REAL: "Supported by sources", FAKE: "Contradicted by sources", UNSURE: "Insufficient / mixed evidence" },
  },
};

export function verifyTelegramSecret(received: string | null, expected: string | undefined) {
  if (!expected || !/^[A-Za-z0-9_-]{32,256}$/.test(expected) || !received) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function parseTelegramUpdate(value: unknown): TelegramMessage | null {
  if (!value || typeof value !== "object") return null;
  const update = value as Record<string, unknown>;
  // Payment service messages must never become empty fact-check requests, even
  // if their payment fields are malformed or an alternate caller uses this parser.
  if (parseTelegramPaymentUpdate(value)) return null;
  if (!Number.isSafeInteger(update.update_id) || (update.update_id as number) < 0) return null;
  if (!update.message || typeof update.message !== "object") return null;
  const message = update.message as Record<string, unknown>;
  const chat = message.chat as Record<string, unknown> | undefined;
  const from = message.from as Record<string, unknown> | undefined;
  if (!chat || chat.type !== "private" || !Number.isSafeInteger(chat.id) || (chat.id as number) <= 0 || !from || from.is_bot !== false || from.id !== chat.id) return null;
  if (!Number.isSafeInteger(message.message_id) || (message.message_id as number) <= 0) return null;
  const language = typeof from.language_code === "string" ? from.language_code.split("-", 1)[0] : "uz";
  return {
    updateId: update.update_id as number,
    chatId: chat.id as number,
    messageId: message.message_id as number,
    text: typeof message.text === "string" ? message.text.trim() : typeof message.caption === "string" ? message.caption.trim() : "",
    language: language === "ru" || language === "en" ? language : "uz",
  };
}

export interface TelegramPreCheckoutEvent {
  queryId: string;
  userId: number;
  currency: string;
  totalAmount: number;
  invoicePayload: string;
  languageCode?: string;
}

export interface TelegramSuccessfulPaymentEvent {
  chatId: number;
  userId: number;
  currency: string;
  totalAmount: number;
  invoicePayload: string;
  telegramPaymentChargeId: string;
  providerPaymentChargeId?: string;
}

export type TelegramPaymentUpdate =
  | { kind: "pre_checkout"; event: TelegramPreCheckoutEvent }
  | { kind: "successful_payment"; event: TelegramSuccessfulPaymentEvent }
  | { kind: "ignored_payment" };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function boundedPaymentString(value: unknown, maxBytes: number) {
  return typeof value === "string" && value.length > 0 && Buffer.byteLength(value, "utf8") <= maxBytes && !/[\u0000-\u001f\u007f]/u.test(value) ? value : null;
}

/** Separately discriminates financial updates before chat parsing or AI limits. */
export function parseTelegramPaymentUpdate(value: unknown): TelegramPaymentUpdate | null {
  const update = record(value);
  if (!update) return null;
  const message = record(update.message);
  const edited = record(update.edited_message);
  const hasCheckout = Object.hasOwn(update, "pre_checkout_query");
  const hasPayment = !!message && Object.hasOwn(message, "successful_payment");
  const editedPayment = !!edited && Object.hasOwn(edited, "successful_payment");
  if (!hasCheckout && !hasPayment && !editedPayment) return null;
  const ignored: TelegramPaymentUpdate = { kind: "ignored_payment" };
  if (!Number.isSafeInteger(update.update_id) || (update.update_id as number) < 0 || editedPayment
    || Object.keys(update).length !== 2 || (hasCheckout && !!message)) return ignored;
  if (hasCheckout) {
    const query = record(update.pre_checkout_query);
    const from = record(query?.from);
    const queryId = boundedPaymentString(query?.id, 256);
    if (!query || !queryId || !from || from.is_bot !== false || !Number.isSafeInteger(from.id) || (from.id as number) <= 0) return ignored;
    const languageCode = boundedPaymentString(from.language_code, 32);
    // Preserve a valid query ID so malformed financial fields receive an explicit
    // refusal within Telegram's deadline instead of falling through to AI chat.
    return { kind: "pre_checkout", event: {
      queryId, userId: from.id as number,
      currency: boundedPaymentString(query.currency, 16) ?? "",
      totalAmount: Number.isSafeInteger(query.total_amount) ? query.total_amount as number : -1,
      invoicePayload: boundedPaymentString(query.invoice_payload, 128) ?? "",
      ...(languageCode && /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u.test(languageCode) ? { languageCode } : {}),
    } };
  }
  if (!message) return ignored;
  const chat = record(message.chat);
  const from = record(message.from);
  const payment = record(message.successful_payment);
  if (!chat || chat.type !== "private" || !Number.isSafeInteger(chat.id) || (chat.id as number) <= 0
    || !from || from.is_bot !== false || from.id !== chat.id
    || !Number.isSafeInteger(message.message_id) || (message.message_id as number) <= 0 || !payment) return ignored;
  const currency = boundedPaymentString(payment.currency, 16);
  const invoicePayload = boundedPaymentString(payment.invoice_payload, 128);
  const telegramPaymentChargeId = boundedPaymentString(payment.telegram_payment_charge_id, 256);
  if (!currency || !invoicePayload || !telegramPaymentChargeId || !Number.isSafeInteger(payment.total_amount) || (payment.total_amount as number) <= 0) return ignored;
  if (payment.provider_payment_charge_id !== undefined && payment.provider_payment_charge_id !== "" && !boundedPaymentString(payment.provider_payment_charge_id, 256)) return ignored;
  // Recurring/physical-goods fields are not part of this one-off support flow.
  if (payment.is_recurring === true || payment.is_first_recurring === true || payment.subscription_expiration_date !== undefined || payment.shipping_option_id !== undefined || payment.order_info !== undefined) return ignored;
  return { kind: "successful_payment", event: {
    chatId: chat.id as number, userId: from.id as number, currency,
    totalAmount: payment.total_amount as number, invoicePayload, telegramPaymentChargeId,
    ...(typeof payment.provider_payment_charge_id === "string" ? { providerPaymentChargeId: payment.provider_payment_charge_id } : {}),
  } };
}

export async function handleTelegramPaymentUpdate(update: TelegramPaymentUpdate, handlers: {
  preCheckout: (event: TelegramPreCheckoutEvent) => Promise<void>;
  successfulPayment: (event: TelegramSuccessfulPaymentEvent) => Promise<void>;
}) {
  if (update.kind === "pre_checkout") await handlers.preCheckout(update.event);
  if (update.kind === "successful_payment") await handlers.successfulPayment(update.event);
}

function shorten(text: string, length: number) {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

export function formatTelegramAssessment(result: GeminiAssessment, locale: AppLocale) {
  const copy = botCopy[locale];
  if (result.status !== "complete") return copy.unavailable;
  const detailCopy = claimCopy[locale];
  const rank = (claim: GeminiClaim) => claim.kind === "FACTUAL" && claim.assessment === "CONTRADICTED" ? 0
    : claim.assessment === "MIXED" ? 1 : claim.assessment === "UNVERIFIED" ? 2 : 3;
  const claims = [...result.claims].sort((left, right) => rank(left) - rank(right));
  const sources = result.sources.slice(0, 4).flatMap(source => {
    const href = safeSourceHref(source);
    return href ? [`• <a href="${escapeTelegramHtml(href)}">${escapeTelegramHtml(shorten(source.title.replace(/[\r\n]/g, " "), 65))}</a>`] : [];
  });
  const label = result.promptVersion === "misinfo-tavily-v4" ? deriveClaimLabel(result.claims, result.coverage) : result.label;
  const icon = label === "REAL" ? "🟢" : label === "FAKE" ? "🔴" : "🟡";
  const sections = [`<b>🔎 ${escapeTelegramHtml(copy.title)}</b>`, `<b>${icon} ${escapeTelegramHtml(copy.labels[label])}</b>`];
  if (result.coverage === "partial") sections.push(escapeTelegramHtml(detailCopy.partialCoverage));
  const footer = `<i>${escapeTelegramHtml(copy.disclaimer)}</i>`;
  const omitted = `<i>${escapeTelegramHtml(detailCopy.claimsOmitted)}</i>`;
  const claimHeading = `<b>📌 ${escapeTelegramHtml(copy.claims)}</b>`;
  const blocks: string[] = [];
  // Pack complete blocks after escaping. Cutting a claim or a reason can remove
  // negation, qualifications or the very fact that makes the statement false.
  for (const claim of claims) {
    const evidence = resolveClaimEvidence(claim.evidence, result.sources);
    const correctionEvidence = claim.kind === "FACTUAL" && claim.assessment === "CONTRADICTED"
      ? resolveClaimEvidence(claim.correction?.evidence, result.sources) : [];
    const block = [
      `• <b>${escapeTelegramHtml(detailCopy.claim)}:</b> «${escapeTelegramHtml(claim.quote)}»`,
      `<b>${escapeTelegramHtml(detailCopy.why)}:</b> ${escapeTelegramHtml(claim.explanation)}`,
    ];
    if (claim.correction?.text && correctionEvidence.length) {
      block.push(`<b>${escapeTelegramHtml(detailCopy.correction)}:</b> ${escapeTelegramHtml(claim.correction.text)}`);
    }
    const passages = [evidence[0], correctionEvidence[0]].filter((item, index, items) => item && items.findIndex(previous => previous?.sourceId === item.sourceId && previous?.quote === item.quote) === index);
    for (const item of passages) {
      if (!item) continue;
      block.push(`<b>${escapeTelegramHtml(detailCopy.evidence)}:</b> «${escapeTelegramHtml(item.quote)}»`,
        `<a href="${escapeTelegramHtml(item.source.url)}">${escapeTelegramHtml(shorten(item.source.title.replace(/[\r\n]/g, " "), 65))}</a>`);
    }
    const completeBlock = block.join("\n");
    if ([...sections, claimHeading, ...blocks, completeBlock, omitted, footer].join("\n\n").length <= 4000) blocks.push(completeBlock);
  }
  if (blocks.length) sections.push(`${claimHeading}\n${blocks.join("\n\n")}`);
  if (blocks.length < claims.length) sections.push(omitted);
  const explanation = escapeTelegramHtml(result.explanation);
  if (explanation && [...sections, explanation, footer].join("\n\n").length <= 4000) sections.push(explanation);
  const links: string[] = [];
  const sourceHeading = `<b>🔗 ${escapeTelegramHtml(copy.sources)}</b>`;
  for (const source of sources) {
    if ([...sections, `${sourceHeading}\n${[...links, source].join("\n")}`, footer].join("\n\n").length <= 4000) links.push(source);
  }
  if (links.length) sections.push(`${sourceHeading}\n${links.join("\n")}`);
  return [...sections, footer].join("\n\n");
}

export function formatTelegramCalculation(result: ArithmeticClaimResult, locale: AppLocale) {
  const copy = arithmeticCopy[locale];
  return [
    `<b>🧮 RuFact · ${escapeTelegramHtml(copy.title)}</b>`,
    `<b>${result.correct ? "✅" : "❌"} ${escapeTelegramHtml(result.correct ? copy.correct : copy.incorrect)}</b>`,
    `<b>${escapeTelegramHtml(copy.original)}:</b> ${escapeTelegramHtml(result.expression)}`,
    `<b>${escapeTelegramHtml(copy.why)}:</b> ${escapeTelegramHtml(arithmeticExplanation(result, locale))}`,
    ...(result.correction ? [`<b>${escapeTelegramHtml(copy.correction)}:</b> ${escapeTelegramHtml(result.correction)}`] : []),
    `<i>${escapeTelegramHtml(copy.note)}</i>`,
  ].join("\n\n");
}

export interface TelegramStore {
  get(key: string): Promise<string | null>;
  getMany(keys: string[]): Promise<(string | null)[]>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  setMany(entries: { key: string; value: string; ttl?: number }[]): Promise<void>;
  remove(key: string): Promise<void>;
  removeMany(keys: string[]): Promise<void>;
  claim(key: string, token: string, ttl: number): Promise<boolean>;
  release(key: string, token: string): Promise<void>;
}

export interface TelegramDependencies {
  store: TelegramStore;
  userKey: (chatId: number) => string;
  lockToken: () => string;
  limit: (identifier: string, internet: boolean) => Promise<{ allowed: boolean; configured: boolean }>;
  assess: (text: string, locale: AppLocale) => Promise<GeminiAssessment>;
  chat?: (messages: ChatMessage[], locale: AppLocale) => Promise<ChatReply>;
  typing?: (message: TelegramMessage) => Promise<void>;
  support?: {
    starsEnabled: boolean;
    contactUrl: string | null;
    limit: (identifier: string) => Promise<{ allowed: boolean; configured: boolean }>;
    createInvoice: (input: { amount: number; locale: AppLocale; telegramUserId: number }) => Promise<{ url: string }>;
  };
  send: (message: TelegramMessage, text: string, locale: AppLocale, chatMode?: boolean) => Promise<void>;
}

function supportContact(locale: AppLocale, contactUrl: string | null | undefined) {
  const copy = telegramSupportCopy[locale];
  if (contactUrl) {
    try {
      const url = new URL(contactUrl);
      if (url.protocol === "https:" && !url.username && !url.password) {
        return `<b>${escapeTelegramHtml(copy.paySupport)}</b>\n\n${escapeTelegramHtml(copy.contact)}\n\n<a href="${escapeTelegramHtml(url.href)}">${escapeTelegramHtml(copy.contactLink)}</a>`;
      }
    } catch { /* Missing or unsafe contact must not become a payment link. */ }
  }
  return `${copy.paySupport}\n\n${copy.noContact}`;
}

async function donationReply(message: TelegramMessage, locale: AppLocale, argument: string | undefined, identifier: string, deps: TelegramDependencies) {
  const copy = telegramSupportCopy[locale];
  const intro = `<b>${escapeTelegramHtml(copy.title)}</b>\n\n${escapeTelegramHtml(copy.description)}`;
  if (!deps.support?.starsEnabled) return `${intro}\n\n${escapeTelegramHtml(copy.disabled)}`;
  if (!argument) return `${intro}\n\n${escapeTelegramHtml(copy.choose)}\n\n/terms · /paysupport`;
  const text = argument.trim();
  const amount = Number(text);
  if (!/^\d{1,5}$/u.test(text) || !isStarsAmount(amount)) return `${intro}\n\n${escapeTelegramHtml(copy.invalid)}`;
  try {
    const limit = await deps.support.limit(identifier);
    if (!limit.configured || !limit.allowed) return `${intro}\n\n${escapeTelegramHtml(limit.configured ? botCopy[locale].limited : copy.unavailable)}`;
    const { url: invoiceUrl } = await deps.support.createInvoice({ amount, locale, telegramUserId: message.chatId });
    const url = new URL(invoiceUrl);
    if (url.protocol !== "https:" || url.hostname !== "t.me" || !url.pathname.startsWith("/$") || url.username || url.password || url.port || url.hash || url.search) throw new Error("Invalid invoice URL");
    return `${intro}\n\n<a href="${escapeTelegramHtml(url.href)}">${escapeTelegramHtml(copy.invoice)} · ${amount} ⭐</a>\n\n${escapeTelegramHtml(copy.pending)}\n\n/terms · /paysupport`;
  } catch {
    // Payment/transport errors may contain a token-bearing URL. Never echo them.
    return `${intro}\n\n${escapeTelegramHtml(copy.unavailable)}`;
  }
}

export function formatTelegramChat(reply: ChatReply, locale: AppLocale) {
  if (reply.status !== "complete") return botCopy[locale].unavailable;
  const body = escapeTelegramHtml(shorten(reply.text, 1500));
  const sources = safeChatSources(reply.sources).map((source, index) => `<a href="${escapeTelegramHtml(source.url)}">[${index + 1}] ${escapeTelegramHtml(shorten(source.title, 60))}</a>`);
  const sections = [`<b>💬 ${telegramUi[locale].chatTitle}</b>`, body];
  if ([...sections, ...sources].join("\n\n").length > 3600) sections[1] = escapeTelegramHtml(shorten(reply.text, 300));
  const disclaimer = `<i>${botCopy[locale].disclaimer}</i>`;
  const links: string[] = [];
  for (const source of sources) {
    if ([...sections, ...links, source, disclaimer].join("\n\n").length < 3900) links.push(source);
  }
  if (links.length) sections.push(`<b>🔗 ${botCopy[locale].sources}</b>\n${links.join("\n")}`);
  return (links.length ? [...sections, disclaimer] : sections).join("\n\n");
}

// A failed delivery is retried by Telegram; completed updates never consume providers again.
export async function handleTelegramMessage(message: TelegramMessage, deps: TelegramDependencies): Promise<"done" | "busy" | "duplicate"> {
  const updateKey = `update:${message.updateId}`;
  if (await deps.store.get(`${updateKey}:done`)) return "duplicate";
  const token = deps.lockToken();
  if (!await deps.store.claim(`${updateKey}:lock`, token, 90)) return "busy";
  const identifier = deps.userKey(message.chatId);
  const userLock = `conversation:${identifier}:lock`;
  let ownsUserLock = false;
  try {
    if (await deps.store.get(`${updateKey}:done`)) return "duplicate";
    ownsUserLock = await deps.store.claim(userLock, token, 90);
    if (!ownsUserLock) return "busy";
    const languageKey = `language:${identifier}`;
    const historyKey = `chat:${identifier}`;
    const modeKey = `mode:${identifier}`;
    // Read a bounded snapshot only after obtaining the conversation lease.
    const [savedMode, saved, cached, cachedFormat, cachedLocale] = await deps.store.getMany([
      modeKey, languageKey, `${updateKey}:reply`, `${updateKey}:format`, `${updateKey}:locale`,
    ]);
    let chatMode = savedMode === "chat";
    // A preference is not conversation content. Keep it until an explicit exit.
    // Preserve the migration from earlier, expiring chat-mode preferences.
    if (chatMode) await deps.store.set(modeKey, "chat");
    let locale: AppLocale = saved === "uz" || saved === "ru" || saved === "en" ? saved : message.language;
    let reply = cached;
    if (!reply) {
      const input = telegramButtonCommand(message.text);
      const commandMatch = /^\/(\w+)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/.exec(input);
      const command = commandMatch?.[1]?.toLowerCase();
      const generalLimit = await deps.limit(identifier, false);
      if (!generalLimit.configured) throw new Error("Telegram protection unavailable");
      if (!generalLimit.allowed && !["stop", "forget", "paysupport", "terms", "privacy"].includes(command ?? "")) {
        reply = botCopy[locale].limited;
      } else {
        if (command === "donate") {
          reply = await donationReply(message, locale, commandMatch?.[2], identifier, deps);
        } else if (command === "paysupport") {
          reply = supportContact(locale, deps.support?.contactUrl);
        } else if (command === "terms") {
          reply = `${telegramSupportCopy[locale].terms}\n\n${telegramSupportCopy[locale].termsBody}\n\n${telegramSupportCopy[locale].retention}`;
        } else if (command === "uz" || command === "ru" || command === "en") {
          locale = command;
          await deps.store.set(languageKey, locale, 30 * 86_400);
          reply = chatMode
            ? `${{ uz: "Javob tili: O‘zbekcha.", ru: "Язык ответа: Русский.", en: "Response language: English." }[locale]}\n\n${telegramUi[locale].typing}`
            : botCopy[locale].selected;
        } else if (command === "language") {
          reply = telegramUi[locale].choose;
        } else if (command === "new") {
          await deps.store.remove(historyKey);
          await deps.store.set(modeKey, "chat");
          chatMode = true;
          reply = telegramUi[locale].cleared;
        } else if (command === "chat" && !commandMatch?.[2]) {
          await deps.store.set(modeKey, "chat");
          chatMode = true;
          reply = telegramUi[locale].chatMode;
        } else if (command === "stop") {
          await deps.store.removeMany([modeKey, historyKey]);
          chatMode = false;
          reply = telegramUi[locale].stopped;
        } else if (command === "check" && !commandMatch?.[2]) {
          await deps.store.remove(modeKey);
          chatMode = false;
          reply = telegramUi[locale].checkMode;
        } else if (command === "forget") {
          await deps.store.removeMany([languageKey, historyKey, modeKey]);
          chatMode = false;
          reply = botCopy[locale].forgotten;
        } else if (command === "privacy") {
          reply = `${botCopy[locale].privacy}\n\n${arithmeticCopy[locale].title}: ${arithmeticCopy[locale].note}\n\n${telegramSupportCopy[locale].retention}`;
        } else if (command && command !== "check" && command !== "chat") {
          reply = `${botCopy[locale].welcome}\n\n💬 /chat — AI chat\n🔎 /check — ${telegramUi[locale].check}\n🧹 /new — ${telegramUi[locale].clear}\n⏹ /stop — ${telegramUi[locale].stop}\n/donate — ${telegramSupportCopy[locale].button}\n/paysupport — ${telegramSupportCopy[locale].paySupport}`;
        } else {
          const text = (command === "check" || command === "chat" ? commandMatch?.[2] ?? "" : message.text).trim();
          if (command === "chat") {
            if (!chatMode) await deps.store.set(modeKey, "chat");
            chatMode = true;
          }
          if (command === "check") {
            await deps.store.remove(modeKey);
            chatMode = false;
          }
          if (!text) reply = botCopy[locale].unsupported;
          else if (text.length > (chatMode ? 2000 : 5000)) reply = chatMode ? (locale === "ru" ? "Максимум 2000 символов в AI-чате." : locale === "en" ? "Maximum 2000 characters in AI chat." : "AI chatda ko‘pi bilan 2000 belgi.") : botCopy[locale].tooLong;
          else {
            const local = chatMode ? localChatReply([{ role: "user", content: text }], locale) : null;
            const calculation = !chatMode ? evaluateArithmeticClaim(text) : null;
            const limit = local || calculation ? { allowed: true, configured: true } : await deps.limit(identifier, true);
            if (!limit.configured) throw new Error("Telegram protection unavailable");
            if (!limit.allowed) reply = botCopy[locale].limited;
            else {
              await deps.typing?.(message).catch(() => {});
              if (chatMode) {
                let history: ChatMessage[] = [];
                try {
                  const saved = JSON.parse(await deps.store.get(historyKey) || "[]");
                  if (Array.isArray(saved) && saved.length && saved.length <= 6) {
                    const candidate = parseChatMessages(recentChatMessages([...saved, { role: "user", content: text }]));
                    if (candidate) history = candidate.slice(0, -1);
                  }
                } catch { /* Expired or malformed context starts a fresh conversation. */ }
                const messages = recentChatMessages([...history, { role: "user", content: text }]);
                const result = local ?? await deps.chat?.(messages, locale) ?? { status: "unavailable", reason: "not-configured" };
                reply = formatTelegramChat(result, locale);
                if (result.status === "complete") {
                  await deps.store.set(historyKey, JSON.stringify([...messages, { role: "assistant", content: result.text.slice(0, 2000) }].slice(-6)), 1800);
                }
              } else reply = calculation ? formatTelegramCalculation(calculation, locale)
                : formatTelegramAssessment(await deps.assess(text, locale), locale);
            }
          }
        }
      }
      if (!reply.startsWith("<b>")) reply = telegramNotice(reply);
      // Transactional cache writes retain the same 48-hour retry TTLs.
      await deps.store.setMany([
        { key: `${updateKey}:reply`, value: reply, ttl: 2 * 86_400 },
        { key: `${updateKey}:format`, value: "html", ttl: 2 * 86_400 },
        { key: `${updateKey}:locale`, value: locale, ttl: 2 * 86_400 },
      ]);
    } else {
      if (cachedFormat !== "html") reply = telegramNotice(reply);
      if (cachedLocale === "uz" || cachedLocale === "ru" || cachedLocale === "en") locale = cachedLocale;
    }
    await deps.send(message, reply, locale, chatMode);
    // Never delete the retry reply before the completion marker is durable.
    await deps.store.set(`${updateKey}:done`, "1", 2 * 86_400);
    await deps.store.removeMany([`${updateKey}:reply`, `${updateKey}:locale`, `${updateKey}:format`]);
    return "done";
  } finally {
    // Both independent, ownership-checked releases must finish even if one fails.
    const released = await Promise.allSettled([
      ...(ownsUserLock ? [deps.store.release(userLock, token)] : []),
      deps.store.release(`${updateKey}:lock`, token),
    ]);
    const failure = released.find(result => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  }
}
