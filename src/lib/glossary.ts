// Quranic glossary: the root analyses in the translation notes ("مادهٔ «ذمم»
// در اصل به‌معنی …"), gathered by root. A note that only points back to an
// earlier explanation ("… در ترجمهٔ آیهٔ ۳۴ سورهٔ بقره بیان شد") counts as a
// mention; the others are the definitions.

import { quranFa } from './data';
import { findRefs } from './quran-refs';

export interface RootEntry {
  root: string;
  /** Notes that explain the root, in Quran order */
  definitions: { surah: number; ayah: number; text: string }[];
  /** Verses whose notes refer back to an explanation */
  mentions: { surah: number; ayah: number }[];
}

const ROOT_RE = /ماده(?:ٔ|ی|‌ی)?\s*«([^»]{2,6})»/g;
const POINTER = /(گذشت|بیان شد|توضیح داده شد|اشاره شد|ذکر شد)/;
const fold = (s: string) => s.trim().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[ً-ْٰ]/g, '');

/** Hamza seats sort with alif. */
const sortKey = (s: string) => fold(s).replace(/[أإآٱ]/g, 'ا').replace(/[ؤ]/g, 'و').replace(/[ئ]/g, 'ی');
export const firstLetter = (e: RootEntry) => sortKey(e.root).charAt(0);

const BY_KEY = new Map<string, RootEntry>();
const order = Object.entries(quranFa.surahs).flatMap(([s, ayahs]) =>
  Object.entries(ayahs).map(([a, v]) => ({ surah: Number(s), ayah: Number(a), notes: v.notes ?? [] })),
);
order.sort((x, y) => x.surah - y.surah || x.ayah - y.ayah);
for (const { surah, ayah, notes } of order) {
  for (const text of notes) {
    const roots = [...new Set([...text.matchAll(ROOT_RE)].map((m) => m[1].trim()))];
    if (!roots.length) continue;
    const pointer = POINTER.test(text) && findRefs(text, surah).length > 0;
    for (const root of roots) {
      const key = fold(root);
      const entry = BY_KEY.get(key) ?? BY_KEY.set(key, { root, definitions: [], mentions: [] }).get(key)!;
      if (pointer) entry.mentions.push({ surah, ayah });
      else entry.definitions.push({ surah, ayah, text });
    }
  }
}

/** Roots with at least one explanation, in Arabic alphabetical order. */
export const ROOTS: RootEntry[] = [...BY_KEY.values()]
  .filter((e) => e.definitions.length)
  .sort((a, b) => sortKey(a.root).localeCompare(sortKey(b.root), 'ar'));

export const rootByKey = new Map(ROOTS.map((e) => [fold(e.root), e]));
export const rootHref = (root: string) => (rootByKey.has(fold(root)) ? `/fa/quran/roots/${encodeURIComponent(fold(root))}/` : undefined);
export const rootSlug = (e: RootEntry) => fold(e.root);

/** In note HTML, "مادهٔ «X»" links to the glossary entry for X. */
export function linkRoots(html: string, except?: string): string {
  return html.replace(/(ماده(?:ٔ|ی|‌ی)?\s*«)([^»<]{2,6})(»)/g, (m, a, root, b) => {
    const to = rootHref(root);
    return to && fold(root) !== except ? `${a}<a href="${to}">${root}</a>${b}` : m;
  });
}
