"use client";

import Link from "next/link";
import { ArrowLeft, Bot, Database, SearchCheck, ShieldAlert } from "lucide-react";

import { MODEL_QUALITY } from "@/lib/model-quality";
import { InfoCards } from "./InfoCards";
import { ModelEvaluationDetails } from "./ModelEvaluationDetails";
import { ModelSystemOverview } from "./ModelSystemOverview";
import { ModelTransparency } from "./ModelTransparency";
import { useLanguage } from "./LanguageProvider";

const multilingualCopy = {
  uz: {
    back: "Matn tekshiruviga qaytish",
    title: "RuFact tekshiruv tizimi haqida",
    intro: "RuFact uch bosqichni birlashtiradi: rus tili uchun statistik ML tahlili, Tavily orqali internet manbalarini qidirish va Gemini orqali da’volarni manbalar bilan solishtirish.",
    architecture: "Tizim qanday ishlaydi",
    stages: [
      { title: "Ruscha ML modeli", description: "So‘z va belgilar TF-IDF modeli faqat ruscha korpusda o‘qitilgan. U uslubiy belgilarni baholaydi, faktlarni tekshirmaydi.", detail: `${MODEL_QUALITY.dataset.samples} ta ruscha tashqi baholash matni` },
      { title: "Tavily qidiruvi", description: "O‘zbek (lotin va kirill), rus yoki ingliz tilidagi so‘rov bo‘yicha dolzarb HTTPS manbalarini topadi.", detail: "Har tekshiruvda 6 tagacha manba" },
      { title: "Gemini tahlili", description: "Matndagi da’volarni ajratadi va faqat Tavily topgan parchalar bilan solishtiradi. Javob tanlangan tilda qaytariladi.", detail: "Tasdiqlangan · rad etilgan · noaniq" },
    ],
    accuracyTitle: "Aniqlik haqida muhim eslatma",
    accuracy: `Ruscha ML modelining tashqi accuracy ko‘rsatkichi ${Math.round((MODEL_QUALITY.metrics.find((item) => item.key === "accuracy")?.value ?? 0) * 100)}%. Bu raqam o‘zbek yoki ingliz matnlariga tegishli emas. Ushbu tillarda internet manbalari tekshiruvi asosiy signal hisoblanadi.`,
    limitationsTitle: "Cheklovlar",
    limitations: ["Internetda manba topilmasligi da’vo yolg‘onligini isbotlamaydi.", "Gemini xato qilishi yoki manbadagi kontekstni noto‘g‘ri talqin qilishi mumkin.", "Muhim qarorlar uchun asl hujjat va bir nechta mustaqil manbani ochib tekshiring."],
  },
  en: {
    back: "Back to text checking",
    title: "About the RuFact verification system",
    intro: "RuFact combines three stages: statistical ML analysis for Russian, internet source search through Tavily, and claim-to-source comparison through Gemini.",
    architecture: "How the system works",
    stages: [
      { title: "Russian ML model", description: "The word-and-character TF-IDF model was trained only on a Russian corpus. It scores writing patterns; it does not verify facts.", detail: `${MODEL_QUALITY.dataset.samples} Russian external evaluation texts` },
      { title: "Tavily search", description: "Finds current HTTPS sources for Uzbek (Latin and Cyrillic), Russian, or English queries.", detail: "Up to 6 sources per check" },
      { title: "Gemini analysis", description: "Extracts claims and compares them only with passages retrieved by Tavily. The response follows the selected language.", detail: "Supported · contradicted · unsure" },
    ],
    accuracyTitle: "An important note about accuracy",
    accuracy: `The external accuracy of the Russian ML model is ${Math.round((MODEL_QUALITY.metrics.find((item) => item.key === "accuracy")?.value ?? 0) * 100)}%. This number does not apply to Uzbek or English text. Source verification is the primary signal for those languages.`,
    limitationsTitle: "Limitations",
    limitations: ["A missing internet source does not prove that a claim is false.", "Gemini can make mistakes or misread a source’s context.", "For important decisions, open the original document and multiple independent sources."],
  },
} as const;

export function ModelPageContent() {
  const { locale } = useLanguage();

  if (locale === "ru") {
    return (
      <>
        <section aria-labelledby="model-page-heading" className="content-gutter pb-2 pt-4 sm:pb-3 sm:pt-7">
          <Link href="/#analyzer" className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#d7d8d3] bg-[#fbfaf6]/80 px-3.5 text-[0.75rem] font-bold text-[#486177] transition-colors hover:bg-white hover:text-ink">
            <ArrowLeft size={15} strokeWidth={2} aria-hidden="true" />
            К проверке текста
          </Link>
          <div className="mt-5 max-w-[760px] sm:mt-7">
            <h1 id="model-page-heading" className="font-serif text-[2.375rem] leading-[1.02] font-semibold tracking-[-0.045em] text-ink sm:text-[3.125rem]">О системе проверки RuFact</h1>
            <p className="mt-3 text-[0.875rem] leading-[1.65] text-[#607087] sm:max-w-[700px] sm:text-[1rem]">RuFact сочетает языковой ML-анализ, поиск интернет-источников Tavily и сопоставление утверждений через Gemini. Ни один этап сам по себе не считается окончательным вердиктом.</p>
          </div>
        </section>
        <InfoCards />
        <ModelSystemOverview />
        <ModelTransparency />
        <ModelEvaluationDetails />
      </>
    );
  }

  const copy = multilingualCopy[locale];
  const icons = [Bot, SearchCheck, Database] as const;

  return (
    <>
      <section aria-labelledby="model-page-heading" className="regional-model-intro content-gutter pb-5 pt-4 sm:pb-8 sm:pt-7">
        <Link href="/#analyzer" className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#d7d8d3] bg-[#fbfaf6]/80 px-3.5 text-[0.75rem] font-bold text-[#486177] transition-colors hover:bg-white hover:text-ink">
          <ArrowLeft size={15} strokeWidth={2} aria-hidden="true" />
          {copy.back}
        </Link>
        <div className="regional-model-lead mt-5 max-w-[780px] sm:mt-7">
          <h1 id="model-page-heading" className="font-serif text-[2.25rem] leading-[1.03] font-semibold tracking-[-0.045em] text-ink sm:text-[3.125rem]">{copy.title}</h1>
          <p className="mt-3 text-[0.875rem] leading-[1.65] text-[#607087] sm:text-[1rem]">{copy.intro}</p>
        </div>
      </section>

      <section className="regional-model-architecture tool-gutter pb-6" aria-labelledby="architecture-heading">
        <h2 id="architecture-heading" className="font-serif text-[1.75rem] font-semibold text-ink sm:text-[2.25rem]">{copy.architecture}</h2>
        <div className="regional-model-stages mt-4 grid gap-3 lg:grid-cols-3">
          {copy.stages.map((stage, index) => {
            const Icon = icons[index];
            return (
              <article key={stage.title} className="regional-model-stage rounded-[18px] border border-[#d9ddd9] bg-white/55 p-5 shadow-[0_10px_28px_rgba(21,45,63,0.05)]">
                <div className="regional-model-stage-marker flex items-center justify-between gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e5eef2] text-[#315f78]"><Icon size={20} aria-hidden="true" /></span>
                  <span className="regional-model-stage-number text-sm font-bold tabular-nums text-[#778694]" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                </div>
                <div className="regional-model-stage-copy min-w-0">
                  <h3 className="mt-4 text-[1rem] font-extrabold text-[#173552]">{stage.title}</h3>
                  <p className="mt-2 text-[0.75rem] leading-[1.6] text-[#647589]">{stage.description}</p>
                  <p className="regional-model-stage-detail mt-4 border-t border-[#e1e3df] pt-3 text-[0.625rem] font-bold text-[#778694]">{stage.detail}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="regional-model-notes tool-gutter grid gap-4 pb-8 lg:grid-cols-2">
        <article className="rounded-[18px] border border-[#ebd6bd] bg-[#fff8ec] p-5 sm:p-6">
          <h2 className="text-[1.0625rem] font-extrabold text-[#76502d]">{copy.accuracyTitle}</h2>
          <p className="mt-2 text-[0.75rem] leading-[1.65] text-[#785f49]">{copy.accuracy}</p>
        </article>
        <article className="rounded-[18px] border border-[#d5dde3] bg-[#f1f5f7] p-5 sm:p-6">
          <div className="flex items-center gap-2 text-[#315f78]"><ShieldAlert size={19} aria-hidden="true" /><h2 className="text-[1.0625rem] font-extrabold">{copy.limitationsTitle}</h2></div>
          <ul className="mt-3 grid gap-2 text-[0.75rem] leading-[1.55] text-[#607284]">
            {copy.limitations.map((item) => <li key={item} className="flex gap-2"><span aria-hidden="true">•</span><span>{item}</span></li>)}
          </ul>
        </article>
      </section>
    </>
  );
}
