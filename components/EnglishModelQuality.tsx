"use client";

import { ENGLISH_MODEL_QUALITY as quality } from "@/lib/model-quality";
import { useLanguage } from "./LanguageProvider";

const translations = {
  en: {
    title: "English ML model · research baseline", trained: "training claims", test: "held-out test claims",
    protocol: "Word + character TF-IDF and logistic regression. Only claim text is used; speaker and fact-checker metadata are excluded. Model selection and calibration use separate halves of validation, never the test set.",
    note: "LIAR covers mostly US political claims from 2007–2016. Half-true examples are excluded. This is a wording-based statistical signal, not a fact-check. Source review takes precedence when available. Uzbek has no trained statistical model yet.",
    license: "LIAR is research-use-only; the original sources retain copyright. This model is a research demo, not commercially cleared.",
    baseline: "Majority-class baseline", interval: "95% accuracy interval",
  },
  ru: {
    title: "Английская ML-модель · исследовательская версия", trained: "утверждений для обучения", test: "утверждений в отложенном тесте",
    protocol: "TF-IDF слов и символов + логистическая регрессия. Используется только текст, без автора и метаданных фактчекера. Подбор модели и калибровка используют разные половины валидации, но не тест.",
    note: "LIAR — в основном политические утверждения США за 2007–2016 годы. Примеры «наполовину правда» исключены. Это статистический сигнал, не проверка фактов. Вывод по источникам имеет приоритет. Обученной узбекской модели пока нет.",
    license: "LIAR разрешён только для исследований; права остаются у первоисточников. Эта модель — исследовательское демо, а не коммерчески лицензированная система.",
    baseline: "Базовая модель: всегда частый класс", interval: "95% интервал accuracy",
  },
  uz: {
    title: "Inglizcha ML modeli · tadqiqot versiyasi", trained: "o‘qitish da’volari", test: "alohida test da’volari",
    protocol: "So‘z va belgilar TF-IDF + logistik regressiya. Faqat matn ishlatiladi, muallif va faktcheker metama’lumotlari emas. Model tanlash va kalibrlash validatsiyaning alohida qismlarida bajariladi, testda emas.",
    note: "LIAR asosan AQShning 2007–2016 yillardagi siyosiy da’volarini qamrab oladi. «Yarim rost» misollar chiqarilgan. Bu statistik signal, fakt tekshiruvi emas. Manbalar xulosasi ustun turadi. O‘zbekcha statistik model hali o‘qitilmagan.",
    license: "LIAR faqat tadqiqot uchun ruxsat etilgan; huquqlar asl manbalarda qoladi. Bu tadqiqot demosidir, tijoriy litsenziyalangan tizim emas.",
    baseline: "Eng ko‘p uchraydigan sinf bazasi", interval: "95% accuracy oralig‘i",
  },
};

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
// Node and Chromium can ship different Uzbek ICU data. Keep SSR/hydration text identical.
const count = (value: number, locale: string) =>
  String(value).replace(/\B(?=(\d{3})+(?!\d))/gu, locale === "en" ? "," : "\u00a0");

export function EnglishModelQuality() {
  const { locale } = useLanguage();
  const copy = translations[locale];
  return (
    <section className="tool-gutter pb-7" aria-labelledby="english-quality-heading">
      <article className="rounded-[22px] border border-[#d3d9d8] bg-[#fbfaf6]/90 p-5 sm:p-8">
        <p className="break-all text-xs font-semibold text-[#607087]">{quality.modelVersion}</p>
        <h2 id="english-quality-heading" className="mt-2 font-serif text-2xl font-semibold text-ink">{copy.title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-[#607087]">{quality.datasetName} · {count(quality.trainingSamples, locale)} {copy.trained} · {count(quality.testSamples, locale)} {copy.test}</p>
        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([['Accuracy', quality.metrics.accuracy], ['Macro F1', quality.metrics.macroF1],
            ['Precision · FAKE', quality.metrics.precisionFake], ['Recall · FAKE', quality.metrics.recallFake]] as const).map(([label, value]) => (
            <div key={label} className="rounded-xl border border-[#d5dde3] bg-[#f1f5f7] p-3">
              <dt className="text-xs text-[#607087]">{label}</dt><dd className="mt-1 text-xl font-bold text-ink">{percent(value)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-[#607087]">{copy.interval}: {quality.accuracyInterval.map(percent).join('–')} · {copy.baseline}: {percent(quality.majorityAccuracy)}</p>
        <p className="mt-4 text-sm leading-relaxed text-[#607087]">{copy.protocol}</p>
        <p className="mt-3 text-sm leading-relaxed text-[#607087]">{copy.note}</p>
        <p className="mt-4 rounded-xl border border-[#ebd6bd] bg-[#fff8ec] p-3 text-xs leading-relaxed text-[#76502d]">{copy.license} <a className="focus-ring underline" href="https://aclanthology.org/P17-2067/" target="_blank" rel="noopener noreferrer">LIAR · Wang (ACL 2017)</a></p>
      </article>
    </section>
  );
}
