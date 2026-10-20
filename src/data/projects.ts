// Related organisations and projects, linked from the footer, the About page
// and the structured data. Descriptions follow each site's own wording.
import type { Localized } from './writings';

export interface Project {
  id: string;
  url: string;
  /** A second address worth linking (e.g. the app itself) */
  appUrl?: string;
  name: Localized;
  description: Localized;
}

export const FOUNDATION: Project = {
  id: 'imam-ali-foundation',
  url: 'https://imamali.ro',
  name: {
    fa: 'بنیاد امام علی (ع) بخارست',
    en: 'Imam Ali Foundation, Bucharest',
    ro: 'Fundația Imam Ali, București',
    ar: 'مؤسسة الإمام علي (ع) في بوخارست',
    ur: 'امام علی (ع) فاؤنڈیشن، بخارسٹ',
  },
  description: {
    fa: 'مرکز اسلامی در بخارست، رومانی: خدمات دینی، کتابخانه، قرآن و اوقات نماز در شهرهای رومانی.',
    en: 'An Islamic centre in Bucharest, Romania: religious services, a library, the Quran, and prayer times for Romanian cities.',
    ro: 'Centru islamic din București: servicii religioase, bibliotecă, Coranul și timpurile de rugăciune pentru orașele din România.',
    ar: 'مركز إسلامي في بوخارست، رومانيا: خدمات دينية ومكتبة والقرآن ومواقيت الصلاة في المدن الرومانية.',
    ur: 'بخارسٹ، رومانیہ میں ایک اسلامی مرکز: دینی خدمات، کتب خانہ، قرآن اور رومانیہ کے شہروں کے اوقاتِ نماز۔',
  },
};

export const PROJECTS: Project[] = [
  FOUNDATION,
  {
    id: 'alif',
    url: 'https://alif.ro',
    appUrl: 'https://app.alif.ro',
    name: { fa: 'الف', en: 'Alif', ro: 'Alif', ar: 'ألف', ur: 'الف' },
    description: {
      fa: 'سامانهٔ رایگان و تعاملی آموزش روخوانی قرآن از صفر: ۱۸ درس با صدا و ویدئو برای هر حرف و قاعدهٔ تجوید.',
      en: 'A free, interactive system for learning to read the Quran from zero: 18 lessons with audio and video for every letter and Tajweed rule.',
      ro: 'Sistem gratuit și interactiv pentru a învăța să citești Coranul de la zero: 18 lecții cu audio și video pentru fiecare literă și regulă de Tajwid.',
      ar: 'نظام مجاني وتفاعلي لتعلّم قراءة القرآن من الصفر: 18 درسًا بالصوت والصورة لكل حرف وقاعدة تجويد.',
      ur: 'قرآن پڑھنا صفر سے سیکھنے کا مفت اور تعاملی نظام: ہر حرف اور تجوید کے قاعدے کے لیے آڈیو اور ویڈیو کے ساتھ 18 اسباق۔',
    },
  },
  {
    id: 'muin',
    url: 'https://muin.imamali.ro',
    name: { fa: 'معین', en: 'Muin', ro: 'Muin', ar: 'معين', ur: 'معین' },
    description: {
      fa: 'دستیار هوشمند پاسخ به پرسش‌های اسلامی، به پنج زبان.',
      en: 'An AI assistant that answers questions about Islam, in five languages.',
      ro: 'Un asistent inteligent care răspunde la întrebări despre islam, în cinci limbi.',
      ar: 'مساعد ذكي يجيب عن الأسئلة الإسلامية بخمس لغات.',
      ur: 'اسلامی سوالات کے جواب دینے والا ذہین معاون، پانچ زبانوں میں۔',
    },
  },
];
