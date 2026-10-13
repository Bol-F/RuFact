/** Harmless formatting equivalence only: never case-fold, reorder or rewrite words. */
function canonicalText(text: string) {
  return text.normalize("NFC").replace(/\s+/gu, " ").trim();
}

/** Map normalized characters back to the actual contiguous original passage. */
function canonicalSpan(text: string, needle: string): string | null {
  const characters: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  for (const { segment, index } of segmenter.segment(text)) {
    const end = index + segment.length;
    if (/^\s+$/u.test(segment)) {
      if (characters.at(-1) === " ") ends[ends.length - 1] = end;
      else { characters.push(" "); starts.push(index); ends.push(end); }
      continue;
    }
    const normalized = segment.normalize("NFC");
    for (let offset = 0; offset < normalized.length; offset += 1) {
      characters.push(normalized[offset]); starts.push(index); ends.push(end);
    }
  }
  const index = characters.join("").indexOf(needle);
  if (index < 0) return null;
  const restored = text.slice(starts[index], ends[index + needle.length - 1]);
  // A normalized substring must not cut through a grapheme and silently restore
  // extra combining marks or joined characters outside the requested passage.
  return canonicalText(restored) === needle ? restored : null;
}

function withoutTerminalPunctuation(text: string) {
  // A single sentence terminator can be omitted; ellipses and punctuation inside
  // a proposition are not rewritten. Returning original text keeps its meaning.
  return /[^.!?。！？][.!?。！？]$/u.test(text) ? text.slice(0, -1).trimEnd() : text;
}

/** Restore the literal submitted claim after benign whitespace/NFC differences. */
export function restoreClaimQuote(quote: string, sourceText: string, whole = false): string | null {
  const requested = canonicalText(quote);
  if (!requested) return null;
  if (whole) {
    const original = sourceText.trim();
    const canonical = canonicalText(original);
    return canonical === requested || withoutTerminalPunctuation(canonical) === requested ||
      canonical === withoutTerminalPunctuation(requested)
      ? original : null;
  }
  const literal = quote.trim();
  if (sourceText.includes(literal)) return literal;
  return canonicalSpan(sourceText, requested);
}

/** Semicolon/newline-separated propositions can legitimately produce several claims. */
export function isSingleShortStatement(text: string): boolean {
  const original = text.trim();
  return original.length <= 320 && !/[;；\r\n]/u.test(original) && !/[.!?。！？]\s+\S/u.test(original);
}

/** Newly allowed short semicolon/newline claims must not silently omit words. */
export function claimsCoverShortText(quotes: readonly string[], sourceText: string): boolean {
  const original = sourceText.trim();
  // Ordinary multi-sentence input may also contain instructions or non-claims;
  // coverage is assessed separately. This guard replaces the old whole-text
  // restriction only for short clause-separated inputs it previously rejected.
  if (original.length > 320 || /[.!?。！？]\s+\S/u.test(original)) return true;
  const covered = new Uint8Array(original.length);
  for (const quote of quotes) {
    const span = restoreClaimQuote(quote, original);
    if (!span) return false;
    const start = original.indexOf(span);
    covered.fill(1, start, start + span.length);
  }
  for (let index = 0; index < original.length; index += 1) {
    if (covered[index]) continue;
    const character = original[index];
    if (/[\s;；]/u.test(character)) continue;
    const terminator = /[.!?。！？]/u.test(character);
    if (terminator && (index === original.length - 1 || /[\s;；]/u.test(original[index + 1]))) continue;
    // Signs, decimal points and apostrophes are meaningful, not formatting gaps.
    return false;
  }
  return true;
}
