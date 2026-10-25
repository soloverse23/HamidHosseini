/**
 * YouTube channel → src/data/feeds/youtube.json
 *
 * 1. The public RSS feed (latest 15) is read on every run. YouTube often
 *    answers it with 404; that no longer skips the rest of the channel.
 * 2. yt-dlp lists the whole channel (videos + shorts). It may be blocked
 *    from CI IPs.
 * 3. When either of those fails, the channel's videos and shorts pages
 *    still supply the recent uploads.
 * 4. Items not seen before get their date and description from the watch
 *    page, or from the player API when that page withholds them.
 */
import { XMLParser } from 'fast-xml-parser';
import type { FeedItem, SourceProfile } from '../../src/lib/feed-types';
import { episodeFromTitle } from '../../src/lib/series';
import { fetchText, mergeFeed, readFeed, sleep } from './lib/store';
import { pageVideos, unavailable, videoDetails } from './lib/youtube-web';
import { ytdlpJson } from './lib/ytdlp';

/** Every channel publishes the same numbered series, each in its own language. */
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
  {
    key: 'ar',
    id: 'UCHUDgWntRDzOtqoN04B30lw',
    name: 'الإسلام، لماذا وكيف؟',
    handle: '@الإسلاملماذاوكيف',
    url: 'https://www.youtube.com/@%D8%A7%D9%84%D8%A5%D8%B3%D9%84%D8%A7%D9%85%D9%84%D9%85%D8%A7%D8%B0%D8%A7%D9%88%D9%83%D9%8A%D9%81',
  },
  {
    key: 'ur',
    id: 'UCLMWrXU_hfQURMEAxrRsSuQ',
    name: 'اسلام، کیوں اور کیسے؟',
    handle: '@اسلامکیوںاورکیسے',
    url: 'https://www.youtube.com/@%D8%A7%D8%B3%D9%84%D8%A7%D9%85%DA%A9%DB%8C%D9%88%DA%BA%D8%A7%D9%88%D8%B1%DA%A9%DB%8C%D8%B3%DB%92',
  },
  {
    key: 'en',
    id: 'UCYkJnIw36B3SSjJlbqdzIBA',
    name: 'Islam, Why and How?',
    handle: '@IslamWhyandHow',
    url: 'https://www.youtube.com/@IslamWhyandHow',
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
  const entries = [feed?.entry ?? []].flat().filter(Boolean);
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

async function addNew(
  channel: Channel,
  items: Map<string, FeedItem>,
  known: Map<string, FeedItem>,
  video: { id?: string; title?: string; duration?: number; views?: number },
  short: boolean,
  undated: string[],
) {
  if (!video.id || unavailable(video.title)) return;
  const prev = items.get(video.id) ?? known.get(video.id);
  if (prev) {
    const media = video.duration ? [{ ...prev.media[0], duration: video.duration }] : prev.media;
    items.set(video.id, { ...prev, views: video.views ?? prev.views, media });
    return;
  }
  const details = await videoDetails(video.id);
  if (details.unavailable || unavailable(details.title)) return;
  if (!details.date) {
    undated.push(video.id);
    return;
  }
  items.set(
    video.id,
    makeItem(channel, {
      id: video.id,
      title: video.title || details.title || '',
      date: details.date,
      short,
      description: details.text,
      views: video.views,
      duration: video.duration ?? details.duration,
    }),
  );
  await sleep(300);
}

async function syncChannel(channel: Channel, known: Map<string, FeedItem>) {
  const items = new Map<string, FeedItem>();
  const undated: string[] = [];
  let rss = false;
  try {
    for (const item of await fromRss(channel)) items.set(item.id, item);
    rss = true;
  } catch (err) {
    console.warn(`  youtube ${channel.key} rss: ${(err as Error).message.split('\n')[0]}`);
  }

  let followers: number | undefined;
  const listed = new Set<string>();
  for (const tab of ['videos', 'shorts'] as const) {
    const list = await ytdlpJson(`https://www.youtube.com/channel/${channel.id}/${tab}`, ['--flat-playlist']);
    if (!list) continue;
    listed.add(tab);
    followers ??= list.channel_follower_count ?? undefined;
    for (const e of list.entries ?? []) {
      await addNew(
        channel,
        items,
        known,
        { id: e?.id, title: e?.title, duration: e?.duration ?? undefined, views: e?.view_count ?? undefined },
        tab === 'shorts',
        undated,
      );
    }
  }

  // RSS is down often, and yt-dlp is blocked from some runners. The channel
  // page still has the recent uploads those two missed.
  for (const tab of ['videos', 'shorts'] as const) {
    if (rss && listed.has(tab)) continue;
    const page = await pageVideos(`https://www.youtube.com/channel/${channel.id}/${tab}?hl=${channel.key}`, channel.key);
    if (!page) continue;
    listed.add(tab);
    for (const video of page) await addNew(channel, items, known, video, tab === 'shorts', undated);
  }

  if (!rss && !listed.size) throw new Error(`no listing for ${channel.key}`);
  if (undated.length) console.warn(`  youtube ${channel.key}: no date for ${undated.join(', ')}`);

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
