import { expect, type Page } from "@playwright/test";

export const languageNames = { uz: "O‘zbekcha", ru: "Русский", en: "English" } as const;
export type Locale = keyof typeof languageNames;

export async function changeLanguage(page: Page, locale: Locale) {
  const navigationToggle = page.locator('header button[aria-controls="mobile-navigation"]');
  const compact = await navigationToggle.isVisible();
  if (compact && await navigationToggle.getAttribute("aria-expanded") !== "true") {
    await navigationToggle.click();
  }

  const trigger = page.locator("header button[data-language-trigger]:visible");
  await trigger.click();
  await page.getByRole("menuitemradio", { name: languageNames[locale], exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-locale", locale);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  if (compact && await navigationToggle.getAttribute("aria-expanded") === "true") {
    await navigationToggle.click();
    await expect(page.locator("#mobile-navigation")).not.toBeVisible();
  }
}
