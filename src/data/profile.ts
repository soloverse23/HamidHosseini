// The About page's account of his life and work, one file per language in
// src/data/about/. The text follows the biography he prepared for this site
// (hossaini-bio-all.md, 2026); the Virtual Faculty passage comes from the
// Faculty's own history.
import type { Locale } from '../i18n/locales';
import ar from './about/ar';
import en from './about/en';
import fa from './about/fa';
import ro from './about/ro';
import ur from './about/ur';

/** His Romanian number, for WhatsApp */
export const WHATSAPP = { url: 'https://wa.me/40734101111', number: '0734 101 111' };

export interface AboutItem {
  title: string;
  text: string;
  /** A path on this site, or a full URL */
  link?: string;
}

export interface AboutCopy {
  /** One line under the name */
  role: string;
  h: {
    bio: string;
    approach: string;
    current: string;
    positions: string;
    teaching: string;
    talks: string;
    longTalks: string;
    bucharest: string;
    lectures: string;
    educational: string;
    books: string;
    earlier: string;
    writings: string;
    papers: string;
    interviews: string;
  };
  facts: { label: string; value: string }[];
  bio: string[];
  approach: string[];
  current: AboutItem[];
  /** Grouped by institution; groups and the roles in each run oldest first. `key` marks the turning points */
  positions: { title: string; years: string; items: { years: string; role: string; key?: boolean }[] }[];
  pioneer: { year: string; text: string };
  teaching: string;
  courses: string[];
  series: AboutItem;
  longTalks: string[];
  bucharest: AboutItem[];
  lectures: AboutItem[];
  educational: AboutItem[];
  /** Books that have no page on this site */
  earlier: { title: string; year: string; publisher: string }[];
  papers: string[];
  interviews: string[];
}

export const ABOUT: Record<Locale, AboutCopy> = { fa, en, ro, ar, ur };
