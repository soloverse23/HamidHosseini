/**
 * kalaam.ir (his WordPress blog, 2003–2019) → src/data/kalaam.json
 *
 * Reads every post and page through the public WordPress REST API, cleans the
 * old blog markup (uppercase tags, <font> colours, pasted Yahoo Messenger
 * scripts, <br> runs used as paragraphs) into plain semantic HTML, and saves
 * featured images under public/media/kalaam/.
 *
 * The blog is no longer updated, so this is a one-off import; it is not part
 * of `fetch:all`. Re-running it rewrites the file from scratch.
 *
 *   tsx scripts/fetch/kalaam.ts
 *
 * Categories are refined by hand in src/data/articles.ts.
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as cheerio from 'cheerio';
import sanitizeHtml from 'sanitize-html';
import { saveImage } from './lib/media';
import { ROOT, sleep } from './lib/store';

const API = 'https://kalaam.ir/wp-json/wp/v2';
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; hamidhosseini-site importer)' };
const OUT = join(ROOT, 'src/data/kalaam.json');

interface WpItem {
  id: number;
  type: 'post' | 'page';
  date: string;
  modified: string;
  slug: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
  categories?: number[];
  tags?: number[];
  featured_media?: number;
  _embedded?: { 'wp:featuredmedia'?: { source_url?: string; media_details?: { sizes?: Record<string, { source_url: string }> } }[] };
}

export interface KalaamItem {
  id: number;
  kind: 'post' | 'page';
  title: string;
  /** Local time in Tehran, as WordPress stores it */
  date: string;
  modified: string;
  url: string;
  wpCategories: string[];
  tags: string[];
  html: string;
  text: string;
  words: number;
  image?: { src: string; width: number; height: number };
}

async function getJson<T>(url: string): Promise<{ data: T; pages: number }> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return { data: (await res.json()) as T, pages: Number(res.headers.get('x-wp-totalpages') ?? 1) };
    } catch (e) {
      if (attempt >= 3) throw e;
      await sleep(1500 * (attempt + 1));
    }
  }
}

async function getAll<T>(path: string): Promise<T[]> {
  const sep = path.includes('?') ? '&' : '?';
  const first = await getJson<T[]>(`${API}/${path}${sep}per_page=100&page=1`);
  const out = [...first.data];
  for (let p = 2; p <= first.pages; p++) out.push(...(await getJson<T[]>(`${API}/${path}${sep}per_page=100&page=${p}`)).data);
  return out;
}

const decode = (s: string) => cheerio.load(`<p>${s}</p>`).text().trim();

/** kalaam.ir links → the imported copy; everything else opens in a new tab. */
function rewriteHref(href: string, ids: Set<number>, bySlug: Map<string, number>): string | undefined {
  let h = href.trim().replace(/^http:\/\/http:\/\//, 'http://').replace(/^https?:\/\/telegram\.me\//, 'https://t.me/');
  if (/^(javascript:|#|file:|c:)/i.test(h) || h.startsWith('://')) return undefined;
  const k = h.match(/^https?:\/\/(?:www\.)?kalaam\.ir\/(.*)$/i);
  if (k) {
    if (!k[1].replace(/\/$/, '')) return '/fa/articles/';
    const ref = Number(k[1].match(/(?:blogid|page_?id|[?&]p)=(\d+)/i)?.[1]);
    if (ids.has(ref)) return `/fa/articles/${ref}/`;
    const slug = decodeURIComponent(k[1].replace(/\/$/, '').split('/').pop() ?? '').toLowerCase();
    const id = bySlug.get(slug);
    if (id) return `/fa/articles/${id}/`;
  }
  return h;
}

/** Inline images: a local copy if the original (or its Wayback Machine snapshot) still exists. */
async function saveInline(src: string, name: string) {
  if (!/^https?:\/\//i.test(src)) return undefined;
  return (
    (await saveImage(src, name, { maxWidth: 900, headers: UA })) ??
    (await saveImage(`https://web.archive.org/web/2015id_/${src}`, name, { maxWidth: 900, headers: UA }))
  );
}

/** Old blog HTML → clean paragraphs. */
async function clean(raw: string, id: number, ids: Set<number>, bySlug: Map<string, number>): Promise<string> {
  // Parse with HTML5 rules first so the <p><P …> nesting of the old blog is closed properly.
  const $ = cheerio.load(raw, null, false);
  $('script, style, object, embed, param, noscript, iframe, .YSTControl').remove();
  const imgs = $('img').toArray();
  for (const [n, el] of imgs.entries()) {
    const img = $(el);
    const saved = await saveInline(img.attr('src') ?? '', `kalaam/${id}-${n + 1}`);
    // Tiny images are link icons (txt / audio / video) and smileys; drop them.
    if (saved && saved.width >= 100) img.replaceWith(`<img src="${saved.src}" width="${saved.width}" height="${saved.height}" alt="${img.attr('alt') ?? ''}">`);
    else img.remove();
  }
  // Pasted Yahoo Messenger chat logs carry their script source as plain text after
  // WordPress turned the line breaks into <br>; anything that looks like code goes.
  let html = $.html().replace(/<!--[\s\S]*?-->/g, '');

  html = sanitizeHtml(html, {
    allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'a', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'ul', 'ol', 'li', 'sup', 'sub', 'hr', 'table', 'tbody', 'tr', 'td', 'th', 'img'],
    allowedAttributes: { a: ['href'], img: ['src', 'width', 'height', 'alt'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tg'],
    transformTags: {
      b: 'strong',
      i: 'em',
      h1: 'h2',
      h5: 'h4',
      div: 'p',
    },
    nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'object'],
    exclusiveFilter: (frame) => frame.tag === 'a' && !frame.text.trim(),
  });

  const $$ = cheerio.load(`<div id="r">${html}</div>`);
  const root = $$('#r');

  $$('a').each((_, el) => {
    const a = $$(el);
    const h = rewriteHref(a.attr('href') ?? '', ids, bySlug);
    if (!h) return void a.replaceWith(a.html() ?? '');
    a.attr('href', h);
    if (!h.startsWith('/')) a.attr('rel', 'noopener').attr('target', '_blank');
  });

  // Layout tables (one row per session: text · audio · video) become one line per row.
  root.find('table').each((_, t) => {
    const rows = $$(t)
      .find('tr')
      .toArray()
      .map((tr) =>
        $$(tr)
          .children('td, th')
          .toArray()
          .map((td) => ($$(td).html() ?? '').replace(/<\/?p>|<br\s*\/?>|&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim())
          .filter((x) => x && cheerio.load(x).text().trim())
          .join(' · '),
      )
      .filter(Boolean);
    const table = $$(t);
    (table.parent().is('p') ? table.parent() : table).replaceWith(rows.map((r) => `<p>${r}</p>`).join(''));
  });

  // <br><br> inside a paragraph is a paragraph break; split them.
  root.find('p').each((_, el) => {
    const p = $$(el);
    const parts = (p.html() ?? '').split(/(?:\s*<br\s*\/?>\s*){2,}/i).map((x) => x.trim()).filter(Boolean);
    if (parts.length > 1) p.replaceWith(parts.map((x) => `<p>${x}</p>`).join(''));
  });
  // Top-level text separated only by <br> (some old posts have no <p> at all).
  const loose = root.contents().toArray();
  if (loose.some((n) => n.type === 'text' && $$(n).text().trim())) {
    const parts = (root.html() ?? '').split(/(?:\s*<br\s*\/?>\s*){2,}/i).map((x) => x.trim()).filter(Boolean);
    root.html(parts.map((x) => (/^<(p|h\d|ul|ol|blockquote|table|hr)\b/i.test(x) ? x : `<p>${x}</p>`)).join(''));
  }

  // Trim stray breaks and drop empty blocks.
  root.find('p, li, h2, h3, h4, blockquote').each((_, el) => {
    const p = $$(el);
    const inner = (p.html() ?? '')
      .replace(/&nbsp;| /g, ' ')
      .replace(/^(\s|<br\s*\/?>)+|(\s|<br\s*\/?>)+$/gi, '')
      .trim();
    if (!p.text().replace(/[\s‌‏‎]/g, '') && !p.find('img').length) p.remove();
    else p.html(inner);
  });
  // Formatting tags left empty by the cleanup, and breaks between blocks.
  root.find('strong, em, u').each((_, el) => {
    if (!$$(el).text().trim()) $$(el).replaceWith($$(el).text());
  });
  root.contents().filter((_, n) => n.type === 'tag' && (n as { name: string }).name === 'br').remove();
  // A bold-only short paragraph is a heading in these posts.
  root.find('p').each((_, el) => {
    const p = $$(el);
    const only = p.children('strong');
    if (only.length === 1 && p.contents().length === 1 && p.text().trim().length < 80 && !/[.:؟?!]$/.test(p.text().trim()) && !/[:*]/.test(p.text()))
      p.replaceWith(`<h3>${only.html()}</h3>`);
  });
  root.find('h2, h4').each((_, el) => void $$(el).replaceWith(`<h3>${$$(el).html()}</h3>`));

  // Code that leaked in as text (Yahoo Messenger IMVironment scripts).
  root.find('p').each((_, el) => {
    const t = $$(el).text();
    if (/(\bfunction\s*[\w$]*\s*\(|\bvar\s+\w+\s*=|IMVironment|\$Handler|LSM\.|\bRPC\b|document\.\w+|window\.\w+|\breturn\s+[\w$]+;|^\s*[}{)\];]+\s*$)/.test(t) && !/[؀-ۿ]{3,}/.test(t))
      $$(el).remove();
  });

  return (root.html() ?? '')
    // The blog's database stored emoji as "?"; at the start of a line they are only noise.
    .replace(/(<(?:p|h3|li|br)>)\s*\?+\s*(?=[\u0600-\u06ff«(\[])/g, '$1')
    .replace(/\s*\n\s*/g, ' ').replace(/<\/(p|h3|li|blockquote|ul|ol)>\s*/g, '</$1>\n').trim();
}

function plainText(html: string): string {
  const $ = cheerio.load(`<div>${html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|h3|li|blockquote)>/gi, '</$1>\n\n')}</div>`);
  return $('div').text().replace(/[ \t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

async function main() {
  const [posts, pages, cats, tags] = await Promise.all([
    getAll<WpItem>('posts?_embed=wp:featuredmedia'),
    getAll<WpItem>('pages?_embed=wp:featuredmedia'),
    getAll<{ id: number; name: string }>('categories'),
    getAll<{ id: number; name: string }>('tags'),
  ]);
  const catName = new Map(cats.map((c) => [c.id, decode(c.name)]));
  const tagName = new Map(tags.map((c) => [c.id, decode(c.name)]));
  const all = [...posts, ...pages];
  const ids = new Set(all.map((p) => p.id));
  const bySlug = new Map(all.map((p) => [decodeURIComponent(p.slug).toLowerCase(), p.id]));

  const items: KalaamItem[] = [];
  for (const p of all) {
    const html = await clean(p.content.rendered, p.id, ids, bySlug);
    const text = plainText(html);
    const media = p._embedded?.['wp:featuredmedia']?.[0];
    const remote = media?.media_details?.sizes?.large?.source_url ?? media?.source_url;
    const image = remote ? await saveImage(encodeURI(decodeURI(remote)), `kalaam/${p.id}`, { maxWidth: 1200, headers: UA }) : undefined;
    items.push({
      id: p.id,
      kind: p.type,
      title: decode(p.title.rendered),
      date: p.date,
      modified: p.modified,
      url: decodeURI(p.link),
      wpCategories: (p.categories ?? []).map((c) => catName.get(c)!).filter(Boolean),
      tags: (p.tags ?? []).map((t) => tagName.get(t)!).filter(Boolean),
      html,
      text,
      words: text.split(/\s+/).filter(Boolean).length,
      ...(image ? { image } : {}),
    });
    process.stdout.write('.');
  }
  items.sort((a, b) => b.date.localeCompare(a.date));
  await writeFile(OUT, JSON.stringify({ source: 'https://kalaam.ir/', importedAt: new Date().toISOString(), items }, null, 1) + '\n');
  console.log(`\nkalaam: ${posts.length} posts, ${pages.length} pages, ${items.filter((i) => i.image).length} images → ${OUT}`);
}

await main();
