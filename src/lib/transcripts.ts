// Spoken text of videos, written by scripts/fetch/transcripts.ts (YouTube)
// and scripts/fetch/tiktok.ts (TikTok) to src/data/transcripts/<source>/<id>.json.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Transcript {
  lang: string;
  /** From automatic captions rather than uploaded subtitles */
  auto: boolean;
  text: string;
}

function load(source: string): Map<string, Transcript> {
  const dir = join(process.cwd(), 'src/data/transcripts', source);
  if (!existsSync(dir)) return new Map();
  return new Map(
    readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => [f.slice(0, -5), JSON.parse(readFileSync(join(dir, f), 'utf8')) as Transcript]),
  );
}

const YOUTUBE = load('youtube');
export const transcriptOf = (videoId: string) => YOUTUBE.get(videoId);

/**
 * Paragraphs for reading: by sentences when the text has punctuation, else
 * (automatic captions) by about 70 words.
 */
export function paragraphs(text: string): string[] {
  const sentences = text.match(/[^.!?؟۔]+[.!?؟۔]+["»”)]?\s*/g);
  if (sentences && sentences.join('').length > text.length * 0.8) {
    const out: string[] = [];
    for (let i = 0; i < sentences.length; i += 4) out.push(sentences.slice(i, i + 4).join('').trim());
    return out;
  }
  const words = text.split(/\s+/);
  const out: string[] = [];
  for (let i = 0; i < words.length; i += 70) out.push(words.slice(i, i + 70).join(' '));
  return out;
}

/** "00:00 Introduction" lines in a YouTube description → chapters. */
export function chaptersOf(description = ''): { at: number; label: string }[] {
  const out: { at: number; label: string }[] = [];
  for (const line of description.split('\n')) {
    const m = line.match(/^\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s*[-–:)]?\s*(.+)$/);
    if (m) out.push({ at: Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]), label: m[4].trim() });
  }
  return out.length >= 2 && out[0].at === 0 ? out : [];
}
