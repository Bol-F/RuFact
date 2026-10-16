// Pure command-menu configuration. Importing this file never contacts Telegram.
const descriptions = {
  uz: {
    start: "Boshlash va ko‘rsatmalar",
    chat: "AI suhbatni boshlash yoki davom ettirish",
    check: "Matnni manbalar bo‘yicha tekshirish",
    new: "Kontekstni tozalash va yangi suhbat boshlash",
    stop: "Suhbatni tugatish va kontekstni o‘chirish",
    uz: "O‘zbekcha · Lotin / Kirill",
    ru: "Русский",
    en: "English",
    help: "Yordam va foydalanish ko‘rsatmalari",
    donate: "RuFact’ga ixtiyoriy yordam",
    paysupport: "To‘lov yoki qaytarish bo‘yicha yordam",
    terms: "Ixtiyoriy yordam shartlari",
    privacy: "Maxfiylik va ma’lumotlarni saqlash",
    forget: "Sozlamalar va suhbat kontekstini o‘chirish",
  },
  ru: {
    start: "Начать и посмотреть инструкции",
    chat: "Начать или продолжить AI-чат",
    check: "Проверить текст по источникам",
    new: "Очистить контекст и начать новый разговор",
    stop: "Завершить чат и удалить контекст",
    uz: "O‘zbekcha · Lotin / Kirill",
    ru: "Русский",
    en: "English",
    help: "Помощь и инструкции",
    donate: "Добровольно поддержать RuFact",
    paysupport: "Помощь с оплатой или возвратом",
    terms: "Условия добровольной поддержки",
    privacy: "Конфиденциальность и хранение данных",
    forget: "Удалить настройки и контекст разговора",
  },
  en: {
    start: "Start and view instructions",
    chat: "Start or continue AI chat",
    check: "Check text against sources",
    new: "Clear context and start a new conversation",
    stop: "End chat and clear context",
    uz: "O‘zbekcha · Lotin / Kirill",
    ru: "Русский",
    en: "English",
    help: "Help and instructions",
    donate: "Support RuFact voluntarily",
    paysupport: "Payment or refund support",
    terms: "Voluntary support terms",
    privacy: "Privacy and data retention",
    forget: "Clear settings and conversation context",
  },
};

export function telegramCommandRegistrations() {
  const commands = locale => Object.entries(descriptions[locale]).map(([command, description]) => ({ command, description }));
  return [
    { commands: commands("uz") },
    ...["uz", "ru", "en"].map(language_code => ({ language_code, commands: commands(language_code) })),
  ];
}
