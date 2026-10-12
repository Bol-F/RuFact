import { expect, test, type Page, type Request, type Route } from "@playwright/test";
import { changeLanguage, type Locale } from "./helpers/language";

const regions: Record<Locale, string> = {
  uz: "uzbekistan",
  ru: "russia",
  en: "united-kingdom",
};

function artworkLocale(url: string): Locale | undefined {
  const decoded = decodeURIComponent(url);
  if (/\/artwork\/uzbek[.\-]/.test(decoded)) return "uz";
  if (/\/artwork\/english[.\-]/.test(decoded)) return "en";
  if (/\/artwork\/russian[.\-]/.test(decoded)) return "ru";
  return undefined;
}

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

/** Sample what can actually paint, not just the requested src attribute. */
async function paintedArtwork(page: Page) {
  return page.locator(".hero-artwork").evaluate(element => {
    return Array.from(element.querySelectorAll<HTMLImageElement>("img.hero-collage"))
      .filter(image => {
        let opacity = 1;
        let node: Element | null = image;
        while (node) {
          const style = getComputedStyle(node);
          if (style.display === "none" || style.visibility === "hidden") return false;
          opacity *= Number(style.opacity);
          if (node === element) break;
          node = node.parentElement;
        }
        const bounds = image.getBoundingClientRect();
        return opacity > 0.01 && bounds.width > 0 && bounds.height > 0 &&
          image.complete && image.naturalWidth > 1 && image.naturalHeight > 1;
      })
      .map(image => ({
        source: image.currentSrc,
        region: image.closest<HTMLElement>("[data-region]")?.dataset.region ?? "",
        locale: (element as HTMLElement).dataset.artworkLocale ?? "",
      }));
  });
}

async function expectPaintedLocale(page: Page, locale: Locale) {
  await expect.poll(async () => {
    const painted = await paintedArtwork(page);
    return painted.length === 1 && artworkLocale(painted[0].source) === locale &&
      painted[0].region === regions[locale] && painted[0].locale === locale;
  }, { message: `${locale} artwork is decoded and paired with its own regional metadata` }).toBe(true);
}

async function expectStablePaintFrames(page: Page, locale: Locale) {
  // A frame-level assertion detects a transient blank that a final src/decode
  // assertion misses. The network gate remains closed for the entire sample.
  for (let frame = 0; frame < 8; frame += 1) {
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    const painted = await paintedArtwork(page);
    expect(painted, `frame ${frame}: one decoded collage remains painted`).toHaveLength(1);
    expect(artworkLocale(painted[0].source), `frame ${frame}: bitmap does not change prematurely`).toBe(locale);
    expect(painted[0].region, `frame ${frame}: bitmap and metadata remain paired`).toBe(regions[locale]);
    expect(painted[0].locale, `frame ${frame}: displayed locale reflects decoded bitmap`).toBe(locale);
  }
}

async function gateArtwork(page: Page, locales: Locale[]) {
  const gates = new Map(locales.map(locale => [locale, deferred()]));
  const requests: Locale[] = [];
  const urls: string[] = [];
  const completed = new Set<Locale>();
  const recordCompletion = (request: Request) => {
    const locale = artworkLocale(request.url());
    if (locale) completed.add(locale);
  };
  page.on("requestfinished", recordCompletion);
  page.on("requestfailed", recordCompletion);
  await page.route("**/artwork/**", async route => {
    const locale = artworkLocale(route.request().url());
    if (!locale) return route.continue();
    requests.push(locale);
    urls.push(route.request().url());
    const gate = gates.get(locale);
    if (!gate) return route.continue();
    await gate.promise;
    // Serve the real local asset after the gate, exercising browser decoding.
    // A superseded request may have been cancelled by the component.
    try { await route.continue(); } catch { /* A cancelled request must not revive stale artwork. */ }
  });
  return {
    requests,
    urls,
    completed,
    release(locale: Locale) { gates.get(locale)?.release(); },
    releaseAll() { for (const gate of gates.values()) gate.release(); },
  };
}

test("cold-cache language change keeps the decoded collage until its replacement is ready", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("desktop"), "Desktop artwork is decorative and hidden on phones");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const network = await gateArtwork(page, ["en"]);
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(/RuFact/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectPaintedLocale(page, "uz");
    const draft = "A draft survives a slow artwork language switch.";
    await page.locator("#analysis-text").fill(draft);
    await changeLanguage(page, "en");
    await expect.poll(() => network.requests.includes("en")).toBe(true);
    await expect(page.locator(".hero-artwork")).toHaveAttribute("data-artwork-state", "loading");
    await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
    await expect(page.locator("#analysis-text")).toHaveValue(draft);
    await expectStablePaintFrames(page, "uz");
    network.release("en");
    await expectPaintedLocale(page, "en");
    await expect(page.locator(".hero-artwork")).toHaveAttribute("data-artwork-state", "ready");
    await expect(page.locator("#analysis-text")).toHaveValue(draft);
    expect(errors).toEqual([]);
  } finally {
    network.releaseAll();
  }
});

test("rapid language switches cannot let late image responses repaint the wrong region", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("desktop"), "Desktop asynchronous image-race coverage");
  const network = await gateArtwork(page, ["en", "ru"]);
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expectPaintedLocale(page, "uz");
    await changeLanguage(page, "en");
    await expect.poll(() => network.requests.includes("en")).toBe(true);
    await changeLanguage(page, "ru");
    await expect.poll(() => network.requests.includes("ru")).toBe(true);
    await changeLanguage(page, "uz");
    await expectStablePaintFrames(page, "uz");
    // The obsolete Russian and English responses finish after Uzbek is selected.
    network.release("ru");
    network.release("en");
    await expect.poll(() => network.completed.has("ru") && network.completed.has("en")).toBe(true);
    await expect(page.locator("html")).toHaveAttribute("data-locale", "uz");
    await expectStablePaintFrames(page, "uz");
    await expectPaintedLocale(page, "uz");
  } finally {
    network.releaseAll();
  }
});

test("a fetched but not decoded image does not replace the ready artwork", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("desktop"), "Desktop image decode barrier coverage");
  await page.addInitScript(() => {
    const originalDecode = HTMLImageElement.prototype.decode;
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    (window as Window & { releaseArtworkDecode?: () => void }).releaseArtworkDecode = release;
    HTMLImageElement.prototype.decode = async function () {
      await originalDecode.call(this);
      if (/\/artwork\/english[.\-]/.test(this.currentSrc || this.src)) await barrier;
    };
  });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expectPaintedLocale(page, "uz");
    const fetchedEnglish = page.waitForResponse(response =>
      artworkLocale(response.url()) === "en" && response.ok(),
    );
    await changeLanguage(page, "en");
    await fetchedEnglish;
    await expect(page.locator(".hero-artwork")).toHaveAttribute("data-artwork-state", "loading");
    await expectStablePaintFrames(page, "uz");
    await page.evaluate(() => (window as Window & { releaseArtworkDecode?: () => void }).releaseArtworkDecode?.());
    await expectPaintedLocale(page, "en");
    await expect(page.locator(".hero-artwork")).toHaveAttribute("data-artwork-state", "ready");
  } finally {
    await page.evaluate(() => (window as Window & { releaseArtworkDecode?: () => void }).releaseArtworkDecode?.()).catch(() => {});
  }
});

test("failed replacement artwork preserves the old picture and recovers on another language", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("desktop"), "Desktop image failure/recovery coverage");
  let englishFailures = 0;
  let rejectEnglish = true;
  await page.route("**/artwork/**", async (route: Route) => {
    if (artworkLocale(route.request().url()) === "en" && rejectEnglish) {
      englishFailures += 1;
      await route.fulfill({ status: 404, contentType: "text/plain", body: "Intentional image failure for regression test" });
    } else {
      await route.continue();
    }
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expectPaintedLocale(page, "uz");
  await changeLanguage(page, "en");
  await expect.poll(() => englishFailures).toBeGreaterThan(0);
  await expect(page.locator(".hero-artwork")).toHaveAttribute("data-artwork-state", "error");
  await expectStablePaintFrames(page, "uz");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("[data-artwork-retry]")).toBeVisible();
  rejectEnglish = false;
  await page.locator("[data-artwork-retry]").click();
  await expectPaintedLocale(page, "en");
  await expect(page.locator("[data-artwork-retry]")).toHaveCount(0);
  await changeLanguage(page, "ru");
  await expectPaintedLocale(page, "ru");
  await changeLanguage(page, "uz");
  await expectPaintedLocale(page, "uz");
  await expect(page.locator("#analysis-text")).toBeVisible();
});

test("phones do not fetch hidden collage images and resizing loads only the selected region", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Phone-to-desktop artwork activation coverage");
  const network = await gateArtwork(page, []);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  for (const locale of ["ru", "uz", "en"] as const) {
    await changeLanguage(page, locale);
    await expect(page.locator(".hero-artwork")).toBeHidden();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  expect(network.requests).toEqual([]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expectPaintedLocale(page, "en");
  expect(network.requests).toContain("en");
  expect(network.requests).not.toContain("uz");
  // A separate below-fold language card legitimately uses the small Russian
  // decorative asset. Its lazy request is not a hidden hero-language preload.
  expect(network.requests.every(locale => locale === "en" || locale === "ru")).toBe(true);
  const fetchedBeforePhone = network.urls.slice();
  await page.setViewportSize({ width: 412, height: 900 });
  await changeLanguage(page, "ru");
  await expect(page.locator(".hero-artwork")).toBeHidden();
  expect(network.urls).toEqual(fetchedBeforePhone);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expectPaintedLocale(page, "ru");
  expect(network.requests).toContain("ru");
  expect(network.requests).not.toContain("uz");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("switching back to a decoded locale reuses its image without repeated downloads", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("desktop"), "Desktop in-session decoded-image reuse coverage");
  const network = await gateArtwork(page, []);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expectPaintedLocale(page, "uz");
  for (const locale of ["en", "ru", "uz", "en", "ru", "uz"] as const) {
    await changeLanguage(page, locale);
    await expectPaintedLocale(page, locale);
  }
  expect(new Set(network.requests)).toEqual(new Set(["uz", "en", "ru"]));
  expect(new Set(network.urls).size, "No responsive artwork URL is downloaded repeatedly per mounted hero").toBe(network.urls.length);
});
