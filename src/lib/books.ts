// What the shelf and the reader need to know about each book, beyond its JSON.

import { join } from 'node:path';
import sharp from 'sharp';
import { BOOKS, type Work } from '../data/writings';
import { LOCALE_META } from '../i18n/locales';

export interface Book extends Work {
  /** PDF served from this site, read in place */
  pdf?: string;
  /** Direction the book is bound in: a Persian book opens from the right */
  dir: 'ltr' | 'rtl';
  /** Average colour of the cover, for the spine and the stage behind it */
  tone: string;
}

/** Mean colour of the cover, darkened a little so light text reads on it. */
async function tone(cover?: string): Promise<string> {
  if (!cover?.startsWith('/')) return '#3a352c';
  try {
    const { channels } = await sharp(join(process.cwd(), 'public', cover)).stats();
    const [r, g, b] = channels.map((c) => Math.round(c.mean * 0.72));
    return `rgb(${r} ${g} ${b})`;
  } catch {
    return '#3a352c';
  }
}

export const books: Book[] = await Promise.all(
  BOOKS.map(async (b) => ({
    ...b,
    pdf: b.links.find((l) => l.kind === 'pdf' && l.url.startsWith('/'))?.url,
    dir: LOCALE_META[b.lang].dir,
    tone: await tone(b.cover),
  })),
);

/** Spine thickness in px: thin pamphlets stay thin, the 500-page book looks it. */
export const thickness = (pages?: number) => Math.round(Math.min(26, Math.max(5, 4 + (pages ?? 60) / 22)));
