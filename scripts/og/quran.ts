// Open Graph cards (1200×630) for the Quran pages: the section, each surah,
// each translated verse, the glossary and each root. Rendered in Chromium
// with the site's own fonts, because the Arabic needs real shaping (Amiri
// Quran's marks and ligatures), which SVG-only renderers get wrong.
//
//   npx tsx scripts/og/quran.ts            # render what changed
//   npx tsx scripts/og/quran.ts --force    # render everything
//   npx tsx scripts/og/quran.ts --only 2/255,1,index
//   npx tsx scripts/og/quran.ts --pending  # print how many need drawing, draw nothing
//
// Images go to public/og/quran/, and src/data/og/quran.json records a hash of
// each card's content. A card is redrawn only when its text changes, and pages
// add the hash to the image URL so social sites fetch the new one.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { chromium, type Browser } from 'playwright-core';
import sharp from 'sharp';
import { t } from '../../src/i18n/strings';
import { arabic, quranFa, surahs, totalTranslated, translatedCount } from '../../src/lib/data';
import { num } from '../../src/lib/format';
import { ROOTS, rootSlug } from '../../src/lib/glossary';
import { excerpt } from '../../src/lib/text';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = join(ROOT, 'public/og/quran');
const MANIFEST = join(ROOT, 'src/data/og/quran.json');
const ORIGIN = 'https://og.local';

const s = t('fa');
const fa = (x: number) => num('fa', x);
const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ---------- Pieces ---------- */

const MARK = `<svg class="mark" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="m19.648 5.437l-.659-1.043c-.364-.577-.546-.866-.785-.892c-.238-.027-.505.247-1.038.795c-1.722 1.77-3.444 1.508-5.166 4.691c-1.722-3.183-3.444-2.921-5.166-4.691c-.533-.548-.8-.822-1.038-.795c-.239.026-.421.315-.785.892l-.658 1.043c-.255.402-.382.604-.347.816c.034.212.217.357.584.647l6.182 4.898c.591.468.887.702 1.228.702s.637-.234 1.228-.702L19.41 6.9c.367-.29.55-.435.584-.647c.035-.212-.092-.414-.346-.816M22 8.5l-16 12v-4.696M2 8.5l16 12v-4.696"/></svg>`;

/** Rub el hizb, the eight-pointed star that marks the Quran's sections: two
 *  squares turned 45° against each other, drawn as one outline. */
const STAR = Array.from({ length: 16 }, (_, i) => {
  const r = i % 2 ? 37 : 48;
  const a = (i * Math.PI) / 8;
  return `${(r * Math.sin(a)).toFixed(2)},${(-r * Math.cos(a)).toFixed(2)}`;
}).join(' ');

const star = (cls: string, inner = '') =>
  `<span class="${cls}"><svg viewBox="-50 -50 100 100"><polygon points="${STAR}"/><circle r="29"/></svg>${inner ? `<b>${inner}</b>` : ''}</span>`;

/** The faint star behind each card. */
const WATERMARK = `<svg class="wm" viewBox="-50 -50 100 100"><polygon points="${STAR}"/><circle r="29"/><circle r="49.5"/></svg>`;

const head = (end: string, brand = s.sections.quran.title) => `
  <header>
    <span class="brand">${MARK}<span>${esc(brand)}</span></span>
    <span class="ref">${end}</span>
  </header>`;

const foot = (path: string) => `
  <footer>
    <span class="who">سید حمید حسینی</span>
    <span class="url" dir="ltr">hossaini.site<i>/fa/${esc(path)}</i></span>
  </footer>`;

const card = (kind: string, body: string) => `<main class="card card--${kind}">${WATERMARK}${body}</main>`;

/* ---------- Cards ---------- */

function verseCard(surah: number, ayah: number) {
  const m = surahs[surah - 1];
  const v = quranFa.surahs[surah][ayah];
  return card(
    'verse',
    `${head(`${star('medal', fa(ayah))}<span>${s.quran.surah} ${esc(m.fa)}</span>`)}
    <section class="body fit">
      <p class="ar" lang="ar">${esc(arabic[surah][ayah - 1])} <span class="end">﴿${num('ar', ayah)}﴾</span></p>
      <span class="rule"></span>
      <p class="tr">${esc(v.text)}</p>
    </section>
    ${foot(`quran/${surah}/${ayah}`)}`,
  );
}

function surahCard(n: number) {
  const m = surahs[n - 1];
  const done = translatedCount(n);
  return card(
    'surah',
    `${head(`<span>${s.quran.surah} ${fa(n)} از ${fa(114)}</span>`)}
    <section class="body">
      ${star('medal medal--lg', fa(n))}
      <p class="name" lang="ar">سُورَةُ ${esc(m.ar)}</p>
      <p class="sub">${s.quran.surah} ${esc(m.fa)}<span>${s.quran.verses(fa(m.ayahs))}</span><span>${m.place === 'mecca' ? s.quran.mecca : s.quran.medina}</span></p>
      ${
        done
          ? `<div class="progress"><span style="--p:${(done / m.ayahs) * 100}%"></span></div><p class="meta">${s.quran.translated(fa(done), fa(m.ayahs))}</p>`
          : `<p class="basmala" lang="ar">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</p>`
      }
    </section>
    ${foot(`quran/${n}`)}`,
  );
}

function indexCard() {
  const cells = surahs
    .map((m) => `<i style="--p:${Math.round((translatedCount(m.n) / m.ayahs) * 100)}%"></i>`)
    .join('');
  return card(
    'index',
    `${head(`<span>${s.quran.translated(fa(totalTranslated), fa(6236))}</span>`, 'قرآن کریم')}
    <section class="body">
      <p class="title">${esc(s.sections.quran.title)}</p>
      <p class="lede">ترجمه‌ای آیه‌به‌آیه، با توضیح دلیل هر انتخاب</p>
      <div class="qmap">${cells}</div>
    </section>
    ${foot('quran')}`,
  );
}

function rootsCard() {
  const sample = ROOTS.slice(0, 400)
    .filter((_, i) => i % Math.max(1, Math.floor(Math.min(ROOTS.length, 400) / 18)) === 0)
    .slice(0, 18)
    .map((e) => `<span>${esc(e.root)}</span>`)
    .join('');
  return card(
    'roots',
    `${head(`<span>${fa(ROOTS.length)} ماده</span>`)}
    <section class="body">
      <p class="title">${esc(s.quran.roots)}</p>
      <p class="lede">معنای هر ماده، از توضیحات ترجمهٔ مستدل قرآن</p>
      <p class="cloud" lang="ar">${sample}</p>
    </section>
    ${foot('quran/roots')}`,
  );
}

function rootCard(e: (typeof ROOTS)[number]) {
  const d = e.definitions[0];
  const verses = new Set([...e.definitions, ...e.mentions].map((r) => `${r.surah}:${r.ayah}`)).size;
  return card(
    'root',
    `${head(`<span>${esc(s.quran.roots)}</span>`)}
    <section class="body">
      <div class="root">
        <p class="letters" lang="ar">${[...e.root].map(esc).join(' ')}</p>
        <p class="meta">${esc(s.quran.rootTitle(e.root))}<span>${fa(verses)} آیه</span></p>
      </div>
      <p class="def">${esc(excerpt(d.text, 420))}</p>
      <p class="meta">${s.quran.explainedAt} ${s.quran.verse} ${fa(d.ayah)} ${s.quran.surah} ${esc(surahs[d.surah - 1].fa)}</p>
    </section>
    ${foot(`quran/roots/${rootSlug(e)}`)}`,
  );
}

/* ---------- Page ---------- */

const CSS = `
:root {
  --paper: #f7f3ec; --paper-2: #efe9de; --paper-3: #e6dfd1;
  --ink: #1d1a15; --ink-2: #4b463d; --ink-3: #6f695d;
  --rule: #d8cfbf; --accent: #1d4f91; --accent-wash: #e3e9f1;
  --naskh: 'Noto Naskh Arabic Variable', serif;
  --sans: 'Vazirmatn Variable', sans-serif;
  --quran: 'Amiri Quran', 'Noto Naskh Arabic Variable', serif;
}
* { margin: 0; box-sizing: border-box; }
html, body { width: 1200px; height: 630px; overflow: hidden; background: var(--paper); }
body { direction: rtl; font-family: var(--sans); color: var(--ink); -webkit-font-smoothing: antialiased; }

.card {
  position: relative; width: 1200px; height: 630px; overflow: hidden;
  padding: 52px 80px 0; display: flex; flex-direction: column;
  background: var(--paper); border-bottom: 10px solid var(--accent);
}
.card::before {
  content: ''; position: absolute; inset: 22px 22px 12px; pointer-events: none;
  border: 1px solid var(--rule);
}
.wm { position: absolute; width: 470px; height: 470px; left: -190px; top: 80px; fill: none; stroke: var(--rule); stroke-width: 0.5; opacity: 0.6; }
header, footer, .body { position: relative; }

header { display: flex; justify-content: space-between; align-items: center; font-size: 25px; color: var(--ink-2); height: 48px; }
.brand, .ref { display: flex; align-items: center; gap: 14px; }
.brand { font-family: var(--naskh); font-weight: 600; color: var(--ink); }
.mark { width: 38px; height: 38px; color: var(--accent); }
.ref { color: var(--accent); font-weight: 500; }

.medal { position: relative; display: inline-grid; place-items: center; width: 56px; height: 56px; }
.medal svg { position: absolute; inset: 0; fill: var(--paper); stroke: var(--accent); stroke-width: 3; overflow: visible; }
.medal circle { stroke-width: 1.5; opacity: 0.6; }
.medal b { position: relative; font-size: 21px; font-weight: 600; color: var(--accent); }
.medal--lg { width: 88px; height: 88px; }
.medal--lg svg { stroke-width: 2.2; }
.medal--lg b { font-size: 30px; }

.body { flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; gap: 22px; padding-block: 8px; }

footer { display: flex; justify-content: space-between; align-items: center; height: 72px; font-size: 22px; color: var(--ink-3); }
.who { font-family: var(--naskh); font-weight: 600; color: var(--ink-2); }
.url { font-family: 'IBM Plex Sans', sans-serif; font-size: 20px; letter-spacing: 0.01em; }
.url i { font-style: normal; color: var(--ink-3); opacity: 0.75; }

.meta { font-size: 22px; color: var(--ink-3); display: flex; gap: 0 14px; justify-content: center; flex-wrap: wrap; }
.meta span::before, .sub span::before { content: '·'; margin-inline-end: 14px; color: var(--rule); }

/* Verse: Arabic over the translation, scaled together to fit. */
.card--verse .body { --k: 1.4; gap: calc(20px * var(--k)); }
.ar { font-family: var(--quran); font-size: calc(50px * var(--k)); line-height: 1.85; color: var(--ink); max-width: 1000px; }
.end { color: var(--accent); font-size: 0.8em; white-space: nowrap; }
.rule { display: block; width: 72px; height: 2px; margin-top: 10px; background: var(--accent); opacity: 0.8; flex: none; }
.tr { font-family: var(--naskh); font-size: calc(31px * min(var(--k), 1.1)); line-height: 1.75; color: var(--ink-2); max-width: 980px; }

/* Surah */
.card--surah .body { gap: 10px; }
.name { font-family: var(--quran); font-size: 96px; line-height: 1.8; color: var(--ink); margin-block: -12px -4px; }
.sub { font-family: var(--naskh); font-size: 32px; font-weight: 500; color: var(--ink-2); display: flex; gap: 0 14px; }
.sub span { font-family: var(--sans); font-size: 25px; color: var(--ink-3); align-self: center; }
.progress { width: 460px; height: 8px; background: var(--paper-3); border-radius: 1px; margin-top: 10px; display: flex; }
.progress span { width: var(--p); background: var(--accent); border-radius: 1px; }
.basmala { font-family: var(--quran); font-size: 34px; color: var(--ink-3); margin-top: 6px; }

/* Section and glossary */
.title { font-family: var(--naskh); font-weight: 700; font-size: 92px; line-height: 1.35; color: var(--ink); }
.lede { font-size: 30px; color: var(--ink-2); margin-top: -10px; }
.qmap { display: grid; grid-template-columns: repeat(57, 1fr); gap: 4px; width: 1040px; margin-top: 26px; direction: rtl; }
.qmap i { display: block; height: 30px; border-radius: 1px; background: linear-gradient(to top, var(--accent) var(--p), var(--paper-3) var(--p)); }
.cloud { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px 34px; max-width: 1000px; margin-top: 18px; font-family: var(--quran); font-size: 40px; color: var(--accent); line-height: 1.6; }
.cloud span:nth-child(3n+2) { color: var(--ink-3); }

/* Root */
.card--root .body { gap: 18px; }
.root { display: flex; flex-direction: column; align-items: center; gap: 0; }
.letters { font-family: var(--naskh); font-weight: 600; font-size: 100px; line-height: 1.6; color: var(--accent); word-spacing: 0.12em; }
.def { font-family: var(--naskh); font-size: 27px; line-height: 1.75; color: var(--ink-2); max-width: 960px; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
`;

const FONTS = [
  '@fontsource/amiri-quran/400.css',
  '@fontsource-variable/vazirmatn/index.css',
  '@fontsource-variable/noto-naskh-arabic/index.css',
  '@fontsource/ibm-plex-sans/400.css',
];

const SHELL = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
${FONTS.map((f) => `<link rel="stylesheet" href="/node_modules/${f}">`).join('')}
<style>${CSS}</style></head><body></body></html>`;

/** Shrink the verse until it fits. The longest keep three lines each, cut at
 *  a whole word (the verse number stays). A string, so tsx's helpers don't
 *  leak into the page. */
const FIT = `(() => {
  const body = document.querySelector('.fit');
  if (!body) return;
  const over = () => body.scrollHeight > body.clientHeight + 1;
  for (let k = 1.4; k >= 0.78 && over(); k -= 0.02) body.style.setProperty('--k', k.toFixed(2));
  if (!over()) return;
  for (const el of body.querySelectorAll('.ar, .tr')) {
    const max = parseFloat(getComputedStyle(el).lineHeight) * 3 + 2;
    const text = el.firstChild;
    const words = text.textContent.trim().split(/\\s+/);
    while (words.length > 1 && el.offsetHeight > max) {
      words.pop();
      text.textContent = words.join(' ') + ' … ';
    }
  }
})()`;

async function launch(): Promise<Browser> {
  if (process.platform !== 'darwin') return chromium.launch();
  // Same lookup as scripts/dev/og.mjs: take a cached build that has the arm64 app.
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  const exe = (d: string) => join(cache, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
  const dir = readdirSync(cache).find((d) => /^chromium-\d+$/.test(d) && existsSync(exe(d)));
  return chromium.launch(dir ? { executablePath: exe(dir) } : {});
}

/* ---------- Run ---------- */

const jobs = new Map<string, () => string>([
  ['index', indexCard],
  ['roots', rootsCard],
  ...surahs.map((m) => [String(m.n), () => surahCard(m.n)] as const),
  ...Object.entries(quranFa.surahs).flatMap(([surah, ayahs]) =>
    Object.keys(ayahs).map((a) => [`${surah}/${a}`, () => verseCard(Number(surah), Number(a))] as const),
  ),
  ...ROOTS.map((e) => [`roots/${rootSlug(e)}`, () => rootCard(e)] as const),
]);

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : undefined;
const manifest: Record<string, string> = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
const hashOf = (html: string) => createHash('sha1').update(CSS).update(FIT).update(html).digest('hex').slice(0, 10);
const file = (key: string) => join(OUT, `${key}.png`);

const todo = [...jobs]
  .filter(([key]) => !only || only.has(key))
  .map(([key, render]) => ({ key, html: render() }))
  .map((j) => ({ ...j, hash: hashOf(j.html) }))
  .filter((j) => only || force || manifest[j.key] !== j.hash || !existsSync(file(j.key)));

if (args.includes('--pending')) {
  console.log(todo.length + Object.keys(manifest).filter((k) => !jobs.has(k)).length);
  process.exit(0);
}
// Cards whose page is gone (a verse moved, a root merged) are removed.
if (!only) {
  for (const key of Object.keys(manifest)) {
    if (jobs.has(key)) continue;
    rmSync(file(key), { force: true });
    delete manifest[key];
  }
}

console.log(`og/quran: ${todo.length} to render of ${jobs.size}`);

if (todo.length) {
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await ctx.route(`${ORIGIN}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/') return route.fulfill({ contentType: 'text/html', body: SHELL });
    const path = join(ROOT, decodeURIComponent(pathname));
    if (!path.startsWith(join(ROOT, 'node_modules')) || !existsSync(path)) return route.fulfill({ status: 404 });
    const type = { '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff' }[extname(path)] ?? 'application/octet-stream';
    return route.fulfill({ contentType: type, body: readFileSync(path) });
  });

  const queue = [...todo];
  let done = 0;
  const worker = async () => {
    const page = await ctx.newPage();
    await page.goto(`${ORIGIN}/`, { waitUntil: 'load' });
    for (let job = queue.shift(); job; job = queue.shift()) {
      await page.evaluate(async (html) => {
        document.body.innerHTML = html;
        // Webfonts load on first use: lay out, then wait so nothing falls back.
        void document.body.offsetHeight;
        await document.fonts.ready;
        await Promise.all([...document.fonts].filter((f) => f.status === 'loading').map((f) => f.loaded));
      }, job.html);
      await page.evaluate(FIT);
      const png = await page.screenshot({ type: 'png' });
      mkdirSync(dirname(file(job.key)), { recursive: true });
      writeFileSync(file(job.key), await sharp(png).png({ palette: true, colours: 128, dither: 0.6, effort: 8 }).toBuffer());
      manifest[job.key] = job.hash;
      if (++done % 100 === 0) console.log(`  ${done}/${todo.length}`);
    }
    await page.close();
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  await browser.close();
}

const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })));
mkdirSync(dirname(MANIFEST), { recursive: true });
writeFileSync(MANIFEST, JSON.stringify(sorted, null, 2) + '\n');
console.log('og/quran: done');
