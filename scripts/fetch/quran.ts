/**
 * Quran translation database → src/data/quran/fa.json
 *
 * The group translation is kept in its own database (translation plus up to
 * eleven explanation notes per verse). It is the authoritative text: the
 * Telegram posts are only where each verse was first proposed. So the text and
 * notes come from the database, and each verse is linked to its post using the
 * Telegram parse (src/data/quran/fa-telegram.json, written by
 * scripts/quran/from-telegram.ts).
 *
 * Read-only: the database can also be edited, and this only ever sends GETs.
 * Like every fetcher it never loses data: if the database is unreachable, or
 * suddenly returns far fewer translated verses, fa.json is left as it is and
 * the run is reported as failed.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dice, skeleton, type TranslatedAyah, type Translation } from '../quran/from-telegram';
import { fetchText, ROOT } from './lib/store';

const API = process.env.QURAN_API_URL ?? 'http://51.68.220.90:3333/api/verses';
const PAGE = 1000;
const TOTAL_AYAHS = 6236;
/** A drop below this share of the previous count is treated as a fault, not an edit. */
const MIN_KEEP = 0.95;

interface ApiVerse {
  sura_no: number;
  aya_no: number;
  translation: string | null;
  [k: `explanation_${string}`]: string | null;
}

const read = async <T>(p: string): Promise<T | undefined> => {
  try {
    return JSON.parse(await readFile(join(ROOT, p), 'utf8'));
  } catch {
    return undefined;
  }
};

async function fetchAll(): Promise<ApiVerse[]> {
  const out: ApiVerse[] = [];
  for (let skip = 0; ; skip += PAGE) {
    const page = JSON.parse(await fetchText(`${API}?skip=${skip}&limit=${PAGE}`)) as { total: number; items: ApiVerse[] };
    out.push(...page.items);
    if (!page.items.length || out.length >= page.total) break;
  }
  if (out.length !== TOTAL_AYAHS) throw new Error(`expected ${TOTAL_AYAHS} verses, got ${out.length}`);
  return out;
}

const clean = (s: string | null | undefined) => (s ?? '').replace(/\r\n?/g, '\n').trim();

/** explanation_01 … explanation_11 in order; the `_duplicate` columns are leftovers. */
function notesOf(v: ApiVerse): string[] {
  return Object.keys(v)
    .filter((k) => /^explanation_\d+$/.test(k))
    .sort()
    .map((k) => clean(v[k as `explanation_${string}`]))
    .filter(Boolean);
}

/**
 * The post a verse was proposed in. Verses the Telegram parse missed (it once
 * merged 9:8 into 9:7) take the post of their neighbours when both agree.
 */
function postOf(tg: Translation['surahs'], surah: number, ayah: number) {
  const own = tg[surah]?.[ayah];
  if (own) return { post: own.post, date: own.date };
  const prev = tg[surah]?.[ayah - 1];
  const next = tg[surah]?.[ayah + 1];
  if (prev && next && prev.post === next.post) return { post: prev.post, date: prev.date };
  return {};
}

const words = (s: string) =>
  new Set(s.replace(/‌/g, '').split(/[\s.،؛:!?«»()]+/).filter(Boolean));

function overlap(a: string, b: string) {
  const x = words(a);
  const y = words(b);
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / Math.max(1, x.size + y.size - both);
}

/**
 * Verses filed under the wrong number in the database. The database once held
 * drafts of al-Fatiha under 36, 38 and 47: a verse no Telegram post vouches for,
 * whose translation reads like another verse's while their Arabic differs, is
 * dropped. Real repeats (2:1 and 3:1, both الم) share their Arabic and stay.
 */
function dropMisfiled(surahs: Translation['surahs'], arabic: Record<string, string[]>): string[] {
  const all = Object.entries(surahs).flatMap(([s, a]) => Object.entries(a).map(([n, v]) => ({ s, n, v })));
  const dropped = all.filter(({ s, n, v }) => {
    if (v.post) return false;
    const ar = skeleton(arabic[s]?.[+n - 1] ?? '');
    return all.some(
      (o) =>
        (o.s !== s || o.n !== n) &&
        overlap(v.text, o.v.text) >= 0.5 &&
        dice(ar, skeleton(arabic[o.s]?.[+o.n - 1] ?? '')) < 0.55,
    );
  });
  for (const { s, n } of dropped) delete surahs[s][n];
  for (const s of Object.keys(surahs)) if (!Object.keys(surahs[s]).length) delete surahs[s];
  return dropped.map(({ s, n }) => `${s}:${n}`);
}

export async function run() {
  const telegram = await read<Translation>('src/data/quran/fa-telegram.json');
  const arabic = (await read<Record<string, string[]>>('src/data/quran/arabic.json')) ?? {};
  const previous = await read<Translation>('src/data/quran/fa.json');
  const verses = await fetchAll();

  const surahs: Translation['surahs'] = {};
  for (const v of verses) {
    const text = clean(v.translation);
    if (!text) continue;
    const notes = notesOf(v);
    const entry: TranslatedAyah = { text, ...(notes.length ? { notes } : {}), ...postOf(telegram?.surahs ?? {}, v.sura_no, v.aya_no) };
    (surahs[v.sura_no] ??= {})[v.aya_no] = entry;
  }
  const misfiled = dropMisfiled(surahs, arabic);
  if (misfiled.length) console.log(`quran: dropped misfiled verses: ${misfiled.join(', ')}`);

  const count = (t?: Translation['surahs']) => Object.values(t ?? {}).reduce((n, a) => n + Object.keys(a).length, 0);
  const now = count(surahs);
  const before = count(previous?.surahs);
  if (now < before * MIN_KEEP) {
    throw new Error(`database returned ${now} translated verses, down from ${before}; keeping the previous data`);
  }

  if (JSON.stringify(surahs) === JSON.stringify(previous?.surahs)) {
    console.log(`quran: unchanged (${now} verses)`);
    return;
  }
  const out: Translation = {
    lang: 'fa',
    title: 'ترجمهٔ گروهی قرآن',
    source: 'https://t.me/hamidhossaini',
    updatedAt: new Date().toISOString(),
    surahs,
  };
  await writeFile(join(ROOT, 'src/data/quran/fa.json'), JSON.stringify(out, null, 1) + '\n');

  const unlinked = Object.entries(surahs).flatMap(([s, a]) => Object.entries(a).filter(([, v]) => !v.post).map(([n]) => `${s}:${n}`));
  console.log(`quran: ${now} verses (was ${before}); without a source post: ${unlinked.length ? unlinked.join(', ') : 'none'}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
