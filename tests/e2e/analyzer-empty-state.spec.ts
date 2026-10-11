import { expect, test, type Page } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analysisFixture } from "./helpers/analysis";
import { changeLanguage, type Locale } from "./helpers/language";

const headings: Record<Locale, string> = {
  uz: "Tahlil natijasi",
  ru: "Результат анализа",
  en: "Analysis result",
};
const requiredMessages: Record<Locale, string> = {
  uz: "Tekshiriladigan matnni kiriting.",
  ru: "Введите текст, который нужно проверить.",
  en: "Enter the text you want to check.",
};

async function expectNoVerdict(page: Page) {
  const result = page.locator(".analysis-result");
  await expect(result.getByRole("meter")).toHaveCount(0);
  await expect(result.locator('section[aria-label$=": FAKE"], section[aria-label$=": REAL"]')).toHaveCount(0);
  await expect(result.locator("time")).toHaveCount(0);
  await expect(result).not.toContainText(/\b(?:FAKE|REAL)\b|91%|2024|Демо-анализ|Demo analysis|Demo tahlil/);
  await expect(result.getByRole("region")).toHaveCount(0);
}

async function expectEmptyResult(page: Page, locale: Locale) {
  const result = page.locator(".analysis-result.result-empty");
  await expect(result).toBeVisible();
  await expect(result.getByRole("heading", { level: 2 })).toHaveText(headings[locale]);
  await expect(result.locator(".result-empty-body p")).not.toHaveText("");
  await expect(result.getByRole("button")).toHaveCount(0);
  await expectNoVerdict(page);
}

test("fresh analyzer stays empty in all languages and reloads without automatic checking", async ({ page }, testInfo) => {
  const errors: string[] = [];
  const automaticRequests: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("request", request => {
    if (/\/api\/(?:analyze|chat)(?:\?|$)/.test(request.url())) automaticRequests.push(request.url());
  });
  // If a regression sends a request, intercept it rather than contacting providers.
  await page.route("**/api/analyze", route => route.fulfill({ json: analysisFixture("FAKE", 0.87) }));
  await page.route("**/api/chat", route => route.fulfill({ json: { status: "complete", text: "Unexpected automatic request", sources: [] } }));
  await page.goto("/");
  await expect(page).toHaveTitle(/RuFact/);
  const input = page.locator("#analysis-text");
  for (const locale of ["uz", "ru", "en"] as const) {
    await changeLanguage(page, locale);
    await expect(input).toHaveValue("");
    await expect(page.locator("#text-counter")).toHaveText("0 / 5000");
    await expect(page.locator('.text-analyzer [aria-pressed="true"]')).toHaveCount(0);
    await expectEmptyResult(page, locale);
    await page.locator(".analyzer-submit").click();
    await expect(page.locator("#text-validation")).toHaveText(requiredMessages[locale]);
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toBeFocused();
    await expectEmptyResult(page, locale);
    expect(automaticRequests).toEqual([]);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-locale", locale);
    await expect(input).toHaveValue("");
    await expect(page.locator("#text-validation")).toHaveCount(0);
    await expectEmptyResult(page, locale);
    expect(automaticRequests).toEqual([]);
  }
  const portal = page.locator("nextjs-portal");
  const overlay = await portal.count() ? await portal.evaluate(element => element.shadowRoot?.textContent ?? "") : "";
  expect(overlay).not.toMatch(/Build Error|Runtime Error/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator(".analysis-result").scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(tmpdir(), `rufact-empty-result-${testInfo.project.name}.png`) });
  expect(errors).toEqual([]);
});

test("examples only fill a draft; a submitted result clears and restores from opted-in history", async ({ page }) => {
  const requests: { text: string; locale: string }[] = [];
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/analyze", async route => {
    requests.push(route.request().postDataJSON());
    await pending;
    await route.fulfill({ json: analysisFixture("FAKE", 0.87) });
  });
  await page.goto("/");
  await changeLanguage(page, "ru");
  const input = page.locator("#analysis-text");
  const clear = page.getByRole("button", { name: "Очистить текст", exact: true });
  await expect(clear).toBeDisabled();
  await page.locator("#analysis-history-trigger").click();
  const history = page.getByRole("dialog", { name: "История проверок", exact: true });
  await history.getByRole("button", { name: "Включить локальную историю", exact: true }).click();
  await history.getByRole("button", { name: "Закрыть историю", exact: true }).click();

  await page.getByRole("button", { name: "Новость", exact: true }).click();
  await expect(input).toHaveValue(/Росстата/);
  const submittedText = await input.inputValue();
  await expectEmptyResult(page, "ru");
  expect(requests).toEqual([]);
  await page.locator(".analyzer-submit").click();
  try {
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0]).toMatchObject({ text: submittedText, locale: "ru" });
    await expect(page.locator(".analysis-result")).toHaveAttribute("aria-busy", "true");
    await expect(clear).toBeDisabled();
    await expectNoVerdict(page);
  } finally {
    release();
  }
  const verdict = page.locator('.analysis-result section[aria-label$=": FAKE"]');
  await expect(verdict).toBeVisible();
  await expect(verdict).toContainText("87%");
  await expect(page.locator(".analysis-result time")).toBeVisible();
  await expect(page.getByRole("region", { name: "Действия с результатом", exact: true })).toBeVisible();
  // Even after manual text deletion, Clear must still be available to dismiss the result.
  await input.fill("");
  await expect(clear).toBeEnabled();
  await expect(verdict).toBeVisible();
  await clear.click();
  await expect(input).toHaveValue("");
  await expectEmptyResult(page, "ru");
  await expect(clear).toBeDisabled();
  expect(requests).toHaveLength(1);

  await page.locator("#analysis-history-trigger").click();
  await expect(history.getByRole("listitem")).toHaveCount(1);
  await history.getByRole("button", { name: "Открыть", exact: true }).click();
  await expect(history).not.toBeVisible();
  await expect(input).toHaveValue(submittedText);
  await expect(verdict).toBeVisible();
  await expect(verdict).toContainText("87%");
  expect(requests).toHaveLength(1);
});

test("real submitted results and unsent drafts survive language changes but are not auto-loaded on reload", async ({ page }) => {
  const requests: unknown[] = [];
  await page.route("**/api/analyze", route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: analysisFixture("REAL", 0.83) });
  });
  await page.goto("/");
  await changeLanguage(page, "ru");
  const input = page.locator("#analysis-text");
  const submitted = "Ташкент — столица Узбекистана.";
  await input.fill(submitted);
  await page.locator(".analyzer-submit").click();
  const verdict = page.locator('.analysis-result section[aria-label$=": REAL"]');
  await expect(verdict).toBeVisible();
  const draft = "A different draft has not been checked yet. Ўзбекистон.";
  await input.fill(draft);
  for (const locale of ["uz", "en", "ru"] as const) {
    await changeLanguage(page, locale);
    await expect(input).toHaveValue(draft);
    await expect(verdict).toBeVisible();
    await expect(verdict).toContainText("83%");
    await expect(page.locator(".analysis-result.result-empty")).toHaveCount(0);
  }
  expect(requests).toHaveLength(1);
  await page.reload();
  await expect(input).toHaveValue("");
  await expectEmptyResult(page, "ru");
  expect(requests).toHaveLength(1);
});

test("failed first checks do not manufacture a verdict and clearing returns to empty", async ({ page }) => {
  await page.route("**/api/analyze", route => route.fulfill({ json: { unavailable: true } }));
  await page.goto("/");
  await changeLanguage(page, "ru");
  await page.locator("#analysis-text").fill("Текст для проверки без успешного ответа сервиса.");
  await page.locator(".analyzer-submit").click();
  await expect(page.locator(".analysis-result").getByRole("alert")).toBeVisible();
  await expectNoVerdict(page);
  await page.getByRole("button", { name: "Очистить текст", exact: true }).click();
  await expect(page.locator("#analysis-text")).toHaveValue("");
  await expectEmptyResult(page, "ru");
});

test("localized footer Telegram link has safe attributes, a phone-size target and opens the intended bot", async ({ page, context }) => {
  // Intercept the destination so this checks navigation without contacting Telegram.
  await context.route("https://t.me/RuFact_bot", route => route.fulfill({
    contentType: "text/html",
    body: "<!doctype html><title>RuFact Telegram bot test destination</title><h1>@RuFact_bot</h1>",
  }));
  await page.goto("/");
  const link = page.locator('.site-footer a[href="https://t.me/RuFact_bot"]');
  const accessibleNames: string[] = [];
  for (const locale of ["uz", "ru", "en"] as const) {
    await changeLanguage(page, locale);
    await expect(link).toHaveCount(1);
    await link.scrollIntoViewIfNeeded();
    await expect(link).toBeVisible();
    await expect(link).toHaveAccessibleName(/@RuFact_bot/);
    await expect(link).toHaveAttribute("target", "_blank");
    const rel = (await link.getAttribute("rel") ?? "").split(/\s+/);
    expect(rel).toContain("noopener");
    expect(rel).toContain("noreferrer");
    const box = await link.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    accessibleNames.push(await link.getAttribute("aria-label") ?? await link.innerText());
  }
  expect(new Set(accessibleNames).size).toBe(3);
  const popupPromise = page.waitForEvent("popup");
  await link.click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL("https://t.me/RuFact_bot");
  await expect(popup.getByRole("heading", { name: "@RuFact_bot", exact: true })).toBeVisible();
  expect(await popup.evaluate(() => window.opener === null)).toBe(true);
  await popup.close();
  await expect(page).toHaveURL(/\/$/);
});
