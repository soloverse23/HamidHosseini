// Vercel Routing Middleware: send "/" to the visitor's language.
// Order: explicit choice (cookie set by the language switcher) →
// Accept-Language → English.

export const config = { matcher: '/' };

const SUPPORTED = ['en', 'ro', 'ar', 'fa'] as const;
type Locale = (typeof SUPPORTED)[number];

function fromAcceptLanguage(header: string | null): Locale | undefined {
  if (!header) return undefined;
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=');
      return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    let base = tag.split('-')[0];
    if (base === 'mo') base = 'ro'; // legacy Moldovan tag
    if (base === 'prs' || base === 'tg') base = 'fa'; // Dari, Tajik
    if ((SUPPORTED as readonly string[]).includes(base)) return base as Locale;
  }
  return undefined;
}

export default function middleware(request: Request) {
  const cookie = request.headers.get('cookie')?.match(/(?:^|;\s*)locale=(\w+)/)?.[1];
  const chosen = (SUPPORTED as readonly string[]).includes(cookie ?? '') ? (cookie as Locale) : undefined;
  const locale = chosen ?? fromAcceptLanguage(request.headers.get('accept-language')) ?? 'en';
  const url = new URL(`/${locale}/`, request.url);
  return new Response(null, {
    status: 302,
    headers: { location: url.toString(), vary: 'accept-language, cookie', 'cache-control': 'private, no-store' },
  });
}
