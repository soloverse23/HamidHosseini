// The series shown under "Series", in the order they appear on the page.
// "Islam: why and how?" is built from the five language channels; the
// Persian-only series of the Imam Ali Foundation come from
// src/data/collections (sources.ts lists them, the fetcher fills fa.json).
// A reader only ever sees episodes that exist in their own language.

import seriesFile from '../data/collections/fa.json';
import { FOUNDATION_CHANNEL, PLAYLISTS, type PlaylistSource, type SeriesGroup } from '../data/collections/sources';
import { LOCALES, type Locale } from '../i18n/locales';
import { t } from '../i18n/strings';
import { episodesIn, isYtLang, ytOrder, type YtLang } from './data';
import { withoutEpisodeNo } from './series';
import { toAsciiDigits } from './text';
import { CHANNELS, type Channel } from './social';

export interface CollectionEpisode {
  n: number;
  date: string;
  /** YouTube id */
  id: string;
  title: string;
  /** Language of the title and the talk */
  lang: string;
  duration?: number;
  text?: string;
  /** The occasion a single talk was given at, shown above its title */
  occasion?: string;
  /** Every language this episode exists in */
  langs: YtLang[];
  /** Page of this episode on the site */
  path: string;
  /** The video on YouTube */
  url: string;
}

export interface Collection {
  key: string;
  title: string;
  lede: string;
  group: 'featured' | SeriesGroup;
  /** False for gathered single talks: no episode numbers, newest first */
  numbered: boolean;
  /** Newest first */
  episodes: CollectionEpisode[];
  /** The channel in the reader's language */
  channel?: Channel;
  /** The same series in other languages, the likeliest ones first */
  elsewhere: Channel[];
  /** Languages the series is published in */
  langs: YtLang[];
  playlistUrl?: string;
  /** Gregorian year of the first session, when it predates the first upload */
  started?: number;
  /** Where the series lives on the site */
  path: string;
}

interface SeriesVideo {
  id: string;
  title: string;
  date: string;
  duration?: number;
  text?: string;
  pos: number;
}
const stored = (seriesFile as { series: Record<string, SeriesVideo[]> }).series;

const ytUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

function islamWhyHow(locale: Locale): Collection[] {
  const episodes = episodesIn(locale).map((ep): CollectionEpisode => {
    const v = ep[locale as YtLang]!;
    return {
      n: ep.n,
      date: ep.date,
      id: v.id,
      title: withoutEpisodeNo(v.title),
      lang: v.lang ?? locale,
      duration: v.media[0]?.duration,
      text: v.text,
      langs: ytOrder(locale).filter((k) => ep[k]),
      path: `videos/${ep.n}`,
      url: v.url,
    };
  });
  if (!episodes.length) return [];
  const all = ytOrder(locale).flatMap((k) => CHANNELS.find((c) => c.id === `youtube-${k}`) ?? []);
  return [
    {
      key: 'islam-why-how',
      ...t(locale).sections.videos,
      group: 'featured',
      numbered: true,
      episodes,
      channel: isYtLang(locale) ? all.find((c) => c.lang === locale) : undefined,
      elsewhere: all.filter((c) => c.lang !== locale),
      langs: all.map((c) => c.lang),
      path: 'series/islam-why-how',
    },
  ];
}

// Also drops zero-width non-joiners left dangling next to a space ("خطبه‌ متقین").
const clean = (s: string) => s.replace(/\u200c+(?=\s)|(?<=\s)\u200c+/g, '').replace(/\s+/g, ' ').trim();

/** "سخنرانی مراسم اربعین: نجات از جهالت – شهریور ۱۴۰۳" → occasion + title, without the date. */
function splitTalk(raw: string): { occasion?: string; title: string } {
  const s = clean(raw)
    .replace(/^سخنرانی\s+/, '')
    .replace(/\s+[–-]\s+[^–-]*[۰-۹]{4}\s*$/, '');
  const at = s.indexOf(': ');
  return at > 0 ? { occasion: s.slice(0, at), title: s.slice(at + 2) } : { title: s };
}

/** A video's title with the series' own rewrites applied, then tidied. */
function episodeTitle(raw: string, src: PlaylistSource): string {
  let s = clean(raw);
  for (const [from, to] of src.titles ?? []) s = s.replace(from, to);
  return clean(s).replace(/^[\s:،|\-–ـ]+|[\s:،|\-–ـ]+$/g, '') || clean(raw);
}

const UNITS = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه', 'ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
const TENS: Record<string, number> = { بیست: 20, سی: 30, چهل: 40, پنجاه: 50, شصت: 60, هفتاد: 70, هشتاد: 80, نود: 90 };

/** "اول" → 1, "بیست و یکم" → 21 */
function ordinal(word: string): number | undefined {
  if (word === 'اول') return 1;
  const parts = word.replace(/م$/, '').replace(/^سو$/, 'سه').split(/\s+و\s+/);
  let total = 0;
  for (const p of parts) {
    if (p in TENS) total += TENS[p];
    else if (UNITS.includes(p)) total += UNITS.indexOf(p);
    else return undefined;
  }
  return total || undefined;
}

const SESSION = /(جلسه|شب)[ٔی]?\s+([0-9۰-۹]+|[آ-ی]+(?:\s+و\s+[آ-ی]+)?)/;

/** The session or night a title names: "جلسه ۴۵", "جلسهٔ اول", "شب بیست و یکم" */
function sessionOf(title: string): { n: number; night: boolean } | undefined {
  const m = title.match(SESSION);
  if (!m) return undefined;
  const n = /[0-9۰-۹]/.test(m[2]) ? Number(toAsciiDigits(m[2])) : ordinal(m[2]);
  return n && Number.isFinite(n) ? { n, night: m[1] === 'شب' } : undefined;
}

/** "جلسهٔ اول: اخلاق ایمانی" → "اخلاق ایمانی"; a bare "جلسه ۱" takes the topic from the description. */
function topicTitle(title: string, text = ''): string {
  const m = title.match(new RegExp(`^${SESSION.source}\\s*[:：]?\\s*(.*)$`));
  if (!m) return title;
  const topic = m[3] || text.match(/^موضوع(?:\s+این\s+جلسه)?\s*[:：]?\s*(.+)/)?.[1]?.trim();
  return topic || title;
}

function foundationSeries(src: PlaylistSource): Collection | undefined {
  const videos = stored[src.key] ?? [];
  if (!videos.length) return undefined;
  const numbered = !!src.playlist;
  // Uploads are not always in the order the sessions were given. When every
  // title names its session, that number orders the series and is the
  // episode number; otherwise the upload date does.
  const ascending = videos.length < 2 || videos[0].date <= videos[videos.length - 1].date;
  const sessions = videos.map((v) => sessionOf(v.title));
  const bySession = numbered && sessions.every(Boolean) && new Set(sessions.map((x) => x!.n)).size === sessions.length;
  // Nights (۱۹, ۲۱, ۲۳ of Ramadan) order the series but are not episode numbers.
  const sessionNo = bySession && !sessions.some((x) => x!.night);
  const ordered = videos
    .map((v, i) => ({ v, session: sessions[i]?.n }))
    .sort((a, b) =>
      bySession
        ? a.session! - b.session!
        : a.v.date.localeCompare(b.v.date) || (ascending ? a.v.pos - b.v.pos : b.v.pos - a.v.pos),
    );
  const episodes = ordered
    .map(({ v, session }, i): CollectionEpisode => {
      const n = sessionNo ? session! : i + 1;
      // The card shows the number, so "جلسهٔ ۵:" goes when it is the same number.
      const own = session === n && !sessions[videos.indexOf(v)]!.night;
      const { occasion, title } = numbered
        ? { occasion: undefined, title: own ? topicTitle(episodeTitle(v.title, src), v.text) : episodeTitle(v.title, src) }
        : splitTalk(v.title);
      return {
        n,
        date: v.date,
        id: v.id,
        title,
        lang: 'fa',
        duration: v.duration,
        text: v.text,
        occasion,
        langs: ['fa'],
        path: `series/${src.key}/${n}`,
        url: ytUrl(v.id),
      };
    })
    .reverse();
  return {
    key: src.key,
    title: src.title,
    lede: src.lede,
    group: src.group,
    numbered,
    episodes,
    elsewhere: [],
    langs: ['fa'],
    playlistUrl: src.playlist ? `https://www.youtube.com/playlist?list=${src.playlist}` : FOUNDATION_CHANNEL,
    started: src.started,
    path: `series/${src.key}`,
  };
}

export function collectionsFor(locale: Locale): Collection[] {
  const foundation = locale === 'fa' ? PLAYLISTS.flatMap((src) => foundationSeries(src) ?? []) : [];
  return [...islamWhyHow(locale), ...foundation];
}

/** Persian series of the Imam Ali Foundation, whose episodes have pages under series/ */
export const seriesPages = () => collectionsFor('fa').filter((c) => c.group !== 'featured');

/** Every series page in every language that has the series */
export const allSeries = () => LOCALES.flatMap((locale) => collectionsFor(locale).map((c) => ({ locale, c })));

/** Languages that have their own copy of a series */
export const seriesLocales = (key: string) => LOCALES.filter((l) => collectionsFor(l).some((c) => c.key === key));
