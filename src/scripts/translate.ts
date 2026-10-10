// In-browser translation of content that isn't in the reader's language.
//
// Content blocks opt in with `data-tr` plus their own `lang`. Anything under
// `translate="no"` is left alone: the Quran pages, the group Quran translation
// posts, and Quranic Arabic quoted inside a post (wrapped below before sending).
// Nothing is sent until the reader agrees; the choice is remembered.
// The text goes to Google's free web endpoint straight from the browser, so
// each reader's own quota applies and the site needs no key or server.

import { isLocale, type Locale } from '../i18n/locales';
import { TR_STRINGS } from '../i18n/translate';

const ENDPOINT = 'https://translate.googleapis.com/translate_a/t';
const MAX_CHARS = 4000; // per segment and per request
const MAX_Q = 24; // segments per request
const PARALLEL = 3;

const root = document.documentElement;
const store = {
  get(area: Storage | undefined, k: string) {
    try {
      return area?.getItem(k) ?? null;
    } catch {
      return null;
    }
  },
  set(area: Storage | undefined, k: string, v: string | null) {
    try {
      if (v === null) area?.removeItem(k);
      else area?.setItem(k, v);
    } catch {}
  },
};
const local = (() => { try { return localStorage; } catch { return undefined; } })();
const session = (() => { try { return sessionStorage; } catch { return undefined; } })();

// ---------- Which language does the reader want? ----------
// Most pages exist in every language, so the page language is the answer.
// Persian posts exist once (under /fa/, marked data-shared); there we use the
// language the reader last browsed in.
function readerLocale(): Locale {
  const page = root.lang as Locale;
  if (!root.hasAttribute('data-shared')) {
    store.set(local, 'reader-locale', page);
    return page;
  }
  const saved = store.get(local, 'reader-locale') ?? document.cookie.match(/(?:^|;\s*)locale=(\w+)/)?.[1];
  if (isLocale(saved ?? undefined)) return saved as Locale;
  for (const tag of navigator.languages ?? []) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return page;
}

const target = readerLocale();
const S = TR_STRINGS[target];
const names = new Intl.DisplayNames([target], { type: 'language' });
const langName = (code: string) => names.of(code) ?? code;
const nf = new Intl.NumberFormat(target === 'fa' ? 'fa-IR' : target === 'ar' ? 'ar-u-nu-arab' : target);
const baseLang = (l: string) => l.toLowerCase().split('-')[0];

// ---------- Candidates ----------
type Unit = { el: HTMLElement; sl: string; original: string; translated?: string; pending?: Promise<void> };
const units = new Map<HTMLElement, Unit>();

function collect(scope: ParentNode = document) {
  const found: Unit[] = [];
  scope.querySelectorAll<HTMLElement>('[data-tr][lang]').forEach((el) => {
    if (units.has(el)) return;
    const sl = baseLang(el.lang);
    if (!sl || sl === target || el.closest('[translate="no"]') || !el.textContent?.trim()) return;
    const u: Unit = { el, sl, original: el.innerHTML };
    units.set(el, u);
    found.push(u);
  });
  return found;
}

// ---------- Protect Quranic Arabic ----------
// Verses quoted in a post are fully vocalised; Persian prose almost never has
// three vowel-marked words in a row. Text inside ﴿ ﴾ is always a verse.
const AR_WORD = '[\\u0600-\\u06FF\\u0750-\\u077F\\uFB50-\\uFDFF\\uFE70-\\uFEFF]*[\\u064B-\\u065F\\u0670\\u06D6-\\u06ED][\\u0600-\\u06FF\\u0750-\\u077F\\uFB50-\\uFDFF\\uFE70-\\uFEFF]*';
const QURANIC = new RegExp(`﴿[^﴾]*﴾|${AR_WORD}(?:[\\s\\u200c،.:؛]+${AR_WORD}){2,}`, 'g');

function protect(container: HTMLElement) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text);
  for (const t of texts) {
    const s = t.data;
    QURANIC.lastIndex = 0;
    if (!QURANIC.test(s)) continue;
    QURANIC.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const m of s.matchAll(QURANIC)) {
      frag.append(s.slice(last, m.index));
      const span = document.createElement('span');
      span.setAttribute('translate', 'no');
      span.lang = 'ar';
      span.textContent = m[0];
      frag.append(span);
      last = m.index! + m[0].length;
    }
    frag.append(s.slice(last));
    t.replaceWith(frag);
  }
}

// ---------- Sanitise what comes back ----------
const ALLOWED = new Set(['DIV', 'A', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'DEL', 'CODE', 'PRE', 'BR', 'SPAN', 'BLOCKQUOTE', 'P', 'BDI', 'MARK', 'SMALL', 'SUB', 'SUP']);
const ATTRS = new Set(['href', 'target', 'rel', 'translate', 'lang', 'dir', 'class', 'title']);

function clean(html: string): DocumentFragment {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const walk = (node: ParentNode) => {
    for (const child of [...node.children]) {
      if (!ALLOWED.has(child.tagName)) {
        child.replaceWith(document.createTextNode(child.textContent ?? ''));
        continue;
      }
      for (const a of [...child.attributes]) {
        if ((!ATTRS.has(a.name) && !a.name.startsWith('data-astro-cid-')) || (a.name === 'href' && !/^(https?:|\/|#)/i.test(a.value.trim()))) child.removeAttribute(a.name);
      }
      walk(child);
    }
  };
  walk(tpl.content);
  return tpl.content;
}

// ---------- Segments ----------
// A long post is split at its top-level nodes so no request grows too big and
// markup is never cut in half.
function segments(el: HTMLElement): string[] {
  const box = document.createElement('div');
  box.innerHTML = el.innerHTML;
  protect(box);
  const out: string[] = [];
  let cur = '';
  for (const node of [...box.childNodes]) {
    const html = node.nodeType === Node.TEXT_NODE ? escapeText(node.textContent ?? '') : (node as Element).outerHTML ?? '';
    if (cur && cur.length + html.length > MAX_CHARS) {
      out.push(cur);
      cur = '';
    }
    cur += html;
  }
  if (cur) out.push(cur);
  return out;
}
const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- Network ----------
const memo = new Map<string, string>();
function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36) + s.length.toString(36);
}
const cacheKey = (sl: string, html: string) => `tr:${sl}:${target}:${hash(html)}`;

type Job = { sl: string; html: string; resolve: (v: string) => void; reject: (e: unknown) => void };
const queue: Job[] = [];
let active = 0;
let flushTimer = 0;

function translateHtml(sl: string, html: string): Promise<string> {
  const key = cacheKey(sl, html);
  const hit = memo.get(key) ?? store.get(session, key);
  if (hit !== null && hit !== undefined) return Promise.resolve(hit);
  return new Promise((resolve, reject) => {
    queue.push({
      sl,
      html,
      resolve: (v) => {
        memo.set(key, v);
        store.set(session, key, v);
        resolve(v);
      },
      reject,
    });
    clearTimeout(flushTimer);
    flushTimer = window.setTimeout(pump, 30);
  });
}

function pump() {
  while (active < PARALLEL && queue.length) {
    const sl = queue[0].sl;
    const batch: Job[] = [];
    let size = 0;
    for (let i = 0; i < queue.length && batch.length < MAX_Q; ) {
      const j = queue[i];
      if (j.sl !== sl || (batch.length && size + j.html.length > MAX_CHARS)) {
        i++;
        continue;
      }
      batch.push(j);
      size += j.html.length;
      queue.splice(i, 1);
    }
    active++;
    send(sl, batch).finally(() => {
      active--;
      pump();
    });
  }
}

async function send(sl: string, batch: Job[]) {
  try {
    const body = new URLSearchParams();
    for (const j of batch) body.append('q', j.html);
    const res = await fetch(`${ENDPOINT}?client=gtx&format=html&sl=${sl}&tl=${target}`, {
      method: 'POST',
      body,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let data: unknown = await res.json();
    if (!Array.isArray(data)) data = [data];
    const list = data as unknown[];
    batch.forEach((j, i) => {
      const v = list[i];
      const text = Array.isArray(v) ? v[0] : v;
      if (typeof text === 'string') j.resolve(text);
      else j.reject(new Error('Unexpected response'));
    });
  } catch (e) {
    batch.forEach((j) => j.reject(e));
  }
}

// ---------- Applying ----------
// The reader's decision is remembered across pages: 'on' translates every
// page automatically, 'off' leaves the originals. No decision yet → ask.
type Choice = 'on' | 'off';
const CHOICE_KEY = 'tr-choice';
const savedChoice = () => {
  const v = store.get(local, CHOICE_KEY);
  return v === 'on' || v === 'off' ? (v as Choice) : null;
};

let on = false;
let failed = false;

function translateUnit(u: Unit): Promise<void> {
  if (u.translated !== undefined) {
    if (on) show(u, true);
    return Promise.resolve();
  }
  if (u.pending) return u.pending;
  u.el.setAttribute('data-tr-state', 'pending');
  u.pending = Promise.all(segments(u.el).map((seg) => translateHtml(u.sl, seg)))
    .then((parts) => {
      const box = document.createElement('div');
      box.append(clean(parts.join('')));
      u.translated = box.innerHTML;
      if (on) show(u, true);
      else u.el.removeAttribute('data-tr-state');
    })
    .catch(() => {
      u.el.removeAttribute('data-tr-state');
      failed = true;
    })
    .finally(() => {
      u.pending = undefined;
      renderLauncher();
    });
  renderLauncher();
  return u.pending;
}

function show(u: Unit, translated: boolean) {
  const { el } = u;
  if (translated && u.translated !== undefined) {
    el.innerHTML = u.translated;
    el.lang = target;
    el.dir = target === 'fa' || target === 'ar' ? 'rtl' : 'ltr';
    el.setAttribute('data-tr-state', 'done');
  } else {
    el.innerHTML = u.original;
    el.lang = u.sl;
    el.dir = u.sl === 'fa' || u.sl === 'ar' ? 'rtl' : 'ltr';
    el.removeAttribute('data-tr-state');
  }
}

// Translate what is on screen (and a little ahead) first.
const AHEAD = 800;
const seen = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting || !on) continue;
      const u = units.get(e.target as HTMLElement);
      if (u) translateUnit(u);
    }
  },
  { rootMargin: `${AHEAD}px 0px` },
);
const nearView = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.bottom > -AHEAD && r.top < innerHeight + AHEAD;
};

function enable() {
  on = true;
  failed = false;
  for (const u of units.values()) {
    if (u.translated !== undefined) show(u, true);
    // Start the visible ones now so the launcher shows progress at once;
    // the observer picks up the rest on scroll.
    else if (nearView(u.el)) translateUnit(u);
    seen.unobserve(u.el);
    seen.observe(u.el);
  }
  renderLauncher();
}

function disable() {
  on = false;
  for (const u of units.values()) show(u, false);
  renderLauncher();
}

// ---------- UI: a popup that asks, then a button in the corner ----------
const DIR = target === 'fa' || target === 'ar' ? 'rtl' : 'ltr';
const ICON =
  '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h9M8.5 3v2M6 5c.8 3.4 3 6 6 7.5M11 5c-.6 3-2.8 6-6.5 8"/><path d="m13 21 4-9 4 9M14.4 18h5.2"/></svg>';
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  n.append(...kids);
  return n;
}
const icon = (cls: string) => {
  const s = h('span', { class: cls, 'aria-hidden': 'true' });
  s.innerHTML = ICON;
  return s;
};
const common = { lang: target, dir: DIR, translate: 'no' };

let dialog: HTMLDialogElement | undefined;
let launcher: HTMLButtonElement | undefined;

function choose(choice: Choice) {
  store.set(local, CHOICE_KEY, choice);
  if (choice === 'on') enable();
  else disable();
  closeDialog();
}

function openDialog() {
  if (!dialog) {
    dialog = h('dialog', { class: 'tr-pop', 'aria-labelledby': 'tr-title', ...common }) as HTMLDialogElement;
    // Esc or a click on the backdrop means "not now" the first time, "no change" later.
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      if (savedChoice() === null) choose('off');
      else closeDialog();
    });
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog!.dispatchEvent(new Event('cancel', { cancelable: true }));
    });
    document.body.append(dialog);
  }
  const btn = (label: string, primary: boolean, onClick: () => void) => {
    const b = h('button', { type: 'button', class: primary ? 'btn btn--primary' : 'btn' }, label);
    b.addEventListener('click', onClick);
    return b;
  };
  const actions =
    failed && on
      ? [btn(S.retry, true, () => { closeDialog(); enable(); }), btn(S.showOriginal, false, () => choose('off'))]
      : on
        ? [btn(S.keep, true, () => choose('on')), btn(S.showOriginal, false, () => choose('off'))]
        : [btn(S.translate, true, () => choose('on')), btn(S.notNow, false, () => choose('off'))];
  // The reader's language stands out in the title.
  const [before, after] = S.title('\u0000').split('\u0000');
  const close = h('button', { type: 'button', class: 'tr-pop__close', 'aria-label': S.close });
  close.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  close.addEventListener('click', () => dialog!.dispatchEvent(new Event('cancel', { cancelable: true })));
  const info = h('span', { class: 'tr-pop__info', 'aria-hidden': 'true' });
  info.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';
  dialog.replaceChildren(
    close,
    h('div', { class: 'tr-pop__body' },
      icon('tr-pop__icon'),
      h('h2', { id: 'tr-title', class: 'tr-pop__title' }, before, h('span', { class: 'tr-pop__lang' }, langName(target)), after),
      h('p', { class: 'tr-pop__ask' }, failed && on ? S.failed : on ? S.isOn : S.ask),
      h('div', { class: 'tr-pop__actions' }, ...actions),
    ),
    h('p', { class: 'tr-pop__fine' }, info, h('span', {}, S.privacy)),
  );
  if (launcher) launcher.hidden = true;
  dialog.showModal();
  (actions[0] as HTMLElement).focus();
}

// The popup shrinks into the corner button so the reader sees where it went.
function closeDialog() {
  if (!dialog?.open) return;
  const d = dialog;
  renderLauncher();
  const l = launcher!;
  l.hidden = false;
  if (reduced.matches || !d.animate) {
    d.close();
    return;
  }
  const from = d.getBoundingClientRect();
  const to = l.getBoundingClientRect();
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  l.style.visibility = 'hidden';
  d.classList.add('is-leaving');
  d.animate(
    [
      { transform: 'none', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.08)`, opacity: 0.2 },
    ],
    { duration: 380, easing: 'cubic-bezier(.5,0,.3,1)' },
  ).finished.then(() => {
    d.classList.remove('is-leaving');
    d.close();
    l.style.visibility = '';
    l.animate([{ transform: 'scale(0.6)' }, { transform: 'scale(1.08)' }, { transform: 'none' }], { duration: 260, easing: 'ease-out' });
  });
}

function renderLauncher() {
  if (!units.size) return;
  if (!launcher) {
    launcher = h('button', { type: 'button', class: 'tr-launch', 'aria-haspopup': 'dialog', ...common }) as HTMLButtonElement;
    launcher.addEventListener('click', openDialog);
    launcher.hidden = dialog?.open ?? savedChoice() === null;
    document.body.append(launcher);
  }
  const all = [...units.values()];
  const working = on && all.some((u) => u.pending);
  const state = working ? 'working' : on && failed ? 'error' : on ? 'on' : 'off';
  launcher.dataset.state = state;
  const label =
    state === 'working'
      ? S.working(
          nf.format(all.filter((u) => u.translated !== undefined).length),
          nf.format(all.filter((u) => u.translated !== undefined || u.pending).length),
        )
      : state === 'error' ? S.retry
      : state === 'on' ? S.on
      : S.off;
  launcher.setAttribute('aria-label', `${S.options}: ${label}`);
  launcher.replaceChildren(
    state === 'working' ? h('span', { class: 'tr-launch__spin', 'aria-hidden': 'true' }) : icon('tr-launch__icon'),
    h('span', { class: 'tr-launch__label', 'aria-hidden': 'true' }, label),
  );
}

// ---------- Boot ----------
let asked = false;
function boot(scope?: ParentNode) {
  const added = collect(scope);
  if (!added.length) return;
  if (on) {
    added.forEach((u) => seen.observe(u.el));
    renderLauncher();
    return;
  }
  const choice = savedChoice();
  if (choice === 'on') enable();
  else renderLauncher();
  if (choice === null && !asked) {
    asked = true;
    // Let the page settle before asking, and never over another open dialog
    // (e.g. the search dialog opened with ⌘K right after load).
    const ask = () => (document.querySelector('dialog[open]') ? setTimeout(ask, 1000) : openDialog());
    setTimeout(ask, 700);
  }
}

boot();

// Pages that load more entries (the home timeline) add content later.
new MutationObserver((records) => {
  for (const r of records) {
    // Ignore our own swaps inside a translated block.
    if (r.target instanceof Element && r.target.closest('[data-tr]')) continue;
    for (const n of r.addedNodes) if (n instanceof HTMLElement) boot(n.parentElement ?? n);
  }
}).observe(document.querySelector('main') ?? document.body, { childList: true, subtree: true });
