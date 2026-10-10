// Text folding shared by the index builder (scripts/search) and the browser.
// Both sides must fold identically, so a reader typing Persian on an Arabic
// keyboard, or a Quran word without its vowel marks, still finds the text.
//
// Folding is done one character at a time so the browser can map a match in
// the folded text back to the original characters for highlighting.

const MAP: Record<string, string> = {
  // Alef forms
  'ٱ': 'ا', 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٲ': 'ا', 'ٳ': 'ا',
  // Yeh / kaf: Arabic and Persian code points
  'ي': 'ی', 'ى': 'ی', 'ئ': 'ی', 'ې': 'ی', 'ے': 'ی',
  'ك': 'ک', 'ڪ': 'ک',
  // Teh marbuta, heh with hamza, waw with hamza
  'ة': 'ه', 'ۀ': 'ه', 'ە': 'ه', 'ؤ': 'و',
  // Urdu heh forms and yeh barree with hamza: بقرہ finds بقره
  'ہ': 'ه', 'ۂ': 'ه', 'ۃ': 'ه', 'ھ': 'ه', 'ۓ': 'ی',
  // Bare hamza adds nothing to a search
  'ء': '',
};

/** Arabic harakat, Quranic annotation marks, tatweel, joiners and direction marks. */
const DROP = /[ؐ-ًؚ-ٟۖ-ۭـ​-‏‪-‮⁦-⁩﻿]/;
const DAGGER = 'ٰ';

/**
 * Fold one character. `prev` is the previous original character, used for the
 * Quranic dagger alef: dropped in the plain form (رحمٰن → رحمن), read as an
 * alef in the `alef` form (كتٰب → کتاب, صلوٰة → صلاه).
 */
function fold(ch: string, prev: string, alef: boolean): string {
  if (ch === DAGGER) {
    if (!alef) return '';
    if (prev === 'ى' || prev === 'ي' || prev === 'ی') return '';
    return 'ا';
  }
  if (DROP.test(ch)) return '';
  const code = ch.charCodeAt(0);
  if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
  if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
  if (ch in MAP) return MAP[ch];
  if (code < 0x80) return ch.toLowerCase();
  // Latin letters with diacritics (ș, ă, î, é…): strip the combining marks.
  return ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export interface Folded {
  text: string;
  /** For each folded character, the index of the original character it came from. */
  from: number[];
}

/** Fold text, keeping a map back to the original positions. */
export function foldMapped(input: string, alef = false): Folded {
  let text = '';
  const from: number[] = [];
  let prev = '';
  for (let i = 0; i < input.length; i++) {
    let ch = input[i];
    // Keep surrogate pairs (emoji) together.
    const c = input.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < input.length) ch = input.slice(i, i + 2);
    // In the alef form, a waw carrying a dagger alef reads as an alef (صلوٰة).
    let out: string;
    if (alef && (ch === 'و') && input[i + 1] === DAGGER) out = 'ا';
    else if (alef && ch === DAGGER && prev === 'و') out = '';
    else out = fold(ch, prev, alef);
    for (const o of out) {
      text += o;
      from.push(i);
    }
    if (!DROP.test(ch)) prev = ch;
    i += ch.length - 1;
  }
  return { text, from };
}

export const normalize = (s: string, alef = false) => foldMapped(s, alef).text;

/** Collapse whitespace and punctuation so folded text tokenises cleanly. */
export const tidy = (s: string) =>
  s
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Text to put in the index: the folded form, plus the dagger-alef reading of
 * any word that differs (so both الرحمن and الکتاب match Uthmani spelling).
 */
export function indexText(s: string): string {
  const plain = tidy(normalize(s));
  if (!s.includes(DAGGER)) return plain;
  const plainWords = new Set(plain.split(' '));
  const extra = tidy(normalize(s, true))
    .split(' ')
    .filter((w) => w && !plainWords.has(w));
  return extra.length ? `${plain} ${[...new Set(extra)].join(' ')}` : plain;
}

/** Words of a query, folded the same way as the index. */
export function queryTerms(q: string): string[] {
  return tidy(normalize(q))
    .split(' ')
    .filter(Boolean);
}

/** File name of the vocabulary shard holding words that start like `w`. */
export function vocabKey(w: string): string | undefined {
  const chars = [...w];
  if (chars.length < 2) return undefined;
  return chars
    .slice(0, 2)
    .map((c) => c.codePointAt(0)!.toString(16))
    .join('-');
}
