import type { AppLocale } from "./i18n.ts";

/** Only a complete, bounded arithmetic equation is eligible for this checker. */
export interface ArithmeticClaimResult {
  expression: string;
  left: string;
  right: string;
  leftValue: string;
  rightValue: string;
  correct: boolean;
  correction: string | null;
}

export const arithmeticCopy = {
  en: {
    title: "Arithmetic check",
    correct: "Correct equation",
    incorrect: "Incorrect equation",
    original: "Your equation",
    correction: "Correct equation",
    why: "Why",
    note: "Exact calculation. No web search or AI model was used.",
    scope: "This result checks only this equation, not other factual claims.",
  },
  ru: {
    title: "Арифметическая проверка",
    correct: "Верное равенство",
    incorrect: "Неверное равенство",
    original: "Ваше равенство",
    correction: "Верное равенство",
    why: "Почему",
    note: "Точный расчёт. Интернет-поиск и AI-модель не использовались.",
    scope: "Результат проверяет только это равенство, а не другие фактические утверждения.",
  },
  uz: {
    title: "Arifmetik tekshiruv",
    correct: "To‘g‘ri tenglik",
    incorrect: "Noto‘g‘ri tenglik",
    original: "Sizning tengligingiz",
    correction: "To‘g‘ri tenglik",
    why: "Nega",
    note: "Aniq hisob-kitob. Internet qidiruvi va AI modeli ishlatilmadi.",
    scope: "Bu natija faqat shu tenglikni tekshiradi, boshqa faktlarga oid da’volarni emas.",
  },
} satisfies Record<AppLocale, Record<string, string>>;

interface Rational {
  numerator: bigint;
  denominator: bigint;
}

const MAX_INPUT_LENGTH = 200;
const MAX_LITERAL_DIGITS = 12;
const MAX_OPERATIONS = 32;
const MAX_DEPTH = 16;
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const FIVE = BigInt(5);
const TEN = BigInt(10);
const MAX_INTEGER = TEN ** BigInt(256) - ONE;
const MAX_DECIMAL_PLACES = 100;

class InvalidArithmetic extends Error {}

function absolute(value: bigint): bigint {
  return value < ZERO ? -value : value;
}

function gcd(left: bigint, right: bigint): bigint {
  let a = absolute(left);
  let b = absolute(right);
  while (b !== ZERO) {
    [a, b] = [b, a % b];
  }
  return a;
}

function rational(numerator: bigint, denominator = ONE): Rational {
  // Check intermediate values too, before reduction or further arithmetic.
  if (denominator === ZERO || absolute(numerator) > MAX_INTEGER || absolute(denominator) > MAX_INTEGER) {
    throw new InvalidArithmetic();
  }
  if (denominator < ZERO) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

interface ParseBudget {
  operations: number;
}

/** A recursive-descent parser; user input is never executed as JavaScript. */
class ArithmeticParser {
  private position = 0;
  private readonly input: string;
  private readonly budget: ParseBudget;

  constructor(input: string, budget: ParseBudget) {
    this.input = input;
    this.budget = budget;
  }

  parse(): Rational {
    const result = this.sum(0);
    this.skipWhitespace();
    if (this.position !== this.input.length) throw new InvalidArithmetic();
    return result;
  }

  private skipWhitespace(): void {
    while (this.position < this.input.length && /\s/u.test(this.input[this.position])) {
      this.position++;
    }
  }

  private take(character: string): boolean {
    this.skipWhitespace();
    if (this.input[this.position] !== character) return false;
    this.position++;
    return true;
  }

  private operation(): void {
    if (++this.budget.operations > MAX_OPERATIONS) throw new InvalidArithmetic();
  }

  private sum(depth: number): Rational {
    let value = this.product(depth);
    while (true) {
      if (this.take("+")) {
        this.operation();
        const next = this.product(depth);
        value = rational(
          value.numerator * next.denominator + next.numerator * value.denominator,
          value.denominator * next.denominator,
        );
      } else if (this.take("-")) {
        this.operation();
        const next = this.product(depth);
        value = rational(
          value.numerator * next.denominator - next.numerator * value.denominator,
          value.denominator * next.denominator,
        );
      } else {
        return value;
      }
    }
  }

  private product(depth: number): Rational {
    let value = this.unary(depth);
    while (true) {
      if (this.take("*")) {
        this.operation();
        const next = this.unary(depth);
        value = rational(value.numerator * next.numerator, value.denominator * next.denominator);
      } else if (this.take("/")) {
        this.operation();
        const next = this.unary(depth);
        value = rational(value.numerator * next.denominator, value.denominator * next.numerator);
      } else {
        return value;
      }
    }
  }

  private unary(depth: number): Rational {
    if (depth > MAX_DEPTH) throw new InvalidArithmetic();
    if (this.take("+")) {
      this.operation();
      return this.unary(depth + 1);
    }
    if (this.take("-")) {
      this.operation();
      const value = this.unary(depth + 1);
      return rational(-value.numerator, value.denominator);
    }
    if (this.take("(")) {
      if (depth === MAX_DEPTH) throw new InvalidArithmetic();
      const value = this.sum(depth + 1);
      if (!this.take(")")) throw new InvalidArithmetic();
      return value;
    }
    return this.number();
  }

  private number(): Rational {
    this.skipWhitespace();
    const match = /^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)/u.exec(this.input.slice(this.position));
    if (!match) throw new InvalidArithmetic();
    const literal = match[0];
    const digits = literal.replace(".", "");
    if (digits.length > MAX_LITERAL_DIGITS) throw new InvalidArithmetic();
    this.position += literal.length;
    const fractionLength = literal.includes(".") ? literal.length - literal.indexOf(".") - 1 : 0;
    return rational(BigInt(digits), TEN ** BigInt(fractionLength));
  }
}

function formatRational(value: Rational): string {
  if (value.denominator === ONE) return value.numerator.toString();
  let remainder = value.denominator;
  let twos = 0;
  let fives = 0;
  while (remainder % TWO === ZERO) {
    remainder /= TWO;
    twos++;
  }
  while (remainder % FIVE === ZERO) {
    remainder /= FIVE;
    fives++;
  }
  const places = Math.max(twos, fives);
  if (remainder !== ONE || places > MAX_DECIMAL_PLACES) {
    return `${value.numerator}/${value.denominator}`;
  }
  const scaled = absolute(value.numerator) * (TEN ** BigInt(places) / value.denominator);
  const digits = scaled.toString().padStart(places + 1, "0");
  const sign = value.numerator < ZERO ? "-" : "";
  return `${sign}${digits.slice(0, -places)}.${digits.slice(-places)}`;
}

export function evaluateArithmeticClaim(text: string): ArithmeticClaimResult | null {
  if (typeof text !== "string" || text.length > MAX_INPUT_LENGTH) return null;
  const expression = text.trim();
  // Restrict the original alphabet as well as the normalized form. This avoids
  // turning superscripts, fractions, prose or executable text into arithmetic.
  if (!expression || !/^[0-9０-９.．+＋\-－*＊/／()（）=＝×÷−\s]+$/u.test(expression)) return null;
  const sides = expression.split(/[=＝]/u);
  if (sides.length !== 2 || sides.some(side => !side.trim())) return null;
  const [left, right] = sides.map(side => side.trim());
  const normalized = sides.map(side => side.normalize("NFKC").replaceAll("×", "*").replaceAll("÷", "/").replaceAll("−", "-"));

  try {
    const budget = { operations: 0 };
    const leftResult = new ArithmeticParser(normalized[0], budget).parse();
    const rightResult = new ArithmeticParser(normalized[1], budget).parse();
    const correct = leftResult.numerator === rightResult.numerator && leftResult.denominator === rightResult.denominator;
    const leftValue = formatRational(leftResult);
    return {
      expression,
      left,
      right,
      leftValue,
      rightValue: formatRational(rightResult),
      correct,
      correction: correct ? null : `${left} = ${leftValue}`,
    };
  } catch (error) {
    if (error instanceof InvalidArithmetic) return null;
    throw error;
  }
}

export function arithmeticExplanation(result: ArithmeticClaimResult, locale: AppLocale): string {
  const { left, right, leftValue, rightValue, correct } = result;
  if (locale === "ru") {
    return `${left} даёт ${leftValue}, а ${right} даёт ${rightValue}. ${correct ? "Обе стороны равны: равенство верно." : "Стороны не равны: равенство неверно."}`;
  }
  if (locale === "uz") {
    return `${left} natijasi ${leftValue}, ${right} natijasi esa ${rightValue}. ${correct ? "Ikki tomon teng: tenglik to‘g‘ri." : "Ikki tomon teng emas: tenglik noto‘g‘ri."}`;
  }
  return `${left} evaluates to ${leftValue}, and ${right} evaluates to ${rightValue}. ${correct ? "Both sides are equal: the equation is correct." : "The sides are not equal: the equation is incorrect."}`;
}
