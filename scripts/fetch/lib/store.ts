import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FeedFile, FeedItem, Source, SourceProfile } from '../../../src/lib/feed-types';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
export const FEEDS_DIR = join(ROOT, 'src/data/feeds');
export const MEDIA_DIR = join(ROOT, 'public/media');

const feedPath = (source: Source) => join(FEEDS_DIR, `${source}.json`);

export async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function readFeed(source: Source): Promise<FeedFile> {
  try {
    const feed = JSON.parse(await readFile(feedPath(source), 'utf8'));
    feed.profiles ??= {};
    return feed;
  } catch {
    return { source, updatedAt: new Date(0).toISOString(), profiles: {}, items: [] };
  }
}

/**
 * Merge fresh items into the stored feed by id. Items are never deleted, so a
 * partial or failed scrape can only add or refresh. The file is rewritten only
 * when something changed, which keeps the cron commits quiet.
 */
export async function mergeFeed(
  source: Source,
  fresh: FeedItem[],
  profiles: Record<string, SourceProfile> = {},
): Promise<{ added: number; updated: number; total: number }> {
  const feed = await readFeed(source);
  const byId = new Map(feed.items.map((i) => [i.id, i]));
  let added = 0;
  let updated = 0;

  // View and like counts change on every run. Writing them each time would
  // mean a commit and a redeploy on every sync, so count-only changes are
  // saved at most once a day (or together with a real change).
  const countsDue = Date.now() - Date.parse(feed.updatedAt) > 20 * 3600 * 1000;
  const withoutCounts = (i: FeedItem) => JSON.stringify({ ...i, views: undefined, likes: undefined });
  let countsChanged = false;
  const pendingCounts: FeedItem[] = [];

  for (const item of fresh) {
    const prev = byId.get(item.id);
    if (!prev) {
      byId.set(item.id, item);
      added++;
      continue;
    }
    // Keep media we already downloaded if this run could not fetch it again.
    const merged: FeedItem = { ...prev, ...item, media: item.media.length ? item.media : prev.media };
    if (withoutCounts(merged) !== withoutCounts(prev)) {
      byId.set(item.id, merged);
      updated++;
    } else if (merged.views !== prev.views || merged.likes !== prev.likes) {
      countsChanged = true;
      pendingCounts.push(merged);
    }
  }
  if (countsChanged && (countsDue || added || updated)) {
    for (const item of pendingCounts) byId.set(item.id, item);
    updated += pendingCounts.length;
  }

  const items = [...byId.values()].sort((a, b) => b.date.localeCompare(a.date));
  const nextProfiles = { ...feed.profiles };
  for (const [key, p] of Object.entries(profiles)) nextProfiles[key] = { ...nextProfiles[key], ...p };
  const profileChanged = JSON.stringify(nextProfiles) !== JSON.stringify(feed.profiles);

  if (added || updated || profileChanged) {
    const out: FeedFile = { source, updatedAt: new Date().toISOString(), profiles: nextProfiles, items };
    await mkdir(FEEDS_DIR, { recursive: true });
    await writeFile(feedPath(source), JSON.stringify(out, null, 1) + '\n');
  }
  return { added, updated, total: items.length };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

export async function fetchText(url: string, init: RequestInit = {}, retries = 3): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9', ...(init.headers ?? {}) },
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      await sleep(1000 * (attempt + 1));
    }
  }
  throw lastErr;
}

export async function ensureDir(path: string) {
  await mkdir(dirname(path), { recursive: true });
}
