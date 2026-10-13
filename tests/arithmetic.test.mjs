import assert from "node:assert/strict";
import test from "node:test";

import { arithmeticExplanation, evaluateArithmeticClaim } from "../lib/arithmetic.ts";

test("verifies the exact user examples and provides the false equation's correction", () => {
  assert.deepEqual(evaluateArithmeticClaim("2+2=4"), {
    expression: "2+2=4", left: "2+2", right: "4", leftValue: "4", rightValue: "4", correct: true, correction: null,
  });
  assert.deepEqual(evaluateArithmeticClaim(" 2 + 2 = 5 "), {
    expression: "2 + 2 = 5", left: "2 + 2", right: "5", leftValue: "4", rightValue: "5", correct: false, correction: "2 + 2 = 4",
  });
});

test("uses normal precedence, left associativity, parentheses and unary signs", () => {
  for (const equation of [
    "2+3*4=14", "(2+3)*4=20", "12/3/2=2", "12-3-2=7",
    "-2 * -3=6", "2--3=5", "-(2+3)=-5", "+(2 + 3)=5", "-0=0", "1-2=-1", "0=0",
  ]) {
    assert.equal(evaluateArithmeticClaim(equation)?.correct, true, equation);
  }
  assert.equal(evaluateArithmeticClaim("2+3*4=20")?.correct, false);
  assert.equal(evaluateArithmeticClaim("12/3/2=8")?.correct, false);
});

test("decimal arithmetic is exact rather than floating-point approximation", () => {
  for (const equation of [
    "0.1+0.2=0.3", "0.1*0.2=0.02", "1.5/0.5=3", ".5+.25=.75",
    "2.=2.0", "0002.00=2", "0.00000000001 * 10=0.0000000001", "-0.125=-1/8",
  ]) {
    assert.equal(evaluateArithmeticClaim(equation)?.correct, true, equation);
  }
  assert.deepEqual(
    [evaluateArithmeticClaim("0.1+0.2=0.4")?.leftValue, evaluateArithmeticClaim("-1/8=0")?.leftValue],
    ["0.3", "-0.125"],
  );
});

test("compares reduced rational numbers exactly and never rounds recurring fractions", () => {
  for (const equation of ["1/3=2/6", "1/3+1/6=1/2", "1/3*3=1", "(-2)/6=-1/3", "2/(3/4)=8/3"]) {
    assert.equal(evaluateArithmeticClaim(equation)?.correct, true, equation);
  }
  assert.equal(evaluateArithmeticClaim("1/3=0.33333333333")?.correct, false);
  assert.equal(evaluateArithmeticClaim("1/3=0")?.leftValue, "1/3");
  assert.equal(evaluateArithmeticClaim("-1/3=0")?.leftValue, "-1/3");
  assert.equal(evaluateArithmeticClaim("1/3=0")?.correction, "1/3 = 1/3");
});

test("normalizes only the supported Unicode operators and full-width syntax, preserving original wording", () => {
  for (const equation of ["２＋２＝４", "3 × 4 = 12", "12 ÷ 3 = 4", "−2+3=1", "（２＋３）＊４＝２０", "１．５／０．５＝３"]) {
    assert.equal(evaluateArithmeticClaim(equation)?.correct, true, equation);
  }
  const result = evaluateArithmeticClaim("２＋２＝５");
  assert.equal(result.left, "２＋２");
  assert.equal(result.right, "５");
  assert.equal(result.expression, "２＋２＝５");
  assert.equal(result.correction, "２＋２ = 4");
  for (const unsupported of ["²+²=⁴", "½+½=1", "2•2=4", "2∗2=4", "٢+٢=٤", "2≠3"]) {
    assert.equal(evaluateArithmeticClaim(unsupported), null, unsupported);
  }
});

test("rejects invalid or undefined mathematics rather than inventing a verdict", () => {
  for (const equation of [
    "1/0=0", "0/0=1", "1/(2-2)=1", "1=2/0", "=4", "2=", "2+2", "2+2==4", "2=2=2",
    "2+*2=4", "2***2=4", "2**2=4", "2^2=4", "2%=0.02", "2(2)=4", "(2)(2)=4",
    "(2+2=4", "2+2)=4", "()=0", "2..1=2", ".=0", "1 2=12", "1\n2=12", "1e2=100",
    "NaN=NaN", "Infinity=Infinity", "0x10=16", "1,000=1000", "1,5=1.5", "2+=4",
  ]) {
    assert.equal(evaluateArithmeticClaim(equation), null, equation);
  }
});

test("does not extract arithmetic from prose, mixed claims, dates, URLs or executable text", () => {
  for (const text of [
    "2+2=4 is true", "Is 2+2=4?", "2+2=4. Samarkand is the capital.", "2+2=4\n2+2=5", "2+2=4; 3+3=6",
    "2026-10-13", "https://example.com/2+2=4", "2+2=4 // comment", "2+2=4 /* comment */",
    "process.exit()=0", "console.log(1)=1", "(()=>4)()=4", "2+2=4 && true", "2+2=4;alert(1)",
    "2 + 2 равно 4", "2 + 2 teng 4", "", "   ", "<script>2+2=4</script>",
  ]) {
    assert.equal(evaluateArithmeticClaim(text), null, text);
  }
  assert.equal(evaluateArithmeticClaim(null), null);
  assert.equal(evaluateArithmeticClaim(123), null);
});

test("enforces literal, input, operation and recursion limits on both sides", () => {
  assert.equal(evaluateArithmeticClaim("999999999999=999999999999")?.correct, true);
  assert.equal(evaluateArithmeticClaim("1000000000000=1000000000000"), null);
  assert.equal(evaluateArithmeticClaim("0.000000000001=0"), null);
  assert.equal(evaluateArithmeticClaim(`${" ".repeat(196)}1=1`)?.correct, true);
  assert.equal(evaluateArithmeticClaim(`${" ".repeat(198)}1=1`), null);
  assert.equal(evaluateArithmeticClaim(`${Array(33).fill("1").join("+")}=33`)?.correct, true);
  assert.equal(evaluateArithmeticClaim(`${Array(34).fill("1").join("+")}=34`), null);
  assert.equal(evaluateArithmeticClaim(`${Array(18).fill("1").join("+")}=${Array(18).fill("1").join("+")}`), null);
  assert.equal(evaluateArithmeticClaim(`${"(".repeat(16)}1${")".repeat(16)}=1`)?.correct, true);
  assert.equal(evaluateArithmeticClaim(`${"(".repeat(17)}1${")".repeat(17)}=1`), null);
  assert.equal(evaluateArithmeticClaim(`${"-".repeat(16)}1=1`)?.correct, true);
  assert.equal(evaluateArithmeticClaim(`${"-".repeat(17)}1=-1`), null);
  // The strict character/literal budgets also bound every BigInt operation.
  assert.equal(evaluateArithmeticClaim(`${"9".repeat(190)}=0`), null);
});

test("displays terminating values canonically, and long terminating values as exact fractions", () => {
  assert.equal(evaluateArithmeticClaim("1/40=0")?.leftValue, "0.025");
  assert.equal(evaluateArithmeticClaim("-1/40=0")?.leftValue, "-0.025");
  assert.equal(evaluateArithmeticClaim("0/3=0")?.leftValue, "0");
  const longDivision = `${Array(10).fill("100000000000").join("/")}`;
  const result = evaluateArithmeticClaim(`1/(${longDivision})=0`);
  // Left-associative division here is an integer, not a rounded decimal.
  assert.equal(result?.leftValue, "1" + "0".repeat(88));
  const tiny = evaluateArithmeticClaim(`1/(${Array(10).fill("100000000000").join("*")})=0`);
  assert.equal(tiny?.leftValue, `1/${"1" + "0".repeat(110)}`);
});

test("explains correct and incorrect equations in English, Russian and Uzbek without probability claims", () => {
  const correct = evaluateArithmeticClaim("2+2=4");
  const incorrect = evaluateArithmeticClaim("2+2=5");
  const expected = {
    en: ["Both sides are equal", "The sides are not equal"],
    ru: ["Обе стороны равны", "Стороны не равны"],
    uz: ["Ikki tomon teng:", "Ikki tomon teng emas"],
  };
  for (const [locale, phrases] of Object.entries(expected)) {
    const positive = arithmeticExplanation(correct, locale);
    const negative = arithmeticExplanation(incorrect, locale);
    assert.ok(positive.includes(phrases[0]), positive);
    assert.ok(negative.includes(phrases[1]), negative);
    assert.ok(negative.includes("2+2") && negative.includes("4") && negative.includes("5"));
    assert.doesNotMatch(`${positive} ${negative}`, /%|confidence|probability|вероятност|ehtimol/iu);
  }
});
