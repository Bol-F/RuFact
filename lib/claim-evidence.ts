import type { GeminiClaim, GeminiClaimEvidence, GeminiReviewLabel, GeminiSource } from "./gemini-review";

export const MAX_CLAIM_EVIDENCE = 2;
export const MAX_EVIDENCE_QUOTE_LENGTH = 360;
export const MAX_CORRECTION_LENGTH = 320;

export function safeSourceHref(source: GeminiSource): string | null {
  try {
    if (source.url.length > 2_048) return null;
    const url = new URL(source.url);
    return url.protocol === "https:" && !url.username && !url.password ? source.url : null;
  } catch { return null; }
}

/** Provenance validation, not a proof that a passage logically entails a claim. */
export function readClaimEvidence(
  value: unknown,
  sources: readonly (GeminiSource & { content?: string })[],
): GeminiClaimEvidence[] | null {
  if (!Array.isArray(value) || value.length > MAX_CLAIM_EVIDENCE) return null;
  const indexed = new Map(sources.map(source => [source.id, source]));
  const result: GeminiClaimEvidence[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const keys = Object.keys(item);
    if (keys.length !== 2 || !keys.every(key => key === "sourceId" || key === "quote") ||
      typeof item.sourceId !== "string" || typeof item.quote !== "string") return null;
    const source = indexed.get(item.sourceId);
    const quote = item.quote.trim();
    const identity = `${item.sourceId}\n${quote}`;
    if (!source || !safeSourceHref(source) || quote.length < 10 ||
      quote.length > MAX_EVIDENCE_QUOTE_LENGTH || seen.has(identity) ||
      (source.content !== undefined && !source.content.includes(quote))) return null;
    seen.add(identity);
    result.push({ sourceId: item.sourceId, quote });
  }
  return result;
}

export function resolveClaimEvidence(
  evidence: readonly GeminiClaimEvidence[] | undefined,
  sources: readonly GeminiSource[],
) {
  const indexed = new Map(sources.map(source => [source.id, source]));
  return (readClaimEvidence(evidence ?? [], sources) ?? []).map(item => ({
    ...item, source: indexed.get(item.sourceId)!,
  }));
}

/** A contradiction prevents an all-supported result; opinions are not factual proof. */
export function deriveClaimLabel(claims: readonly GeminiClaim[], coverage?: "complete" | "partial"): GeminiReviewLabel {
  const factual = claims.filter(claim => claim.kind === "FACTUAL");
  if (factual.some(claim => claim.assessment === "CONTRADICTED")) return "FAKE";
  return coverage !== "partial" && factual.length > 0 && factual.every(claim => claim.assessment === "SUPPORTED") ? "REAL" : "UNSURE";
}
