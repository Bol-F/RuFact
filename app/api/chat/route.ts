import { NextResponse } from "next/server";
import { parseChatMessages } from "@/lib/chat";
import { isAppLocale } from "@/lib/i18n";
import { getAiChatReply } from "@/lib/server/ai-chat";
import { rateLimitAnalysisRequest, rateLimitInternetRequest, rateLimitHeaders } from "@/lib/server/rate-limit";
import { isGeminiReviewConfigured } from "@/lib/server/gemini-review";
import { localChatReply } from "@/lib/chat-local";
import { isSearchTopic } from "@/lib/search-topics";

export const runtime = "nodejs";
export const maxDuration = 40;
const MAX_BODY_BYTES = 32_000;
const headers = { "Cache-Control": "private, no-store" };
function json(body: unknown, status = 200, extra: HeadersInit = {}) {
  return NextResponse.json(body, { status, headers: { ...headers, ...Object.fromEntries(new Headers(extra)) } });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if ((site && site !== "same-origin" && site !== "same-site") || (origin && origin !== new URL(request.url).origin)) return json({ error: "Request rejected" }, 403);
  const limit = await rateLimitAnalysisRequest(request);
  if (!limit.configured) return json({ error: "Protection unavailable" }, 503);
  if (!limit.allowed) return json({ status: "unavailable", reason: "limited" }, 429, { ...rateLimitHeaders(limit), "Retry-After": String(Math.max(1, Math.ceil((limit.reset - Date.now()) / 1000))) });
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return json({ error: "Expected JSON" }, 415);
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return json({ error: "Request too large" }, 413);
  let body: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Empty body" }, 400);
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) { await reader.cancel(); return json({ error: "Request too large" }, 413); }
      chunks.push(value);
    }
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!body || typeof body !== "object") return json({ error: "Invalid conversation" }, 400);
  const payload = body as Record<string, unknown>;
  const messages = parseChatMessages(payload.messages);
  if (!messages || !isAppLocale(payload.locale)) return json({ error: "Invalid conversation or language" }, 400);
  if (payload.topic !== undefined && !isSearchTopic(payload.topic)) return json({ error: "Invalid search topic" }, 400);
  const local = localChatReply(messages, payload.locale);
  if (local) return json(local);
  if (!isGeminiReviewConfigured()) return json({ status: "unavailable", reason: "not-configured" }, 503);
  const budget = await rateLimitInternetRequest(request);
  if (!budget.configured) return json({ error: "Protection unavailable" }, 503);
  if (!budget.allowed) return json({ status: "unavailable", reason: "limited" }, 429, { "Retry-After": String(Math.max(1, Math.ceil((budget.reset - Date.now()) / 1000))) });
  const reply = await getAiChatReply(messages, payload.locale, request.signal, payload.topic ?? "general");
  return json(reply, reply.status === "complete" ? 200 : 503);
}
