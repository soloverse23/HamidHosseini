/**
 * Instagram profile → src/data/feeds/instagram.json
 *
 * Instagram no longer serves profile data to anonymous requests (401
 * "require_login"), so this needs the `sessionid` cookie of a logged-in
 * account in IG_SESSIONID (a GitHub Actions secret). A separate, otherwise
 * unused account is recommended.
 *
 * Without the cookie the script exits cleanly and the site keeps showing the
 * cached posts plus anything listed in src/data/instagram-manual.json.
 */
import type { FeedItem } from '../../src/lib/feed-types';
import { guessLang } from '../../src/lib/text';
import { saveImage } from './lib/media';
import { fetchText, mergeFeed, readFeed, sleep } from './lib/store';

export const USER = 'kalam_hamidhosseini';
const PROFILE_URL = `https://www.instagram.com/${USER}/`;
const APP_ID = '936619743392459';

function headers(session: string) {
  return {
    'x-ig-app-id': APP_ID,
    'x-requested-with': 'XMLHttpRequest',
    referer: PROFILE_URL,
    cookie: `sessionid=${session}`,
  };
}

function toItem(node: any): Omit<FeedItem, 'media'> & { cover?: string } {
  const code = node.code ?? node.shortcode;
  const caption = node.caption?.text ?? node.edge_media_to_caption?.edges?.[0]?.node?.text ?? '';
  const isVideo = node.media_type === 2 || node.is_video;
  const isCarousel = node.media_type === 8 || node.__typename === 'GraphSidecar';
  const cover =
    node.image_versions2?.candidates?.[0]?.url ??
    node.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url ??
    node.display_url ??
    node.thumbnail_src;
  return {
    source: 'instagram',
    id: String(code),
    url: `https://www.instagram.com/${isVideo ? 'reel' : 'p'}/${code}/`,
    date: new Date((node.taken_at ?? node.taken_at_timestamp) * 1000).toISOString(),
    kind: isVideo ? 'reel' : 'photo',
    lang: guessLang(caption) ?? 'fa',
    text: caption.trim(),
    views: node.play_count ?? node.view_count ?? node.video_view_count ?? undefined,
    likes: node.like_count ?? node.edge_liked_by?.count ?? undefined,
    tags: isCarousel ? ['carousel'] : undefined,
    cover,
  };
}

export async function run({ full = false } = {}) {
  const session = process.env.IG_SESSIONID;
  if (!session) {
    console.log('instagram: IG_SESSIONID not set, keeping cached posts');
    return { added: 0, updated: 0, total: (await readFeed('instagram')).items.length, skipped: true };
  }

  const info = JSON.parse(
    await fetchText(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${USER}`, {
      headers: headers(session),
    }),
  ).data.user;

  const known = new Set((await readFeed('instagram')).items.map((i) => i.id));
  const raw: ReturnType<typeof toItem>[] = [];
  let maxId: string | undefined;

  // The feed endpoint pages back through every post; stop at known ones unless --full.
  for (let page = 0; page < 30; page++) {
    const url = `https://www.instagram.com/api/v1/feed/user/${info.id}/?count=33${maxId ? `&max_id=${maxId}` : ''}`;
    const res = JSON.parse(await fetchText(url, { headers: headers(session) }));
    const batch = (res.items ?? []).map(toItem);
    raw.push(...batch);
    if (!res.more_available || !res.next_max_id) break;
    if (!full && batch.every((b: { id: string }) => known.has(b.id))) break;
    maxId = res.next_max_id;
    await sleep(1500);
  }

  const items: FeedItem[] = [];
  for (const { cover, ...item } of raw) {
    const saved = await saveImage(cover, `instagram/${item.id}`, { maxWidth: 640 });
    items.push({ ...item, media: saved ? [{ kind: item.kind === 'reel' ? 'video' : 'image', ...saved }] : [] });
  }

  const result = await mergeFeed('instagram', items, {
    main: {
      name: info.full_name || 'سید حمید حسینی',
      handle: `@${USER}`,
      url: PROFILE_URL,
      description: info.biography || undefined,
      followers: info.edge_followed_by?.count,
    },
  });
  console.log(`instagram: +${result.added} new, ${result.updated} updated, ${result.total} total`);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run({ full: process.argv.includes('--full') }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
