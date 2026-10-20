// Checks the built site (dist/) for the SEO mistakes that are easy to ship and
// hard to notice: a stale domain, missing or foreign canonicals, one-sided
// hreflang, broken JSON-LD, broken internal links, and sitemap entries that
// are missing, noindexed or not canonical.
//
//   npm run build && npm run check:seo [-- distDir]
//
// Exits 1 when any error is found. Duplicate titles and descriptions are
// reported as warnings only.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { LEGACY_HOST, PRODUCTION_URL } from '../../src/lib/site';

const dist = resolve(process.argv[2] ?? 'dist');
const origin = new URL(process.env.SITE_URL ?? PRODUCTION_URL).origin;

const errors = new Map<string, string[]>();
const warnings = new Map<string, string[]>();
const report = (bag: Map<string, string[]>, kind: string, msg: string) => {
  const list = bag.get(kind) ?? [];
  list.push(msg);
  bag.set(kind, list);
};
const error = (kind: string, msg: string) => report(errors, kind, msg);
const warn = (kind: string, msg: string) => report(warnings, kind, msg);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      // The search index is large, binary and has no links.
      if (name !== 'pagefind') walk(p, out);
    } else out.push(p);
  }
  return out;
}

const files = walk(dist);
const fileSet = new Set(files.map((f) => '/' + relative(dist, f).split('\\').join('/')));

/** URL path → does a page or file exist for it in dist? */
function exists(pathname: string): boolean {
  let p = decodeURIComponent(pathname);
  if (fileSet.has(p)) return true;
  if (!p.endsWith('/')) p += '/';
  return fileSet.has(`${p}index.html`);
}

const pathOf = (url: string) => (url.startsWith(origin) ? new URL(url).pathname : undefined);

// ---- 1. Stale domain anywhere in text output ----
for (const f of files) {
  if (!/\.(html|xml|txt|json|js)$/.test(f)) continue;
  if (readFileSync(f, 'utf8').includes(LEGACY_HOST)) error('legacy domain', relative(dist, f));
}

// ---- 2. Per page: canonical, hreflang, JSON-LD, links ----
interface Page {
  canonical?: string;
  noindex: boolean;
  alternates: Map<string, string>;
  title?: string;
  description?: string;
}
const pages = new Map<string, Page>();
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
const unescape = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const brokenLinks = new Map<string, Set<string>>();

for (const f of files.filter((f) => f.endsWith('.html'))) {
  const path = '/' + relative(dist, f).split('\\').join('/').replace(/index\.html$/, '');
  const html = readFileSync(f, 'utf8');
  // HTML fragments fetched by scripts (e.g. /<lang>/timeline/<n>/) are not pages.
  if (!/<html[\s>]/i.test(html.slice(0, 500))) continue;
  const head = html.slice(0, html.indexOf('</head>') + 7);
  const page: Page = {
    noindex: /<meta name="robots" content="[^"]*noindex/.test(head),
    alternates: new Map(),
    title: head.match(/<title>([^<]*)<\/title>/)?.[1],
    description: head.match(/<meta name="description" content="([^"]*)"/)?.[1],
  };
  for (const tag of head.match(/<link [^>]*>/g) ?? []) {
    const rel = attr(tag, 'rel');
    const target = attr(tag, 'href');
    if (rel === 'canonical') page.canonical = target && unescape(target);
    if (rel === 'alternate' && attr(tag, 'hreflang') && target) page.alternates.set(attr(tag, 'hreflang')!, unescape(target));
  }
  pages.set(path, page);

  const stub = path === '/' || path === '/404.html';
  if (!stub) {
    if (!page.canonical) error('missing canonical', path);
    else if (!page.canonical.startsWith(`${origin}/`)) error('canonical off-domain', `${path} → ${page.canonical}`);
    else if (!exists(new URL(page.canonical).pathname)) error('canonical target missing', `${path} → ${page.canonical}`);
    for (const [lang, url] of page.alternates) {
      if (!url.startsWith(`${origin}/`)) error('hreflang off-domain', `${path} [${lang}] → ${url}`);
    }
  }

  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const node = JSON.parse(m[1]);
      if (!node['@context'] || !node['@type']) error('JSON-LD without @context/@type', path);
    } catch {
      error('JSON-LD does not parse', path);
    }
  }

  for (const m of html.matchAll(/<a [^>]*href="(\/[^"]*)"/g)) {
    const raw = unescape(m[1]);
    if (raw.startsWith('//')) continue;
    const target = raw.split('#')[0].split('?')[0];
    if (!target || exists(target)) continue;
    const set = brokenLinks.get(target) ?? new Set();
    set.add(path);
    brokenLinks.set(target, set);
  }
}

for (const [target, from] of brokenLinks) {
  const sample = [...from].slice(0, 3).join(', ');
  error('broken internal link', `${target} (from ${from.size} page(s), e.g. ${sample})`);
}

// ---- 3. hreflang must be reciprocal and point at real, indexable pages ----
for (const [path, page] of pages) {
  if (!page.alternates.size || page.noindex) continue;
  const self = page.canonical;
  for (const [lang, url] of page.alternates) {
    const target = pathOf(url);
    if (!target) continue;
    if (lang === 'x-default') {
      if (!exists(target)) error('x-default target missing', `${path} → ${url}`);
      continue;
    }
    const other = pages.get(target);
    if (!other) {
      error('hreflang target missing', `${path} [${lang}] → ${url}`);
      continue;
    }
    if (other.noindex) error('hreflang to noindex page', `${path} [${lang}] → ${url}`);
    if (self && ![...other.alternates.values()].includes(self)) {
      error('hreflang not reciprocal', `${path} [${lang}] → ${url} does not link back`);
    }
  }
  if (self && ![...page.alternates.values()].includes(self)) error('hreflang lacks self-reference', path);
}

// ---- 4. Sitemaps ----
const sitemapUrls: string[] = [];
for (const f of files.filter((f) => /\/sitemap-\d+\.xml$/.test(f))) {
  for (const m of readFileSync(f, 'utf8').matchAll(/<loc>([^<]*)<\/loc>/g)) sitemapUrls.push(unescape(m[1]));
}
if (!sitemapUrls.length) error('sitemap', 'no URLs found in sitemap-*.xml');
for (const url of sitemapUrls) {
  const target = pathOf(url);
  if (!target) {
    error('sitemap URL off-domain', url);
    continue;
  }
  const page = pages.get(target);
  if (!page) error('sitemap URL has no page', url);
  else if (page.noindex) error('sitemap URL is noindex', url);
  else if (page.canonical && page.canonical !== url) error('sitemap URL is not canonical', `${url} → ${page.canonical}`);
}

// ---- 5. Duplicate titles and descriptions among indexable pages (warnings) ----
const seen = { title: new Map<string, string[]>(), description: new Map<string, string[]>() };
for (const [path, page] of pages) {
  if (page.noindex || !page.canonical || pathOf(page.canonical) !== path) continue;
  for (const key of ['title', 'description'] as const) {
    const v = page[key];
    if (!v) {
      warn(`missing ${key}`, path);
      continue;
    }
    // Across languages the same name is expected; compare within one locale.
    const k = `${path.split('/')[1]}\u0000${v}`;
    seen[key].set(k, [...(seen[key].get(k) ?? []), path]);
  }
}
for (const key of ['title', 'description'] as const) {
  for (const [k, paths] of seen[key]) {
    const v = k.split('\u0000')[1];
    if (paths.length > 1) warn(`duplicate ${key}`, `${paths.length}× "${v.slice(0, 70)}" e.g. ${paths.slice(0, 3).join(', ')}`);
  }
}

// ---- Report ----
const print = (bag: Map<string, string[]>, label: string) => {
  for (const [kind, list] of bag) {
    console.log(`\n${label} ${kind}: ${list.length}`);
    for (const msg of list.slice(0, 10)) console.log(`  ${msg}`);
    if (list.length > 10) console.log(`  … and ${list.length - 10} more`);
  }
};
print(warnings, 'warning:');
print(errors, 'ERROR:');
const count = [...errors.values()].reduce((n, l) => n + l.length, 0);
console.log(`\nChecked ${pages.size} pages and ${sitemapUrls.length} sitemap URLs against ${origin}: ${count} error(s).`);
if (!existsSync(join(dist, 'robots.txt'))) console.log('Note: no robots.txt in dist.');
process.exit(count ? 1 : 0);
