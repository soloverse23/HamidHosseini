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

/** Emoji and decorative symbols (💢 ❇️ 🔺 ⬅️ …) that Telegram posts use as ornaments and bullets. */
export const DECOR =
  /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{1F170}-\u{1F251}\uFE0E\uFE0F\u20E3\u200D✳❇✴⭕◾◽▪▫►◄●○■□➡⬅⬆⬇]/gu;

/** Text without decorative emoji, keeping line breaks. */
export function cleanDisplay(text: string): string {
  return text
    .replace(DECOR, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** HTML without decorative emoji; only text between tags is touched. */
export function cleanDisplayHtml(html: string): string {
  return html
    .split(/(<[^>]+>)/)
    .map((part) => (part.startsWith('<') ? part : part.replace(DECOR, ' ').replace(/[ \t]{2,}/g, ' ')))
    .join('')
    .replace(/(^|<br \/>)\s+/g, '$1')
    .replace(/\s+(<br \/>|$)/g, '$1');
}

/** A line that says nothing on its own: a handle, hashtags, a link or punctuation. */
const EMPTY_LINE = /^(?:[@#]\S+|https?:\/\/\S+|[^\p{L}\p{N}]+|\s)*$/u;

/** Title for an item that has none: its first line with something to say. */
export function titleLine(text: string, max = 120): string {
  const line = text
    .split('\n')
    .map((l) => l.replace(/^[^\p{L}\p{N}«(@#]+/u, '').replace(/\s*[:：]$/, '').trim())
    .find((l) => l && !EMPTY_LINE.test(l));
  return line ? excerpt(line, max) : '';
}

/** Posts with nothing to read (a bare image, a channel plug): kept on the site, not offered to search engines. */
export function isThin(item: { text: string; media: { title?: string }[] }): boolean {
  return !titleLine(cleanDisplay(item.text)) && !item.media.some((m) => m.title);
}

/** Caption without hashtags and mentions; empty when it was nothing but tags. */
export const withoutTags = (text: string) => cleanDisplay(text.replace(/[#@][\p{L}\p{N}_.]+/gu, ' ')).trim();

/** A short title from running speech (auto captions have no punctuation): the opening words. */
export function speechTitle(text: string, max = 60): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const cut = t.length <= max ? t : t.slice(0, t.lastIndexOf(' ', max) > max * 0.5 ? t.lastIndexOf(' ', max) : max) + '…';
  return cut.charAt(0).toLocaleUpperCase() + cut.slice(1);
}

/** Title of a short clip: its own title, else its caption without hashtags. */
export function clipTitle(item: { title?: string; text: string }, max = 90): string {
  if (item.title && withoutTags(item.title)) return excerpt(item.title, max);
  return titleLine(withoutTags(item.text), max);
}
