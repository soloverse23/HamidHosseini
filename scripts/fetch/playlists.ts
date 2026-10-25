/**
 * Series on the Imam Ali Foundation's YouTube channel → src/data/collections/fa.json
 *
 * The list of series lives in src/data/collections/sources.ts. Each playlist is
 * read from yt-dlp and, beside that, from the playlist page itself. The page
 * is what still shows a video just added when yt-dlp is blocked or a step
 * behind, and the RSS feed is only a last resort: YouTube often answers it
 * with 404. A video is never dropped for lack of a publish date — the player
 * API supplies the date when the watch page does not — and a playlist that
 * cannot be read at all keeps what was stored.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { PLAYLISTS } from '../../src/data/collections/sources';
import { fetchText, ROOT, sleep } from './lib/store';
import { pageVideos, unavailable, videoDetails, type ListedVideo } from './lib/youtube-web';
import { ytdlpJson } from './lib/ytdlp';

export interface SeriesVideo {
  id: string;
  title: string;
  date: string;
  duration?: number;
  text?: string;
  /** Position in the playlist, which breaks ties between same-day uploads */
  pos: number;
}

export interface SeriesFile {
  updatedAt: string;
  series: Record<string, SeriesVideo[]>;
}

const FILE = join(ROOT, 'src/data/collections/fa.json');

async function readStore(): Promise<SeriesFile> {
  try {
    return JSON.parse(await readFile(FILE, 'utf8'));
  } catch {
    return { updatedAt: new Date(0).toISOString(), series: {} };
  }
}

/** Latest 15 videos of a playlist, from its public RSS feed. Often 404. */
async function fromRss(playlist: string): Promise<ListedVideo[] | undefined> {
  try {
    const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?playlist_id=${playlist}`);
    const feed = new XMLParser().parse(xml).feed;
    const videos = [feed?.entry ?? []].flat().flatMap((e: any) => {
      const id = String(e?.['yt:videoId'] ?? '');
      return /^[A-Za-z0-9_-]{11}$/.test(id) && !unavailable(String(e?.title ?? '')) ? [{ id, title: String(e.title) }] : [];
    });
    return videos.length ? videos : undefined;
  } catch {
    return undefined;
  }
}

function listedFromYtdlp(list: any): { items: ListedVideo[]; authoritative: boolean } | undefined {
  const entries: any[] = list?.entries ?? [];
  if (!entries.length) return undefined;
  const items: ListedVideo[] = [];
  for (const [pos, e] of entries.entries()) {
    if (!e?.id || unavailable(e.title)) continue;
    items.push({
      id: String(e.id),
      title: e.title || undefined,
      duration: typeof e.duration === 'number' && e.duration > 0 ? e.duration : undefined,
      pos,
    });
  }
  if (!items.length) return undefined;
  const declared = Number(list.playlist_count) || 0;
  // playlist_count includes private rows. A shorter entries array is a partial
  // page, which must not replace the videos we already stored.
  return { items, authoritative: declared > 0 && entries.length >= declared };
}

/** First listing wins a field it actually has; later listings fill the gaps. */
function absorb(into: ListedVideo[], seen: Map<string, number>, video: ListedVideo) {
  const at = seen.get(video.id);
  if (at === undefined) {
    seen.set(video.id, into.length);
    into.push({ ...video });
    return;
  }
  const prev = into[at];
  into[at] = { ...prev, title: prev.title || video.title, duration: prev.duration ?? video.duration };
}

/**
 * yt-dlp's full list keeps playlist order, including the index of a private
 * row. Anything the live page shows that yt-dlp missed is ordered with the
 * page, and a partial list never discards videos already stored.
 */
function combine(full: { items: ListedVideo[]; authoritative: boolean } | undefined, recent: ListedVideo[], stored: SeriesVideo[]): ListedVideo[] {
  if (full?.authoritative) {
    const have = new Set(full.items.map((video) => video.id));
    if (recent.every((video) => have.has(video.id))) return full.items;
    const into: ListedVideo[] = [];
    const seen = new Map<string, number>();
    for (const video of recent) absorb(into, seen, video);
    for (const video of full.items) absorb(into, seen, video);
    return into.map((video, pos) => ({ ...video, pos }));
  }

  const into: ListedVideo[] = [];
  const seen = new Map<string, number>();
  for (const video of recent) absorb(into, seen, video);
  for (const video of full?.items ?? []) absorb(into, seen, video);
  for (const video of stored) absorb(into, seen, { id: video.id, title: video.title, duration: video.duration });
  return into.map((video, pos) => ({ ...video, pos }));
}

/** `missing` is a public video we still cannot date. A private row is neither. */
async function complete(video: ListedVideo, known: Map<string, SeriesVideo>): Promise<{ video?: SeriesVideo; missing?: boolean }> {
  const prev = known.get(video.id);
  const pos = video.pos ?? prev?.pos ?? 0;
  if (prev) return { video: { ...prev, title: video.title ?? prev.title, duration: video.duration ?? prev.duration, pos } };
  const details = await videoDetails(video.id);
  await sleep(300);
  if (details.unavailable || unavailable(details.title)) return {};
  if (!details.date) return { missing: true };
  return {
    video: {
      id: video.id,
      title: video.title ?? details.title ?? '',
      date: details.date,
      duration: video.duration ?? details.duration,
      text: details.text,
      pos,
    },
  };
}

export async function run() {
  const store = await readStore();
  const next: Record<string, SeriesVideo[]> = {};
  const problems: string[] = [];
  let unread = 0;

  for (const src of PLAYLISTS) {
    const stored = store.series[src.key] ?? [];
    const known = new Map(stored.map((video) => [video.id, video]));

    if (!src.playlist) {
      const videos: SeriesVideo[] = [];
      const unresolved: string[] = [];
      for (const [pos, [id, title]] of (src.videos ?? []).entries()) {
        const done = await complete({ id, title, pos }, known);
        if (done.video) videos.push(done.video);
        else if (done.missing) unresolved.push(id);
      }
      next[src.key] = videos.length ? videos : stored;
      if (unresolved.length) problems.push(`${src.key}: no date for ${unresolved.join(', ')}`);
      console.log(`  ${src.key}: ${next[src.key].length} videos`);
      continue;
    }

    const full = listedFromYtdlp(await ytdlpJson(`https://www.youtube.com/playlist?list=${src.playlist}`, ['--flat-playlist']));
    // The page is the fresh head of the playlist. RSS only if the page is blocked.
    const recent =
      (await pageVideos(`https://www.youtube.com/playlist?list=${src.playlist}&hl=fa`, 'fa')) ??
      (await fromRss(src.playlist)) ??
      [];
    const ordered = combine(full, recent, stored);
    if (!ordered.length) {
      unread++;
      next[src.key] = stored;
      console.log(`  ${src.key}: kept ${stored.length} stored videos`);
      continue;
    }

    const videos: SeriesVideo[] = [];
    const unresolved: string[] = [];
    const onPage = new Set(recent.map((video) => video.id));
    let hidden = 0;
    for (const video of ordered) {
      // yt-dlp keeps private rows that the public page does not. They have no
      // title. A public upload still has its title on the page.
      if (!video.title && !onPage.has(video.id) && !known.has(video.id)) {
        hidden++;
        continue;
      }
      const done = await complete(video, known);
      if (done.video) videos.push(done.video);
      else if (done.missing) unresolved.push(video.id);
    }
    next[src.key] = videos.length ? videos : stored;
    const added = videos.filter((video) => !known.has(video.id)).map((video) => video.id);
    if (unresolved.length) problems.push(`${src.key}: no date for ${unresolved.join(', ')}`);
    const via = full?.authoritative ? 'yt-dlp' : full ? 'partial list' : 'page';
    console.log(
      `  ${src.key}: ${next[src.key].length} videos via ${via}${added.length ? ` +${added.join(',')}` : ''}${hidden ? ` (${hidden} private)` : ''}${unresolved.length ? ` (${unresolved.length} without a date)` : ''}`,
    );
  }

  const changed = JSON.stringify(next) !== JSON.stringify(store.series);
  if (changed) await writeFile(FILE, `${JSON.stringify({ updatedAt: new Date().toISOString(), series: next }, null, 2)}\n`);
  const total = Object.values(next).reduce((n, list) => n + list.length, 0);
  console.log(`playlists: ${total} videos in ${PLAYLISTS.length} series${changed ? '' : ' (unchanged)'}`);
  const playlistCount = PLAYLISTS.filter((src) => src.playlist).length;
  if (unread === playlistCount) problems.push('no playlist could be read');
  else if (unread) console.warn(`playlists: ${unread} playlist(s) could not be read; stored videos were kept`);
  if (problems.length) throw new Error(problems.join('; '));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
