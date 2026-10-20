// Editorial layer: corrections and additions made by hand (in the CMS at
// /admin/, or directly in the files) on top of what the fetchers read.
//
// One JSON file per item in src/data/overrides/<kind>/<id>.json:
//   posts/   Telegram posts        videos/  YouTube videos
//   clips/   TikTok, Instagram and YouTube Shorts
// The fetchers never write here, so an edit survives every sync and every
// full re-read of a source.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FeedItem } from './feed-types';

export interface Override {
  /** Title to show instead of the first line */
  title?: string;
  /** One or two sentences for cards and search results */
  summary?: string;
  /** Corrected full text (typos, a broken parse); replaces the original text */
  text?: string;
  /** Topic keys, added to those derived from hashtags */
  topics?: string[];
  /** Keep off the site entirely */
  hidden?: boolean;
  /** Feature on the home page ahead of the newest note */
  pinned?: boolean;
}

export const OVERRIDES_DIR = join(process.cwd(), 'src/data/overrides');
const KIND_OF: Record<FeedItem['source'], string> = { telegram: 'posts', youtube: 'videos', tiktok: 'clips', instagram: 'clips' };

function load(kind: string): Map<string, Override> {
  const dir = join(OVERRIDES_DIR, kind);
  const map = new Map<string, Override>();
  if (!existsSync(dir)) return map;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    try {
      const { id, ...o } = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      map.set(String(id ?? file.slice(0, -5)), o);
    } catch (err) {
      throw new Error(`overrides/${kind}/${file}: ${(err as Error).message}`);
    }
  }
  return map;
}

const BY_KIND = new Map(['posts', 'videos', 'clips'].map((k) => [k, load(k)]));

export const overrideOf = (item: FeedItem): Override | undefined => BY_KIND.get(KIND_OF[item.source])?.get(item.id);

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const textToHtml = (text: string) =>
  text
    .replace(/[&<>"]/g, (c) => ESC[c])
    .replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}">${url}</a>`)
    .replace(/\n/g, '<br />');

/** The item with its override applied, or undefined if it is hidden. */
export function withOverride(item: FeedItem): FeedItem | undefined {
  const o = overrideOf(item);
  if (!o) return item;
  if (o.hidden) return undefined;
  const text = o.text?.trim();
  return {
    ...item,
    ...(o.title?.trim() ? { title: o.title.trim() } : {}),
    ...(o.summary?.trim() ? { summary: o.summary.trim() } : {}),
    ...(text ? { text, ...(item.html !== undefined ? { html: textToHtml(text) } : {}) } : {}),
    ...(o.topics?.length ? { topics: o.topics } : {}),
    ...(o.pinned ? { pinned: true } : {}),
  };
}
