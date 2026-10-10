import type { FeedItem } from './feed-types';

// Topic filters for the Notes page, derived from the hashtags he uses.
export const TOPICS = {
  'quran-translation': ['#ترجمه_گروهی_قرآن', '#ترجمه'],
  'islam-why-how': ['#اسلام_چرا_چگونه'],
  tafsir: ['#تفسیر_سوره_عصر', '#تفسیر_موضوعی', '#تفسیر_موضوعی_قرآن', '#قرآن_ویدئو_صفحه', '#نیایش_قرآنی', '#قرآن'],
  hadith: ['#حدیث', '#صحیفه'],
  beliefs: ['#باورها', '#خداشناسی', '#دین_حنیف', '#ایمان_پلید', '#جفری_لنگ'],
  ethics: ['#اخلاق_دین', '#عمل_صالح', '#اخلاق_اجتماعی_در_قرآن', '#زاویه_دید'],
  talks: ['#سخنرانی', '#گفتگو', '#پادکست', '#آفتاب_شرقی', '#کلیپ_آموزشی'],
  reminders: ['#تلنگر'],
} as const;

export type TopicKey = keyof typeof TOPICS;
export const TOPIC_KEYS = Object.keys(TOPICS) as TopicKey[];

export function topicsOf(item: FeedItem): TopicKey[] {
  const tags = new Set(item.tags ?? []);
  const found = TOPIC_KEYS.filter((k) => TOPICS[k].some((t) => tags.has(t)));
  if (item.series === 'quran-translation' && !found.includes('quran-translation')) found.unshift('quran-translation');
  if (item.series === 'islam-why-how' && !found.includes('islam-why-how')) found.unshift('islam-why-how');
  return found;
}
