// Build-time access to everything the fetchers wrote. Pages import from here
// rather than reading JSON directly so derived views stay in one place.

import telegramFeed from '../data/feeds/telegram.json';
import youtubeFeed from '../data/feeds/youtube.json';
import tiktokFeed from '../data/feeds/tiktok.json';
import instagramFeed from '../data/feeds/instagram.json';
import instagramManual from '../data/instagram-manual.json';
import surahsJson from '../data/quran/surahs.json';
import arabicJson from '../data/quran/arabic.json';
import faTranslation from '../data/quran/fa.json';
import { LECTURES } from '../data/writings';
import type { FeedFile, FeedItem } from './feed-types';

export const telegram = telegramFeed as unknown as FeedFile;
export const youtube = youtubeFeed as unknown as FeedFile;
export const tiktok = tiktokFeed as unknown as FeedFile;
export const instagram = instagramFeed as unknown as FeedFile;
export const instagramManualPosts = (instagramManual as { posts: string[] }).posts;

export const CHANNEL_URLS = {
  telegram: 'https://t.me/hamidhossaini',
  telegramPersonal: 'https://t.me/hamidhosseiniii',
  youtubeFa: 'https://www.youtube.com/@kalam-hamidhossaini',
  youtubeRo: 'https://www.youtube.com/@Islamdece%C8%99icum',
  tiktok: 'https://www.tiktok.com/@islam.de.ce.si.cum',
  instagram: 'https://www.instagram.com/kalam_hamidhosseini/',
} as const;

/* ---------- Telegram ---------- */

export const notes: FeedItem[] = telegram.items;
export const noteById = new Map(notes.map((n) => [n.id, n]));

/* ---------- YouTube ---------- */

export interface Episode {
  n: number;
  fa?: FeedItem;
  ro?: FeedItem;
  date: string;
}

const ytVideos = youtube.items.filter((i) => i.kind === 'video');

export const episodes: Episode[] = (() => {
  const map = new Map<number, Episode>();
  for (const v of ytVideos) {
    if (!v.episode) continue;
    const ep = map.get(v.episode) ?? { n: v.episode, date: v.date };
    if (v.channel === 'fa' || v.channel === 'ro') ep[v.channel] ??= v;
    if (v.date < ep.date) ep.date = v.date;
    map.set(v.episode, ep);
  }
  return [...map.values()].sort((a, b) => b.n - a.n);
})();

export const otherTalks = ytVideos.filter((v) => !v.episode);
export const shorts = youtube.items.filter((i) => i.kind === 'short');

/* ---------- Quran ---------- */

export interface SurahMeta {
  n: number;
  ar: string;
  fa: string;
  translit: string;
  en: string;
  ayahs: number;
  place: 'mecca' | 'medina';
}
export interface TranslatedAyah {
  text: string;
  notes?: string[];
  post: number;
  date: string;
}

export const surahs = surahsJson as SurahMeta[];
export const arabic = arabicJson as Record<string, string[]>;
export const quranFa = faTranslation as unknown as {
  title: string;
  updatedAt: string;
  surahs: Record<string, Record<string, TranslatedAyah>>;
};

export const translatedCount = (n: number) => Object.keys(quranFa.surahs[n] ?? {}).length;
export const totalTranslated = surahs.reduce((sum, s) => sum + translatedCount(s.n), 0);
export const surahsStarted = surahs.filter((s) => translatedCount(s.n) > 0).length;

/** The surah and highest verse from the most recent translation post. */
export const quranNow = (() => {
  let best: { surah: number; ayah: number; date: string } | undefined;
  for (const [s, ayahs] of Object.entries(quranFa.surahs)) {
    for (const [a, v] of Object.entries(ayahs)) {
      if (!best || v.date > best.date || (v.date === best.date && Number(a) > best.ayah))
        best = { surah: Number(s), ayah: Number(a), date: v.date };
    }
  }
  return best;
})();

/* ---------- Lecture series (PDF sessions on Telegram) ---------- */

export const lectureSessions = Object.fromEntries(
  LECTURES.map((series) => {
    const sessions = notes
      .filter((n) => n.media.some((m) => m.kind === 'document' && m.title && series.match.test(m.title)))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((n) => ({ item: n, title: n.media.find((m) => m.kind === 'document')!.title!.replace(/\.pdf$/i, '') }));
    return [series.id, sessions];
  }),
) as Record<string, { item: FeedItem; title: string }[]>;

/* ---------- Everything ---------- */

/**
 * Latest items across sources, newest first. Short clips (TikTok, Shorts)
 * have their own pages; their captions are mostly hashtags, so they are left
 * out of the mixed timeline.
 */
export function latest(limit: number): FeedItem[] {
  const pool = [
    ...notes.slice(0, limit),
    ...youtube.items.filter((i) => i.kind === 'video').slice(0, limit),
    ...instagram.items.slice(0, limit),
  ];
  return pool.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

export const lastUpdated = [telegram, youtube, tiktok, instagram]
  .map((f) => f.items[0]?.date ?? f.updatedAt)
  .sort()
  .at(-1)!;

/** Verse range produced by each Quran-translation post. */
export const quranByPost = (() => {
  const map = new Map<string, { surah: number; from: number; to: number }>();
  for (const [surah, ayahs] of Object.entries(quranFa.surahs)) {
    for (const [a, v] of Object.entries(ayahs)) {
      const key = String(v.post);
      const n = Number(a);
      const prev = map.get(key);
      if (!prev) map.set(key, { surah: Number(surah), from: n, to: n });
      else if (prev.surah === Number(surah)) {
        prev.from = Math.min(prev.from, n);
        prev.to = Math.max(prev.to, n);
      }
    }
  }
  return map;
})();
