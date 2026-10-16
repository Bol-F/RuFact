import { expect, test, type Page } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { supportCopy } from "../../lib/support-copy";
import { changeLanguage, type Locale } from "./helpers/language";

// Enabled tests require a separate process configured with fake credentials.
// Every invoice request is intercepted; no Telegram API or financial action runs.
const enabledFixture = process.env.SUPPORT_STARS_E2E === "1";
const fakeInvoiceUrl = "https://t.me/$support_test_invoice_12345";

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" || message.type() === "warning") errors.push(message.text());
  });
  return errors;
}

async function healthy(page: Page, errors: string[]) {
  await expect(page.locator("nextjs-portal [role=dialog], vite-error-overlay, #webpack-dev-server-client-overlay")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
}

for (const locale of ["uz", "ru", "en"] as const) {
  test(`support is localised, accessible and honest before launch in ${locale}`, async ({ page }) => {
    test.skip(enabledFixture, "This branch verifies disabled-by-default production behaviour");
    const errors = collectErrors(page);
    const invoices: string[] = [];
    page.on("request", request => { if (request.url().includes("/api/support/stars")) invoices.push(request.url()); });
    await page.goto("/support");
    await changeLanguage(page, locale);
    await expect(page).toHaveURL(/\/support$/);
    await expect(page).toHaveTitle(/RuFact/);
    const copy = supportCopy[locale];
    await expect(page.getByRole("heading", { name: copy.title, level: 1 })).toBeVisible();
    await expect(page.getByTestId("support-stars")).toHaveAttribute("data-enabled", "false");
    await expect(page.getByTestId("stars-disabled-status")).toContainText(copy.starsDisabledDescription);
    await expect(page.getByRole("button", { name: copy.starsButton, exact: true })).toBeDisabled();
    await expect(page.getByTestId("support-wallet")).toContainText(copy.walletEligibility);
    await expect(page.getByTestId("support-wallet").getByRole("button")).toHaveCount(0);
    await expect(page.getByTestId("support-wallet").getByRole("link")).toHaveCount(0);
    await expect(page.getByRole("radio")).toHaveCount(3);
    const selected = page.getByRole("radio", { name: copy.amountAria.replace("{amount}", "100"), exact: true });
    await expect(selected).toBeChecked();
    await selected.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("radio", { name: copy.amountAria.replace("{amount}", "250"), exact: true })).toBeChecked();
    await page.keyboard.press("ArrowLeft");
    await expect(selected).toBeChecked();
    expect(invoices).toEqual([]);

    for (const width of [320, 390, 1280, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1100 : 844 });
      await expect(page.getByRole("heading", { name: copy.title, level: 1 })).toBeVisible();
      const buttonBox = await page.getByRole("button", { name: copy.starsButton, exact: true }).boundingBox();
      expect(buttonBox?.height).toBeGreaterThanOrEqual(44);
      await healthy(page, errors);
      await page.evaluate(() => document.fonts.ready);
      if (width >= 1280) {
        const headerFits = await page.locator("header > div").first().evaluate(row => {
          const rectangles = Array.from(row.children).map(child => child.getBoundingClientRect()).filter(rectangle => rectangle.width > 0 && rectangle.height > 0);
          return rectangles.every((rectangle, index) => index === 0 || rectangles[index - 1].right <= rectangle.left + 1);
        });
        expect(headerFits).toBe(true);
      }
      await page.screenshot({ path: join(tmpdir(), `rufact-support-${locale}-${width}.png`), fullPage: true, scale: "css" });
    }
    await expect(page.getByRole("link", { name: copy.githubAction, exact: true })).toHaveAttribute("href", "https://github.com/Bol-F/RuFact");
    await page.locator(".support-alternatives").getByRole("button", { name: copy.feedbackAction, exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await healthy(page, errors);
  });
}

test("support sharing shares only the public website, not page state", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: async (data: ShareData) => { Reflect.set(window, "supportShareFixture", data); } });
  });
  await page.goto("/support?private-transaction=do-not-share");
  await changeLanguage(page, "en");
  await page.getByRole("button", { name: supportCopy.en.shareAction, exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(supportCopy.en.shareDone);
  expect(await page.evaluate(() => Reflect.get(window, "supportShareFixture"))).toEqual({ title: "RuFact", text: supportCopy.en.shareText, url: "https://rufact.vercel.app/" });
});

test("support navigation is discoverable on desktop and phone without changing other links", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  await changeLanguage(page, "en");
  await page.locator('header nav a[href="/support"]').click();
  await expect(page).toHaveURL(/\/support$/);
  await expect(page.locator('footer a[href="/support"]')).toHaveText(supportCopy.en.nav);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.locator('header button[aria-controls="mobile-navigation"]').click();
  await expect(page.locator('#mobile-navigation a[href="/chat"]')).toBeVisible();
  await expect(page.locator('#mobile-navigation a[href="/model"]')).toBeVisible();
  await page.locator('#mobile-navigation a[href="/support"]').click();
  await expect(page.locator("#mobile-navigation")).not.toBeVisible();
  await page.setViewportSize({ width: 1280, height: 1096 });
  await changeLanguage(page, "ru");
  const headerFits = await page.locator("header > div").first().evaluate(row => {
    const rectangles = Array.from(row.children).map(child => child.getBoundingClientRect()).filter(rectangle => rectangle.width > 0 && rectangle.height > 0);
    return rectangles.every((rectangle, index) => index === 0 || rectangles[index - 1].right <= rectangle.left + 1);
  });
  expect(headerFits).toBe(true);
  await page.screenshot({ path: join(tmpdir(), "rufact-support-ru-1280.png"), fullPage: true, scale: "css" });
});

for (const locale of ["uz", "ru", "en"] as const) {
  test(`enabled Stars opens only a validated invoice after an explicit action in ${locale}`, async ({ page }) => {
    test.skip(!enabledFixture, "Run with SUPPORT_STARS_E2E=1 and isolated fake server configuration");
    const errors = collectErrors(page);
    const requests: unknown[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/support/stars", async route => {
      requests.push(route.request().postDataJSON());
      await gate;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ url: fakeInvoiceUrl }) });
    });
    await page.goto("/support");
    await changeLanguage(page, locale);
    const copy = supportCopy[locale];
    await expect(page.getByTestId("support-stars")).toHaveAttribute("data-enabled", "true");
    expect(requests).toEqual([]);
    await page.locator(".support-amount").filter({ has: page.getByRole("radio", { name: copy.amountAria.replace("{amount}", "50"), exact: true }) }).click();
    await expect(page.getByRole("radio", { name: copy.amountAria.replace("{amount}", "50"), exact: true })).toBeChecked();
    await page.getByRole("button", { name: copy.starsButton, exact: true }).click();
    await expect(page.getByRole("button", { name: copy.starsLoading, exact: true })).toBeDisabled();
    release();
    await expect(page.getByTestId("support-invoice-ready")).toContainText(copy.invoiceReady);
    const invoice = page.getByRole("link", { name: copy.invoiceOpen, exact: true });
    await expect(invoice).toHaveAttribute("href", fakeInvoiceUrl);
    await expect(invoice).toHaveAttribute("rel", "noopener noreferrer");
    await expect(page.locator("#support-invoice-note")).toHaveText(copy.invoiceNotPaid);
    await expect(page).toHaveURL(/\/support$/);
    expect(requests).toEqual([{ amount: 50, locale }]);
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("support_test_invoice");
    await page.locator(".support-amount").filter({ has: page.getByRole("radio", { name: copy.amountAria.replace("{amount}", "250"), exact: true }) }).click();
    await expect(page.getByTestId("support-invoice-ready")).toHaveCount(0);
    await healthy(page, errors);
  });
}

for (const response of [
  { title: "unsafe invoice", status: 200, body: { url: "https://attacker.example/checkout" }, expected: "invoiceError" },
  { title: "Telegram subdomain spoof", status: 200, body: { url: "https://t.me.attacker.example/$fake_invoice_token" }, expected: "invoiceError" },
  { title: "extra response data", status: 200, body: { url: fakeInvoiceUrl, paymentStatus: "paid" }, expected: "invoiceError" },
  { title: "rate limit", status: 429, body: {}, expected: "invoiceRateLimit" },
  { title: "disabled service", status: 503, body: {}, expected: "invoiceUnavailable" },
] as const) {
  test(`Stars handles ${response.title} without opening a payment link`, async ({ page }) => {
    test.skip(!enabledFixture, "Run with SUPPORT_STARS_E2E=1 and isolated fake server configuration");
    await page.route("**/api/support/stars", route => route.fulfill({ status: response.status, contentType: "application/json", body: JSON.stringify(response.body) }));
    await page.goto("/support");
    await changeLanguage(page, "en");
    await page.getByRole("button", { name: supportCopy.en.starsButton, exact: true }).click();
    await expect(page.getByTestId("support-stars").getByRole("alert")).toHaveText(supportCopy.en[response.expected]);
    await expect(page.getByRole("link", { name: supportCopy.en.invoiceOpen, exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: supportCopy.en.starsButton, exact: true })).toBeEnabled();
    await expect(page).toHaveURL(/\/support$/);
  });
}

// Keep all locales statically checked against the same rendering contract.
const localeContract: readonly Locale[] = ["uz", "ru", "en"];
test("all Support translations expose the same complete set of keys", () => {
  for (const locale of localeContract) {
    expect(Object.keys(supportCopy[locale]).sort()).toEqual(Object.keys(supportCopy.en).sort());
    expect(Object.values(supportCopy[locale]).every(value => value.trim().length > 0)).toBe(true);
  }
});
