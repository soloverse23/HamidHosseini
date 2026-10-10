/**
 * One-off: build src/data/quran/{surahs,arabic}.json from the Tanzil Uthmani
 * text as served by api.alquran.cloud. Tanzil's licence allows verbatim
 * redistribution with attribution (shown on every Quran page).
 *
 *   tsx scripts/quran/import-arabic.ts
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, fetchText } from '../fetch/lib/store';

const strip = (s: string) => s.replace(/[ً-ْٰۖ-ۭـ]/g, '');

/** Persian display name: no harakat, Persian letter forms, no leading "ال". */
function persianName(arabic: string) {
  let n = strip(arabic).replace(/^سورة\s+/, '').replace(/ٱ/g, 'ا');
  n = n.replace(/ة/g, 'ه').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/^أل|^ال(?=\S)/, '');
  return n.replace(/[أإ]/g, 'ا').replace(/^ال عمران$/, 'آل عمران').trim();
}

const meta = JSON.parse(await fetchText('https://api.alquran.cloud/v1/meta')).data.surahs.references;
const quran = JSON.parse(await fetchText('https://api.alquran.cloud/v1/quran/quran-uthmani')).data.surahs;

const surahs = meta.map((s: any) => ({
  n: s.number,
  ar: s.name.replace(/^سُورَةُ\s+/, ''),
  fa: persianName(s.name),
  translit: s.englishName,
  en: s.englishNameTranslation,
  ayahs: s.numberOfAyahs,
  place: s.revelationType === 'Meccan' ? 'mecca' : 'medina',
}));

const arabic: Record<string, string[]> = {};
for (const s of quran) {
  arabic[s.number] = s.ayahs.map((a: any, i: number) => {
    const text = a.text.replace(/^\uFEFF/, '');
    // Tanzil prefixes verse 1 of every surah (but al-Fatiha) with the basmala.
    const words = text.split(' ');
    const isBasmala = strip(words.slice(0, 4).join(' ')).replace(/ٱ/g, 'ا') === 'بسم الله الرحمن الرحيم';
    return i === 0 && s.number !== 1 && isBasmala ? words.slice(4).join(' ') : text;
  });
}

await writeFile(join(ROOT, 'src/data/quran/surahs.json'), JSON.stringify(surahs, null, 1) + '\n');
await writeFile(join(ROOT, 'src/data/quran/arabic.json'), JSON.stringify(arabic) + '\n');
console.log(`surahs: ${surahs.length}, ayahs: ${Object.values(arabic).flat().length}`);
