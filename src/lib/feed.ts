// The home page's combined feed: every source, newest first, grouped by
// day, with related items folded together so nothing appears twice.
//
//  - Telegram companions of a YouTube episode (the AI clip, the podcast)
//    are attached to that episode instead of listed separately.
//  - Consecutive short videos (TikTok, YouTube Shorts) on the same day
//    become one strip.
//  - Quran-translation posts carry the verse range they produced.

import { instagram, notes, quranByPost, tiktok, youtube } from './data';
import type { FeedItem } from './feed-types';

export type FeedKind = 'note' | 'video' | 'shorts' | 'photo';

export type FeedEntry =
  | { kind: 'note'; item: FeedItem; verses?: { surah: number; from: number; to: number } }
  | { kind: 'video'; item: FeedItem; companions: FeedItem[] }
  | { kind: 'shorts'; items: FeedItem[] }
  | { kind: 'photo'; item: FeedItem };

export interface FeedDay {
  /** YYYY-MM-DD in Tehran time, where he publishes */
  key: string;
  date: string;
  entries: FeedEntry[];
}

const dayKey = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(iso),
  );

const isShort = (i: FeedItem) => i.source === 'tiktok' || i.kind === 'short';

// Every item from every source, newest first.
const ALL: FeedItem[] = [...notes, ...youtube.items, ...tiktok.items, ...instagram.items].sort((a, b) =>
  b.date.localeCompare(a.date),
);

// Telegram posts that accompany a YouTube episode (AI clip, podcast) are
// shown with the newest video of that episode, wherever they fall in time.
const episodesOnYt = new Set(youtube.items.filter((i) => i.episode).map((i) => i.episode));
const COMPANIONS = new Map<number, FeedItem[]>();
const FOLDED = new Set<string>();
for (const n of notes) {
  if (n.series === 'islam-why-how' && n.episode && episodesOnYt.has(n.episode)) {
    (COMPANIONS.get(n.episode) ?? COMPANIONS.set(n.episode, []).get(n.episode)!).push(n);
    FOLDED.add(n.id);
  }
}
const NEWEST_VIDEO_OF = new Map<number, string>();
for (const v of youtube.items) if (v.episode && !NEWEST_VIDEO_OF.has(v.episode)) NEWEST_VIDEO_OF.set(v.episode, v.id);

function buildDays(pool: FeedItem[], limit = Infinity): FeedDay[] {
  const entries: { day: string; date: string; entry: FeedEntry }[] = [];
  let used = 0;
  for (const item of pool) {
    if (used >= limit) break;
    if (item.source === 'telegram' && FOLDED.has(item.id)) continue;
    const day = dayKey(item.date);
    const prev = entries.at(-1);

    if (isShort(item)) {
      if (prev && prev.day === day && prev.entry.kind === 'shorts') {
        prev.entry.items.push(item);
        continue; // a strip counts once
      }
      entries.push({ day, date: item.date, entry: { kind: 'shorts', items: [item] } });
    } else if (item.source === 'youtube') {
      const companions =
        item.episode && NEWEST_VIDEO_OF.get(item.episode) === item.id ? (COMPANIONS.get(item.episode) ?? []) : [];
      entries.push({ day, date: item.date, entry: { kind: 'video', item, companions } });
    } else if (item.source === 'instagram') {
      entries.push({ day, date: item.date, entry: { kind: 'photo', item } });
    } else {
      entries.push({ day, date: item.date, entry: { kind: 'note', item, verses: quranByPost.get(item.id) } });
    }
    used++;
  }

  const days: FeedDay[] = [];
  for (const e of entries) {
    const last = days.at(-1);
    if (last && last.key === e.day) last.entries.push(e.entry);
    else days.push({ key: e.day, date: e.date, entries: [e.entry] });
  }
  return days;
}

export function homeFeed(limit = 36): FeedDay[] {
  return buildDays(ALL, limit);
}

/* ---------- Timeline in 10-day pages ---------- */

export const TIMELINE_SPAN = 10;
/** How far back "load more" goes before pointing to the archives. */
const TIMELINE_MAX_DAYS = 400;

export interface TimelineChunk {
  index: number;
  /** Newest and oldest calendar day covered (YYYY-MM-DD) */
  from: string;
  to: string;
  days: FeedDay[];
}

const DAY_MS = 86_400_000;

/**
 * The timeline split into windows of ten calendar days, counted back from
 * the newest post. Windows with no posts are skipped, so every "load more"
 * adds something. Index 0 is rendered on the home page; later windows are
 * pre-built fragments fetched on demand.
 */
export const TIMELINE: TimelineChunk[] = (() => {
  const newest = ALL[0] ? Date.parse(dayKey(ALL[0].date)) : Date.now();
  const chunks: TimelineChunk[] = [];
  for (let k = 0; k * TIMELINE_SPAN < TIMELINE_MAX_DAYS; k++) {
    const fromMs = newest - k * TIMELINE_SPAN * DAY_MS;
    const toMs = fromMs - (TIMELINE_SPAN - 1) * DAY_MS;
    const from = new Date(fromMs).toISOString().slice(0, 10);
    const to = new Date(toMs).toISOString().slice(0, 10);
    const pool = ALL.filter((i) => {
      const d = dayKey(i.date);
      return d <= from && d >= to;
    });
    const days = buildDays(pool);
    if (days.length) chunks.push({ index: chunks.length, from, to, days });
  }
  return chunks;
})();

/** The newest Telegram post that is an actual written note (not a clip or podcast). */
export function featuredNote(): FeedItem | undefined {
  return notes.find(
    (n) =>
      n.text.length > 400 &&
      !n.forwardedFrom &&
      n.series !== 'quran-translation' &&
      !(n.tags ?? []).some((t) => t === '#پادکست' || t === '#کلیپ_آموزشی'),
  );
}

/** Group Telegram posts by day for the Notes listing, same shape as the home feed. */
export function notesByDay(items: FeedItem[]): FeedDay[] {
  const days: FeedDay[] = [];
  for (const item of items) {
    const key = dayKey(item.date);
    const entry: FeedEntry = { kind: 'note', item, verses: quranByPost.get(item.id) };
    const last = days.at(-1);
    if (last && last.key === key) last.entries.push(entry);
    else days.push({ key, date: item.date, entries: [entry] });
  }
  return days;
}
