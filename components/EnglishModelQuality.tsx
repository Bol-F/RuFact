"use client";

import { ENGLISH_MODEL_QUALITY as quality } from "@/lib/model-quality";
import { useLanguage } from "./LanguageProvider";

const translations = {
  en: {
    title: "English ML model · research baseline", trained: "training claims", test: "held-out test claims",
    protocol: "Word + character TF-IDF and logistic regression use only claim text, without speaker or fact-checker metadata. Sigmoid calibration uses training-only 5-fold out-of-fold predictions; all 1,036 validation claims select model strength. Test labels do not train, calibrate or select the model.",
    note: "LIAR mainly covers US political claims from 2007–2016, not current English or UK news. Half-true examples are excluded. This previously evaluated test benchmark is not a new blind evaluation. The model is a wording-based signal, not a fact-check; source review takes precedence.",
    license: "LIAR is research-use-only; the original sources retain copyright. This model is a research demo, not commercially cleared.",
    baseline: "Majority-class baseline", interval: "95% accuracy interval",
  },
  ru: {
    title: "Английская ML-модель · исследовательская версия", trained: "утверждений для обучения", test: "утверждений в отложенном тесте",
    protocol: "TF-IDF слов и символов + логистическая регрессия используют только текст, без автора и метаданных фактчекера. Сигмоидная калибровка обучена на 5-кратных OOF-предсказаниях только обучающей выборки; все 1 036 валидационных утверждений используются для выбора модели. Тест не участвует в обучении, калибровке или выборе.",
    note: "LIAR — в основном политические утверждения США за 2007–2016 годы, а не современные английские или британские новости. Примеры «наполовину правда» исключены. Этот тестовый benchmark уже использовался ранее: это не новый слепой тест. Модель даёт языковой сигнал, не проверку фактов; вывод по источникам имеет приоритет.",
    license: "LIAR разрешён только для исследований; права остаются у первоисточников. Эта модель — исследовательское демо, а не коммерчески лицензированная система.",
    baseline: "Базовая модель: всегда частый класс", interval: "95% интервал accuracy",
  },
  uz: {
    title: "Inglizcha ML modeli · tadqiqot versiyasi", trained: "o‘qitish da’volari", test: "alohida test da’volari",
    protocol: "So‘z va belgilar TF-IDF + logistik regressiya faqat matndan foydalanadi, muallif va faktcheker metama’lumotlaridan emas. Sigmoid kalibrlash faqat o‘qitish to‘plamining 5-fold OOF bashoratlariga tayanadi; barcha 1 036 validatsiya da’vosi modelni tanlaydi. Test o‘qitish, kalibrlash yoki tanlashda ishlatilmaydi.",
    note: "LIAR asosan AQShning 2007–2016 yillardagi siyosiy da’volari bo‘lib, hozirgi inglizcha yoki Britaniya yangiliklari emas. «Yarim rost» misollar chiqarilgan. Bu test benchmark avval ham baholangan: yangi ko‘r-ko‘rona test emas. Model tilga asoslangan signal beradi, fakt tekshiruvi emas; manbalar xulosasi ustun turadi.",
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
    <section className="tool-gutter pb-7" aria-labelledby="english-quality-heading" data-testid="en-model-quality">
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
        <p className="mt-4 text-sm leading-relaxed text-[#607087]" data-testid="en-evaluation-protocol">{copy.protocol}</p>
        <p className="mt-3 text-sm leading-relaxed text-[#607087]">{copy.note}</p>
        <p className="mt-4 rounded-xl border border-[#ebd6bd] bg-[#fff8ec] p-3 text-xs leading-relaxed text-[#76502d]">{copy.license} <a className="focus-ring underline" href="https://aclanthology.org/P17-2067/" target="_blank" rel="noopener noreferrer">LIAR · Wang (ACL 2017)</a></p>
      </article>
    </section>
  );
}
