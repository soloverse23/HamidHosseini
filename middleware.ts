// Vercel Routing Middleware: send "/" to the visitor's language.
// Order: explicit choice (cookie set by the language switcher) →
// country from the request IP → English.
//
// 302 (not 301): geo negotiation must stay temporary so search engines keep
// each /{lang}/ homepage as its own URL. Deep links are never rewritten —
// crawlers reach every locale through the sitemap and hreflang.

export const config = { matcher: '/' };

const SUPPORTED = ['en', 'ro', 'ar', 'fa', 'ur'] as const;
type Locale = (typeof SUPPORTED)[number];

/** Romania and Moldova (Romanian). */
const RO = new Set(['RO', 'MD']);

/** Iran. */
const FA = new Set(['IR']);

/** Pakistan — primary Urdu-speaking country. */
const UR = new Set(['PK']);

/** Arabic-speaking / Arab League countries. */
const AR = new Set([
  'AE',
  'BH',
  'DZ',
  'DJ',
  'EG',
  'EH',
  'IQ',
  'JO',
  'KM',
  'KW',
  'LB',
  'LY',
  'MA',
  'MR',
  'OM',
  'PS',
  'QA',
  'SA',
  'SD',
  'SO',
  'SY',
  'TD',
  'TN',
  'YE',
]);

function fromCountry(code: string | null): Locale | undefined {
  if (!code || code === 'XX') return undefined;
  const c = code.toUpperCase();
  if (RO.has(c)) return 'ro';
  if (FA.has(c)) return 'fa';
  if (UR.has(c)) return 'ur';
  if (AR.has(c)) return 'ar';
  return 'en';
}

export default function middleware(request: Request) {
  const cookie = request.headers.get('cookie')?.match(/(?:^|;\s*)locale=(\w+)/)?.[1];
  const chosen = (SUPPORTED as readonly string[]).includes(cookie ?? '') ? (cookie as Locale) : undefined;
  // Vercel attaches the visitor country from the edge IP.
  const country = request.headers.get('x-vercel-ip-country');
  const locale = chosen ?? fromCountry(country) ?? 'en';
  const url = new URL(`/${locale}/`, request.url);
  return new Response(null, {
    status: 302,
    headers: {
      location: url.toString(),
      vary: 'cookie, x-vercel-ip-country',
      'cache-control': 'private, no-store',
    },
  });
}
