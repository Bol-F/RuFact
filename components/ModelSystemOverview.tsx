"use client";

import { BrainCircuit, Calculator, SearchCheck, ShieldCheck } from "lucide-react";
import { useLanguage } from "./LanguageProvider";

const translations = {
  uz: {
    eyebrow: "Joriy tekshiruv yo‘llari", title: "Har matn bir xil tekshirilmaydi",
    lead: "Tekshiruv faqat «Matnni tekshirish» bosilganda boshlanadi. Yo‘l interfeys tiliga emas, yuborilgan matnga qarab tanlanadi.",
    routes: [
      { title: "Aniq arifmetika", badge: "Avval tenglik tekshiriladi", description: "2 + 2 = 5 kabi to‘liq tengliklar mahalliy aniq hisob-kitob bilan tekshiriladi. Qo‘shish, ayirish, ko‘paytirish, bo‘lish, qavs va o‘nli sonlar qo‘llanadi.", detail: "AI va internet qidiruvisiz · ehtimollik foizisiz" },
      { title: "Tavily → Gemini", badge: "O‘zbek · rus · ingliz", description: "Sozlangan internet tekshiruvi Tavily’dan 6 tagacha HTTPS manba topadi. Gemini topilgan parchalarni matndagi 6 tagacha asosiy da’vo bilan solishtiradi. O‘zbekcha (lotin/kirill) matn statistik modeldan o‘tmaydi.", detail: "Bitta Basic qidiruv · butun internet yoki barcha faktlar qamrovi emas" },
      { title: "Qo‘shimcha ML signali", badge: "Faqat rus va ingliz", description: "Har bir tilning alohida TF-IDF + logistik regressiya modeli matnning so‘z va belgi naqshlarini baholaydi. Bu faktning rostligini isbotlamaydi. Mavjud bo‘lsa, ML va manbalar tekshiruvi parallel ishlaydi.", detail: "Manbalar xulosasi ustun · ML ishonchi alohida ko‘rsatiladi" },
    ],
    verdictTitle: "Manbalarga asoslangan xulosa qanday tanlanadi?",
    verdicts: [
      { label: "REAL", text: "Ajratilgan faktik da’volarning barchasi topilgan manbalar bilan tasdiqlangan va qamrov to‘liq deb belgilangan." },
      { label: "FAKE", text: "Kamida bitta faktik da’vo topilgan manbalarga zid. Bu butun matndagi har bir jumla yolg‘on degani emas." },
      { label: "UNSURE", text: "Rad etilgan faktik da’vo yo‘q, lekin dalil yetarli emas, natija aralash, qamrov qisman yoki matn faqat fikrdan iborat. Manba topilmasligi yolg‘onlik isboti emas." },
    ],
    correctionTitle: "Faqat hukm emas: sabab va tuzatish",
    correction: "RuFact asl da’voni o‘zgartirmasdan keltiradi, ziddiyat sababini va dalil parchasini ko‘rsatadi. Manbalar to‘g‘ri faktni tasdiqlasa, alohida qisqa tuzatish ham beriladi. Dalil bo‘lmasa, tuzatish o‘ylab topilmaydi.",
    example: "Masalan: «Samarqand O‘zbekiston poytaxti» → manba Toshkent poytaxt ekanini tasdiqlasa, xatoning sababi va «O‘zbekiston poytaxti — Toshkent» tuzatishi ko‘rsatiladi.",
    warning: "Havola va aniq iqtibos dalilning qayerdan kelganini ko‘rsatadi, lekin AI talqini to‘g‘riligini kafolatlamaydi. Muhim qarorlar oldidan asl manba, sana va kontekstni tekshiring.",
  },
  ru: {
    eyebrow: "Текущие пути проверки", title: "Разным текстам — разная проверка",
    lead: "Проверка начинается только после «Проверить текст». Путь выбирается по содержимому текста, а не по языку интерфейса.",
    routes: [
      { title: "Точная арифметика", badge: "Сначала проверяем равенство", description: "Полные равенства вроде 2 + 2 = 5 проверяются точным локальным расчётом. Поддерживаются сложение, вычитание, умножение, деление, скобки и десятичные числа.", detail: "Без AI и интернет-поиска · без процента вероятности" },
      { title: "Tavily → Gemini", badge: "Узбекский · русский · английский", description: "При настроенной интернет-проверке Tavily находит до 6 HTTPS-источников. Gemini сопоставляет найденные фрагменты с максимум 6 основными утверждениями. Узбекский текст (латиница/кириллица) не проходит через статистическую модель.", detail: "Один Basic-поиск · не весь интернет и не все факты" },
      { title: "Дополнительный ML-сигнал", badge: "Только русский и английский", description: "Отдельная для каждого языка модель TF-IDF + логистическая регрессия оценивает сочетания слов и символов. Это не доказательство истинности факта. При доступности ML и проверка источников выполняются параллельно.", detail: "Вывод по источникам имеет приоритет · уверенность ML показана отдельно" },
    ],
    verdictTitle: "Как выбирается вывод по источникам?",
    verdicts: [
      { label: "REAL", text: "Все выделенные фактические утверждения поддержаны найденными источниками, а охват отмечен как полный." },
      { label: "FAKE", text: "Хотя бы одно фактическое утверждение противоречит найденным источникам. Это не означает, что каждое предложение в тексте ложно." },
      { label: "UNSURE", text: "Нет опровергнутых фактических утверждений, но данных недостаточно, вывод неоднозначен, охват частичный или текст содержит только мнение. Отсутствие источника не доказывает ложность." },
    ],
    correctionTitle: "Не только вердикт: причина и исправление",
    correction: "RuFact цитирует исходное утверждение без подмены смысла, объясняет противоречие и показывает фрагмент доказательства. Если источник подтверждает верный факт, отдельно появляется короткое исправление. Без доказательства замена не придумывается.",
    example: "Например: «Самарканд — столица Узбекистана» → если источник подтверждает, что столица — Ташкент, результат объяснит ошибку и предложит: «Столица Узбекистана — Ташкент».",
    warning: "Ссылка и точная цитата показывают происхождение доказательства, но не гарантируют правильность AI-интерпретации. Перед важным решением откройте первоисточник и проверьте дату и контекст.",
  },
  en: {
    eyebrow: "Current verification paths", title: "Different text, different checks",
    lead: "Checking starts only when you press “Check text”. The route follows the submitted text, not the interface language.",
    routes: [
      { title: "Exact arithmetic", badge: "Equations are checked first", description: "Complete equations such as 2 + 2 = 5 use exact local calculation. Addition, subtraction, multiplication, division, parentheses and decimal numbers are supported.", detail: "No AI or internet search · no probability percentage" },
      { title: "Tavily → Gemini", badge: "Uzbek · Russian · English", description: "When online verification is configured, Tavily retrieves up to 6 HTTPS sources. Gemini compares their passages with up to 6 main claims. Uzbek text (Latin/Cyrillic) bypasses statistical models.", detail: "One Basic search · not the whole internet or every fact" },
      { title: "Additional ML signal", badge: "Russian and English only", description: "A separate TF-IDF + logistic regression model for each language scores word and character patterns. This does not establish factual truth. When available, ML and source checking run in parallel.", detail: "Source review takes precedence · ML confidence stays separate" },
    ],
    verdictTitle: "How are source-based verdicts chosen?",
    verdicts: [
      { label: "REAL", text: "All extracted factual claims are supported by retrieved sources and coverage is marked complete." },
      { label: "FAKE", text: "At least one factual claim contradicts retrieved sources. This does not mean that every sentence in the text is false." },
      { label: "UNSURE", text: "No factual claim is contradicted, but evidence is insufficient or mixed, coverage is partial, or the text contains only opinion. Not finding a source is not proof of falsehood." },
    ],
    correctionTitle: "Beyond a verdict: reasons and corrections",
    correction: "RuFact quotes the original claim without rewriting its meaning, explains contradictions and shows an evidence passage. When sources establish a replacement fact, a short correction appears separately. Without evidence, it does not invent a replacement.",
    example: "For example: “Samarkand is the capital of Uzbekistan” → if a source establishes Tashkent as the capital, the result explains the error and suggests: “Tashkent is the capital of Uzbekistan”.",
    warning: "A link and an exact quotation establish where evidence came from, not that the AI interpreted it correctly. Open the primary source and check its date and context before important decisions.",
  },
} as const;

const routePresentation = [
  { id: "arithmetic", icon: Calculator, iconClass: "bg-[#dcebdc] text-[#37724d]" },
  { id: "sources", icon: SearchCheck, iconClass: "bg-[#f6e1d1] text-[#b15432]" },
  { id: "statistical", icon: BrainCircuit, iconClass: "bg-[#dceaf3] text-[#285e7d]" },
] as const;

const verdictTones = {
  REAL: "border-[#d3e6d7] bg-[#edf5ee] text-[#326b48]",
  FAKE: "border-[#efd5cf] bg-[#fcf0eb] text-[#a14a38]",
  UNSURE: "border-[#e8dfc7] bg-[#fbf6e9] text-[#82642e]",
} as const;

export function ModelSystemOverview() {
  const { locale } = useLanguage();
  const copy = translations[locale];

  return (
    <section aria-labelledby="system-overview-heading" className="regional-model-architecture tool-gutter pb-7 pt-1" data-testid="model-system-overview">
      <div className="overflow-hidden rounded-[22px] border border-[#d3d9d8] bg-[#fbfaf6]/90 shadow-[0_14px_34px_rgba(24,41,55,0.045)]">
        <div className="border-b border-[#dddeda] px-5 py-6 sm:px-8 sm:py-7">
          <p className="text-[0.625rem] font-extrabold uppercase tracking-[0.17em] text-[#8a5b42]">{copy.eyebrow}</p>
          <h2 id="system-overview-heading" className="mt-2 font-serif text-[1.8125rem] leading-[1.08] font-semibold tracking-[-0.035em] text-ink sm:text-[2.25rem]">{copy.title}</h2>
          <p className="mt-3 max-w-[780px] text-[0.8125rem] leading-[1.65] text-[#647487]">{copy.lead}</p>
        </div>
        <div className="regional-model-stages grid lg:grid-cols-3" data-testid="model-routing">
          {copy.routes.map((route, index) => {
            const presentation = routePresentation[index];
            const Icon = presentation.icon;
            return (
              <article key={presentation.id} data-testid={`model-route-${presentation.id}`} className="regional-model-stage min-w-0 border-b border-[#dddeda] px-5 py-6 last:border-b-0 sm:px-8 lg:border-b-0 lg:border-r lg:last:border-r-0">
                <span className={`grid h-11 w-11 place-items-center rounded-[13px] ${presentation.iconClass}`}><Icon size={22} strokeWidth={1.9} aria-hidden="true" /></span>
                <div className="regional-model-stage-copy min-w-0">
                  <h3 className="mt-4 text-[1.0625rem] font-extrabold tracking-[-0.02em] text-ink">{route.title}</h3>
                  <p className="mt-2 text-[0.6875rem] font-bold leading-[1.5] text-[#8a5b42]">{route.badge}</p>
                  <p className="mt-3 text-[0.8125rem] leading-[1.65] text-[#667586]">{route.description}</p>
                  <p className="regional-model-stage-detail mt-4 text-[0.6875rem] font-semibold leading-[1.55] text-[#718092]">{route.detail}</p>
                </div>
              </article>
            );
          })}
        </div>
        <div className="border-t border-[#dddeda] px-5 py-6 sm:px-8" data-testid="model-verdict-rules">
          <h3 className="text-[1.0625rem] font-extrabold text-ink">{copy.verdictTitle}</h3>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {copy.verdicts.map(verdict => (
              <article key={verdict.label} className={`min-w-0 rounded-[14px] border p-4 ${verdictTones[verdict.label]}`}>
                <h4 className="text-[0.8125rem] font-extrabold tracking-[0.04em]">{verdict.label}</h4>
                <p className="mt-2 text-[0.75rem] leading-[1.65]">{verdict.text}</p>
              </article>
            ))}
          </div>
          <div className="mt-5" data-testid="model-claim-corrections">
            <h3 className="text-[0.9375rem] font-extrabold text-ink">{copy.correctionTitle}</h3>
            <p className="mt-2 max-w-[1000px] text-[0.8125rem] leading-[1.65] text-[#647487]">{copy.correction}</p>
            <p className="mt-3 rounded-xl border border-[#e5dfd3] bg-white/50 px-4 py-3 text-[0.75rem] leading-[1.65] text-[#6f675c]">{copy.example}</p>
          </div>
        </div>
        <div className="flex gap-3 border-t border-[#dddeda] bg-[#edf3f1] px-5 py-4 sm:px-8">
          <ShieldCheck className="mt-0.5 shrink-0 text-[#397156]" size={19} aria-hidden="true" />
          <p className="text-[0.75rem] leading-[1.65] text-[#577065]">{copy.warning}</p>
        </div>
      </div>
    </section>
  );
}
