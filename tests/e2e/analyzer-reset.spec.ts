import { expect, test, type Page } from "@playwright/test";
import { analysisFixture } from "./helpers/analysis";
import { changeLanguage } from "./helpers/language";

async function expectResetAnalyzer(page: Page) {
  await expect(page.locator("#analysis-text")).toHaveValue("");
  await expect(page.locator(".analysis-result.result-empty")).toBeVisible();
  await expect(page.locator(".analysis-result").getByRole("meter")).toHaveCount(0);
  await expect(page.locator(".analysis-result").getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".analysis-result time")).toHaveCount(0);
  await expect(page.locator('.analysis-result section[data-verdict-label="FAKE"], .analysis-result section[data-verdict-label="REAL"]')).toHaveCount(0);
}

test("checking locks history and Clear so a pending request cannot undo a user reset", async ({ page }) => {
  const requests: { text: string; locale: string }[] = [];
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/analyze", async route => {
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) {
      await route.fulfill({ json: analysisFixture("REAL", 0.83) });
    } else {
      await pending;
      await route.fulfill({ json: analysisFixture("FAKE", 0.87) });
    }
  });
  await page.goto("/");
  await changeLanguage(page, "ru");
  const historyTrigger = page.locator("#analysis-history-trigger");
  const history = page.locator("#analysis-history-dialog");
  const input = page.locator("#analysis-text");
  await historyTrigger.click();
  await history.getByRole("button", { name: "Включить локальную историю", exact: true }).click();
  await history.getByRole("button", { name: "Закрыть историю", exact: true }).click();

  await input.fill("Первый проверенный текст сохраняется в истории с согласия пользователя.");
  await page.locator(".analyzer-submit").click();
  await expect(page.locator('.analysis-result section[data-verdict-label="REAL"]')).toBeVisible();
  await historyTrigger.click();
  await expect(history.getByRole("listitem")).toHaveCount(1);
  await history.getByRole("button", { name: "Закрыть историю", exact: true }).click();

  const secondText = "Второй текст проверяется, пока сохранённый результат остаётся в истории.";
  await input.fill(secondText);
  await page.locator(".analyzer-submit").click();
  try {
    await expect.poll(() => requests.length).toBe(2);
    for (const locale of ["en", "uz", "ru"] as const) {
      await changeLanguage(page, locale);
      await expect(page.locator(".analysis-result")).toHaveAttribute("aria-busy", "true");
      await expect(historyTrigger).toBeDisabled();
      await expect(historyTrigger).toHaveAttribute("aria-expanded", "false");
      await expect(history).not.toBeVisible();
      await expect(input).toBeDisabled();
      await expect(input).toHaveValue(secondText);
      await expect(page.getByRole("button", { name: locale === "ru" ? "Очистить текст" : locale === "en" ? "Clear text" : "Matnni tozalash", exact: true })).toBeDisabled();
    }
  } finally {
    release();
  }
  await expect(page.locator('.analysis-result section[data-verdict-label="FAKE"]')).toContainText("87%");
  await expect(historyTrigger).toBeEnabled();
  await page.getByRole("button", { name: "Очистить текст", exact: true }).click();
  await expectResetAnalyzer(page);
  for (const locale of ["uz", "en", "ru"] as const) {
    await changeLanguage(page, locale);
    await expectResetAnalyzer(page);
  }
  expect(requests).toHaveLength(2);
});

test("an error can be cleared even after the failed text was manually deleted", async ({ page }) => {
  const requests: unknown[] = [];
  await page.route("**/api/analyze", route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: { unavailable: true } });
  });
  await page.goto("/");
  await changeLanguage(page, "ru");
  const input = page.locator("#analysis-text");
  await input.fill("Текст не получил успешного ответа сервиса проверки.");
  await page.locator(".analyzer-submit").click();
  await expect(page.locator(".analysis-result").getByRole("alert")).toBeVisible();
  await expect(page.locator(".analysis-result").getByRole("meter")).toHaveCount(0);
  await input.fill("");
  const clear = page.getByRole("button", { name: "Очистить текст", exact: true });
  await expect(clear).toBeEnabled();
  await clear.click();
  await expectResetAnalyzer(page);
  await expect(clear).toBeDisabled();
  await expect(page.locator("#text-validation")).toHaveCount(0);
  expect(requests).toHaveLength(1);
});

test("document extraction also locks history and Clear without triggering an analysis", async ({ page }) => {
  let extractionRequests = 0;
  const analysisRequests: unknown[] = [];
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const extractedText = "Документ содержит текст, который пользователь ещё не отправил на проверку.";
  await page.route("**/api/extract", async route => {
    extractionRequests += 1;
    await pending;
    await route.fulfill({ json: {
      text: extractedText,
      fileName: "report.txt",
      format: "text",
      originalCharacters: extractedText.length,
      truncated: false,
    } });
  });
  await page.route("**/api/analyze", route => {
    analysisRequests.push(route.request().postDataJSON());
    return route.fulfill({ json: analysisFixture() });
  });
  await page.goto("/");
  await changeLanguage(page, "ru");
  await page.getByLabel("Загрузить документ").setInputFiles({
    name: "report.txt", mimeType: "text/plain", buffer: Buffer.from(extractedText, "utf8"),
  });
  const historyTrigger = page.locator("#analysis-history-trigger");
  const clear = page.getByRole("button", { name: "Очистить текст", exact: true });
  try {
    await expect.poll(() => extractionRequests).toBe(1);
    await expect(historyTrigger).toBeDisabled();
    await expect(page.locator("#analysis-history-dialog")).not.toBeVisible();
    await expect(clear).toBeDisabled();
    await expect(page.locator("#analysis-text")).toBeDisabled();
    await expect(page.locator(".analysis-result.result-empty")).toBeVisible();
    expect(analysisRequests).toEqual([]);
  } finally {
    release();
  }
  await expect(page.locator("#analysis-text")).toHaveValue(extractedText);
  await expect(historyTrigger).toBeEnabled();
  await expect(clear).toBeEnabled();
  await expect(page.locator(".text-analyzer").getByRole("status")).toContainText("report.txt");
  await expect(page.locator(".analysis-result.result-empty")).toBeVisible();
  await clear.click();
  await expectResetAnalyzer(page);
  await expect(page.locator(".text-analyzer").getByRole("status")).toHaveCount(0);
  expect(analysisRequests).toEqual([]);
  expect(extractionRequests).toBe(1);
});
