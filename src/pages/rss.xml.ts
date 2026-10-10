import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { latest } from '../lib/data';
import { excerpt, firstLine } from '../lib/text';

export function GET(context: APIContext) {
  const items = latest(60);
  return rss({
    title: 'سید حمید حسینی · Seyed Hamid Hosseini',
    description: 'Notes, Quran translation and talks — Telegram, YouTube and more.',
    site: context.site!,
    items: items.map((i) => ({
      title: i.title ?? (firstLine(i.text.replace(/^[^\p{L}\p{N}«(]+/u, ''), 100) || i.source),
      link: i.source === 'telegram' ? `/fa/notes/${i.id}/` : i.url,
      pubDate: new Date(i.date),
      description: excerpt(i.text, 400),
      categories: [i.source],
    })),
    customData: '<language>fa</language>',
  });
}
