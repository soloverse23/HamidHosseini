// The strings the search UI needs in the browser, rendered once on the server.
import { LOCALE_META, type Locale } from '../../i18n/locales';
import { t } from '../../i18n/strings';
import type { Ctx } from './client';

export function searchCtx(locale: Locale): Ctx {
  const s = t(locale);
  return {
    locale,
    intl: LOCALE_META[locale].intl,
    labels: {
      types: s.search.types,
      results: s.search.results('{n}', false),
      resultsOne: s.search.results('{n}', true),
      verse: s.search.verse,
      surah: s.search.surah,
      verses: s.quran.verses('{n}'),
      notTranslated: s.quran.notTranslated,
      episode: s.episode('{n}'),
      on: s.search.on('{p}'),
      work: {
        book: s.books.books,
        article: s.books.articles,
        interview: s.books.articles,
        dialogue: s.books.articles,
        lectures: s.books.lectures,
        series: s.articles.series,
        blog: s.sections.articles.title,
      },
      sessions: s.books.sessions('{n}'),
      minutes: s.minutes('{n}'),
    },
  };
}
