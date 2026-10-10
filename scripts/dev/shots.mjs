// Screenshot pages of a running preview server.
//   node scripts/dev/shots.mjs http://localhost:4321 out-dir /en/ /fa/quran/ …
// Env: WIDTH (default 1280), THEME=dark, FULL=1 for full-page.
import { chromium } from 'playwright-core';
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const [base, out, ...paths] = process.argv.slice(2);
const cache = join(homedir(), 'Library/Caches/ms-playwright');
const dir = readdirSync(cache).find((d) => /^chromium-\d+$/.test(d));
const exe = join(cache, dir, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const fallback = join(cache, dir, 'chrome-mac/Chromium.app/Contents/MacOS/Chromium');

let browser;
try {
  browser = await chromium.launch({ executablePath: exe });
} catch {
  browser = await chromium.launch({ executablePath: fallback });
}
const width = Number(process.env.WIDTH ?? 1280);
const ctx = await browser.newContext({
  viewport: { width, height: width < 600 ? 800 : 900 },
  deviceScaleFactor: 1,
  colorScheme: process.env.THEME === 'dark' ? 'dark' : 'light',
});
const page = await ctx.newPage();
for (const p of paths) {
  await page.goto(base + p, { waitUntil: 'networkidle' });
  const name = `${p.replace(/\W+/g, '_') || 'root'}-${width}${process.env.THEME === 'dark' ? '-dark' : ''}.png`;
  if (process.env.Y) {
    for (const y of process.env.Y.split(',')) {
      await page.evaluate((y) => window.scrollTo(0, Number(y)), y);
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(out, name.replace('.png', `-y${y}.png`)) });
    }
  } else {
    await page.screenshot({ path: join(out, name), fullPage: !!process.env.FULL });
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  console.log(name, overflow ? 'HORIZONTAL OVERFLOW' : '');
}
await browser.close();
