import type { AppLocale } from "./i18n";

export type GeminiReviewLabel = "REAL" | "FAKE" | "UNSURE";
export type GeminiReviewCertainty = "low" | "medium" | "high";
export type GeminiClaimKind = "FACTUAL" | "OPINION";
export type GeminiClaimAssessment =
  | "SUPPORTED"
  | "CONTRADICTED"
  | "MIXED"
  | "UNVERIFIED"
  | "NOT_APPLICABLE";

export interface GeminiSource {
  id: string;
  title: string;
  url: string;
}

export interface GeminiClaimEvidence {
  sourceId: string;
  quote: string;
}

export interface GeminiClaimCorrection {
  text: string;
  evidence: GeminiClaimEvidence[];
}

export interface GeminiClaim {
  id: string;
  quote: string;
  kind: GeminiClaimKind;
  assessment: GeminiClaimAssessment;
  explanation: string;
  needsExternalVerification: boolean;
  // Optional only for legacy v3 results; all newly generated v4 claims supply both.
  evidence?: GeminiClaimEvidence[];
  correction?: GeminiClaimCorrection | null;
}

export type GeminiUnavailableReason =
  | "not-configured"
  | "search-not-configured"
  | "search-rate-limited"
  | "no-search-results"
  | "search-error"
  | "primary-unavailable"
  | "timeout"
  | "rate-limited"
  | "blocked"
  | "invalid-response"
  | "upstream-error";

export interface GeminiReviewComplete {
  status: "complete";
  provider: "gemini";
  model: string;
  promptVersion: "misinfo-tavily-v3" | "misinfo-tavily-v4";
  label: GeminiReviewLabel;
  certainty: GeminiReviewCertainty;
  agreesWithPrimary: boolean | null;
  explanation: string;
  warningSigns: string[];
  claims: GeminiClaim[];
  /** v4 explicitly marks incomplete claim coverage; absent on legacy v3. */
  coverage?: "complete" | "partial";
  externalSourcesChecked: true;
  searchQueries: string[];
  sources: GeminiSource[];
}

export interface GeminiReviewUnavailable {
  status: "unavailable";
  provider: "gemini";
  reason: GeminiUnavailableReason;
}

export type GeminiReview = GeminiReviewComplete | GeminiReviewUnavailable;

export interface GeminiReviewRequestOptions {
  useGemini?: boolean;
  locale?: AppLocale;
}
