// Verse references in Persian text: finding them (for "cited in" lists on
// each verse page) and turning them into links (in translation notes).
//
// Forms used in the notes and posts:
//   آیهٔ ۴۶ سورهٔ بقره · آیه ۳۷ این سوره · آیهٔ ششم سورهٔ حمد · آیات ۳ تا ۵ سورهٔ نساء
//   (انعام، ۱۰۸) · (انعام: ۱۰۸) · انعام/۱۰۸
// "this surah" (همین/این سوره) needs the surah the text belongs to.

import surahsJson from '../data/quran/surahs.json';
import faTranslation from '../data/quran/fa.json';
import { toAsciiDigits } from './text';

export interface VerseRef {
  surah: number;
  ayah: number;
  /** Last verse of a range ("آیات ۳ تا ۵") */
  to?: number;
}

const SURAHS = surahsJson as { n: number; fa: string; ayahs: number }[];
const TRANSLATED = (faTranslation as { surahs: Record<string, Record<string, unknown>> }).surahs;

/** Surah names as written in Persian, with the usual alternatives. */
const NAMES = new Map<string, number>();
for (const s of SURAHS) NAMES.set(s.fa, s.n);
for (const [alias, n] of [
  ['حمد', 1], ['فاتحه', 1], ['فاتحة', 1], ['فاتحه الکتاب', 1], ['آل‌عمران', 3], ['برائت', 9], ['برائة', 9],
  ['اسراء', 17], ['بنی اسرائیل', 17], ['مؤمن', 40], ['دهر', 76], ['انسان', 76],
] as const)
  NAMES.set(alias, n);

const fold = (s: string) => s.replace(/[‌\s]+/g, ' ').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[ةۀ]/g, 'ه').trim();
const BY_FOLDED = new Map([...NAMES].map(([k, v]) => [fold(k), v]));
// Longest first, so "آل عمران" wins over a shorter name inside it; spaces and ZWNJ interchangeable.
const NAME_RE = [...NAMES.keys()]
  .sort((a, b) => b.length - a.length)
  .map((k) => k.replace(/[‌ ]/g, '[\\u200c ]?').replace(/[هةۀ]$/, '[هةۀ]'))
  .join('|');

const ORDINALS = ['اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم', 'هفتم', 'هشتم', 'نهم', 'دهم', 'یازدهم', 'دوازدهم', 'سیزدهم', 'چهاردهم', 'پانزدهم', 'شانزدهم', 'هفدهم', 'هجدهم', 'نوزدهم', 'بیستم'];
const NUM = `[0-9۰-۹٠-٩]{1,3}|${ORDINALS.join('|')}|نخست`;
const toNum = (s: string) => (s === 'نخست' ? 1 : ORDINALS.includes(s) ? ORDINALS.indexOf(s) + 1 : Number(toAsciiDigits(s)));

// آیهٔ ۴۶ سورهٔ بقره · آیات ۳ تا ۵ همین سوره · آیه ۷ این سوره
const PHRASE = new RegExp(
  `(?:آیه[\\u200c]?[ٔیه]?|آیات)\\s+(${NUM})(?:\\s*(?:تا|و|-|–)\\s*(${NUM}))?\\s+(?:(همین|این)\\s+سوره|سوره[\\u200c]?[ٔی]?\\s+(${NAME_RE}))(?![\\p{L}])`,
  'gu',
);
// (انعام، ۱۰۸) · (انعام: ۱۰۸) · انعام/۱۰۸
const SHORT = new RegExp(`(?<![\\p{L}])(${NAME_RE})\\s*(?:[،,:]\\s*|\\/\\s*)([0-9۰-۹]{1,3})(?:\\s*[-–]\\s*([0-9۰-۹]{1,3}))?(?![0-9۰-۹])`, 'gu');

function valid(surah: number | undefined, ayah: number, to?: number): VerseRef | undefined {
  const s = surah ? SURAHS[surah - 1] : undefined;
  if (!s || ayah < 1 || ayah > s.ayahs) return undefined;
  return { surah: s.n, ayah, ...(to && to > ayah && to <= s.ayahs ? { to } : {}) };
}

interface Match {
  start: number;
  end: number;
  ref: VerseRef;
}

/** Every verse reference in `text`, in order. `surah` resolves "this surah". */
export function findRefs(text: string, surah?: number): Match[] {
  const out: Match[] = [];
  for (const m of text.matchAll(PHRASE)) {
    const n = m[3] ? surah : BY_FOLDED.get(fold(m[4] ?? ''));
    const ref = valid(n, toNum(m[1]), m[2] ? toNum(m[2]) : undefined);
    if (ref) out.push({ start: m.index!, end: m.index! + m[0].length, ref });
  }
  for (const m of text.matchAll(SHORT)) {
    if (out.some((o) => m.index! < o.end && m.index! + m[0].length > o.start)) continue;
    const ref = valid(BY_FOLDED.get(fold(m[1])), toNum(m[2]), m[3] ? toNum(m[3]) : undefined);
    if (ref) out.push({ start: m.index!, end: m.index! + m[0].length, ref });
  }
  return out.sort((a, b) => a.start - b.start);
}

export const citedVerses = (text: string, surah?: number) => findRefs(text, surah).map((m) => m.ref);

export const isTranslated = (surah: number, ayah: number) => !!TRANSLATED[surah]?.[ayah];

/** The verse's own page when it is translated, else its place on the surah page. */
export const verseHref = (r: { surah: number; ayah: number }) =>
  isTranslated(r.surah, r.ayah) ? `/fa/quran/${r.surah}/${r.ayah}/` : `/fa/quran/${r.surah}/#a${r.ayah}`;

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ESC[c]);

/**
 * A translation note as HTML: verse references become links to the verse,
 * markdown links and bare URLs become links, and links to the channel's
 * posts point at the copy on this site when there is one.
 */
export function richNote(text: string, surah: number, localPost: (id: string) => string | undefined): string {
  const link = (url: string, label: string) => {
    const post = url.match(/^https?:\/\/t\.me\/hamidhossaini\/(\d+)/)?.[1];
    const local = post ? localPost(post) : undefined;
    return local ? `<a href="${local}">${label}</a>` : `<a href="${esc(url)}" rel="noopener" target="_blank">${label}</a>`;
  };
  const withRefs = (plain: string) => {
    let html = '';
    let at = 0;
    for (const m of findRefs(plain, surah)) {
      html += linkUrls(plain.slice(at, m.start)) + `<a href="${verseHref(m.ref)}">${esc(plain.slice(m.start, m.end))}</a>`;
      // "(https://t.me/…)" right after the reference adds nothing once the reference is a link.
      const echo = plain.slice(m.end).match(/^\s*\(https?:\/\/t\.me\/hamidhossaini\/\d+\/?\)/);
      at = m.end + (echo?.[0].length ?? 0);
    }
    return html + linkUrls(plain.slice(at));
  };
  const linkUrls = (plain: string) => {
    let html = '';
    let at = 0;
    for (const m of plain.matchAll(/\(?(https?:\/\/[^\s)]+)\)?/g)) {
      html += esc(plain.slice(at, m.index));
      const label = /t\.me\/hamidhossaini\//.test(m[1]) ? '↗' : esc(m[1]);
      html += ` ${link(m[1], label)}`;
      at = m.index! + m[0].length;
    }
    return html + esc(plain.slice(at));
  };

  // Markdown links first: [label](url). A label that names a verse links to the verse.
  let html = '';
  let at = 0;
  for (const m of text.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)) {
    html += withRefs(text.slice(at, m.index));
    const refs = findRefs(m[1], surah);
    html += refs.length === 1 ? `<a href="${verseHref(refs[0].ref)}">${esc(m[1])}</a>` : link(m[2], esc(m[1]));
    at = m.index! + m[0].length;
  }
  return (html + withRefs(text.slice(at))).replace(/\s+(?=[.،؛:)])/g, '');
}
