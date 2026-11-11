// Arabic spelling normalisation shared by the glossary build
// (scripts/quran/glossary.ts) and the pages that link notes to it.
//
// The notes quote Arabic in Persian typing (ی ک ه, no vowels, sometimes a
// shadda); the morphology corpus is Uthmani script with full marks. `norm`
// brings both to one letters-only spelling: no marks, one alif, ي, ك, ه for
// tā' marbūṭa, hamza seats folded, and the dagger alif written out.

const MARKS = /[ؐ-ًؚ-ٟۖ-ۭـ‌‍‏‎]/g;

export function norm(s: string): string {
  return s
    .replace(/ٰ/g, 'ا')
    .replace(MARKS, '')
    .replace(/[ٱأإآ]/g, 'ا')
    .replace(/[ىیئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ک/g, 'ك')
    .replace(/[ةۀ]/g, 'ه')
    .replace(/ء/g, '')
    .replace(/[^ء-ي]/g, '');
}

/** `norm` without alifs: absorbs plene and defective spellings (ذالك/ذلك). */
export const skel = (s: string) => norm(s).replace(/ا/g, '');

/** For the glossary filter: Arabic and Persian text typed either way, no marks. */
export function searchFold(s: string): string {
  return s
    .replace(MARKS, '')
    .replace(/[ٱأإآ]/g, 'ا')
    .replace(/[يىئ]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ةۀ]/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/[ءًٌٍَُِّْٰ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** URL slug of a root: Persian letters, as the glossary has always used. */
export const rootSlugOf = (r: string) => r.replace(/ي/g, 'ی').replace(/ك/g, 'ک');
