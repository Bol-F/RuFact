import { expect, test } from "@playwright/test";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { changeLanguage } from "./helpers/language";
import type { AnalysisResponse } from "../../lib/api";
import { getPublicVerdict } from "../../lib/api";
import type { AppLocale } from "../../lib/i18n";
import type { TextLanguage } from "../../lib/text-language";
import { resolveAnalysis } from "../../lib/server/analysis-routing";
import { DEFAULT_GEMINI_MODEL, requestGeminiAssessment } from "../../lib/server/gemini-review-core";
import { requestTavilyEvidence } from "../../lib/server/tavily-search";
import { consumeMemoryLimit } from "../../lib/server/rate-limit";

const LATIN_TEXT = "Bu xabar rost emas va uning manbasi yo‘q.";
const CYRILLIC_TEXT = "Бу хабар рост эмас ва унинг манбаси йўқ.";
const FAKE_TAVILY_KEY = "routing-test-only-tavily-key";
const FAKE_GEMINI_KEY = "routing-test-only-gemini-key";
type ProviderMode = "complete" | "no-sources" | "search-limited" | "gemini-limited" | "invalid-gemini";
type ProviderCall = { kind: "tavily" | "gemini" | "ml"; body: Record<string, unknown>; headers: IncomingHttpHeaders };

// Real HTTP + the production parsers, but every provider request stays on loopback.
// No environment secrets or external provider quotas are used by this fixture.
async function fakeProviders(mode: ProviderMode = "complete") {
  const calls: ProviderCall[] = [];
  const server = createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
      const kind = request.url?.slice(1);
      if (kind !== "tavily" && kind !== "gemini" && kind !== "ml") {
        response.writeHead(404).end();
        return;
      }
      calls.push({ kind, body, headers: request.headers });
      response.setHeader("Content-Type", "application/json");
      if ((kind === "tavily" && mode === "search-limited") || (kind === "gemini" && mode === "gemini-limited")) {
        response.writeHead(429).end(JSON.stringify({ error: "Fake quota exceeded" }));
      } else if (kind === "tavily") {
        response.end(JSON.stringify({
          query: body.query,
          results: mode === "no-sources" ? [] : [{
            title: "Deterministic primary source",
            url: "https://example.org/uzbek-routing-source",
            content: "The supplied source supports the quoted claim for this routing test.",
          }],
        }));
      } else if (kind === "gemini") {
        const content = body.contents as { parts: { text: string }[] }[];
        const userText = content[0].parts[0].text.split("--- BEGIN UNTRUSTED USER TEXT ---\n")[1].split("\n--- END UNTRUSTED USER TEXT ---")[0];
        const instruction = (body.systemInstruction as { parts: { text: string }[] }).parts[0].text;
        const explanation = instruction.includes("in English")
          ? "The retrieved source supports this claim in the test."
          : instruction.includes("in Russian")
            ? "Найденный источник подтверждает утверждение в тесте."
            : "Topilgan manba ushbu tekshirilgan da’voni tasdiqlaydi.";
        response.end(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{
          text: JSON.stringify(mode === "invalid-gemini" ? { label: "REAL" } : {
            label: "REAL", certainty: "high", explanation, warningSigns: [],
            claims: [{ quote: userText, kind: "FACTUAL", assessment: "SUPPORTED", explanation }],
          }),
        }] } }] }));
      } else {
        response.end(JSON.stringify({
          label: "REAL", confidence: 0.88,
          meta: { engine: "external-model", engineVersion: "routing-test-ml", externalSourcesChecked: false, language: "ru" },
        }));
      }
    } catch {
      response.writeHead(500).end(JSON.stringify({ error: "Invalid fake request" }));
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let mlCalls = 0;
  const assessmentInputs: { text: string; locale: AppLocale; language: TextLanguage }[] = [];
  const fetchImpl = (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const path = url.host === "api.tavily.com" && url.pathname === "/search" ? "/tavily"
      : url.host === "generativelanguage.googleapis.com" && url.pathname.endsWith(":generateContent") ? "/gemini" : null;
    if (!path) throw new Error("The fake provider fixture refuses an unexpected destination");
    return fetch(`${origin}${path}`, init);
  };
  const deps = {
    requestMl: async (text: string) => {
      mlCalls += 1;
      const response = await fetch(`${origin}/ml`, { method: "POST", body: JSON.stringify({ text }) });
      return { ok: true as const, payload: await response.json() as AnalysisResponse };
    },
    getAssessment: async (text: string, locale: AppLocale, language: TextLanguage) => {
      assessmentInputs.push({ text, locale, language });
      const search = await requestTavilyEvidence({ text, locale: language === "unknown" ? locale : language, apiKey: FAKE_TAVILY_KEY, fetchImpl });
      if (!search.ok) return { status: "unavailable" as const, provider: "gemini" as const, reason: search.reason };
      return requestGeminiAssessment({
        text, locale, apiKey: FAKE_GEMINI_KEY, model: DEFAULT_GEMINI_MODEL, evidence: search.evidence, fetchImpl,
      });
    },
  };
  return {
    calls, deps, assessmentInputs, mlCalls: () => mlCalls,
    close: () => new Promise<void>((resolve, reject) => {
      server.closeIdleConnections();
      server.close(error => error ? reject(error) : resolve());
    }),
  };
}

test("Latin and Cyrillic Uzbek go directly through Tavily then Gemini in every output locale", async () => {
  const providers = await fakeProviders();
  try {
    for (const text of [LATIN_TEXT, CYRILLIC_TEXT, "Toshkent O‘zbekistonning poytaxti."]) {
      for (const locale of ["uz", "en", "ru"] as const) {
        const before = providers.calls.length;
        const result = await resolveAnalysis({ text, locale, mlConfigured: true }, providers.deps);
        expect(providers.calls.slice(before).map(call => call.kind)).toEqual(["tavily", "gemini"]);
        expect(providers.assessmentInputs.at(-1)).toEqual({ text, locale, language: "uz" });
        expect(result.label).toBe("UNSURE");
        expect(result.confidence).toBe(0);
        expect(result.meta).toMatchObject({ engine: "unavailable", engineVersion: "uzbek-source-only-v1", inputLanguage: "uz" });
        expect(result.geminiReview).toMatchObject({ status: "complete", label: "REAL", agreesWithPrimary: null, externalSourcesChecked: true });
        expect(getPublicVerdict(result)).toMatchObject({ basis: "sources", label: "REAL", confidence: null });
        const [search, review] = providers.calls.slice(before);
        expect(search.headers.authorization).toBe(`Bearer ${FAKE_TAVILY_KEY}`);
        expect(search.body).toMatchObject({ query: text, language: "uz", filter_by_language: false });
        expect(review.headers["x-goog-api-key"]).toBe(FAKE_GEMINI_KEY);
        const languageInstruction = (review.body.systemInstruction as { parts: { text: string }[] }).parts[0].text;
        expect(languageInstruction).toContain(locale === "en" ? "in English" : locale === "ru" ? "in Russian" : "in Uzbek");
        if (result.geminiReview?.status === "complete") {
          expect(result.geminiReview.sources).toEqual([{ id: "source-1", title: "Deterministic primary source", url: "https://example.org/uzbek-routing-source" }]);
        }
      }
    }
    expect(providers.mlCalls()).toBe(0);
  } finally {
    await providers.close();
  }
});

test("explicitly disabling source verification sends Uzbek to neither ML nor providers", async () => {
  const providers = await fakeProviders();
  try {
    for (const text of [LATIN_TEXT, CYRILLIC_TEXT]) {
      for (const locale of ["uz", "ru", "en"] as const) {
        const result = await resolveAnalysis({ text, locale, useGemini: false, mlConfigured: true }, providers.deps);
        expect(result.label).toBe("UNSURE");
        expect(result.meta?.engine).toBe("unavailable");
        expect(getPublicVerdict(result)).toMatchObject({ label: "UNSURE", confidence: null });
        expect(result.geminiReview?.status).not.toBe("complete");
      }
    }
    expect(providers.calls).toEqual([]);
    expect(providers.assessmentInputs).toEqual([]);
    expect(providers.mlCalls()).toBe(0);
  } finally {
    await providers.close();
  }
});

test("missing source configuration stays unverified and never falls back to an unsupported Uzbek ML verdict", async () => {
  for (const reason of ["not-configured", "search-not-configured", "search-rate-limited"] as const) {
    let assessmentCalls = 0;
    let mlCalls = 0;
    const result = await resolveAnalysis({ text: CYRILLIC_TEXT, locale: "en", useGemini: true, mlConfigured: true }, {
      requestMl: async () => { mlCalls += 1; return { ok: false as const }; },
      getAssessment: async () => {
        assessmentCalls += 1;
        return { status: "unavailable" as const, provider: "gemini" as const, reason };
      },
    });
    expect(result.label).toBe("UNSURE");
    expect(result.geminiReview).toMatchObject({ status: "unavailable", reason });
    expect(getPublicVerdict(result)).toMatchObject({ basis: "unavailable", label: "UNSURE", confidence: null });
    expect(assessmentCalls).toBe(1);
    expect(mlCalls).toBe(0);
  }
});

test("empty search, provider quotas and invalid Gemini output cannot produce a REAL Uzbek answer", async () => {
  const reasons = {
    "no-sources": "no-search-results", "search-limited": "search-rate-limited",
    "gemini-limited": "rate-limited", "invalid-gemini": "invalid-response",
  } as const;
  for (const mode of Object.keys(reasons) as (keyof typeof reasons)[]) {
    const providers = await fakeProviders(mode);
    try {
      const result = await resolveAnalysis({ text: LATIN_TEXT, locale: "ru", useGemini: true, mlConfigured: true }, providers.deps);
      expect(result.label).toBe("UNSURE");
      expect(result.geminiReview).toMatchObject({ status: "unavailable", reason: reasons[mode] });
      expect(getPublicVerdict(result)).toMatchObject({ basis: "unavailable", label: "UNSURE" });
      expect(providers.calls.map(call => call.kind)).toEqual(mode === "no-sources" || mode === "search-limited" ? ["tavily"] : ["tavily", "gemini"]);
      expect(providers.mlCalls()).toBe(0);
    } finally {
      await providers.close();
    }
  }
});

test("the guarded source assessment denies an exhausted budget before contacting either provider", async () => {
  const providers = await fakeProviders();
  const identifier = `routing-source-budget-${process.pid}-${Date.now()}`;
  try {
    const deps = { ...providers.deps, getAssessment: async (text: string, locale: AppLocale, language: TextLanguage) => {
      const limit = consumeMemoryLimit(identifier, 1_000_000, 1, 300);
      if (!limit.allowed) return { status: "unavailable" as const, provider: "gemini" as const, reason: "search-rate-limited" as const };
      return providers.deps.getAssessment(text, locale, language);
    } };
    const input = { text: LATIN_TEXT, locale: "uz" as const, useGemini: true, mlConfigured: true };
    expect((await resolveAnalysis(input, deps)).geminiReview?.status).toBe("complete");
    const denied = await resolveAnalysis(input, deps);
    expect(denied.geminiReview).toMatchObject({ status: "unavailable", reason: "search-rate-limited" });
    expect(getPublicVerdict(denied)).toMatchObject({ label: "UNSURE", basis: "unavailable" });
    expect(providers.calls.map(call => call.kind)).toEqual(["tavily", "gemini"]);
    expect(providers.mlCalls()).toBe(0);
  } finally {
    await providers.close();
  }
});

test("supported Russian and English content still calls ML regardless of interface locale", async () => {
  const providers = await fakeProviders();
  try {
    for (const text of ["Сегодня в Москве открылся новый городской парк.", "A new public park opened in London today."]) {
      const result = await resolveAnalysis({ text, locale: "uz", useGemini: false, mlConfigured: true }, providers.deps);
      expect(result.meta?.engine).toBe("external-model");
      expect(getPublicVerdict(result)).toMatchObject({ basis: "statistical", label: "REAL", confidence: 0.88 });
    }
    expect(providers.calls.map(call => call.kind)).toEqual(["ml", "ml"]);
    expect(providers.mlCalls()).toBe(2);
    expect(providers.assessmentInputs).toEqual([]);
  } finally {
    await providers.close();
  }
});

test("POST still validates input and CSRF before an opted-out Uzbek check returns an unverified result", async ({ request }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("desktop"), "Server validation once");
  const headers = { "x-vercel-forwarded-for": `2001:db8:${process.pid.toString(16)}:a::1` };
  expect((await request.post("/api/analyze", { headers: { ...headers, origin: "https://evil.example" }, data: { text: LATIN_TEXT, useGemini: false } })).status()).toBe(403);
  expect((await request.post("/api/analyze", { headers, data: { text: "", useGemini: false } })).status()).toBe(400);
  expect((await request.post("/api/analyze", { headers, data: { text: LATIN_TEXT, useGemini: "false" } })).status()).toBe(400);
  expect((await request.post("/api/analyze", { headers, data: { text: "a".repeat(5001), useGemini: false } })).status()).toBe(400);
  const valid = await request.post("/api/analyze", { headers, data: { text: CYRILLIC_TEXT, locale: "en", useGemini: false } });
  expect(valid.status()).toBe(200);
  expect(valid.headers()["cache-control"]).toBe("private, no-store");
  const result = await valid.json() as AnalysisResponse;
  expect(result).toMatchObject({ label: "UNSURE", confidence: 0, meta: { engine: "unavailable", engineVersion: "uzbek-source-only-v1", inputLanguage: "uz" } });
  expect(result.geminiReview?.status).not.toBe("complete");
});

test("public analyze rate limiting still returns 429 for repeated Uzbek source-opt-out requests", async ({ request }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("desktop"), "Server rate-limit regression once");
  test.setTimeout(90_000);
  const configuredLimit = Number.parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? "10", 10);
  test.skip(!Number.isSafeInteger(configuredLimit) || configuredLimit < 1 || configuredLimit > 20, "Bounded local rate-limit check requires a 1–20 request test allowance");
  const headers = { "x-vercel-forwarded-for": `2001:db8:${process.pid.toString(16)}:b::1` };
  for (let count = 0; count < configuredLimit; count += 1) {
    const allowed = await request.post("/api/analyze", { headers, data: { text: LATIN_TEXT, locale: "ru", useGemini: false } });
    expect(allowed.status()).toBe(200);
    expect((await allowed.json()).label).toBe("UNSURE");
  }
  const denied = await request.post("/api/analyze", { headers, data: { text: LATIN_TEXT, locale: "ru", useGemini: false } });
  expect(denied.status()).toBe(429);
  expect(denied.headers()["ratelimit-remaining"]).toBe("0");
  expect(Number(denied.headers()["retry-after"])).toBeGreaterThanOrEqual(1);
  expect(await denied.json()).not.toHaveProperty("label");
});

test("Uzbek source-only replies render usable links, no ML score, and no runtime errors on desktop and phone", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error" || message.type() === "warning") errors.push(message.text()); });
  const providers = await fakeProviders();
  const locale = testInfo.project.name.startsWith("mobile") ? "uz" : "en";
  try {
    await page.route("**/api/analyze", async route => {
      const input = route.request().postDataJSON() as { text: string; locale: AppLocale };
      // The existing isolated server suite disables live provider calls. This fixture
      // proves provider parsers → orchestration → client sanitization → rendered UI.
      await route.fulfill({ json: await resolveAnalysis({ ...input, useGemini: true, mlConfigured: true }, providers.deps) });
    });
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page).toHaveTitle(/RuFact/);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(".analysis-result")).toBeVisible();
    await expect(page.locator("nextjs-portal [role=dialog]")).toHaveCount(0);
    await changeLanguage(page, locale);
    for (const text of [LATIN_TEXT, CYRILLIC_TEXT]) {
      await page.locator("#analysis-text").fill(text);
      await expect(page.locator('[data-uzbek-routing="source-only"]')).toContainText("Tavily");
      await page.locator(".analyzer-submit").click();
      const verdict = page.locator('[data-verdict-basis="sources"]');
      await expect(verdict).toHaveAttribute("data-verdict-label", "REAL");
      await expect(page.locator('.analysis-result [role="meter"]')).toHaveCount(0);
      await expect(page.locator("[data-statistical-summary]")).toHaveCount(0);
      await expect(page.locator("[data-statistical-placeholder]")).toHaveCount(0);
      const source = page.locator('.analysis-result a[href="https://example.org/uzbek-routing-source"]');
      await expect(source).toBeVisible();
      await expect(source).toHaveAttribute("target", "_blank");
    }
    expect(providers.mlCalls()).toBe(0);
    expect(providers.calls.map(call => call.kind)).toEqual(["tavily", "gemini", "tavily", "gemini"]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator(".analysis-result").scrollIntoViewIfNeeded();
    await expect(page.locator(".analysis-result")).toHaveCSS("opacity", "1");
    await page.screenshot({ path: join(tmpdir(), `rufact-uz-direct-${testInfo.project.name}.png`), fullPage: false });
    expect(errors).toEqual([]);
  } finally {
    await providers.close();
  }
});
