import { expect, test, type Page } from "@playwright/test";
import type { AnalysisResponse } from "../../lib/api";
import type { GeminiUnavailableReason } from "../../lib/gemini-review";
import { changeLanguage } from "./helpers/language";

const CLAIM = "Tashkent is the capital of Uzbekistan.";
const localized = {
  en: { unavailable: "CHECK UNAVAILABLE", unsure: "UNSURE", retry: "Try again later." },
  ru: { unavailable: "ПРОВЕРКА НЕДОСТУПНА", unsure: "НЕЯСНО", retry: "Повторите проверку позже." },
  uz: { unavailable: "TEKSHIRUV MAVJUD EMAS", unsure: "NOANIQ", retry: "Keyinroq qayta urinib ko‘ring." },
} as const;

function unavailable(reason: GeminiUnavailableReason): AnalysisResponse {
  return {
    label: "UNSURE", confidence: 0,
    meta: { engine: "unavailable", engineVersion: "source-only-test-v1", externalSourcesChecked: false },
    geminiReview: { status: "unavailable", provider: "gemini", reason },
  };
}

function insufficientEvidence(): AnalysisResponse {
  return {
    label: "UNSURE", confidence: 0,
    meta: { engine: "unavailable", engineVersion: "source-only-test-v1", externalSourcesChecked: true },
    geminiReview: {
      status: "complete", provider: "gemini", model: "deterministic-ui-test-model", promptVersion: "misinfo-tavily-v3",
      label: "UNSURE", certainty: "low", agreesWithPrimary: null,
      explanation: "The retrieved evidence does not establish whether the original claim is true or false.",
      warningSigns: [], externalSourcesChecked: true,
      claims: [{ id: "claim-1", quote: CLAIM, kind: "FACTUAL", assessment: "UNVERIFIED",
        explanation: "The cited source does not supply enough evidence to establish this relationship.", needsExternalVerification: true }],
      searchQueries: [CLAIM], sources: [{ id: "source-1", title: "Deterministic reference", url: "https://example.org/reference" }],
    },
  };
}

async function submit(page: Page) {
  await page.locator("#analysis-text").fill(CLAIM);
  const response = page.waitForResponse(value => value.url().endsWith("/api/analyze") && value.request().method() === "POST");
  await page.locator(".analyzer-submit").click();
  await response;
  await expect(page.locator(".analysis-result")).toHaveAttribute("aria-busy", "false");
}

for (const locale of ["en", "ru", "uz"] as const) {
  test(`technical verification failures are not confused with factual uncertainty in ${locale}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error" || message.type() === "warning") errors.push(message.text()); });
    let response = unavailable("timeout");
    // Presentation-only fixtures: failures and their recovery never contact an
    // external service or spend Gemini/Tavily credits in this regression suite.
    await page.route("**/api/analyze", route => route.fulfill({ json: response }));
    await page.goto("/");
    await changeLanguage(page, locale);
    for (const reason of ["timeout", "upstream-error", "rate-limited", "search-error", "search-rate-limited", "invalid-response"] as const) {
      response = unavailable(reason);
      await submit(page);
      const verdict = page.locator('[data-verdict-basis="unavailable"]');
      await expect(verdict).toHaveAttribute("data-verdict-label", "UNSURE");
      await expect(verdict).toHaveAttribute("data-verification-failure", reason);
      await expect(verdict).toContainText(localized[locale].unavailable);
      await expect(verdict).toContainText(localized[locale].retry);
      await expect(verdict).not.toContainText(localized[locale].unsure);
      await expect(page.locator('.analysis-result [role="meter"]')).toHaveCount(0);
    }

    // A completed but inconclusive source review is still genuine uncertainty,
    // not a service error. Missing configuration also keeps its existing state.
    response = insufficientEvidence();
    await submit(page);
    const sourceVerdict = page.locator('[data-verdict-basis="sources"]');
    await expect(sourceVerdict).toHaveAttribute("data-verdict-label", "UNSURE");
    await expect(sourceVerdict).toContainText(localized[locale].unsure);
    await expect(sourceVerdict).not.toContainText(localized[locale].unavailable);
    await expect(sourceVerdict).not.toHaveAttribute("data-verification-failure");

    for (const reason of ["not-configured", "no-search-results"] as const) {
      response = unavailable(reason);
      await submit(page);
      const verdict = page.locator('[data-verdict-basis="unavailable"]');
      await expect(verdict).toContainText(localized[locale].unsure);
      await expect(verdict).not.toContainText(localized[locale].unavailable);
      await expect(verdict).not.toHaveAttribute("data-verification-failure");
    }
    await expect(page.locator("nextjs-portal [role=dialog], vite-error-overlay, #webpack-dev-server-client-overlay")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  });
}
