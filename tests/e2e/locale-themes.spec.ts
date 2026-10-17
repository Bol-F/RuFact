import { expect, test, type Page } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { changeLanguage } from "./helpers/language";
import { analysisFixture } from "./helpers/analysis";
import { HERO_ARTWORK } from "../../lib/hero-artwork";

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

async function expectPanelLayout(page: Page, desktop: boolean) {
  await expect.poll(() => page.evaluate(isDesktop => {
    const input = document.querySelector(".text-analyzer")!.getBoundingClientRect();
    const result = document.querySelector(".analysis-result")!.getBoundingClientRect();
    return isDesktop
      ? Math.abs(input.top - result.top) <= 1
      : result.top >= input.bottom - 1;
  }, desktop)).toBe(true);
}

async function sharedPresentation(page: Page) {
  const surfaces = {
    shell: { selector: ".paper-shell", properties: ["border-radius", "border-width", "border-style", "box-shadow", "margin-left", "margin-right"] },
    header: { selector: ".site-header", properties: ["padding-left", "padding-right"] },
    card: { selector: ".text-analyzer", properties: ["border-radius", "border-width", "border-style", "box-shadow", "padding"] },
    submit: { selector: ".analyzer-submit", properties: ["border-radius", "font-family", "font-size", "font-weight"] },
    title: { selector: "#hero-heading", properties: ["font-family", "font-size", "font-weight", "letter-spacing", "line-height", "text-align"] },
  };
  return page.evaluate(definitions => Object.fromEntries(Object.entries(definitions).map(([name, definition]) => {
    const style = getComputedStyle(document.querySelector(definition.selector)!);
    return [name, Object.fromEntries(definition.properties.map(property => [property, style.getPropertyValue(property)]))];
  })), surfaces);
}

test("language changes keep the shared layout without losing the analyzer draft", async ({ page }, testInfo) => {
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

test("all languages share the Russian geometry and typography with restored regional palettes", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  await changeLanguage(page, "ru");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".site-hero")).toBeVisible();
  const russianPresentation = await sharedPresentation(page);
  for (const locale of ["uz", "en", "ru"] as const) {
    await changeLanguage(page, locale);
    await expect(page.locator(".site-hero")).toBeVisible();
    expect(await sharedPresentation(page), `${locale} uses shared Russian geometry and typography`).toEqual(russianPresentation);
    await expectPanelLayout(page, testInfo.project.name.startsWith("desktop"));
    await expectNoOverflow(page);
  }
  const frameworkPortal = page.locator("nextjs-portal");
  const overlay = await frameworkPortal.count()
    ? await frameworkPortal.evaluate(element => element.shadowRoot?.textContent ?? "")
    : "";
  expect(overlay).not.toMatch(/Build Error|Runtime Error/);
  expect(errors).toEqual([]);
});

test("Uzbek teal and English navy-copper colors apply to the shared hero and controls", async ({ page }) => {
  await page.route("**/api/analyze", route => route.fulfill({ json: analysisFixture("FAKE", 0.87) }));
  await page.goto("/");
  const palettes = {
    uz: { ink: "rgb(20, 61, 67)", accent: "rgb(8, 127, 131)", primary: "rgb(8, 127, 131)" },
    en: { ink: "rgb(21, 38, 63)", accent: "rgb(162, 91, 54)", primary: "rgb(21, 38, 63)" },
  };
  for (const locale of ["uz", "en", "uz"] as const) {
    await changeLanguage(page, locale);
    const palette = palettes[locale];
    await expect(page.locator("#hero-heading")).toHaveCSS("color", palette.ink);
    await expect(page.locator(".hero-title-accent")).toHaveCount(3);
    for (const accent of await page.locator(".hero-title-accent").all()) {
      await expect(accent).toHaveCSS("color", palette.accent);
    }
    await expect(page.locator("header .brand > span:first-child > span:first-child")).toHaveCSS("background-color", palette.ink);
    await expect(page.locator("header .brand > span:first-child > span:last-child")).toHaveCSS("background-color", palette.accent);
    await expect(page.locator(".hero-primary")).toHaveCSS("background-color", palette.primary);
    await expect(page.locator(".header-feedback")).toHaveCSS("background-color", palette.primary);
    await expect(page.locator(".analyzer-submit")).toHaveCSS("background-color", palette.primary);
    await expect(page.locator(".analyzer-submit")).toHaveCSS("background-image", "none");
    await page.keyboard.press("Tab");
    await page.locator(".hero-primary").focus();
    await expect(page.locator(".hero-primary")).toHaveCSS("outline-color", palette.accent);
    await expect(page.locator(".hero-primary")).toHaveCSS("outline-width", "3px");
  }
  await changeLanguage(page, "ru");
  await expect(page.locator("#hero-heading")).toHaveCSS("color", "rgb(16, 47, 80)");
  await expect(page.locator(".hero-title-accent")).toHaveCount(3);
  for (const accent of await page.locator(".hero-title-accent").all()) {
    await expect(accent).toHaveCSS("color", "rgb(201, 66, 30)");
  }
  await expect(page.locator("header .brand > span:first-child > span:last-child")).toHaveCSS("background-color", "rgb(226, 122, 66)");
  await expect(page.locator(".header-feedback")).toHaveCSS("background-color", "rgb(10, 41, 73)");
  await expect(page.locator(".analyzer-submit")).not.toHaveCSS("background-image", "none");
  await page.locator("#analysis-text").fill("Городской парк открылся после реконструкции.");
  await page.locator(".analyzer-submit").click();
  await expect(page.locator('.analysis-result section[data-verdict-label="FAKE"]')).toBeVisible();
  await expect(page.locator('.analysis-result section[data-verdict-label="FAKE"] p').first()).toHaveCSS("color", "rgb(199, 53, 60)");
});

test("selected regional design persists through model and chat navigation and reload", async ({ page }) => {
  await page.goto("/");
  await changeLanguage(page, "en");
  await navigateFromHeader(page, "/model");
  await expect(page.locator("html")).toHaveAttribute("data-locale", "en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
  await expect(page.locator("body")).toHaveCSS("color", "rgb(21, 38, 63)");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectNoOverflow(page);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-locale", "en");
  await navigateFromHeader(page, "/chat");
  await expect(page.locator("html")).toHaveAttribute("data-locale", "en");
  await expect(page.locator("body")).toHaveCSS("color", "rgb(21, 38, 63)");
  await expect(page.getByRole("textbox", { name: "Question for AI chat" })).toBeVisible();
  await changeLanguage(page, "uz");
  await expect(page.getByRole("textbox", { name: "AI chat uchun savol" })).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("color", "rgb(20, 61, 67)");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-locale", "uz");
  await expect(page.locator("body")).toHaveCSS("color", "rgb(20, 61, 67)");
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

test("language switches retain aligned in-flight and completed analyzer results", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const requests: { text: string; locale: string }[] = [];
  let release!: () => void;
  let pending: Promise<void>;
  await page.route("**/api/analyze", async route => {
    requests.push(route.request().postDataJSON());
    await pending;
    await route.fulfill({ json: {
      label: "REAL", confidence: 0.83,
      explanation: "Mocked analysis preserved through a visual language change.",
      meta: { engine: "external-model", engineVersion: "theme-regression-v1", externalSourcesChecked: false },
    } });
  });
  const desktop = testInfo.project.name.startsWith("desktop");
  const widths = desktop ? [1024, 1440] : [412];
  for (const [round, width] of widths.entries()) {
    await page.setViewportSize({ width, height: 1000 });
    pending = new Promise<void>(resolve => { release = resolve; });
    await page.goto("/");
    for (const locale of ["ru", "en", "uz"] as const) {
      await changeLanguage(page, locale);
      await expectPanelLayout(page, desktop);
    }
    const draft = "Toshkent — O‘zbekiston poytaxti.";
    const input = page.locator("#analysis-text");
    await input.fill(draft);
    await page.locator(".analyzer-submit").click();
    try {
      await expect.poll(() => requests.length).toBe(round + 1);
      expect(requests[round]).toMatchObject({ text: draft, locale: "uz" });
      await expect(page.locator(".analysis-result")).toHaveAttribute("aria-busy", "true");
      for (const locale of ["en", "ru", "uz"] as const) {
        await changeLanguage(page, locale);
        await expect(input).toHaveValue(draft);
        await expect(page.locator(".analysis-result")).toHaveAttribute("aria-busy", "true");
        await expectPanelLayout(page, desktop);
      }
    } finally {
      release();
    }
    const result = page.locator('.analysis-result section[data-verdict-label="REAL"]');
    await expect(result).toBeVisible();
    await expect(result).toContainText("83%");
    const resultStyle = await page.locator(".analysis-result").evaluate(element => {
      const style = getComputedStyle(element);
      return { radius: style.borderRadius, borderWidth: style.borderWidth, borderStyle: style.borderStyle, padding: style.padding };
    });
    for (const locale of ["ru", "uz", "en"] as const) {
      await changeLanguage(page, locale);
      await expect(input).toHaveValue(draft);
      await expect(result).toBeVisible();
      await expect(result).toContainText("83%");
      await expect(result.locator("p").first()).toHaveCSS("color", "rgb(47, 116, 71)");
      await expect(page.locator(".analysis-result")).toHaveAttribute("aria-busy", "false");
      await expectPanelLayout(page, desktop);
      expect(await page.locator(".analysis-result").evaluate(element => {
        const style = getComputedStyle(element);
        return { radius: style.borderRadius, borderWidth: style.borderWidth, borderStyle: style.borderStyle, padding: style.padding };
      })).toEqual(resultStyle);
    }
  }
  expect(requests).toHaveLength(widths.length);
});

test("enlarged text keeps narrow desktop verdicts and result headings readable", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("desktop"), "Narrow desktop result layout");
  await page.setViewportSize({ width: 1024, height: 1000 });
  await page.route("**/api/analyze", route => route.fulfill({ json: {
    label: "REAL", confidence: 0.83,
    explanation: "Mocked result for enlarged-text layout coverage.",
    meta: { engine: "external-model", engineVersion: "layout-regression-v1", externalSourcesChecked: false },
  } }));
  await page.goto("/");
  await page.locator(".site-footer .text-size-control button").last().click();
  await expect(page.locator("html")).toHaveAttribute("data-text-size", "larger");
  await changeLanguage(page, "ru");
  async function expectReadableResult() {
    await expect.poll(() => page.locator(".analysis-result").evaluate(element => {
      const heading = element.querySelector("header h2") as HTMLElement;
      const section = element.querySelector("section[aria-label]")!;
      const copy = section.firstElementChild!.getBoundingClientRect();
      const ring = section.querySelector('[role="meter"]')!.getBoundingClientRect();
      return {
        headingFits: heading.scrollWidth <= heading.clientWidth + 1 && heading.scrollHeight <= heading.clientHeight + 1,
        verdictOverlapsRing: copy.left < ring.right && copy.right > ring.left && copy.top < ring.bottom && copy.bottom > ring.top,
      };
    })).toEqual({ headingFits: true, verdictOverlapsRing: false });
    await expectPanelLayout(page, true);
    await expectNoOverflow(page);
  }
  // A fresh page has no verdict or confidence meter to measure.
  await expect(page.locator(".analysis-result.result-empty")).toBeVisible();
  await expectPanelLayout(page, true);
  await expectNoOverflow(page);
  await page.locator("#analysis-text").fill("Toshkent is the capital of Uzbekistan.");
  await page.locator(".analyzer-submit").click();
  await expect(page.locator('.analysis-result section[data-verdict-label="REAL"]')).toBeVisible();
  for (const locale of ["ru", "uz", "en"] as const) {
    await changeLanguage(page, locale);
    await expectReadableResult();
  }
});

test("phones avoid downloading decorative regional artwork after language switching", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Phone image source selection");
  const artworkRequests: string[] = [];
  page.on("request", request => {
    if (/\/artwork\/(?:uzbek|english)-/.test(request.url())) {
      artworkRequests.push(request.url());
    }
  });
  await page.goto("/");
  const artwork = page.locator(".regional-artwork img");
  for (const locale of ["uz", "en"] as const) {
    if (locale === "en") await changeLanguage(page, locale);
    const region = locale === "uz" ? "uzbekistan" : "united-kingdom";
    await expect(page.locator(".regional-hero")).toHaveAttribute("data-region", region);
    await expect(artwork).toHaveAttribute("src", HERO_ARTWORK[locale].src);
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
    if (/\/artwork\/(?:uzbek|english)-/.test(response.url()) && !response.ok() && response.status() !== 304) {
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
    // Finish the persisted-preference/hydration cycle before clicking SSR controls.
    await changeLanguage(page, "ru");
    await changeLanguage(page, "uz");
    for (const size of ["normal", "larger"] as const) {
      await page.locator(".site-footer .text-size-control button").nth(size === "normal" ? 0 : 2).click();
      await expect(page.locator("html")).toHaveAttribute("data-text-size", size);
      await page.goto("/");
      for (const locale of ["uz", "en"] as const) {
        await changeLanguage(page, locale);
        await page.evaluate(() => document.fonts.ready);
        const artwork = page.locator(".regional-artwork");
        const image = artwork.locator("img.regional-collage");
        await expect(image).toBeVisible();
        await expect(artwork).toHaveAttribute("data-artwork-locale", locale);
        await expect(artwork).toHaveAttribute("data-artwork-state", "ready");
        await expect(image).toHaveAttribute("src", HERO_ARTWORK[locale].src);
        await image.evaluate(element => (element as HTMLImageElement).decode());
        expect(await image.evaluate(element => ({
          loaded: (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0,
          fit: getComputedStyle(element).objectFit,
        }))).toEqual({ loaded: true, fit: "contain" });
        await expect(artwork.locator(".regional-note-start")).toBeVisible();
        await expect(artwork.locator(".regional-note-end")).toBeVisible();
        await expect(artwork.locator(".regional-note-start span.block")).toHaveText(notes[locale].start);
        await expect(artwork.locator(".regional-note-end span.block").filter({ hasText: /\S/ })).toHaveText(notes[locale].end);
        for (const selector of [".site-hero", ".analyzer-grid"]) {
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
        await expectPanelLayout(page, true);
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
