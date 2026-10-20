import type { APIContext } from 'astro';
import { arabic, quranFa, surahs, totalTranslated } from '../lib/data';

// The whole Persian translation as plain text for AI agents: every
// translated verse with its Arabic, its notes and its page on this site.
export function GET({ site }: APIContext) {
  const o = site!.origin;
  const out = [
    '# Persian group translation of the Quran, by Seyed Hamid Hosseini (ترجمهٔ گروهی قرآن)',
    '',
    `> ${totalTranslated} of 6,236 verses translated so far, each with notes explaining the choice of words. Translator: Seyed Hamid Hosseini (${o}/fa/about/). Arabic text: Tanzil Project (Uthmani). Cite each verse by its page URL.`,
    '',
  ];
  for (const m of surahs) {
    const ayahs = quranFa.surahs[m.n];
    if (!ayahs) continue;
    out.push(`## Surah ${m.n}: ${m.translit} (${m.ar}, ${m.fa})`, '');
    for (const [a, v] of Object.entries(ayahs).sort(([x], [y]) => Number(x) - Number(y))) {
      out.push(`### ${m.n}:${a} | ${o}/fa/quran/${m.n}/${a}/`, arabic[m.n][Number(a) - 1], v.text);
      for (const note of v.notes ?? []) out.push(`- ${note}`);
      out.push('');
    }
  }
  return new Response(out.join('\n'), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
