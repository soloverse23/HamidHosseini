// The in-page book reader: draws a PDF with pdf.js, one page or an open
// spread at a time, in the book's own direction. A Persian book turns from
// right to left (its next page is on the left, and so are the arrow and swipe
// that reach it) whatever the language of the site around it.
//
// pdf.js (≈1 MB) loads only when a reader first opens a book.

import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { readProgress, saveProgress } from './book-progress';

type Pdfjs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
type Doc = Awaited<ReturnType<Pdfjs['getDocument']>['promise']>;
type Page = Awaited<ReturnType<Doc['getPage']>>;

const ZOOMS = [1, 1.25, 1.5, 2, 2.5, 3];
const CACHE = 12;

export function mountReader(dialog: HTMLDialogElement) {
  const id = dialog.dataset.id!;
  const url = dialog.dataset.pdf!;
  const rtl = dialog.dataset.dir === 'rtl';
  const intl = new Intl.NumberFormat(dialog.dataset.intl);
  const n = (x: number) => intl.format(x);
  const $ = <T extends HTMLElement>(sel: string) => dialog.querySelector<T>(sel)!;

  const desk = $('[data-desk]');
  const spreadEl = $('[data-spread]');
  const status = $('[data-status]');
  const bar = $<HTMLElement>('[data-loadbar]');
  const scrub = $<HTMLInputElement>('[data-scrub]');
  const goto = $<HTMLInputElement>('[data-goto]');
  const totalEl = $('[data-total]');
  const tocPanel = $('[data-toc]');
  const tocBtn = $<HTMLButtonElement>('[data-act="toc"]');
  const hint = $('[data-hint]');

  let pdfjs: Pdfjs | undefined;
  let doc: Doc | undefined;
  let loading: Promise<void> | undefined;
  let total = Number(dialog.dataset.pages) || 0;
  let page = 1;
  let zoom = 0;
  let spread = false;
  let token = 0;
  let opener: HTMLElement | null = null;
  const sizes = new Map<number, { w: number; h: number }>();
  const pages = new Map<number, Promise<Page>>();
  const canvases = new Map<string, HTMLCanvasElement>();

  try {
    dialog.toggleAttribute('data-night', localStorage.getItem('reader:night') === '1');
    const saved = localStorage.getItem('reader:spread');
    spread = saved ? saved === '1' : wide();
  } catch {
    spread = wide();
  }

  function wide() {
    return innerWidth >= 900 && innerWidth > innerHeight;
  }

  /* ---------- Opening and closing ---------- */

  async function load() {
    pdfjs ??= await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const task = pdfjs.getDocument({
      url,
      cMapUrl: '/pdfjs/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/pdfjs/standard_fonts/',
      wasmUrl: '/pdfjs/wasm/',
      // Fetch only the pages being read; long books start at once.
      disableAutoFetch: true,
      isEvalSupported: false,
    });
    task.onProgress = ({ loaded, total: size }: { loaded: number; total: number }) => {
      if (size) bar.style.inlineSize = `${Math.min(100, (loaded / size) * 100)}%`;
    };
    doc = await task.promise;
    total = doc.numPages;
    scrub.max = String(total);
    goto.max = String(total);
    totalEl.textContent = n(total);
    buildToc();
  }

  async function open(at?: number) {
    if (!dialog.open) {
      opener = document.activeElement as HTMLElement | null;
      dialog.showModal();
      document.documentElement.style.overflow = 'hidden';
      showHint();
    }
    page = at ?? readProgress(id)?.page ?? 1;
    status.hidden = false;
    status.removeAttribute('data-error');
    try {
      await (loading ??= load());
      status.hidden = true;
      await show(page, 0);
    } catch (e) {
      console.error(e);
      loading = undefined;
      status.dataset.error = '';
    }
    desk.focus({ preventScroll: true });
  }

  function close() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    dialog.close();
  }
  dialog.addEventListener('close', () => {
    document.documentElement.style.overflow = '';
    history.replaceState(null, '', location.pathname + location.search);
    tocPanel.hidden = true;
    opener?.focus({ preventScroll: true });
  });

  let hintTimer = 0;
  function showHint() {
    hint.hidden = false;
    clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => (hint.hidden = true), 3500);
  }

  /* ---------- Which pages are on screen ---------- */

  /** The pages shown together with `p`: the cover alone, then facing pairs 2–3, 4–5… */
  function group(p: number): number[] {
    if (!spread || innerWidth < 600 || p === 1) return [p];
    const left = p % 2 === 0 ? p : p - 1;
    return left + 1 <= total ? [left, left + 1] : [left];
  }
  const next = () => group(page).at(-1)! + 1;
  const prev = () => Math.max(1, group(page)[0] - 1);

  function getPage(p: number) {
    if (!pages.has(p)) pages.set(p, doc!.getPage(p));
    return pages.get(p)!;
  }
  async function size(p: number) {
    if (!sizes.has(p)) {
      const v = (await getPage(p)).getViewport({ scale: 1 });
      sizes.set(p, { w: v.width, h: v.height });
    }
    return sizes.get(p)!;
  }

  /** Scale that fits the group in the desk, times the zoom. */
  async function scaleFor(ps: number[]) {
    const dims = await Promise.all(ps.map(size));
    const pad = innerWidth < 600 ? 12 : 40;
    const w = desk.clientWidth - pad * 2;
    const h = desk.clientHeight - pad * 2;
    const fit = Math.min(w / dims.reduce((a, d) => a + d.w, 0), h / Math.max(...dims.map((d) => d.h)));
    return fit * ZOOMS[zoom];
  }

  async function canvasFor(p: number, scale: number) {
    const key = `${p}@${scale.toFixed(3)}`;
    const hit = canvases.get(key);
    if (hit) {
      canvases.delete(key);
      canvases.set(key, hit);
      return hit;
    }
    const pg = await getPage(p);
    const dpr = Math.min(devicePixelRatio || 1, 2.5);
    const view = pg.getViewport({ scale: scale * dpr });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(view.width);
    canvas.height = Math.floor(view.height);
    canvas.style.width = `${Math.floor(view.width / dpr)}px`;
    canvas.style.height = `${Math.floor(view.height / dpr)}px`;
    canvas.className = 'reader__page';
    canvas.setAttribute('aria-hidden', 'true');
    await pg.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: view }).promise;
    canvases.set(key, canvas);
    while (canvases.size > CACHE) canvases.delete(canvases.keys().next().value!);
    return canvas;
  }

  /** Draw the group holding `p`. `dir` is +1 forwards, -1 back, 0 for no turn. */
  async function show(p: number, dir: number) {
    if (!doc) return;
    page = Math.min(Math.max(1, p), total);
    const ps = group(page);
    const mine = ++token;
    const scale = await scaleFor(ps);
    const drawn = await Promise.all(ps.map((x) => canvasFor(x, scale)));
    if (mine !== token) return;

    spreadEl.replaceChildren(
      ...drawn.map((c, i) => {
        const leaf = document.createElement('div');
        leaf.className = 'reader__leaf';
        if (drawn.length === 2) leaf.dataset.side = i === 0 ? 'first' : 'second';
        leaf.append(c);
        return leaf;
      }),
    );
    spreadEl.classList.toggle('is-spread', drawn.length === 2);
    dialog.toggleAttribute('data-zoomed', zoom > 0);

    if (dir && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Pages come in from the side the book turns from.
      const from = (rtl ? -1 : 1) * dir * 40;
      spreadEl.animate(
        [
          { transform: `translateX(${from}px) rotateY(${(rtl ? 1 : -1) * dir * 6}deg)`, opacity: 0.2 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 340, easing: 'cubic-bezier(.2,.75,.25,1)' },
      );
    }
    if (zoom === 0) desk.scrollTo(0, 0);

    const last = ps[ps.length - 1];
    scrub.value = String(page);
    scrub.style.setProperty('--fill', `${((page - 1) / Math.max(1, total - 1)) * 100}%`);
    goto.value = String(page);
    $('[data-where]').textContent = ps.length === 2 ? `${n(ps[0])}–${n(last)}` : n(page);
    ($('[data-act="prev"]') as HTMLButtonElement).disabled = page <= 1;
    ($('[data-act="next"]') as HTMLButtonElement).disabled = last >= total;
    saveProgress(id, page, total);
    history.replaceState(null, '', `#page=${page}`);

    // Have the next and previous groups ready before they are asked for.
    const ahead = [...group(Math.min(total, last + 1)), ...group(Math.max(1, ps[0] - 1))];
    setTimeout(() => {
      if (mine !== token) return;
      for (const x of ahead) if (x >= 1 && x <= total) canvasFor(x, scale).catch(() => {});
    }, 120);
  }

  const forward = () => (group(page).at(-1)! < total ? show(next(), 1) : undefined);
  const back = () => (page > 1 ? show(prev(), -1) : undefined);

  /* ---------- Contents ---------- */

  async function buildToc() {
    const outline = await doc!.getOutline().catch(() => null);
    if (!outline?.length) return;
    const target = async (dest: unknown) => {
      const d = typeof dest === 'string' ? await doc!.getDestination(dest) : (dest as unknown[] | null);
      if (!d?.[0]) return undefined;
      const ref = d[0];
      return typeof ref === 'number' ? ref + 1 : (await doc!.getPageIndex(ref as never)) + 1;
    };
    type Item = (typeof outline)[number];
    const list = async (items: Item[], depth: number): Promise<HTMLOListElement> => {
      const ol = document.createElement('ol');
      for (const it of items) {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dir = 'auto';
        btn.textContent = it.title;
        const at = await target(it.dest).catch(() => undefined);
        if (at) {
          const num = document.createElement('span');
          num.className = 'num';
          num.textContent = n(at);
          btn.append(num);
          btn.addEventListener('click', () => {
            show(at, at > page ? 1 : -1);
            if (innerWidth < 900) tocPanel.hidden = true;
          });
        } else btn.disabled = true;
        li.append(btn);
        if (it.items?.length && depth < 2) li.append(await list(it.items, depth + 1));
        ol.append(li);
      }
      return ol;
    };
    tocPanel.querySelector('ol')?.remove();
    tocPanel.append(await list(outline, 0));
    tocBtn.hidden = false;
  }

  /* ---------- Controls ---------- */

  const actions: Record<string, () => void> = {
    close,
    prev: back,
    next: forward,
    'zoom-in': () => {
      zoom = Math.min(ZOOMS.length - 1, zoom + 1);
      show(page, 0);
    },
    'zoom-out': () => {
      zoom = Math.max(0, zoom - 1);
      show(page, 0);
    },
    spread: () => {
      spread = !spread;
      try {
        localStorage.setItem('reader:spread', spread ? '1' : '0');
      } catch {}
      sync();
      show(page, 0);
    },
    night: () => {
      const on = !dialog.hasAttribute('data-night');
      dialog.toggleAttribute('data-night', on);
      try {
        localStorage.setItem('reader:night', on ? '1' : '0');
      } catch {}
      sync();
    },
    full: () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else dialog.requestFullscreen?.().catch(() => {});
    },
    toc: () => {
      tocPanel.hidden = !tocPanel.hidden;
      sync();
    },
  };
  function sync() {
    $('[data-act="spread"]').setAttribute('aria-pressed', String(spread));
    $('[data-act="night"]').setAttribute('aria-pressed', String(dialog.hasAttribute('data-night')));
    tocBtn.setAttribute('aria-expanded', String(!tocPanel.hidden));
    $('[data-act="zoom-out"]').toggleAttribute('disabled', zoom === 0);
    $('[data-act="zoom-in"]').toggleAttribute('disabled', zoom === ZOOMS.length - 1);
  }
  if (!document.fullscreenEnabled) $('[data-act="full"]').hidden = true;
  document.addEventListener('fullscreenchange', () =>
    $('[data-act="full"]').setAttribute('aria-pressed', String(!!document.fullscreenElement)),
  );

  dialog.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (btn && actions[btn.dataset.act!]) {
      actions[btn.dataset.act!]();
      if (btn.dataset.act!.startsWith('zoom')) sync();
    }
  });

  scrub.addEventListener('input', () => {
    $('[data-where]').textContent = n(Number(scrub.value));
    scrub.style.setProperty('--fill', `${((Number(scrub.value) - 1) / Math.max(1, total - 1)) * 100}%`);
  });
  scrub.addEventListener('change', () => show(Number(scrub.value), Number(scrub.value) > page ? 1 : -1));
  goto.addEventListener('change', () => {
    const v = Number(goto.value);
    if (v >= 1 && v <= total) show(v, v > page ? 1 : -1);
    else goto.value = String(page);
  });

  dialog.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).matches('input')) return;
    // The arrow that points to where the next page lies turns forward.
    const toNext = rtl ? 'ArrowLeft' : 'ArrowRight';
    const toPrev = rtl ? 'ArrowRight' : 'ArrowLeft';
    const key = e.key;
    if (key === toNext || key === 'PageDown' || (key === ' ' && zoom === 0)) forward();
    else if (key === toPrev || key === 'PageUp') back();
    else if (key === 'Home') show(1, -1);
    else if (key === 'End') show(total, 1);
    else if (key === '+' || key === '=') actions['zoom-in']();
    else if (key === '-') actions['zoom-out']();
    else return;
    e.preventDefault();
    sync();
  });

  // Swipe to turn, unless zoomed in (then a drag moves around the page).
  let start: { x: number; y: number; t: number } | undefined;
  desk.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') start = { x: e.clientX, y: e.clientY, t: Date.now() };
  });
  desk.addEventListener('pointerup', (e) => {
    if (!start || zoom > 0) return (start = undefined);
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const quick = Date.now() - start.t < 600;
    start = undefined;
    if (quick && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      // The next page lies on the left in a right-to-left book, so it is pulled in rightwards.
      const forwardSwipe = rtl ? dx > 0 : dx < 0;
      forwardSwipe ? forward() : back();
    }
  });

  let resizeTimer = 0;
  new ResizeObserver(() => {
    if (!dialog.open || !doc) return;
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => show(page, 0), 150);
  }).observe(desk);

  sync();
  return { open };
}

/* ---------- Wiring on the book page ---------- */

const dialog = document.querySelector<HTMLDialogElement>('dialog[data-reader]');
if (dialog) {
  const reader = mountReader(dialog);
  const fromHash = () => {
    const m = location.hash.match(/^#page=(\d+)$/);
    if (m) return reader.open(Number(m[1]));
    if (location.hash === '#read') return reader.open();
  };
  for (const a of document.querySelectorAll<HTMLAnchorElement>('[data-open-reader]'))
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const at = Number(a.dataset.page) || undefined;
      reader.open(at);
    });
  // Resume prompt on the start button.
  const p = readProgress(dialog.dataset.id!);
  if (p) {
    const intl = new Intl.NumberFormat(dialog.dataset.intl);
    for (const el of document.querySelectorAll<HTMLElement>('[data-resume-label]')) {
      el.textContent = el.dataset.resumeLabel!.replace('{n}', intl.format(p.page));
    }
    for (const el of document.querySelectorAll<HTMLElement>('[data-restart]')) el.hidden = false;
  }
  fromHash();
  addEventListener('hashchange', fromHash);
}
