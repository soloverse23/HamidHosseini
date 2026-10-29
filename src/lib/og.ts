// Share images for the Quran pages, drawn by scripts/og/quran.ts. The hash in
// the URL changes when a card is redrawn, so social sites fetch it again.
import manifest from '../data/og/quran.json';

const cards = manifest as Record<string, string>;

/** "index", "roots", "2", "2/255" or "roots/<slug>"; undefined until the card is drawn. */
export function quranOg(key: string): string | undefined {
  const hash = cards[key];
  return hash ? `/og/quran/${key.split('/').map(encodeURIComponent).join('/')}.png?v=${hash}` : undefined;
}
