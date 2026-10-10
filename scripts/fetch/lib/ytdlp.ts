import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
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
