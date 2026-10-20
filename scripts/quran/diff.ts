/**
 * Compares the translation database (fa.json) with the Telegram parse
 * (fa-telegram.json) and lists the verses that differ, for review:
 *
 *   npx tsx scripts/quran/diff.ts [--text]
 *
 * --text prints both versions of every differing translation.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Translation } from './from-telegram';
import { ROOT } from '../fetch/lib/store';

const load = (f: string) => JSON.parse(readFileSync(join(ROOT, 'src/data/quran', f), 'utf8')) as Translation;
const db = load('fa.json').surahs;
const tg = load('fa-telegram.json').surahs;
const showText = process.argv.includes('--text');
// Spacing and ZWNJ differences are not worth a review.
const norm = (s = '') => s.replace(/[\s‌]+/g, ' ').trim();

const only = { db: [] as string[], tg: [] as string[] };
const text: string[] = [];
const notes: string[] = [];
for (const s of new Set([...Object.keys(db), ...Object.keys(tg)])) {
  for (const a of new Set([...Object.keys(db[s] ?? {}), ...Object.keys(tg[s] ?? {})])) {
    const d = db[s]?.[a];
    const t = tg[s]?.[a];
    const ref = `${s}:${a}`;
    if (!t) only.db.push(ref);
    else if (!d) only.tg.push(ref);
    else {
      if (norm(d.text) !== norm(t.text)) {
        text.push(ref);
        if (showText) console.log(`\n${ref}\n  db: ${d.text}\n  tg: ${t.text}`);
      }
      if ((d.notes?.length ?? 0) !== (t.notes?.length ?? 0)) notes.push(`${ref} (${d.notes?.length ?? 0} vs ${t.notes?.length ?? 0})`);
    }
  }
}
const line = (label: string, list: string[]) => console.log(`${label}: ${list.length}${list.length ? `\n  ${list.join(', ')}` : ''}`);
line('Only in the database', only.db);
line('Only in Telegram', only.tg);
line('Translation differs', text);
line('Number of notes differs (database vs Telegram)', notes);
