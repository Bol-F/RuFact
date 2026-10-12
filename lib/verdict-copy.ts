import type { AppLocale } from "./i18n";

export const verdictCopy: Record<AppLocale, {
  unsure: string; source: string; supported: string; contradicted: string; insufficient: string;
  statistical: string; highRisk: string; lowRisk: string; unavailable: string;
  high: string; medium: string; low: string; modelConfidence: string; statisticalNote: string;
  historyReview: string;
}> = {
  en: {
    unsure: "UNSURE", source: "Source review", supported: "Retrieved sources support the claim.",
    contradicted: "Retrieved sources contradict a key claim.",
    insufficient: "Evidence is insufficient or mixed; verify the original sources.",
    statistical: "Statistical signal only", highRisk: "HIGH RISK", lowRisk: "LOW RISK",
    unavailable: "No supported statistical result or source conclusion is available. Enable source checking or try again.",
    high: "High certainty", medium: "Medium certainty", low: "Low certainty",
    modelConfidence: "statistical model confidence",
    statisticalNote: "Text-pattern score, not proof that the claim is true or false.",
    historyReview: "This history entry does not retain source evidence. Check the restored text again for an up-to-date conclusion.",
  },
  ru: {
    unsure: "НЕЯСНО", source: "Проверка источников", supported: "Найденные источники подтверждают утверждение.",
    contradicted: "Найденные источники противоречат ключевому утверждению.",
    insufficient: "Доказательств недостаточно или они противоречивы. Проверьте первоисточники.",
    statistical: "Только статистический сигнал", highRisk: "ВЫСОКИЙ РИСК", lowRisk: "НИЗКИЙ РИСК",
    unavailable: "Нет доступного результата модели или вывода по источникам. Включите поиск или повторите проверку.",
    high: "Высокая уверенность", medium: "Средняя уверенность", low: "Низкая уверенность",
    modelConfidence: "уверенность статистической модели",
    statisticalNote: "Оценка языковых признаков, а не доказательство истинности или ложности факта.",
    historyReview: "Источники не сохраняются в компактной истории. Проверьте восстановленный текст заново, чтобы получить актуальный вывод.",
  },
  uz: {
    unsure: "NOANIQ", source: "Manbalar tekshiruvi", supported: "Topilgan manbalar da’voni tasdiqlaydi.",
    contradicted: "Topilgan manbalar asosiy da’voni rad etadi.",
    insufficient: "Dalillar yetarli emas yoki qarama-qarshi. Asl manbalarni tekshiring.",
    statistical: "Faqat statistik signal", highRisk: "YUQORI XAVF", lowRisk: "PAST XAVF",
    unavailable: "Model natijasi yoki manbalar xulosasi mavjud emas. Manba tekshiruvini yoqing yoki qayta urinib ko‘ring.",
    high: "Yuqori ishonch", medium: "O‘rta ishonch", low: "Past ishonch",
    modelConfidence: "statistik model ishonchi",
    statisticalNote: "Matn belgilari bahosi, da’voning rost yoki yolg‘onligiga dalil emas.",
    historyReview: "Tarix yozuvi manba dalillarini saqlamaydi. Dolzarb xulosa uchun tiklangan matnni qayta tekshiring.",
  },
};
