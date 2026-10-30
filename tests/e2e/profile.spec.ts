import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { analysisFixture } from "./helpers/analysis";
import { changeLanguage, chooseProfileOption, openProfile } from "./helpers/language";

test("profile keeps controls off the home screen and saves independent appearance, language and topics", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (["error", "warning"].includes(message.type())) errors.push(message.text()); });
  await page.route("**/api/**", route => route.abort());
  await page.goto("/");
  await expect(page).toHaveTitle(/RuFact/);
  await expect(page.locator("#hero-heading")).toBeVisible();
  await expect(page.locator("header [data-language-trigger], .site-footer .text-size-control, #analysis-history-trigger")).toHaveCount(0);
  const draft = "A draft stays while I adjust my profile.";
  await page.locator("#analysis-text").fill(draft);
  const trigger = page.locator("[data-profile-trigger]:visible").first();
  const profile = await openProfile(page);
  await expect(page).toHaveURL(/\/$/);
  await changeLanguage(page, "en");
  await expect(profile.getByRole("heading", { name: "Profile and settings", exact: true })).toBeVisible();
  await expect(profile.getByRole("link", { name: "Open Telegram bot: @RuFact_bot", exact: true })).toHaveAttribute("href", "https://t.me/RuFact_bot");
  await chooseProfileOption(page, "font", "serif");
  await chooseProfileOption(page, "text-size", "large");
  await chooseProfileOption(page, "design", "uz");
  await chooseProfileOption(page, "topic", "health");
  await expect(page.locator("html")).toHaveAttribute("data-font", "serif");
  await expect(page.locator("html")).toHaveAttribute("data-text-size", "large");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "uz");
  await expect(page.locator("html")).toHaveAttribute("data-locale", "en");
  await expect(profile.getByText("Topics guide source selection.", { exact: false })).toBeVisible();
  await expect(profile.getByRole("button", { name: "Close settings", exact: true })).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(profile).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(page.locator("#analysis-text")).toHaveValue(draft);
  await expect.poll(() => page.locator("#analysis-text").evaluate(element => getComputedStyle(element).fontFamily)).toMatch(/Lora|Georgia/i);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-font", "serif");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "uz");
  await expect(page.locator("html")).toHaveAttribute("data-locale", "en");
  await openProfile(page);
  await expect(profile.locator('input[name="profile-topic"][value="health"]')).toBeChecked();
  await changeLanguage(page, "ru");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "uz");
  await chooseProfileOption(page, "design", "auto");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ru");
  await changeLanguage(page, "en");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "en");
  await page.evaluate(() => document.fonts.ready);
  await profile.screenshot({ path: join(tmpdir(), `rufact-profile-${testInfo.project.name}.png`), caret: "initial" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const portal = page.locator("nextjs-portal");
  const overlay = await portal.count() ? await portal.evaluate(element => element.shadowRoot?.textContent ?? "") : "";
  expect(overlay).not.toMatch(/Build Error|Runtime Error/);
  expect(errors).toEqual([]);
});

test("profile topic guides checker and chat requests without losing active drafts or results", async ({ page }) => {
  const checks: { text: string; topic?: string }[] = [];
  const chats: { topic?: string }[] = [];
  await page.route("**/api/analyze", route => {
    checks.push(route.request().postDataJSON());
    return route.fulfill({ json: analysisFixture() });
  });
  await page.route("**/api/chat", route => {
    chats.push(route.request().postDataJSON());
    return route.fulfill({ json: { status: "complete", text: "A mocked source-grounded reply.", sources: [] } });
  });
  await page.goto("/");
  let profile = await openProfile(page);
  await changeLanguage(page, "en");
  await chooseProfileOption(page, "topic", "sport");
  await page.keyboard.press("Escape");
  await expect(profile).not.toBeVisible();
  const input = page.locator("#analysis-text");
  await input.fill("A factual sports statement to check.");
  await input.press("Enter");
  await expect.poll(() => checks.length).toBe(1);
  expect(checks[0]).toMatchObject({ text: "A factual sports statement to check.", topic: "sport" });
  await expect(page.locator('.analysis-result section[data-verdict-label="REAL"]')).toBeVisible();
  await page.locator(".text-analyzer [data-topic-control]").selectOption("general");
  await page.locator(".analyzer-submit").click();
  await expect.poll(() => checks.length).toBe(2);
  expect(checks[1].topic).toBeUndefined();
  await expect(input).toBeEnabled();
  profile = await openProfile(page);
  await expect(profile.locator('input[name="profile-topic"][value="sport"]')).toBeChecked();
  await chooseProfileOption(page, "font", "sans");
  await page.keyboard.press("Escape");
  await expect(profile).not.toBeVisible();
  await expect(input).toHaveValue("A factual sports statement to check.");
  await expect(page.locator('.analysis-result section[data-verdict-label="REAL"]')).toBeVisible();
  expect(checks).toHaveLength(2);
  await page.goto("/chat");
  const chatInput = page.getByRole("textbox", { name: "Question for AI chat" });
  await chatInput.fill("A follow-up draft stays while settings are open.");
  profile = await openProfile(page);
  await chooseProfileOption(page, "topic", "science");
  await page.keyboard.press("Escape");
  await expect(profile).not.toBeVisible();
  await expect(chatInput).toHaveValue("A follow-up draft stays while settings are open.");
  await expect(page.locator(".chat-workspace [data-topic-control]")).toHaveValue("science");
  await page.locator(".chat-workspace [data-topic-control]").selectOption("health");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("A mocked source-grounded reply.", { exact: true })).toBeVisible();
  expect(chats).toEqual([expect.objectContaining({ topic: "health" })]);
});

test("profile history is opt-in and supports individual deletion, cancelled clearing and disabling", async ({ page }) => {
  await page.route("**/api/analyze", route => route.fulfill({ json: analysisFixture() }));
  await page.goto("/");
  let profile = await openProfile(page);
  await changeLanguage(page, "en");
  const enabled = profile.getByTestId("profile-history-enabled");
  await expect(enabled).not.toBeChecked();
  await expect(profile).toContainText("Checked texts are not saved here until you enable it.");
  await enabled.check();
  await page.keyboard.press("Escape");
  await expect(profile).not.toBeVisible();
  const input = page.locator("#analysis-text");
  for (const statement of ["First saved statement.", "Second saved statement."]) {
    await input.fill(statement);
    await input.press("Enter");
    await expect(input).toBeEnabled();
    await expect(page.locator('.analysis-result section[data-verdict-label="REAL"]')).toBeVisible();
  }
  profile = await openProfile(page);
  const items = profile.getByTestId("profile-history-item");
  await expect(items).toHaveCount(2);
  await items.filter({ hasText: "First saved statement." }).getByRole("button", { name: /^Delete:/ }).click();
  await expect(items).toHaveCount(1);
  await expect(items).toContainText("Second saved statement.");
  await profile.getByTestId("profile-history-clear").click();
  await expect(profile.getByTestId("profile-history-confirmation")).toBeVisible();
  await profile.getByTestId("profile-history-cancel").click();
  await expect(items).toHaveCount(1);
  await profile.getByTestId("profile-history-clear").click();
  await profile.getByTestId("profile-history-confirm").click();
  await expect(items).toHaveCount(0);
  await expect(enabled).toBeChecked();
  await enabled.click();
  // A destructive disable is confirmed explicitly, not triggered by merely
  // visiting settings or clicking the unchecked draft state.
  await expect(profile.getByTestId("profile-history-confirmation")).toBeVisible();
  await profile.getByTestId("profile-history-confirm").click();
  await expect(enabled).not.toBeChecked();
  await page.keyboard.press("Escape");
  await expect(profile).not.toBeVisible();
  await expect(input).toHaveValue("Second saved statement.");
  await expect(page.locator('.analysis-result section[data-verdict-label="REAL"]')).toBeVisible();
});

test("standalone profile and blocked browser storage remain usable on narrow phones", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("Storage blocked", "SecurityError"); } });
  });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  if (testInfo.project.name.startsWith("mobile")) await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/profile$/);
  await page.locator("[data-profile-trigger]:visible").first().click();
  await expect(page.getByTestId("profile-dialog")).toHaveCount(0);
  await expect(page.getByTestId("profile-settings")).toHaveCount(1);
  await expect(page).toHaveTitle(/RuFact/);
  await expect(page.getByTestId("profile-settings")).toBeVisible();
  await changeLanguage(page, "en");
  await expect(page.getByRole("heading", { name: "Profile and settings", exact: true })).toBeVisible();
  await expect(page.getByText("Browser storage is unavailable.", { exact: false })).toBeVisible();
  await chooseProfileOption(page, "font", "serif");
  await chooseProfileOption(page, "design", "en");
  await chooseProfileOption(page, "topic", "politics");
  await expect(page.locator("html")).toHaveAttribute("data-font", "serif");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "en");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: join(tmpdir(), `rufact-profile-storage-${testInfo.project.name}.png`), caret: "initial" });
  expect(errors).toEqual([]);
});

test("API topics are validated before source-free math and greeting replies", async ({ request }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("desktop"), "Server contract once; no provider calls");
  // The local inputs are deliberate: even a validation regression cannot spend
  // Gemini/Tavily quota while this smoke test checks server request handling.
  const invalid = { value: "health" };
  const analyze = { text: "2+2=4", locale: "en" };
  const chat = { messages: [{ role: "user", content: "who are you?" }], locale: "en" };
  expect((await request.post("/api/analyze", { data: { ...analyze, topic: invalid } })).status()).toBe(400);
  expect((await request.post("/api/chat", { data: { ...chat, topic: invalid } })).status()).toBe(400);
  const math = await request.post("/api/analyze", { data: { ...analyze, topic: "science" } });
  expect(math.status()).toBe(200);
  expect((await math.json()).calculation?.correct).toBe(true);
  const greeting = await request.post("/api/chat", { data: { ...chat, topic: "health" } });
  expect(greeting.status()).toBe(200);
  expect((await greeting.json()).sources).toEqual([]);
});
