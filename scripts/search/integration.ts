// Astro integration for site search.
//  - `astro build`: writes the index into the output folder (dist/pagefind).
//  - `astro dev`:   builds the index once into node_modules/.cache (outside
//                   Vite's file watcher; it is ~10k files) and serves it at
//                   /pagefind/, so search works while developing too.
//                   Restart the dev server to pick up newly fetched content.

import { execFile } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize as normPath } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';

const TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
};

/** Run build-index.ts in its own process (it loads all feeds; keep that out of Astro). */
function writeIndex(siteDir: string): Promise<string> {
  const tsx = join(process.cwd(), 'node_modules/.bin/tsx');
  const script = fileURLToPath(new URL('./build-index.ts', import.meta.url));
  return new Promise((ok, fail) =>
    execFile(tsx, [script, siteDir], { maxBuffer: 1 << 24 }, (err, stdout, stderr) =>
      err ? fail(new Error(stderr || err.message)) : ok(stdout.trim().replace(/^search: /, '')),
    ),
  );
}

export default function search(): AstroIntegration {
  return {
    name: 'site-search',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        logger.info(await writeIndex(fileURLToPath(dir).replace(/\/$/, '')));
      },
      'astro:server:setup': ({ server, logger }) => {
        const root = join(process.cwd(), 'node_modules/.cache/site-search');
        const ready = writeIndex(root)
          .then((summary) => logger.info(summary))
          .catch((e) => logger.error(`search index failed: ${e?.message ?? e}`));

        server.middlewares.use('/pagefind', async (req, res, next) => {
          await ready;
          const path = normPath(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '');
          const file = join(root, 'pagefind', path);
          if (!file.startsWith(join(root, 'pagefind')) || !existsSync(file) || !statSync(file).isFile()) {
            res.statusCode = 404;
            return res.end();
          }
          res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-store');
          createReadStream(file).pipe(res).on('error', next);
        });
      },
    },
  };
}
