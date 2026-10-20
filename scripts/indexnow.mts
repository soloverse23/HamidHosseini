/**
 * Tells IndexNow engines (Bing, which also feeds Copilot and ChatGPT search,
 * Yandex, Seznam, Naver) which pages changed, so they recrawl them soon.
 *
 *   npx tsx scripts/indexnow.mts [--days 2] [url …]
 *
 * Without URLs, submits the live sitemap entries modified in the last
 * --days days plus the five home pages. Run after a production deploy
 * (.github/workflows/indexnow.yml). The key file is public/<KEY>.txt.
 */
import { PRODUCTION_URL } from '../src/lib/site';

const KEY = '5af46353cd129a93e179dfbe9543f5e0';
const origin = new URL(process.env.SITE_URL ?? PRODUCTION_URL).origin;
const args = process.argv.slice(2);
const daysAt = args.indexOf('--days');
const days = daysAt >= 0 ? Number(args.splice(daysAt, 2)[1]) : 2;

async function changedUrls(): Promise<string[]> {
  const since = Date.now() - days * 86_400_000;
  const index = await (await fetch(`${origin}/sitemap-index.xml`)).text();
  const urls = new Set(['en', 'ro', 'ar', 'fa', 'ur'].map((l) => `${origin}/${l}/`));
  for (const [, map] of index.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const xml = await (await fetch(map)).text();
    for (const [, block] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
      const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1];
      const mod = block.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];
      if (loc && mod && Date.parse(mod) >= since) urls.add(loc);
    }
  }
  return [...urls];
}

const urls = args.length ? args : await changedUrls();
// The protocol accepts up to 10,000 URLs per request.
for (let i = 0; i < urls.length; i += 10_000) {
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: new URL(origin).host,
      key: KEY,
      keyLocation: `${origin}/${KEY}.txt`,
      urlList: urls.slice(i, i + 10_000),
    }),
  });
  console.log(`indexnow: ${res.status} ${res.statusText} for ${Math.min(10_000, urls.length - i)} URL(s)`);
  if (res.status >= 400) process.exit(1);
}
