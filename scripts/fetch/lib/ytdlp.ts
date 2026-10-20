import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { exists } from './store';

const run = promisify(execFile);

async function binary(): Promise<string> {
  if (process.env.YTDLP) return process.env.YTDLP;
  const local = join(homedir(), '.local/bin/yt-dlp');
  return (await exists(local)) ? local : 'yt-dlp';
}

/** Run `yt-dlp -J` and return the parsed JSON, or undefined if yt-dlp is missing or blocked. */
export async function ytdlpJson(url: string, extra: string[] = []): Promise<any | undefined> {
  try {
    const { stdout } = await run(await binary(), ['-J', '--no-warnings', ...extra, url], {
      maxBuffer: 64 * 1024 * 1024,
      timeout: 240_000,
    });
    return JSON.parse(stdout);
  } catch (err) {
    console.warn(`  yt-dlp failed for ${url}: ${(err as Error).message.split('\n')[0]}`);
    return undefined;
  }
}

/** YouTube or TikTok answered 429: stop for this run and try again later. */
export class RateLimited extends Error {
  constructor() {
    super('rate limited (HTTP 429)');
  }
}

/** WebVTT → plain text: cues joined, timing and markup dropped, rolling repeats removed. */
export function vttToText(vtt: string): string {
  const lines: string[] = [];
  for (const block of vtt.replace(/\r/g, '').split(/\n{2,}/)) {
    if (!block.includes('-->')) continue;
    for (const raw of block.split('\n').slice(block.split('\n').findIndex((l) => l.includes('-->')) + 1)) {
      const line = raw
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&')
        // Speaker marks and sound labels: ">>", "[Music]", "[موسيقى]"
        .replace(/>>|\[[^\]]{1,30}\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      // Auto captions repeat the previous line as each new word arrives.
      if (line && line !== lines.at(-1)) lines.push(line);
    }
  }
  return lines.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Subtitles of one video as plain text, preferring uploaded subtitles over
 * automatic ones. `langs` are yt-dlp language patterns in order of preference
 * (e.g. ['ro.*', 'en.*']). Undefined if there are none or yt-dlp fails.
 */
export async function subtitles(url: string, langs: string[]): Promise<{ lang: string; auto: boolean; text: string } | undefined> {
  const dir = await mkdtemp(join(tmpdir(), 'subs-'));
  try {
    for (const auto of [false, true]) {
      try {
        await run(
          await binary(),
          ['--skip-download', '--no-warnings', auto ? '--write-auto-subs' : '--write-subs', '--sub-langs', langs.join(','), '--sub-format', 'vtt', '-o', join(dir, 'v.%(ext)s'), url],
          { timeout: 120_000 },
        );
      } catch (err) {
        const msg = (err as Error & { stderr?: string }).stderr ?? (err as Error).message;
        if (/429|Too Many Requests/.test(msg)) throw new RateLimited();
        console.warn(`  subtitles failed for ${url}: ${(err as Error).message.split('\n')[0]}`);
        return undefined;
      }
      const files = (await readdir(dir)).filter((f) => f.endsWith('.vtt'));
      // Pick by the caller's order of preference.
      for (const pattern of langs) {
        const re = new RegExp(`^v\\.(${pattern})\\.vtt$`, 'i');
        const file = files.find((f) => re.test(f));
        if (!file) continue;
        const text = vttToText(await readFile(join(dir, file), 'utf8'));
        if (text) return { lang: file.slice(2, -4), auto, text };
      }
    }
    return undefined;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
