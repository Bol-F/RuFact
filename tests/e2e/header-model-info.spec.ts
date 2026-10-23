import { expect, test, type Locator, type Page } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chatCopy } from "../../lib/chat-copy";
import { getTranslations } from "../../lib/i18n";
import { changeLanguage, type Locale } from "./helpers/language";

// Browser plugin not available. Use the repository's isolated Playwright fixture;
// navigation checks never send text to providers, Redis, Telegram, or payments.
const locales = ["uz", "ru", "en"] as const;

function collectIssues(page: Page) {
  const issues: string[] = [];
  const apiCalls: string[] = [];
  page.on("pageerror", error => issues.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" || message.type() === "warning") issues.push(message.text());
  });
  return { issues, apiCalls };
}

async function blockApi(page: Page, calls: string[]) {
  await page.route("**/api/**", async route => {
    calls.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    await route.abort();
  });
}

async function expectHealthyPage(page: Page) {
  await expect(page).toHaveTitle(/RuFact/u);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const portal = page.locator("nextjs-portal");
  const text = await portal.count() ? await portal.evaluate(node => node.shadowRoot?.textContent ?? "") : "";
  expect(text).not.toMatch(/Build Error|Runtime Error|Application error/u);
}

async function settleHomeArtwork(page: Page, desktop: boolean) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("#hero-heading")).toHaveCSS("opacity", "1");
  for (const paragraph of await page.locator(".hero-copy > p").all()) {
    await expect(paragraph).toHaveCSS("opacity", "1");
  }
  if (desktop) {
    const artwork = page.locator(".hero-artwork");
    await expect(artwork).toHaveAttribute("data-artwork-state", "ready");
    await expect(artwork).toHaveCSS("opacity", "1");
    await artwork.locator("img").evaluateAll(images => Promise.all(images.map(image => (image as HTMLImageElement).decode())));
  }
}

async function openNavigation(page: Page) {
  const menu = page.locator('header button[aria-controls="mobile-navigation"]');
  if (await menu.isVisible()) {
    if (await menu.getAttribute("aria-expanded") !== "true") await menu.click();
    await expect(page.locator("#mobile-navigation")).toBeVisible();
    return page.locator("#mobile-navigation");
  }
  return page.locator("header nav:visible");
}

async function expectChatCta(link: Locator, locale: Locale) {
  await expect(link).toBeVisible();
  await expect(link).toHaveAccessibleName(chatCopy[locale].open);
  await expect(link).toHaveAttribute("href", "/chat");
  await expect(link).toHaveClass(/header-chat/u);
  const size = await link.boundingBox();
  expect(size).not.toBeNull();
  expect(size!.height).toBeGreaterThanOrEqual(44);
  expect(size!.width).toBeGreaterThanOrEqual(44);
}

for (const locale of locales) {
  test(`simplified header keeps chat, model and support in ${locale}`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const { issues, apiCalls } = collectIssues(page);
    await blockApi(page, apiCalls);
    const widths = testInfo.project.name.startsWith("mobile") ? [320, 393] : [1440];
    const copy = getTranslations(locale);
    for (const width of widths) {
      await page.setViewportSize({ width, height: width < 500 ? 852 : 1000 });
      await page.goto("/");
      await changeLanguage(page, locale);
      await expectHealthyPage(page);
      const header = page.locator("header");
      await expect(header.locator('a[href="/#how-it-works"], a[href="/#questions"]')).toHaveCount(0);
      await expect(page.locator("#how-it-works")).toHaveCount(1);
      await expect(page.locator("#questions")).toHaveCount(1);
      await expectChatCta(header.locator('a.header-chat:visible').first(), locale);
      await settleHomeArtwork(page, width >= 1280);
      await page.screenshot({ path: join(tmpdir(), `rufact-header-${locale}-${width}.png`), animations: "disabled", caret: "initial" });

      const navigation = await openNavigation(page);
      await expectChatCta(navigation.locator('a[href="/chat"]'), locale);
      await expect(navigation.getByRole("link", { name: copy.navigation.model, exact: true })).toHaveAttribute("href", "/model");
      await expect(navigation.getByRole("link", { name: copy.support.nav, exact: true })).toHaveAttribute("href", "/support");
      if (width < 500) {
        await page.screenshot({ path: join(tmpdir(), `rufact-header-menu-${locale}-${width}.png`), animations: "disabled", caret: "initial" });
      }
      await navigation.locator('a[href="/chat"]').click();
      await expect(page).toHaveURL(/\/chat$/u);
      await expect(page.getByRole("textbox", { name: chatCopy[locale].input })).toBeVisible();
      const chatNavigation = await openNavigation(page);
      await expect(chatNavigation.locator('a[href="/chat"]')).toHaveAttribute("aria-current", "page");
      await chatNavigation.locator('a[href="/model"]').click();
      await expect(page).toHaveURL(/\/model$/u);
      const modelNavigation = await openNavigation(page);
      await expect(modelNavigation.locator('a[href="/model"]')).toHaveAttribute("aria-current", "page");
      await modelNavigation.locator('a[href="/support"]').click();
      await expect(page).toHaveURL(/\/support$/u);
      await expect(page.getByTestId("support-stars")).toBeVisible();
      await expectHealthyPage(page);
    }
    expect(apiCalls).toEqual([]);
    expect(issues).toEqual([]);
  });
}

for (const locale of locales) {
  test(`model information distinguishes source checks and statistical benchmarks in ${locale}`, async ({ page }, testInfo) => {
    const { issues, apiCalls } = collectIssues(page);
    await blockApi(page, apiCalls);
    await page.goto("/model");
    await changeLanguage(page, locale);
    await expectHealthyPage(page);
    await expect(page.getByTestId("model-page-intro")).toContainText("Tavily");
    await expect(page.getByTestId("model-page-intro")).toContainText("Gemini");
    const routing = page.getByTestId("model-routing");
    await expect(routing.locator("article")).toHaveCount(3);
    await expect(page.getByTestId("model-route-arithmetic")).toContainText("2 + 2 = 5");
    await expect(page.getByTestId("model-route-sources")).toContainText("Tavily");
    await expect(page.getByTestId("model-route-sources")).toContainText("Gemini");
    await expect(page.getByTestId("model-route-statistical")).toContainText("TF-IDF");
    for (const verdict of ["REAL", "FAKE", "UNSURE"]) {
      await expect(page.getByTestId("model-verdict-rules")).toContainText(verdict);
    }
    const corrections = page.getByTestId("model-claim-corrections");
    await expect(corrections).toContainText({ uz: "Toshkent", ru: "Ташкент", en: "Tashkent" }[locale]);
    await expect(corrections).toContainText({ uz: "Samarqand", ru: "Самарканд", en: "Samarkand" }[locale]);
    await expect(page.getByTestId("model-system-accuracy-note")).toContainText({
      uz: "hali o‘lchanmagan", ru: "пока не измерена", en: "has not been measured",
    }[locale]);
    const russian = page.getByTestId("ru-model-quality");
    await expect(russian).toContainText("tfidf-word-char-logreg-ru-v2");
    await expect(russian).toContainText("3707");
    await expect(russian.locator("dl dd")).toHaveText(["80.9%", "80.9%", "84.9%", "76.5%"]);
    await expect(page.getByTestId("ru-evaluation-context")).toContainText("157");
    await expect(page.getByTestId("ru-evaluation-context")).toContainText("OOF");
    const english = page.getByTestId("en-model-quality");
    await expect(english).toContainText("tfidf-word-char-logreg-en-v2");
    await expect(english).toContainText(/8[\s,]?127/u);
    await expect(english).toContainText(/1[\s,]?016/u);
    await expect(english.locator("dl dd")).toHaveText(["65.1%", "63.9%", "65.7%", "75.5%"]);
    const protocol = page.getByTestId("en-evaluation-protocol");
    await expect(protocol).toContainText("OOF");
    await expect(protocol).toContainText(/1[\s,]?036/u);
    await expect(protocol).not.toContainText(/halves|половин|alohida qismlar/u);
    const details = page.getByTestId("ru-evaluation-details");
    await expect(details.locator("details")).not.toHaveAttribute("open", "");
    await details.locator("summary").click();
    await expect(details.getByRole("table")).toBeVisible();
    await expect(details.getByRole("table").locator("tbody td")).toHaveText(["65", "11", "19", "62"]);
    await expect(page.getByTestId("model-limitations")).toBeVisible();
    await expect(page.getByTestId("model-limitations")).toContainText("157");
    await expect(english.getByRole("link", { name: "LIAR · Wang (ACL 2017)" })).toHaveAttribute("href", "https://aclanthology.org/P17-2067/");
    await expectHealthyPage(page);
    await page.evaluate(() => document.fonts.ready);
    await page.getByTestId("model-system-overview").scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(tmpdir(), `rufact-model-updated-${locale}-${testInfo.project.name}.png`), animations: "disabled", caret: "initial" });
    expect(apiCalls).toEqual([]);
    expect(issues).toEqual([]);
  });
}

test("chat call to action is keyboard accessible and has an active state", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("desktop"), "Desktop keyboard interaction");
  const { issues, apiCalls } = collectIssues(page);
  await blockApi(page, apiCalls);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await changeLanguage(page, "en");
  const chat = page.locator('header nav a.header-chat[href="/chat"]');
  await page.locator("header .brand").focus();
  await page.keyboard.press("Tab");
  await expect(chat).toBeFocused();
  await expect(chat).toHaveCSS("outline-style", "solid");
  await expect(chat).toHaveCSS("outline-width", "3px");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/chat$/u);
  await expect(chat).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("textbox", { name: "Question for AI chat" })).toBeVisible();
  expect(apiCalls).toEqual([]);
  expect(issues).toEqual([]);
});

test("compact navigation remains usable with larger text in all languages", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Compact navigation text-size stress check");
  test.setTimeout(60_000);
  const { issues, apiCalls } = collectIssues(page);
  await blockApi(page, apiCalls);
  await page.setViewportSize({ width: 320, height: 852 });
  await page.goto("/");
  for (const locale of locales) {
    await changeLanguage(page, locale);
    const navigation = await openNavigation(page);
    const textSize = navigation.locator(".text-size-control button").last();
    await textSize.click();
    await expect(page.locator("html")).toHaveAttribute("data-text-size", "larger");
    // The built-in preference is 125%; also stress root-relative controls at 150%.
    await page.evaluate(() => { document.documentElement.style.fontSize = "150%"; });
    await expectChatCta(navigation.locator('a[href="/chat"]'), locale);
    for (const href of ["/chat", "/model", "/support"]) {
      const link = navigation.locator(`a[href="${href}"]`);
      await link.scrollIntoViewIfNeeded();
      await expect(link).toBeVisible();
      expect(await link.evaluate(node => {
        const linkBox = node.getBoundingClientRect();
        return linkBox.left >= 0 && linkBox.right <= innerWidth;
      })).toBe(true);
    }
    await expectHealthyPage(page);
    await page.screenshot({ path: join(tmpdir(), `rufact-header-${locale}-320-large-text.png`), animations: "disabled", caret: "initial" });
    await page.evaluate(() => { document.documentElement.style.removeProperty("font-size"); });
    await page.locator('header button[aria-controls="mobile-navigation"]').click();
  }
  expect(apiCalls).toEqual([]);
  expect(issues).toEqual([]);
});
