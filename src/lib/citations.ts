// Reverse index: for each verse, the notes, articles, videos and other
// verses' translation notes that cite it. Built once from the texts with the
// reference finder in src/lib/quran-refs.ts.

import { articles } from './articles';
import { notes, quranFa, youtube } from './data';
import type { FeedItem } from './feed-types';
import { citedVerses, type VerseRef } from './quran-refs';
import { itemTitle } from './text';

export interface Citation {
  kind: 'note' | 'article' | 'video' | 'verse';
  /** Site path (or external URL for videos) */
  href: string;
  title: string;
  date?: string;
  /** For kind 'verse': the citing verse */
  from?: { surah: number; ayah: number };
}

const key = (surah: number, ayah: number) => `${surah}:${ayah}`;
const INDEX = new Map<string, Citation[]>();

function add(refs: VerseRef[], c: Citation) {
  const seen = new Set<string>();
  for (const r of refs) {
    // A range counts for each verse in it, up to a sensible length.
    for (let a = r.ayah; a <= Math.min(r.to ?? r.ayah, r.ayah + 9); a++) {
      const k = key(r.surah, a);
      if (seen.has(k)) continue;
      seen.add(k);
      if (c.from && c.from.surah === r.surah && c.from.ayah === a) continue;
      const list = INDEX.get(k) ?? INDEX.set(k, []).get(k)!;
      // Reposts of one note share its title; list it once (the newest copy wins, see the sort below).
      if (!list.some((x) => x.href === c.href || (x.kind === c.kind && x.title === c.title))) list.push(c);
    }
  }
}

/** Verses in a post's text, plus tanzil.net links in its HTML. */
function refsOfPost(n: FeedItem): VerseRef[] {
  const refs = citedVerses(n.text);
  for (const m of (n.html ?? '').matchAll(/tanzil\.net\/[^"#]*#(\d{1,3}):(\d{1,3})/g)) refs.push({ surah: Number(m[1]), ayah: Number(m[2]) });
  return refs;
}

for (const n of notes) {
  if (n.series === 'quran-translation') continue; // the translation posts are the verses' own source
  const refs = refsOfPost(n);
  if (refs.length) add(refs, { kind: 'note', href: `/fa/notes/${n.id}/`, title: itemTitle(n, 90) || `#${n.id}`, date: n.date });
}
for (const a of articles) {
  const refs = citedVerses(a.text);
  if (refs.length) add(refs, { kind: 'article', href: `/fa/articles/${a.id}/`, title: a.title, date: a.date });
}
for (const v of youtube.items) {
  if (v.channel !== 'fa' || !v.text) continue;
  const refs = citedVerses(v.text);
  if (refs.length) add(refs, { kind: 'video', href: v.url, title: v.title ?? '', date: v.date });
}
for (const [s, ayahs] of Object.entries(quranFa.surahs)) {
  for (const [a, v] of Object.entries(ayahs)) {
    const surah = Number(s);
    const ayah = Number(a);
    const refs = (v.notes ?? []).flatMap((x) => citedVerses(x, surah));
    if (refs.length) add(refs, { kind: 'verse', href: `/fa/quran/${surah}/${ayah}/`, title: `${surah}:${ayah}`, from: { surah, ayah } });
  }
}
for (const list of INDEX.values()) list.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

export const citationsOf = (surah: number, ayah: number): Citation[] => INDEX.get(key(surah, ayah)) ?? [];
export const citedCount = INDEX.size;
