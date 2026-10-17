import { expect, test, type Page } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AnalysisResponse } from "../../lib/api";
import type { AppLocale } from "../../lib/i18n";
import { changeLanguage } from "./helpers/language";

// Real browser -> local /api/analyze -> bounded exact calculation. Unlike the
// source presentation fixtures, this suite never substitutes the API response.
const localized = {
  en: { confirmed: "CONFIRMED", contradicted: "CONTRADICTED", badge: "Calculation", correct: "Correct equation", unequal: "They are not equal." },
  ru: { confirmed: "ПОДТВЕРЖДЕНО", contradicted: "ОПРОВЕРГНУТО", badge: "Вычисление", correct: "Верное равенство", unequal: "Они не равны." },
  uz: { confirmed: "TASDIQLANDI", contradicted: "RAD ETILDI", badge: "Hisoblash", correct: "To‘g‘ri tenglik", unequal: "Ular teng emas." },
} as const;

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" || message.type() === "warning") errors.push(message.text());
  });
  return errors;
}

async function submitEquation(page: Page, locale: AppLocale, expression: string, correct: boolean) {
  await page.locator("#analysis-text").fill(expression);
  const responsePromise = page.waitForResponse(response => response.url().endsWith("/api/analyze") && response.request().method() === "POST");
  await page.locator(".analyzer-submit").click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  expect(response.request().postDataJSON()).toMatchObject({ text: expression, locale });
  const payload = await response.json() as AnalysisResponse;
  expect(payload).toMatchObject({ label: correct ? "REAL" : "FAKE", confidence: 0,
    meta: { engine: "calculation", externalSourcesChecked: false }, calculation: { expression, correct } });
  expect(payload).not.toHaveProperty("geminiReview");

  const headline = page.locator('[data-verdict-basis="calculation"]');
  await expect(headline).toHaveAttribute("data-verdict-label", correct ? "REAL" : "FAKE");
  await expect(headline).toContainText(correct ? localized[locale].confirmed : localized[locale].contradicted);
  await expect(page.getByTestId("calculation-original")).toHaveText(expression);
  await expect(page.locator("#analysis-text")).toHaveValue(expression);
  await expect(page.locator(".analysis-result")).toContainText(localized[locale].badge);
  await expect(page.locator('.analysis-result [role="meter"], .analysis-result [data-statistical-summary], .analysis-result [data-statistical-placeholder]')).toHaveCount(0);
  await expect(page.locator('.analysis-result a[href*="yandex.ru/search"], .analysis-result #source-check-heading')).toHaveCount(0);
  await expect(headline).not.toContainText(/%|Tavily|Gemini|HIGH RISK|LOW RISK/);
  return payload;
}

async function expectHealthy(page: Page, errors: string[]) {
  await expect(page.locator("nextjs-portal [role=dialog], vite-error-overlay, #webpack-dev-server-client-overlay")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
}

for (const locale of ["en", "ru", "uz"] as const) {
  test(`real arithmetic API confirms 2+2=4 and corrects 2+2=5 in ${locale}`, async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await page.setViewportSize(testInfo.project.name.startsWith("mobile") ? { width: 390, height: 844 } : { width: 1440, height: 1100 });
    // Keep each local test's memory rate-limit bucket independent. These are
    // documentation-only IPs, never credentials or a production bypass.
    await page.context().setExtraHTTPHeaders({ "x-vercel-forwarded-for": `2001:db8:${process.pid.toString(16)}:${testInfo.line.toString(16)}:${testInfo.project.name.startsWith("mobile") ? "2" : "1"}::1` });
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page).toHaveTitle(/RuFact/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await changeLanguage(page, locale);

    const supported = await submitEquation(page, locale, "2+2=4", true);
    expect(supported.calculation).toMatchObject({ leftValue: "4", rightValue: "4", correction: null });
    await expect(page.getByTestId("calculation-correction")).toHaveCount(0);

    const contradicted = await submitEquation(page, locale, "2+2=5", false);
    expect(contradicted.calculation).toMatchObject({ leftValue: "4", rightValue: "5" });
    const panel = page.getByTestId("calculation-panel");
    await expect(panel).toContainText(localized[locale].correct);
    await expect(page.getByTestId("calculation-reason")).toContainText(localized[locale].unequal);
    await expect(page.getByTestId("calculation-reason")).toContainText("4");
    await expect(page.getByTestId("calculation-reason")).toContainText("5");
    await expect(page.getByTestId("calculation-correction")).toHaveText(/2\s*\+\s*2\s*=\s*4/);
    expect(await panel.evaluate(element => !element.closest("details:not([open])"))).toBe(true);

    await page.locator(".analysis-result").scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(tmpdir(), `rufact-calculation-${locale}-${testInfo.project.name}.png`), fullPage: false });
    await expectHealthy(page, errors);
  });
}

test("decimal arithmetic stays exact even when internet providers are disabled", async ({ page }, testInfo) => {
  test.skip(process.env.LIVE_GEMINI_E2E === "1", "This test explicitly verifies provider-disabled local configuration");
  const errors = collectErrors(page);
  await page.context().setExtraHTTPHeaders({ "x-vercel-forwarded-for": `2001:db8:${process.pid.toString(16)}:de:${testInfo.project.name.startsWith("mobile") ? "2" : "1"}::1` });
  await page.goto("/");
  await changeLanguage(page, "en");
  await expect(page.locator("#use-gemini")).toHaveCount(0);
  await expect(page.getByTestId("analyzer-source-notice")).toBeVisible();
  const result = await submitEquation(page, "en", "0.1+0.2=0.3", true);
  expect(result.calculation).toMatchObject({ leftValue: "0.3", rightValue: "0.3", correct: true });
  await expect(page.getByTestId("calculation-reason")).toContainText("Both sides evaluate to 0.3");
  await expect(page.getByTestId("calculation-correction")).toHaveCount(0);
  await expectHealthy(page, errors);
});

test("calculation history recomputes the equation instead of trusting the stored label or score", async ({ page }) => {
  const errors = collectErrors(page);
  const analyzedAt = new Date(Date.now() - 120_000).toISOString();
  await page.addInitScript(({ analyzedAt }) => {
    localStorage.setItem("rufact:analysis-history:v1", JSON.stringify({ version: 1, enabled: true, items: [{
      id: "stored-calculation", text: "2+2=5", label: "REAL", confidence: 1, analyzedAt,
      meta: { engine: "calculation", version: "arithmetic-v1" },
    }] }));
  }, { analyzedAt });
  const requests: string[] = [];
  page.on("request", request => { if (/\/api\/analyze(?:\?|$)/.test(request.url())) requests.push(request.url()); });
  await page.goto("/");
  await changeLanguage(page, "en");
  await page.locator("#analysis-history-trigger").click();
  const history = page.getByRole("dialog", { name: "Check history", exact: true });
  await expect(history.getByRole("listitem")).toHaveCount(1);
  await expect(history).toContainText("Calculation");
  await expect(history).not.toContainText(/ML ·|100%|0%/);
  await expect(history.locator("time")).toHaveAttribute("datetime", analyzedAt);
  await history.getByRole("button", { name: "Open", exact: true }).click();
  await expect(history).not.toBeVisible();
  await expect(page.locator('[data-verdict-basis="calculation"]')).toHaveAttribute("data-verdict-label", "FAKE");
  await expect(page.getByTestId("calculation-original")).toHaveText("2+2=5");
  await expect(page.getByTestId("calculation-correction")).toHaveText(/2\s*\+\s*2\s*=\s*4/);
  await expect(page.locator('.analysis-result [role="meter"]')).toHaveCount(0);
  const expectedTimestamp = await page.evaluate(value => new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value)), analyzedAt);
  await expect(page.locator(".analysis-result time")).toHaveText(expectedTimestamp);
  expect(requests).toEqual([]);
  await expectHealthy(page, errors);
});

test("invalid calculation history restores as unavailable, never as a stored green statistical score", async ({ page }) => {
  const errors = collectErrors(page);
  const text = "2+2=5. Tashkent is the capital of Uzbekistan.";
  await page.addInitScript(({ text }) => {
    localStorage.setItem("rufact:analysis-history:v1", JSON.stringify({ version: 1, enabled: true, items: [{
      id: "invalid-calculation", text, label: "REAL", confidence: 1, analyzedAt: new Date().toISOString(),
      meta: { engine: "calculation", version: "arithmetic-v1", language: "en" },
    }] }));
  }, { text });
  await page.goto("/");
  await changeLanguage(page, "en");
  await page.locator("#analysis-history-trigger").click();
  const history = page.getByRole("dialog", { name: "Check history", exact: true });
  await history.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.locator('[data-verdict-basis="unavailable"]')).toHaveAttribute("data-verdict-label", "UNSURE");
  await expect(page.locator("#analysis-text")).toHaveValue(text);
  await expect(page.locator('.analysis-result [role="meter"], .analysis-result [data-verdict-basis="statistical"]')).toHaveCount(0);
  await expect(page.getByTestId("calculation-panel")).toHaveCount(0);
  await expectHealthy(page, errors);
});
