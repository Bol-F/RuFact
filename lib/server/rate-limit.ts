import { createHash, createHmac } from "node:crypto";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const DEFAULT_LIMIT = 10;
const DEFAULT_WINDOW_SECONDS = 60;
const DEFAULT_EXTRACT_LIMIT = 4;
const DEFAULT_EXTRACT_WINDOW_SECONDS = 60;
const DEFAULT_INTERNET_LIMIT = 5;
const DEFAULT_INTERNET_WINDOW_SECONDS = 300;
const DEFAULT_INTERNET_DAILY_LIMIT = 30;
const DEFAULT_SUPPORT_LIMIT = 5;
const DEFAULT_SUPPORT_WINDOW_SECONDS = 600;
const DEFAULT_SUPPORT_DAILY_LIMIT = 100;
const REDIS_REQUEST_TIMEOUT_MS = 2_500;
const RATE_LIMIT_TIMEOUT_MS = 3_000;

type RateLimitScope = "analyze" | "extract" | "internet" | "internet-global" | "telegram" | "support" | "support-global";

interface MemoryWindow {
  count: number;
  reset: number;
}

export interface AnalysisRateLimit {
  allowed: boolean;
  configured: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

const memoryWindows = new Map<string, MemoryWindow>();
const distributedLimiters = new Map<string, Ratelimit>();

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function rateLimitSettings(scope: RateLimitScope) {
  if (scope === "support") {
    return {
      limit: positiveInteger(process.env.SUPPORT_RATE_LIMIT_MAX, DEFAULT_SUPPORT_LIMIT),
      windowSeconds: positiveInteger(process.env.SUPPORT_RATE_LIMIT_WINDOW_SECONDS, DEFAULT_SUPPORT_WINDOW_SECONDS),
    };
  }
  if (scope === "support-global") {
    return {
      limit: positiveInteger(process.env.SUPPORT_DAILY_LIMIT, DEFAULT_SUPPORT_DAILY_LIMIT),
      windowSeconds: 86_400,
    };
  }
  if (scope === "telegram") {
    return { limit: 10, windowSeconds: 60 };
  }
  if (scope === "extract") {
    return {
      limit: positiveInteger(
        process.env.EXTRACT_RATE_LIMIT_MAX_REQUESTS,
        DEFAULT_EXTRACT_LIMIT,
      ),
      windowSeconds: positiveInteger(
        process.env.EXTRACT_RATE_LIMIT_WINDOW_SECONDS,
        DEFAULT_EXTRACT_WINDOW_SECONDS,
      ),
    };
  }
  if (scope === "internet") {
    return {
      limit: positiveInteger(
        process.env.INTERNET_RATE_LIMIT_MAX_REQUESTS,
        DEFAULT_INTERNET_LIMIT,
      ),
      windowSeconds: positiveInteger(
        process.env.INTERNET_RATE_LIMIT_WINDOW_SECONDS,
        DEFAULT_INTERNET_WINDOW_SECONDS,
      ),
    };
  }
  if (scope === "internet-global") {
    return {
      limit: positiveInteger(
        process.env.INTERNET_DAILY_MAX_REQUESTS,
        DEFAULT_INTERNET_DAILY_LIMIT,
      ),
      windowSeconds: 86_400,
    };
  }
  return {
    limit: positiveInteger(process.env.RATE_LIMIT_MAX_REQUESTS, DEFAULT_LIMIT),
    windowSeconds: positiveInteger(
      process.env.RATE_LIMIT_WINDOW_SECONDS,
      DEFAULT_WINDOW_SECONDS,
    ),
  };
}

export function redisCredentials(env: NodeJS.ProcessEnv = process.env) {
  const url = (
    env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL
  )?.trim();
  const token = (
    env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN
  )?.trim();

  return url && token ? { url, token } : null;
}

export function clientAddress(request: Request) {
  const forwarded = (
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for")
  )
    ?.split(",", 1)[0]
    ?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "local";
}

function identifierFor(request: Request) {
  const address = clientAddress(request);
  const secret = process.env.RATE_LIMIT_HASH_SECRET?.trim();

  if (process.env.NODE_ENV === "production" && (!secret || secret.length < 32)) {
    return null;
  }

  return secret
    ? createHmac("sha256", secret).update(address, "utf8").digest("hex")
    : createHash("sha256").update(address, "utf8").digest("hex");
}

export function consumeMemoryLimit(
  identifier: string,
  now: number,
  limit: number,
  windowSeconds: number,
): AnalysisRateLimit {
  const existing = memoryWindows.get(identifier);
  const window =
    existing && existing.reset > now
      ? existing
      : { count: 0, reset: now + windowSeconds * 1_000 };
  window.count += 1;
  memoryWindows.set(identifier, window);

  if (memoryWindows.size > 2_000) {
    for (const [key, value] of memoryWindows) {
      if (value.reset <= now) memoryWindows.delete(key);
    }
  }

  return {
    allowed: window.count <= limit,
    configured: true,
    limit,
    remaining: Math.max(0, limit - window.count),
    reset: window.reset,
  };
}

function getDistributedLimiter(
  scope: RateLimitScope,
  limit: number,
  windowSeconds: number,
) {
  const namespace =
    process.env.RATE_LIMIT_NAMESPACE?.trim().replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48) ||
    "rufact";
  const cacheKey = `${namespace}:${scope}:${limit}:${windowSeconds}`;
  const existing = distributedLimiters.get(cacheKey);
  if (existing) return existing;

  const credentials = redisCredentials();
  if (!credentials) return null;

  const limiter = new Ratelimit({
    redis: new Redis({
      ...credentials,
      retry: false,
      signal: () => AbortSignal.timeout(REDIS_REQUEST_TIMEOUT_MS),
    }),
    limiter:
      scope === "internet-global" || scope === "support-global"
        ? Ratelimit.fixedWindow(limit, `${windowSeconds} s`)
        : Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
    prefix: `${namespace}:${scope}`,
    analytics: false,
    timeout: RATE_LIMIT_TIMEOUT_MS,
  });
  distributedLimiters.set(cacheKey, limiter);
  return limiter;
}

async function rateLimitRequest(
  request: Request,
  scope: RateLimitScope,
  identifierOverride?: string,
): Promise<AnalysisRateLimit> {
  const { limit, windowSeconds } = rateLimitSettings(scope);
  const identifier = identifierOverride ?? identifierFor(request);
  if (!identifier) {
    return { allowed: false, configured: false, limit, remaining: 0, reset: 0 };
  }

  const scopedIdentifier = `${scope}:${identifier}`;
  const limiter = getDistributedLimiter(scope, limit, windowSeconds);
  if (limiter) {
    try {
      const result = await limiter.limit(scopedIdentifier);
      if (result.reason === "timeout") {
        return { allowed: false, configured: false, limit, remaining: 0, reset: 0 };
      }
      return {
        allowed: result.success,
        configured: true,
        limit: result.limit,
        remaining: result.remaining,
        reset: result.reset,
      };
    } catch {
      return { allowed: false, configured: false, limit, remaining: 0, reset: 0 };
    }
  }

  if (process.env.NODE_ENV === "production") {
    return { allowed: false, configured: false, limit, remaining: 0, reset: 0 };
  }

  return consumeMemoryLimit(
    scopedIdentifier,
    Date.now(),
    limit,
    windowSeconds,
  );
}

export function rateLimitAnalysisRequest(request: Request) {
  return rateLimitRequest(request, "analyze");
}

export function rateLimitExtractRequest(request: Request) {
  return rateLimitRequest(request, "extract");
}

export async function rateLimitInternetRequest(request: Request) {
  const perClient = await rateLimitRequest(request, "internet");
  if (!perClient.configured || !perClient.allowed) return perClient;

  return rateLimitRequest(request, "internet-global", "daily-provider-budget");
}

// The identity comes only from a verified Telegram webhook, never a client header.
export function rateLimitTelegramRequest(identifier: string) {
  return rateLimitRequest(new Request("https://telegram.invalid"), "telegram", identifier);
}

export async function rateLimitTelegramInternet(identifier: string) {
  const perUser = await rateLimitRequest(new Request("https://telegram.invalid"), "internet", `telegram:${identifier}`);
  if (!perUser.configured || !perUser.allowed) return perUser;
  return rateLimitRequest(new Request("https://telegram.invalid"), "internet-global", "daily-provider-budget");
}

// Invoice creation has its own budget; payments never consume the AI/search allowance.
export async function rateLimitSupportRequest(request: Request) {
  const perClient = await rateLimitRequest(request, "support");
  if (!perClient.configured || !perClient.allowed) return perClient;
  return rateLimitRequest(request, "support-global", "daily-invoice-budget");
}

export async function rateLimitTelegramSupport(identifier: string) {
  const request = new Request("https://telegram.invalid");
  const perUser = await rateLimitRequest(request, "support", `telegram:${identifier}`);
  if (!perUser.configured || !perUser.allowed) return perUser;
  return rateLimitRequest(request, "support-global", "daily-invoice-budget");
}

export function rateLimitHeaders(result: AnalysisRateLimit) {
  const headers: Record<string, string> = {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
  };
  if (result.reset > 0) {
    headers["RateLimit-Reset"] = String(Math.ceil(result.reset / 1_000));
  }
  return headers;
}
