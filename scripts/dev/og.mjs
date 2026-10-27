// Render public/og.png (1200×630) with the site's own fonts.
//   npx astro preview & node scripts/dev/og.mjs http://localhost:4321
import { chromium } from 'playwright-core';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const base = process.argv[2] ?? 'http://localhost:4321';
const cache = join(homedir(), 'Library/Caches/ms-playwright');
const exe = (d) => join(cache, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
// Older installs may hold only an Intel build; take one that has the arm64 app.
const dir = readdirSync(cache).find((d) => /^chromium-\d+$/.test(d) && existsSync(exe(d)));
const browser = await chromium.launch({ executablePath: exe(dir) });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(`${base}/en/`, { waitUntil: 'networkidle' });
await page.evaluate(async () => {
  document.querySelectorAll('dialog').forEach((d) => d.remove());
  // <vercel-analytics> in <head> ends it early, so the stylesheets are parsed
  // into <body>; keep them before the body is replaced.
  document.querySelectorAll('link[rel=stylesheet], style').forEach((n) => document.head.append(n));
  document.documentElement.dataset.theme = 'light';
  document.body.innerHTML = `
  <div style="width:1200px;height:630px;box-sizing:border-box;padding:72px 80px;background:#f7f3ec;color:#1d1a15;display:flex;flex-direction:column;justify-content:space-between;border-bottom:10px solid #1d4f91">
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none"><path stroke="#1d4f91" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="m19.648 5.437l-.659-1.043c-.364-.577-.546-.866-.785-.892c-.238-.027-.505.247-1.038.795c-1.722 1.77-3.444 1.508-5.166 4.691c-1.722-3.183-3.444-2.921-5.166-4.691c-.533-.548-.8-.822-1.038-.795c-.239.026-.421.315-.785.892l-.658 1.043c-.255.402-.382.604-.347.816c.034.212.217.357.584.647l6.182 4.898c.591.468.887.702 1.228.702s.637-.234 1.228-.702L19.41 6.9c.367-.29.55-.435.584-.647c.035-.212-.092-.414-.346-.816M22 8.5l-16 12v-4.696M2 8.5l16 12v-4.696"/></svg>
    <div>
      <div style="font-family:'Noto Naskh Arabic Variable';font-size:64px;font-weight:600;direction:rtl;text-align:left;line-height:1.3">سید حمید حسینی</div>
      <div style="font-family:'Vazirmatn Variable';font-size:30px;color:#4b463d;direction:rtl;text-align:left;line-height:1.6">آثار، فعالیت‌ها و گفتگوها</div>
      <div style="font-family:'Newsreader Variable';font-size:84px;letter-spacing:-0.02em;line-height:1.05;margin-top:24px">Seyyed Hamid Hosseini</div>
    </div>
    <div style="font-family:'IBM Plex Sans';font-size:26px;color:#4b463d">Works, Projects and Dialogues</div>
  </div>`;
  document.body.style.margin = '0';
  // Webfonts load on first use; wait for them so nothing falls back.
  await Promise.all(
    ["600 64px 'Noto Naskh Arabic Variable'", "30px 'Vazirmatn Variable'", "84px 'Newsreader Variable'", "26px 'IBM Plex Sans'"].map((f) => document.fonts.load(f)),
  );
});
await page.waitForTimeout(400);
// The translate offer opens a moment after load; drop it if it has.
await page.evaluate(() => document.querySelectorAll('dialog').forEach((d) => d.remove()));
await page.screenshot({ path: 'public/og.png' });
await browser.close();
console.log('public/og.png');
