import type { APIContext } from 'astro';
import { ARTICLES, BOOKS, LECTURES, type Localized } from '../data/writings';
import { CATEGORIES } from '../data/articles';
import { articles } from '../lib/articles';
import { episodes, notes, YT_LANGS } from '../lib/data';
import { duplicateOf } from '../lib/duplicates';

const pick = (l?: Localized) => (l ? (l.en ?? l.fa ?? Object.values(l)[0]) : undefined);

// Plain-text corpus for AI agents: works, lectures, episodes and the newest notes.
export function GET({ site }: APIContext) {
  const o = site!.origin;
  const out: string[] = ['# Seyyed Hamid Hosseini: full text index', '', `Source: ${o}/llms.txt`, ''];

  out.push('## Writings', '');
  for (const w of [...BOOKS, ...ARTICLES]) {
    out.push(`### ${pick(w.title)} (${w.year}, ${w.type}, language: ${w.lang})`);
    const venue = pick(w.venue);
    if (venue) out.push(`Published in: ${venue}`);
    const sum = pick(w.summary);
    if (sum) out.push(sum);
    if (w.type === 'book') out.push(`Page: ${o}/en/books/${w.id}/`);
    for (const [l, x] of Object.entries(w.translations ?? {}))
      out.push(`- translation (${l}): ${x!.title}${x!.translator ? `, translated by ${x!.translator}` : ''}: ${o}${x!.pdf}`);
    for (const l of w.links) out.push(`- ${l.kind}: ${l.url}`);
    out.push('');
  }

  out.push('## Articles from kalaam.ir (Persian; titles and summaries)', '');
  for (const a of articles) {
    out.push(`### ${a.title} | ${o}/fa/articles/${a.id}/ (${a.date.slice(0, 10)})`);
    out.push(`Topics: ${a.categories.map((k) => CATEGORIES[k].title.en).join(', ')}`);
    if (a.excerpt) out.push(a.excerpt);
    out.push('');
  }

  out.push('## Lecture series', '');
  for (const l of LECTURES) {
    out.push(`### ${pick(l.title)} (${l.years.join('–')})`);
    const venue = pick(l.venue);
    if (venue) out.push(`Venue: ${venue}`);
    const sum = pick(l.summary);
    if (sum) out.push(sum);
    out.push('');
  }

  out.push('## “Islam, why and how?” episodes', '');
  for (const ep of episodes) {
    for (const k of YT_LANGS) {
      const v = ep[k];
      if (v) out.push(`- #${ep.n} [${k}] ${v.title ?? ''} | ${v.url} (${v.date.slice(0, 10)})`);
    }
  }
  out.push('');

  out.push('## Latest Telegram notes (Persian)', '');
  // A repost is listed once, under the address of the copy that is canonical.
  const listed = new Set<string>();
  for (const n of notes.slice(0, 100)) {
    const path = duplicateOf.get(`notes/${n.id}`) ?? `notes/${n.id}`;
    if (listed.has(path)) continue;
    listed.add(path);
    out.push(`### ${o}/fa/${path}/ | ${n.date.slice(0, 10)}`, n.text.trim(), '');
  }
  return new Response(out.join('\n'), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
