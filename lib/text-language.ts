/** Bounded routing heuristic for RuFact's supported input languages, not a universal detector. */
export type TextLanguage = "uz" | "ru" | "en" | "unknown";

const LATIN = /\p{Script=Latin}/u;
const CYRILLIC = /\p{Script=Cyrillic}/u;
const LETTER = /\p{L}/u;
const UZBEK_LETTERS = /[ўқғҳ]/gu;
const UZBEK_APOSTROPHE = /\b(?:o'|g'|bo'l|to'g'|ma'lumot|e'lon|ta'lim)[a-z]*/gu;
const uzbekLatin = new Set([
  "va", "bu", "uchun", "bilan", "ham", "emas", "bir", "deb", "bo'lgan", "shuningdek",
  "orqali", "yoki", "haqida", "uning", "ular", "edi", "bo'ladi", "tomonidan", "kerak",
  "mumkin", "toshkent", "poytaxti", "xabar", "matn", "axborot", "rost", "yolg'on", "yer", "tekis",
]);
const uzbekCyrillic = new Set([
  "ва", "бу", "учун", "билан", "ҳам", "эмас", "деб", "бўлган", "ўзбекистон", "орқали",
  "ёки", "ҳақида", "унинг", "улар", "эди", "бўлади", "томонидан", "тошкент", "пойтахти",
  "хабар", "матн", "ахборот", "рост", "ёлғон", "ер", "текис",
]);
const english = new Set([
  "the", "and", "is", "are", "was", "were", "of", "to", "in", "that", "for", "on", "with",
  "as", "by", "from", "this", "it", "has", "have", "will", "an", "be", "or", "not", "which", "who",
]);
const russian = new Set([
  "и", "в", "на", "что", "это", "как", "по", "из", "для", "не", "от", "но", "уже", "был",
  "она", "они", "который", "сообщил", "об", "статье", "говорится",
]);

export function detectTextLanguage(text: string): TextLanguage {
  // URLs have no useful linguistic content and can otherwise dominate a short claim.
  const normalized = text.slice(0, 5_000).normalize("NFKC").toLowerCase()
    .replace(/https?:\/\/\S+/gu, " ").replace(/[`´ʻʼ‘’]/gu, "'");
  let latin = 0;
  let cyrillic = 0;
  let letters = 0;
  for (const character of normalized) {
    if (!LETTER.test(character)) continue;
    letters += 1;
    if (LATIN.test(character)) latin += 1;
    else if (CYRILLIC.test(character)) cyrillic += 1;
  }
  if (letters < 3) return "unknown";
  const tokens = normalized.match(/\p{L}+(?:'\p{L}+)*/gu) ?? [];
  if (cyrillic / letters >= 0.6) {
    const uzScore = tokens.filter(token => uzbekCyrillic.has(token) || token.startsWith("ўзбекистон")).length;
    const ruScore = tokens.filter(token => russian.has(token)).length;
    const specialLetters = normalized.match(UZBEK_LETTERS)?.length ?? 0;
    if (ruScore >= 2 && ruScore > uzScore + 1) return "ru";
    if (specialLetters >= 2 || (specialLetters >= 1 && uzScore >= 1 && uzScore > ruScore) ||
        (uzScore >= 2 && uzScore > ruScore)) return "uz";
    return "ru";
  }
  if (latin / letters >= 0.6) {
    const uzScore = tokens.filter(token => uzbekLatin.has(token) || token.startsWith("o'zbekiston")).length;
    const enScore = tokens.filter(token => english.has(token)).length;
    const apostrophes = normalized.match(UZBEK_APOSTROPHE)?.length ?? 0;
    if (enScore >= 2 && enScore > uzScore + 1) return "en";
    if ((apostrophes >= 1 && uzScore >= 1 && uzScore > enScore) ||
        (uzScore >= 2 && uzScore > enScore)) return "uz";
    return "en";
  }
  return "unknown";
}
