// The same text published more than once: a Telegram post reposted years
// later, a lecture posted as video and then as audio with the same caption,
// or a kalaam.ir article also posted on Telegram. Each group of copies gets
// one canonical page; the others point their canonical at it and stay out of
// the sitemap. Used by the note pages and by the sitemap in astro.config.mjs.
//
// Which copy wins: the article (full text, headings, series); else the post
// with the video; else the earliest post (a repost points back at the original).

import { articles } from './articles';
import { notes } from './data';
import type { FeedItem } from './feed-types';
import { isThin } from './text';

/** Share of 5-word runs each text must find in the other. */
const OVERLAP = 0.7;
/** Shorter texts (a caption, a line of hashtags) are left alone. */
const MIN_SHINGLES = 15;

/** 5-word runs, each kept as a 32-bit FNV-1a hash: strings would cost hundreds of MB. */
const shingles = (text: string) => {
  const w = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  const out = new Set<number>();
  for (let i = 0; i + 5 <= w.length; i++) {
    let h = 0x811c9dc5;
    for (let k = i; k < i + 5; k++) {
      const word = w[k];
      for (let c = 0; c < word.length; c++) h = Math.imul(h ^ word.charCodeAt(c), 0x01000193);
      h = Math.imul(h ^ 32, 0x01000193);
    }
    out.add(h >>> 0);
  }
  return out;
};

interface Doc {
  /** Path without locale: "notes/123" or "articles/456" */
  path: string;
  date: string;
  rank: number;
  set: Set<number>;
  /** Playable media with a length; two different recordings are not copies. */
  durations: Map<string, string>;
}

const durations = (item: FeedItem) =>
  new Map(item.media.filter((m) => m.duration && (m.kind === 'video' || m.kind === 'audio')).map((m) => [m.kind, String(m.duration)]));

const differentRecording = (a: Doc, b: Doc) =>
  [...a.durations].some(([kind, d]) => b.durations.has(kind) && b.durations.get(kind) !== d);

// Everything but the result is local, so the shingle sets are freed once done.
function findCopies() {
  const docs: Doc[] = [
    ...articles.map((a) => ({ path: `articles/${a.id}`, date: a.date, rank: 0, set: shingles(a.text), durations: new Map() })),
    ...notes
      .filter((n) => !isThin(n))
      .map((n) => ({
        path: `notes/${n.id}`,
        date: n.date,
        rank: n.media.some((m) => m.kind === 'video') ? 1 : 2,
        set: shingles(n.text),
        durations: durations(n),
      })),
  ].filter((d) => d.set.size >= MIN_SHINGLES);

  // Union–find over pairs that share most of their text both ways.
  const parent = docs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const index = new Map<number, number[]>();
  docs.forEach((d, i) => d.set.forEach((s) => (index.get(s) ?? index.set(s, []).get(s)!).push(i)));
  docs.forEach((d, i) => {
    const shared = new Map<number, number>();
    for (const s of d.set) for (const j of index.get(s)!) if (j > i) shared.set(j, (shared.get(j) ?? 0) + 1);
    for (const [j, n] of shared) {
      if (n / d.set.size >= OVERLAP && n / docs[j].set.size >= OVERLAP && !differentRecording(d, docs[j])) {
        parent[find(j)] = find(i);
      }
    }
  });

  const groups = new Map<number, Doc[]>();
  docs.forEach((d, i) => (groups.get(find(i)) ?? groups.set(find(i), []).get(find(i))!).push(d));

  const out = new Map<string, string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const [best, ...rest] = group.sort((a, b) => a.rank - b.rank || a.date.localeCompare(b.date));
    for (const d of rest) out.set(d.path, best.path);
  }
  return out;
}

/** Path (without locale) → the path of the copy that is canonical, for the copies that are not. */
export const duplicateOf = findCopies();
