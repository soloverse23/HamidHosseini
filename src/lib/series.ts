import { toAsciiDigits } from './text';

// Recurring series across his channels. Detection is pattern based so new
// posts are tagged automatically by the fetchers.

export type SeriesKey = 'islam-why-how' | 'quran-translation' | 'podcast';

interface SeriesRule {
  key: SeriesKey;
  match: RegExp;
  /** Captures the episode number, if the series is numbered */
  episode?: RegExp;
}

const RULES: SeriesRule[] = [
  {
    key: 'quran-translation',
    match: /ترجم(ه|ة)\s*(ی\s*)?گروهی\s*(ی\s*)?قرآن|#ترجمه_گروهی|#ترجمه_قرآن/,
  },
  {
    key: 'islam-why-how',
    match: /اسلام[،,]?\s*چرا\s*(و\s*)?چگونه|اسلام_چرا_چگونه|islam[,]?\s*de\s*ce\s*(ș|s)i\s*cum|islamdece/i,
    episode:
      /(?:چرا\s*(?:و\s*)?چگونه[؟?]?\s*[#\-–:]?\s*|قسمت\s*|episodul\s*|#\s*)([0-9۰-۹]{1,3})|^\s*([0-9]{1,3})\s*[-–.]/i,
  },
  { key: 'podcast', match: /#پادکست|#podcast/i },
];

export function detectSeries(text: string): { series?: SeriesKey; episode?: number } {
  for (const rule of RULES) {
    if (!rule.match.test(text)) continue;
    let episode: number | undefined;
    const m = rule.episode ? text.match(rule.episode) : null;
    if (m) {
      const n = Number(toAsciiDigits(m[1] ?? m[2] ?? ''));
      if (Number.isFinite(n) && n > 0) episode = n;
    }
    return { series: rule.key, episode };
  }
  return {};
}

/** Episode number from a YouTube/TikTok title like "59- Are moralitatea …" */
export function episodeFromTitle(title: string): number | undefined {
  const m = toAsciiDigits(title).match(/^\s*(\d{1,3})\s*[-–.:)]/);
  return m ? Number(m[1]) : undefined;
}
