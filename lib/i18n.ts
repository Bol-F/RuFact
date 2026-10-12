export const SUPPORTED_LOCALES = ["uz", "ru", "en"] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "uz";

export const localeTags: Record<AppLocale, string> = {
  uz: "uz-Latn-UZ",
  ru: "ru-RU",
  en: "en-GB",
};

export const languageNames: Record<AppLocale, string> = {
  uz: "O‘zbekcha",
  ru: "Русский",
  en: "English",
};

const translations = {
  uz: {
    emptyResult: { description: "Matn kiriting yoki fayl yuklang. Tekshirish natijasi va topilgan manbalar shu yerda ko‘rinadi." },
    navigation: {
      main: "Asosiy navigatsiya",
      mobile: "Mobil navigatsiya",
      how: "Qanday ishlaydi",
      model: "Model haqida",
      faq: "Savol-javoblar",
      feedback: "Fikr bildirish",
      openMenu: "Menyuni ochish",
      closeMenu: "Menyuni yopish",
      language: "Tilni tanlash",
    },
    hero: {
      eyebrow: "O‘zbek, rus va ingliz tilidagi matnlar tahlili",
      mobileTitleStart: "Matnni",
      mobileTitleAccent: "tekshiring",
      desktopLine1: "Matnni tekshiring",
      desktopLine2: "ishonchsiz axborot",
      desktopLine3: "belgilariga",
      mobileDescription: "O‘zbekcha (lotin va kirill), ruscha va inglizcha matnlarni manbalar orqali tekshiring.",
      desktopDescription: "RuFact internet manbalarini topadi va matndagi da’volarni ular bilan solishtiradi. Rus va ingliz tillari uchun alohida statistik ML modellari ham mavjud.",
      imageAlt: "Moskva me’morchiligi va sohil bo‘yidagi tahririy kollaj",
      noteLeft: "Ko‘proq\nkontekst —\nkamroq\nmanipulyatsiya",
      noteRight: "Faktlarni tekshiring.\nTanqidiy fikrlang.\nMas’uliyat bilan ulashing.",
    },
    analyzer: {
      region: "Matnni tekshirish",
      heading: "Tekshirish uchun matn kiriting",
      clear: "Tozalash",
      clearAria: "Matnni tozalash",
      inputLabel: "Tahlil qilinadigan matn",
      placeholder: "Yangilik, post yoki da’voni joylashtiring…",
      upload: "Fayl yuklash",
      uploading: "Fayl o‘qilmoqda…",
      uploadAria: "Hujjat yuklash",
      fileTypes: "TXT, MD, CSV, JSON, PDF, DOCX · 3 MB gacha",
      filePrivacy: "Fayl serverda saqlanmaydi",
      examples: "Misolni sinab ko‘ring:",
      examplesAria: "Matn misollari",
      internetTitle: "Internet manbalari orqali tekshirish",
      internetOn: "Manbalarni topib, da’volarni ular bilan solishtiramiz.",
      internetOff: "Manbalarni qidirish va da’volarni tekshirishni yoqing.",
      internetUnavailable: "Qidiruv sozlanmagan; ruscha va inglizcha ML tahlili mavjud.",
      privacyShort: "Shaxsiy yoki maxfiy ma’lumot yubormang.",
      privacyLong: "Qidiruv so‘rovi Tavily’ga, matn va topilgan parchalar esa Google’ga yuboriladi. Shaxsiy yoki maxfiy ma’lumot yubormang.",
      terms: "Google shartlari",
      submit: "Matnni tekshirish",
      submitting: "Tekshirilmoqda…",
      helper: "O‘zbek (lotin/kirill), rus va ingliz · 5000 belgigacha",
      helperDesktop: "Tekshirishdan oldin matnni tahrirlash mumkin.",
      required: "Tekshiriladigan matnni kiriting.",
      serviceError: "Xizmat vaqtincha ishlamayapti. Matn saqlanmadi — qayta urinib ko‘rishingiz mumkin.",
      extracted: "matn ajratib olindi",
      extractedEditable: "Uni tekshirishdan oldin tahrirlash mumkin.",
      extractedTruncated: "belgi ajratildi; dastlabki 5000 tasi yuklandi. Tahlildan oldin matnni tekshiring va qisqartiring.",
      readError: "Faylni o‘qib bo‘lmadi.",
      languageNotice: "Rus va ingliz tillarida alohida ML modellari mavjud. O‘zbekcha model hali yo‘q. Manbalar tekshiruvi mavjud bo‘lsa, uning xulosasi ustun turadi.",
    },
    result: {
      heading: "Tahlil natijasi",
      demo: "Demo tahlil",
      model: "ML model",
      failed: "Tahlilni bajarib bo‘lmadi",
      retryHint: "Bir necha soniyadan keyin qayta urinib ko‘ring.",
      retry: "Qayta urinish",
      resultAria: "Natija",
      lowConfidence: "Ishonch past — qo‘lda tekshirish ayniqsa muhim",
      fake: "Ishonchsiz axborot belgilari aniqlandi",
      real: "Yaqqol ishonchsizlik belgilari aniqlanmadi",
      confidence: "javobga ishonch",
      why: "Nega?",
      modelSignals: "Modelning statistik belgilari",
      textSignals: "Matndagi asosiy belgilar",
      noSavedExplanation: "Batafsil izoh lokal tarixda saqlanmagan. Yangilangan statistik belgilarni olish uchun tahlilni takrorlang.",
      signalsUnavailable: "Statistik belgilar yangi tahlildan so‘ng ko‘rinadi va ajratilgan jumlalarning rost yoki yolg‘onligini isbotlamaydi.",
      disclaimer: "Natija ehtimoliy baho, yakuniy hukm emas. Muhim da’volarni ishonchli birlamchi manbalarda tekshiring.",
      sourceHow: "Manbalarni qanday tekshirish mumkin",
      notChecked: "Tekshirilmagan",
    },
    loading: {
      aria: "Matn tahlil qilinmoqda",
      title: "Matn tekshirilmoqda",
      description: "Til belgilari, kontekst va tanlangan bo‘lsa internet manbalari tahlil qilinmoqda.",
      wait: "Sahifani yopmang — natija tahlil tugashi bilan shu yerda paydo bo‘ladi.",
      sr: "Kiritilgan matn tahlil qilinmoqda. Iltimos, kuting.",
    },
    examples: [
      { id: "news", label: "Yangilik", icon: "news", text: "O‘zbekiston Statistika agentligi ma’lumotiga ko‘ra, sentabr oyida chakana savdo hajmi o‘tgan yilning shu davriga nisbatan 4,2 foizga oshgan. Hisobot rasmiy saytda e’lon qilingan." },
      { id: "social", label: "Ижтимоий тармоқ", icon: "social", text: "Шошилинч барчага юборинг! Бугун кечаси банк тизими янгиланади ва хабардаги ҳавола орқали аккаунтини тасдиқламаганларнинг картаси бутунлай блокланади. Расман бу ҳақда ҳали айтилмаяпти." },
      { id: "medical", label: "Tibbiy da’vo", icon: "medical", text: "Olimlar ertalab och qoringa issiq suv ichish tanani toksinlardan to‘liq tozalashi va parhezsiz tez ozishga yordam berishini isbotladi. Shifokorlar bu usulni har kuni qo‘llashni tavsiya qilmoqda." },
      { id: "politics", label: "Сиёсий баёнот", icon: "politics", text: "Олий Мажлис матбуот хизмати қонун лойиҳаси биринчи ўқишдан ўтганини расмий сайтида маълум қилди. Ҳужжат рақами, овоз бериш натижаси ва кейинги муҳокама санаси кўрсатилган; якуний қарор ҳали қабул қилинмаган." },
    ],
    faq: {
      title: "Muhim savollarga qisqa javoblar",
      intro: "Ehtimoliy bahoni professional faktcheking bilan adashtirmaslik uchun.",
      items: [
        { question: "Natijadagi foiz nimani anglatadi?", answer: "Bu muayyan javobga modelning ishonchi, RuFact’ning umumiy aniqligi emas. Ruscha va inglizcha modellarning baholari alohida testlarda o‘lchangan va tizim haqida sahifasida ko‘rsatilgan. O‘zbekcha model hali o‘qitilmagan." },
        { question: "RuFact internetdagi faktlarni tekshiradimi?", answer: "Internet tekshiruvi yoqilganda Tavily manbalarni topadi, Gemini esa da’volarni topilgan parchalar bilan solishtiradi va havolalarni ko‘rsatadi. Muhim manbalarni baribir ochib, kontekstini tekshiring." },
        { question: "O‘zbek kirill yozuvi qo‘llab-quvvatlanadimi?", answer: "Ha. O‘zbekcha matn lotin yoki kirill alifbosida bo‘lishi mumkin. Manba qidiruvi ikkala yozuvdagi so‘rovlarni qabul qiladi." },
        { question: "Matnim qayerda saqlanadi?", answer: "Tarix sukut bo‘yicha o‘chirilgan. Yoqilganda tekshiruvlar faqat shu brauzerning localStorage xotirasida 30 kun saqlanadi. Yuklangan fayl serverda saqlanmaydi." },
      ],
    },
    footer: {
      tagline: "Yangiliklarni ongli o‘qish uchun ta’limiy vosita.",
      navigation: "Pastki navigatsiya",
      check: "Matnni tekshirish",
    },
  },
  ru: {
    emptyResult: { description: "Введите текст или загрузите файл. Результат и найденные источники появятся здесь после проверки." },
    navigation: { main: "Основная навигация", mobile: "Мобильная навигация", how: "Как это работает", model: "О модели", faq: "Вопросы и ответы", feedback: "Обратная связь", openMenu: "Открыть меню", closeMenu: "Закрыть меню", language: "Выбрать язык" },
    hero: { eyebrow: "Анализ текстов на трёх языках", mobileTitleStart: "Проверьте текст", mobileTitleAccent: "на достоверность", desktopLine1: "Проверьте текст", desktopLine2: "на признаки недостоверной", desktopLine3: "информации", mobileDescription: "Проверяйте тексты на узбекском, русском и английском по интернет-источникам.", desktopDescription: "RuFact находит интернет-источники и сопоставляет с ними утверждения. Для русского и английского доступны отдельные статистические ML-модели.", imageAlt: "Редакционный коллаж с московской архитектурой и набережной", noteLeft: "Больше\nконтекста —\nменьше\nманипуляций", noteRight: "Проверяйте факты.\nДумайте критически.\nДелитесь ответственно." },
    analyzer: { region: "Проверка текста", heading: "Введите текст для проверки", clear: "Очистить", clearAria: "Очистить текст", inputLabel: "Текст для анализа", placeholder: "Вставьте новость, публикацию или утверждение…", upload: "Загрузить файл", uploading: "Читаем файл…", uploadAria: "Загрузить документ", fileTypes: "TXT, MD, CSV, JSON, PDF, DOCX · до 3 МБ", filePrivacy: "Файл не сохраняется на сервере", examples: "Попробуйте пример:", examplesAria: "Примеры текстов", internetTitle: "Проверка по интернет-источникам", internetOn: "Найдём источники и сопоставим с ними утверждения.", internetOff: "Включите поиск и проверку утверждений.", internetUnavailable: "Поиск не настроен; доступен русский и английский ML-анализ.", privacyShort: "Не отправляйте личные или конфиденциальные данные.", privacyLong: "Поисковый запрос передаётся Tavily, а текст и найденные фрагменты — Google. Не отправляйте личные или конфиденциальные данные.", terms: "Условия Google", submit: "Проверить текст", submitting: "Проверяем…", helper: "Узбекский (латиница/кириллица), русский и английский · до 5000 символов", helperDesktop: "Текст можно отредактировать перед проверкой.", required: "Введите текст, который нужно проверить.", serviceError: "Сервис временно недоступен. Текст не был сохранён — вы можете повторить запрос.", extracted: "текст извлечён", extractedEditable: "Его можно отредактировать перед проверкой.", extractedTruncated: "символов извлечено; загружены первые 5000. Проверьте и сократите текст перед анализом.", readError: "Не удалось прочитать файл.", languageNotice: "Обучены отдельные русская и английская ML-модели. Узбекской модели пока нет. При доступной проверке источников её вывод имеет приоритет." },
    result: { heading: "Результат анализа", demo: "Демо-анализ", model: "ML-модель", failed: "Не удалось выполнить анализ", retryHint: "Попробуйте ещё раз через несколько секунд.", retry: "Повторить", resultAria: "Результат", lowConfidence: "Неуверенный результат — особенно важна ручная проверка", fake: "Обнаружены признаки недостоверной информации", real: "Выраженные признаки недостоверности не обнаружены", confidence: "уверенность в ответе", why: "Почему так?", modelSignals: "Статистические признаки модели", textSignals: "Ключевые признаки в тексте", noSavedExplanation: "Подробное объяснение не сохранено в локальной истории. Повторите анализ, чтобы получить актуальные статистические признаки модели.", signalsUnavailable: "Статистические признаки доступны сразу после нового анализа и не являются доказательством истинности или ложности выделенных фраз.", disclaimer: "Результат — вероятностная оценка, а не окончательный вердикт. Проверяйте важные утверждения по надёжным первоисточникам.", sourceHow: "Как проверить источники", notChecked: "Не проверялись" },
    loading: { aria: "Идёт анализ текста", title: "Анализируем текст", description: "Анализируем языковые признаки, контекст и, если выбрано, интернет-источники.", wait: "Не закрывайте страницу — результат появится здесь сразу после завершения анализа.", sr: "Модель анализирует введённый текст. Пожалуйста, подождите." },
    examples: [
      { id: "news", label: "Новость", icon: "news", text: "По данным Росстата, опубликованным в официальном отчёте 18 сентября, объём розничной торговли за август вырос на 2,3% по сравнению с тем же месяцем прошлого года." },
      { id: "social", label: "Пост из соцсетей", icon: "social", text: "Срочно перешлите всем друзьям! Сегодня ночью банки якобы обновят систему, и карты тех, кто не подтвердит аккаунт по ссылке, заблокируют навсегда." },
      { id: "medical", label: "Медицинское утверждение", icon: "medical", text: "Учёные подтвердили, что регулярное употребление горячей воды натощак полностью очищает организм от токсинов и помогает быстро снижать вес без диет." },
      { id: "politics", label: "Политическое заявление", icon: "politics", text: "Пресс-служба Государственной Думы сообщила на официальном сайте, что законопроект прошёл первое чтение; окончательное решение ещё не принято." },
    ],
    faq: { title: "Коротко о главном", intro: "Ответы помогают не перепутать вероятностную подсказку с профессиональным фактчекингом.", items: [
      { question: "Что означает процент в результате?", answer: "Это уверенность модели в конкретном ответе, а не общая точность RuFact. Русская и английская модели оценены на разных тестах; их метрики приведены на странице о системе. Узбекская модель пока не обучена." },
      { question: "RuFact проверяет факты в интернете?", answer: "При включённой интернет-проверке Tavily находит источники, а Gemini сопоставляет утверждения с найденными фрагментами и показывает ссылки. Важные источники всё равно нужно открыть и проверить в контексте." },
      { question: "Поддерживается узбекская кириллица?", answer: "Да. Узбекский текст можно вводить как латиницей, так и кириллицей. Поиск источников принимает обе письменности." },
      { question: "Где хранится мой текст?", answer: "По умолчанию история выключена. После включения проверки хранятся только в localStorage этого браузера 30 дней. Загруженный файл на сервере не сохраняется." },
    ] },
    footer: { tagline: "Образовательный инструмент для осознанного чтения новостей.", navigation: "Навигация в подвале", check: "Проверить текст" },
  },
  en: {
    emptyResult: { description: "Enter text or upload a file. Your result and retrieved sources will appear here after checking." },
    navigation: { main: "Main navigation", mobile: "Mobile navigation", how: "How it works", model: "About the model", faq: "Questions and answers", feedback: "Feedback", openMenu: "Open menu", closeMenu: "Close menu", language: "Choose language" },
    hero: { eyebrow: "Analysis of texts in three languages", mobileTitleStart: "Check a text", mobileTitleAccent: "for reliability", desktopLine1: "Check a text", desktopLine2: "for signs of unreliable", desktopLine3: "information", mobileDescription: "Check Uzbek, Russian, and English texts against internet sources.", desktopDescription: "RuFact finds internet sources and compares claims against them. Separate statistical ML models are available for Russian and English.", imageAlt: "Editorial collage featuring Moscow architecture and an embankment", noteLeft: "More\ncontext —\nless\nmanipulation", noteRight: "Check facts.\nThink critically.\nShare responsibly." },
    analyzer: { region: "Text check", heading: "Enter text to check", clear: "Clear", clearAria: "Clear text", inputLabel: "Text to analyse", placeholder: "Paste a news item, post, or claim…", upload: "Upload file", uploading: "Reading file…", uploadAria: "Upload document", fileTypes: "TXT, MD, CSV, JSON, PDF, DOCX · up to 3 MB", filePrivacy: "The file is not stored on the server", examples: "Try an example:", examplesAria: "Text examples", internetTitle: "Check against internet sources", internetOn: "We’ll find sources and compare the claims against them.", internetOff: "Enable source search and claim verification.", internetUnavailable: "Search is not configured; Russian and English ML analysis remain available.", privacyShort: "Do not send personal or confidential information.", privacyLong: "The search query is sent to Tavily; the text and retrieved snippets are sent to Google. Do not send personal or confidential information.", terms: "Google terms", submit: "Check text", submitting: "Checking…", helper: "Uzbek (Latin/Cyrillic), Russian, and English · up to 5,000 characters", helperDesktop: "You can edit the text before checking.", required: "Enter the text you want to check.", serviceError: "The service is temporarily unavailable. The text was not saved — you can try again.", extracted: "text extracted", extractedEditable: "You can edit it before checking.", extractedTruncated: "characters extracted; the first 5,000 were loaded. Review and shorten the text before analysis.", readError: "Could not read the file.", languageNotice: "Separate Russian and English statistical models are trained. Uzbek has no trained model yet. When source review is available, its conclusion takes precedence." },
    result: { heading: "Analysis result", demo: "Demo analysis", model: "ML model", failed: "Analysis could not be completed", retryHint: "Try again in a few seconds.", retry: "Try again", resultAria: "Result", lowConfidence: "Low-confidence result — manual verification is especially important", fake: "Signs of unreliable information were detected", real: "No strong signs of unreliability were detected", confidence: "confidence in this answer", why: "Why?", modelSignals: "Statistical model signals", textSignals: "Key signals in the text", noSavedExplanation: "The detailed explanation was not stored in local history. Run the analysis again to get current statistical signals.", signalsUnavailable: "Statistical signals appear after a new analysis and do not prove that highlighted phrases are true or false.", disclaimer: "This is a probabilistic assessment, not a final verdict. Verify important claims using reliable primary sources.", sourceHow: "How to verify sources", notChecked: "Not checked" },
    loading: { aria: "Text analysis in progress", title: "Analysing text", description: "Analysing language signals, context and, when selected, internet sources.", wait: "Keep this page open — the result will appear here as soon as the analysis finishes.", sr: "The entered text is being analysed. Please wait." },
    examples: [
      { id: "news", label: "News", icon: "news", text: "According to the national statistics office’s report published on September 18, retail trade volume increased by 2.3% year over year in August." },
      { id: "social", label: "Social post", icon: "social", text: "Forward this urgently to everyone! Banks will update their systems tonight and permanently block cards belonging to anyone who does not confirm their account using the link in the message." },
      { id: "medical", label: "Medical claim", icon: "medical", text: "Scientists have proven that drinking hot water on an empty stomach completely removes toxins and causes rapid weight loss without diet or exercise." },
      { id: "politics", label: "Political statement", icon: "politics", text: "The parliament’s press office reported on its official website that the bill passed its first reading; a final decision has not yet been made." },
    ],
    faq: { title: "The essentials", intro: "Answers that keep a probabilistic hint separate from professional fact-checking.", items: [
      { question: "What does the percentage mean?", answer: "It is the model’s confidence in this particular answer, not RuFact’s overall accuracy. Russian and English model metrics use separate tests and are listed on the model-info page. No Uzbek statistical model is trained yet." },
      { question: "Does RuFact check facts online?", answer: "When internet verification is enabled, Tavily finds sources and Gemini compares claims with retrieved passages and displays links. You should still open important sources and check their context." },
      { question: "Is Uzbek Cyrillic supported?", answer: "Yes. Uzbek text may be entered in either Latin or Cyrillic script. Source search accepts both scripts." },
      { question: "Where is my text stored?", answer: "History is off by default. When enabled, checks are stored only in this browser’s localStorage for 30 days. Uploaded files are not stored on the server." },
    ] },
    footer: { tagline: "An educational tool for more thoughtful news reading.", navigation: "Footer navigation", check: "Check text" },
  },
} as const;

export function getTranslations(locale: AppLocale) {
  return translations[locale];
}

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && SUPPORTED_LOCALES.includes(value as AppLocale);
}
