import type { AppLocale } from "../i18n.ts";
import { isStarsAmount } from "../support.ts";
import { BodyTooLargeError, readBoundedText } from "./bounded-text.ts";
import { SupportError } from "./support-core.ts";
import type { AnalysisRateLimit } from "./rate-limit.ts";

interface SupportHttpDependencies {
  enabled: () => boolean;
  limit: (request: Request) => Promise<AnalysisRateLimit>;
  createInvoice: (input: { amount: number; locale: AppLocale }) => Promise<{ url: string }>;
}

const MAX_BODY_BYTES = 1024;

function json(body: unknown, status: number, extra: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ...extra },
  });
}

/** Pure HTTP boundary: tests inject all payment dependencies and never contact Telegram. */
export async function handleSupportStarsRequest(request: Request, deps: SupportHttpDependencies): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method-not-allowed" }, 405, { Allow: "POST" });
  // Browser-only entry point, not authentication: JSON + same origin prevents cross-site invoice creation.
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (origin !== new URL(request.url).origin || (site && site !== "same-origin")) {
    return json({ error: "request-rejected" }, 403);
  }
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    return json({ error: "expected-json" }, 415);
  }
  if (!deps.enabled()) return json({ error: "disabled" }, 503);

  try {
    const limit = await deps.limit(request);
    if (!limit.configured) return json({ error: "unavailable" }, 503);
    if (!limit.allowed) {
      return json({ error: "limited" }, 429, {
        "Retry-After": String(Math.max(1, Math.ceil((limit.reset - Date.now()) / 1000))),
        "RateLimit-Limit": String(limit.limit),
        "RateLimit-Remaining": "0",
      });
    }
    let body: unknown;
    try {
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(3000)]);
      body = JSON.parse(await readBoundedText(request, { maxBytes: MAX_BODY_BYTES, signal }));
    } catch (error) {
      if (error instanceof BodyTooLargeError) return json({ error: "request-too-large" }, 413);
      return json({ error: "invalid-input" }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "invalid-input" }, 400);
    const payload = body as Record<string, unknown>;
    if (Object.keys(payload).length !== 2 || !isStarsAmount(payload.amount) ||
        (payload.locale !== "uz" && payload.locale !== "ru" && payload.locale !== "en")) {
      return json({ error: "invalid-input" }, 400);
    }
    const invoice = await deps.createInvoice({ amount: payload.amount, locale: payload.locale });
    // A defensive boundary check keeps non-Telegram URLs and unexpected provider fields off the wire.
    if (!/^https:\/\/t\.me\/\$[A-Za-z0-9_-]+$/u.test(invoice.url)) throw new SupportError("unavailable");
    return json({ url: invoice.url }, 200);
  } catch (error) {
    const code = error instanceof SupportError && error.code === "disabled" ? "disabled" : "unavailable";
    return json({ error: code }, 503);
  }
}
