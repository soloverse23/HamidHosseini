/**
 * YouTube channel → src/data/feeds/youtube.json
 *
 * 1. The public RSS feed (latest 15, never blocked) is read on every run.
 * 2. yt-dlp lists the whole channel (videos + shorts) so older uploads are
 *    included too. It may be blocked from CI IPs; RSS alone keeps the feed
 *    current in that case.
 * 3. Items not seen before get their date and description from the watch page.
 */
import { XMLParser } from 'fast-xml-parser';
import type { FeedItem, SourceProfile } from '../../src/lib/feed-types';
import { episodeFromTitle } from '../../src/lib/series';
import { ytdlpJson } from './lib/ytdlp';
import { fetchText, mergeFeed, readFeed, sleep } from './lib/store';

/** Both channels publish the same numbered series, in Persian and in Romanian. */
export const CHANNELS = [
  {
    key: 'fa',
    id: 'UC5Tgobwm51zm7UtRtRuWH6w',
    name: 'کلام - سید حمید حسینی',
    handle: '@kalam-hamidhossaini',
    url: 'https://www.youtube.com/@kalam-hamidhossaini',
  },
  {
    key: 'ro',
    id: 'UCHvs1mEHpS0AsPehWHnzYhA',
    name: 'Islam, de ce și cum?',
    handle: '@Islamdeceșicum',
    url: 'https://www.youtube.com/@Islamdece%C8%99icum',
  },
] as const;
type Channel = (typeof CHANNELS)[number];

const thumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

function makeItem(channel: Channel, p: {
  id: string;
  title: string;
  date: string;
  short: boolean;
  description?: string;
  views?: number;
  duration?: number;
}): FeedItem {
  const episode = p.short ? undefined : episodeFromTitle(p.title);
  const text = (p.description ?? '').trim();
  return {
    source: 'youtube',
    id: p.id,
    url: p.short ? `https://www.youtube.com/shorts/${p.id}` : `https://www.youtube.com/watch?v=${p.id}`,
    date: p.date,
    kind: p.short ? 'short' : 'video',
    lang: channel.key,
    channel: channel.key,
    title: p.title.trim(),
    text,
    media: [{ kind: 'video', src: thumb(p.id), width: 480, height: 360, duration: p.duration }],
    views: p.views,
    series: episode ? 'islam-why-how' : undefined,
    episode,
  };
}

async function fromRss(channel: Channel): Promise<FeedItem[]> {
  const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channel.id}`);
  const feed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' }).parse(xml).feed;
  const entries = [feed.entry ?? []].flat();
  return entries.map((e: any) =>
    makeItem(channel, {
      id: e['yt:videoId'],
      title: String(e.title),
      date: new Date(e.published).toISOString(),
      short: String(e.link?.href ?? '').includes('/shorts/'),
      description: String(e['media:group']?.['media:description'] ?? ''),
      views: Number(e['media:group']?.['media:community']?.['media:statistics']?.views) || undefined,
    }),
  );
}

/** Date + description for a single video, from its public watch page. */
async function watchDetails(id: string) {
  const html = await fetchText(`https://www.youtube.com/watch?v=${id}`, { headers: { cookie: 'SOCS=CAI' } });
  const date = html.match(/"publishDate":"([^"]+)"/)?.[1] ?? html.match(/itemprop="datePublished" content="([^"]+)"/)?.[1];
  const rawDesc = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/)?.[1];
  let description: string | undefined;
  try {
    description = rawDesc ? JSON.parse(`"${rawDesc}"`) : undefined;
  } catch {
    description = undefined;
  }
  return { date: date ? new Date(date).toISOString() : undefined, description };
}

async function syncChannel(channel: Channel, known: Map<string, FeedItem>) {
  const items = new Map<string, FeedItem>();
  for (const item of await fromRss(channel)) items.set(item.id, item);

  let followers: number | undefined;
  for (const tab of ['videos', 'shorts'] as const) {
    const list = await ytdlpJson(`https://www.youtube.com/channel/${channel.id}/${tab}`, ['--flat-playlist']);
    if (!list) continue;
    followers ??= list.channel_follower_count ?? undefined;
    for (const e of list.entries ?? []) {
      const prev = items.get(e.id) ?? known.get(e.id);
      if (prev) {
        // Refresh counts only; keep the richer RSS/watch-page fields.
        const media = e.duration ? [{ ...prev.media[0], duration: e.duration }] : prev.media;
        items.set(e.id, { ...prev, views: e.view_count ?? prev.views, media });
        continue;
      }
      const details = await watchDetails(e.id).catch(() => ({ date: undefined, description: undefined }));
      if (!details.date) continue;
      items.set(
        e.id,
        makeItem(channel, {
          id: e.id,
          title: e.title ?? '',
          date: details.date,
          short: tab === 'shorts',
          description: details.description,
          views: e.view_count ?? undefined,
          duration: e.duration ?? undefined,
        }),
      );
      await sleep(300);
    }
  }

  // Durations come only from yt-dlp; keep what we had.
  for (const [id, item] of items) {
    const prevDuration = known.get(id)?.media[0]?.duration;
    if (prevDuration && !item.media[0]?.duration) item.media[0] = { ...item.media[0], duration: prevDuration };
  }
  return { items: [...items.values()], followers };
}

export async function run() {
  const stored = await readFeed('youtube');
  const known = new Map(stored.items.map((i) => [i.id, i]));
  const all: FeedItem[] = [];
  const profiles: Record<string, SourceProfile> = {};
  const errors: unknown[] = [];

  for (const channel of CHANNELS) {
    try {
      const { items, followers } = await syncChannel(channel, known);
      all.push(...items);
      profiles[channel.key] = {
        name: channel.name,
        handle: channel.handle,
        url: channel.url,
        followers: followers ?? stored.profiles[channel.key]?.followers,
      };
    } catch (err) {
      errors.push(err);
      console.warn(`  youtube ${channel.key} failed: ${(err as Error).message}`);
    }
  }

  const result = await mergeFeed('youtube', all, profiles);
  console.log(`youtube: +${result.added} new, ${result.updated} updated, ${result.total} total`);
  if (errors.length === CHANNELS.length) throw errors[0];
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
