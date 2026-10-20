/**
 * TikTok profile → src/data/feeds/tiktok.json
 *
 * yt-dlp reads the public profile (no login). Cover images are signed URLs
 * that expire within days, so each cover is copied to public/media once.
 */
import type { FeedItem } from '../../src/lib/feed-types';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { guessLang, speechTitle, withoutTags } from '../../src/lib/text';
import { saveImage } from './lib/media';
import { ensureDir, fetchText, mergeFeed, readFeed, ROOT } from './lib/store';
import { RateLimited, subtitles, ytdlpJson } from './lib/ytdlp';

/** Subtitle downloads per run, so a first run on a long profile stays short. */
const SUBS_PER_RUN = 20;
const transcriptPath = (id: string) => join(ROOT, 'src/data/transcripts/tiktok', `${id}.json`);

/** Follower count from the profile page's embedded JSON; yt-dlp does not report it. */
async function followerCount(): Promise<number | undefined> {
  try {
    const html = await fetchText(PROFILE_URL);
    const n = Number(html.match(/"followerCount":(\d+)/)?.[1]);
    return n > 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

export const USER = 'islam.de.ce.si.cum';
const PROFILE_URL = `https://www.tiktok.com/@${USER}`;

export async function run() {
  const list = await ytdlpJson(PROFILE_URL, ['--flat-playlist']);
  if (!list?.entries?.length) throw new Error('tiktok: no entries (blocked or profile unavailable)');

  const stored = await readFeed('tiktok');
  const known = new Set(stored.items.map((i) => i.id));
  const titled = new Set(stored.items.filter((i) => i.title).map((i) => i.id));
  const items: FeedItem[] = [];
  let subsLeft = SUBS_PER_RUN;

  for (const e of list.entries) {
    const thumbs: { id: string; url: string }[] = e.thumbnails ?? [];
    const cover = thumbs.find((t) => t.id === 'cover') ?? thumbs.find((t) => t.id === 'originCover') ?? thumbs[0];
    const saved = await saveImage(cover?.url, `tiktok/${e.id}`, { maxWidth: 540 });
    if (!saved && !known.has(e.id)) continue; // no image and nothing cached: try next run

    const text = String(e.description ?? e.title ?? '').trim();
    // Most captions are only hashtags. The spoken text (TikTok's own
    // subtitles) gives a real title, and is kept for search.
    let title: string | undefined;
    if (!withoutTags(text) && !titled.has(String(e.id)) && subsLeft-- > 0) {
      const subs = await subtitles(`${PROFILE_URL}/video/${e.id}`, ['ron.*', 'ro.*', 'eng.*', 'en.*']).catch((err) => {
        if (err instanceof RateLimited) subsLeft = 0;
        else throw err;
      });
      if (subs) {
        title = speechTitle(subs.text);
        await ensureDir(transcriptPath(String(e.id)));
        await writeFile(transcriptPath(String(e.id)), JSON.stringify(subs, null, 1) + '\n');
      }
    }
    items.push({
      ...(title ? { title } : {}),
      source: 'tiktok',
      id: String(e.id),
      url: `${PROFILE_URL}/video/${e.id}`,
      date: new Date((e.timestamp ?? 0) * 1000).toISOString(),
      kind: 'short',
      lang: guessLang(text) ?? 'ro',
      text,
      media: saved ? [{ kind: 'video', ...saved, duration: e.duration ?? undefined }] : [],
      views: e.view_count ?? undefined,
      likes: e.like_count ?? undefined,
    });
  }

  const followers = await followerCount();
  const result = await mergeFeed('tiktok', items, {
    main: {
      ...(followers ? { followers } : {}),
      name: list.entries[0]?.channel ?? 'Islam De Ce Si Cum?',
      handle: `@${USER}`,
      url: PROFILE_URL,
      description: 'Răspunsurile lui Hamid Hosseini la cele mai importante întrebări religioase',
    },
  });
  console.log(`tiktok: +${result.added} new, ${result.updated} updated, ${result.total} total`);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
