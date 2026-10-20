// Builds the site search index. Run by the Astro integration in
// scripts/search/integration.ts (after `astro build`, and on `astro dev`), or
// by hand: `tsx scripts/search/build-index.ts [siteDir]` (default: dist).
//
// Instead of scraping the rendered pages (which Pagefind would split into one
// index per page language, so an English reader could never find a Persian
// note), every searchable thing is added as its own record to ONE index:
// each Quran verse, each surah, each note, video and clip, each written work
// and each section page. Records carry what the results UI needs in `meta`,
// and are filtered by `type` and content `lang`.
//
// Text is folded with src/lib/search/normalize.ts; the browser folds queries
// the same way.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as pagefind from 'pagefind';
import { ARTICLES, BOOKS, LECTURES, type Localized } from '../../src/data/writings';
import about from '../../src/data/content/about.json';
import { LOCALES } from '../../src/i18n/locales';
import { t } from '../../src/i18n/strings';
import {
  arabic,
  episodes,
  YT_LANGS,
  instagram,
  lectureSessions,
  notes,
  otherTalks,
  quranFa,
  shorts,
  surahs,
  tiktok,
} from '../../src/lib/data';
import type { FeedItem } from '../../src/lib/feed-types';
import { indexText, vocabKey } from '../../src/lib/search/normalize';
import { firstLine } from '../../src/lib/text';
import { topicsOf } from '../../src/lib/topics';
import { CATEGORIES, SERIES, SERIES_KEYS } from '../../src/data/articles';
import { articles } from '../../src/lib/articles';

type Meta = Record<string, string | number | undefined>;
interface Rec {
  url: string;
  type: 'quran' | 'notes' | 'videos' | 'writings' | 'pages';
  /** Content languages, for the language filter */
  lang: string[];
  /** Searchable text; the first part is repeated so titles weigh more. */
  title: string;
  body?: string;
  meta: Meta;
  date?: string;
  topics?: string[];
}

const clean = (m: Meta) =>
  Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]));
const localized = (prefix: string, l?: Localized) =>
  Object.fromEntries(LOCALES.map((loc) => [`${prefix}_${loc}`, l?.[loc]]));
const stripLead = (x: string) => x.replace(/^[^\p{L}\p{N}«(]+/u, '').trim();
const thumb = (i: FeedItem) => i.media.find((m) => m.kind === 'image' || m.src)?.src;

const records: Rec[] = [];

/* ---------- Quran: one record per surah, one per verse ---------- */

for (const m of surahs) {
  records.push({
    url: `/fa/quran/${m.n}/`,
    type: 'quran',
    lang: ['ar', 'fa'],
    title: `${m.ar} ${m.fa} ${m.translit} ${m.en} سوره surah sura ${m.n}`,
    meta: { kind: 'surah', path: `quran/${m.n}`, s: m.n, ayahs: m.ayahs, ar: m.ar, fa: m.fa, tr: m.translit, en: m.en, place: m.place },
  });
  const tr = quranFa.surahs[m.n] ?? {};
  arabic[m.n].forEach((ar, i) => {
    const a = i + 1;
    const v = tr[a];
    records.push({
      url: `/fa/quran/${m.n}/#a${a}`,
      type: 'quran',
      lang: v ? ['ar', 'fa'] : ['ar'],
      title: v?.text ?? '',
      body: `${ar} ${(v?.notes ?? []).join(' ')} ${m.fa} ${m.ar} ${m.translit}`,
      meta: {
        kind: 'ayah',
        path: v ? `quran/${m.n}/${a}` : `quran/${m.n}#a${a}`,
        s: m.n,
        a,
        sar: m.ar,
        sfa: m.fa,
        str: m.translit,
        ar,
        fa: v?.text,
        post: v?.post,
      },
      date: v?.date,
    });
  });
}

/* ---------- Notes (Telegram) ---------- */

for (const n of notes) {
  const docs = n.media.filter((m) => m.kind === 'document' || m.kind === 'audio').map((m) => m.title ?? '');
  const text = n.text || docs.join(' · ') || n.linkPreview?.title || '';
  if (!text.trim()) continue;
  const title = firstLine(stripLead(text), 110);
  records.push({
    url: `/fa/notes/${n.id}/`,
    type: 'notes',
    lang: [n.lang ?? 'fa'],
    title,
    body: `${text} ${docs.join(' ')} ${n.linkPreview?.title ?? ''} ${n.linkPreview?.description ?? ''}`,
    meta: {
      kind: 'note',
      id: n.id,
      title,
      text: stripLead(text),
      date: n.date,
      media: n.media[0]?.kind,
      image: n.media.find((m) => m.kind === 'image')?.src,
      lang: n.lang,
    },
    date: n.date,
    topics: topicsOf(n),
  });
}

/* ---------- Videos: YouTube, TikTok, Instagram ---------- */

const onPage = new Map<string, string>();
for (const ep of episodes) for (const v of YT_LANGS.map((k) => ep[k])) if (v) onPage.set(v.id, `videos/${ep.n}`);
for (const v of otherTalks) onPage.set(v.id, `videos#v-${v.id}`);
for (const v of shorts.slice(0, 18)) onPage.set(v.id, `videos#v-${v.id}`);

const video = (i: FeedItem, platform: string) => {
  const path = onPage.get(i.id);
  const title = i.title?.trim() || firstLine(i.text, 110);
  // Captions without a separate title (TikTok, Instagram): the first line is
  // the title, so the excerpt starts after it.
  const nl = i.text.indexOf('\n');
  const rest = i.title ? i.text : nl > 0 ? i.text.slice(nl + 1).trim() : '';
  records.push({
    url: path ? `/fa/${path.replace('#', '/#')}` : i.url,
    type: 'videos',
    lang: [i.lang ?? i.channel ?? 'fa'],
    title,
    body: `${i.text} ${platform}`,
    meta: {
      kind: 'video',
      platform,
      path,
      external: path ? undefined : i.url,
      title,
      text: rest && rest !== title ? rest : undefined,
      date: i.date,
      image: thumb(i),
      vertical: i.kind === 'short' || i.kind === 'reel' ? 1 : undefined,
      duration: i.media[0]?.duration,
      episode: i.episode,
      lang: i.lang,
    },
    date: i.date,
  });
};
for (const ep of episodes) for (const v of YT_LANGS.map((k) => ep[k])) if (v) video(v, 'youtube');
for (const v of [...otherTalks, ...shorts]) video(v, 'youtube');
for (const v of tiktok.items) video(v, 'tiktok');
for (const v of instagram.items) video(v, 'instagram');

/* ---------- Writings ---------- */

for (const w of [...BOOKS, ...ARTICLES]) {
  records.push({
    url: `/fa/writings/#${w.id}`,
    type: 'writings',
    lang: [w.lang],
    title: Object.values(w.title).join(' '),
    body: [...Object.values(w.venue ?? {}), ...Object.values(w.summary ?? {})].join(' '),
    meta: {
      kind: 'work',
      work: w.type,
      path: `writings#${w.id}`,
      orig: w.lang,
      year: w.year,
      ...localized('t', w.title),
      ...localized('d', w.summary),
      ...localized('v', w.venue),
    },
    date: `${w.year}-07-01`,
  });
}
for (const l of LECTURES) {
  const sessions = lectureSessions[l.id] ?? [];
  records.push({
    url: `/fa/writings/#${l.id}`,
    type: 'writings',
    lang: [l.lang],
    title: Object.values(l.title).join(' '),
    body: [...Object.values(l.venue ?? {}), ...Object.values(l.summary ?? {}), ...sessions.map((x) => x.title)].join(' '),
    meta: {
      kind: 'work',
      work: 'lectures',
      path: `writings#${l.id}`,
      orig: l.lang,
      year: l.years.join('–'),
      sessions: l.total ?? sessions.length,
      ...localized('t', l.title),
      ...localized('d', l.summary),
      ...localized('v', l.venue),
    },
  });
}

/* ---------- Articles (kalaam.ir) ---------- */

for (const a of articles) {
  const cats = a.categories.map((k) => CATEGORIES[k].title);
  const series = a.series ? SERIES[a.series.key].title : undefined;
  records.push({
    url: `/fa/articles/${a.id}/`,
    type: 'writings',
    lang: ['fa'],
    title: a.title,
    // Topic and series names in every language, so "ethics" or "اخلاق" finds them.
    body: [a.text, ...a.tags, ...cats.flatMap((c) => Object.values(c)), ...Object.values(series ?? {})].join(' '),
    meta: {
      kind: 'article',
      id: a.id,
      title: a.title,
      text: a.excerpt,
      date: a.date,
      image: a.image?.src,
      minutes: a.minutes,
      ...localized('c', Object.fromEntries(LOCALES.map((l) => [l, cats.map((c) => c[l] ?? c.en).join(' · ')]))),
      ...localized('s', series),
    },
    date: a.date,
    topics: a.categories.map((k) => `article-${k}`),
  });
}
for (const key of SERIES_KEYS) {
  const sr = SERIES[key];
  records.push({
    url: `/fa/articles/series/${key}/`,
    type: 'writings',
    lang: ['fa'],
    title: Object.values(sr.title).join(' '),
    body: [...Object.values(sr.summary ?? {}), ...sr.ids.map((id) => articles.find((a) => a.id === id)?.title ?? '')].join(' '),
    meta: {
      kind: 'work',
      work: 'series',
      path: `articles/series/${key}`,
      orig: 'fa',
      sessions: sr.ids.length,
      ...localized('t', sr.title),
      ...localized('d', sr.summary),
    },
  });
}

/* ---------- Section pages ---------- */

const SECTIONS = ['writings', 'articles', 'quran', 'notes', 'videos', 'tiktok', 'instagram', 'about'] as const;
for (const key of SECTIONS) {
  const per = LOCALES.map((l) => {
    const s = t(l);
    const sec = s.sections[key] as { title: string; lede?: string };
    const extra = key === 'about' ? [about.bio[l] ?? '', s.about.tvText, s.name] : [s.nav[key]];
    return { l, title: sec.title, lede: sec.lede, extra };
  });
  records.push({
    url: `/fa/${key}/`,
    type: 'pages',
    lang: [...LOCALES],
    title: per.map((p) => p.title).join(' '),
    body: per.flatMap((p) => [p.lede ?? '', ...p.extra]).join(' '),
    meta: {
      kind: 'page',
      path: key,
      ...Object.fromEntries(per.map((p) => [`t_${p.l}`, p.title])),
      ...Object.fromEntries(per.map((p) => [`d_${p.l}`, p.lede])),
    },
  });
}

/* ---------- Write ---------- */

/** Write the index to `<siteDir>/pagefind`. Returns a one-line summary. */
export async function writeIndex(siteDir: string): Promise<string> {
  const OUT = `${siteDir}/pagefind`;
  const { index, errors } = await pagefind.createIndex({ forceLanguage: 'fa' });
  // Every indexed word with how often it occurs, for checking queries and
  // suggesting spellings in the browser (Pagefind quietly loosens unknown words).
  const vocab = new Map<string, number>();
  if (!index) throw new Error(`Pagefind: ${errors.join(', ')}`);

  for (const r of records) {
    const title = indexText(r.title);
    const body = indexText(r.body ?? '');
    for (const w of `${title} ${body}`.split(' ')) if (w) vocab.set(w, (vocab.get(w) ?? 0) + 1);
    const res = await index.addCustomRecord({
      url: r.url,
      // Title twice: Pagefind ranks by term frequency, and a match in the
      // title should beat a passing mention in a long post.
      content: `${title} ${title} ${body}`.trim(),
      language: 'fa',
      meta: clean({ ...r.meta, type: r.type }),
      filters: {
        type: [r.type],
        lang: r.lang,
        ...(r.topics?.length ? { topic: r.topics } : {}),
      },
      sort: r.date ? { date: r.date } : undefined,
    });
    if (res.errors.length) throw new Error(`Pagefind (${r.url}): ${res.errors.join(', ')}`);
  }

  rmSync(OUT, { recursive: true, force: true });
  const out = await index.writeFiles({ outputPath: OUT });
  if (out.errors.length) throw new Error(`Pagefind: ${out.errors.join(', ')}`);
  await pagefind.close();

  // Vocabulary, sharded by the first two characters of each word.
  const shards = new Map<string, Record<string, number>>();
  for (const [w, n] of vocab) {
    const k = vocabKey(w);
    if (!k) continue;
    if (!shards.has(k)) shards.set(k, {});
    shards.get(k)![w] = n;
  }
  mkdirSync(`${OUT}/vocab`, { recursive: true });
  for (const [k, words] of shards) writeFileSync(`${OUT}/vocab/${k}.json`, JSON.stringify(words));

  const byType = records.reduce<Record<string, number>>((a, r) => ((a[r.type] = (a[r.type] ?? 0) + 1), a), {});
  return `indexed ${records.length} records, ${vocab.size} words (${Object.entries(byType).map(([k, n]) => `${k} ${n}`).join(', ')})`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(`search: ${await writeIndex(process.argv[2] ?? 'dist')}`);
}
