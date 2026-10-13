import { ExternalLink } from "lucide-react";

import { claimExplanationCopy } from "@/lib/claim-copy";
import { resolveClaimEvidence } from "@/lib/claim-evidence";
import type {
  GeminiClaim,
  GeminiClaimEvidence,
  GeminiSource,
} from "@/lib/gemini-review";
import type { AppLocale } from "@/lib/i18n";

interface ClaimExplanationProps {
  claim: GeminiClaim;
  sources: readonly GeminiSource[];
  locale: AppLocale;
}

function ClaimEvidence({
  evidence,
  sources,
  label,
  testId,
}: {
  evidence: readonly GeminiClaimEvidence[];
  sources: readonly GeminiSource[];
  label: string;
  testId: "claim-evidence" | "correction-evidence";
}) {
  const entries = resolveClaimEvidence(evidence, sources);

  if (entries.length === 0) return null;

  return (
    <div className="mt-3 border-t border-[#d8e0e6]/90 pt-2.5" data-testid={testId}>
      <p className="text-xs font-extrabold text-[#526b7f]">{label}</p>
      <ul className="mt-1.5 grid gap-2.5" aria-label={label}>
        {entries.map(({ source, quote }, index) => (
          <li key={`${source.id}-${index}`} className="min-w-0">
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-md text-xs leading-relaxed font-bold text-[#315d7b] underline decoration-[#a6bac8] underline-offset-2 hover:text-[#173b59]"
            >
              <span className="min-w-0 [overflow-wrap:anywhere]">{source.title}</span>
              <ExternalLink className="shrink-0" size={12} aria-hidden="true" />
            </a>
            <blockquote className="border-l-2 border-[#a6bac8] pl-2.5 text-xs leading-relaxed whitespace-pre-wrap text-[#627383] [overflow-wrap:anywhere]">
              {quote}
            </blockquote>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ClaimExplanation({ claim, sources, locale }: ClaimExplanationProps) {
  const labels = claimExplanationCopy[locale];
  const contradicted = claim.kind === "FACTUAL" && claim.assessment === "CONTRADICTED";
  // Older history has no correction. Never infer one or present a generated fact
  // without its own validated evidence.
  const correction = contradicted && claim.correction &&
    resolveClaimEvidence(claim.correction.evidence, sources).length > 0
    ? claim.correction
    : null;
  const shownEvidence = resolveClaimEvidence(claim.evidence, sources);
  const additionalCorrectionEvidence = correction?.evidence.filter(
    (item) => !shownEvidence.some(
      (shown) => shown.sourceId === item.sourceId && shown.quote === item.quote.trim(),
    ),
  ) ?? [];

  return (
    <div className="mt-3 min-w-0">
      <dl className="grid gap-3">
        <div>
          <dt className="text-xs font-extrabold text-[#526b7f]">{labels.original}</dt>
          <dd className="mt-1">
            <blockquote
              className="border-l-2 border-[#7897ad] pl-2.5 text-sm leading-relaxed font-semibold whitespace-pre-wrap text-[#354f65] [overflow-wrap:anywhere]"
              data-testid="claim-original"
            >
              {claim.quote}
            </blockquote>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-extrabold text-[#526b7f]">
            {contradicted ? labels.whyWrong : labels.explanation}
          </dt>
          <dd
            className="mt-1 text-sm leading-relaxed whitespace-pre-wrap text-[#536879] [overflow-wrap:anywhere]"
            data-testid="claim-reason"
          >
            {claim.explanation}
          </dd>
        </div>
        {correction ? (
          <div className="rounded-lg border border-[#d4e5d8] bg-[#edf5ef] px-3 py-2.5">
            <dt className="text-xs font-extrabold text-[#306d45]">{labels.correction}</dt>
            <dd
              className="mt-1 text-sm leading-relaxed font-semibold whitespace-pre-wrap text-[#28533a] [overflow-wrap:anywhere]"
              data-testid="claim-correction"
            >
              {correction.text}
            </dd>
          </div>
        ) : null}
      </dl>
      <ClaimEvidence
        evidence={claim.evidence ?? []}
        sources={sources}
        label={labels.evidence}
        testId="claim-evidence"
      />
      {correction && additionalCorrectionEvidence.length > 0 ? (
        <ClaimEvidence
          evidence={additionalCorrectionEvidence}
          sources={sources}
          label={labels.correctionEvidence}
          testId="correction-evidence"
        />
      ) : null}
    </div>
  );
}
