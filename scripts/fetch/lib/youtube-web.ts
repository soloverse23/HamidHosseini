/**
 * Public YouTube pages and the player API, for when yt-dlp or the RSS feed
 * cannot list a video or will not say when it was published.
 *
 * The watch page is enough from a normal network. From GitHub's runners it is
 * often a shell with no publishDate, and the RSS feed answers 404 for hours
 * at a time. The player API still returns the date, title and description,
 * and the playlist/channel HTML still lists the videos.
 */
import { fetchText } from './store';

export interface ListedVideo {
  id: string;
  title?: string;
  duration?: number;
  /** Index in the listing that produced it, when that listing is complete */
  pos?: number;
}

export interface VideoDetails {
  date?: string;
  duration?: number;
  title?: string;
  text?: string;
  /** Private or deleted. Nothing to publish, and not a failed fetch. */
  unavailable?: boolean;
}

const PLAYER = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const WEB_CLIENT = { clientName: 'WEB', clientVersion: '2.20251021.01.00', hl: 'en', gl: 'US' };

export const unavailable = (title?: string) => !!title && /^\[?(private|deleted) video\]?$/i.test(title.trim());

const blocked = (status?: string, reason?: string) => status === 'LOGIN_REQUIRED' || /private|deleted/i.test(reason ?? '');

function iso(raw?: string): string | undefined {
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** "40:59" or "1:02:03" → seconds. */
function clock(text?: string): number | undefined {
  const m = text?.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (!m) return undefined;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function unescapeJson(raw: string): string | undefined {
  try {
    const text = JSON.parse(`"${raw}"`).trim();
    return text || undefined;
  } catch {
    return undefined;
  }
}

function initialData(html: string): unknown {
  const marker = html.match(/ytInitialData\s*=\s*/);
  if (!marker || marker.index === undefined) return undefined;
  const start = html.indexOf('{', marker.index + marker[0].length);
  if (start < 0) return undefined;
  let depth = 0;
  for (let i = start; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}

function collectLockups(node: unknown, out: any[] = []): any[] {
  if (!node || typeof node !== 'object') return out;
  const lockup = (node as any).lockupViewModel;
  if (lockup?.contentId) out.push(lockup);
  for (const value of Object.values(node as object)) {
    if (value && typeof value === 'object') collectLockups(value, out);
  }
  return out;
}

function durationOf(lockup: any): number | undefined {
  for (const overlay of lockup.contentImage?.thumbnailViewModel?.overlays ?? []) {
    const text = overlay.thumbnailBottomOverlayViewModel?.badges?.[0]?.thumbnailBadgeViewModel?.text;
    const seconds = clock(typeof text === 'string' ? text : undefined);
    if (seconds) return seconds;
  }
  return undefined;
}

/** Videos a playlist or channel tab renders in its first page, in that order. */
export async function pageVideos(url: string, lang = 'en'): Promise<ListedVideo[] | undefined> {
  try {
    const html = await fetchText(url, {
      headers: { cookie: 'SOCS=CAI', 'accept-language': `${lang},en;q=0.5` },
    });
    const data = initialData(html);
    if (!data) return undefined;
    const seen = new Set<string>();
    const videos: ListedVideo[] = [];
    for (const lockup of collectLockups(data)) {
      const id = String(lockup.contentId ?? '');
      if (!/^[A-Za-z0-9_-]{11}$/.test(id) || seen.has(id)) continue;
      const title = lockup.metadata?.lockupMetadataViewModel?.title?.content;
      if (unavailable(typeof title === 'string' ? title : undefined)) continue;
      seen.add(id);
      videos.push({
        id,
        title: typeof title === 'string' && title.trim() ? title.trim() : undefined,
        duration: durationOf(lockup),
      });
    }
    return videos.length ? videos : undefined;
  } catch (err) {
    console.warn(`  page listing failed for ${url}: ${(err as Error).message.split('\n')[0]}`);
    return undefined;
  }
}

async function fromWatch(id: string): Promise<VideoDetails | undefined> {
  const html = await fetchText(`https://www.youtube.com/watch?v=${id}`, { headers: { cookie: 'SOCS=CAI' } });
  const date = html.match(/"publishDate":"([^"]+)"/)?.[1] ?? html.match(/itemprop="datePublished" content="([^"]+)"/)?.[1];
  const length = Number(html.match(/"lengthSeconds":"(\d+)"/)?.[1]) || undefined;
  const title = html.match(/<meta name="title" content="([^"]*)"/)?.[1];
  const raw = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/)?.[1];
  const published = iso(date);
  const status = html.match(/"status":"(LOGIN_REQUIRED|ERROR|UNPLAYABLE)"/)?.[1];
  const reason = html.match(/"reason":"([^"]+)"/)?.[1];
  return {
    date: published,
    duration: length,
    title: title || undefined,
    text: raw ? unescapeJson(raw) : undefined,
    unavailable: !published && blocked(status, reason),
  };
}

/** Date, length and description from the player API. Works when the watch HTML is a consent shell. */
async function fromPlayer(id: string): Promise<VideoDetails | undefined> {
  const raw = await fetchText(PLAYER, {
    method: 'POST',
    body: JSON.stringify({ context: { client: WEB_CLIENT }, videoId: id }),
    headers: { 'content-type': 'application/json' },
  });
  const data = JSON.parse(raw);
  const micro = data?.microformat?.playerMicroformatRenderer;
  const details = data?.videoDetails;
  const date = iso(micro?.publishDate || micro?.uploadDate);
  const duration = Number(micro?.lengthSeconds || details?.lengthSeconds) || undefined;
  const title = micro?.title?.simpleText || details?.title || undefined;
  const text = String(details?.shortDescription || micro?.description?.simpleText || '').trim() || undefined;
  const status = data?.playabilityStatus?.status as string | undefined;
  const reason = data?.playabilityStatus?.reason as string | undefined;
  if (!date && !title) return blocked(status, reason) ? { unavailable: true } : undefined;
  return { date, duration, title, text };
}

/** Publish date and description. The watch page first; the player API fills whatever it withheld. */
export async function videoDetails(id: string): Promise<VideoDetails> {
  const page = await fromWatch(id).catch(() => undefined);
  if (page?.date) return page;
  const player = await fromPlayer(id).catch((err) => {
    console.warn(`  player details failed for ${id}: ${(err as Error).message.split('\n')[0]}`);
    return undefined;
  });
  if (player?.date) {
    return {
      date: player.date,
      duration: page?.duration ?? player.duration,
      title: page?.title || player.title,
      text: page?.text ?? player.text,
    };
  }
  // A sign-in wall on the watch page is not proof: the player API still dates
  // a public video. Only give up when the player agrees it is private.
  if (player?.unavailable) return { unavailable: true };
  return {
    duration: page?.duration ?? player?.duration,
    title: page?.title || player?.title,
    text: page?.text ?? player?.text,
  };
}
