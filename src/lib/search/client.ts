// Browser side of site search, shared by the header dialog and /search/.
// The index is built by scripts/search/build-index.ts; see that file for the
// record shapes. Queries are folded with the same rules as the index.

import surahList from '../../data/quran/surahs.json';
import { foldMapped, normalize, queryTerms, tidy, vocabKey } from './normalize';
import { DECOR } from '../text';

export const TYPES = ['quran', 'notes', 'videos', 'writings', 'pages'] as const;
export type SearchType = (typeof TYPES)[number];
export type Sort = 'relevance' | 'newest' | 'oldest';

/** UI strings, pre-rendered on the server; `{n}`, `{q}`, `{p}` are placeholders. */
export interface Labels {
  types: Record<SearchType, string>;
  results: string;
  resultsOne: string;
  verse: string;
  surah: string;
  verses: string;
  notTranslated: string;
  episode: string;
  on: string;
  work: Record<string, string>;
  sessions: string;
  minutes: string;
}

export interface Ctx {
  locale: string;
  intl: string;
  labels: Labels;
}

/* ---------- Loading Pagefind ---------- */

interface PFResult {
  id: string;
  score: number;
  data: () => Promise<PFData>;
}
export interface PFData {
  url: string;
  meta: Record<string, string>;
  filters: Record<string, string[]>;
}
interface PFSearch {
  results: PFResult[];
  filters: Record<string, Record<string, number>>;
  unfilteredResultCount: number;
}
interface Pagefind {
  init: () => Promise<void>;
  options: (o: Record<string, unknown>) => Promise<void>;
  search: (q: string | null, o?: Record<string, unknown>) => Promise<PFSearch>;
  preload: (q: string) => Promise<void>;
  filters: () => Promise<Record<string, Record<string, number>>>;
}

let loading: Promise<Pagefind> | undefined;
export function pagefind(): Promise<Pagefind> {
  const url = '/pagefind/pagefind.js';
  loading ??= import(/* @vite-ignore */ url).then(async (pf: Pagefind) => {
    // Short Arabic-only verses would otherwise outrank longer, translated ones.
    await pf.options({ excerptLength: 0, ranking: { pageLength: 0.35, termSaturation: 1.2 } });
    await pf.init();
    // Filter counts are only reported once the filter index is loaded.
    await pf.filters();
    return pf;
  });
  loading.catch(() => (loading = undefined));
  return loading;
}

/* ---------- Queries ---------- */

/** Fold a raw query for Pagefind, keeping quoted phrases as phrases. */
export function toQuery(raw: string): string {
  const parts: string[] = [];
  const re = /["“”«»]([^"“”«»]+)["“”«»]?|([^"“”«»]+)/g;
  for (const m of raw.matchAll(re)) {
    if (m[1]) {
      const phrase = tidy(normalize(m[1]));
      if (phrase) parts.push(`"${phrase}"`);
    } else if (m[2]) parts.push(...queryTerms(m[2]));
  }
  return parts.join(' ');
}

/** Words to highlight. */
export const termsOf = (raw: string) => queryTerms(raw.replace(/["“”«»]/g, ' '));

export interface Found {
  query: string;
  results: PFResult[];
  /** Hits per type, before the type filter */
  counts: Partial<Record<SearchType, number>>;
  total: number;
  /** A closer spelling, when some words of the query are not on the site */
  suggestion?: string;
}

/* ---------- Vocabulary: is a word on the site at all? ---------- */

// Pagefind loosens a word it cannot find (mercy → me…), which fills the list
// with unrelated results. The index ships every word, sharded by its first
// two characters, so the browser can check words first and suggest spellings.
// A missing shard (404) means no word starts that way; a network error
// yields null, and the word is then left to Pagefind unchecked.
const shards = new Map<string, Promise<Record<string, number> | null>>();
function shard(key: string) {
  if (!shards.has(key))
    shards.set(
      key,
      fetch(`/pagefind/vocab/${key}.json`)
        .then((r) => (r.ok ? r.json() : r.status === 404 ? {} : null))
        .catch(() => null)
        .then((v) => {
          if (v === null) shards.delete(key);
          return v;
        }),
    );
  return shards.get(key)!;
}

function distance(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Unknown words of the query, each with the closest common word (if any). */
async function check(terms: string[]): Promise<Map<string, string | undefined>> {
  const unknown = new Map<string, string | undefined>();
  await Promise.all(
    terms.map(async (term) => {
      const key = vocabKey(term);
      if (!key) return;
      const words = await shard(key);
      if (!words) return;
      const list = Object.keys(words);
      if (list.some((w) => w.startsWith(term))) return;
      const cap = [...term].length >= 6 ? 2 : 1;
      let best: string | undefined;
      let bestD = cap + 1;
      for (const w of list) {
        const d = distance(term, w, cap);
        if (d < bestD || (d === bestD && best && words[w] > words[best])) {
          best = w;
          bestD = d;
        }
      }
      unknown.set(term, bestD <= cap ? best : undefined);
    }),
  );
  return unknown;
}

export async function search(
  raw: string,
  opts: { type?: SearchType; lang?: string; sort?: Sort } = {},
): Promise<Found> {
  const pf = await pagefind();
  const query = toQuery(raw);
  if (!query) return { query, results: [], counts: {}, total: 0 };
  const terms = termsOf(raw);
  const unknown = await check(terms);
  if (unknown.size) {
    const fixable = [...unknown.values()].every(Boolean);
    const suggestion = fixable ? terms.map((t) => unknown.get(t) ?? t).join(' ') : undefined;
    return { query, results: [], counts: {}, total: 0, suggestion };
  }
  const base: Record<string, string> = {};
  if (opts.lang) base.lang = opts.lang;
  const sort = opts.sort === 'newest' ? { date: 'desc' } : opts.sort === 'oldest' ? { date: 'asc' } : undefined;
  const all = await pf.search(query, { filters: base, sort });
  const counts = (all.filters?.type ?? {}) as Found['counts'];
  const found = opts.type ? await pf.search(query, { filters: { ...base, type: opts.type }, sort }) : all;
  return { query, results: found.results, counts, total: all.results.length };
}

/* ---------- Verse references: "2:255", "بقره ۲۵۵", "Baqarah 255" ---------- */

interface SurahMeta {
  n: number;
  ar: string;
  fa: string;
  translit: string;
  en: string;
  ayahs: number;
}
const SURAHS = surahList as SurahMeta[];

const latinKey = (s: string) =>
  normalize(s)
    .replace(/^(surah?|surat|sura)\s+/, '')
    .replace(/^(the|a[a-z]{0,2})-/, '')
    .replace(/[^a-z]/g, '')
    .replace(/(.)\1+/g, '$1')
    .replace(/e/g, 'i')
    .replace(/o/g, 'u')
    .replace(/q/g, 'k')
    .replace(/h$/, '');
const arabicKey = (s: string) =>
  normalize(s)
    .replace(/^سوره\s*/, '')
    .replace(/\s+/g, '')
    .replace(/^ال/, '');

const NAME_KEYS = SURAHS.map((m) => ({
  n: m.n,
  keys: new Set([arabicKey(m.fa), arabicKey(m.ar), latinKey(m.translit), latinKey(m.en)].filter((k) => k.length > 1)),
}));

export interface Ref {
  s: number;
  a?: number;
}

export function parseRef(raw: string): Ref | undefined {
  const q = normalize(raw).trim();
  if (!q) return;
  const num = q.match(/^(\d{1,3})\s*[:：.,،/\-]\s*(\d{1,3})$/);
  if (num) {
    const s = Number(num[1]);
    const a = Number(num[2]);
    const m = SURAHS[s - 1];
    return m && a >= 1 && a <= m.ayahs ? { s, a } : undefined;
  }
  const named = q.match(/^(.*?)[\s:،,]*(\d{1,3})?$/);
  if (!named || named[1].length < 3) return;
  const name = named[1];
  const key = /[a-z]/.test(name) ? latinKey(name) : arabicKey(name);
  if (key.length < 2) return;
  const hit = NAME_KEYS.find((k) => k.keys.has(key));
  if (!hit) return;
  const a = named[2] ? Number(named[2]) : undefined;
  if (a !== undefined && (a < 1 || a > SURAHS[hit.n - 1].ayahs)) return { s: hit.n };
  return { s: hit.n, a };
}

export const surahMeta = (n: number) => SURAHS[n - 1];

/* ---------- Highlighting ---------- */

const WORD = /[\p{L}\p{N}]/u;
const MARK = /[ؐ-ًؚ-ٰٟۖ-ۭـ‌‍]/;

/** Ranges in `text` (original characters) where a word starts with a query term. */
function ranges(text: string, terms: string[]): [number, number][] {
  if (!terms.length || !text) return [];
  const found: [number, number][] = [];
  for (const alef of [false, true]) {
    if (alef && !text.includes('ٰ')) continue;
    const { text: f, from } = foldMapped(text, alef);
    for (const term of terms) {
      for (let i = f.indexOf(term); i !== -1; i = f.indexOf(term, i + term.length)) {
        if (i > 0 && WORD.test(f[i - 1])) continue;
        let e = i + term.length;
        while (e < f.length && WORD.test(f[e])) e++;
        let end = from[e - 1] + 1;
        while (end < text.length && MARK.test(text[end])) end++;
        // Include a following surrogate half (emoji are never words, but be safe)
        found.push([from[i], end]);
      }
    }
  }
  found.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of found) {
    const last = merged.at(-1);
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

/**
 * HTML for `text` with matches marked. With `max`, trims to a window around
 * the first match.
 */
export const plainText = (s: string) => s.replace(DECOR, ' ').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();

const isLow = (s: string, i: number) => {
  const c = s.charCodeAt(i);
  return c >= 0xdc00 && c <= 0xdfff;
};

export function marked(text: string, terms: string[], max?: number): string {
  const t = plainText(text).replace(/\s+/g, ' ').trim();
  const r = ranges(t, terms);
  let start = 0;
  let end = t.length;
  if (max && t.length > max) {
    const first = r[0]?.[0] ?? 0;
    start = Math.max(0, first - Math.floor(max * 0.3));
    if (start > 0) {
      const sp = t.indexOf(' ', start);
      if (sp !== -1 && sp < first) start = sp + 1;
    }
    end = Math.min(t.length, start + max);
    if (end < t.length) {
      const sp = t.lastIndexOf(' ', end);
      if (sp > start + max * 0.6) end = sp;
    }
  }
  // Never cut a surrogate pair in half.
  if (isLow(t, start)) start++;
  if (isLow(t, end)) end++;
  let html = start > 0 ? '… ' : '';
  let at = start;
  for (const [a, b] of r) {
    if (b <= start || a >= end) continue;
    const s = Math.max(a, at);
    const e = Math.min(b, end);
    html += esc(t.slice(at, s)) + `<mark>${esc(t.slice(s, e))}</mark>`;
    at = e;
  }
  html += esc(t.slice(at, end));
  if (end < t.length) html += ' …';
  return html;
}

/* ---------- Turning a record into something to show ---------- */

export interface Hit {
  href: string;
  external: boolean;
  type: SearchType;
  kind: string;
  /** Small line above the title: section, reference, date */
  eyebrow: string[];
  titleHtml: string;
  titleLang?: string;
  /** Arabic verse text (Quran only) */
  arabicHtml?: string;
  bodyHtml?: string;
  bodyLang?: string;
  image?: string;
  vertical?: boolean;
  platform?: string;
  /** Short reference badge, e.g. "2:255" */
  badge?: string;
}

const RTL = new Set(['fa', 'ar', 'ur']);
export const dirOf = (lang?: string) => (lang && RTL.has(lang) ? 'rtl' : lang ? 'ltr' : 'auto');

export function localHref(locale: string, path: string): string {
  const [p, hash] = path.split('#');
  return `/${locale}/${p.replace(/^\/+|\/+$/g, '')}/${hash ? `#${hash}` : ''}`;
}

const PLATFORM: Record<string, string> = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram' };

export function toHit(d: PFData, terms: string[], ctx: Ctx, full: boolean): Hit {
  const m = d.meta;
  const L = ctx.labels;
  const n = (x: number | string) => new Intl.NumberFormat(ctx.intl, { useGrouping: false }).format(Number(x));
  const day = (iso?: string) =>
    iso
      ? new Intl.DateTimeFormat(ctx.intl, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Tehran' }).format(
          new Date(iso),
        )
      : '';
  const type = (m.type ?? d.filters.type?.[0]) as SearchType;
  const loc = ctx.locale;
  const pick = (prefix: string) => m[`${prefix}_${loc}`] ?? m[`${prefix}_en`] ?? m[`${prefix}_fa`];
  const internal = (path?: string) => (path ? localHref(loc, path) : d.url);
  // Quran translation lives only under /fa/.
  const quran = (path?: string) => (path ? localHref('fa', path) : d.url);

  switch (m.kind) {
    case 'ayah': {
      const surahName = loc === 'fa' || loc === 'ur' ? m.sfa : loc === 'ar' ? m.sar : m.str;
      return {
        href: quran(m.path),
        external: false,
        type,
        kind: 'ayah',
        badge: `${n(m.s)}:${n(m.a)}`,
        eyebrow: [`${L.surah} ${surahName}`, `${L.verse} ${n(m.a)}`],
        titleHtml: m.fa ? marked(m.fa, terms, full ? undefined : 180) : esc(L.notTranslated),
        titleLang: m.fa ? 'fa' : undefined,
        arabicHtml: marked(m.ar, terms, full ? undefined : 140),
      };
    }
    case 'surah': {
      const name = loc === 'fa' || loc === 'ur' ? m.fa : loc === 'ar' ? m.ar : m.tr;
      return {
        href: quran(m.path),
        external: false,
        type,
        kind: 'surah',
        badge: n(m.s),
        eyebrow: [L.types.quran, L.verses.replace('{n}', n(m.ayahs))],
        titleHtml: `${esc(L.surah)} ${marked(name, terms)}`,
        bodyHtml: [m.ar, m.fa, m.tr, m.en].filter((x) => x && x !== name).map((x) => marked(x, terms)).join(' · '),
      };
    }
    case 'note': {
      const text = plainText(m.text);
      const title = plainText(m.title) || text.slice(0, 100);
      const nl = text.indexOf('\n');
      const rest = nl > 0 ? text.slice(nl + 1).trim() : '';
      return {
        href: d.url,
        external: false,
        type,
        kind: 'note',
        eyebrow: [L.types.notes, day(m.date)],
        titleHtml: marked(title, terms),
        titleLang: m.lang,
        bodyHtml: rest ? marked(rest, terms, full ? 280 : 140) : undefined,
        bodyLang: m.lang,
        image: full ? m.image : undefined,
      };
    }
    case 'video': {
      const platform = PLATFORM[m.platform] ?? m.platform;
      return {
        href: m.path ? internal(m.path) : m.external,
        external: !m.path,
        type,
        kind: 'video',
        platform: m.platform,
        eyebrow: [m.episode ? L.episode.replace('{n}', n(m.episode)) : platform, day(m.date)],
        titleHtml: marked(m.title, terms),
        titleLang: m.lang,
        bodyHtml: full && m.text ? marked(m.text, terms, 200) : undefined,
        bodyLang: m.lang,
        image: m.image,
        vertical: m.vertical === '1',
      };
    }
    case 'article': {
      return {
        href: d.url,
        external: false,
        type,
        kind: 'article',
        eyebrow: [L.work.blog ?? L.types.writings, pick('c') ?? '', day(m.date)],
        titleHtml: marked(m.title, terms),
        titleLang: 'fa',
        bodyHtml: m.text ? marked(m.text, terms, full ? 260 : 130) : undefined,
        bodyLang: 'fa',
        image: full ? m.image : undefined,
      };
    }
    case 'work': {
      const original = m[`t_${m.orig}`] ?? pick('t');
      const gloss = m.orig !== loc ? m[`t_${loc}`] : undefined;
      const summary = pick('d');
      const venue = pick('v');
      const sessions = m.sessions ? L.sessions.replace('{n}', n(m.sessions)) : undefined;
      return {
        href: internal(m.path),
        external: false,
        type,
        kind: 'work',
        eyebrow: [L.work[m.work] ?? L.types.writings, m.year ? (/^\d+$/.test(m.year) ? n(m.year) : m.year) : '', sessions ?? ''],
        titleHtml: marked(original, terms),
        titleLang: m.orig,
        bodyHtml: [gloss, venue, full ? summary : undefined].filter(Boolean).map((x) => marked(x!, terms)).join(' · ') || undefined,
      };
    }
    default:
      return {
        href: m.path?.startsWith('quran') ? quran(m.path) : internal(m.path),
        external: false,
        type,
        kind: 'page',
        eyebrow: [L.types.pages],
        titleHtml: marked(pick('t') ?? '', terms),
        bodyHtml: pick('d') ? marked(pick('d')!, terms, full ? 220 : 120) : undefined,
      };
  }
}

/* ---------- Recent searches (per browser, best effort) ---------- */

const RECENT = 'search:recent';
export function recent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 6) : [];
  } catch {
    return [];
  }
}
export function remember(q: string) {
  const v = q.trim();
  if (v.length < 2) return;
  try {
    localStorage.setItem(RECENT, JSON.stringify([v, ...recent().filter((x) => x !== v)].slice(0, 6)));
  } catch {}
}
export function forget() {
  try {
    localStorage.removeItem(RECENT);
  } catch {}
}

/* ---------- Markup shared by the dialog and the page ---------- */

const ICON: Record<string, string> = {
  external:
    '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4"/></svg>',
};

export function hitHtml(h: Hit, opts: { id?: string; full: boolean }): string {
  const target = h.external ? ' target="_blank" rel="noopener"' : '';
  const role = opts.id ? ` id="${opts.id}" role="option" aria-selected="false"` : '';
  const eyebrow = h.eyebrow.filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join('');
  const lang = (l?: string) => (l ? ` lang="${l}" dir="${dirOf(l)}"` : ' dir="auto"');
  const thumb =
    h.image && opts.full
      ? `<span class="hit__thumb${h.vertical ? ' hit__thumb--v' : ''}"><img src="${esc(h.image)}" alt="" loading="lazy" decoding="async"></span>`
      : '';
  return `<li class="hit hit--${h.kind}"${role}>
  <a class="hit__link" href="${esc(h.href)}"${target} tabindex="${opts.id ? -1 : 0}">
    ${h.badge ? `<span class="hit__badge num">${esc(h.badge)}</span>` : `<span class="hit__badge hit__badge--${h.type}" aria-hidden="true"></span>`}
    <span class="hit__main">
      <span class="hit__eyebrow">${eyebrow}${h.external ? `<span class="hit__ext">${ICON.external}</span>` : ''}</span>
      ${h.arabicHtml ? `<span class="hit__ar" lang="ar" dir="rtl">${h.arabicHtml}</span>` : ''}
      <span class="hit__title"${lang(h.titleLang)}>${h.titleHtml}</span>
      ${h.bodyHtml ? `<span class="hit__body"${lang(h.bodyLang)}>${h.bodyHtml}</span>` : ''}
    </span>
    ${thumb}
  </a>
</li>`;
}

export function refHtml(ref: Ref, ctx: Ctx, goTo: string, id?: string): string {
  const m = surahMeta(ref.s);
  const n = (x: number) => new Intl.NumberFormat(ctx.intl, { useGrouping: false }).format(x);
  const name = ctx.locale === 'fa' ? m.fa : ctx.locale === 'ar' ? m.ar : m.translit;
  const where = ref.a ? `${ctx.labels.surah} ${name} · ${ctx.labels.verse} ${n(ref.a)}` : `${ctx.labels.surah} ${name}`;
  const href = localHref('fa', `quran/${ref.s}${ref.a ? `#a${ref.a}` : ''}`);
  const role = id ? ` id="${id}" role="option" aria-selected="false"` : '';
  return `<li class="hit hit--jump"${role}>
  <a class="hit__link" href="${href}" tabindex="${id ? -1 : 0}">
    <span class="hit__badge num">${ref.a ? `${n(ref.s)}:${n(ref.a)}` : n(ref.s)}</span>
    <span class="hit__main">
      <span class="hit__eyebrow"><span>${esc(goTo)}</span></span>
      <span class="hit__title">${esc(where)}</span>
    </span>
    <span class="hit__go" aria-hidden="true">↵</span>
  </a>
</li>`;
}

export function suggestHtml(suggestion: string, label: string): string {
  const [before, after = ''] = label.split('{q}');
  return `<button type="button" class="suggest" data-q="${esc(suggestion)}">${esc(before)}<span dir="auto">${esc(suggestion)}</span>${esc(after)}</button>`;
}
