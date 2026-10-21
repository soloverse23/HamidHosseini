import { LOCALES, type Locale } from '../i18n/locales';

/** Locale-prefixed URL. `path` has no leading slash: href('fa', 'quran/9') → /fa/quran/9/ */
export function href(locale: Locale, path = ''): string {
  const clean = path.replace(/^\/+|\/+$/g, '');
  const [p, hash] = clean.split('#');
  return `/${locale}/${p ? `${p}/` : ''}${hash ? `#${hash}` : ''}`;
}

export const localePaths = () => LOCALES.map((lang) => ({ params: { lang } }));

export const SITE_NAME = 'Hamid Hosseini';
