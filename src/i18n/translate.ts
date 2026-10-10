// Strings for the in-browser translation popup (src/scripts/translate.ts).
// Kept apart from strings.ts so the client bundle carries only these.
// `lang` is the reader's chosen language, named in that language.
import type { Locale } from './locales';

export const TR_STRINGS: Record<Locale, {
  title: (lang: string) => string;
  ask: string;
  isOn: string;
  privacy: string;
  translate: string;
  notNow: string;
  showOriginal: string;
  keep: string;
  working: (done: string, total: string) => string;
  on: string;
  off: string;
  failed: string;
  retry: string;
  options: string;
  close: string;
}> = {
  en: {
    title: (lang) => `Some of the original writing on this page isn't in your chosen language, ${lang}.`,
    ask: 'Would you like me to translate it?',
    isOn: 'It is being shown translated.',
    privacy: 'Translation is by Google Translate: the text is sent to Google, and machine translation can be wrong, especially on religious terms. The Quran and its translation are never machine-translated.',
    translate: 'Translate',
    notNow: 'No, thanks',
    showOriginal: 'Show original',
    keep: 'Keep translation',
    working: (d, t) => `Translating ${d}/${t}`,
    on: 'Translated',
    off: 'Translate',
    failed: 'Translation failed. Check your connection and try again.',
    retry: 'Try again',
    options: 'Translation options',
    close: 'Close',
  },
  ro: {
    title: (lang) => `O parte din textele originale de pe această pagină nu sunt în limba aleasă de tine, ${lang}.`,
    ask: 'Vrei să le traduc?',
    isOn: 'Acum sunt afișate traduse.',
    privacy: 'Traducerea este făcută de Google Translate: textul este trimis la Google, iar traducerea automată poate greși, mai ales la termenii religioși. Coranul și traducerea lui nu sunt niciodată traduse automat.',
    translate: 'Tradu',
    notNow: 'Nu, mulțumesc',
    showOriginal: 'Arată originalul',
    keep: 'Păstrează traducerea',
    working: (d, t) => `Se traduce ${d}/${t}`,
    on: 'Tradus',
    off: 'Tradu',
    failed: 'Traducerea a eșuat. Verifică conexiunea și încearcă din nou.',
    retry: 'Încearcă din nou',
    options: 'Opțiuni de traducere',
    close: 'Închide',
  },
  ar: {
    title: (lang) => `بعض النصوص الأصلية في هذه الصفحة ليست مكتوبة بلغتك المختارة: ${lang}.`,
    ask: 'هل تريد أن أترجمها لك؟',
    isOn: 'وهي معروضة الآن مترجمةً.',
    privacy: 'تتم الترجمة عبر ترجمة Google: يُرسَل النص إلى Google، وقد تخطئ الترجمة الآلية، ولا سيما في المصطلحات الدينية. لا يُترجَم القرآن وترجمته آليًا أبدًا.',
    translate: 'ترجم',
    notNow: 'لا، شكرًا',
    showOriginal: 'عرض الأصل',
    keep: 'إبقاء الترجمة',
    working: (d, t) => `جارٍ الترجمة ${d}/${t}`,
    on: 'مترجَم',
    off: 'ترجمة',
    failed: 'تعذّرت الترجمة. تحقّق من الاتصال وأعد المحاولة.',
    retry: 'أعد المحاولة',
    options: 'خيارات الترجمة',
    close: 'إغلاق',
  },
  fa: {
    title: (lang) => `بعضی از نوشته‌های اصلی این صفحه به زبان انتخابی شما، ${lang}، نوشته نشده‌اند.`,
    ask: 'می‌خواهید ترجمه‌شان کنم؟',
    isOn: 'الان ترجمه‌شده نمایش داده می‌شوند.',
    privacy: 'ترجمه با مترجم گوگل انجام می‌شود: متن برای گوگل فرستاده می‌شود و ترجمهٔ ماشینی ممکن است خطا داشته باشد، به‌ویژه در اصطلاحات دینی. قرآن و ترجمهٔ آن هرگز ماشینی ترجمه نمی‌شوند.',
    translate: 'ترجمه کن',
    notNow: 'نه، ممنون',
    showOriginal: 'نمایش متن اصلی',
    keep: 'ترجمه بماند',
    working: (d, t) => `در حال ترجمه ${d}/${t}`,
    on: 'ترجمه‌شده',
    off: 'ترجمه',
    failed: 'ترجمه انجام نشد. اتصال اینترنت را بررسی کنید و دوباره امتحان کنید.',
    retry: 'دوباره امتحان کن',
    options: 'تنظیمات ترجمه',
    close: 'بستن',
  },
  ur: {
    title: (lang) => `اس صفحے کی کچھ اصل تحریریں آپ کی منتخب زبان، ${lang}، میں نہیں ہیں۔`,
    ask: 'کیا میں ان کا ترجمہ کر دوں؟',
    isOn: 'اب یہ ترجمہ شدہ دکھائی جا رہی ہیں۔',
    privacy: 'ترجمہ گوگل ٹرانسلیٹ کرتا ہے: متن گوگل کو بھیجا جاتا ہے، اور مشینی ترجمہ غلط ہو سکتا ہے، خاص طور پر دینی اصطلاحات میں۔ قرآن اور اس کے ترجمے کا کبھی مشینی ترجمہ نہیں کیا جاتا۔',
    translate: 'ترجمہ کریں',
    notNow: 'نہیں، شکریہ',
    showOriginal: 'اصل دکھائیں',
    keep: 'ترجمہ رہنے دیں',
    working: (d, t) => `ترجمہ جاری ہے ${d}/${t}`,
    on: 'ترجمہ شدہ',
    off: 'ترجمہ',
    failed: 'ترجمہ نہیں ہو سکا۔ اپنا انٹرنیٹ کنکشن دیکھیں اور دوبارہ کوشش کریں۔',
    retry: 'دوبارہ کوشش کریں',
    options: 'ترجمے کے اختیارات',
    close: 'بند کریں',
  },
};
