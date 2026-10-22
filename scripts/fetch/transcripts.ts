/**
 * YouTube subtitles → src/data/transcripts/youtube/<videoId>.json
 *
 * The spoken text of each talk makes the episode pages readable and
 * searchable. Uploaded subtitles are preferred over automatic ones. Each
 * video is tried once per run until it has a transcript; a run fetches at
 * most --limit (default 30) so the 6-hourly sync stays short.
 */
import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ensureDir, readFeed, ROOT, sleep } from './lib/store';
import { RateLimited, subtitles } from './lib/ytdlp';

const DIR = join(ROOT, 'src/data/transcripts/youtube');
/** yt-dlp subtitle language patterns per channel, best first */
const LANGS: Record<string, string[]> = {
  fa: ['fa', 'fa-.*', 'per', 'fa.*'],
  ro: ['ro', 'ro-.*', 'ro.*'],
  ar: ['ar', 'ar-.*', 'ar.*'],
  ur: ['ur', 'ur-.*', 'ur.*'],
  en: ['en', 'en-.*', 'en.*'],
};

export async function run({ limit = 30 }: { limit?: number } = {}) {
  const have = new Set((await readdir(DIR).catch(() => [] as string[])).map((f) => f.replace(/\.json$/, '')));
  const videos = (await readFeed('youtube')).items
    .filter((v) => v.kind === 'video' && v.channel && !have.has(v.id))
    // Numbered episodes first, newest first.
    .sort((a, b) => Number(!!b.episode) - Number(!!a.episode) || b.date.localeCompare(a.date));

  let saved = 0;
  let tried = 0;
  for (const v of videos.slice(0, limit)) {
    tried++;
    let subs;
    try {
      subs = await subtitles(v.url, LANGS[v.channel!] ?? [`${v.channel}.*`]);
    } catch (err) {
      if (!(err instanceof RateLimited)) throw err;
      // Not a failure of the sync: the rest waits for the next run.
      console.warn('  transcripts: YouTube is rate-limiting; stopping for this run');
      break;
    }
    // Space requests out; YouTube rate-limits subtitle downloads quickly.
    await sleep(6000);
    if (!subs) continue;
    await ensureDir(join(DIR, 'x'));
    await writeFile(join(DIR, `${v.id}.json`), JSON.stringify(subs, null, 1) + '\n');
    saved++;
  }
  console.log(`transcripts: ${saved} saved of ${tried} tried, ${videos.length - tried} waiting`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const at = process.argv.indexOf('--limit');
  run({ limit: at > 0 ? Number(process.argv[at + 1]) : undefined }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
