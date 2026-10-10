export const LOCALES = ['en', 'ro', 'ar', 'fa'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_META: Record<Locale, { label: string; short: string; dir: 'ltr' | 'rtl'; intl: string }> = {
  en: { label: 'English', short: 'EN', dir: 'ltr', intl: 'en-GB' },
  ro: { label: 'Română', short: 'RO', dir: 'ltr', intl: 'ro-RO' },
  ar: { label: 'العربية', short: 'ع', dir: 'rtl', intl: 'ar-u-nu-arab' },
  fa: { label: 'فارسی', short: 'فا', dir: 'rtl', intl: 'fa-IR-u-ca-persian' },
};

export const isLocale = (v: string | undefined): v is Locale => !!v && (LOCALES as readonly string[]).includes(v);
