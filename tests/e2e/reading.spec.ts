import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chooseProfileOption, openProfile } from "./helpers/language";

test("reading size persists through profile settings and mobile controls stay usable", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  await expect(page).toHaveTitle(/RuFact/);
  const mobile = testInfo.project.name.startsWith("mobile");
  const input = page.locator("#analysis-text");
  const originalSize = await input.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  if (mobile) expect(originalSize).toBeGreaterThanOrEqual(16);
  const profile = await openProfile(page);
  await chooseProfileOption(page, "text-size", "larger");
  await expect(page.locator("html")).toHaveAttribute("data-text-size", "larger");
  await page.screenshot({ path: join(tmpdir(), `rufact-reading-profile-${testInfo.project.name}.png`), caret: "initial" });
  await page.keyboard.press("Escape");
  await expect(profile).not.toBeVisible();
  await expect.poll(() => input.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(originalSize);
  await input.fill("O‘zbekiston poytaxti Toshkent. Ўзбекистон пойтахти Тошкент.");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-text-size", "larger");
  await expect.poll(() => input.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(originalSize);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto("/model");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-text-size", "larger");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (mobile) {
    await page.setViewportSize({ width: 320, height: 740 });
    const narrowProfile = await openProfile(page);
    expect(await narrowProfile.evaluate(element => element.getBoundingClientRect().right <= innerWidth)).toBe(true);
    await expect(narrowProfile.locator('input[name="profile-text-size"][value="larger"]')).toBeChecked();
    await page.screenshot({ path: join(tmpdir(), "rufact-reading-narrow-profile.png"), caret: "initial" });
    await page.keyboard.press("Escape");
    await expect(narrowProfile).not.toBeVisible();
  }
  expect(errors).toEqual([]);
});
