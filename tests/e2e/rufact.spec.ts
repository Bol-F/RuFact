import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { changeLanguage } from "./helpers/language";
import { analysisFixture } from "./helpers/analysis";

async function selectRussian(page: import("@playwright/test").Page) {
  await changeLanguage(page, "ru");
}

test("hero artwork loads from the public asset", async ({ page }, testInfo) => {
  const failedArtworkResponses: string[] = [];
  const consoleErrors: string[] = [];

  page.on("response", (response) => {
    if (response.url().includes("/artwork/") && !response.ok()) {
      failedArtworkResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");
  await selectRussian(page);

  await expect(page).toHaveTitle(/RuFact/u);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const frameworkPortal = page.locator("nextjs-portal");
  const frameworkOverlayText = (await frameworkPortal.count())
    ? await frameworkPortal.evaluate((portal) => portal.shadowRoot?.textContent ?? "")
    : "";
  expect(frameworkOverlayText).not.toMatch(/Build Error|Runtime Error/u);

  const heroArtwork = page.locator('.hero-artwork img.hero-collage').first();
  if (testInfo.project.name.startsWith("desktop")) {
    await expect(page.locator(".hero-artwork")).toHaveAttribute("data-artwork-locale", "ru");
    await expect(page.locator(".hero-artwork")).toHaveAttribute("data-artwork-state", "ready");
  }
  if (testInfo.project.name.startsWith("mobile")) {
    await expect(heroArtwork).toBeHidden();
  } else {
    await expect(heroArtwork).toBeVisible();
  }
  await expect
    .poll(() =>
      heroArtwork.evaluate(
        (image) => {
          const artwork = image as HTMLImageElement;
          return artwork.complete && artwork.naturalWidth > 0 && artwork.naturalHeight > 0;
        },
      ),
    )
    .toBe(true);

  if (process.env.CAPTURE_QA === "1") {
    await page.screenshot({
      path: join(tmpdir(), `rufact-hero-${testInfo.project.name}.png`),
      fullPage: false,
    });
  }

  expect(failedArtworkResponses).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("publishes an Android-installable web app manifest", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Mobile installability check");

  await page.goto("/");

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestHref).toBeTruthy();
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#0b2b4b",
  );

  const manifestUrl = new URL(manifestHref!, page.url()).toString();
  const manifestResponse = await page.request.get(manifestUrl);
  expect(manifestResponse.ok()).toBe(true);
  expect(manifestResponse.headers()["content-type"]).toContain("application/manifest+json");

  const manifest = (await manifestResponse.json()) as {
    name?: string;
    short_name?: string;
    start_url?: string;
    scope?: string;
    display?: string;
    icons?: Array<{ src: string; sizes?: string; type?: string }>;
  };

  expect(manifest.name).toContain("RuFact");
  expect(manifest.short_name).toBe("RuFact");
  expect(manifest.start_url).toBe("/");
  expect(manifest.scope).toBe("/");
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons?.map((icon) => icon.sizes)).toEqual(
    expect.arrayContaining(["192x192", "512x512"]),
  );

  for (const icon of manifest.icons ?? []) {
    const iconResponse = await page.request.get(new URL(icon.src, page.url()).toString());
    expect(iconResponse.ok()).toBe(true);
    expect(iconResponse.headers()["content-type"]).toContain("image/png");
  }
});

test("extracts an uploaded text document into the analyzer", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");
  await selectRussian(page);
  const uploadedText =
    "Проверяемый документ сообщает, что городской парк открылся после реконструкции 5 октября 2026 года.";

  await page.getByLabel("Загрузить документ").setInputFiles({
    name: "novost.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(uploadedText, "utf8"),
  });

  await expect(page.getByLabel("Текст для анализа")).toHaveValue(
    uploadedText,
    { timeout: 35_000 },
  );
  await expect(page.getByText(/^novost\.txt: текст извлечён/u)).toBeVisible();
  await expect(page.getByText("Файл не сохраняется на сервере")).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);
  expect(consoleErrors).toEqual([]);
});

test("desktop analysis workflow and guidance", async ({ page }, testInfo) => {
  await page.route("**/api/analyze", route => route.fulfill({ json: analysisFixture() }));
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");
  await selectRussian(page);

  await expect(page).toHaveTitle(/RuFact/u);
  await expect(
    page.getByRole("heading", { name: /Проверьте текст/u }),
  ).toBeVisible();
  await expect(page.getByLabel("Текст для анализа")).toBeVisible();
  await expect(page.locator("#use-gemini")).toHaveCount(0);
  await expect(page.getByTestId("analyzer-source-notice")).toBeVisible();
  await expect(page.getByText("Бета-версия", { exact: true })).toHaveCount(0);

  await page.getByLabel("Текст для анализа").fill("По данным Росстата, новый городской парк открылся после реконструкции.");
  await expect(page.getByLabel("Текст для анализа")).toHaveValue(
    /Росстата/u,
  );
  await page.getByRole("button", { name: /Проверить текст/u }).click();

  await expect(
    page.getByRole("region", { name: /Результат: /u }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("ML-модель · RU", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Копировать отчёт" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Скачать .txt" })).toBeVisible();

  await page.getByText("Что означает процент в результате?", { exact: true }).click();
  await expect(page.getByText(/Русская и английская модели оценены/u)).toBeVisible();

  if (process.env.CAPTURE_QA === "1") {
    await page.screenshot({
      path: join(tmpdir(), `rufact-${testInfo.project.name}.png`),
      fullPage: true,
    });
  }

  expect(consoleErrors).toEqual([]);
});

test("result actions and feedback dialog work", async ({ page, context }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("desktop"), "Desktop-only check");
  await page.route("**/api/analyze", route => route.fulfill({ json: analysisFixture() }));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
  });

  await page.goto("/");
  await selectRussian(page);
  await page.locator("#analysis-text").fill("Городской парк открылся после реконструкции.");
  await page.locator(".analyzer-submit").click();
  const actions = page.getByRole("region", { name: "Действия с результатом" });
  await expect(actions).toBeVisible();

  await actions.getByRole("button", { name: "Копировать отчёт" }).click();
  await expect(actions.getByRole("status")).toContainText("Отчёт скопирован");

  const downloadPromise = page.waitForEvent("download");
  await actions.getByRole("button", { name: "Скачать .txt" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^rufact-\d{4}-\d{2}-\d{2}\.txt$/u);
  await expect(actions.getByRole("status")).toContainText("сохранён на устройство");

  await actions.getByRole("button", { name: "Поделиться" }).click();
  await expect(actions.getByRole("status")).toContainText(
    "Системное меню недоступно — отчёт скопирован",
  );

  await page.getByRole("button", { name: "Обратная связь" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Обратная связь" });
  await expect(dialog).toBeVisible();
  const githubLink = dialog.getByRole("link", { name: /Открыть форму на GitHub/u });
  await expect(githubLink).toHaveAttribute("aria-disabled", "true");
  await dialog.getByLabel("Сообщение").fill(
    "Кнопка работает, но я хочу предложить улучшение интерфейса.",
  );
  await expect(githubLink).toHaveAttribute("href", /github\.com\/Bol-F\/True-or-False\/issues\/new/u);
  await dialog.getByRole("button", { name: "Скопировать" }).click();
  await expect(dialog.getByRole("status")).toContainText("Сообщение скопировано");

  if (process.env.CAPTURE_QA === "1") {
    await page.screenshot({
      path: join(tmpdir(), "rufact-feedback-desktop.png"),
      fullPage: false,
    });
  }

  await dialog.getByRole("button", { name: "Закрыть обратную связь" }).click();
  await expect(dialog).toBeHidden();

  await actions.getByRole("button", { name: "Сообщить об ошибке" }).click();
  await expect(dialog).toBeVisible();
});

test("mobile layout, menu and FAQ navigation", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Mobile-only check");

  await page.goto("/");
  await selectRussian(page);
  await expect(page.getByRole("button", { name: "Открыть меню" })).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);

  await page.getByRole("button", { name: "Открыть меню" }).click();
  const mobileNavigation = page.getByRole("navigation", {
    name: "Мобильная навигация",
  });
  await expect(mobileNavigation).toBeVisible();
  await expect(page.getByText("Бета-версия", { exact: true })).toHaveCount(0);
  await mobileNavigation.getByRole("button", { name: "Обратная связь" }).click();
  const feedbackDialog = page.getByRole("dialog", { name: "Обратная связь" });
  await expect(feedbackDialog).toBeVisible();
  await feedbackDialog.getByRole("button", { name: "Закрыть обратную связь" }).click();

  await page.getByRole("button", { name: "Открыть меню" }).click();
  await expect(mobileNavigation).toBeVisible();
  await mobileNavigation.getByRole("link", { name: "Вопросы и ответы" }).click();
  await expect(page).toHaveURL(/#questions$/u);
  await expect(page.getByRole("heading", { name: "Коротко о главном" })).toBeVisible();

  if (process.env.CAPTURE_QA === "1") {
    await page.screenshot({
      path: join(tmpdir(), `rufact-${testInfo.project.name}.png`),
      fullPage: true,
    });
  }
});

test("model page exposes measured errors and limitations", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("desktop"), "Desktop-only check");

  await page.goto("/model");
  await selectRussian(page);
  await expect(page.getByRole("heading", { name: "О системе проверки RuFact" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Как RuFact проверяет текст сейчас" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Поиск Tavily" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Анализ Gemini" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Accuracy на внешней выборке: 81%" }),
  ).toBeVisible();
  await expect(page.getByText(/tfidf-word-char-logreg-ru-v2/u)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Где модель ошибается" })).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Матрица ошибок для классов REAL и FAKE" }),
  ).toBeVisible();
  await expect(page.getByText("Сильные стороны", { exact: true })).toBeVisible();
  await expect(page.getByText("Ограничения", { exact: true })).toBeVisible();

  if (process.env.CAPTURE_QA === "1") {
    await page.screenshot({
      path: join(tmpdir(), "rufact-model-desktop.png"),
      fullPage: true,
    });
  }
});

test("optional live Gemini review renders validated claims", async ({ page }, testInfo) => {
  test.skip(
    process.env.LIVE_GEMINI_E2E !== "1" ||
      !testInfo.project.name.startsWith("desktop"),
    "Requires explicit live-provider opt-in",
  );
  test.setTimeout(30_000);

  await page.goto("/");
  await selectRussian(page);
  await expect(page.locator("#use-gemini")).toHaveCount(0);
  await expect(page.getByTestId("analyzer-source-notice")).toContainText("Tavily");
  await page.locator("#analysis-text").fill("Ташкент — столица Узбекистана.");
  await page.getByRole("button", { name: /Проверить текст/u }).click();

  await expect(
    page.getByRole("region", { name: "Проверка Gemini по источникам", exact: true }),
  ).toBeVisible();
  await page.getByText("Утверждения в тексте", { exact: true }).click();
  const claims = page.getByRole("list", { name: "Утверждения Gemini" });
  await expect(claims).toBeVisible();
  expect(await claims.getByRole("listitem").count()).toBeGreaterThan(0);
  await expect(page.getByRole("list", { name: "Источники проверки Gemini" })).toBeVisible();

  if (process.env.CAPTURE_QA === "1") {
    await page.screenshot({
      path: join(tmpdir(), "rufact-gemini-claims-desktop.png"),
      fullPage: true,
    });
  }
});

test("switches the full interface language and remembers the choice", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Matnni");
  await changeLanguage(page, "en");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Check a text");
  await expect(page.getByLabel("Text to analyse")).toHaveValue("");

  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Check a text");
  const draft = "This user draft must stay when the design changes.";
  await page.getByLabel("Text to analyse").fill(draft);

  await changeLanguage(page, "ru");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Проверьте текст");
  await expect(page.getByLabel("Текст для анализа")).toHaveValue(draft);
});
