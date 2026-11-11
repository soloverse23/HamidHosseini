/**
 * Translation notes → src/data/quran/glossary.json (the Quranic glossary).
 *
 *   npx tsx scripts/quran/glossary.ts             # rebuild, print a summary
 *   npx tsx scripts/quran/glossary.ts --report f  # also write every decision to f (TSV)
 *
 * 1. Headwords. Each note is split into sentences. A quoted Arabic word is a
 *    headword when the sentence explains it: «X» به‌معنی/به‌معنای/یعنی/معادل/
 *    جمع «…»/نقطهٔ مقابل, «X» در اصل/در لغت, «X» از مادهٔ «R», مادهٔ «R»,
 *    معنای/واژهٔ «X», «X» می‌گویند/گفته می‌شود. A quote after به‌معنی is the
 *    meaning, not a headword, and is never taken.
 * 2. Roots, most trusted first: overrides.csv → a root the note names
 *    («X» از مادهٔ «R», مادهٔ «R») → the same word in the verse, in the
 *    Quranic Arabic Corpus morphology → the same word anywhere in the Quran,
 *    when the corpus agrees on one root → a word of the verse whose root
 *    letters run through X in order (masdars like «افاضه» for أَفِيضُوا).
 *    Anything else is reported and left out: no guessing.
 * 3. Pointers. A sentence that sends the reader to another verse ("… در
 *    ترجمهٔ آیهٔ ۲۶ سورهٔ بقره بیان شد") is a further use, not a definition;
 *    its word takes the root it was given at that verse.
 * 4. Roots use the corpus spelling (ي، ك، أ for hamza, doubled roots in full:
 *    مسس، ظلل), so variant spellings in the notes land on one entry.
 *
 * Runs before every build and after each content sync; it reads only local
 * files and takes well under a second.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { norm, rootSlugOf, skel } from '../../src/lib/arabic';
import { findRefs } from '../../src/lib/quran-refs';

const ROOT = resolve(import.meta.dirname, '../..');
const MORPHOLOGY = join(ROOT, 'vendor/quran-morphology/quran-morphology.txt');
const OVERRIDES = join(ROOT, 'src/data/quran/glossary-overrides.csv');
const OUT = join(ROOT, 'src/data/quran/glossary.json');
const REDIRECTS = join(ROOT, 'src/data/quran/glossary-redirects.json');

interface Verse {
  text: string;
  notes?: string[];
}
const fa: { surahs: Record<string, Record<string, Verse>> } = JSON.parse(readFileSync(join(ROOT, 'src/data/quran/fa.json'), 'utf8'));

/* ---------- Corpus ---------- */

interface Word {
  /** Whole word, prefixes included */
  full: string;
  /** Without prefixes (و، ف، ب، ل، ال …) */
  bare: string;
  /** The segment that carries the root */
  stem: string;
  lemma: string;
  root?: string;
  /** Particles, pronouns, demonstratives, relatives: never a headword */
  particle?: boolean;
}

const verseWords = new Map<string, Word[]>();
const rootCount = new Map<string, number>();
const rootLemmas = new Map<string, Map<string, number>>();
const rootVerses = new Map<string, Set<string>>();
/** norm(form or lemma) → root → occurrences, for words not in the verse at hand */
const formIndex = new Map<string, Map<string, number>>();
const skelIndex = new Map<string, Map<string, number>>();

{
  let cur: (Word & { key: string }) | undefined;
  const flush = () => {
    if (!cur) return;
    const vk = cur.key.split(':').slice(0, 2).join(':');
    (verseWords.get(vk) ?? verseWords.set(vk, []).get(vk)!).push(cur);
    if (cur.root) {
      const r = cur.root;
      rootCount.set(r, (rootCount.get(r) ?? 0) + 1);
      const lem = rootLemmas.get(r) ?? rootLemmas.set(r, new Map()).get(r)!;
      lem.set(cur.lemma, (lem.get(cur.lemma) ?? 0) + 1);
      (rootVerses.get(r) ?? rootVerses.set(r, new Set()).get(r)!).add(vk);
      for (const f of new Set([cur.bare, cur.stem, cur.lemma, stripAl(cur.bare)])) {
        bump(formIndex, norm(f), r);
        bump(skelIndex, skel(f), r);
      }
    }
    cur = undefined;
  };
  for (const line of readFileSync(MORPHOLOGY, 'utf8').split('\n')) {
    if (!line) continue;
    const [loc, form, pos, tags] = line.split('\t');
    const key = loc.split(':').slice(0, 3).join(':');
    if (cur?.key !== key) {
      flush();
      cur = { key, full: '', bare: '', stem: '', lemma: '', particle: true };
    }
    const tag = tags.split('|');
    const root = tag.find((t) => t.startsWith('ROOT:'))?.slice(5);
    const lemma = tag.find((t) => t.startsWith('LEM:'))?.slice(4);
    cur.full += form;
    if (!tag.includes('PREF')) {
      cur.bare += form;
      if (!tag.includes('SUFF') && pos !== 'P' && !/^(PRON|DEM|REL)$/.test(tag[0])) cur.particle = false;
    }
    if (root) {
      cur.root = root;
      cur.stem = form;
      cur.lemma = lemma ?? form;
    }
  }
  flush();
}

function bump(index: Map<string, Map<string, number>>, key: string, root: string) {
  if (key.length < 2) return;
  const m = index.get(key) ?? index.set(key, new Map()).get(key)!;
  m.set(root, (m.get(root) ?? 0) + 1);
}
function stripAl(s: string) {
  return s.replace(/^[ٱا]ل/, '');
}

const ROOTS = new Set(rootCount.keys());

/* ---------- Root spelling ---------- */

/** A root as a note writes it («ملي»، «وفی»، «مس») → the corpus root, if any. */
function corpusRoot(written: string): string | undefined {
  const base = written
    .replace(/[ً-ٰٟـ‌]/g, '')
    .replace(/[ىی]/g, 'ي')
    .replace(/ک/g, 'ك')
    .trim();
  if (base.length < 2 || base.length > 5) return undefined;
  const options = new Set<string>();
  const add = (s: string) => {
    options.add(s);
    if (s.length === 2) options.add(s + s[1]);
    if (/[يىا]$/.test(s)) options.add(s.slice(0, -1) + 'و').add(s.slice(0, -1) + 'ي');
    if (/و$/.test(s)) options.add(s.slice(0, -1) + 'ي');
  };
  add(base);
  add(base.replace(/[ءئؤإآا]/g, 'أ'));
  add(base.replace(/^ا/, 'أ'));
  return [...options].find((o) => ROOTS.has(o));
}

/* ---------- Word → root ---------- */

const PREFIXES = /^(?:[وف])?(?:[بلك]|ال|لل)?/;

function variants(word: string): Set<string> {
  const out = new Set<string>();
  const w = norm(word);
  out.add(w);
  const bare = w.replace(PREFIXES, '');
  if (bare.length >= 2) out.add(bare);
  for (const x of [...out]) if (x.startsWith('ال') && x.length > 3) out.add(x.slice(2));
  return out;
}

function wordForms(w: Word) {
  return new Set([w.full, w.bare, w.stem, w.lemma, stripAl(w.bare)].map(norm));
}

type How = 'override' | 'named' | 'verse' | 'quran' | 'letters';
interface Resolved {
  root: string;
  how: How;
  lemma?: string;
}

/** The word as it stands in verse `vk`, matched exactly, then without alifs. */
function inVerse(word: string, vk: string): Resolved | undefined {
  const words = (verseWords.get(vk) ?? []).filter((w) => w.root);
  const vs = variants(word);
  const hit = words.find((w) => [...wordForms(w)].some((f) => vs.has(f)));
  if (hit) return { root: hit.root!, how: 'verse', lemma: hit.lemma };
  const ss = new Set([...vs].map((v) => v.replace(/ا/g, '')));
  const loose = words.find((w) => [...wordForms(w)].some((f) => ss.has(f.replace(/ا/g, ''))));
  if (loose) return { root: loose.root!, how: 'verse', lemma: loose.lemma };
  return undefined;
}

/** The word anywhere in the Quran: taken only when one root has ≥ 80% of the occurrences. */
function inQuran(word: string): Resolved | undefined {
  for (const [index, key] of [
    [formIndex, norm],
    [skelIndex, skel],
  ] as const) {
    const counts = new Map<string, number>();
    for (const v of variants(word)) for (const [r, c] of index.get(key(v)) ?? []) counts.set(r, (counts.get(r) ?? 0) + c);
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const [best] = [...counts].sort((a, b) => b[1] - a[1]);
    if (best && best[1] / total >= 0.8) return { root: best[0], how: 'quran' };
    if (best) {
      ambiguous = true; // found under several roots: don't fall through to looser matching
      return undefined;
    }
  }
  return undefined;
}

const WEAK = /[اأإآءؤئوي]/g;
/** Verse roots whose letters run through the quoted word in order; the
 *  fullest fit wins (نسخ over نسي for «نسخ»), a tie is left unresolved. */
function byLetters(word: string, vk: string): Resolved | undefined {
  const w = norm(word);
  const fits = new Map<string, { score: number; lemma: string }>();
  for (const vw of verseWords.get(vk) ?? []) {
    if (!vw.root) continue;
    const letters = vw.root.replace(/[أإآءؤئ]/g, '').replace(/(.)\1/g, '$1');
    const strong = letters.replace(WEAK, '');
    if (strong.length < 2) continue;
    let at = 0;
    let extra = '';
    for (const ch of w) {
      if (ch === strong[at]) at++;
      else extra += ch;
    }
    if (at < strong.length) continue;
    // Derived forms add only the augment letters (سألتمونیها) to a root: «عقل» is not قول.
    if (/[^سالتمونيهوك]/.test(extra.replace(new RegExp(`[${letters}]`, 'g'), ''))) continue;
    // Weak letters of the root that also appear in the word strengthen the fit.
    let all = 0;
    for (const ch of w) if (ch === letters[all]) all++;
    fits.set(vw.root, { score: strong.length * 2 + all, lemma: vw.lemma });
  }
  const ranked = [...fits].sort((a, b) => b[1].score - a[1].score);
  if (!ranked.length) return undefined;
  if (ranked[1] && ranked[1][1].score === ranked[0][1].score) {
    ambiguous = true;
    return undefined;
  }
  return { root: ranked[0][0], how: 'letters', lemma: ranked[0][1].lemma };
}

/** The quoted word is itself a root («ودد»، «ذرر») that occurs in the verse. */
function asRoot(word: string, s: number, a: number): Resolved | undefined {
  const r = corpusRoot(word);
  if (!r) return undefined;
  const near = [a, a - 1, a + 1].some((x) => rootVerses.get(r)?.has(`${s}:${x}`));
  return near ? { root: r, how: 'named' } : undefined;
}

/** Set when a word matched more than one root: worth an override, unlike a Persian word. */
let ambiguous = false;

/* ---------- Overrides ---------- */

/** surah,ayah,word,root — "*" for any surah/verse; root "-" drops the word. */
const overrides = new Map<string, string>();
try {
  for (const line of readFileSync(OVERRIDES, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#') || line.startsWith('surah,')) continue;
    const [s, a, word, root] = line.split(',').map((x) => x.trim());
    overrides.set(`${s}:${a}:${norm(word)}`, root === '-' ? '-' : corpusRoot(root) ?? root);
  }
} catch {
  /* no overrides yet */
}
const override = (s: number, a: number, word: string) =>
  overrides.get(`${s}:${a}:${norm(word)}`) ?? overrides.get(`${s}:*:${norm(word)}`) ?? overrides.get(`*:*:${norm(word)}`);

/* ---------- Notes → headwords ---------- */

const Q = '«([^«»]{1,40})»';
const MADDE = '(?:ماده|ریشه)(?:ٔ|ی|‌ی|ه)?';
const MEANS = '(?:به[‌ ]?معن(?:ی|ای)|معادل(?=\\s)|نقطهٔ مقابل|جمع\\s*«)';

/** A named root: «X» … از مادهٔ «R» — X is the nearest quote before it */
const FROM_RE = new RegExp(`از\\s+${MADDE}\\s*${Q}`, 'gd');
/** The root itself: مادهٔ «R» */
const MADDE_RE = new RegExp(`${MADDE}\\s*${Q}`, 'gd');
const ORIGIN_RE = new RegExp(`${Q}\\s*(?:در اصل|در لغت|اصلاً|از نظر لغوی)`, 'gd');
/** «X» (و «Y») … به‌معنی: a few words may come between, never another quote or a new clause */
const MEANS_RE = new RegExp(`${Q}((?:\\s*(?:و|یا|،)\\s*«[^«»]{1,40}»)*)((?:(?!قرار|وقتی|اگر|چون|برای)[^«».؛:]){0,25}?)\\s*${MEANS}`, 'gd');
const YANI_RE = new RegExp(`${Q}\\s*یعنی`, 'gd');
const OF_RE = new RegExp(`(?:معنای|معنی|واژهٔ|کلمهٔ)\\s*${Q}`, 'gd');

/** A quote in this position is a meaning or a named root, never a headword. */
const SLOT = new RegExp(`(?:به[‌ ]?معن(?:ی|ای)|معادل|یعنی|ترجمه(?:ٔ آن)? به|نقطهٔ مقابل|از\\s+(?:واژهٔ|تعبیر|کلمهٔ)|از\\s+${MADDE}|${MADDE}\\s*«[^«»]+»\\s*(?:یا|و))\\s*$`);
const POINTER = /(گذشت|بیان شد|توضیح داده شد|اشاره شد|ذکر شد|ارائه شد|بررسی شد)/;
const PREV_VERSE = /آیه(?:ٔ|ی)?\s+(?:قبل|پیشین)/;
const NEXT_VERSE = /آیه(?:ٔ|ی)?\s+(?:بعد|بعدی)/;

/** Sentences, never split inside a quote. */
function sentences(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    buf += c;
    if (c === '«') depth++;
    else if (c === '»') depth = Math.max(0, depth - 1);
    else if (depth === 0 && (c === '؛' || ((c === '.' || c === '!' || c === '؟') && (i + 1 === text.length || /\s/.test(text[i + 1]))))) {
      out.push(buf);
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf);
  return out;
}

/** One Arabic word: Arabic letters (Persian ی and ک allowed), no ZWNJ, no space. */
const looksArabic = (w: string) => /^[ء-يً-ٰکیٱ]+$/.test(w.trim());

/** Rootless words of the Quran (particles, pronouns): never a headword. */
const PARTICLES = new Set<string>();
{
  const rootless = new Map<string, number>();
  for (const words of verseWords.values()) for (const w of words) if (w.particle) rootless.set(norm(w.bare), (rootless.get(norm(w.bare)) ?? 0) + 1);
  // على is far more often the preposition than عليّ: a form is a particle when it mostly is one.
  for (const [form, c] of rootless) {
    const rooted = [...(formIndex.get(form)?.values() ?? [])].reduce((a, b) => a + b, 0);
    if (c > rooted) PARTICLES.add(form);
  }
}

interface Headword {
  word: string;
  kind: 'core' | 'word';
  named?: string;
}

function headwords(sentence: string): Headword[] {
  const out = new Map<string, Headword>();
  const add = (word: string, at: number, kind: Headword['kind'], named?: string, force = false) => {
    word = word.trim();
    if (!looksArabic(word) || PARTICLES.has(norm(word))) return;
    if (!force && SLOT.test(sentence.slice(0, at - 1))) return;
    const prev = out.get(norm(word));
    out.set(norm(word), { word, kind: prev?.kind === 'core' ? 'core' : kind, named: named ?? prev?.named });
  };
  const at = (m: RegExpMatchArray, g: number) => m.indices![g]![0];
  for (const m of sentence.matchAll(FROM_RE)) {
    const prior = [...sentence.slice(0, m.index).matchAll(/«([^«»]{1,40})»/g)].at(-1);
    if (prior) add(prior[1], prior.index! + 1, 'word', m[1]);
    // "از مادهٔ «R» به‌معنی …": the meaning that follows is the root's own.
    if (/^»?\s*(?:در اصل\s*)?(?:و\s*)?به[\u200c ]?معن/.test(sentence.slice(m.indices![1]![1] + 1))) add(m[1], at(m, 1), 'core', m[1], true);
  }
  for (const m of sentence.matchAll(MADDE_RE)) add(m[1], at(m, 1), 'core', m[1]);
  for (const m of sentence.matchAll(ORIGIN_RE)) add(m[1], at(m, 1), 'core');
  for (const m of sentence.matchAll(MEANS_RE)) {
    add(m[1], at(m, 1), 'word');
    if (m[2]) for (const q of m[2].matchAll(/«([^«»]+)»/g)) add(q[1], at(m, 2) + q.index! + 1, 'word');
  }
  for (const m of sentence.matchAll(YANI_RE)) add(m[1], at(m, 1), 'word');
  for (const m of sentence.matchAll(OF_RE)) add(m[1], at(m, 1), 'word');
  return [...out.values()];
}

/** The words a pointer sentence is about: «X» after معنای/توضیح/مادهٔ/تعبیر,
 *  or right before "در ترجمهٔ …", with any «Y» listed alongside. */
const ABOUT_RE = new RegExp(
  `(?:(?:معنای|معنی|مفهوم|توضیح|توضیحاتی|واژهٔ|تعبیر|کلمهٔ|دربارهٔ|ترجمهٔ)\\s*(?:${MADDE}\\s*)?${Q}|${Q}(?=\\s*(?:و\\s*«[^«»]+»\\s*)*\\[?\\s*در\\s*\\[?\\s*ترجمه))((?:\\s*(?:و|یا|،)\\s*«[^«»]{1,40}»)*)`,
  'g',
);
function quotedWords(sentence: string): string[] {
  const out = new Set<string>(headwords(sentence).map((h) => h.word));
  for (const m of sentence.matchAll(ABOUT_RE)) {
    for (const w of [m[1] ?? m[2], ...[...(m[3] ?? '').matchAll(/«([^«»]+)»/g)].map((q) => q[1])]) {
      if (w && looksArabic(w) && !PARTICLES.has(norm(w))) out.add(w.trim());
    }
  }
  return [...out];
}

interface Item {
  s: number;
  a: number;
  /** Index of the note in the verse's notes */
  i: number;
  /** The words of this root the note explains, as it writes them */
  w: string[];
  k: 'core' | 'word' | 'ref';
  lem?: string;
  /** For a further use: the verse it points to */
  to?: [number, number];
}

const byRoot = new Map<string, Item[]>();
const report: string[][] = [];
const unresolved: string[] = [];
const links: Record<string, Record<string, string>> = {};
/** "s:a" → norm(word) → root, from the definitions; pointers look up their target here */
const defined = new Map<string, Map<string, string>>();
const defRoots = new Map<string, Set<string>>();

function resolveWord(h: { word: string; named?: string }, s: number, a: number): Resolved | '-' | undefined {
  const o = override(s, a, h.word);
  if (o === '-') return '-';
  if (o) return { root: o, how: 'override' };
  if (h.named) {
    const r = corpusRoot(h.named);
    if (r) return { root: r, how: 'named' };
    // A root named in Persian spelling («رحمت»، «قیام»): find it as a word.
    const w = findRoot(h.named, s, a);
    if (w) return { ...w, how: 'named' };
  }
  return (
    findRoot(h.word, s, a) ??
    // A root the corpus lacks because its only word is a name («بکّة» از مادهٔ «بکک»): the note's spelling stands.
    (h.named && /^[ء-ي]{3}$/.test(norm(h.named)) && !/[اةهت]/.test(norm(h.named)) ? { root: norm(h.named), how: 'named' as const } : undefined)
  );
}

function findRoot(word: string, s: number, a: number): Resolved | undefined {
  const vk = `${s}:${a}`;
  ambiguous = false;
  return (
    asRoot(word, s, a) ??
    inVerse(word, vk) ??
    inVerse(word, `${s}:${a - 1}`) ??
    inVerse(word, `${s}:${a + 1}`) ??
    byLetters(word, vk) ??
    inQuran(word)
  );
}

const RANK = { core: 0, word: 1, ref: 2 } as const;
/** One item per note and root: a note that explains «X» and its root «R» is shown once. */
function place(item: Item, root: string) {
  const list = byRoot.get(root) ?? byRoot.set(root, []).get(root)!;
  const same = list.find((x) => x.s === item.s && x.a === item.a && x.i === item.i);
  if (same) {
    for (const w of item.w) if (w && !same.w.some((x) => norm(x) === norm(w))) same.w.push(w);
    if (RANK[item.k] < RANK[same.k]) same.k = item.k;
    same.lem ??= item.lem;
    if (same.k !== 'ref') delete same.to;
  } else list.push(item);
  for (const w of item.w) if (w) (links[`${item.s}:${item.a}:${item.i}`] ??= {})[norm(w)] = rootSlugOf(root);
}

const verses = Object.entries(fa.surahs)
  .flatMap(([s, ayahs]) => Object.entries(ayahs).map(([a, v]) => ({ s: Number(s), a: Number(a), notes: v.notes ?? [] })))
  .sort((x, y) => x.s - y.s || x.a - y.a);

const pointers: { s: number; a: number; i: number; sentence: string; targets: [number, number][] }[] = [];

for (const { s, a, notes } of verses) {
  notes.forEach((note, i) => {
    for (const sentence of sentences(note)) {
      const refs = findRefs(sentence, s).map((m) => [m.ref.surah, m.ref.ayah] as [number, number]);
      if (PREV_VERSE.test(sentence) && a > 1) refs.push([s, a - 1]);
      if (NEXT_VERSE.test(sentence)) refs.push([s, a + 1]);
      if (POINTER.test(sentence) && refs.length) {
        pointers.push({ s, a, i, sentence, targets: refs });
        continue;
      }
      for (const h of headwords(sentence)) {
        const r = resolveWord(h, s, a);
        if (r === '-') {
          report.push([`${s}:${a}`, String(i), h.word, h.kind, '-', 'override']);
          continue;
        }
        if (!r) {
          // Words found under several roots need a decision; the rest are Persian words or not in the Quran.
          if (ambiguous) unresolved.push(`${s}:${a} «${h.word}»`);
          report.push([`${s}:${a}`, String(i), h.word, h.kind, '?', ambiguous ? 'ambiguous' : 'not found']);
          continue;
        }
        place({ s, a, i, w: [h.word], k: h.kind, ...(r.lemma ? { lem: r.lemma } : {}) }, r.root);
        const dk = `${s}:${a}`;
        (defined.get(dk) ?? defined.set(dk, new Map()).get(dk)!).set(norm(h.word), r.root);
        (defRoots.get(dk) ?? defRoots.set(dk, new Set()).get(dk)!).add(r.root);
        report.push([dk, String(i), h.word, h.kind, r.root, r.how]);
      }
    }
  });
}

// Pointers, once every definition is known.
for (const { s, a, i, sentence, targets } of pointers) {
  const words = quotedWords(sentence);
  const named = [...sentence.matchAll(MADDE_RE)].map((m) => corpusRoot(m[1])).filter(Boolean) as string[];
  const placed = new Set<string>();
  for (const word of words) {
    const o = override(s, a, word);
    if (o === '-') continue;
    let root = o;
    for (const [ts, ta] of targets) root ??= defined.get(`${ts}:${ta}`)?.get(norm(word));
    root ??= corpusRoot(word) && named.includes(corpusRoot(word)!) ? corpusRoot(word) : undefined;
    if (!root) {
      for (const [ts, ta] of targets) {
        const r = inVerse(word, `${ts}:${ta}`);
        if (r) {
          root = r.root;
          break;
        }
      }
    }
    if (!root) {
      const r = inVerse(word, `${s}:${a}`) ?? inQuran(word);
      root = r?.root;
    }
    if (!root || !rootCount.has(root)) continue;
    placed.add(root);
    place({ s, a, i, w: [word], k: 'ref', to: targets[0] }, root);
    report.push([`${s}:${a}`, String(i), word, 'ref', root, `→${targets[0].join(':')}`]);
  }
  // "توضیح این ماده در آیهٔ … گذشت": no word quoted, the target verse defines one root.
  if (!words.length) {
    const roots = defRoots.get(targets[0].join(':'));
    if (roots?.size === 1) {
      const [root] = roots;
      place({ s, a, i, w: [], k: 'ref', to: targets[0] }, root);
      report.push([`${s}:${a}`, String(i), '', 'ref', root, `→${targets[0].join(':')}`]);
    }
  }
}

/* ---------- Output ---------- */

const translated = new Set(verses.map((v) => `${v.s}:${v.a}`));
const sortKey = (r: string) => r.replace(/[أإآ]/g, 'ا');
const GLOSS = /^[^.؛]{0,40}?به[‌ ]?معن(?:ی|ای)\s*«([^«»]{2,70})»/;

/** A short meaning for the index: the «…» after به‌معنی in the headword's own sentence. */
function gloss(items: Item[]): string | undefined {
  for (const it of [...items.filter((x) => x.k === 'core'), ...items.filter((x) => x.k === 'word')]) {
    const text = fa.surahs[it.s][it.a].notes![it.i];
    for (const w of it.w) {
      const at = text.indexOf(`«${w}»`);
      const m = at >= 0 ? text.slice(at + w.length + 2).match(GLOSS) : null;
      if (m) return m[1].trim();
    }
  }
  return undefined;
}

const entries = [...byRoot]
  .filter(([, items]) => items.some((x) => x.k !== 'ref'))
  .sort((a, b) => sortKey(a[0]).localeCompare(sortKey(b[0]), 'ar'))
  .map(([root, items]) => {
    items.sort((x, y) => x.s - y.s || x.a - y.a || x.i - y.i);
    const lemmas = [...(rootLemmas.get(root) ?? [])].sort((x, y) => y[1] - x[1]);
    return {
      root,
      slug: rootSlugOf(root),
      gloss: gloss(items),
      /** Occurrences in the Quran */
      count: rootCount.get(root) ?? 0,
      lemmas: lemmas.slice(0, 16),
      lemmaCount: lemmas.length,
      /** Translated verses in which a word of this root occurs */
      verses: [...(rootVerses.get(root) ?? [])].filter((v) => translated.has(v)).join(' '),
      items,
    };
  });

const kept = new Set(entries.map((e) => e.slug));
for (const k of Object.keys(links)) {
  for (const [w, slug] of Object.entries(links[k])) if (!kept.has(slug)) delete links[k][w];
  if (!Object.keys(links[k]).length) delete links[k];
}

// A published root page never just disappears: when a slug goes (a corrected
// root, a merge), it redirects to the entry that now holds most of its notes.
const redirects: Record<string, string> = existsSync(REDIRECTS) ? JSON.parse(readFileSync(REDIRECTS, 'utf8')) : {};
if (existsSync(OUT)) {
  const noteKey = (x: { s: number; a: number; i: number }) => `${x.s}:${x.a}:${x.i}`;
  const holder = new Map<string, string[]>();
  for (const e of entries) for (const it of e.items) (holder.get(noteKey(it)) ?? holder.set(noteKey(it), []).get(noteKey(it))!).push(e.slug);
  const previous: { slug: string; items: Item[] }[] = JSON.parse(readFileSync(OUT, 'utf8')).roots;
  for (const p of previous) {
    if (kept.has(p.slug)) continue;
    const votes = new Map<string, number>();
    for (const it of p.items) for (const slug of holder.get(noteKey(it)) ?? []) votes.set(slug, (votes.get(slug) ?? 0) + 1);
    const [best] = [...votes].sort((a, b) => b[1] - a[1]);
    if (best) redirects[p.slug] = best[0];
  }
}
for (const [from, to] of Object.entries(redirects)) {
  let target = to;
  for (let hops = 0; !kept.has(target) && redirects[target] && hops < 5; hops++) target = redirects[target];
  if (kept.has(from) || !kept.has(target)) delete redirects[from];
  else redirects[from] = target;
}
writeFileSync(REDIRECTS, JSON.stringify(Object.fromEntries(Object.entries(redirects).sort()), null, 1) + '\n');

writeFileSync(OUT, JSON.stringify({ source: 'vendor/quran-morphology', roots: entries, links }) + '\n');

const n = (k: Item['k']) => entries.reduce((t, e) => t + e.items.filter((x) => x.k === k).length, 0);
console.log(
  `glossary: ${entries.length} roots · ${n('core')} root notes · ${n('word')} word notes · ${n('ref')} further uses · ${unresolved.length} unresolved`,
);
if (unresolved.length) console.log(`  unresolved (add to glossary-overrides.csv): ${unresolved.slice(0, 15).join('، ')}${unresolved.length > 15 ? ' …' : ''}`);

const reportAt = process.argv.indexOf('--report');
if (reportAt > 0) {
  writeFileSync(process.argv[reportAt + 1], ['verse\tnote\tword\tkind\troot\thow', ...report.map((r) => r.join('\t'))].join('\n') + '\n');
}
