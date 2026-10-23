"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EnglishModelQuality } from "./EnglishModelQuality";
import { ModelEvaluationDetails } from "./ModelEvaluationDetails";
import { ModelSystemOverview } from "./ModelSystemOverview";
import { ModelTransparency } from "./ModelTransparency";
import { useLanguage } from "./LanguageProvider";

const translations = {
  uz: {
    back: "Matn tekshiruviga qaytish",
    title: "RuFact tekshiruv tizimi haqida",
    intro: "RuFact da’volarni internet manbalari bilan solishtiradi va aniqlangan ziddiyatlarni tushuntiradi. Rus va ingliz tillarida alohida statistik modellar qo‘shimcha signal beradi; o‘zbekcha matn bevosita Tavily va Gemini orqali tekshiriladi.",
  },
  ru: {
    back: "К проверке текста",
    title: "О системе проверки RuFact",
    intro: "RuFact сопоставляет утверждения с интернет-источниками и объясняет найденные противоречия. Отдельные русская и английская статистические модели дают дополнительный сигнал; узбекский текст проверяется напрямую через Tavily и Gemini.",
  },
  en: {
    back: "Back to text checking",
    title: "About the RuFact verification system",
    intro: "RuFact compares claims with internet sources and explains detected contradictions. Separate Russian and English statistical models provide an additional signal; Uzbek text is checked directly through Tavily and Gemini.",
  },
} as const;

export function ModelPageContent() {
  const { locale } = useLanguage();
  const copy = translations[locale];

  return (
    <>
      <section aria-labelledby="model-page-heading" className="regional-model-intro content-gutter pb-4 pt-4 sm:pb-5 sm:pt-7" data-testid="model-page-intro">
        <Link href="/#analyzer" className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#d7d8d3] bg-[#fbfaf6]/80 px-3.5 text-[0.75rem] font-bold text-[#486177] transition-colors hover:bg-white hover:text-ink">
          <ArrowLeft size={15} strokeWidth={2} aria-hidden="true" />
          {copy.back}
        </Link>
        <div className="regional-model-lead mt-5 max-w-[900px] sm:mt-7">
          <h1 id="model-page-heading" className="font-serif text-[2.375rem] leading-[1.02] font-semibold tracking-[-0.045em] text-ink sm:text-[3.125rem]">{copy.title}</h1>
          <p className="mt-3 max-w-[780px] text-[0.875rem] leading-[1.65] text-[#607087] sm:text-[1rem]">{copy.intro}</p>
        </div>
      </section>
      <ModelSystemOverview />
      <ModelTransparency />
      <EnglishModelQuality />
      <ModelEvaluationDetails />
    </>
  );
}
