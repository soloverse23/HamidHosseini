# Seyed Hamid Hosseini: website

A static site (Astro) in English, Romanian, Arabic, Persian and Urdu. It collects his books and writings, his Quran translation, the Telegram channel, the five YouTube channels of “Islam, why and how?” (Persian, Romanian, Arabic, Urdu, English), TikTok and Instagram. A scheduled GitHub Action keeps it up to date.

## How content arrives

| Source | How it's read | Command |
|---|---|---|
| Telegram `@hamidhossaini` | public preview `t.me/s/…` (no bot needed) | `npm run fetch:telegram` (`-- --full` to re-read all) |
| YouTube (fa, ro, ar, ur, en channels) | RSS on every run + `yt-dlp` for the full list | `npm run fetch:youtube` |
| TikTok `@islam.de.ce.si.cum` | `yt-dlp` on the public profile | `npm run fetch:tiktok` |
| Instagram `@kalam_hamidhosseini` | Instagram API with a session cookie (see below) | `npm run fetch:instagram` |
| Quran translation (fa) | the group-translation database (read-only, `QURAN_API_URL`), linked to the "ترجمه گروهی قرآن" Telegram posts | `npx tsx scripts/fetch/quran.ts` |
| Articles from kalaam.ir (his blog, 2003–2019) | WordPress REST API, one-off import (the blog is no longer updated) | `npm run fetch:kalaam` |

`npm run fetch:all` runs everything. Results go to `src/data/feeds/*.json`, and images go to `public/media/` because the platforms' image links expire.

- **Fetchers never delete anything.** If a source fails, the last good data stays on the site.
- **Counts are written at most once a day.** A change in view counts alone doesn't create a commit, so the site isn't redeployed every 30 minutes.
- **The Quran text comes from the translation database.** `src/data/quran/fa.json` holds its translation and notes. The Telegram parse (`fa-telegram.json`) only tells which post proposed each verse. If the database is down, or returns far fewer verses than before, the last copy stays. `npx tsx scripts/quran/diff.ts` lists where the two differ.
- **Quran verses are checked against the Arabic text.** Each verse parsed from a Telegram post is matched against the Tanzil Arabic (`src/data/quran/arabic.json`). A post that quotes another surah can therefore never put a verse in the wrong place.

## Automatic updates

`.github/workflows/sync.yml` runs every 30 minutes. It fetches all sources and commits any changes. Vercel then rebuilds from that commit. If a source fails, the workflow opens a GitHub issue labelled `sync-failure`, or comments on the one already open. To force a full re-read, use **Actions → Sync content → Run workflow → full**.

### Instagram

Instagram stopped serving profiles to anonymous requests in 2025–26, so the fetcher needs the session cookie of a logged-in account:

1. Log in to instagram.com in a browser. A separate account is best; it only needs to follow the profile.
2. Copy the value of the `sessionid` cookie (DevTools → Application → Cookies).
3. In GitHub, open the repository and go to **Settings → Secrets and variables → Actions → New secret**. Name it `IG_SESSIONID` and paste the value.

Until the secret is set, the Instagram page shows the profile link. Individual posts can also be listed by hand in `src/data/instagram-manual.json` (`{"posts": ["https://www.instagram.com/p/…/"]}`). They render as Instagram's own embeds.

## Editing content by hand

The editor at **`/admin/`** (Sveltia CMS) edits the files below without touching code. Sign in with a GitHub personal access token that can write to this repository (fine-grained, *Contents: read and write*). Each save is a commit on `main`, and Vercel redeploys within a minute or two.

- **Corrections to posts, videos and clips:** `src/data/overrides/{posts,videos,clips}/<id>.json`, applied in `src/lib/overrides.ts`. A file can set a title, a summary, topics, corrected text, `pinned` (featured on the Persian home page) or `hidden`. The fetchers never write here, so edits survive every sync and every full re-read.
- **Books:** one file per book in `src/data/content/books/`, in the shape of `Work` (`src/data/writings.ts`). Covers go in `public/media/books/`, PDFs in `public/files/`.
- **Biography:** `src/data/content/about.json`, five languages.
- **Foundation, Alif, Muin:** `src/data/projects.ts`.
- **Articles, lecture series:** `src/data/writings.ts`.
- **Quran translations in other languages:** add `src/data/quran/<lang>.json` in the same shape as `fa.json`, then show it in `src/pages/[lang]/quran/[surah].astro`.
- **Biography, press:** the strings `about.*` in `src/i18n/strings.ts`, one block per language.
- **UI text:** `src/i18n/strings.ts`.
- **Topics on the Notes page:** `src/lib/topics.ts` maps his hashtags to topics.
- **Articles (kalaam.ir):** topics, series and the pages folded into their posts are in `src/data/articles.ts`. The import (`src/data/kalaam.json`) is cleaned HTML; `src/lib/articles.ts` builds what the `/articles/` pages and search use.

## Search engines and backups

- **IndexNow:** after each successful production deploy, `.github/workflows/indexnow.yml` sends the pages changed in the last two days (from the live sitemap) to IndexNow (Bing, Yandex and others). The key file is `public/5af46353cd129a93e179dfbe9543f5e0.txt`. By hand: `npx tsx scripts/indexnow.mts [url …]`.
- **Backups:** `.github/workflows/backup.yml` publishes `src/data`, `public/media` and `public/files` every Monday as a GitHub release (`backup-YYYY-MM-DD`, the last 12 kept). Restore by extracting the archive at the repository root.

## Search

The Astro integration `scripts/search/integration.ts` runs `scripts/search/build-index.ts` after every build. It writes ONE cross-language Pagefind index to `dist/pagefind/`: every Quran verse and surah, every note, video, clip, written work and section page. A reader on any language version therefore finds everything. Text is folded by `src/lib/search/normalize.ts` (vowel marks, Arabic/Persian ی ک, ZWNJ, digits, Latin diacritics). The browser folds queries the same way, so `الرحمن` finds `ٱلرَّحْمَٰنِ`. A word list in `dist/pagefind/vocab/` lets the browser reject unknown words and suggest spellings.

- Quick search: ⌘K / Ctrl+K, `/`, or the button in the header (`src/components/SearchDialog.astro`).
- Results page: `/<lang>/search/?q=&type=&lang=&sort=`.
- Verse jumps: `2:255`, `بقره ۲۵۵`, `Baqarah 255`.
- In `npm run dev` the index is built once at startup (a few seconds) and served at `/pagefind/`. Restart dev to include newly fetched content.

## Develop

```sh
npm install
npm run dev            # http://localhost:4321
npm run build          # static site + search index in dist/
npm run check          # type check (astro check)
npm run check:seo      # after a build: domain, canonicals, hreflang, JSON-LD, links, sitemap
```

`.github/workflows/ci.yml` runs all three on every push and pull request (content-sync commits excepted).

You need `yt-dlp` on your PATH (or at `~/.local/bin/yt-dlp`) for the YouTube and TikTok fetchers.

## Deploy (Vercel)

1. Push this folder to a GitHub repository.
2. In Vercel, import the repository. Its settings are in `vercel.json`.
3. Set the environment variable `SITE_URL` to the final domain, `https://www.hamidhosseini.site` (the same value is the fallback in `src/lib/site.ts`; `hamid-hosseini.vercel.app` redirects there). It's used for canonical links, the sitemap and social previews.
4. Analytics: Vercel Analytics is always on. For Google Analytics 4, set `PUBLIC_GA4_ID` (e.g. `G-XXXXXXX`) in Vercel's environment variables and redeploy. GA4 runs with Consent Mode v2 (`src/components/Analytics.astro`): storage is denied by default in the EEA, the UK and Switzerland until a visitor accepts the banner, and granted elsewhere. Custom events: `search`, `video_play`, `language_switch`; GA4's enhanced measurement adds page views, scrolls and outbound clicks.
5. `middleware.ts` sends `/` to the visitor's language, using a saved choice first, then the browser language, then English.

## Credits

The Arabic Quran text is from the Tanzil Project (Uthmani), used under its licence.
