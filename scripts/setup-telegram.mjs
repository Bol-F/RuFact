import { randomBytes } from "node:crypto";
import { telegramCommandRegistrations } from "./telegram-commands.mjs";

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
const baseUrl = process.env.TELEGRAM_WEB_APP_URL?.trim();
const mode = process.argv[2] || "status";

if (mode === "secret") {
  process.stdout.write(randomBytes(32).toString("base64url") + "\n");
  process.exit(0);
}
if (!token) { console.error("Set TELEGRAM_BOT_TOKEN in .env.local first."); process.exit(1); }

async function call(method, payload = {}) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json();
  if (!response.ok || body.ok !== true) throw new Error("Telegram rejected the request. Check the token and configuration.");
  return body.result;
}

try {
  if (mode === "register") {
    if (!secret || !/^[A-Za-z0-9_-]{32,256}$/.test(secret)) throw new Error("Set TELEGRAM_WEBHOOK_SECRET (32–256 letters, digits, _ or -).");
    if (!baseUrl) throw new Error("Set TELEGRAM_WEB_APP_URL to the production HTTPS website URL.");
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Use an HTTPS website origin, without a path or credentials.");
    const health = await fetch(new URL("/api/telegram/webhook", url), {
      method: "POST", headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": secret },
      body: "{}", signal: AbortSignal.timeout(10_000),
    });
    if (!health.ok) throw new Error("Deploy the bot environment variables first: the webhook configuration check failed.");
    // Telegram selects these menus from its user's language, independently of
    // the bot's saved response preference. Unknown languages use Uzbek.
    for (const registration of telegramCommandRegistrations()) {
      await call("setMyCommands", registration);
    }
    await call("setWebhook", {
      url: new URL("/api/telegram/webhook", url).href,
      // successful_payment is a field on message; it is not an update type.
      secret_token: secret, allowed_updates: ["message", "pre_checkout_query"], max_connections: 4,
    });
    const bot = await call("getMe");
    console.log(`Ready: https://t.me/${bot.username}`);
  } else if (mode === "status") {
    const bot = await call("getMe");
    const status = await call("getWebhookInfo");
    console.log(JSON.stringify({ username: bot.username, webhookUrl: status.url, pendingUpdates: status.pending_update_count, lastError: status.last_error_message || null }, null, 2));
  } else { throw new Error("Use status, register or secret."); }
} catch (error) {
  // Never print network errors: their URL could contain the bot token.
  console.error(error instanceof TypeError ? "Network request failed. Check connectivity and configuration." : error.message);
  process.exitCode = 1;
}
