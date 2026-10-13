import type { AnalysisResponse } from "@/lib/api";
import type { AppLocale } from "@/lib/i18n";
import { getPublicVerdict } from "./api.ts";
import { verdictCopy } from "./verdict-copy.ts";
import { claimCopy } from "./claim-copy.ts";
import { deriveClaimLabel, resolveClaimEvidence, safeSourceHref } from "./claim-evidence.ts";
import { arithmeticCopy, arithmeticExplanation, evaluateArithmeticClaim } from "./arithmetic.ts";

interface AnalysisReportInput {
  result: AnalysisResponse;
  analyzedText: string;
  timestamp: string;
  locale?: AppLocale;
}

function formatPercent(value: number) {
  return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
}

export function buildAnalysisReport({
  result,
  analyzedText,
  timestamp,
  locale = "ru",
}: AnalysisReportInput) {
  const calculation = result.meta?.engine === "calculation"
    ? evaluateArithmeticClaim(analyzedText) : null;
  if (result.meta?.engine === "calculation" && !calculation) {
    throw new Error("Cannot export an unsupported arithmetic claim.");
  }
  if (calculation) {
    const detail = arithmeticCopy[locale];
    const reportCopy = {
      en: { report: "RUFACT REPORT", date: "Analysis date", result: "Result" },
      ru: { report: "ОТЧЁТ RUFACT", date: "Дата анализа", result: "Результат" },
      uz: { report: "RUFACT HISOBOTI", date: "Tahlil sanasi", result: "Natija" },
    }[locale];
    return [
      reportCopy.report,
      `${reportCopy.date}: ${timestamp}`,
      detail.title,
      `${reportCopy.result}: ${calculation.correct ? detail.correct : detail.incorrect}`,
      "",
      `${detail.original}: ${calculation.expression}`,
      `${detail.why}: ${arithmeticExplanation(calculation, locale)}`,
      ...(calculation.correction ? [`${detail.correction}: ${calculation.correction}`] : []),
      "",
      detail.note,
      detail.scope,
      "",
    ].join("\n");
  }
  const copy = locale === "uz"
    ? { report: "RUFACT HISOBOTI", date: "Tahlil sanasi", result: "Natija", confidence: "Ushbu javobga model ishonchi", interpretation: "Talqin", fake: "Ishonchsiz axborot belgilari aniqlandi", real: "Yaqqol ishonchsizlik belgilari aniqlanmadi", text: "TAHLIL QILINGAN MATN", why: "NEGA", signals: "STATISTIK BELGILAR", review: "GEMINI MANBA TEKSHIRUVI", claims: "AJRATILGAN DA’VOLAR", sources: "TAVILY MANBALARI", queries: "Qidiruv so‘rovlari", important: "MUHIM", warning: "RuFact ehtimoliy baho beradi, yakuniy faktik hukm emas. Asosiy da’volarni mustaqil birlamchi manbalarda tekshiring.", checked: "Tavily internet qidiruvini bajardi, Gemini esa matnni natijalar bilan solishtirdi; xulosa sifati topilgan manbalar va ularning kontekstiga bog‘liq.", unchecked: "Tashqi manbalar avtomatik tekshirilmadi." }
    : locale === "en"
      ? { report: "RUFACT REPORT", date: "Analysis date", result: "Result", confidence: "Model confidence in this answer", interpretation: "Interpretation", fake: "Signs of unreliable information were detected", real: "No strong signs of unreliability were detected", text: "ANALYZED TEXT", why: "WHY", signals: "STATISTICAL SIGNALS", review: "GEMINI SOURCE REVIEW", claims: "IDENTIFIED CLAIMS", sources: "TAVILY SOURCES", queries: "Search queries", important: "IMPORTANT", warning: "RuFact provides a probabilistic assessment, not a final factual verdict. Verify key claims using independent primary sources.", checked: "Tavily searched the web and Gemini compared the text with the results; the conclusion depends on the sources found and their context.", unchecked: "External sources were not checked automatically." }
      : { report: "ОТЧЁТ RUFACT", date: "Дата анализа", result: "Результат", confidence: "Уверенность модели в этом ответе", interpretation: "Интерпретация", fake: "Обнаружены признаки недостоверной информации", real: "Выраженные признаки недостоверности не обнаружены", text: "АНАЛИЗИРУЕМЫЙ ТЕКСТ", why: "ПОЧЕМУ ТАК", signals: "СТАТИСТИЧЕСКИЕ ПРИЗНАКИ", review: "ВТОРОЕ МНЕНИЕ GEMINI", claims: "ВЫДЕЛЕННЫЕ УТВЕРЖДЕНИЯ", sources: "ИСТОЧНИКИ ИЗ TAVILY", queries: "Поисковые запросы", important: "ВАЖНО", warning: "RuFact показывает вероятностную оценку, а не окончательный фактологический вердикт. Проверяйте ключевые утверждения по независимым первоисточникам.", checked: "Tavily выполнил интернет-поиск, а Gemini сопоставил текст с результатами; качество вывода зависит от найденных источников и их контекста.", unchecked: "Внешние источники автоматически не проверялись." };
  const verdict = getPublicVerdict(result);
  const verdictText = verdictCopy[locale];
  const resultLabel = verdict.basis === "statistical"
    ? verdict.label === "FAKE" ? verdictText.highRisk : verdictText.lowRisk
    : verdict.label === "UNSURE" ? verdictText.unsure : verdict.label;
  const interpretation = verdict.basis === "statistical" ? verdictText.statisticalNote
    : verdict.basis === "unavailable" ? verdictText.unavailable
      : verdict.label === "FAKE" ? verdictText.contradicted
        : verdict.label === "REAL" ? verdictText.supported : verdictText.insufficient;
  const lines = [
    copy.report,
    `${copy.date}: ${timestamp}`,
    `${copy.result}: ${resultLabel}`,
    ...(verdict.confidence === null ? [] : [`${copy.confidence}: ${formatPercent(verdict.confidence)}`]),
    `${copy.interpretation}: ${interpretation}`,
    "",
    copy.text,
    analyzedText,
  ];

  if (verdict.explanation) {
    lines.push("", copy.why, verdict.explanation);
  }
  if (verdict.basis === "sources" && result.meta?.engine === "external-model") {
    lines.push("", `${verdictText.statistical}: ${result.label} · ${formatPercent(result.confidence)}`,
      verdictText.statisticalNote);
  }

  if (result.signals?.length) {
    lines.push("", copy.signals);
    for (const signal of result.signals) {
      lines.push(`• ${signal.title}: ${signal.description}`);
    }
  }

  if (result.geminiReview?.status === "complete") {
    const review = result.geminiReview;
    const detailCopy = claimCopy[locale];
    lines.push(
      "",
      copy.review,
      `${copy.result}: ${review.promptVersion === "misinfo-tavily-v4" ? deriveClaimLabel(review.claims, review.coverage) : review.label}`,
      review.explanation,
      ...(review.coverage === "partial" ? [detailCopy.partialCoverage] : []),
      "",
      copy.claims,
    );

    const claims = [...review.claims].sort((left, right) => {
      const rank = (claim: typeof left) => claim.kind === "FACTUAL" && claim.assessment === "CONTRADICTED" ? 0
        : claim.assessment === "MIXED" ? 1 : claim.assessment === "UNVERIFIED" ? 2 : 3;
      return rank(left) - rank(right);
    });
    for (const [index, claim] of claims.entries()) {
      lines.push(
        `${index + 1}. [${claim.kind} / ${claim.assessment}]`,
        `   ${detailCopy.claim}: «${claim.quote}»`,
        `   ${detailCopy.why}: ${claim.explanation}`,
      );
      const evidence = resolveClaimEvidence(claim.evidence, review.sources);
      const correctionEvidence = claim.kind === "FACTUAL" && claim.assessment === "CONTRADICTED"
        ? resolveClaimEvidence(claim.correction?.evidence, review.sources) : [];
      for (const item of evidence) {
        lines.push(`   ${detailCopy.evidence}: «${item.quote}»`,
          `   ${detailCopy.source}: ${item.source.title}`, `   ${item.source.url}`);
      }
      if (claim.correction?.text && correctionEvidence.length) {
        lines.push(`   ${detailCopy.correction}: ${claim.correction.text}`);
        for (const item of correctionEvidence) {
          lines.push(`   ${detailCopy.correctionEvidence}: «${item.quote}»`,
            `   ${detailCopy.source}: ${item.source.title}`, `   ${item.source.url}`);
        }
      }
    }

    lines.push("", copy.sources);
    for (const [index, source] of review.sources.entries()) {
      const href = safeSourceHref(source);
      if (href) lines.push(`${index + 1}. ${source.title}`, `   ${href}`);
    }
    lines.push("", `${copy.queries}: ${review.searchQueries.join(" · ")}`);
  }

  lines.push(
    "",
    copy.important,
    copy.warning,
    result.geminiReview?.status === "complete"
      ? copy.checked
      : copy.unchecked,
  );

  return `${lines.join("\n")}\n`;
}
