// What the shelf and the reader need to know about each book, beyond its JSON.
//
// A book can exist in several editions: the original and its translations.
// Each language of the site shows the edition in its own language when there
// is one, and the original otherwise (with a way to ask for a translation).

import { join } from 'node:path';
import sharp from 'sharp';
import { BOOKS, type Work } from '../data/writings';
import { LOCALES, LOCALE_META, type Locale } from '../i18n/locales';

export interface Edition {
  lang: Locale;
  /** Direction the edition is bound in: a Persian book opens from the right */
  dir: 'ltr' | 'rtl';
  title: string;
  cover?: string;
  /** The cover is artwork, not the plain text template */
  designed: boolean;
  /** PDF served from this site, read in place */
  pdf?: string;
  pages?: number;
  year: number;
  translator?: string;
  /** Average colour of the cover, for the spine and the stage behind it */
  tone: string;
  original: boolean;
  /** Reading progress is kept per edition */
  key: string;
}

export interface Book extends Work {
  /** The original first, then translations in site order */
  editions: Edition[];
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
  BOOKS.map(async (b) => {
    const original: Edition = {
      lang: b.lang,
      dir: LOCALE_META[b.lang].dir,
      title: b.title[b.lang] ?? Object.values(b.title)[0]!,
      cover: b.cover,
      designed: !!b.designedCover,
      pdf: b.links.find((l) => l.kind === 'pdf' && l.url.startsWith('/'))?.url,
      pages: b.pages,
      year: b.year,
      tone: await tone(b.cover),
      original: true,
      key: b.id,
    };
    const translations = await Promise.all(
      LOCALES.filter((l) => l !== b.lang && b.translations?.[l]?.pdf).map(async (lang): Promise<Edition> => {
        const t = b.translations![lang]!;
        return {
          lang,
          dir: LOCALE_META[lang].dir,
          title: t.title,
          cover: t.cover ?? b.cover,
          designed: t.cover ? !!t.designedCover : !!b.designedCover,
          pdf: t.pdf,
          pages: t.pages,
          year: t.year ?? b.year,
          translator: t.translator,
          tone: await tone(t.cover ?? b.cover),
          original: false,
          key: `${b.id}.${lang}`,
        };
      }),
    );
    return { ...b, editions: [original, ...translations] };
  }),
);

/** The edition a reader of `locale` sees, and whether it is a stand-in for a missing translation. */
export function editionFor(book: Book, locale: Locale): { edition: Edition; missing: boolean } {
  const own = book.editions.find((e) => e.lang === locale);
  return { edition: own ?? book.editions[0], missing: !own };
}

/**
 * The shelf as a reader of `locale` sees it: books in their language first
 * (originals and translations alike), then the rest; each part keeps the
 * featured book first and then the newest.
 */
export function shelfFor(locale: Locale): Book[] {
  return [...books.filter((b) => !editionFor(b, locale).missing), ...books.filter((b) => editionFor(b, locale).missing)];
}

/** Books whose edition in `locale` has a designed cover: the slides at the top of the shelf. */
export function slidesFor(locale: Locale): Book[] {
  return shelfFor(locale).filter((b) => {
    const { edition, missing } = editionFor(b, locale);
    return !missing && edition.designed && edition.cover;
  });
}

/** "Persian", "persană", "الفارسية"… in the reader's language. */
export function languageName(lang: Locale, locale: Locale): string {
  try {
    return new Intl.DisplayNames([LOCALE_META[locale].intl.split('-u-')[0]], { type: 'language' }).of(lang) ?? LOCALE_META[lang].label;
  } catch {
    return LOCALE_META[lang].label;
  }
}

/** Spine thickness in px: thin pamphlets stay thin, the 500-page book looks it. */
export const thickness = (pages?: number) => Math.round(Math.min(26, Math.max(5, 4 + (pages ?? 60) / 22)));

/** WhatsApp number that takes requests for translations. */
export const TRANSLATION_REQUESTS = '40734101111';
