// The Quranic glossary, built from the translation notes by
// scripts/quran/glossary.ts (see there for how words and roots are found).
// Pages read the result here; nothing is worked out at build time.

import glossary from '../data/quran/glossary.json';
import redirectsJson from '../data/quran/glossary-redirects.json';
import { quranFa } from './data';
import { norm, rootSlugOf } from './arabic';

export interface GlossItem {
  s: number;
  a: number;
  /** Index of the note among the verse's notes */
  i: number;
  /** Words of this root the note explains, as written there */
  w: string[];
  /** core: the root's meaning · word: one word's meaning · ref: points to an explanation elsewhere */
  k: 'core' | 'word' | 'ref';
  /** The word's lemma in the corpus */
  lem?: string;
  /** For `ref`: the verse whose note has the explanation */
  to?: [number, number];
}

export interface RootEntry {
  root: string;
  slug: string;
  /** Occurrences in the Quran (Quranic Arabic Corpus) */
  count: number;
  /** Most frequent lemmas of the root, with occurrences */
  lemmas: [string, number][];
  lemmaCount: number;
  /** Translated verses with a word of this root, "s:a s:a …" */
  verses: string;
  items: GlossItem[];
}

const data = glossary as unknown as { roots: RootEntry[]; links: Record<string, Record<string, string>> };

/** Every root with at least one explanation, in Arabic alphabetical order. */
export const ROOTS: RootEntry[] = data.roots;
export const rootBySlug = new Map(ROOTS.map((e) => [e.slug, e]));
/** Slugs that moved (a corrected root), old → new. */
export const REDIRECTS = redirectsJson as Record<string, string>;

export const rootSlug = (e: RootEntry) => e.slug;
export const rootHref = (slug: string) => `/fa/quran/roots/${encodeURIComponent(slug)}/`;
/** Hamza seats sort and group with alif. */
export const firstLetter = (e: RootEntry) => e.root.charAt(0).replace(/[أإآ]/g, 'ا');

export const noteOf = (it: GlossItem) => quranFa.surahs[it.s][it.a].notes![it.i];
export const explanations = (e: RootEntry) => e.items.filter((x) => x.k !== 'ref');
export const furtherUses = (e: RootEntry) => e.items.filter((x) => x.k === 'ref');

/** By the root's letters, for "مادهٔ «X»" in notes the script did not tie to a verse. */
const bySpelling = new Map<string, string>();
for (const e of ROOTS) bySpelling.set(norm(e.root), e.slug);
for (const [from, to] of Object.entries(REDIRECTS)) if (!bySpelling.has(norm(from))) bySpelling.set(norm(from), to);

/**
 * In a note's HTML, each word the glossary explains («X») links to its root,
 * once per note; so does "مادهٔ «X»". Existing links are left alone. `except`
 * is the page's own root, which isn't linked to itself.
 */
export function linkRoots(html: string, at?: { surah: number; ayah: number; note: number }, except?: string): string {
  const words = at ? data.links[`${at.surah}:${at.ayah}:${at.note}`] ?? {} : {};
  const done = new Set<string>();
  return html
    .split(/(<a\b[^>]*>[\s\S]*?<\/a>)/)
    .map((part, i) =>
      i % 2
        ? part
        : part.replace(/(ماده(?:ٔ|ی|‌ی)?\s*)?«([^«»<]{2,40})»/g, (m, madde: string | undefined, word: string) => {
            const key = norm(word);
            const slug = words[key] ?? (madde ? bySpelling.get(key) ?? bySpelling.get(norm(rootSlugOf(word))) : undefined);
            if (!slug || slug === except || done.has(key)) return m;
            done.add(key);
            return `${madde ?? ''}«<a class="gloss-link" href="${rootHref(slug)}">${word}</a>»`;
          }),
    )
    .join('');
}

/** Wrap the headwords of a note in <mark> (on the root's own page). */
export function markWords(html: string, words: string[]): string {
  const keys = new Set(words.map(norm));
  if (!keys.size) return html;
  return html
    .split(/(<[^>]+>)/)
    .map((part) => (part.startsWith('<') ? part : part.replace(/«([^«»]{2,40})»/g, (m, w: string) => (keys.has(norm(w)) ? `«<mark>${w}</mark>»` : m))))
    .join('');
}
