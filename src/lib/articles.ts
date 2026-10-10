// The kalaam.ir articles as the site uses them: pages folded into their posts,
// topics and series applied, plus derived fields (excerpt, reading time,
// headings, related articles). See src/data/articles.ts for the hand-kept parts.

import kalaam from '../data/kalaam.json';
import {
  CATEGORY_KEYS,
  EXTRA_TOPICS,
  MERGE_INTO,
  SERIES,
  SERIES_KEYS,
  TITLE_FIX,
  TOPICS_BY_ID,
  WP_CATEGORY,
  type CategoryKey,
  type SeriesKey,
} from '../data/articles';
import { excerpt } from './text';

interface RawItem {
  id: number;
  kind: 'post' | 'page';
  title: string;
  date: string;
  modified: string;
  url: string;
  wpCategories: string[];
  tags: string[];
  html: string;
  text: string;
  words: number;
  image?: { src: string; width: number; height: number };
}

export interface Article {
  id: number;
  title: string;
  /** ISO 8601 with Tehran offset */
  date: string;
  modified: string;
  /** The original address on kalaam.ir */
  source: string;
  categories: CategoryKey[];
  tags: string[];
  html: string;
  text: string;
  excerpt: string;
  words: number;
  minutes: number;
  image?: { src: string; width: number; height: number };
  headings: { id: string; text: string }[];
  series?: { key: SeriesKey; index: number; total: number };
}

const raw = (kalaam as { items: RawItem[] }).items;
const byId = new Map(raw.map((i) => [i.id, i]));

// WordPress stored local Tehran time without an offset. Iran used +03:30 in
// winter and +04:30 in summer until 2022; the date is what matters here.
const iso = (d: string) => `${d}+03:30`;

/* ---------- Folding "continue reading" pages into their posts ---------- */

const words = (t: string) => t.replace(/<[^>]+>/g, ' ').match(/[\p{L}\p{N}]+/gu) ?? [];
function shingles(t: string, n = 5): Set<string> {
  const w = words(t);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '));
  return out;
}

function fold(post: RawItem, page: RawItem): string {
  const inPage = shingles(page.html);
  const blocks = post.html.split('\n').filter(Boolean);
  // Keep the post's own paragraphs (an introduction, a note on where the text
  // was published) that the page doesn't already contain, and drop links that
  // pointed to the page, since its text now follows.
  const intro: string[] = [];
  const outro: string[] = [];
  let reachedPage = false;
  for (const b of blocks) {
    if (new RegExp(`href="/fa/articles/${page.id}/"`).test(b) && words(b).length < 16) continue;
    const sh = shingles(b);
    let seen = 0;
    for (const s of sh) if (inPage.has(s)) seen++;
    const repeated = sh.size > 0 ? seen / sh.size >= 0.5 : words(b).length === 0;
    if (repeated) reachedPage = true;
    // Paragraphs after the shared text (a postscript) stay after it.
    else (reachedPage ? outro : intro).push(b);
  }
  return [...intro, ...page.html.split('\n').filter(Boolean), ...outro].join('\n');
}

const merged = new Map<number, string>();
for (const [pageId, postId] of Object.entries(MERGE_INTO)) {
  const page = byId.get(Number(pageId));
  const post = byId.get(postId);
  if (page && post) merged.set(postId, fold(post, page));
}
const hidden = new Set(Object.keys(MERGE_INTO).map(Number));
const redirect = new Map(Object.entries(MERGE_INTO).map(([from, to]) => [Number(from), to]));

/* ---------- Building the list ---------- */

function topicsOf(i: RawItem): CategoryKey[] {
  const own = TOPICS_BY_ID[i.id] ?? i.wpCategories.map((c) => WP_CATEGORY[c]).filter(Boolean);
  const all = [...new Set([...own, ...(EXTRA_TOPICS[i.id] ?? [])])];
  return all.length ? all : ['news'];
}

const seriesOf = new Map<number, Article['series']>();
for (const key of SERIES_KEYS) SERIES[key].ids.forEach((id, index) => seriesOf.set(id, { key, index, total: SERIES[key].ids.length }));

const plain = (html: string) =>
  html
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<\/(p|h3|li|blockquote)>/g, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** Give each <h3> an anchor for the table of contents. */
function withAnchors(html: string, title: string) {
  const headings: Article['headings'] = [];
  const key = (x: string) => words(x.replace(/\u200c/g, '')).join(' ');
  const same = (a: string) => key(a) === key(title);
  const out = html
    .replace(/<p>[\s:.،؛-]*<\/p>\n?/g, '')
    // A bold lead-in on its own line ("<strong>چکیده<br></strong>…") is a section heading.
    .replace(/<p><strong>([^<]{2,60}?)(?:<br>)?<\/strong>\s*(?:<br>)?\s*([\s\S]*?)<\/p>/g, (m, head: string, rest: string) =>
      /[:.؟?!]\s*$/.test(head) || !rest.trim() || /[:*]/.test(head) ? m : `<h3>${head.trim()}</h3>\n<p>${rest}</p>`,
    )
    .replace(/(?:\s*<br>)+\s*(<\/(?:h3|p|li)>)/g, '$1')
    // The page shows the title; a heading that only repeats it goes.
    .replace(/^(?:<h3>[\s\S]*?<\/h3>\n?)+/, (m) => m.split('\n').filter((h) => h && !same(plain(h))).map((h) => `${h}\n`).join('')).replace(/<h3>([\s\S]*?)<\/h3>/g, (_, inner: string) => {
    const id = `s${headings.length + 1}`;
    headings.push({ id, text: plain(inner) });
    return `<h3 id="${id}">${inner}</h3>`;
  });
  return { html: out, headings };
}

/** Links to a page that was folded into a post go to the post. */
const fixLinks = (html: string) =>
  html.replace(/href="\/fa\/articles\/(\d+)\/"/g, (m, id) => (redirect.has(Number(id)) ? `href="/fa/articles/${redirect.get(Number(id))}/"` : m));

/** Leading emoji and markers (❇️ ✅ ✳️) don't belong in an excerpt. */
const strip = (t: string) => t.replace(/^[^\p{L}\p{N}«(]+/u, '');

export const articles: Article[] = raw
  .filter((i) => !hidden.has(i.id))
  .map((i) => {
    const { html, headings } = withAnchors(fixLinks(merged.get(i.id) ?? i.html), TITLE_FIX[i.id] ?? i.title);
    const text = plain(html);
    const n = words(text).length;
    // The first paragraph often repeats the title; start the excerpt after it.
    const paras = text.split('\n\n').map((p) => strip(p.trim())).filter(Boolean);
    const lead = paras.find((p) => p !== i.title && p.length > 40) ?? paras[0] ?? '';
    return {
      id: i.id,
      title: TITLE_FIX[i.id] ?? i.title,
      date: iso(i.date),
      modified: iso(i.modified),
      source: i.url,
      categories: topicsOf(i),
      tags: i.tags,
      html,
      text,
      excerpt: excerpt(lead.replace(/\s+/g, ' '), 240),
      words: n,
      minutes: Math.max(1, Math.round(n / 200)),
      ...(i.image ? { image: i.image } : {}),
      headings,
      ...(seriesOf.has(i.id) ? { series: seriesOf.get(i.id) } : {}),
    } satisfies Article;
  })
  .sort((a, b) => b.date.localeCompare(a.date));

export const articleById = new Map(articles.map((a) => [a.id, a]));

/** Topics in display order, with how many articles each has. */
export const categoryCounts = Object.fromEntries(
  CATEGORY_KEYS.map((k) => [k, articles.filter((a) => a.categories.includes(k)).length]),
) as Record<CategoryKey, number>;
export const categoriesInUse = CATEGORY_KEYS.filter((k) => categoryCounts[k] > 0);

export const seriesArticles = (key: SeriesKey) => SERIES[key].ids.map((id) => articleById.get(id)).filter((a): a is Article => !!a);

/** Articles grouped by Gregorian year, newest first (labels are localised by the page). */
export function byYear(list: Article[]) {
  const map = new Map<number, Article[]>();
  for (const a of list) {
    const y = Number(a.date.slice(0, 4));
    if (!map.has(y)) map.set(y, []);
    map.get(y)!.push(a);
  }
  return [...map.entries()].sort((a, b) => b[0] - a[0]);
}

/** A few articles worth reading next: shared topics and tags, then closeness in time. */
export function related(a: Article, n = 4): Article[] {
  const weak = new Set<CategoryKey>(['news', 'dialogues']);
  const inSeries = new Set(a.series ? SERIES[a.series.key].ids : []);
  return articles
    .filter((b) => b.id !== a.id && !inSeries.has(b.id) && !b.categories.includes('about'))
    .map((b) => {
      const topics = b.categories.filter((c) => a.categories.includes(c)).reduce((s, c) => s + (weak.has(c) ? 0.5 : 2), 0);
      const tags = b.tags.filter((t) => a.tags.includes(t)).length * 1.5;
      const years = Math.abs(Date.parse(a.date) - Date.parse(b.date)) / (365 * 864e5);
      return { b, score: topics + tags - Math.min(years, 10) * 0.1 };
    })
    .filter((x) => x.score > 1)
    .sort((x, y) => y.score - x.score)
    .slice(0, n)
    .map((x) => x.b);
}

/** Chronological neighbours. */
export function neighbours(a: Article) {
  const i = articles.indexOf(a);
  return { newer: articles[i - 1], older: articles[i + 1] };
}
