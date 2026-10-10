// One place for every external channel: identity, brand mark and the live
// numbers the fetchers keep in sync (followers, posts, last post date).

import { CHANNEL_URLS, instagram, notes, telegram, tiktok, youtube } from './data';
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
  lang: 'fa' | 'ro';
  /** Site section that mirrors this channel */
  page: string;
  followers?: number;
  count: number;
  lastPost?: string;
  brand: string;
}

const last = (items: FeedItem[]) => items[0]?.date;
const ytFa = youtube.items.filter((i) => i.channel === 'fa');
const ytRo = youtube.items.filter((i) => i.channel === 'ro');

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
  {
    id: 'youtube-fa',
    platform: 'youtube',
    label: 'YouTube',
    name: youtube.profiles.fa?.name ?? 'کلام - سید حمید حسینی',
    handle: '@kalam-hamidhossaini',
    url: CHANNEL_URLS.youtubeFa,
    lang: 'fa',
    page: 'videos',
    followers: youtube.profiles.fa?.followers,
    count: ytFa.length,
    lastPost: last(ytFa),
    brand: '#E62117',
  },
  {
    id: 'youtube-ro',
    platform: 'youtube',
    label: 'YouTube',
    name: youtube.profiles.ro?.name ?? 'Islam, de ce și cum?',
    handle: '@Islamdeceșicum',
    url: CHANNEL_URLS.youtubeRo,
    lang: 'ro',
    page: 'videos',
    followers: youtube.profiles.ro?.followers,
    count: ytRo.length,
    lastPost: last(ytRo),
    brand: '#E62117',
  },
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
