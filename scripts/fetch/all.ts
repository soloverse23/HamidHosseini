/**
 * Run every fetcher, then rebuild data derived from them.
 * A failing source never stops the others; the exit code is non-zero if any
 * failed so the workflow can open an issue, but the cached data stays valid.
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildPersianTranslation } from '../quran/from-telegram';
import { ROOT } from './lib/store';
import * as instagram from './instagram';
import * as quran from './quran';
import * as telegram from './telegram';
import * as tiktok from './tiktok';
import * as transcripts from './transcripts';
import * as youtube from './youtube';

const full = process.argv.includes('--full');
// transcripts after youtube: it reads the videos youtube just stored.
const jobs = { telegram, youtube, transcripts, tiktok, instagram } as const;
const failures: string[] = [];

for (const [name, mod] of Object.entries(jobs)) {
  try {
    await (mod.run as (opts: { full: boolean }) => Promise<unknown>)({ full });
  } catch (err) {
    failures.push(`${name}: ${(err as Error).message}`);
    console.error(`✗ ${name}:`, (err as Error).message);
  }
}

// Telegram parse first: the database fetch links each verse to its post with it.
try {
  await buildPersianTranslation();
} catch (err) {
  failures.push(`quran (telegram parse): ${(err as Error).message}`);
}
try {
  await quran.run();
} catch (err) {
  failures.push(`quran (database): ${(err as Error).message}`);
  console.error('✗ quran:', (err as Error).message);
}

await writeFile(join(ROOT, '.fetch-failures.txt'), failures.join('\n'));
if (failures.length) {
  console.error(`\n${failures.length} source(s) failed:\n${failures.join('\n')}`);
  process.exit(1);
}
