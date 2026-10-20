// Books, articles, interviews and lecture series.
//
// Books come from src/data/content/books/ (edited in the CMS). Every field
// except the original-language title is optional; links render as buttons in
// this order: read → ebook → pdf → buy.
//
// Titles in other languages are descriptive glosses for readers who don't
// read the original; the original title is always shown first.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Locale } from '../i18n/locales';

export type Localized = Partial<Record<Locale, string>>;

export interface WorkLink {
  kind: 'read' | 'ebook' | 'pdf' | 'buy' | 'telegram';
  url: string;
  /** e.g. store name for `buy` links */
  label?: string;
}

export interface Work {
  id: string;
  type: 'book' | 'article' | 'interview' | 'dialogue';
  year: number;
  /** Language the work is written in */
  lang: Locale;
  title: Localized;
  /** Journal, magazine or publisher */
  venue?: Localized;
  summary?: Localized;
  cover?: string;
  links: WorkLink[];
}

export interface LectureSeries {
  id: string;
  /** First and last year (Gregorian); shown in the reader's calendar */
  years: [number, number?];
  /** Sessions held, when some have no notes on Telegram yet */
  total?: number;
  lang: Locale;
  title: Localized;
  venue?: Localized;
  summary?: Localized;
  /** Matches the file title of each session's PDF on Telegram */
  match: RegExp;
}

const tg = (id: number): WorkLink => ({ kind: 'telegram', url: `https://t.me/hamidhossaini/${id}` });

/**
 * Books are edited in the CMS (/admin/): one JSON file per book in
 * src/data/content/books/, in the shape of `Work` without `type`. Covers go
 * in public/media/books/, PDFs in public/files/. Newest first.
 */
export const BOOKS: Work[] = (() => {
  const dir = join(process.cwd(), 'src/data/content/books');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ type: 'book' as const, links: [], ...JSON.parse(readFileSync(join(dir, f), 'utf8')) }) as Work)
    .sort((a, b) => b.year - a.year);
})();

export const ARTICLES: Work[] = [
  {
    id: 'freedom-of-religion',
    type: 'article',
    year: 2022,
    lang: 'fa',
    title: {
      fa: 'دین آزادی و آزادی دینی در قرآن',
      en: 'The religion of freedom and religious freedom in the Quran',
      ro: 'Religia libertății și libertatea religioasă în Coran',
      ar: 'دين الحرية والحرية الدينية في القرآن',
    },
    summary: {
      fa: 'مروری بر مبارزهٔ جدی کتاب خدا با اجبار دینی.',
      en: 'How the Quran consistently opposes compulsion in religion.',
      ro: 'Cum se opune Coranul constrângerii în religie.',
      ar: 'مراجعة لمواجهة كتاب الله الجادة للإكراه في الدين.',
    },
    links: [tg(2314)],
  },
  {
    id: 'kheimeh-interview',
    type: 'interview',
    year: 2021,
    lang: 'fa',
    title: {
      fa: 'ترس بیهوده از تفسیر به رأی',
      en: 'The needless fear of “personal interpretation”',
      ro: 'Teama inutilă de „interpretarea personală”',
      ar: 'الخوف غير المبرر من التفسير بالرأي',
    },
    venue: { fa: 'ماهنامهٔ خیمه', en: 'Kheimeh monthly', ro: 'Revista lunară Kheimeh', ar: 'مجلة خيمة الشهرية' },
    summary: {
      fa: 'گفتگو دربارهٔ پاسخ قرآن به نیازهای دوران جدید، تدبر و تفسیر به رأی، و قرائت قرآن برای کسانی که عربی نمی‌دانند.',
      en: 'On how the Quran speaks to modern needs, reflection versus “personal interpretation”, and reading the Quran without Arabic.',
      ro: 'Despre felul în care Coranul răspunde nevoilor de azi, reflecție și „interpretare personală”, și citirea Coranului fără arabă.',
      ar: 'حوار حول استجابة القرآن لحاجات العصر، والتدبر والتفسير بالرأي، وقراءة القرآن لمن لا يعرف العربية.',
    },
    links: [tg(2133)],
  },
  {
    id: 'just-sharia',
    type: 'dialogue',
    year: 2021,
    lang: 'fa',
    title: {
      fa: 'شریعت عادلانه یا عدالت شرعی؟',
      en: 'A just sharia, or a “sharia justice”?',
      ro: 'O sharia dreaptă sau o „dreptate a shariei”?',
      ar: 'شريعة عادلة أم عدالة شرعية؟',
    },
    summary: {
      fa: 'متن گفتگویی انتقادی دربارهٔ تقدم اخلاق بر ظواهر دینی.',
      en: 'A critical exchange on why ethics takes precedence over the literal surface of religious texts.',
      ro: 'Un dialog critic despre întâietatea eticii față de sensul literal al textelor religioase.',
      ar: 'نص حوار نقدي حول تقدّم الأخلاق على ظواهر النصوص الدينية.',
    },
    links: [tg(2021)],
  },
  {
    id: 'seminary-renewal',
    type: 'dialogue',
    year: 2019,
    lang: 'fa',
    title: {
      fa: 'مسئولیت حوزه در به‌روزرسانی دین',
      en: 'The seminary’s responsibility for renewing religious thought',
      ro: 'Responsabilitatea seminarului în înnoirea gândirii religioase',
      ar: 'مسؤولية الحوزة في تجديد الفكر الديني',
    },
    summary: {
      fa: 'نقدهایی بر این یادداشت و پاسخ‌های آن.',
      en: 'Critiques of the essay and his replies.',
      ro: 'Critici la eseu și răspunsurile sale.',
      ar: 'انتقادات للمقالة وردوده عليها.',
    },
    links: [tg(1268)],
  },
  {
    id: 'religion-conscience',
    type: 'dialogue',
    year: 2017,
    lang: 'fa',
    title: {
      fa: 'گفتگو دربارهٔ رابطهٔ دین و وجدان',
      en: 'A dialogue on religion and conscience',
      ro: 'Dialog despre religie și conștiință',
      ar: 'حوار حول الدين والوجدان',
    },
    summary: {
      fa: 'نقد دکتر جواد محدثین و پاسخ‌ها، و متن کامل گفتگو دربارهٔ معنای اسلام در قرآن.',
      en: 'An extended written exchange with Dr Javad Mohaddesin, including the meaning of “islam” in the Quran.',
      ro: 'Un schimb amplu în scris cu dr. Javad Mohaddesin, inclusiv despre sensul cuvântului „islam” în Coran.',
      ar: 'حوار مكتوب مطوّل مع الدكتور جواد محدثين، يشمل معنى «الإسلام» في القرآن.',
    },
    links: [tg(532), tg(691)],
  },
  {
    id: 'moral-virtues',
    type: 'article',
    year: 2016,
    lang: 'fa',
    title: {
      fa: 'نگاهی نو به فضیلت‌های اخلاقی',
      en: 'A new look at the moral virtues',
      ro: 'O nouă privire asupra virtuților morale',
      ar: 'نظرة جديدة إلى الفضائل الأخلاقية',
    },
    venue: { fa: 'مجلهٔ حدیث حوزه', en: 'Hadith-e Hawzeh journal', ro: 'Revista Hadith-e Hawzeh', ar: 'مجلة حديث الحوزة' },
    summary: {
      fa: 'از جمله دربارهٔ «درجات معرفت».',
      en: 'Including a discussion of the degrees of knowledge.',
      ro: 'Inclusiv despre treptele cunoașterii.',
      ar: 'ومنها بحث في «درجات المعرفة».',
    },
    links: [tg(209)],
  },
  {
    id: 'criterion-moral-action',
    type: 'article',
    year: 2016,
    lang: 'fa',
    title: {
      fa: 'معیار فعل اخلاقی در کتاب ایمان و کفر الکافی',
      en: 'The criterion of moral action in the Book of Faith and Disbelief of al-Kafi',
      ro: 'Criteriul faptei morale în Cartea credinței și necredinței din al-Kafi',
      ar: 'معيار الفعل الأخلاقي في كتاب الإيمان والكفر من الكافي',
    },
    venue: { fa: 'مجلهٔ حدیث حوزه', en: 'Hadith-e Hawzeh journal', ro: 'Revista Hadith-e Hawzeh', ar: 'مجلة حديث الحوزة' },
    links: [{ kind: 'read', url: 'http://hadith.riqh.ac.ir/article_5101_844.html' }, tg(96)],
  },
  {
    id: 'priority-of-ethics',
    type: 'article',
    year: 2016,
    lang: 'fa',
    title: {
      fa: 'تقدم اخلاق بر دین',
      en: 'The priority of ethics over religion',
      ro: 'Întâietatea eticii față de religie',
      ar: 'تقدّم الأخلاق على الدين',
    },
    summary: {
      fa: 'پژوهشی در رابطهٔ دین و اخلاق بر پایهٔ تحلیل احادیث اصول کافی؛ همراه با گفتگوهای انتقادی پس از انتشار آن.',
      en: 'A study of the relation between religion and ethics through the hadiths of Usul al-Kafi, followed by the critical exchanges it prompted.',
      ro: 'Un studiu despre relația dintre religie și etică pe baza hadith-urilor din Usul al-Kafi, urmat de dialogurile critice pe care le-a stârnit.',
      ar: 'دراسة في العلاقة بين الدين والأخلاق من خلال أحاديث أصول الكافي، تليها الحوارات النقدية التي أثارتها.',
    },
    links: [tg(37), tg(73), tg(163)],
  },
];

export const LECTURES: LectureSeries[] = [
  {
    id: 'ethics-of-servitude',
    years: [2016, 2017],
    // Sessions 1 and 20 have no notes on Telegram.
    total: 32,
    lang: 'fa',
    title: { fa: 'اخلاق بندگی', en: 'The ethics of servitude', ro: 'Etica slujirii', ar: 'أخلاق العبودية' },
    venue: {
      fa: 'برنامهٔ تلویزیونی آفتاب شرقی',
      en: 'Aftab-e Sharghi, television',
      ro: 'Aftab-e Sharghi, televiziune',
      ar: 'برنامج آفتاب شرقي التلفزيوني',
    },
    match: /^اخلاق بندگی/,
  },
  {
    id: 'knowing-god',
    years: [2016, 2017],
    lang: 'fa',
    title: { fa: 'خداشناسی در قرآن', en: 'Knowing God in the Quran', ro: 'Cunoașterea lui Dumnezeu în Coran', ar: 'معرفة الله في القرآن' },
    venue: { fa: 'تفسیر موضوعی', en: 'Thematic tafsir course', ro: 'Curs de tafsir tematic', ar: 'دورة التفسير الموضوعي' },
    match: /^(خداشناسی|آزمون( بخش اول)? خداشناسی)/,
  },
  {
    id: 'thematic-tafsir',
    years: [2016],
    lang: 'fa',
    title: { fa: 'تفسیر موضوعی قرآن', en: 'Thematic tafsir of the Quran', ro: 'Tafsir tematic al Coranului', ar: 'التفسير الموضوعي للقرآن' },
    match: /^(تفسیر موضوعی|آزمون تفسیر موضوعی|پاسخنامه آزمون تفسیر)/,
  },
];
