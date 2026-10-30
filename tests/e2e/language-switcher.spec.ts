import { expect, test, type Page, type Locator } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { changeLanguage, chooseProfileOption, languageNames, openProfile, type Locale } from "./helpers/language";

async function languageTrigger(page: Page) {
  const profile = await openProfile(page);
  return profile.locator("button[data-language-trigger]");
}

async function openLanguageMenu(page: Page) {
  const trigger = await languageTrigger(page);
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const menu = page.locator(".language-menu:visible");
  await expect(menu).toBeVisible();
  return { trigger, menu };
}

async function expectTouchTarget(control: Locator) {
  expect(await control.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
}

async function expectNoOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test("styled language menu exposes its selected language and preserves the draft and preference", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  await expect(page).toHaveTitle(/RuFact/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("header select")).toHaveCount(0);
  const draft = "A draft stays unchanged while the language menu changes the UI.";
  const input = page.locator("#analysis-text");
  await input.fill(draft);

  for (const locale of ["uz", "en", "ru", "uz"] as const) {
    await changeLanguage(page, locale);
    await expect(input).toHaveValue(draft);
    const { trigger, menu } = await openLanguageMenu(page);
    await expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    await expect(trigger).toHaveAttribute("aria-label", new RegExp(`${languageNames[locale]}$`));
    const menuId = await trigger.getAttribute("aria-controls");
    expect(menuId).toBeTruthy();
    await expect(menu).toHaveAttribute("id", menuId!);
    await expect(menu).toHaveAttribute("role", "menu");
    await expect(menu.getByRole("menuitemradio")).toHaveCount(3);
    await expect(menu.locator('[role="menuitemradio"][aria-checked="true"]')).toHaveCount(1);
    for (const option of ["uz", "ru", "en"] as const) {
      const item = menu.getByRole("menuitemradio", { name: languageNames[option], exact: true });
      await expect(item).toHaveAttribute("aria-checked", String(option === locale));
      await expectTouchTarget(item);
    }
    await expectTouchTarget(trigger);
    await page.screenshot({ path: join(tmpdir(), `rufact-language-menu-${locale}-${testInfo.project.name}.png`) });
    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();
    await expectNoOverflow(page);
  }

  await changeLanguage(page, "en");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("rufact.locale.v1"))).toBe("en");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-locale", "en");
  await expect(await languageTrigger(page)).toContainText("English");
  const portal = page.locator("nextjs-portal");
  const overlay = await portal.count() ? await portal.evaluate(element => element.shadowRoot?.textContent ?? "") : "";
  expect(overlay).not.toMatch(/Build Error|Runtime Error/);
  expect(errors).toEqual([]);
});

test("language menu keyboard navigation wraps, supports Home, End and typeahead, and returns focus", async ({ page }) => {
  await page.goto("/");
  const trigger = await languageTrigger(page);
  await trigger.focus();
  await trigger.press("ArrowDown");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const menu = page.locator(".language-menu:visible");
  const uzbek = menu.getByRole("menuitemradio", { name: languageNames.uz, exact: true });
  const russian = menu.getByRole("menuitemradio", { name: languageNames.ru, exact: true });
  const english = menu.getByRole("menuitemradio", { name: languageNames.en, exact: true });
  await expect(uzbek).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(russian).toBeFocused();
  await page.keyboard.press("End");
  await expect(english).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(uzbek).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(english).toBeFocused();
  await page.keyboard.press("Home");
  await expect(uzbek).toBeFocused();
  await page.keyboard.press("e");
  await expect(english).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-locale", "en");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();

  await trigger.press("Space");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("menuitemradio", { name: "English", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();

  await trigger.press("ArrowUp");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("menuitemradio", { name: "English", exact: true })).toBeFocused();
  await page.keyboard.press("Home");
  // Playwright's US keyboard mapping has no Cyrillic key; exercise its DOM key event.
  await uzbek.dispatchEvent("keydown", { key: "Р", code: "KeyH", bubbles: true });
  await expect(page.getByRole("menuitemradio", { name: languageNames.ru, exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
});

test("Tab and outside clicks dismiss the language menu without changing the selected language", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  let { trigger } = await openLanguageMenu(page);
  await page.keyboard.press("Tab");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".language-menu:visible")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-locale", "uz");
  await expect(page.getByRole("menuitemradio", { name: languageNames.uz, exact: true })).toHaveCount(0);

  ({ trigger } = await openLanguageMenu(page));
  await page.keyboard.press("Shift+Tab");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".language-menu:visible")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-locale", "uz");

  ({ trigger } = await openLanguageMenu(page));
  await page.getByTestId("profile-dialog").locator("#profile-heading").click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".language-menu:visible")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-locale", "uz");
  expect(errors).toEqual([]);
});

test("language menu stays inside narrow phones and enlarged profile settings", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const compact = testInfo.project.name.startsWith("mobile");
  const widths = compact ? [320, 412] : [1280, 1440];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await openProfile(page);
    await chooseProfileOption(page, "text-size", "larger");
    await expect(page.locator("html")).toHaveAttribute("data-text-size", "larger");
    await expect(page.locator("html")).toHaveCSS("font-size", "20px");
    for (const locale of ["uz", "ru", "en"] as Locale[]) {
      await changeLanguage(page, locale);
      const { trigger, menu } = await openLanguageMenu(page);
      await menu.scrollIntoViewIfNeeded();
      await expectNoOverflow(page);
      const bounds = await menu.evaluate(element => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight };
      });
      expect(bounds.left, `${locale}, ${width}px`).toBeGreaterThanOrEqual(0);
      expect(bounds.right, `${locale}, ${width}px`).toBeLessThanOrEqual(bounds.viewportWidth);
      expect(bounds.top, `${locale}, ${width}px`).toBeGreaterThanOrEqual(0);
      expect(bounds.bottom, `${locale}, ${width}px`).toBeLessThanOrEqual(bounds.viewportHeight);
      await expectTouchTarget(trigger);
      for (const item of await menu.getByRole("menuitemradio").all()) await expectTouchTarget(item);
      await page.screenshot({ path: join(tmpdir(), `rufact-language-menu-${locale}-${width}-larger.png`) });
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
    }
  }
});
