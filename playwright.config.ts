import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const inheritedEnvironment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] =>
    Boolean(entry[1]),
  ),
);
const useProductionServer = process.env.PLAYWRIGHT_USE_START === "1";
// This fixture uses fake credentials and intercepted browser requests only.
// Never use it for live payment validation or against a production server.
const supportFixture = process.env.SUPPORT_STARS_E2E === "1" && !useProductionServer;
const testServiceEnvironment = {
  ...inheritedEnvironment,
  // Default CI/development tests use the in-memory limiter, never a developer's
  // live Redis. Production smoke tests still require genuine configured Redis.
  ...(!useProductionServer && process.env.LIVE_GEMINI_E2E !== "1" ? {
    UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "",
    KV_REST_API_URL: "", KV_REST_API_TOKEN: "",
  } : {}),
  TELEGRAM_BOT_TOKEN: "playwright-bot-token-not-for-live-traffic",
  TELEGRAM_WEBHOOK_SECRET: "playwright-telegram-webhook-secret-at-least-32-chars",
  ML_API_JWT_SECRET: "playwright-only-service-secret-with-at-least-32-bytes",
  RATE_LIMIT_HASH_SECRET:
    "playwright-only-rate-limit-secret-with-at-least-32-bytes",
  RATE_LIMIT_NAMESPACE: `rufact-e2e-${process.pid}`,
  SUPPORT_STARS_ENABLED: supportFixture ? "true" : "false",
  SUPPORT_WALLET_ENABLED: "false",
  SUPPORT_CONTACT_URL: supportFixture ? "https://support.example.invalid/help" : "",
  ...(supportFixture ? {
    TELEGRAM_BOT_TOKEN: ["123456789", "playwright_fake_bot_token_no_live_payments"].join(":"),
    UPSTASH_REDIS_REST_URL: "https://redis.example.invalid",
    UPSTASH_REDIS_REST_TOKEN: "playwright-fake-redis-token",
  } : {}),
  GEMINI_REVIEW_ENABLED:
    process.env.LIVE_GEMINI_E2E === "1"
      ? inheritedEnvironment.GEMINI_REVIEW_ENABLED ?? "true"
      : "false",
};
const webPort = process.env.PLAYWRIGHT_PORT ?? "3000";
const baseURL = `http://localhost:${webPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  outputDir: join(tmpdir(), "rufact-playwright-results"),
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
      },
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 7"],
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
      },
    },
  ],
  webServer: [
    {
      // A test worker loads the models once. Watching the entire repo/node_modules
      // adds startup work and can restart inference while a browser test is running.
      command: "uv run --project ml uvicorn rufact_ml.main:app --app-dir ml/src --port 8010",
      url: "http://127.0.0.1:8010/health",
      env: testServiceEnvironment,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `${useProductionServer ? "npm run start" : "npm run dev"} -- --port ${webPort}`,
      url: baseURL,
      env: {
        ...testServiceEnvironment,
        ML_API_URL: "http://127.0.0.1:8010/predict",
      },
      reuseExistingServer: !useProductionServer && webPort === "3000",
      timeout: 120_000,
    },
  ],
});
