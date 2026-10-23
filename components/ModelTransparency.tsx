"use client";

import { FlaskConical, Scale } from "lucide-react";
import { MODEL_QUALITY as quality } from "@/lib/model-quality";
import russianEvaluation from "@/ml/artifacts/metrics.json";
import { useLanguage } from "./LanguageProvider";

const translations = {
  uz: {
    eyebrow: "Ruscha statistik model", title: "Model ishonchi ≠ servis aniqligi",
    intro: "ML foizi — matn uslubiga ko‘ra tanlangan sinfga modelning ishonchi. Bu da’voning rostlik ehtimoli yoki butun RuFact tizimining aniqligi emas. Manbalar xulosasida raqamli foiz emas, sifatli ishonch darajasi ko‘rsatiladi.",
    dataset: "KazFakeCorpus ruscha qismi + Taiga yangiliklari", trained: "o‘qitish matni",
    evaluation: "157 matnda tashqi ichma-ich 5-fold OOF baholash", interval: "95% accuracy oralig‘i",
    metrics: ["To‘g‘ri tasniflangan matnlar ulushi", "REAL va FAKE sinflari bo‘yicha o‘rtacha F1", "FAKE deb belgilanganlarning qanchasi FAKE", "FAKE misollarning qanchasi topilgan"],
    caveat: "Kichik, Qozog‘iston mavzusidagi va manba bilan sinf bog‘langan ushbu benchmark ilgari ham ishlatilgan. Bu yangi ko‘r-ko‘rona test yoki boshqa matnlarga kafolat emas.",
    system: "Tavily + Gemini + ML tizimining umumiy fakt tekshirish aniqligi alohida mustaqil to‘plamda hali o‘lchanmagan. Quyidagi raqamlar faqat tegishli statistik model baholaridir.",
  },
  ru: {
    eyebrow: "Русская статистическая модель", title: "Уверенность модели ≠ точность сервиса",
    intro: "ML-процент — уверенность в выбранном классе по языковым признакам текста. Это не вероятность истинности факта и не точность всей системы RuFact. В выводе по источникам используется качественный уровень уверенности, а не числовой процент.",
    dataset: "Русская часть KazFakeCorpus + новости Taiga", trained: "текстов для обучения",
    evaluation: "157 текстов · внешняя вложенная 5-кратная OOF-оценка", interval: "95% интервал accuracy",
    metrics: ["Доля правильно классифицированных текстов", "Среднее F1 по классам REAL и FAKE", "Какая доля ответов FAKE действительно FAKE", "Какую долю примеров FAKE удалось найти"],
    caveat: "Этот небольшой benchmark по казахстанским текстам уже использовался ранее; источник связан с классом. Это не новый слепой тест и не гарантия качества на других текстах.",
    system: "Общая точность проверки фактов связкой Tavily + Gemini + ML пока не измерена на отдельном независимом наборе. Цифры ниже относятся только к соответствующим статистическим моделям.",
  },
  en: {
    eyebrow: "Russian statistical model", title: "Model confidence ≠ service accuracy",
    intro: "The ML percentage is confidence in a wording-based class prediction. It is not the probability that a claim is true or the accuracy of the whole RuFact system. Source conclusions use qualitative certainty, not a numerical percentage.",
    dataset: "KazFakeCorpus Russian subset + Taiga news", trained: "training texts",
    evaluation: "157 texts · external nested 5-fold OOF evaluation", interval: "95% accuracy interval",
    metrics: ["Share of texts classified correctly", "Mean F1 across REAL and FAKE", "Share of FAKE predictions labelled FAKE", "Share of labelled FAKE examples detected"],
    caveat: "This small Kazakhstan-focused benchmark has been used before, and its labels are confounded with source. It is not a new blind test or a guarantee for other texts.",
    system: "The combined factual accuracy of Tavily + Gemini + ML has not been measured on a separate independent dataset. The figures below describe only the corresponding statistical models.",
  },
} as const;

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

export function ModelTransparency() {
  const { locale } = useLanguage();
  const copy = translations[locale];

  return (
    <section id="model-quality" aria-labelledby="model-quality-heading" className="tool-gutter scroll-mt-8 pb-7 pt-1" data-testid="ru-model-quality">
      <div className="overflow-hidden rounded-[22px] border border-[#cfd9df] bg-[linear-gradient(118deg,#eaf2f5_0%,#f7f2e9_48%,#f2e8dc_100%)] shadow-[0_14px_34px_rgba(24,41,55,0.055)]">
        <div className="grid lg:grid-cols-[0.82fr_1.18fr]">
          <div className="border-b border-[#ccd7dc] px-5 py-6 sm:px-8 lg:border-b-0 lg:border-r lg:py-8">
            <p className="flex items-center gap-2 text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] text-[#8a5b42]"><FlaskConical size={16} aria-hidden="true" />{copy.eyebrow}</p>
            <p className="mt-3 break-all text-xs font-semibold text-[#607087]">{quality.modelVersion}</p>
            <h2 id="model-quality-heading" className="mt-3 max-w-[520px] font-serif text-[1.875rem] leading-[1.1] font-semibold tracking-[-0.035em] text-ink sm:text-[2.3125rem]">{copy.title}</h2>
            <p className="mt-4 text-[0.8125rem] leading-[1.65] text-[#5d6e81]">{copy.intro}</p>
            <div className="mt-5 flex gap-3 rounded-[14px] border border-white/60 bg-white/50 px-4 py-4" data-testid="model-system-accuracy-note">
              <Scale className="mt-0.5 shrink-0 text-[#315d78]" size={21} aria-hidden="true" />
              <p className="text-[0.75rem] leading-[1.65] text-[#3d607f]">{copy.system}</p>
            </div>
          </div>
          <div className="px-5 py-6 sm:px-8 lg:py-8">
            <p className="text-[0.8125rem] font-bold leading-[1.6] text-ink">{copy.dataset}</p>
            <p className="mt-1 text-[0.75rem] leading-[1.65] text-[#687689]">{russianEvaluation.dataset.training.samples} {copy.trained} · TF-IDF + logistic regression</p>
            <div className="mt-3 text-[0.75rem] leading-[1.65] text-[#687689]" data-testid="ru-evaluation-context">
              <p>{copy.evaluation}</p>
              <p>{copy.interval}: {quality.confidenceInterval.map(percent).join("–")}</p>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-3">
              {quality.metrics.map((metric, index) => (
                <div key={metric.key} className="min-w-0 rounded-xl border border-[#cfd9df] bg-white/55 p-3">
                  <dt className="text-xs font-semibold text-[#607087]">{metric.label}</dt>
                  <dd className="mt-1">
                    <span className="text-[1.4375rem] font-bold text-ink">{metric.value === null ? "—" : percent(metric.value)}</span>
                    <span className="mt-1 block text-[0.6875rem] leading-[1.5] text-[#718092]">{copy.metrics[index]}</span>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-[0.75rem] leading-[1.65] text-[#785f49]">{copy.caveat}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
