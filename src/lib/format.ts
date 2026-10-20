import { LOCALE_META, type Locale } from '../i18n/locales';

const numberFormats = new Map<Locale, Intl.NumberFormat>();
const compactFormats = new Map<Locale, Intl.NumberFormat>();

export function num(locale: Locale, n: number): string {
  if (!numberFormats.has(locale)) numberFormats.set(locale, new Intl.NumberFormat(LOCALE_META[locale].intl));
  return numberFormats.get(locale)!.format(n);
}

export function compact(locale: Locale, n: number): string {
  if (!compactFormats.has(locale))
    compactFormats.set(
      locale,
      new Intl.NumberFormat(LOCALE_META[locale].intl, { notation: 'compact', maximumFractionDigits: 1 }),
    );
  return compactFormats.get(locale)!.format(n);
}

export function date(locale: Locale, iso: string, style: 'long' | 'short' | 'month' = 'long'): string {
  const opts: Intl.DateTimeFormatOptions =
    style === 'month'
      ? { year: 'numeric', month: 'long' }
      : style === 'short'
        ? { year: 'numeric', month: 'short', day: 'numeric' }
        : { year: 'numeric', month: 'long', day: 'numeric' };
  return new Intl.DateTimeFormat(LOCALE_META[locale].intl, { ...opts, timeZone: 'Asia/Tehran' }).format(new Date(iso));
}

export function year(locale: Locale, y: number): string {
  // Persian readers expect the solar hijri year for recent dates.
  if (locale === 'fa') return date('fa', new Date(Date.UTC(y, 6, 1)).toISOString()).split(' ').pop()!;
  return num(locale, y).replace(/[,.\s]/g, '');
}

/** "2016–2017" in the reader's calendar and digits (۱۳۹۵–۱۳۹۶ for Persian). */
export function yearRange(locale: Locale, [from, to]: [number, number?]): string {
  return to && to !== from ? `${year(locale, from)}–${year(locale, to)}` : year(locale, from);
}

/** ASCII digits inside a string in the reader's digits (۲۱ on the Persian site). */
export function digits(locale: Locale, s: string): string {
  return s.replace(/\d/g, (d) => plain(locale, Number(d)));
}

export function duration(seconds?: number): string | undefined {
  if (!seconds) return undefined;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/** Localised digits without grouping, for identifiers like post numbers. */
export function plain(locale: Locale, n: number): string {
  return new Intl.NumberFormat(LOCALE_META[locale].intl, { useGrouping: false }).format(n);
}
