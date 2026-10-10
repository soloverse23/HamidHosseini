/**
 * Telegram "ترجمه گروهی قرآن" posts → src/data/quran/fa.json
 *
 * Each translation post looks like:
 *   💢 ترجمهٔ پیشنهادی آیات ۷۷ تا ۸۳ سورهٔ توبه 💢
 *   ✳️ <Arabic verse> ﴿۷۷﴾
 *   ⬅️ <Persian translation>
 *   🔺 <note on the translation>   (zero or more)
 *
 * Posts are replayed oldest → newest so later "final" versions and corrections
 * override earlier proposals. Every verse is checked against the Tanzil text
 * of the surah it is assigned to; anything that does not match is skipped and
 * reported, so a thematic post quoting another surah can't pollute the data.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FeedFile } from '../../src/lib/feed-types';
import { toAsciiDigits } from '../../src/lib/text';
import { ROOT } from '../fetch/lib/store';

interface Surah {
  n: number;
  ar: string;
  fa: string;
  ayahs: number;
}
export interface TranslatedAyah {
  text: string;
  notes?: string[];
  post: number;
  date: string;
}
export interface Translation {
  lang: string;
  title: string;
  source: string;
  updatedAt: string;
  surahs: Record<string, Record<string, TranslatedAyah>>;
}

const read = async (p: string) => JSON.parse(await readFile(join(ROOT, p), 'utf8'));

/** Letters-only Arabic for fuzzy comparison between spelling conventions. */
function skeleton(s: string) {
  return s
    .replace(/[ً-ٰٟۖ-ۭـؐ-ؚ]/g, '')
    .replace(/[ٱأإآءؤئاىی]/g, '')
    .replace(/ي/g, '')
    .replace(/ك/g, 'ک')
    .replace(/ة/g, 'ه')
    .replace(/[^ء-ۿ]/g, '');
}

function dice(a: string, b: string) {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const grams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const c = grams.get(g) ?? 0;
    if (c > 0) {
      grams.set(g, c - 1);
      hits++;
    }
  }
  return (2 * hits) / (a.length + b.length - 2);
}

const normName = (s: string) =>
  s
    .replace(/[ً-ْٰ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/‌/g, ' ')
    .replace(/^ال(?=\S)/, '')
    .replace(/\s+/g, ' ')
    .trim();

export async function buildPersianTranslation() {
  const surahs: Surah[] = await read('src/data/quran/surahs.json');
  const arabic: Record<string, string[]> = await read('src/data/quran/arabic.json');
  const feed: FeedFile = await read('src/data/feeds/telegram.json');

  const byName = new Map<string, number>();
  for (const s of surahs) byName.set(normName(s.fa), s.n);
  byName.set('حمد', 1);
  byName.set('فاتحه الکتاب', 1);
  byName.set('برائت', 9);

  function surahFromHeader(header: string): number | undefined {
    const m = header.match(/سور[ةه]ٔ?\s+([^💢\n]+)/);
    if (!m) return /فاتحة|فاتحه|حمد/.test(header) ? 1 : undefined;
    const words = normName(m[1].replace(/[^؀-ۿ\s]/g, ' ')).split(' ').filter(Boolean);
    for (const len of [3, 2, 1]) {
      const n = byName.get(words.slice(0, len).join(' '));
      if (n) return n;
    }
    return undefined;
  }

  const posts = feed.items
    .filter((i) => i.series === 'quran-translation')
    .sort((a, b) => a.date.localeCompare(b.date));

  const out: Translation['surahs'] = {};
  const rejected: string[] = [];
  let current = 1;

  for (const post of posts) {
    const lines = post.text.split('\n').map((l) => l.trim());
    const header = lines.find(Boolean) ?? '';
    const isTranslation = /ترجم|جمع‌?بندی|اصلاح/.test(header);
    if (!isTranslation) continue;
    current = surahFromHeader(header) ?? current;

    let verse: { n: number; ar: string } | undefined;
    let entry: TranslatedAyah | undefined;

    const commit = () => {
      if (!verse || !entry?.text) return;
      const ref = arabic[current]?.[verse.n - 1];
      // Fall back to a neighbouring surah when a post continues across a boundary.
      const candidates = [current, current + 1].filter((s) => arabic[s]?.[verse!.n - 1]);
      const match = candidates.find((s) => {
        const ref = skeleton(arabic[s][verse!.n - 1]);
        // Disjoined letters (الم، المص…) are too short for n-gram matching.
        if (ref.length < 6) return s === current;
        return dice(skeleton(verse!.ar), ref) >= 0.55;
      });
      if (!match) {
        rejected.push(`#${post.id} ${current}:${verse.n} (${ref ? 'text mismatch' : 'no such verse'})`);
        return;
      }
      current = match;
      (out[match] ??= {})[verse.n] = entry;
    };

    for (const line of lines) {
      // Newer posts number verses ﴿۷۷﴾, older ones (۳۰) at the end of the line.
      const num =
        line.match(/﴿\s*([0-9۰-۹٠-٩]+)\s*﴾/) ??
        (/^(✳️|❇️)/.test(line) ? line.match(/\(\s*([0-9۰-۹٠-٩]+)\s*\)\s*$/) : null);
      if (num) {
        commit();
        const ar = line.replace(/﴿.*?﴾|\(\s*[0-9۰-۹٠-٩]+\s*\)\s*$/g, '').replace(/^[^؀-ۿ]+/, '');
        verse = { n: Number(toAsciiDigits(num[1])), ar };
        entry = { text: '', post: Number(post.id), date: post.date };
        continue;
      }
      if (!verse || !entry) continue;
      if (line.startsWith('⬅️') && !entry.text) {
        entry.text = line.replace(/^⬅️\s*/, '').trim();
      } else if (/^🔺/.test(line) && entry.text) {
        (entry.notes ??= []).push(line.replace(/^🔺\s*/, '').trim());
      } else if (!line && entry.notes) {
        // blank line after notes: keep collecting until the next verse
      }
    }
    commit();
  }

  const translation: Translation = {
    lang: 'fa',
    title: 'ترجمهٔ گروهی قرآن',
    source: 'https://t.me/hamidhossaini',
    updatedAt: posts.at(-1)?.date ?? new Date().toISOString(),
    surahs: out,
  };
  await writeFile(join(ROOT, 'src/data/quran/fa.json'), JSON.stringify(translation, null, 1) + '\n');

  const counts = Object.entries(out).map(([s, a]) => `${s}:${Object.keys(a).length}/${arabic[s].length}`);
  console.log(`quran fa: ${counts.join('  ')}`);
  if (rejected.length) console.log(`  skipped ${rejected.length}: ${rejected.slice(0, 12).join(', ')}${rejected.length > 12 ? ' …' : ''}`);
  return translation;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildPersianTranslation().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
