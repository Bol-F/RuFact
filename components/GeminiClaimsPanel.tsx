import {
  ExternalLink,
  FileQuestion,
  MessageSquareQuote,
  Search,
} from "lucide-react";

import type {
  GeminiClaim,
  GeminiClaimAssessment,
  GeminiSource,
} from "@/lib/gemini-review";
import { ClaimExplanation } from "./ClaimExplanation";
import { useLanguage } from "./LanguageProvider";

interface GeminiClaimsPanelProps {
  claims: readonly GeminiClaim[];
  sources: readonly GeminiSource[];
  highlightedClaimId?: string;
}

const assessmentCopy: Record<GeminiClaimAssessment, string> = {
  SUPPORTED: "Подтверждается",
  CONTRADICTED: "Опровергается",
  MIXED: "Источники расходятся",
  UNVERIFIED: "Не удалось проверить",
  NOT_APPLICABLE: "Субъективная оценка",
};

const assessmentTone: Record<GeminiClaimAssessment, string> = {
  SUPPORTED: "bg-[#dcecdf] text-[#306d45]",
  CONTRADICTED: "bg-[#f4d9d6] text-[#a63c43]",
  MIXED: "bg-[#f7dfd3] text-[#92502f]",
  UNVERIFIED: "bg-[#e5e8eb] text-[#526475]",
  NOT_APPLICABLE: "bg-[#e8e2f0] text-[#66547a]",
};

function buildVerificationUrl(quote: string, sourceTerm: string) {
  const query = `\"${quote}\" ${sourceTerm}`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function factualClaimSummary(count: number) {
  if (count === 1) {
    return "Одно фактологическое утверждение сопоставлено с результатами поиска.";
  }

  if (count > 1 && count < 5) {
    return `${count} фактологических утверждения сопоставлены с результатами поиска.`;
  }

  return `${count} фактологических утверждений сопоставлены с результатами поиска.`;
}

export function GeminiClaimsPanel({ claims, sources, highlightedClaimId }: GeminiClaimsPanelProps) {
  const { locale } = useLanguage();
  const labels = locale === "uz"
    ? { title: "Matndagi da’volar", show: "Ko‘rsatish", hide: "Yashirish", opinionOnly: "Matnda faqat subyektiv fikrlar ajratildi.", aria: "Gemini ajratgan da’volar", fact: "Fakt", opinion: "Fikr", verify: "Qo‘shimcha tekshirish", source: "birlamchi manba", assessments: { SUPPORTED: "Tasdiqlanadi", CONTRADICTED: "Rad etiladi", MIXED: "Manbalar farq qiladi", UNVERIFIED: "Tekshirilmadi", NOT_APPLICABLE: "Subyektiv fikr" } }
    : locale === "en"
      ? { title: "Claims in the text", show: "Show", hide: "Hide", opinionOnly: "Only subjective statements were identified in the text.", aria: "Claims identified by Gemini", fact: "Fact", opinion: "Opinion", verify: "Verify further", source: "primary source", assessments: { SUPPORTED: "Supported", CONTRADICTED: "Contradicted", MIXED: "Sources differ", UNVERIFIED: "Unverified", NOT_APPLICABLE: "Subjective" } }
      : { title: "Утверждения в тексте", show: "Показать", hide: "Скрыть", opinionOnly: "В тексте выделены только оценочные суждения.", aria: "Утверждения Gemini", fact: "Факт", opinion: "Мнение", verify: "Проверить дополнительно", source: "первоисточник", assessments: assessmentCopy };
  const factualCount = claims.reduce(
    (count, claim) => count + (claim.kind === "FACTUAL" ? 1 : 0),
    0,
  );
  const factualSummary = locale === "uz"
    ? `${factualCount} ta faktik da’vo qidiruv natijalari bilan solishtirildi.`
    : locale === "en"
      ? `${factualCount} factual ${factualCount === 1 ? "claim was" : "claims were"} compared with search results.`
      : factualClaimSummary(factualCount);

  return (
    <details className="group mt-3 overflow-hidden rounded-[11px] border border-[#cbd8e2]/90 bg-white/45">
      <summary className="focus-ring flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-[10px] px-3 text-[#294a65] marker:hidden">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#dce9f2] text-[#356783]">
          <MessageSquareQuote size={15} strokeWidth={2} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 text-[0.71875rem] font-extrabold">
          {labels.title}
        </span>
        <span className="rounded-md bg-white/80 px-2 py-0.5 text-[0.5625rem] font-bold tabular-nums text-[#60768a]">
          {claims.length}
        </span>
        <span className="text-[0.5625rem] font-bold text-[#738494] group-open:hidden">
          {labels.show}
        </span>
        <span className="hidden text-[0.5625rem] font-bold text-[#738494] group-open:inline">
          {labels.hide}
        </span>
      </summary>

      <div className="border-t border-[#cbd8e2]/80 px-3 py-3">
        <p className="mb-3 flex items-start gap-2 text-[0.59375rem] leading-[1.45] text-[#738494]">
          <FileQuestion className="mt-0.5 shrink-0" size={13} aria-hidden="true" />
          {factualCount
            ? factualSummary
            : labels.opinionOnly}
        </p>

        <ol className="grid gap-2.5" aria-label={labels.aria}>
          {claims.map((claim, index) => (
            <li
              key={claim.id}
              className="rounded-[10px] border border-[#d8e0e6] bg-white/70 p-3"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[0.5625rem] font-extrabold tabular-nums text-[#81909e]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="rounded-md bg-[#e8eef2] px-2 py-0.5 text-[0.53125rem] font-extrabold uppercase tracking-[0.06em] text-[#526b7f]">
                  {claim.kind === "FACTUAL" ? labels.fact : labels.opinion}
                </span>
                <span
                  className={`rounded-md px-2 py-0.5 text-[0.53125rem] font-extrabold ${assessmentTone[claim.assessment]}`}
                >
                  {labels.assessments[claim.assessment]}
                </span>
              </div>

              {claim.id === highlightedClaimId ? (
                <blockquote className="mt-2 border-l-2 border-[#7897ad] pl-2.5 text-sm leading-relaxed font-semibold whitespace-pre-wrap text-[#354f65] [overflow-wrap:anywhere]">
                  {claim.quote}
                </blockquote>
              ) : (
                <ClaimExplanation claim={claim} sources={sources} locale={locale} />
              )}

              {claim.needsExternalVerification ? (
                <a
                  href={buildVerificationUrl(claim.quote, labels.source)}
                  target="_blank"
                  rel="noreferrer"
                  className="focus-ring mt-2.5 inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-[#d7e0e5] bg-[#f7fafb] px-2.5 text-[0.59375rem] font-extrabold text-[#315d7b] transition-colors hover:bg-white"
                >
                  <Search size={12} strokeWidth={2} aria-hidden="true" />
                  {labels.verify}
                  <ExternalLink size={11} strokeWidth={2} aria-hidden="true" />
                </a>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}
