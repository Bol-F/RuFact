import { expect, test } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chatCopy } from "../../lib/chat-copy";
import { analysisFixture } from "./helpers/analysis";
import { changeLanguage, type Locale } from "./helpers/language";

test("hero stays simple and Enter checks a statement while Shift+Enter keeps a new line in every language", async ({ page }, testInfo) => {
  const requests: { text: string; locale: Locale }[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" || message.type() === "warning") errors.push(message.text());
  });
  // UI regression coverage only: never send statements to paid providers.
  await page.route("**/api/analyze", async route => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: analysisFixture() });
  });
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page).toHaveTitle(/RuFact/);
  await expect(page.locator("#hero-heading")).toBeVisible();
  const input = page.locator("#analysis-text");

  for (const locale of ["uz", "ru", "en"] as const) {
    await changeLanguage(page, locale);
    await expect(page.locator(".hero-copy a, .hero-copy button")).toHaveCount(0);
    await expect(page.locator("header").getByRole("link", { name: chatCopy[locale].open, exact: true }).first()).toBeVisible();
    await expect(input).toHaveAttribute("enterkeyhint", "send");
    await expect(page.locator("#text-helper")).toContainText("Shift+Enter");

    const count = requests.length;
    await input.fill("");
    await input.press("Enter");
    await expect(input).toHaveValue("");
    await expect(input).toHaveAttribute("aria-invalid", "true");
    expect(requests).toHaveLength(count);

    await input.fill("First statement.");
    await input.press("Shift+Enter");
    await input.pressSequentially("Second statement.");
    await expect(input).toHaveValue("First statement.\nSecond statement.");
    expect(requests).toHaveLength(count);
    await input.press("Enter");
    await expect.poll(() => requests.length).toBe(count + 1);
    expect(requests.at(-1)).toMatchObject({ text: "First statement.\nSecond statement.", locale });
    await expect(page.locator('.analysis-result section[data-verdict-label="REAL"]')).toBeVisible();
    await expect(input).toBeEnabled();
    await expect(input).toHaveValue("First statement.\nSecond statement.");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }

  await input.blur();
  await page.evaluate(() => document.fonts.ready);
  await page.locator(".text-analyzer").screenshot({ path: join(tmpdir(), `rufact-analyzer-keyboard-${testInfo.project.name}.png`), caret: "initial" });
  const portal = page.locator("nextjs-portal");
  const overlay = await portal.count() ? await portal.evaluate(element => element.shadowRoot?.textContent ?? "") : "";
  expect(overlay).not.toMatch(/Build Error|Runtime Error/);
  expect(requests).toHaveLength(3);
  expect(errors).toEqual([]);
});

test("IME confirmation and held Enter never submit, and a pending check cannot be duplicated", async ({ page }) => {
  const requests: string[] = [];
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/analyze", async route => {
    requests.push(route.request().postDataJSON().text);
    if (requests.length === 1) await pending;
    await route.fulfill({ json: analysisFixture() });
  });
  await page.goto("/");
  await changeLanguage(page, "en");
  const input = page.locator("#analysis-text");
  await input.fill("A statement being composed.");
  await input.dispatchEvent("keydown", { key: "Enter", code: "Enter", isComposing: true });
  await input.dispatchEvent("keydown", { key: "Enter", code: "Enter", keyCode: 229 });
  await input.dispatchEvent("keydown", { key: "Enter", code: "Enter", repeat: true });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(requests).toEqual([]);

  try {
    await input.press("Enter");
    await expect.poll(() => requests.length).toBe(1);
    await expect(input).toBeDisabled();
    await expect(page.locator(".analyzer-submit")).toBeDisabled();
    // A synthetic event also exercises the handler's guard after controls disable.
    await input.dispatchEvent("keydown", { key: "Enter", code: "Enter" });
    await page.locator(".analyzer-submit").dispatchEvent("click");
    expect(requests).toHaveLength(1);
  } finally {
    release();
  }
  await expect(input).toBeEnabled();
  await input.fill("A second statement after the first check.");
  await input.press("Enter");
  await expect.poll(() => requests.length).toBe(2);
  await expect(input).toBeEnabled();
  expect(requests).toEqual(["A statement being composed.", "A second statement after the first check."]);
});
