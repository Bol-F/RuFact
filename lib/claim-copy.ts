import type { AppLocale } from "./i18n";

export const claimCopy = {
  en: {
    highlight: "Why this claim is wrong",
    original: "Your claim",
    claim: "Your claim",
    why: "Why",
    whyWrong: "Why it is wrong",
    explanation: "Explanation",
    correction: "Correct fact",
    evidence: "Evidence",
    correctionEvidence: "Evidence for the correction",
    source: "Source",
    claimsOmitted: "More claim details do not fit this message. Check the same text on the website for a full report.",
    partialCoverage: "Only some claims were checked. The remaining statements have not been verified.",
  },
  ru: {
    highlight: "Почему это утверждение неверно",
    original: "Ваше утверждение",
    claim: "Ваше утверждение",
    why: "Почему",
    whyWrong: "Почему это неверно",
    explanation: "Объяснение",
    correction: "Верный факт",
    evidence: "Доказательство",
    correctionEvidence: "Источник верного факта",
    source: "Источник",
    claimsOmitted: "Часть подробностей не помещается в сообщение. Проверьте тот же текст на сайте, чтобы получить полный отчёт.",
    partialCoverage: "Проверена только часть утверждений. Остальные утверждения не проверены.",
  },
  uz: {
    highlight: "Nega bu da’vo noto‘g‘ri",
    original: "Sizning da’vongiz",
    claim: "Sizning da’vongiz",
    why: "Nega",
    whyWrong: "Nega bu noto‘g‘ri",
    explanation: "Izoh",
    correction: "To‘g‘ri fakt",
    evidence: "Dalil",
    correctionEvidence: "To‘g‘ri fakt uchun dalil",
    source: "Manba",
    claimsOmitted: "Ayrim da’vo tafsilotlari bu xabarga sig‘maydi. To‘liq hisobot uchun ayni matnni saytda tekshiring.",
    partialCoverage: "Da’volarning faqat bir qismi tekshirildi. Qolgan bayonotlar tasdiqlanmagan.",
  },
} satisfies Record<AppLocale, Record<string, string>>;

export const claimExplanationCopy = claimCopy;
