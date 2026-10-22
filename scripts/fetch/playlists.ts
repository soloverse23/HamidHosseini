/**
 * Series on the Imam Ali Foundation's YouTube channel → src/data/collections/fa.json
 *
 * The list of series lives in src/data/collections/sources.ts. yt-dlp lists
 * each whole playlist; where it is blocked (as it can be from CI), the
 * playlist's RSS feed still brings in its latest 15 videos. Videos not seen
 * before get their date, length and description from the public watch page.
 * A playlist that cannot be read keeps what was stored, so a blocked run
 * never empties a series.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { PLAYLISTS } from '../../src/data/collections/sources';
import { fetchText, ROOT, sleep } from './lib/store';
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

/** Date, length and description of one video, from its watch page. */
async function watchDetails(id: string) {
  const html = await fetchText(`https://www.youtube.com/watch?v=${id}`, { headers: { cookie: 'SOCS=CAI' } });
  const date = html.match(/"publishDate":"([^"]+)"/)?.[1] ?? html.match(/itemprop="datePublished" content="([^"]+)"/)?.[1];
  const length = Number(html.match(/"lengthSeconds":"(\d+)"/)?.[1]) || undefined;
  const title = html.match(/<meta name="title" content="([^"]*)"/)?.[1];
  const raw = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/)?.[1];
  let text: string | undefined;
  try {
    text = raw ? JSON.parse(`"${raw}"`).trim() : undefined;
  } catch {
    text = undefined;
  }
  return { date: date ? new Date(date).toISOString() : undefined, duration: length, title, text: text || undefined };
}

/** Latest 15 videos of a playlist, from its public RSS feed. */
async function fromRss(playlist: string): Promise<{ id: string; title: string }[]> {
  const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?playlist_id=${playlist}`);
  const feed = new XMLParser().parse(xml).feed;
  return [feed?.entry ?? []].flat().map((e: any) => ({ id: String(e['yt:videoId']), title: String(e.title) }));
}

const unavailable = (title?: string) => !title || /^\[(private|deleted) video\]$/i.test(title);

async function complete(
  id: string,
  pos: number,
  known: Map<string, SeriesVideo>,
  given: { title?: string; duration?: number },
): Promise<SeriesVideo | undefined> {
  const prev = known.get(id);
  if (prev) return { ...prev, title: given.title ?? prev.title, duration: given.duration ?? prev.duration, pos };
  const d = await watchDetails(id).catch(() => undefined);
  await sleep(300);
  if (!d?.date) return undefined;
  return { id, title: given.title ?? d.title ?? '', date: d.date, duration: given.duration ?? d.duration, text: d.text, pos };
}

export async function run() {
  const store = await readStore();
  const next: Record<string, SeriesVideo[]> = {};
  let failed = 0;

  for (const src of PLAYLISTS) {
    const stored = store.series[src.key] ?? [];
    const known = new Map(stored.map((v) => [v.id, v]));
    const videos: SeriesVideo[] = [];

    if (src.playlist) {
      const list = await ytdlpJson(`https://www.youtube.com/playlist?list=${src.playlist}`, ['--flat-playlist']);
      if (list?.entries?.length) {
        for (const [pos, e] of (list.entries as any[]).entries()) {
          if (unavailable(e.title)) continue;
          const v = await complete(e.id, pos, known, { title: e.title, duration: e.duration ?? undefined });
          if (v) videos.push(v);
        }
      } else {
        // Without the full list, keep every stored video and add what the feed has that is new.
        const recent = await fromRss(src.playlist).catch(() => undefined);
        if (!recent) {
          failed++;
          next[src.key] = stored;
          continue;
        }
        videos.push(...stored);
        for (const e of recent.filter((e) => !known.has(e.id))) {
          const v = await complete(e.id, stored.length + videos.length, known, { title: e.title });
          if (v) videos.push(v);
        }
      }
    } else {
      for (const [pos, [id, title]] of (src.videos ?? []).entries()) {
        const v = await complete(id, pos, known, { title });
        if (v) videos.push(v);
      }
    }
    next[src.key] = videos.length ? videos : stored;
    console.log(`  ${src.key}: ${next[src.key].length} videos`);
  }

  const changed = JSON.stringify(next) !== JSON.stringify(store.series);
  if (changed) await writeFile(FILE, `${JSON.stringify({ updatedAt: new Date().toISOString(), series: next }, null, 2)}\n`);
  const total = Object.values(next).reduce((n, l) => n + l.length, 0);
  console.log(`playlists: ${total} videos in ${PLAYLISTS.length} series${changed ? '' : ' (unchanged)'}`);
  if (failed === PLAYLISTS.filter((p) => p.playlist).length) throw new Error('no playlist could be read');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
