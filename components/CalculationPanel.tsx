import { Calculator } from "lucide-react";
import type { AnalysisResponse } from "@/lib/api";
import { verdictCopy } from "@/lib/verdict-copy";
import { useLanguage } from "./LanguageProvider";

/** Mathematical equality is checked by a bounded exact parser, not a text model. */
export function CalculationPanel({ result }: { result: AnalysisResponse }) {
  const { locale, copy } = useLanguage();
  const calculation = result.calculation;
  if (!calculation) return null;

  const text = verdictCopy[locale];
  const reason = locale === "ru"
    ? calculation.correct
      ? `Обе части равны ${calculation.leftValue}. Равенство верно.`
      : `Левая часть равна ${calculation.leftValue}, а правая — ${calculation.rightValue}. Они не равны.`
    : locale === "uz"
      ? calculation.correct
        ? `Ikkala tomon ham ${calculation.leftValue} ga teng. Tenglik to‘g‘ri.`
        : `Chap tomon ${calculation.leftValue}, o‘ng tomon esa ${calculation.rightValue} ga teng. Ular teng emas.`
      : calculation.correct
        ? `Both sides evaluate to ${calculation.leftValue}. The equation is correct.`
        : `The left side evaluates to ${calculation.leftValue}; the right side evaluates to ${calculation.rightValue}. They are not equal.`;

  return (
    <section
      id="result-explanation"
      aria-labelledby="calculation-title"
      data-testid="calculation-panel"
      className="mt-3 min-w-0 rounded-xl border border-[#d8dfe4] bg-white/45 p-3 sm:p-4"
    >
      <div className="flex items-center gap-2">
        <Calculator size={18} className="shrink-0 text-[#285b87]" aria-hidden="true" />
        <h3 id="calculation-title" className="text-[0.8125rem] font-extrabold text-[#173451] sm:text-[0.9375rem]">
          {copy.result.why}
        </h3>
      </div>
      <dl className="mt-3 min-w-0">
        <dt className="text-xs font-bold text-[#4d6176]">{text.originalEquation}</dt>
        <dd data-testid="calculation-original" className="mt-1 break-all rounded-lg bg-[#eef3f8] px-3 py-2 font-mono text-sm text-[#173451]">
          {calculation.expression}
        </dd>
      </dl>
      <p data-testid="calculation-reason" className="mt-3 break-words text-[0.8125rem] leading-relaxed text-[#506174]">
        {reason}
      </p>
      {calculation.correction ? (
        <dl className="mt-3 min-w-0 rounded-lg border border-[#d6e7d8] bg-[#eef7ef] px-3 py-2.5">
          <dt className="text-xs font-bold text-[#2f7447]">{text.correctEquation}</dt>
          <dd data-testid="calculation-correction" className="mt-1 break-all font-mono text-sm font-bold text-[#2f7447]">
            {calculation.correction}
          </dd>
        </dl>
      ) : null}
    </section>
  );
}
