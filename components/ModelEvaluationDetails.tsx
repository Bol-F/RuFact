"use client";

import { ChevronDown, Database, GitCompareArrows, TriangleAlert } from "lucide-react";
import { MODEL_QUALITY as quality } from "@/lib/model-quality";
import { useLanguage } from "./LanguageProvider";

const translations = {
  uz: {
    title: "Ruscha baholash tafsilotlari va cheklovlar", subtitle: "Xatolar matritsasi · protokol · ma’lumot huquqlari",
    matrix: "Xatolar matritsasi", caption: "Ruscha tashqi OOF baholashdagi REAL va FAKE xatolari", actual: "Haqiqiy sinf", real: "REAL javobi", fake: "FAKE javobi",
    protocol: "So‘z va belgi TF-IDF + logistik regressiya, sigmoid kalibrlash. Tashqi 5-fold OOF baholashning har bir ajratilgan qismi kalibrlashni tanlashdan chetda qoladi. Juft va dublikatga bog‘langan guruhlar ichki baholashda birga saqlanadi.",
    missed: "FAKE matnlardan REAL deb o‘tkazib yuborilgan", flagged: "REAL matnlardan FAKE deb noto‘g‘ri belgilangan",
    limitationsTitle: "Nega ehtiyotkorlik kerak",
    limitations: [
      "Asosiy FAKE misollar sintetik; qo‘shimcha Panorama satirasi va Lenta yangiliklari uslub yoki manbani o‘rgatishi mumkin. Ichki 99,75% accuracy shu sababli asosiy sifat mezoni emas.",
      "157 ta tashqi matn Qozog‘iston yangiliklariga oid; manba va sinf bir-biriga bog‘langan. Benchmark tarixiy taqqoslash va kalibrlash uchun ishlatilgan, yangi mustaqil release testi emas.",
      "Oddiy uslubdagi yolg‘on, yangi mavzu yoki parafraz modelni chalg‘itishi mumkin. Tilni aniqlash ham taxminiy: juda qisqa yoki aralash matn noto‘g‘ri yo‘naltirilishi mumkin.",
    ],
    rights: "KazFakeCorpus: CC BY 4.0. Taiga qo‘shimcha ma’lumotlari: shaxsiy/tadqiqot maqsadlari uchun. Tijoriy qo‘llashdan oldin ma’lumot huquqlarini alohida tekshiring.",
    source: "Korpus manbasi",
  },
  ru: {
    title: "Подробности русской оценки и ограничения", subtitle: "Матрица ошибок · протокол · права на данные",
    matrix: "Матрица ошибок", caption: "Ошибки REAL и FAKE во внешней русской OOF-оценке", actual: "Истинный класс", real: "Ответ REAL", fake: "Ответ FAKE",
    protocol: "TF-IDF слов и символов + логистическая регрессия, сигмоидная калибровка. Во внешней 5-кратной OOF-оценке каждый отложенный блок исключён из выбора его калибровки. Парные и связанные дубликатами группы сохраняются вместе во внутренней оценке.",
    missed: "FAKE-текстов пропущено как REAL", flagged: "REAL-текстов ошибочно отмечено как FAKE",
    limitationsTitle: "Почему нужна осторожность",
    limitations: [
      "Основные FAKE-примеры синтетические; дополнительные сатира Panorama и новости Lenta могут обучать признакам стиля и источника. Поэтому внутренняя accuracy 99,75% не является главным показателем качества.",
      "157 внешних текстов относятся к казахстанским новостям; источник связан с классом. Benchmark использовался для исторических сравнений и калибровки, а не как новый независимый release-тест.",
      "Нейтрально написанная ложь, новые темы и перефразирование могут обмануть модель. Определение языка тоже эвристическое: очень короткий или смешанный текст может попасть не в тот маршрут.",
    ],
    rights: "KazFakeCorpus: CC BY 4.0. Дополнительные данные Taiga — для личного/исследовательского использования. Перед коммерческим применением отдельно проверьте права на данные.",
    source: "Источник корпуса",
  },
  en: {
    title: "Russian evaluation details and limitations", subtitle: "Confusion matrix · protocol · data rights",
    matrix: "Confusion matrix", caption: "REAL and FAKE errors in the external Russian OOF evaluation", actual: "Actual class", real: "Predicted REAL", fake: "Predicted FAKE",
    protocol: "Word + character TF-IDF, logistic regression and sigmoid calibration. In the external 5-fold OOF evaluation, each held-out fold is excluded when selecting its calibration. Paired and duplicate-connected groups stay together during internal evaluation.",
    missed: "FAKE texts missed as REAL", flagged: "REAL texts incorrectly flagged as FAKE",
    limitationsTitle: "Why caution matters",
    limitations: [
      "Core FAKE examples are synthetic; auxiliary Panorama satire and Lenta reporting can teach style and source cues. Inflated internal accuracy of 99.75% is therefore not the headline quality measure.",
      "The 157 external texts concern Kazakhstan news; their labels are confounded with source. This benchmark has been used for historical comparisons and calibration, not as a fresh independent release test.",
      "Neutral-sounding falsehoods, new topics and paraphrases can fool the model. Language detection is also heuristic: very short or mixed text can be routed incorrectly.",
    ],
    rights: "KazFakeCorpus: CC BY 4.0. Auxiliary Taiga data: personal/research use. Review data permissions separately before commercial use.",
    source: "Corpus source",
  },
} as const;

export function ModelEvaluationDetails() {
  const { locale } = useLanguage();
  const copy = translations[locale];
  const [[trueReal, falseFake], [falseReal, trueFake]] = quality.confusionMatrix;
  const totalReal = trueReal + falseFake;
  const totalFake = falseReal + trueFake;

  return (
    <section className="tool-gutter pb-9" aria-labelledby="evaluation-details-title" data-testid="ru-evaluation-details">
      <details className="group overflow-hidden rounded-[22px] border border-[#d7d8d2] bg-[#faf8f3]/90">
        <summary className="focus-ring flex min-h-[72px] cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 sm:px-8 [&::-webkit-details-marker]:hidden">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[#e3ebef] text-[#315d78]"><GitCompareArrows size={20} aria-hidden="true" /></span>
            <div>
              <h2 id="evaluation-details-title" className="text-[0.9375rem] font-extrabold leading-[1.4] text-ink sm:text-[1.0625rem]">{copy.title}</h2>
              <p className="mt-1 text-xs leading-relaxed text-[#74828d]">{copy.subtitle}</p>
            </div>
          </div>
          <ChevronDown size={20} className="shrink-0 text-[#647487] transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="grid border-t border-[#d7d8d2] lg:grid-cols-[0.9fr_1.1fr]">
          <div className="border-b border-[#d7d8d2] px-5 py-6 sm:px-8 lg:border-b-0 lg:border-r">
            <h3 className="text-sm font-extrabold text-ink">{copy.matrix}</h3>
            <p className="mt-3 text-[0.75rem] leading-[1.65] text-[#657486]">{copy.protocol}</p>
            <div className="mt-4 overflow-hidden rounded-[14px] border border-[#d7dcdd] bg-white/65">
              <table className="w-full border-collapse text-center text-[0.6875rem]">
                <caption className="sr-only">{copy.caption}</caption>
                <thead>
                  <tr className="text-[#6f7d88]">
                    <th scope="col" className="p-2 text-left font-semibold">{copy.actual}</th>
                    <th scope="col" className="p-2 font-semibold">{copy.real}</th>
                    <th scope="col" className="p-2 font-semibold">{copy.fake}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-[#e2e3df]">
                    <th scope="row" className="p-2 text-left font-extrabold text-[#315f45]">REAL</th>
                    <td className="bg-[#e5f0e6] p-3 text-base font-extrabold text-[#326c47]">{trueReal}</td>
                    <td className="bg-[#fae8e2] p-3 text-base font-extrabold text-[#a84e39]">{falseFake}</td>
                  </tr>
                  <tr className="border-t border-[#e2e3df]">
                    <th scope="row" className="p-2 text-left font-extrabold text-[#a14346]">FAKE</th>
                    <td className="bg-[#fae8e2] p-3 text-base font-extrabold text-[#a84e39]">{falseReal}</td>
                    <td className="bg-[#e5f0e6] p-3 text-base font-extrabold text-[#326c47]">{trueFake}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ul className="mt-3 grid gap-1 text-[0.6875rem] leading-[1.6] text-[#75828e]">
              <li>{falseReal}/{totalFake} — {copy.missed}</li>
              <li>{falseFake}/{totalReal} — {copy.flagged}</li>
            </ul>
          </div>
          <div className="px-5 py-6 sm:px-8" data-testid="model-limitations">
            <h3 className="flex items-center gap-2 text-sm font-extrabold text-[#87463d]"><TriangleAlert size={18} className="shrink-0" aria-hidden="true" />{copy.limitationsTitle}</h3>
            <ul className="mt-3 grid gap-3">
              {copy.limitations.map(item => (
                <li key={item} className="flex gap-2 text-[0.75rem] leading-[1.65] text-[#74635f]">
                  <span className="mt-[0.5rem] h-1.5 w-1.5 shrink-0 rounded-full bg-[#c96a4d]" aria-hidden="true" />{item}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex gap-3 rounded-xl border border-[#ebd6bd] bg-[#fff8ec] p-4">
              <Database size={18} className="mt-0.5 shrink-0 text-[#8a5b42]" aria-hidden="true" />
              <p className="text-[0.75rem] leading-[1.65] text-[#76502d]">{copy.rights} <a className="focus-ring rounded underline underline-offset-2" href="https://github.com/Anargul-Aimuratovna/news-veracity-corpus" target="_blank" rel="noopener noreferrer">{copy.source}</a></p>
            </div>
          </div>
        </div>
      </details>
    </section>
  );
}
