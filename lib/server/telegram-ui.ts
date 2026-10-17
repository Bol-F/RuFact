import type { AppLocale } from "../i18n";
import { STARS_AMOUNTS, STARS_MIN_AMOUNT, STARS_MAX_AMOUNT, isStarsAmount } from "../support.ts";

export const telegramUi = {
  uz: { check: "🔎 Matnni tekshirish", chat: "💬 AI chat", language: "🌐 Til / Language", help: "❔ Yordam", clear: "🧹 Yangi suhbat", stop: "⏹ Chatni tugatish", stopped: "⏹ Chat tugatildi, kontekst o‘chirildi. Endi matnni tekshirish rejimidasiz. /chat — qayta boshlash.", choose: "🌐 Javob tilini tanlang", checkMode: "🔎 Tekshirish rejimi\n\nMatn yuboring yoki xabarni forward qiling. Men manbalarni topib, da’volarni solishtiraman.", chatMode: "💬 RuFact AI chat\n\nSavol bering, keyin davomiy savollarni yozavering — har safar /chat kerak emas. Faktlarga oid savollarga internet manbalari topiladi.\n\nChat siz /stop yoki /check tanlamaguningizcha faol. Oxirgi 3 savol-javob 30 daqiqa harakatsizlikdan keyin o‘chadi, lekin chat rejimi qoladi. /new — yangi suhbat. Shaxsiy ma’lumot yubormang.", cleared: "🧹 Yangi suhbat boshlandi. Savolingizni yozing — chat faol.", typing: "Savol yoki davomiy savol yozing…", chatTitle: "RuFact · AI yordamchi" },
  ru: { check: "🔎 Проверить текст", chat: "💬 AI-чат", language: "🌐 Язык / Language", help: "❔ Помощь", clear: "🧹 Новый разговор", stop: "⏹ Завершить чат", stopped: "⏹ Чат завершён, контекст удалён. Теперь можно прислать текст для проверки. /chat — начать снова.", choose: "🌐 Выберите язык ответа", checkMode: "🔎 Режим проверки\n\nПришлите текст или перешлите сообщение. Я найду источники и сопоставлю утверждения.", chatMode: "💬 AI-чат RuFact\n\nЗадайте вопрос, затем просто пишите уточнения — повторять /chat не нужно. Для фактических вопросов ищу интернет-источники.\n\nЧат активен, пока вы не выберете /stop или /check. Последние 3 пары сообщений удаляются через 30 минут бездействия, но режим чата остаётся. /new — новый разговор. Не отправляйте личные данные.", cleared: "🧹 Начат новый разговор. Напишите вопрос — чат остаётся активным.", typing: "Напишите вопрос или уточнение…", chatTitle: "RuFact · AI-помощник" },
  en: { check: "🔎 Check text", chat: "💬 AI chat", language: "🌐 Language", help: "❔ Help", clear: "🧹 New conversation", stop: "⏹ End chat", stopped: "⏹ Chat ended and context cleared. You’re in fact-check mode. /chat — start again.", choose: "🌐 Choose a response language", checkMode: "🔎 Fact-check mode\n\nSend text or forward a message. I’ll find sources and compare its claims.", chatMode: "💬 RuFact AI chat\n\nAsk a question, then keep sending follow-ups — no need to repeat /chat. Factual questions use web sources.\n\nChat stays active until you select /stop or /check. The last 3 exchanges expire after 30 minutes of inactivity, but chat mode stays on. /new — new conversation. Don’t send personal data.", cleared: "🧹 New conversation started. Send a question — chat is still active.", typing: "Type a question or follow-up…", chatTitle: "RuFact · AI assistant" },
};

export const telegramSupportCopy = {
  uz: {
    button: "❤️ RuFact’ni qo‘llab-quvvatlash",
    title: "❤️ RuFact’ni qo‘llab-quvvatlash",
    description: "RuFact bepul loyiha. Ixtiyoriy yordamingiz xizmat va axborotni tekshirishni rivojlantirishga yordam beradi. To‘lov majburiy emas va qo‘shimcha tekshiruv yoki aniqroq javob bermaydi.",
    choose: `Bir martalik Telegram Stars miqdorini tanlang: 5, 10 yoki 25 ⭐. Boshqa miqdor uchun /donate 15 kabi yozing (${STARS_MIN_AMOUNT}–${STARS_MAX_AMOUNT} butun Stars).`,
    disabled: "Telegram Stars orqali yordam hozircha yoqilmagan. Egasi talablar va ishga tayyorlikni tekshirgandan keyin uni yoqishi mumkin.",
    invalid: `${STARS_MIN_AMOUNT}–${STARS_MAX_AMOUNT} oralig‘ida butun Stars miqdorini kiriting, masalan: /donate 15.`,
    invoice: "Telegram’da bir martalik yordam hisobini ochish",
    pending: "Hali to‘lov tasdiqlanmadi. Faqat Telegram tasdiqlangan to‘lov xabarini yuborgandan keyin rahmat xabari keladi.",
    unavailable: "Hozir hisob yaratib bo‘lmadi. Keyinroq urinib ko‘ring. Bu xabar to‘lov amalga oshganini bildirmaydi.",
    paySupport: "🧾 To‘lov bo‘yicha yordam",
    contact: "To‘lov yoki qaytarish masalasi uchun loyiha egasi bilan bog‘laning. Telegram to‘lov kvitansiyasini saqlang; maxfiy ma’lumotni ochiq GitHub issue’ga joylamang.",
    contactLink: "Loyiha egasiga murojaat qilish",
    noContact: "To‘lov yordami hali sozlanmagan, shuning uchun yangi to‘lovlar qabul qilinmaydi. Telegram’dagi kvitansiyani saqlang va RuFact saytining fikr bildirish bo‘limidan egasiga murojaat qiling; ochiq xabarda to‘lov identifikatorlarini ko‘rsatmang.",
    terms: "📄 Ixtiyoriy yordam shartlari",
    termsBody: "Bu bir martalik ixtiyoriy yordam, obuna yoki pullik xizmat emas. Tekshirish bepul qoladi; yordam javob aniqligiga yoki limitlarga ta’sir qilmaydi. Faqat Telegram va hududingizdagi to‘lov, yosh va boshqa talablariga mos bo‘lsangiz to‘lang. Telegram Stars TON yoki kriptovalyuta emas. Xatolik yoki qaytarish masalasi: /paysupport.",
    retention: "To‘lov kvitansiyasi ma’lumotlari tekshirish va qaytarish uchun 90 kungacha alohida saqlanadi. /forget sozlamalar va AI kontekstini o‘chiradi, lekin tasdiqlangan to‘lov yozuvlarini o‘chirmaydi. Telegram o‘z qoidalariga ko‘ra kvitansiyalarni saqlaydi.",
  },
  ru: {
    button: "❤️ Поддержать RuFact",
    title: "❤️ Поддержать RuFact",
    description: "RuFact — бесплатный проект. Добровольная поддержка помогает поддерживать сервис и развивать проверку информации. Платить необязательно: поддержка не даёт дополнительных проверок или более точных ответов.",
    choose: `Выберите разовую поддержку: 5, 10 или 25 ⭐ Telegram Stars. Для своей суммы напишите, например, /donate 15 (целое число от ${STARS_MIN_AMOUNT} до ${STARS_MAX_AMOUNT}).`,
    disabled: "Поддержка через Telegram Stars пока выключена. Владелец сможет включить её после проверки требований и готовности проекта.",
    invalid: `Введите целое число Stars от ${STARS_MIN_AMOUNT} до ${STARS_MAX_AMOUNT}, например: /donate 15.`,
    invoice: "Открыть разовый счёт поддержки в Telegram",
    pending: "Оплата ещё не подтверждена. Благодарность придёт только после подтверждённого Telegram события оплаты.",
    unavailable: "Сейчас не удалось создать счёт. Попробуйте позже. Это сообщение не подтверждает оплату.",
    paySupport: "🧾 Помощь с оплатой",
    contact: "По вопросам оплаты или возврата обратитесь к владельцу проекта. Сохраните квитанцию Telegram; не публикуйте личные данные в открытом GitHub issue.",
    contactLink: "Связаться с владельцем проекта",
    noContact: "Поддержка по оплате ещё не настроена, поэтому новые платежи не принимаются. Сохраните квитанцию Telegram и обратитесь к владельцу через обратную связь на сайте RuFact; не публикуйте платёжные идентификаторы в открытом сообщении.",
    terms: "📄 Условия добровольной поддержки",
    termsBody: "Это разовая добровольная поддержка, а не подписка или платная услуга. Проверка остаётся бесплатной; поддержка не влияет на точность ответов и лимиты. Платите только при соблюдении требований Telegram, возрастных и региональных правил. Telegram Stars — не TON и не криптовалюта. Ошибка или возврат: /paysupport.",
    retention: "Данные подтверждённой оплаты хранятся отдельно до 90 дней для сверки и возврата. /forget удаляет настройки и AI-контекст, но не подтверждённые платёжные записи. Telegram хранит квитанции по своим правилам.",
  },
  en: {
    button: "❤️ Support RuFact",
    title: "❤️ Support RuFact",
    description: "RuFact is a free project. Voluntary support helps maintain the service and improve information checking. Payment is never required and does not unlock more checks or more accurate answers.",
    choose: `Choose a one-off contribution: 5, 10 or 25 ⭐ Telegram Stars. For a custom amount, send e.g. /donate 15 (whole Stars from ${STARS_MIN_AMOUNT} to ${STARS_MAX_AMOUNT}).`,
    disabled: "Telegram Stars support is currently disabled. The owner can enable it after checking eligibility and production readiness.",
    invalid: `Enter a whole number of Stars from ${STARS_MIN_AMOUNT} to ${STARS_MAX_AMOUNT}, e.g. /donate 15.`,
    invoice: "Open the one-off support invoice in Telegram",
    pending: "Payment is not confirmed yet. A thank-you follows only after Telegram sends a confirmed payment event.",
    unavailable: "An invoice could not be created right now. Please try later. This message does not confirm a payment.",
    paySupport: "🧾 Payment support",
    contact: "Contact the project owner about a payment or refund. Keep your Telegram receipt; do not post personal information in a public GitHub issue.",
    contactLink: "Contact the project owner",
    noContact: "Payment support is not configured yet, so new payments are not accepted. Keep your Telegram receipt and contact the owner through feedback on the RuFact website; never post payment identifiers publicly.",
    terms: "📄 Voluntary support terms",
    termsBody: "This is one-off voluntary support, not a subscription or a paid service. Checking remains free; support does not change answer accuracy or limits. Pay only if you meet Telegram, age and regional requirements. Telegram Stars are not TON or cryptocurrency. Payment issues or refunds: /paysupport.",
    retention: "Confirmed payment records are stored separately for up to 90 days for reconciliation and refunds. /forget clears preferences and AI context, not confirmed payment records. Telegram retains receipts under its own policies.",
  },
};

export function escapeTelegramHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function telegramNotice(text: string) {
  const [heading, ...body] = text.split("\n");
  return `<b>${escapeTelegramHtml(heading)}</b>${body.length ? `\n${escapeTelegramHtml(body.join("\n"))}` : ""}`;
}

export function telegramButtonCommand(text: string) {
  const starsButton = /^(\d{1,5}) ⭐$/u.exec(text);
  // Old persistent keyboards (50/100/250) remain usable after the preset change.
  if (starsButton && isStarsAmount(Number(starsButton[1]))) return `/donate ${starsButton[1]}`;
  if (Object.values(telegramSupportCopy).some(copy => copy.button === text)) return "/donate";
  const languages: Record<string, string> = { "🇺🇿 O‘zbekcha": "/uz", "🇷🇺 Русский": "/ru", "🇬🇧 English": "/en" };
  if (languages[text]) return languages[text];
  for (const copy of Object.values(telegramUi)) {
    if (text === copy.check) return "/check";
    if (text === copy.chat) return "/chat";
    if (text === copy.language) return "/language";
    if (text === copy.help) return "/help";
    if (text === copy.clear) return "/new";
    if (text === copy.stop) return "/stop";
  }
  return text;
}

export function telegramKeyboard(locale: AppLocale, webUrl: string, languages = false, chatMode = false, supportOptions = false) {
  const copy = telegramUi[locale];
  const support = telegramSupportCopy[locale];
  return {
    keyboard: supportOptions ? [
      STARS_AMOUNTS.map(amount => ({ text: `${amount} ⭐` })),
      [{ text: chatMode ? copy.chat : copy.check }, { text: copy.language }],
      [{ text: support.button }, { text: copy.help }],
    ] : languages ? [[{ text: "🇺🇿 O‘zbekcha" }, { text: "🇷🇺 Русский" }, { text: "🇬🇧 English" }], [{ text: chatMode ? copy.chat : copy.check }, { text: copy.help }]] : chatMode ? [
      [{ text: copy.clear }, { text: copy.stop }],
      [{ text: copy.language }, { text: "↗ RuFact AI", web_app: { url: new URL("/chat", webUrl).href } }],
      [{ text: copy.check }, { text: copy.help }],
      [{ text: support.button }],
    ] : [
      [{ text: copy.check }, { text: copy.chat }],
      [{ text: copy.clear }, { text: copy.language }],
      [{ text: copy.help }, { text: "↗ RuFact", web_app: { url: webUrl } }],
      [{ text: support.button }],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: chatMode ? copy.typing : locale === "ru" ? "Отправьте текст для проверки…" : locale === "en" ? "Send text to check…" : "Tekshirish uchun matn yuboring…",
  };
}
