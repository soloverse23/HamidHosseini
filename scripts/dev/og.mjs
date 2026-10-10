// Render public/og.png (1200×630) with the site's own fonts.
//   npx astro preview & node scripts/dev/og.mjs http://localhost:4321
import { chromium } from 'playwright-core';
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const base = process.argv[2] ?? 'http://localhost:4321';
const cache = join(homedir(), 'Library/Caches/ms-playwright');
const dir = readdirSync(cache).find((d) => /^chromium-\d+$/.test(d));
const browser = await chromium.launch({
  executablePath: join(cache, dir, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(`${base}/en/`, { waitUntil: 'networkidle' });
await page.evaluate(() => {
  document.documentElement.dataset.theme = 'light';
  document.body.innerHTML = `
  <div style="width:1200px;height:630px;box-sizing:border-box;padding:72px 80px;background:#f7f3ec;color:#1d1a15;display:flex;flex-direction:column;justify-content:space-between;border-bottom:10px solid #1d4f91">
    <svg width="56" height="56" viewBox="0 0 32 32" fill="none"><g stroke="#1d4f91" stroke-width="1.4" stroke-linejoin="round"><rect x="7" y="7" width="18" height="18"/><rect x="7" y="7" width="18" height="18" transform="rotate(45 16 16)"/><circle cx="16" cy="16" r="3.2"/></g></svg>
    <div>
      <div style="font-family:'Noto Naskh Arabic Variable';font-size:64px;font-weight:600;direction:rtl;text-align:left;line-height:1.3">سید حمید حسینی</div>
      <div style="font-family:'Newsreader Variable';font-size:84px;letter-spacing:-0.02em;line-height:1.05;margin-top:4px">Seyed Hamid Hosseini</div>
    </div>
    <div style="font-family:'IBM Plex Sans';font-size:26px;color:#4b463d;display:flex;gap:28px">
      <span>Quran translation</span><span style="color:#b9ae99">·</span><span>Notes</span><span style="color:#b9ae99">·</span><span>Islam: why and how?</span>
    </div>
  </div>`;
  document.body.style.margin = '0';
});
await page.waitForTimeout(400);
await page.screenshot({ path: 'public/og.png' });
await browser.close();
console.log('public/og.png');
