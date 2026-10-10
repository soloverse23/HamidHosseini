// Articles imported from his blog kalaam.ir (2003–2019) by scripts/fetch/kalaam.ts.
// This file holds what the import can't know: topics, series, and which
// WordPress pages are really the "continue reading" half of a post.
//
// Topics: the blog's own categories are kept (mapped by WP_CATEGORY). About
// half the posts only had the default "بلاگ" category; those are classified
// by hand in TOPICS_BY_ID, which also overrides the blog's choice when set.

import type { Localized } from './writings';

export const CATEGORY_KEYS = [
  'god',
  'reason',
  'ethics',
  'critique',
  'imamate',
  'quran',
  'questions',
  'spirituality',
  'society',
  'digital',
  'dialogues',
  'news',
  'about',
] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];

export const CATEGORIES: Record<CategoryKey, { title: Localized; summary?: Localized }> = {
  god: {
    title: { fa: 'توحید و خداشناسی', en: 'God and divine unity', ro: 'Dumnezeu și unicitatea divină', ar: 'التوحيد ومعرفة الله' },
    summary: {
      fa: 'برهان وجوب و امکان، صفات خدا، هدف آفرینش و پاسخ به پرسش‌های خداباوری.',
      en: 'Arguments for God, the divine attributes, the purpose of creation and questions of belief.',
      ro: 'Argumente pentru existența lui Dumnezeu, atributele divine, scopul creației.',
      ar: 'برهان الوجوب والإمكان، وصفات الله، والغاية من الخلق.',
    },
  },
  reason: {
    title: { fa: 'عقل و ایمان', en: 'Reason and faith', ro: 'Rațiune și credință', ar: 'العقل والإيمان' },
    summary: {
      fa: 'جایگاه عقل در دین، اهمیت باورها و نقد تعبدگرایی.',
      en: 'The place of reason in religion, why beliefs matter, and a critique of blind obedience.',
      ro: 'Locul rațiunii în religie și de ce contează convingerile.',
      ar: 'مكانة العقل في الدين وأهمية العقائد.',
    },
  },
  ethics: {
    title: { fa: 'دین و اخلاق', en: 'Religion and ethics', ro: 'Religie și etică', ar: 'الدين والأخلاق' },
    summary: {
      fa: 'تقدم اخلاق بر ظواهر دینی، معیار رفتار اخلاقی و اخلاق در احادیث.',
      en: 'Why ethics comes before the letter of religious texts, and ethics in the hadith.',
      ro: 'De ce etica are întâietate față de litera textelor religioase.',
      ar: 'تقدّم الأخلاق على ظواهر النصوص الدينية.',
    },
  },
  critique: {
    title: { fa: 'آسیب‌شناسی دین', en: 'Critique of religious practice', ro: 'Critica practicii religioase', ar: 'نقد التديّن' },
    summary: {
      fa: 'نقد خرافه، افراط، تعصب و برداشت‌های سطحی از دین.',
      en: 'Against superstition, excess, fanaticism and shallow readings of religion.',
      ro: 'Împotriva superstiției, excesului și fanatismului.',
      ar: 'نقد الخرافة والغلو والتعصب.',
    },
  },
  imamate: {
    title: { fa: 'پیامبر و اهل بیت', en: 'The Prophet and his household', ro: 'Profetul și familia sa', ar: 'النبي وأهل البيت' },
    summary: {
      fa: 'امامت در قرآن، سیرهٔ پیشوایان، مهدویت و گفتگوی شیعه و سنی.',
      en: 'The Imamate in the Quran, the lives of the Imams, the Mahdi, and Shia–Sunni dialogue.',
      ro: 'Imamatul în Coran, viața imamilor, Mahdi și dialogul șiit–sunnit.',
      ar: 'الإمامة في القرآن وسيرة الأئمة والمهدوية والحوار الشيعي السني.',
    },
  },
  quran: {
    title: { fa: 'قرآن', en: 'The Quran', ro: 'Coranul', ar: 'القرآن' },
    summary: {
      fa: 'تفسیر آیات، مصونیت قرآن از تحریف و گزیده‌هایی از آیات.',
      en: 'Commentary on verses, the preservation of the text, and selected verses.',
      ro: 'Comentarii la versete și păstrarea textului.',
      ar: 'تفسير الآيات وصيانة القرآن من التحريف.',
    },
  },
  questions: {
    title: { fa: 'پرسش‌ها و شبهات', en: 'Questions and objections', ro: 'Întrebări și obiecții', ar: 'أسئلة وشبهات' },
    summary: {
      fa: 'پاسخ به پرسش‌ها و شبهه‌های رایج دربارهٔ دین.',
      en: 'Answers to common questions and objections about religion.',
      ro: 'Răspunsuri la întrebări și obiecții frecvente despre religie.',
      ar: 'إجابات عن الأسئلة والشبهات الشائعة حول الدين.',
    },
  },
  spirituality: {
    title: { fa: 'معنویت', en: 'Spirituality', ro: 'Spiritualitate', ar: 'الروحانية' },
    summary: {
      fa: 'نماز، توکل، احساس حضور خدا و زندگی معنوی.',
      en: 'Prayer, trust in God and the inner life.',
      ro: 'Rugăciune, încredere în Dumnezeu și viața interioară.',
      ar: 'الصلاة والتوكل والحياة الروحية.',
    },
  },
  society: {
    title: { fa: 'جامعه و سیاست', en: 'Society and politics', ro: 'Societate și politică', ar: 'المجتمع والسياسة' },
    summary: {
      fa: 'عدالت، حکومت، آزادی، انتخابات و فرهنگ عمومی.',
      en: 'Justice, government, freedom, elections and public culture.',
      ro: 'Dreptate, guvernare, libertate și cultură publică.',
      ar: 'العدالة والحكم والحرية والثقافة العامة.',
    },
  },
  digital: {
    title: { fa: 'فضای مجازی', en: 'Religion online', ro: 'Religia în mediul online', ar: 'الفضاء الافتراضي' },
    summary: {
      fa: 'تبلیغ دین در اینترنت، جشنواره‌ها و آموزش الکترونیکی.',
      en: 'Religious outreach on the internet, online festivals and e-learning.',
      ro: 'Religia pe internet, festivaluri online și învățare la distanță.',
      ar: 'الدعوة الدينية على الإنترنت والتعليم الإلكتروني.',
    },
  },
  dialogues: {
    title: { fa: 'گفتگوها', en: 'Dialogues', ro: 'Dialoguri', ar: 'حوارات' },
    summary: {
      fa: 'متن گفتگوهای اعتقادی در پیام‌رسان‌ها، شبکه‌های اجتماعی و جلسات خردگاه.',
      en: 'Transcripts of conversations on faith, from messengers, social networks and the Kheradgah sessions.',
      ro: 'Transcrieri ale conversațiilor despre credință.',
      ar: 'نصوص حوارات عقدية في المراسلات والشبكات الاجتماعية وجلسات خردگاه.',
    },
  },
  news: {
    title: { fa: 'اخبار و اطلاعیه‌ها', en: 'News and announcements', ro: 'Știri și anunțuri', ar: 'أخبار وإعلانات' },
  },
  about: {
    title: { fa: 'دربارهٔ نویسنده', en: 'About the author', ro: 'Despre autor', ar: 'عن الكاتب' },
  },
};

/** The blog's own categories. "بلاگ" (the default) carries no meaning and is dropped. */
export const WP_CATEGORY: Record<string, CategoryKey> = {
  'توحید': 'god',
  'عقل': 'reason',
  'دین و اخلاق': 'ethics',
  'آسیب‌شناسی دین': 'critique',
  'اهل بیت': 'imamate',
  'قرآن': 'quran',
  'شبهات': 'questions',
  'معنویت': 'spirituality',
  'عمومی': 'society',
  'فضای مجازی': 'digital',
};

/** Topics for posts the blog left uncategorised (and a few refinements). */
export const TOPICS_BY_ID: Record<number, CategoryKey[]> = {
  2141524168: ['about'],
  2141523665: ['god', 'questions', 'reason'],
  2141523649: ['god', 'questions', 'dialogues'],
  2141523648: ['god', 'reason', 'dialogues'],
  2141523647: ['questions', 'reason', 'dialogues'],
  2141523646: ['spirituality', 'imamate'],
  2141523645: ['questions', 'god'],
  2141523644: ['ethics', 'reason', 'dialogues'],
  2141523642: ['imamate', 'questions', 'dialogues'],
  2141523641: ['god', 'reason', 'dialogues'],
  2141523640: ['imamate', 'dialogues'],
  2141523639: ['ethics', 'dialogues'],
  2141523638: ['questions', 'spirituality', 'dialogues'],
  2141523637: ['news', 'dialogues'],
  2141523633: ['god', 'spirituality'],
  2141523634: ['imamate', 'society'],
  2141523632: ['god', 'questions'],
  2141523631: ['questions', 'ethics'],
  2141523630: ['ethics', 'questions', 'dialogues'],
  2141523629: ['reason', 'ethics'],
  2141523627: ['god', 'reason', 'dialogues'],
  170: ['god', 'reason', 'dialogues'],
  169: ['god', 'reason', 'dialogues'],
  168: ['god', 'reason', 'dialogues'],
  167: ['god', 'reason', 'dialogues'],
  166: ['god', 'reason', 'dialogues'],
  165: ['god', 'reason', 'dialogues'],
  163: ['reason', 'dialogues'],
  162: ['reason', 'dialogues'],
  161: ['reason', 'dialogues'],
  160: ['reason', 'dialogues'],
  2141523626: ['news', 'dialogues'],
  2141523625: ['news', 'dialogues'],
  159: ['god'],
  158: ['god', 'news'],
  2141523624: ['news'],
  2141523623: ['society', 'imamate'],
  2141523622: ['society'],
  2141523621: ['society'],
  2141523620: ['critique', 'reason', 'dialogues'],
  2141523619: ['imamate', 'questions'],
  2141523618: ['questions', 'critique'],
  2141523615: ['imamate', 'society'],
  2141523614: ['imamate'],
  2141523613: ['news'],
  2141523607: ['god', 'questions', 'dialogues'],
  2141523605: ['god', 'quran'],
  2141523602: ['god'],
  2141523600: ['news'],
  2141523597: ['reason'],
  2141523595: ['news'],
  2141523592: ['critique', 'imamate'],
  2141523591: ['critique', 'reason', 'dialogues'],
  2141523590: ['reason'],
  2141523586: ['reason'],
  2141523576: ['digital', 'dialogues'],
  2141523573: ['news', 'digital'],
  2141523570: ['reason', 'questions'],
  2141523568: ['reason', 'questions'],
  2141523566: ['reason'],
  2141523565: ['reason'],
  2141523561: ['god', 'dialogues'],
  2141523559: ['reason', 'god'],
  2141523558: ['imamate', 'spirituality'],
  2141523556: ['god', 'spirituality', 'dialogues'],
  2141523555: ['imamate', 'quran'],
  2141523554: ['imamate', 'quran'],
  2141523498: ['news'],
  2141523553: ['imamate', 'quran'],
  2141523550: ['imamate', 'quran'],
  2141523547: ['imamate', 'quran'],
  2141523542: ['imamate'],
  2141523530: ['quran', 'imamate', 'questions'],
  2141523523: ['quran', 'spirituality'],
  2141523519: ['god', 'questions'],
  2141523518: ['god', 'questions', 'dialogues'],
  2141523488: ['imamate', 'questions'],
  2141523476: ['questions', 'imamate'],
  2141523462: ['god', 'reason'],
  2141523454: ['god', 'reason'],
  2141523455: ['god', 'reason'],
  2141523456: ['imamate', 'ethics'],
  2141523459: ['god', 'reason'],
  2141523460: ['god', 'reason', 'questions'],
  2141523461: ['god', 'reason', 'dialogues'],
  978412020: ['news', 'digital'],
  2141523670: ['imamate', 'critique', 'ethics'],
};

/** Topics added on top of the blog's own categories. */
export const EXTRA_TOPICS: Record<number, CategoryKey[]> = {
  2141523668: ['dialogues'],
  2141523658: ['dialogues'],
  2141523650: ['dialogues'],
  2141524304: ['dialogues'],
  2141523654: ['dialogues'],
  2141523687: ['news'],
  2141523678: ['news'],
  2141523679: ['news'],
  2141523662: ['news'],
};

/**
 * WordPress pages that hold the full text of a post ("continue reading").
 * The page is folded into the post: the post keeps its date, topics and image,
 * and its own paragraphs that the page doesn't repeat come first.
 */
export const MERGE_INTO: Record<number, number> = {
  173: 2141523673,
  172: 2141523649,
  171: 2141523614,
  157: 2141523620,
  155: 2141523602,
  154: 2141523591,
  152: 2141523576,
  150: 2141523561,
  149: 2141523559,
  156: 2141523605,
  144: 2141523556,
  117: 2141523518,
};

/** Better titles where the blog's was a placeholder. */
export const TITLE_FIX: Record<number, string> = {};

export const SERIES_KEYS = ['kheradgah', 'tawhid-saduq', 'imamate', 'beliefs', 'necessary-being'] as const;
export type SeriesKey = (typeof SERIES_KEYS)[number];

/** Multi-part articles, in reading order. */
export const SERIES: Record<SeriesKey, { title: Localized; summary?: Localized; ids: number[] }> = {
  kheradgah: {
    title: { fa: 'خردگاه: گفتگوهای اعتقادی', en: 'Kheradgah: conversations on belief', ro: 'Kheradgah: conversații despre credință', ar: 'خردگاه: حوارات عقدية' },
    summary: {
      fa: 'ده جلسه گفتگوی آن‌لاین با فؤاد سجودی دربارهٔ حقیقت، یقین، علیت و وجود خدا (۱۳۹۱).',
      en: 'Ten online sessions with Fuad Sojoudi on truth, certainty, causality and the existence of God (2012).',
      ro: 'Zece sesiuni online cu Fuad Sojoudi despre adevăr, certitudine, cauzalitate și existența lui Dumnezeu (2012).',
      ar: 'عشر جلسات حوار مع فؤاد سجودي حول الحقيقة واليقين والعلية ووجود الله (2012).',
    },
    ids: [2141523625, 160, 161, 162, 163, 165, 2141523626, 166, 167, 168, 169, 170, 2141523627, 2141523637],
  },
  'tawhid-saduq': {
    title: { fa: 'شرح کتاب توحید صدوق', en: 'Commentary on al-Saduq’s Kitab al-Tawhid', ro: 'Comentariu la Kitab al-Tawhid de al-Saduq', ar: 'شرح كتاب التوحيد للصدوق' },
    summary: {
      fa: 'جلسات هفتگی آن‌لاین با دانشجویان دانشکدهٔ مجازی علوم حدیث و تحقیق‌های آنان.',
      en: 'Weekly online sessions with students of the Virtual Faculty of Hadith Sciences, and their research papers.',
      ro: 'Sesiuni săptămânale online cu studenții Facultății virtuale de științe ale hadithului.',
      ar: 'جلسات أسبوعية مع طلاب كلية علوم الحديث الافتراضية وبحوثهم.',
    },
    ids: [2141523595, 2141523600, 2141523602, 2141523605, 158, 159],
  },
  imamate: {
    title: { fa: 'معنای امامت در قرآن', en: 'The meaning of Imamate in the Quran', ro: 'Sensul imamatului în Coran', ar: 'معنى الإمامة في القرآن' },
    ids: [2141523542, 2141523547, 2141523550, 2141523553, 2141523554, 2141523555],
  },
  beliefs: {
    title: { fa: 'اهمیت مباحث اعتقادی', en: 'Why beliefs matter', ro: 'De ce contează convingerile', ar: 'أهمية المباحث العقدية' },
    ids: [2141523565, 2141523566, 2141523568, 2141523570, 2141523586, 2141523590, 2141523597],
  },
  'necessary-being': {
    title: { fa: 'واجب‌الوجود و توحید', en: 'The Necessary Being and divine unity', ro: 'Ființa necesară și unicitatea divină', ar: 'واجب الوجود والتوحيد' },
    ids: [2141523461, 2141523460, 2141523459, 2141523455, 2141523454, 2141523462],
  },
};
