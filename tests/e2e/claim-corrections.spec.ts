import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AnalysisResponse } from "../../lib/api";
import type { GeminiClaim } from "../../lib/gemini-review";
import type { AppLocale } from "../../lib/i18n";
import { changeLanguage } from "./helpers/language";

// These are deterministic presentation fixtures, not live factual assessments.
// The browser cannot spend Tavily/Gemini quota or contact their APIs in this suite.
const SOURCE_URL = "https://constitution.gov.uz/en";
const SOURCE_TITLE = "Constitution of the Republic of Uzbekistan — Article 6";
const SOURCE_QUOTE = "The capital of the Republic of Uzbekistan is the city of Tashkent.";
const SOURCE_EVIDENCE = [{ sourceId: "source-1", quote: SOURCE_QUOTE }];
const localized = {
  en: {
    claim: "Samarkand is the capital of Uzbekistan.",
    reason: "The cited constitutional passage names Tashkent as the capital, not Samarkand.",
    correction: "Tashkent is the capital of Uzbekistan.",
    heading: "Why this claim is wrong",
    why: "Why it is wrong",
    correct: "Correct fact",
  },
  ru: {
    claim: "Самарканд — столица Узбекистана.",
    reason: "В приведённой статье Конституции столицей указан Ташкент, а не Самарканд.",
    correction: "Ташкент — столица Узбекистана.",
    heading: "Почему это утверждение неверно",
    why: "Почему это неверно",
    correct: "Верный факт",
  },
  uz: {
    claim: "Samarqand O‘zbekistonning poytaxti.",
    reason: "Keltirilgan Konstitutsiya moddasida poytaxt Samarqand emas, Toshkent deb ko‘rsatilgan.",
    correction: "Toshkent O‘zbekistonning poytaxti.",
    heading: "Nega bu da’vo noto‘g‘ri",
    why: "Nega bu noto‘g‘ri",
    correct: "To‘g‘ri fakt",
  },
} as const;

interface FixtureOptions {
  quote?: string;
  correction?: boolean;
  unverified?: boolean;
  supportedFirst?: boolean;
  legacy?: boolean;
}

function correctionFixture(locale: AppLocale, options: FixtureOptions = {}): AnalysisResponse {
  const copy = localized[locale];
  const unverified = options.unverified === true;
  const assessment = unverified ? "UNVERIFIED" : "CONTRADICTED";
  const quote = options.quote ?? copy.claim;
  const claims: GeminiClaim[] = [{
    id: options.supportedFirst ? "claim-2" : "claim-1",
    quote,
    kind: "FACTUAL",
    assessment,
    explanation: unverified ? "The retrieved passage does not establish whether this claim is true or false." : copy.reason,
    needsExternalVerification: unverified,
    ...(!options.legacy ? {
      evidence: unverified ? [] : SOURCE_EVIDENCE,
      correction: !unverified && options.correction !== false
        ? { text: copy.correction, evidence: SOURCE_EVIDENCE }
        : null,
    } : {}),
  }];
  if (options.supportedFirst) {
    claims.unshift({
      id: "claim-1", quote: "Tashkent is the capital of Uzbekistan.", kind: "FACTUAL", assessment: "SUPPORTED",
      explanation: "The cited passage explicitly names Tashkent as the capital of Uzbekistan.",
      needsExternalVerification: false, evidence: SOURCE_EVIDENCE, correction: null,
    });
  }
  return {
    // Deliberately disagree with the statistical classifier. Source evidence must
    // lead the public verdict and must never display its score as fact confidence.
    label: "REAL", confidence: 0.62,
    explanation: "A deterministic statistical classifier result, not proof of the claim.",
    meta: { engine: "external-model", engineVersion: "correction-ui-test-v1", externalSourcesChecked: false, language: "en" },
    geminiReview: {
      status: "complete", provider: "gemini", model: "deterministic-test-model",
      promptVersion: options.legacy ? "misinfo-tavily-v3" : "misinfo-tavily-v4",
      ...(!options.legacy ? { coverage: "complete" as const } : {}),
      label: unverified ? "UNSURE" : "FAKE", certainty: unverified ? "low" : "high",
      agreesWithPrimary: unverified ? null : false,
      explanation: unverified ? "The retrieved evidence is insufficient to verify the submitted claim." : copy.reason,
      warningSigns: [], claims, externalSourcesChecked: true,
      searchQueries: [quote], sources: [{ id: "source-1", title: SOURCE_TITLE, url: SOURCE_URL }],
    },
  };
}

function collectRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" || message.type() === "warning") errors.push(message.text());
  });
  return errors;
}

async function submitFixture(page: Page, locale: AppLocale, result: AnalysisResponse, text: string) {
  const requests: { text: string; locale: string }[] = [];
  await page.route("**/api/analyze", async route => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: result });
  });
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page).toHaveTitle(/RuFact/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await changeLanguage(page, locale);
  await page.locator("#analysis-text").fill(text);
  await page.locator(".analyzer-submit").click();
  await expect(page.locator('[data-verdict-basis="sources"]')).toBeVisible();
  expect(requests).toEqual([expect.objectContaining({ text, locale })]);
}

async function expectHealthyPage(page: Page, errors: string[]) {
  await expect(page.locator("nextjs-portal [role=dialog], vite-error-overlay, #webpack-dev-server-client-overlay")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
}

for (const locale of ["en", "ru", "uz"] as const) {
  test(`contradicted claim immediately shows why, the corrected fact and linked passages in ${locale}`, async ({ page }, testInfo) => {
    const errors = collectRuntimeErrors(page);
    const copy = localized[locale];
    await submitFixture(page, locale, correctionFixture(locale), copy.claim);
    const headline = page.locator('[data-verdict-basis="sources"]');
    await expect(headline).toHaveAttribute("data-verdict-label", "FAKE");
    await expect(headline).not.toContainText("62%");
    await expect(page.locator('.analysis-result [role="meter"]')).toHaveCount(0);

    const highlight = page.getByTestId("claim-correction-highlight");
    await expect(highlight).toBeVisible();
    await expect(highlight).toContainText(copy.heading);
    await expect(highlight).toContainText(copy.why);
    await expect(highlight).toContainText(copy.correct);
    await expect(highlight.getByTestId("claim-original")).toHaveText(copy.claim);
    await expect(highlight.getByTestId("claim-reason")).toContainText(copy.reason);
    await expect(highlight.getByTestId("claim-correction")).toContainText(copy.correction);
    const evidence = highlight.getByTestId("claim-evidence");
    await expect(evidence).toContainText(SOURCE_QUOTE);
    const link = evidence.getByRole("link", { name: SOURCE_TITLE });
    await expect(link).toHaveAttribute("href", SOURCE_URL);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
    // The correction independently references this same validated passage.
    // Display it once, rather than repeating a source/quote beneath the card.
    await expect(highlight.getByTestId("correction-evidence")).toHaveCount(0);
    await expect(highlight.getByRole("link", { name: SOURCE_TITLE })).toHaveCount(1);

    // The explanation is already expanded; opening the claims accordion is not
    // a prerequisite for seeing what is wrong or what the evidence establishes.
    expect(await highlight.evaluate(element => !element.closest("details:not([open])"))).toBe(true);
    await highlight.scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(tmpdir(), `rufact-claim-correction-${locale}-${testInfo.project.name}.png`), fullPage: false });
    await expectHealthyPage(page, errors);
  });
}

test("Uzbek Cyrillic original wording is kept intact beside a Latin Uzbek correction", async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  const quote = "Самарқанд Ўзбекистоннинг пойтахти.";
  await submitFixture(page, "uz", correctionFixture("uz", { quote }), quote);
  const highlight = page.getByTestId("claim-correction-highlight");
  await expect(highlight.getByTestId("claim-original")).toHaveText(quote);
  await expect(highlight.getByTestId("claim-correction")).toContainText(localized.uz.correction);
  await expect(page.locator("#analysis-text")).toHaveValue(quote);
  await expectHealthyPage(page, errors);
});

test("a reversed relationship is preserved as the original claim and corrected separately", async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  const quote = "Uzbekistan is capital of Tashkent";
  const result = correctionFixture("en", { quote });
  if (result.geminiReview?.status !== "complete") throw new Error("Invalid test fixture");
  const reason = "The source says Tashkent is the capital of Uzbekistan, not that Uzbekistan is the capital of Tashkent.";
  result.geminiReview.explanation = reason;
  result.geminiReview.claims[0].explanation = reason;
  await submitFixture(page, "en", result, quote);
  const highlight = page.getByTestId("claim-correction-highlight");
  await expect(highlight.getByTestId("claim-original")).toHaveText(quote);
  await expect(highlight.getByTestId("claim-reason")).toHaveText(reason);
  await expect(highlight.getByTestId("claim-correction")).toHaveText(localized.en.correction);
  await expect(page.locator("#analysis-text")).toHaveValue(quote);
  await expect(page.locator('[data-verdict-basis="sources"]')).toHaveAttribute("data-verdict-label", "FAKE");
  await expectHealthyPage(page, errors);
});

test("a correction with distinct evidence displays its own linked supporting passage", async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  const result = correctionFixture("en");
  if (result.geminiReview?.status !== "complete") throw new Error("Invalid test fixture");
  const correction = result.geminiReview.claims[0].correction;
  if (!correction) throw new Error("Missing test correction");
  const title = "Deterministic independent capital reference";
  const url = "https://example.org/capital-reference";
  const quote = "Tashkent is the capital city of Uzbekistan.";
  result.geminiReview.sources.push({ id: "source-2", title, url });
  correction.evidence = [{ sourceId: "source-2", quote }];
  await submitFixture(page, "en", result, localized.en.claim);
  const highlight = page.getByTestId("claim-correction-highlight");
  await expect(highlight.getByTestId("claim-correction")).toHaveText(localized.en.correction);
  await expect(highlight.getByTestId("claim-evidence")).toContainText(SOURCE_QUOTE);
  const correctionEvidence = highlight.getByTestId("correction-evidence");
  await expect(correctionEvidence).toBeVisible();
  await expect(correctionEvidence).toContainText(quote);
  await expect(correctionEvidence.getByRole("link", { name: title })).toHaveAttribute("href", url);
  await expect(highlight.getByRole("link", { name: SOURCE_TITLE })).toHaveCount(1);
  await expect(highlight.getByRole("link", { name: title })).toHaveCount(1);
  await expectHealthyPage(page, errors);
});

test("contradiction without a known replacement explains the evidence and invents no corrected fact", async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await submitFixture(page, "en", correctionFixture("en", { correction: false }), localized.en.claim);
  const highlight = page.getByTestId("claim-correction-highlight");
  await expect(highlight.getByTestId("claim-original")).toHaveText(localized.en.claim);
  await expect(highlight.getByTestId("claim-reason")).toContainText(localized.en.reason);
  await expect(highlight.getByTestId("claim-evidence")).toContainText(SOURCE_QUOTE);
  await expect(highlight.getByTestId("claim-correction")).toHaveCount(0);
  await expect(highlight.getByTestId("correction-evidence")).toHaveCount(0);
  await expectHealthyPage(page, errors);
});

test("missing evidence remains unsure rather than manufacturing a contradiction or correction", async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  const quote = "Samarkand will become the capital of Uzbekistan in 2030.";
  await submitFixture(page, "en", correctionFixture("en", { quote, unverified: true }), quote);
  await expect(page.locator('[data-verdict-basis="sources"]')).toHaveAttribute("data-verdict-label", "UNSURE");
  await expect(page.getByTestId("claim-correction-highlight")).toHaveCount(0);
  await expect(page.getByTestId("claim-correction")).toHaveCount(0);
  await page.getByText("Claims in the text", { exact: true }).click();
  const claims = page.getByRole("list", { name: "Claims identified by Gemini" });
  await expect(claims).toContainText("Unverified");
  await expect(claims.getByTestId("claim-original")).toHaveText(quote);
  await expect(claims.getByTestId("claim-evidence")).toHaveCount(0);
  await expectHealthyPage(page, errors);
});

test("a mixed paragraph highlights the actual false sentence even when a supported claim comes first", async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  const text = `Tashkent is the capital of Uzbekistan. ${localized.en.claim}`;
  await submitFixture(page, "en", correctionFixture("en", { supportedFirst: true }), text);
  await expect(page.locator('[data-verdict-basis="sources"]')).toHaveAttribute("data-verdict-label", "FAKE");
  const highlight = page.getByTestId("claim-correction-highlight");
  await expect(highlight.getByTestId("claim-original")).toHaveText(localized.en.claim);
  await expect(highlight.getByTestId("claim-correction")).toContainText(localized.en.correction);
  await page.getByText("Claims in the text", { exact: true }).click();
  const claims = page.getByRole("list", { name: "Claims identified by Gemini" });
  await expect(claims).toContainText("Supported");
  await expect(claims).toContainText("Contradicted");
  await expect(claims.getByTestId("claim-original").filter({ hasText: "Tashkent is the capital" })).toHaveCount(1);
  await expectHealthyPage(page, errors);
});

test("partial claim coverage cannot give a green verdict even when the checked claim is supported", async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  const quote = "Tashkent is the capital of Uzbekistan.";
  const text = `${quote} Its population will double next year.`;
  const result = correctionFixture("en");
  if (result.geminiReview?.status !== "complete") throw new Error("Invalid test fixture");
  result.geminiReview.coverage = "partial";
  result.geminiReview.label = "UNSURE";
  result.geminiReview.agreesWithPrimary = null;
  result.geminiReview.explanation = "The capital claim is supported, but another factual claim in the text was not checked.";
  result.geminiReview.claims = [{
    id: "claim-1", quote, kind: "FACTUAL", assessment: "SUPPORTED",
    explanation: "The cited passage establishes the capital, but not the population prediction.",
    needsExternalVerification: false, evidence: SOURCE_EVIDENCE, correction: null,
  }];
  await submitFixture(page, "en", result, text);
  await expect(page.locator('[data-verdict-basis="sources"]')).toHaveAttribute("data-verdict-label", "UNSURE");
  await expect(page.getByTestId("claim-partial-coverage")).toBeVisible();
  await expect(page.getByTestId("claim-partial-coverage")).toContainText(/partial|not.*checked|not.*verified/i);
  await expect(page.getByTestId("claim-correction-highlight")).toHaveCount(0);
  await page.getByText("Claims in the text", { exact: true }).click();
  await expect(page.getByRole("list", { name: "Claims identified by Gemini" })).toContainText("Supported");
  await expectHealthyPage(page, errors);
});

test("legacy v3 reviews still explain a false claim without invented correction or per-claim citation", async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await submitFixture(page, "en", correctionFixture("en", { legacy: true }), localized.en.claim);
  await expect(page.locator('[data-verdict-basis="sources"]')).toHaveAttribute("data-verdict-label", "FAKE");
  const highlight = page.getByTestId("claim-correction-highlight");
  await expect(highlight.getByTestId("claim-original")).toHaveText(localized.en.claim);
  await expect(highlight.getByTestId("claim-reason")).toContainText(localized.en.reason);
  await expect(highlight.getByTestId("claim-correction")).toHaveCount(0);
  await expect(highlight.getByTestId("claim-evidence")).toHaveCount(0);
  await expect(page.locator(`.analysis-result a[href="${SOURCE_URL}"]`)).toBeVisible();
  await expectHealthyPage(page, errors);
});

test("downloaded report retains the exact false claim, why, correction and source passage", async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await submitFixture(page, "en", correctionFixture("en"), localized.en.claim);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download .txt", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^rufact-\d{4}-\d{2}-\d{2}\.txt$/);
  const downloadedPath = await download.path();
  expect(downloadedPath).not.toBeNull();
  const report = await readFile(downloadedPath!, "utf8");
  for (const expected of ["Your claim:", "Why:", "Correct fact:", "Evidence:", localized.en.claim,
    localized.en.reason, localized.en.correction, SOURCE_QUOTE, SOURCE_URL]) {
    expect(report).toContain(expected);
  }
  await expectHealthyPage(page, errors);
});
