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
import * as telegram from './telegram';
import * as tiktok from './tiktok';
import * as youtube from './youtube';

const full = process.argv.includes('--full');
const jobs = { telegram, youtube, tiktok, instagram } as const;
const failures: string[] = [];

for (const [name, mod] of Object.entries(jobs)) {
  try {
    await mod.run({ full } as never);
  } catch (err) {
    failures.push(`${name}: ${(err as Error).message}`);
    console.error(`✗ ${name}:`, (err as Error).message);
  }
}

try {
  await buildPersianTranslation();
} catch (err) {
  failures.push(`quran: ${(err as Error).message}`);
}

await writeFile(join(ROOT, '.fetch-failures.txt'), failures.join('\n'));
if (failures.length) {
  console.error(`\n${failures.length} source(s) failed:\n${failures.join('\n')}`);
  process.exit(1);
}
