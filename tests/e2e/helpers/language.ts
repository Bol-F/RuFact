import { expect, type Page } from "@playwright/test";

export const languageNames = { uz: "O‘zbekcha", ru: "Русский", en: "English" } as const;
export type Locale = keyof typeof languageNames;

export async function openProfile(page: Page) {
  const dialog = page.getByTestId("profile-dialog");
  if (!await dialog.isVisible()) await page.locator("[data-profile-trigger]:visible").first().click();
  await expect(dialog).toBeVisible();
  return dialog;
}

export async function chooseProfileOption(page: Page, name: string, value: string) {
  const input = page.locator(`[data-testid="profile-settings"]:visible input[name="profile-${name}"][value="${value}"]`);
  // Click the visible label, as a real pointer user would, instead of forcing
  // a click on a visually hidden radio input.
  await input.locator("..").click();
  await expect(input).toBeChecked();
}

export async function changeLanguage(page: Page, locale: Locale) {
  const dialog = page.getByTestId("profile-dialog");
  const alreadyOpen = await dialog.isVisible();
  const fullProfile = new URL(page.url()).pathname === "/profile";
  if (!fullProfile && !alreadyOpen) await openProfile(page);
  const settings = page.locator('[data-testid="profile-settings"]:visible');
  const trigger = settings.locator("button[data-language-trigger]");
  await trigger.click();
  await settings.getByRole("menuitemradio", { name: languageNames[locale], exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-locale", locale);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  if (!fullProfile && !alreadyOpen) {
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  }
}
