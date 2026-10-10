// One place for every external channel: identity, brand mark and the live
// numbers the fetchers keep in sync (followers, posts, last post date).

import { CHANNEL_URLS, instagram, notes, telegram, tiktok, youtube, type YtLang } from './data';
import type { FeedItem } from './feed-types';

export type Platform = 'telegram' | 'youtube' | 'tiktok' | 'instagram';

export interface Channel {
  id: string;
  platform: Platform;
  /** Platform name, always Latin */
  label: string;
  /** Channel title as the platform shows it */
  name: string;
  handle: string;
  url: string;
  /** Content language of the channel */
  lang: YtLang;
  /** Site section that mirrors this channel */
  page: string;
  followers?: number;
  count: number;
  lastPost?: string;
  brand: string;
}

const last = (items: FeedItem[]) => items[0]?.date;

// One YouTube channel per language of "Islam: why and how?", in this order.
const YOUTUBE: { lang: YtLang; url: string; name: string; handle: string }[] = [
  { lang: 'fa', url: CHANNEL_URLS.youtubeFa, name: 'کلام - سید حمید حسینی', handle: '@kalam-hamidhossaini' },
  { lang: 'ro', url: CHANNEL_URLS.youtubeRo, name: 'Islam, de ce și cum?', handle: '@Islamdeceșicum' },
  { lang: 'ar', url: CHANNEL_URLS.youtubeAr, name: 'الإسلام، لماذا وكيف؟', handle: '@الإسلاملماذاوكيف' },
  { lang: 'ur', url: CHANNEL_URLS.youtubeUr, name: 'اسلام، کیوں اور کیسے؟', handle: '@اسلامکیوںاورکیسے' },
  { lang: 'en', url: CHANNEL_URLS.youtubeEn, name: 'Islam, Why and How?', handle: '@IslamWhyandHow' },
];

export const CHANNELS: Channel[] = [
  {
    id: 'telegram',
    platform: 'telegram',
    label: 'Telegram',
    name: telegram.profiles.main?.name ?? 'کلام | سید حمید حسینی',
    handle: '@hamidhossaini',
    url: CHANNEL_URLS.telegram,
    lang: 'fa',
    page: 'notes',
    followers: telegram.profiles.main?.followers,
    count: notes.length,
    lastPost: last(notes),
    brand: '#229ED9',
  },
  ...YOUTUBE.map((y): Channel => {
    const items = youtube.items.filter((i) => i.channel === y.lang);
    return {
      id: `youtube-${y.lang}`,
      platform: 'youtube',
      label: 'YouTube',
      name: youtube.profiles[y.lang]?.name ?? y.name,
      handle: y.handle,
      url: y.url,
      lang: y.lang,
      page: 'videos',
      followers: youtube.profiles[y.lang]?.followers,
      count: items.length,
      lastPost: last(items),
      brand: '#E62117',
    };
  }),
  {
    id: 'tiktok',
    platform: 'tiktok',
    label: 'TikTok',
    name: tiktok.profiles.main?.name ?? 'Islam De Ce Si Cum?',
    handle: '@islam.de.ce.si.cum',
    url: CHANNEL_URLS.tiktok,
    lang: 'ro',
    page: 'tiktok',
    followers: tiktok.profiles.main?.followers ?? 5864,
    count: tiktok.items.length,
    lastPost: last(tiktok.items),
    brand: 'var(--brand-tiktok)',
  },
  {
    id: 'instagram',
    platform: 'instagram',
    label: 'Instagram',
    name: instagram.profiles.main?.name ?? 'سید حمید حسینی',
    handle: '@kalam_hamidhosseini',
    url: CHANNEL_URLS.instagram,
    lang: 'fa',
    page: 'instagram',
    followers: instagram.profiles.main?.followers,
    count: instagram.items.length,
    lastPost: last(instagram.items),
    brand: '#D62976',
  },
];

export const totalFollowers = CHANNELS.reduce((a, c) => a + (c.followers ?? 0), 0);
