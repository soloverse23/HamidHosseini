// The home page's combined feed: every source, newest first, grouped by
// day, with related items folded together so nothing appears twice.
//
//  - Telegram companions of a YouTube episode (the AI clip, the podcast)
//    are attached to that episode instead of listed separately.
//  - The same upload in several languages on one day is one card; each
//    reader sees their own language first.
//  - Consecutive short videos (TikTok, YouTube Shorts) on the same day
//    become one strip.
//  - Quran-translation posts carry the verse range they produced.
//  - Persian readers also get the Imam Ali Foundation playlists (Friday
//    sermons and the other series). Those talks are not on the language
//    channels, so nothing else would surface them here.
//
// Each language version shows only what is in its own language, so an
// English reader never lands on a Persian post or a Romanian caption. The
// Persian archive (notes, articles) stays one link away.

import type { Locale } from '../i18n/locales';
import { seriesPages } from './collections';
import { instagram, notes, quranByPost, tiktok, uploadKey, youtube } from './data';
import type { FeedItem } from './feed-types';

export type FeedKind = 'note' | 'video' | 'shorts' | 'photo';

/** A foundation-series talk, shown on the Persian timeline beside the channels. */
export interface SeriesMark {
  key: string;
  title: string;
  /** Series index, without the locale prefix */
  path: string;
  /** This episode's page */
  episodePath: string;
  /** Set for a numbered series; absent for gathered single talks */
  n?: number;
  occasion?: string;
}

export type FeedEntry =
  | { kind: 'note'; item: FeedItem; verses?: { surah: number; from: number; to: number } }
  | { kind: 'video'; item: FeedItem; versions: FeedItem[]; companions: FeedItem[]; series?: SeriesMark }
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

/**
 * The language an item is written or spoken in. YouTube has one channel per
 * language. The Telegram channel and Instagram are Persian (the few posts
 * that look English are bare links); the TikTok account is Romanian.
 */
export function contentLang(i: FeedItem): string {
  if (i.source === 'youtube') return i.channel ?? i.lang ?? 'fa';
  if (i.source === 'tiktok') return i.lang ?? 'ro';
  return 'fa';
}

// Every item from every source, newest first.
const ALL: FeedItem[] = [...notes, ...youtube.items, ...tiktok.items, ...instagram.items].sort((a, b) =>
  b.date.localeCompare(a.date),
);

interface LocaleFeed {
  pool: FeedItem[];
  /** Telegram posts (AI clip, podcast) shown with an episode's video instead of on their own */
  companions: Map<number, FeedItem[]>;
  folded: Set<string>;
  /** The video of each episode that carries its companions: the newest one in this language */
  carrier: Map<number, string>;
  /** Foundation talks in this pool, keyed by YouTube id */
  seriesOf: Map<string, SeriesMark>;
}

/** Foundation talks, newest or not. A video that lives in two series is kept once. */
const FOUNDATION: { item: FeedItem; mark: SeriesMark }[] = (() => {
  const out: { item: FeedItem; mark: SeriesMark }[] = [];
  const seen = new Set<string>();
  for (const series of seriesPages()) {
    for (const ep of series.episodes) {
      if (seen.has(ep.id)) continue;
      seen.add(ep.id);
      out.push({
        item: {
          source: 'youtube',
          id: ep.id,
          url: ep.url,
          date: ep.date,
          kind: 'video',
          lang: 'fa',
          channel: 'fa',
          title: ep.title,
          text: ep.text ?? '',
          media: [{ kind: 'video', src: `https://i.ytimg.com/vi/${ep.id}/hqdefault.jpg`, width: 480, height: 360, duration: ep.duration }],
        },
        mark: {
          key: series.key,
          title: series.title,
          path: series.path,
          episodePath: ep.path,
          n: series.numbered ? ep.n : undefined,
          occasion: ep.occasion,
        },
      });
    }
  }
  return out;
})();

const FEEDS = new Map<Locale, LocaleFeed>();
function feedFor(locale: Locale): LocaleFeed {
  const cached = FEEDS.get(locale);
  if (cached) return cached;
  // The language channels already carry "Islam: why and how?". The foundation
  // series are Persian talks on another channel, so only Persian readers see them,
  // and a video already in the channel feed is not listed twice.
  const own = new Set(ALL.filter((i) => contentLang(i) === locale).map((i) => i.id));
  const extra = locale === 'fa' ? FOUNDATION.filter((row) => !own.has(row.item.id)) : [];
  const seriesOf = new Map(extra.map((row) => [row.item.id, row.mark]));
  const pool = [...ALL.filter((i) => contentLang(i) === locale), ...extra.map((row) => row.item)].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const carrier = new Map<number, string>();
  for (const v of pool) if (v.source === 'youtube' && v.episode && !carrier.has(v.episode)) carrier.set(v.episode, v.id);
  const companions = new Map<number, FeedItem[]>();
  const folded = new Set<string>();
  for (const n of pool) {
    if (n.source === 'telegram' && n.series === 'islam-why-how' && n.episode && carrier.has(n.episode)) {
      (companions.get(n.episode) ?? companions.set(n.episode, []).get(n.episode)!).push(n);
      folded.add(n.id);
    }
  }
  const feed = { pool, companions, folded, carrier, seriesOf };
  FEEDS.set(locale, feed);
  return feed;
}

function buildDays(locale: Locale, pool: FeedItem[], limit = Infinity): FeedDay[] {
  const { folded, companions: COMPANIONS, carrier, seriesOf } = feedFor(locale);
  const entries: { day: string; date: string; entry: FeedEntry }[] = [];
  let used = 0;
  for (const item of pool) {
    if (used >= limit) break;
    if (item.source === 'telegram' && folded.has(item.id)) continue;
    const day = dayKey(item.date);
    const prev = entries.at(-1);

    if (isShort(item)) {
      if (prev && prev.day === day && prev.entry.kind === 'shorts') {
        prev.entry.items.push(item);
        continue; // a strip counts once
      }
      entries.push({ day, date: item.date, entry: { kind: 'shorts', items: [item] } });
    } else if (item.source === 'youtube') {
      const key = uploadKey.get(item.id);
      const twin = key
        ? entries.find((e) => e.day === day && e.entry.kind === 'video' && uploadKey.get(e.entry.item.id) === key)
        : undefined;
      if (twin?.entry.kind === 'video') {
        twin.entry.versions.push(item);
        continue; // one card per upload
      }
      const companions = item.episode && carrier.get(item.episode) === item.id ? (COMPANIONS.get(item.episode) ?? []) : [];
      entries.push({
        day,
        date: item.date,
        entry: { kind: 'video', item, versions: [item], companions, series: seriesOf.get(item.id) },
      });
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

const TIMELINES = new Map<Locale, TimelineChunk[]>();

/**
 * The timeline split into windows of ten calendar days, counted back from
 * the newest post. Windows with no posts are skipped, so every "load more"
 * adds something. Index 0 is rendered on the home page; later windows are
 * pre-built fragments fetched on demand.
 */
export function timeline(locale: Locale): TimelineChunk[] {
  const cached = TIMELINES.get(locale);
  if (cached) return cached;
  const ALL = feedFor(locale).pool;
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
    const days = buildDays(locale, pool);
    if (days.length) chunks.push({ index: chunks.length, from, to, days });
  }
  TIMELINES.set(locale, chunks);
  return chunks;
}

/** A repost of his own earlier note (forwarded from his channel) counts as his note. */
const isOwn = (n: FeedItem) =>
  !n.forwardedFrom ||
  /^https:\/\/t\.me\/hamidhossaini\//.test(n.forwardedFrom.url ?? '') ||
  /حمید حسینی|Hamid Hosseini/i.test(n.forwardedFrom.name);

/**
 * The newest Telegram post that is an actual written note (not a clip,
 * podcast or Quran translation). Posts are Persian, so other languages get
 * the newest long-form item in their own language (a video with its
 * description), and the Persian note only when there is none.
 */
export function featuredNote(locale: Locale): FeedItem | undefined {
  const note =
    notes.find((n) => n.pinned) ??
    notes.find(
      (n) =>
        n.text.length > 400 &&
        isOwn(n) &&
        n.series !== 'quran-translation' &&
        !(n.tags ?? []).some((t) => t === '#پادکست' || t === '#کلیپ_آموزشی'),
    );
  if (locale === 'fa') return note;
  const pool = feedFor(locale).pool.filter((i) => !isShort(i) && i.text.trim());
  return pool.find((i) => i.text.length > 400) ?? pool[0] ?? note;
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
