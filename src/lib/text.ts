// Small text helpers shared by the fetch scripts and the pages.

const URDU_ONLY = /[ٹڈڑںہۃے]/;
const PERSIAN_ONLY = /[پچژگکی]/;
const ARABIC_SCRIPT = /[؀-ۿ]/;
const ROMANIAN = /[ăâîșțşţĂÂÎȘȚ]|\b(și|este|care|pentru|despre|religia|islamul)\b/i;

/** Rough content-language guess, good enough for a badge and `lang` attribute. */
export function guessLang(text: string): string | undefined {
  const t = text.slice(0, 600);
  if (ARABIC_SCRIPT.test(t)) return URDU_ONLY.test(t) ? 'ur' : PERSIAN_ONLY.test(t) ? 'fa' : 'ar';
  if (ROMANIAN.test(t)) return 'ro';
  if (/[a-z]/i.test(t)) return 'en';
  return undefined;
}

/** Convert Persian/Arabic-Indic digits to ASCII. */
export function toAsciiDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

export function excerpt(text: string, max = 220): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const at = cut.lastIndexOf(' ');
  return (at > max * 0.6 ? cut.slice(0, at) : cut) + '…';
}

/** First non-empty line, used as a title for posts that have none. */
export function firstLine(text: string, max = 120): string {
  const line = text.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  return excerpt(line, max);
}
