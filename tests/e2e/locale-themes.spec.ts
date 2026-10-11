import { expect, test, type Page } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Locale = "uz" | "ru" | "en";

async function changeLanguage(page: Page, locale: Locale) {
  const menu = page.locator('header button[aria-controls="mobile-navigation"]');
  if (await menu.isVisible()) {
    if (await menu.getAttribute("aria-expanded") !== "true") await menu.click();
    await page.locator("#mobile-navigation select").selectOption(locale);
    await expect(page.locator("html")).toHaveAttribute("data-locale", locale);
    if (await menu.getAttribute("aria-expanded") === "true") await menu.click();
    await expect(page.locator("#mobile-navigation")).not.toBeVisible();
  } else {
    await page.locator("header select:visible").selectOption(locale);
    await expect(page.locator("html")).toHaveAttribute("data-locale", locale);
  }
}

async function navigateFromHeader(page: Page, href: string) {
  const menu = page.locator('header button[aria-controls="mobile-navigation"]');
  if (await menu.isVisible()) {
    await menu.click();
    await page.locator(`#mobile-navigation a[href="${href}"]`).click();
  } else {
    await page.locator(`header nav a[href="${href}"]`).click();
  }
  await expect(page).toHaveURL(new RegExp(`${href}$`));
}

async function expectNoOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth,
  )).toBe(true);
}

test("language changes switch regional designs without losing the analyzer draft", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  await expect(page).toHaveTitle(/RuFact/);
  await expect(page.locator("html")).toHaveAttribute("data-locale", "uz");
  await expect(page.locator('.regional-hero[data-region="uzbekistan"]')).toBeVisible();

  const input = page.locator("#analysis-text");
  const draft = "Toshkent — O‘zbekiston poytaxti. Ўзбекистон пойтахти Тошкент.";
  await input.fill(draft);
  await changeLanguage(page, "en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
  await expect(page.locator('.regional-hero[data-region="united-kingdom"]')).toBeVisible();
  await expect(input).toHaveValue(draft);
  await expectNoOverflow(page);
  await page.screenshot({ path: join(tmpdir(), `rufact-theme-en-${testInfo.project.name}.png`) });

  if (testInfo.project.name.startsWith("desktop")) {
    const englishColumns = await page.locator(".analyzer-grid").evaluate(element =>
      getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length,
    );
    expect(englishColumns).toBe(2);
  }

  await changeLanguage(page, "ru");
  await expect(page.locator("html")).toHaveAttribute("lang", "ru-RU");
  await expect(page.locator("#hero-heading")).toBeVisible();
  await expect(page.locator(".regional-hero")).toHaveCount(0);
  await expect(input).toHaveValue(draft);
  await expectNoOverflow(page);
  await page.screenshot({ path: join(tmpdir(), `rufact-theme-ru-${testInfo.project.name}.png`) });

  await changeLanguage(page, "uz");
  await expect(page.locator("html")).toHaveAttribute("lang", "uz-Latn-UZ");
  await expect(page.locator('.regional-hero[data-region="uzbekistan"]')).toBeVisible();
  await expect(input).toHaveValue(draft);
  if (testInfo.project.name.startsWith("desktop")) {
    const uzbekColumns = await page.locator(".analyzer-grid").evaluate(element =>
      getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length,
    );
    expect(uzbekColumns).toBe(2);
  }
  await page.screenshot({ path: join(tmpdir(), `rufact-theme-uz-${testInfo.project.name}.png`) });
  expect(errors).toEqual([]);
});

test("selected regional design persists through model and chat navigation and reload", async ({ page }) => {
  await page.goto("/");
  await changeLanguage(page, "en");
  await navigateFromHeader(page, "/model");
  await expect(page.locator("html")).toHaveAttribute("data-locale", "en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectNoOverflow(page);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-locale", "en");
  await navigateFromHeader(page, "/chat");
  await expect(page.locator("html")).toHaveAttribute("data-locale", "en");
  await expect(page.getByRole("textbox", { name: "Question for AI chat" })).toBeVisible();
  await changeLanguage(page, "uz");
  await expect(page.getByRole("textbox", { name: "AI chat uchun savol" })).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-locale", "uz");
  await expectNoOverflow(page);
  await navigateFromHeader(page, "/model");
  await expect(page.locator("html")).toHaveAttribute("data-locale", "uz");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("theme switching preserves completed chat turns and an unsent question", async ({ page }) => {
  await page.route("**/api/chat", route => route.fulfill({ json: {
    status: "complete", text: "A completed answer kept across regional designs.", sources: [],
  } }));
  await page.goto("/chat");
  const composer = page.locator("main textarea");
  await composer.fill("Is Tashkent the capital of Uzbekistan?");
  await page.getByRole("button", { name: "Yuborish", exact: true }).click();
  const answer = page.getByText("A completed answer kept across regional designs.", { exact: true });
  await expect(answer).toBeVisible();
  const draft = "Why is that? This question is not sent yet.";
  await composer.fill(draft);
  for (const locale of ["en", "ru", "uz"] as const) {
    await changeLanguage(page, locale);
    await expect(composer).toHaveValue(draft);
    await expect(answer).toHaveCount(1);
    await expect(answer).toBeVisible();
    await expectNoOverflow(page);
  }
});

test("theme switching remains usable when browser preference storage is blocked", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() { throw new DOMException("Browser storage is blocked", "SecurityError"); },
    });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await changeLanguage(page, "en");
  await expect(page.locator('.regional-hero[data-region="united-kingdom"]')).toBeVisible();
  await changeLanguage(page, "ru");
  await expect(page.locator("#hero-heading")).toBeVisible();
  await expectNoOverflow(page);
  expect(errors).toEqual([]);
});

test("language switches retain in-flight and completed analyzer results", async ({ page }) => {
  const requests: { text: string; locale: string }[] = [];
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/analyze", async route => {
    requests.push(route.request().postDataJSON());
    await pending;
    await route.fulfill({ json: {
      label: "REAL", confidence: 0.83,
      explanation: "Mocked analysis preserved through a visual language change.",
      meta: { engine: "external-model", engineVersion: "theme-regression-v1", externalSourcesChecked: false },
    } });
  });
  await page.goto("/");
  const draft = "Toshkent — O‘zbekiston poytaxti.";
  const input = page.locator("#analysis-text");
  await input.fill(draft);
  await page.locator(".analyzer-submit").click();
  try {
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0]).toMatchObject({ text: draft, locale: "uz" });
    await expect(page.locator(".analysis-result")).toHaveAttribute("aria-busy", "true");
    await changeLanguage(page, "en");
    await expect(input).toHaveValue(draft);
    await expect(page.locator(".analysis-result")).toHaveAttribute("aria-busy", "true");
  } finally {
    release();
  }
  const result = page.locator('.analysis-result section[aria-label$=": REAL"]');
  await expect(result).toBeVisible();
  await expect(result).toContainText("83%");
  for (const locale of ["ru", "uz", "en"] as const) {
    await changeLanguage(page, locale);
    await expect(input).toHaveValue(draft);
    await expect(result).toBeVisible();
    await expect(result).toContainText("83%");
    await expect(page.locator(".analysis-result")).toHaveAttribute("aria-busy", "false");
  }
  expect(requests).toHaveLength(1);
});

test("phones avoid downloading decorative regional artwork after language switching", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Phone image source selection");
  const artworkRequests: string[] = [];
  page.on("request", request => {
    if (/hero-(?:uzbekistan|united-kingdom)(?:-collage)?\.webp/.test(request.url())) {
      artworkRequests.push(request.url());
    }
  });
  await page.goto("/");
  const artwork = page.locator(".regional-artwork img");
  for (const locale of ["uz", "en"] as const) {
    if (locale === "en") await changeLanguage(page, locale);
    const region = locale === "uz" ? "uzbekistan" : "united-kingdom";
    await expect(page.locator(".regional-hero")).toHaveAttribute("data-region", region);
    await expect(artwork).toHaveAttribute("src", `/hero-${region}-collage.webp`);
    await expect(page.locator(".regional-note-start")).toBeHidden();
    await expect(page.locator(".regional-note-end")).toBeHidden();
    await expect.poll(() => artwork.evaluate(element => {
      const image = element as HTMLImageElement;
      return image.complete && image.naturalWidth > 0 && image.currentSrc.startsWith("data:image/gif");
    })).toBe(true);
    await artwork.evaluate(element => (element as HTMLImageElement).decode());
    expect(artworkRequests).toEqual([]);
  }
});

test("regional photo collages and handwritten notes fit desktop layouts and larger text", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("desktop"), "Desktop collage layout coverage");
  test.setTimeout(90_000);
  const errors: string[] = [];
  const failedArtworkResponses: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => {
    if (/hero-(?:uzbekistan|united-kingdom)-collage\.webp/.test(response.url()) && !response.ok() && response.status() !== 304) {
      failedArtworkResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  const notes = {
    uz: {
      start: ["Ko‘proq", "kontekst —", "kamroq", "manipulyatsiya"],
      end: ["Faktlarni tekshiring.", "Tanqidiy fikrlang.", "Mas’uliyat bilan ulashing."],
    },
    en: {
      start: ["More", "context —", "less", "manipulation"],
      end: ["Check facts.", "Think critically.", "Share responsibly."],
    },
  };

  for (const width of [1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    for (const size of ["normal", "larger"] as const) {
      await page.locator(".site-footer .text-size-control button").nth(size === "normal" ? 0 : 2).click();
      await expect(page.locator("html")).toHaveAttribute("data-text-size", size);
      await page.goto("/");
      for (const locale of ["uz", "en"] as const) {
        await changeLanguage(page, locale);
        await page.evaluate(() => document.fonts.ready);
        const artwork = page.locator(".regional-artwork");
        const image = artwork.locator("img.regional-collage");
        const region = locale === "uz" ? "uzbekistan" : "united-kingdom";
        await expect(image).toBeVisible();
        await expect(image).toHaveAttribute("src", `/hero-${region}-collage.webp`);
        await image.evaluate(element => (element as HTMLImageElement).decode());
        expect(await image.evaluate(element => ({
          loaded: (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0,
          fit: getComputedStyle(element).objectFit,
        }))).toEqual({ loaded: true, fit: "contain" });
        await expect(artwork.locator(".regional-note-start")).toBeVisible();
        await expect(artwork.locator(".regional-note-end")).toBeVisible();
        await expect(artwork.locator(".regional-note-start span.block")).toHaveText(notes[locale].start);
        await expect(artwork.locator(".regional-note-end span.block")).toHaveText(notes[locale].end);
        for (const selector of [".regional-hero", ".analyzer-grid"]) {
          expect(await page.locator(selector).evaluate(element =>
            getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length,
          )).toBe(2);
        }
        const geometry = await artwork.evaluate(element => {
          const bounds = element.getBoundingClientRect();
          const start = element.querySelector(".regional-note-start")!.getBoundingClientRect();
          const end = element.querySelector(".regional-note-end")!.getBoundingClientRect();
          return {
            notesWithinArtwork: [start, end].every(note =>
              note.left >= bounds.left - 1 && note.top >= bounds.top - 1 &&
              note.right <= bounds.right + 1 && note.bottom <= bounds.bottom + 1,
            ),
            notesOverlap: start.left < end.right && start.right > end.left && start.top < end.bottom && start.bottom > end.top,
          };
        });
        expect(geometry, `${locale}: ${width}px, ${size} text`).toEqual({
          notesWithinArtwork: true, notesOverlap: false,
        });
        const credit = page.locator(".regional-artwork-credit");
        await expect(credit.locator('a[href^="https://commons.wikimedia.org/wiki/File:"]')).toHaveCount(1);
        await expect(credit.locator('a[href^="https://creativecommons.org/"]')).toHaveCount(1);
        await expect(credit).toContainText(/AI/);
        await expectNoOverflow(page);
        await page.screenshot({ path: join(tmpdir(), `rufact-collage-${locale}-${width}-${size}.png`) });
      }
    }
  }
  expect(failedArtworkResponses).toEqual([]);
  expect(errors).toEqual([]);
});

test("all regional themes and mobile menus fit 320px and 412px phones", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Narrow phone layout coverage");
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const width of [320, 412]) {
    await page.setViewportSize({ width, height: 840 });
    await page.goto("/");
    for (const locale of ["uz", "en", "ru"] as const) {
      await changeLanguage(page, locale);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoOverflow(page);
      await expect(page.locator("#analysis-text")).toBeVisible();
      expect(await page.locator("#analysis-text").evaluate(element =>
        parseFloat(getComputedStyle(element).fontSize),
      )).toBeGreaterThanOrEqual(16);
      const menu = page.locator('header button[aria-controls="mobile-navigation"]');
      await menu.click();
      await expect(page.locator("#mobile-navigation")).toBeVisible();
      await page.locator("#mobile-navigation .text-size-control button").last().click();
      await expect(page.locator("html")).toHaveAttribute("data-text-size", "larger");
      await expectNoOverflow(page);
      expect(await menu.evaluate(element => element.getBoundingClientRect().right <= innerWidth)).toBe(true);
      await page.screenshot({ path: join(tmpdir(), `rufact-theme-${locale}-menu-${width}.png`) });
      await menu.click();
      for (const route of ["/model", "/chat"]) {
        await page.goto(route);
        await expect(page.locator("html")).toHaveAttribute("data-locale", locale);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expectNoOverflow(page);
      }
      await page.goto("/");
    }
  }
  expect(errors).toEqual([]);
});
