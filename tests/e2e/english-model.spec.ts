import { expect, test } from "@playwright/test";
import { analysisFixture } from "./helpers/analysis";
import { changeLanguage } from "./helpers/language";

const claim = "Trump has six wives";

test("English content uses the real English artifact even in Russian UI", async ({ page }) => {
  await page.goto("/");
  await changeLanguage(page, "ru");
  await page.locator('#analysis-text').fill(claim);
  const response = page.waitForResponse(r => r.url().endsWith('/api/analyze') && r.request().method() === 'POST');
  await page.locator('.analyzer-submit').click();
  const result = await (await response).json();
  expect(result.meta.language).toBe('en');
  expect(result.meta.engineVersion).toBe('tfidf-word-char-logreg-en-v2');
  await expect(page.locator('[data-verdict-basis="statistical"]')).toBeVisible();
  await expect(page.locator('.analysis-result')).toContainText('ML-модель · EN');
  await expect(page.locator('[data-verdict-basis="statistical"]')).not.toContainText(/(?:^|\s)REAL(?:\s|$)/);
  await expect(page.locator('.analysis-result [role="meter"]')).toBeVisible();
});

for (const sourceLabel of ['FAKE', 'UNSURE'] as const) {
test(`source ${sourceLabel} replaces a green REAL headline, without a fabricated fact percentage`, async ({ page }) => {
  await page.route('**/api/analyze', route => route.fulfill({ json: {
    ...analysisFixture('REAL', 0.62),
    meta: { engine: 'external-model', engineVersion: 'tfidf-word-char-logreg-en-v2', language: 'en', externalSourcesChecked: false },
    geminiReview: {
      status: 'complete', provider: 'gemini', model: 'test-model', promptVersion: 'misinfo-tavily-v3',
      label: sourceLabel, certainty: 'medium', agreesWithPrimary: sourceLabel === 'UNSURE' ? null : false,
      explanation: 'Retrieved references contradict the claim about six wives.',
      warningSigns: [], externalSourcesChecked: true, searchQueries: [claim],
      sources: [{ id: 'source-1', title: 'Example reference', url: 'https://example.org/reference' }],
      claims: [{ id: 'claim-1', quote: claim, kind: 'FACTUAL', assessment: sourceLabel === 'UNSURE' ? 'UNVERIFIED' : 'CONTRADICTED',
        explanation: 'The reference does not establish the number in the submitted claim.', needsExternalVerification: sourceLabel === 'UNSURE' }],
    },
  } }));
  await page.goto('/');
  await changeLanguage(page, 'en');
  await page.locator('#analysis-text').fill(claim);
  await page.locator('.analyzer-submit').click();
  const headline = page.locator('[data-verdict-basis="sources"]');
  await expect(headline).toHaveAttribute('data-verdict-label', sourceLabel);
  await expect(headline).toContainText(sourceLabel);
  await expect(headline).toContainText('Medium certainty');
  await expect(headline).not.toContainText('REAL');
  await expect(headline).not.toContainText('62%');
  await expect(page.locator('.analysis-result [role="meter"]')).toHaveCount(0);
  await expect(page.locator('[data-statistical-summary]')).toContainText('ML · EN · REAL · 62%');
});
}

test("Uzbek without a trained model or usable source review stays neutral", async ({ page }) => {
  await page.goto('/');
  await changeLanguage(page, 'uz');
  await page.locator('#analysis-text').fill('Bu xabar rost emas va uning manbasi yo‘q.');
  await page.locator('.analyzer-submit').click();
  const headline = page.locator('[data-verdict-basis="unavailable"]');
  await expect(headline).toHaveAttribute('data-verdict-label', 'UNSURE');
  await expect(headline).toContainText('NOANIQ');
  await expect(page.locator('.analysis-result [role="meter"]')).toHaveCount(0);
  await expect(headline).not.toContainText('REAL');
});

test("model-info shows separate English held-out quality and research-use limitations", async ({ page }) => {
  await page.goto('/model');
  await changeLanguage(page, 'en');
  const section = page.locator('section[aria-labelledby="english-quality-heading"]');
  await expect(section).toContainText('65.1%');
  await expect(section).toContainText('1,016');
  await expect(section).toContainText('research-use-only');
  await expect(section).toContainText('not a fact-check');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
