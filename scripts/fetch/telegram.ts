/**
 * Telegram channel → src/data/feeds/telegram.json
 *
 * Reads the public web preview (t.me/s/<channel>), which needs no bot or API
 * key. Each page holds ~20 posts; `?before=<id>` walks back in time.
 *
 *   tsx scripts/fetch/telegram.ts           latest posts until we reach known ones
 *   tsx scripts/fetch/telegram.ts --full    walk the whole channel history
 */
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import sanitizeHtml from 'sanitize-html';
import type { FeedItem, ItemKind, MediaRef } from '../../src/lib/feed-types';
import { detectSeries } from '../../src/lib/series';
import { guessLang } from '../../src/lib/text';
import { saveImage } from './lib/media';
import { fetchText, mergeFeed, readFeed, sleep } from './lib/store';

export const CHANNEL = 'hamidhossaini';
const BASE = `https://t.me/s/${CHANNEL}`;

const bgUrl = (style?: string) => style?.match(/url\(['"]?([^'")]+)['"]?\)/)?.[1];

function parseDuration(s?: string): number | undefined {
  if (!s) return undefined;
  const parts = s.trim().split(':').map(Number);
  if (parts.some(Number.isNaN)) return undefined;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function parseViews(s?: string): number | undefined {
  if (!s) return undefined;
  const m = s.trim().match(/^([\d.]+)\s*([KM])?$/i);
  if (!m) return undefined;
  const mult = m[2]?.toUpperCase() === 'M' ? 1e6 : m[2]?.toUpperCase() === 'K' ? 1e3 : 1;
  return Math.round(parseFloat(m[1]) * mult);
}

/** Turn Telegram's message HTML into clean, portable HTML + plain text. */
function cleanBody($: cheerio.CheerioAPI, el: cheerio.Cheerio<AnyNode>) {
  const body = el.clone();
  // Emoji are wrapped as <i class="emoji" style=…><b>💢</b></i>; keep the char only.
  body.find('i.emoji').each((_, e) => {
    $(e).replaceWith($(e).text());
  });
  // Hashtag links point at a relative search URL.
  body.find('a[href^="?q="]').each((_, a) => {
    const href = $(a).attr('href')!;
    $(a).attr('href', `${BASE}${href}`);
  });
  const tags = body
    .find('a')
    .map((_, a) => $(a).text().trim())
    .get()
    .filter((t) => t.startsWith('#'));

  const html = sanitizeHtml(body.html() ?? '', {
    allowedTags: ['b', 'strong', 'i', 'em', 'u', 's', 'a', 'br', 'code', 'pre', 'blockquote', 'span'],
    allowedAttributes: { a: ['href'], span: ['class'] },
    allowedClasses: { span: ['tg-spoiler'] },
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { href: attribs.href, rel: 'noopener', target: '_blank' },
      }),
    },
  }).trim();

  const text = cheerio
    .load(html.replace(/<br\s*\/?>/g, '\n'))
    .root()
    .text()
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { html, text, tags: [...new Set(tags)] };
}

interface RawPost {
  id: number;
  item: Omit<FeedItem, 'media'>;
  images: { remote?: string; name: string; kind: MediaRef['kind']; duration?: number }[];
  docs: MediaRef[];
}

function parsePage(html: string): { posts: RawPost[]; profile?: Record<string, string | number> } {
  const $ = cheerio.load(html);
  const posts: RawPost[] = [];

  $('.tgme_widget_message[data-post]').each((_, node) => {
    const m = $(node);
    const id = Number(m.attr('data-post')!.split('/')[1]);
    if (!id || m.hasClass('service_message')) return;

    const date = m.find('.tgme_widget_message_date time').attr('datetime');
    if (!date) return;

    const textEl = m.find('.tgme_widget_message_text').first();
    const { html: bodyHtml, text, tags } = textEl.length
      ? cleanBody($, textEl)
      : { html: '', text: '', tags: [] as string[] };

    const images: RawPost['images'] = [];
    m.find('.tgme_widget_message_photo_wrap').each((i, p) => {
      images.push({ remote: bgUrl($(p).attr('style')), name: `telegram/${id}-${i}`, kind: 'image' });
    });
    m.find('.tgme_widget_message_video_player').each((i, v) => {
      const thumb = bgUrl($(v).find('.tgme_widget_message_video_thumb').attr('style'));
      const duration = parseDuration($(v).find('.message_video_duration').text());
      images.push({ remote: thumb, name: `telegram/${id}-v${i}`, kind: 'video', duration });
    });
    m.find('.tgme_widget_message_roundvideo_player').each((i, v) => {
      const thumb = bgUrl($(v).find('.tgme_widget_message_roundvideo_thumb').attr('style'));
      images.push({ remote: thumb, name: `telegram/${id}-r${i}`, kind: 'video' });
    });

    const docs: MediaRef[] = [];
    m.find('.tgme_widget_message_document_wrap').each((_, d) => {
      const icon = $(d).find('.tgme_widget_message_document_icon');
      docs.push({
        kind: icon.hasClass('audio') ? 'audio' : 'document',
        title: $(d).find('.tgme_widget_message_document_title').text().trim() || undefined,
        subtitle: $(d).find('.tgme_widget_message_document_extra').text().trim() || undefined,
      });
    });
    m.find('.tgme_widget_message_voice_player').each(() => {
      docs.push({ kind: 'audio', title: 'Voice' });
    });

    const lp = m.find('.tgme_widget_message_link_preview').first();
    const linkPreview = lp.length
      ? {
          url: lp.attr('href') ?? '',
          site: lp.find('.link_preview_site_name').text().trim() || undefined,
          title: lp.find('.link_preview_title').text().trim() || undefined,
          description: lp.find('.link_preview_description').text().trim().slice(0, 300) || undefined,
        }
      : undefined;

    const fwd = m.find('.tgme_widget_message_forwarded_from_name').first();
    const forwardedFrom = fwd.length ? { name: fwd.text().trim(), url: fwd.attr('href') } : undefined;

    const hasVideo = images.some((i) => i.kind === 'video');
    const kind: ItemKind = hasVideo
      ? 'video'
      : images.length
        ? 'photo'
        : docs.some((d) => d.kind === 'audio')
          ? 'audio'
          : docs.length
            ? 'document'
            : 'text';

    const searchable = [text, ...docs.map((d) => `${d.title ?? ''} ${d.subtitle ?? ''}`)].join('\n');
    const { series, episode } = detectSeries(searchable);

    posts.push({
      id,
      images,
      docs,
      item: {
        source: 'telegram',
        id: String(id),
        url: `https://t.me/${CHANNEL}/${id}`,
        date: new Date(date).toISOString(),
        kind,
        lang: guessLang(searchable) ?? 'fa',
        text,
        html: bodyHtml || undefined,
        views: parseViews(m.find('.tgme_widget_message_views').first().text()),
        series,
        episode,
        tags: tags.length ? tags : undefined,
        forwardedFrom,
        linkPreview: linkPreview?.url ? linkPreview : undefined,
      },
    });
  });

  // Channel header (only present on the first page)
  const info = $('.tgme_channel_info');
  let profile: Record<string, string | number> | undefined;
  if (info.length) {
    const counters: Record<string, string> = {};
    info.find('.tgme_channel_info_counter').each((_, c) => {
      counters[$(c).find('.counter_type').text().trim()] = $(c).find('.counter_value').text().trim();
    });
    profile = {
      name: info.find('.tgme_channel_info_header_title').text().trim(),
      description: info.find('.tgme_channel_info_description').text().trim(),
      followers: parseViews(counters['subscribers'] ?? counters['subscriber']) ?? 0,
    };
  }

  return { posts, profile };
}

async function toItem(raw: RawPost): Promise<FeedItem> {
  const media: MediaRef[] = [];
  for (const img of raw.images) {
    const saved = await saveImage(img.remote, img.name);
    media.push({ kind: img.kind, duration: img.duration, ...(saved ?? {}) });
  }
  media.push(...raw.docs);
  return { ...raw.item, media };
}

export async function run({ full = false } = {}) {
  const known = new Set((await readFeed('telegram')).items.map((i) => i.id));
  const collected: FeedItem[] = [];
  let profile: Record<string, string | number> | undefined;
  let before: number | undefined;
  let pages = 0;
  // Always re-read the first few pages so view counts stay fresh.
  const MIN_PAGES = 3;

  while (true) {
    const url = before ? `${BASE}?before=${before}` : BASE;
    const page = parsePage(await fetchText(url));
    pages++;
    profile ??= page.profile;
    if (!page.posts.length) break;

    for (const raw of page.posts) collected.push(await toItem(raw));

    const oldest = Math.min(...page.posts.map((p) => p.id));
    const reachedKnown = page.posts.every((p) => known.has(String(p.id)));
    if (oldest <= 1) break;
    if (!full && reachedKnown && pages >= MIN_PAGES) break;
    before = oldest;
    if (pages % 10 === 0) console.log(`  telegram: ${pages} pages, ${collected.length} posts…`);
    await sleep(700);
  }

  const result = await mergeFeed(
    'telegram',
    collected,
    profile && {
      main: {
      name: String(profile.name),
      handle: `@${CHANNEL}`,
      url: `https://t.me/${CHANNEL}`,
      description: String(profile.description || ''),
      followers: Number(profile.followers) || undefined,
      },
    },
  );
  console.log(`telegram: +${result.added} new, ${result.updated} updated, ${result.total} total`);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run({ full: process.argv.includes('--full') }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
