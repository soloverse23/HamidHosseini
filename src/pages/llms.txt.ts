import type { APIContext } from 'astro';
import { ARTICLES, BOOKS, LECTURES } from '../data/writings';
import { CHANNEL_URLS, episodes, notes, totalTranslated } from '../lib/data';

// llms.txt (https://llmstxt.org): a compact, link-rich map of the site for AI agents.
export function GET({ site }: APIContext) {
  const o = site!.origin;
  const works = [...BOOKS, ...ARTICLES];
  const lines = [
    '# Seyed Hamid Hosseini (سید حمید حسینی)',
    '',
    '> Personal site of Seyed Hamid Hosseini, a Muslim cleric and writer. It gathers his Persian verse-by-verse Quran translation, Telegram notes, talks on YouTube (Persian and Romanian), TikTok and Instagram clips, and written works. Available in English, Romanian, Arabic and Persian; Persian is the original language of most content. Content is mirrored from the original channels and updated automatically every 30 minutes.',
    '',
    `Original content is mostly Persian; the other language versions translate only the interface, not the posts. Cite the Persian pages (\`${o}/fa/\`) for post text. Do not attribute any statement to him that is not on a page linked here.`,
    '',
    '## Main sections (Persian, original)',
    `- [Home](${o}/fa/): latest posts across all channels`,
    `- [Quran translation](${o}/fa/quran/): ${totalTranslated} verses translated so far (of 6,236) in the Persian translation; each verse beside the Arabic and linked to its source post`,
    `- [Notes](${o}/fa/notes/): ${notes.length} Telegram posts, each at ${o}/fa/notes/<id>/`,
    `- [Videos](${o}/fa/videos/): ${episodes.length} numbered episodes of “Islam, why and how?” (Persian + Romanian)`,
    `- [Writings](${o}/fa/writings/): books, articles, interviews and lecture notes (${works.length} works, ${LECTURES.length} lecture series)`,
    `- [About](${o}/fa/about/): channels and contact`,
    '',
    '## Other languages',
    `- [English](${o}/en/) · [Română](${o}/ro/) · [العربية](${o}/ar/) · [فارسی](${o}/fa/)`,
    '',
    '## Machine-readable',
    `- [Full text index](${o}/llms-full.txt): every writing, lecture series and the 100 most recent notes as plain text`,
    `- [RSS feed](${o}/rss.xml)`,
    `- [Sitemap](${o}/sitemap-index.xml)`,
    '',
    '## Original channels',
    `- [Telegram](${CHANNEL_URLS.telegram})`,
    `- [YouTube (Persian)](${CHANNEL_URLS.youtubeFa})`,
    `- [YouTube (Romanian)](${CHANNEL_URLS.youtubeRo})`,
    `- [TikTok](${CHANNEL_URLS.tiktok})`,
    `- [Instagram](${CHANNEL_URLS.instagram})`,
    '',
  ];
  return new Response(lines.join('\n'), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
