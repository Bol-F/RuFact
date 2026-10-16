import { NextResponse } from "next/server";
import { parseTelegramPaymentUpdate, parseTelegramUpdate, verifyTelegramSecret } from "@/lib/server/telegram-core";
import { processTelegramMessage, processTelegramPayment } from "@/lib/server/telegram";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_BODY_BYTES = 24_000;
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!botToken || !secret) return NextResponse.json({ error: "Bot is not configured" }, { status: 503, headers });
  if (!verifyTelegramSecret(request.headers.get("x-telegram-bot-api-secret-token"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    return NextResponse.json({ error: "Expected JSON" }, { status: 415, headers });
  }
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Update too large" }, { status: 413, headers });
  }
  let update: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Empty body");
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        return NextResponse.json({ error: "Update too large" }, { status: 413, headers });
      }
      chunks.push(value);
    }
    update = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers });
  }
  try {
    const payment = parseTelegramPaymentUpdate(update);
    if (payment) {
      // Pre-checkout has a 10-second Telegram deadline. Payment handlers also
      // remain active when new support or ordinary AI requests are disabled.
      await processTelegramPayment(payment);
      return NextResponse.json({ ok: true }, { headers });
    }
    const message = parseTelegramUpdate(update);
    if (!message) return NextResponse.json({ ok: true }, { headers });
    const status = await processTelegramMessage(message, botToken);
    // Retry active deliveries instead of acknowledging work that has not finished.
    return NextResponse.json({ ok: status !== "busy" }, { status: status === "busy" ? 503 : 200, headers });
  } catch {
    // No token, input text, Redis credentials or provider response goes into logs.
    return NextResponse.json({ error: "Delivery temporarily unavailable" }, { status: 503, headers });
  }
}
