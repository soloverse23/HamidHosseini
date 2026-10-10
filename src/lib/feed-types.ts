// Shared shape for every external source (Telegram, YouTube, TikTok, Instagram).
// Written by scripts/fetch/*, read by the Astro pages.

export type Source = 'telegram' | 'youtube' | 'tiktok' | 'instagram';

export type ItemKind = 'text' | 'photo' | 'video' | 'short' | 'audio' | 'document' | 'reel';

export interface MediaRef {
  kind: 'image' | 'video' | 'audio' | 'document';
  /** Local path under /public, e.g. /media/telegram/3287.webp */
  src?: string;
  width?: number;
  height?: number;
  /** Seconds */
  duration?: number;
  title?: string;
  subtitle?: string;
}

export interface LinkPreview {
  url: string;
  site?: string;
  title?: string;
  description?: string;
}

export interface FeedItem {
  source: Source;
  id: string;
  url: string;
  /** ISO 8601 */
  date: string;
  kind: ItemKind;
  /** BCP-47 guess of the content language (fa, ro, ar, en) */
  lang?: string;
  title?: string;
  /** Plain text, used for search, excerpts and RSS */
  text: string;
  /** Sanitised HTML (Telegram only) */
  html?: string;
  media: MediaRef[];
  views?: number;
  likes?: number;
  /** Series key, see src/lib/series.ts */
  series?: string;
  episode?: number;
  tags?: string[];
  forwardedFrom?: { name: string; url?: string };
  /** Channel key when a source has several accounts (YouTube: 'fa' | 'ro') */
  channel?: string;
  linkPreview?: LinkPreview;
}

export interface SourceProfile {
  name: string;
  handle: string;
  url: string;
  description?: string;
  followers?: number;
  avatar?: string;
}

export interface FeedFile {
  source: Source;
  /** Last time the item list actually changed */
  updatedAt: string;
  /** Keyed by channel ('main' for single-account sources) */
  profiles: Record<string, SourceProfile>;
  items: FeedItem[];
}
