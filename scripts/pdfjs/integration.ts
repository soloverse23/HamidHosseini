// Serves pdf.js's support files (character maps, the standard fonts and the
// image decoders) from this site at /pdfjs/, for the book reader.
//  - `astro build`: copies them from node_modules into the output folder.
//  - `astro dev`:   serves them straight from node_modules.
// Kept out of public/ so they follow the installed pdfjs-dist version.

import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize as normPath } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';

const FOLDERS = ['cmaps', 'standard_fonts', 'wasm'];
const TYPES: Record<string, string> = { '.wasm': 'application/wasm', '.js': 'text/javascript; charset=utf-8' };
const source = () => join(process.cwd(), 'node_modules/pdfjs-dist');

export default function pdfjs(): AstroIntegration {
  return {
    name: 'pdfjs-assets',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const out = join(fileURLToPath(dir), 'pdfjs');
        for (const f of FOLDERS) cpSync(join(source(), f), join(out, f), { recursive: true });
        logger.info(`copied ${FOLDERS.join(', ')} to /pdfjs/`);
      },
      'astro:server:setup': ({ server }) => {
        server.middlewares.use('/pdfjs', (req, res, next) => {
          const path = normPath(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '');
          const file = join(source(), path);
          if (!FOLDERS.some((f) => file.startsWith(join(source(), f))) || !existsSync(file) || !statSync(file).isFile()) {
            res.statusCode = 404;
            return res.end();
          }
          res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
          createReadStream(file).pipe(res).on('error', next);
        });
      },
    },
  };
}
