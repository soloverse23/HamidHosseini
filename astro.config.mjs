import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import search from './scripts/search/integration.ts';
import { readFileSync } from 'node:fs';

const postDates = new Map(
  JSON.parse(readFileSync(new URL('./src/data/feeds/telegram.json', import.meta.url), 'utf8')).items.map(
    (i) => [i.id, i.date],
  ),
);

// kalaam.ir articles: last edit on the blog (stored as Tehran local time).
const articleDates = new Map(
  JSON.parse(readFileSync(new URL('./src/data/kalaam.json', import.meta.url), 'utf8')).items.map((i) => [
    String(i.id),
    `${i.modified}+03:30`,
  ]),
);

const SITE = process.env.SITE_URL ?? 'https://hamidhosseini.vercel.app';

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
      // Individual Telegram posts are many and mirrored in five UIs; keep the
      // sitemap to the Persian copy of each, which matches its content.
      filter: (page) =>
        !/\/(en|ro|ar|ur)\/notes\/\d+\/$/.test(page) &&
        !/\/notes\/(page|topic)\//.test(page) &&
        !/\/search\/$/.test(page) &&
        !/\/timeline\//.test(page),
      serialize(item) {
        // Persian-only posts have no translated twins; drop the hreflang links.
        const post = item.url.match(/\/fa\/notes\/(\d+)\/$/);
        if (post) {
          delete item.links;
          item.lastmod = postDates.get(post[1]);
        }
        const article = item.url.match(/\/fa\/articles\/(\d+)\/$/);
        if (article) {
          delete item.links;
          item.lastmod = articleDates.get(article[1]);
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
