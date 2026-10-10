/**
 * TikTok profile → src/data/feeds/tiktok.json
 *
 * yt-dlp reads the public profile (no login). Cover images are signed URLs
 * that expire within days, so each cover is copied to public/media once.
 */
import type { FeedItem } from '../../src/lib/feed-types';
import { guessLang } from '../../src/lib/text';
import { saveImage } from './lib/media';
import { mergeFeed, readFeed } from './lib/store';
import { ytdlpJson } from './lib/ytdlp';

export const USER = 'islam.de.ce.si.cum';
const PROFILE_URL = `https://www.tiktok.com/@${USER}`;

export async function run() {
  const list = await ytdlpJson(PROFILE_URL, ['--flat-playlist']);
  if (!list?.entries?.length) throw new Error('tiktok: no entries (blocked or profile unavailable)');

  const known = new Set((await readFeed('tiktok')).items.map((i) => i.id));
  const items: FeedItem[] = [];

  for (const e of list.entries) {
    const thumbs: { id: string; url: string }[] = e.thumbnails ?? [];
    const cover = thumbs.find((t) => t.id === 'cover') ?? thumbs.find((t) => t.id === 'originCover') ?? thumbs[0];
    const saved = await saveImage(cover?.url, `tiktok/${e.id}`, { maxWidth: 540 });
    if (!saved && !known.has(e.id)) continue; // no image and nothing cached: try next run

    const text = String(e.description ?? e.title ?? '').trim();
    items.push({
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

  const result = await mergeFeed('tiktok', items, {
    main: {
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
