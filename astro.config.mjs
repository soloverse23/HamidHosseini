import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import search from './scripts/search/integration.ts';
import { readFileSync } from 'node:fs';
import { PRODUCTION_URL } from './src/lib/site.ts';
import { isThin } from './src/lib/text.ts';

const telegramItems = JSON.parse(readFileSync(new URL('./src/data/feeds/telegram.json', import.meta.url), 'utf8')).items;
const postDates = new Map(telegramItems.map((i) => [i.id, i.date]));
// Posts with nothing to read are noindex on their page; keep them out of the sitemap too.
const thinPosts = new Set(telegramItems.filter(isThin).map((i) => i.id));

// Episode pages are indexed only in languages that have that episode.
const episodeLangs = new Set(
  JSON.parse(readFileSync(new URL('./src/data/feeds/youtube.json', import.meta.url), 'utf8'))
    .items.filter((i) => i.episode && i.channel && i.kind === 'video')
    .map((i) => `${i.channel}/${i.episode}`),
);

// Quran verse pages: the date of the post that proposed the verse.
const verseDates = new Map(
  Object.entries(JSON.parse(readFileSync(new URL('./src/data/quran/fa.json', import.meta.url), 'utf8')).surahs).flatMap(
    ([s, ayahs]) => Object.entries(ayahs).map(([a, v]) => [`${s}/${a}`, v.date]),
  ),
);

// kalaam.ir articles: last edit on the blog (stored as Tehran local time).
const articleDates = new Map(
  JSON.parse(readFileSync(new URL('./src/data/kalaam.json', import.meta.url), 'utf8')).items.map((i) => [
    String(i.id),
    `${i.modified}+03:30`,
  ]),
);

const SITE = process.env.SITE_URL ?? PRODUCTION_URL;

export default defineConfig({
  site: SITE,
  trailingSlash: 'always',
  devToolbar: { enabled: false },
  build: { format: 'directory' },
  i18n: {
    locales: ['en', 'ro', 'ar', 'fa', 'ur'],
    defaultLocale: 'en',
    routing: { prefixDefaultLocale: true, redirectToDefaultLocale: false },
  },
  integrations: [
    search(),
    sitemap({
      // Telegram posts are Persian and mirrored in five UIs; keep the sitemap to
      // the Persian copy (posts, the list and its topics) and skip pagination.
      filter: (page) =>
        new URL(page).pathname !== '/' &&
        !/\/404\/$/.test(page) &&
        !/\/(en|ro|ar|ur)\/notes\//.test(page) &&
        !thinPosts.has(page.match(/\/fa\/notes\/(\d+)\/$/)?.[1]) &&
        !/\/notes\/(.+\/)?page\//.test(page) &&
        !/\/search\/$/.test(page) &&
        !(/\/videos\/\d+\/$/.test(page) && !episodeLangs.has(page.match(/\/(\w\w)\/videos\/(\d+)\/$/).slice(1).join('/'))) &&
        !/\/timeline\//.test(page),
      serialize(item) {
        // Persian-only content has no translated twins; drop the hreflang links.
        if (/\/fa\/notes\//.test(item.url)) delete item.links;
        if (/\/fa\/quran\/roots\//.test(item.url)) delete item.links;
        const post = item.url.match(/\/fa\/notes\/(\d+)\/$/);
        if (post) item.lastmod = postDates.get(post[1]);
        const verse = item.url.match(/\/fa\/quran\/(\d+\/\d+)\/$/);
        if (verse) {
          delete item.links;
          item.lastmod = verseDates.get(verse[1]);
        }
        const article = item.url.match(/\/fa\/articles\/(\d+)\/$/);
        if (article) {
          delete item.links;
          item.lastmod = articleDates.get(article[1]);
        }
        // Episodes that exist in only one language: keep self, drop empty twins.
        const ep = item.url.match(/\/(\w\w)\/videos\/(\d+)\/$/);
        if (ep && item.links) {
          item.links = item.links.filter((l) => episodeLangs.has(`${l.lang}/${ep[2]}`) || l.lang === ep[1]);
          if (item.links.length <= 1) delete item.links;
        }
        return item;
      },
      i18n: { defaultLocale: 'en', locales: { en: 'en', ro: 'ro', ar: 'ar', fa: 'fa', ur: 'ur' } },
    }),
  ],
  vite: {
    build: { assetsInlineLimit: 0 },
  },
});
