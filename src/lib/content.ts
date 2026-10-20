// Hand-written content edited in the CMS (/admin/): questions and answers,
// and reading paths for newcomers. One JSON file per entry.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Locale } from '../i18n/locales';

function load<T>(folder: string): T[] {
  const dir = join(process.cwd(), 'src/data/content', folder);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as T);
}

export interface Source {
  kind: 'verse' | 'note' | 'video' | 'article' | 'link';
  /** "9:8", a post number, an episode number, an article id, or a URL */
  ref: string;
  label?: string;
}

export interface Question {
  slug: string;
  lang: Locale;
  question: string;
  /** Answer in two or three sentences, shown first and used in search results */
  short: string;
  /** The full answer; paragraphs separated by an empty line */
  answer?: string;
  topics?: string[];
  sources?: Source[];
  date?: string;
  draft?: boolean;
}

export interface ReadingPath {
  id: string;
  lang: Locale;
  title: string;
  intro?: string;
  steps: { label: string; url: string; note?: string }[];
  order?: number;
  draft?: boolean;
}

export const QUESTIONS = load<Question>('qa').filter((q) => !q.draft && q.slug && q.question && q.short);
export const PATHS = load<ReadingPath>('paths')
  .filter((p) => !p.draft && p.steps?.length)
  .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

export const questionsIn = (locale: Locale) => QUESTIONS.filter((q) => q.lang === locale);
export const pathsIn = (locale: Locale) => PATHS.filter((p) => p.lang === locale);

/** Site path (or URL) of a cited source. */
export function sourceHref(s: Source): string {
  if (s.kind === 'verse') {
    const [surah, ayah] = s.ref.split(':');
    return `/fa/quran/${surah}/${ayah}/`;
  }
  if (s.kind === 'note') return `/fa/notes/${s.ref}/`;
  if (s.kind === 'article') return `/fa/articles/${s.ref}/`;
  if (s.kind === 'video') return /^\d+$/.test(s.ref) ? `/fa/videos/${s.ref}/` : s.ref;
  return s.ref;
}
