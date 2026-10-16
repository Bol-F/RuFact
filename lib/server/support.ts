import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { Redis } from "@upstash/redis";
import type { AppLocale } from "../i18n";
import type { SupportAvailability } from "../support";
import { redisCredentials } from "./rate-limit";
import { createRedisSupportStore } from "./support-store";
import {
  createSupportService, createTelegramSupportProvider, supportAvailabilityFromEnvironment, supportBotId, SupportError,
  type SupportPreCheckoutEvent, type SupportSuccessfulPaymentEvent,
} from "./support-core";

let redisClient: Redis | undefined;

function configuration() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const validBotToken = botToken && supportBotId(botToken) ? botToken : null;
  const credentials = redisCredentials();
  const availability = supportAvailabilityFromEnvironment(process.env);
  return {
    botToken: validBotToken, credentials,
    enabled: availability.starsEnabled,
  };
}

export function getSupportAvailability(): SupportAvailability {
  // SUPPORT_WALLET_ENABLED cannot activate an unimplemented, unreviewed payment provider.
  return supportAvailabilityFromEnvironment(process.env);
}

function service() {
  const config = configuration();
  let store = null;
  if (config.credentials && config.botToken) {
    redisClient ??= new Redis({ ...config.credentials, retry: false, signal: () => AbortSignal.timeout(2500) });
    const namespace = process.env.RATE_LIMIT_NAMESPACE?.trim().replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48) || "rufact";
    // Stable across token rotation: delayed receipts/refunds belong to the bot, not its current credential.
    const botFingerprint = createHash("sha256").update(supportBotId(config.botToken)!).digest("hex").slice(0, 16);
    store = createRedisSupportStore(redisClient, `${namespace}:support:${botFingerprint}:`);
  }
  return createSupportService({
    enabled: config.enabled, store, now: Date.now,
    randomReference: () => randomBytes(24).toString("base64url"),
    provider: createTelegramSupportProvider(config.botToken),
  });
}

export async function createStarsInvoice(input: { amount: number; locale: AppLocale; telegramUserId?: number }): Promise<{ url: string }> {
  try { return await service().createStarsInvoice(input); }
  catch (error) { if (error instanceof SupportError) throw error; throw new SupportError("unavailable"); }
}

export async function handleStarsPreCheckout(event: SupportPreCheckoutEvent): Promise<void> {
  try { await service().handleStarsPreCheckout(event); }
  catch (error) { if (error instanceof SupportError) throw error; throw new SupportError("unavailable"); }
}

export async function handleStarsSuccessfulPayment(event: SupportSuccessfulPaymentEvent): Promise<void> {
  try { await service().handleStarsSuccessfulPayment(event); }
  catch (error) { if (error instanceof SupportError) throw error; throw new SupportError("unavailable"); }
}
