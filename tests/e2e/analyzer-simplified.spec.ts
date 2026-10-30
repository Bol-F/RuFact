import { expect, test } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analysisFixture } from "./helpers/analysis";
import { changeLanguage, type Locale } from "./helpers/language";

// The configured run sets this marker in an isolated fixture server using fake
// provider keys. Every analyze call below is intercepted, never sent to providers.
const sourcesConfigured = process.env.RUFACT_CONFIGURED_SOURCES_E2E === "1" || process.env.LIVE_GEMINI_E2E === "1";
const drafts = [
  { text: "A new public park opened in London today.", uzbek: false },
  { text: "В Лондоне сегодня открылся новый городской парк.", uzbek: false },
  { text: "Toshkent O‘zbekistonning poytaxti.", uzbek: true },
  { text: "Тошкент Ўзбекистоннинг пойтахти.", uzbek: true },
] as const;

test("simplified analyzer keeps privacy, upload and history while checking only after explicit submission", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  const inputs: { text: string; locale: Locale; useGemini: boolean }[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" || message.type() === "warning") errors.push(message.text());
  });
  await page.route("**/api/analyze", async route => {
    inputs.push(route.request().postDataJSON());
    await route.fulfill({ json: analysisFixture("REAL", 0.83) });
  });
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page).toHaveTitle(/RuFact/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const analyzer = page.locator(".text-analyzer");
  const input = page.locator("#analysis-text");
  const notice = page.getByTestId("analyzer-source-notice");
  for (const locale of ["uz", "ru", "en"] as const) {
    await changeLanguage(page, locale);
    if (locale === "uz") {
      // Switching via React's control also proves hydration has completed before
      // screenshot's caret-hiding style temporarily mutates input attributes.
      await expect(page.locator("#hero-heading")).toHaveCSS("opacity", "1");
      for (const paragraph of await page.locator(".hero-copy > p").all()) {
        await expect(paragraph).toHaveCSS("opacity", "1");
      }
      if (testInfo.project.name.startsWith("desktop")) {
        await expect(page.locator(".hero-artwork")).toHaveAttribute("data-artwork-state", "ready");
        await expect(page.locator(".hero-artwork")).toHaveCSS("opacity", "1");
        await page.locator(".hero-artwork img").evaluate(image => (image as HTMLImageElement).decode());
      }
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(tmpdir(), `rufact-analyzer-simple-first-${testInfo.project.name}.png`), fullPage: false, caret: "initial" });
    }
    await expect(analyzer).toBeVisible();
    await expect(analyzer.getByRole("switch")).toHaveCount(0);
    await expect(analyzer.locator("#use-gemini, #gemini-option-heading, #gemini-option-description, #gemini-privacy-note, #uzbek-routing-note, [data-uzbek-routing]")).toHaveCount(0);
    await expect(analyzer.locator('[aria-pressed], [aria-label="Text examples"], [aria-label="Примеры текстов"], [aria-label="Matn misollari"]')).toHaveCount(0);
    await expect(analyzer.getByRole("button", { name: /^(News|Social post|Medical claim|Political statement|Новость|Пост из соцсетей|Медицинское утверждение|Политическое заявление)$/ })).toHaveCount(0);
    await expect(analyzer.locator('input[type="file"]')).toBeEnabled();
    await expect(page.locator("#analysis-history-trigger")).toHaveCount(0);
    await expect(page.locator("[data-profile-trigger]:visible").first()).toBeEnabled();
    await expect(notice).toBeVisible();
    await expect(notice).not.toHaveText("");
    await expect(notice).toHaveCSS("border-top-width", "0px");
    await expect(notice).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    if (sourcesConfigured) {
      await expect(notice).toContainText("Tavily");
      await expect(notice).toContainText("Google Gemini");
      await expect(notice.getByRole("link")).toHaveAttribute("href", "https://ai.google.dev/gemini-api/terms");
    }
    for (const { text, uzbek } of drafts) {
      const previousCount = inputs.length;
      await input.fill(text);
      // Flush React effects and a rendered frame: filling/changing locale cannot
      // trigger the paid source path without the user's Check action.
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      expect(inputs).toHaveLength(previousCount);
      await page.locator(".analyzer-submit").click();
      await expect.poll(() => inputs.length).toBe(previousCount + 1);
      expect(inputs.at(-1)).toEqual({ text, locale, useGemini: uzbek || sourcesConfigured });
      await expect(page.locator('.analysis-result section[data-verdict-label="REAL"]')).toBeVisible();
    }
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await input.fill("");
    await input.blur();
    await analyzer.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(tmpdir(), `rufact-analyzer-simple-${locale}-${sourcesConfigured ? "configured" : "unconfigured"}-${testInfo.project.name}.png`), fullPage: false, caret: "initial" });
    if (locale === "en") {
      await analyzer.screenshot({ path: join(tmpdir(), `rufact-analyzer-simple-${testInfo.project.name.startsWith("mobile") ? "mobile" : "desktop"}.png`), caret: "initial" });
    }
  }
  const portal = page.locator("nextjs-portal");
  const overlay = await portal.count() ? await portal.evaluate(element => element.shadowRoot?.textContent ?? "") : "";
  expect(overlay).not.toMatch(/Build Error|Runtime Error/);
  expect(inputs).toHaveLength(12);
  expect(errors).toEqual([]);
});
