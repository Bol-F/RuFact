import type { AppLocale } from "./i18n";
import type { ChatMessage, ChatReply } from "./chat";
import { arithmeticCopy, arithmeticExplanation, evaluateArithmeticClaim } from "./arithmetic.ts";

const patterns = {
  identity: /^(?:who are you|what are you|кто ты|кто вы|ты кто|sen kimsan|siz kimsiz|kimsan|сен кимсан|сиз кимсиз|кимсан)$/u,
  greeting: /^(?:hi|hello|hey|привет|здравствуй(?:те)?|salom|assalomu alaykum|салом|ассалому алайкум)$/u,
  thanks: /^(?:thanks|thank you|спасибо|rahmat|рахмат|раҳмат)$/u,
  help: /^(?:what can you do|how can you help(?: me)?|что ты умеешь|что вы умеете|как ты можешь помочь|nima qila olasan|nima qila olasiz|нима қила оласан|нима қила оласиз)$/u,
};
const copy = {
  en: { identity: "I’m RuFact, your AI assistant for exploring news, claims and sources. Send a question and we can discuss it together. Factual questions use web sources; introductions don’t need a search.", greeting: "Hello! What would you like to discuss or check? You can keep asking follow-up questions here.", thanks: "You’re welcome! Ask another question whenever you’re ready.", help: "I can check a claim against web sources, explain a news story, compare sources and answer follow-up questions. Send a claim or question to get started. I can make mistakes, so check important facts in the original sources." },
  ru: { identity: "Я RuFact — AI-помощник для обсуждения новостей, утверждений и источников. Напишите вопрос, и продолжим разговор. Для фактических вопросов ищу источники; для знакомства поиск не нужен.", greeting: "Привет! Что хотите обсудить или проверить? Здесь можно продолжать разговор и задавать уточняющие вопросы.", thanks: "Пожалуйста! Если есть ещё вопросы, продолжим.", help: "Могу сопоставить утверждение с интернет-источниками, объяснить новость, сравнить источники и ответить на уточняющие вопросы. Напишите вопрос или утверждение. Я могу ошибаться — важные факты проверяйте в первоисточниках." },
  uz: { identity: "Men RuFact — yangiliklar, da’volar va manbalarni tushunishga yordam beradigan AI yordamchiman. Savolingizni yozing, suhbatni davom ettiramiz. Faktlarga oid savollarga manbalar izlayman; tanishish uchun qidiruv kerak emas.", greeting: "Salom! Nimani muhokama qilamiz yoki tekshiramiz? Shu yerda suhbatni davom ettirib, qo‘shimcha savollar berishingiz mumkin.", thanks: "Arzimaydi! Yana savolingiz bo‘lsa, davom etamiz.", help: "Da’voni internet manbalari bilan tekshirish, yangilikni tushuntirish, manbalarni solishtirish va qo‘shimcha savollarga javob berishga yordam beraman. Savol yoki da’vo yuboring. Men ham xato qilishim mumkin — muhim faktlarni asl manbada tekshiring." },
  uzCyrl: { identity: "Мен RuFact — янгиликлар, даъволар ва манбаларни тушунишга ёрдам берадиган AI ёрдамчиман. Саволингизни ёзинг, суҳбатни давом эттирамиз. Фактларга оид саволларга манбалар излайман; танишиш учун қидирув керак эмас.", greeting: "Салом! Нимани муҳокама қиламиз ёки текширамиз? Шу ерда суҳбатни давом эттириб, қўшимча саволлар беришингиз мумкин.", thanks: "Арзимайди! Яна саволингиз бўлса, давом этамиз.", help: "Даъвони интернет манбалари билан текшириш, янгиликни тушунтириш, манбаларни солиштириш ва қўшимча саволларга жавоб беришга ёрдам бераман. Савол ёки даъво юборинг. Мен ҳам хато қилишим мумкин — муҳим фактларни асл манбада текширинг." },
};

// Match only complete social messages, never a greeting followed by a factual claim.
// These fixed app explanations require neither provider quota nor search citations.
export function localChatReply(messages: ChatMessage[], locale: AppLocale): Extract<ChatReply, { status: "complete" }> | null {
  const latest = messages.at(-1);
  if (latest?.role !== "user") return null;
  const calculation = evaluateArithmeticClaim(latest.content);
  if (calculation) {
    const detail = arithmeticCopy[locale];
    return {
      status: "complete",
      text: [
        calculation.correct ? detail.correct : detail.incorrect,
        `${detail.original}: ${calculation.expression}`,
        arithmeticExplanation(calculation, locale),
        ...(calculation.correction ? [`${detail.correction}: ${calculation.correction}`] : []),
        detail.note,
      ].join("\n\n"),
      sources: [],
    };
  }
  const text = latest.content.trim().toLowerCase().replace(/[?!.,…]+$/u, "").trim();
  for (const [kind, pattern] of Object.entries(patterns)) {
    if (pattern.test(text)) {
      const language = locale === "uz" && /[\u0400-\u04ff]/u.test(text) ? "uzCyrl" : locale;
      return { status: "complete", text: copy[language][kind as keyof typeof patterns], sources: [] };
    }
  }
  return null;
}
