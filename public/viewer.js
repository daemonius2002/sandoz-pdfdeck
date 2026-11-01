import * as pdfjsLib from '/vendor/pdfjs/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
const V = location.origin + '/vendor/pdfjs/';
const slug = decodeURIComponent(location.pathname.split('/')[2] || '');

const $ = (id) => document.getElementById(id);
const stage = $('stage'), hsLayer = $('hotspots'), indicator = $('indicator');

let deck, pdf, storage;
let current = 0;
let slideEl = null;
let busy = false, pending = null;
const history = [], forward = [];
const hidden = new Map();       // annotation id -> currently hidden?
const initialHidden = new Map(); // annotation id -> hidden when the page is entered
const pageOf = new Map();        // annotation id -> page index
let box = { w: 0, h: 0, x: 0, y: 0, scale: 1 };

// ------------------------------------------------------------------ loading
async function load() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

  const r = await fetch(`/p/${encodeURIComponent(slug)}/deck.json`, { cache: 'no-cache' }).catch(() => null)
    || await caches?.match?.(`/p/${encodeURIComponent(slug)}/deck.json`);
  if (!r || !r.ok) throw new Error('Prezentarea nu a putut fi încărcată.');
  deck = await r.json();
  document.documentElement.style.setProperty('--bg', deck.settings.background);

  const bytes = await fetchWithProgress(deck.pdf, (p) => { $('progress').style.width = (p * 100).toFixed(1) + '%'; });
  $('loadmsg').textContent = 'Se pregătește…';

  pdf = await pdfjsLib.getDocument({
    data: bytes, cMapUrl: V + 'cmaps/', cMapPacked: true, standardFontDataUrl: V + 'standard_fonts/',
    wasmUrl: V + 'wasm/', iccUrl: V + 'iccs/', isEvalSupported: false, enableXfa: false,
  }).promise;
  storage = pdf.annotationStorage;

  deck.pages.forEach((p, i) => {
    for (const t of p.toggleable) {
      initialHidden.set(t.id, t.hidden);
      hidden.set(t.id, t.hidden);
      pageOf.set(t.id, i);
      storage.setValue(t.id, { noView: t.hidden });
    }
  });

  const fromHash = parseInt(location.hash.slice(1), 10);
  current = Number.isFinite(fromHash) ? clamp(fromHash - 1) : 0;
  indicator.style.display = deck.settings.pageIndicator ? 'block' : 'none';
  layout();
  await show(current, { transition: 'none' });
  $('loader').hidden = true;

  if (isStandalone() || isFullscreen()) start(false);
  else {
    if (!canFullscreen()) {
      $('go').textContent = 'Pornește';
      $('go-window').hidden = true;
      $('start-hint').innerHTML = 'Pentru ecran complet: apasă <b>Share → Add to Home Screen</b> și deschide prezentarea de pe ecranul principal.<br><br>Ține apăsat o secundă (sau atinge cu două degete) pentru meniu.';
    }
    $('start').hidden = false;
  }
  checkOffline();
}

async function fetchWithProgress(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('PDF-ul nu a putut fi descărcat.');
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !total) return new Uint8Array(await res.arrayBuffer());
  const out = new Uint8Array(total);
  const reader = res.body.getReader();
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (got + value.length > out.length) return new Uint8Array(await new Blob([out.subarray(0, got), value]).arrayBuffer());
    out.set(value, got); got += value.length;
    onProgress(got / total);
  }
  return got === total ? out : out.subarray(0, got);
}

// ------------------------------------------------------------------ geometry
const clamp = (n) => Math.max(0, Math.min(deck.pageCount - 1, n));
const pageInfo = (n) => deck.pages[n];

function layout() {
  const W = window.innerWidth, H = window.innerHeight;
  box.W = W; box.H = H;
}

function fitFor(page) {
  const vp1 = page.getViewport({ scale: 1 });
  const scale = Math.min(box.W / vp1.width, box.H / vp1.height);
  const w = Math.round(vp1.width * scale), h = Math.round(vp1.height * scale);
  return { scale, w, h, x: Math.round((box.W - w) / 2), y: Math.round((box.H - h) / 2) };
}

// ------------------------------------------------------------------ rendering cache
const cache = new Map(); // key -> Promise<canvas>
const CACHE_MAX = 6;
const visKey = (n) => pageInfo(n).toggleable.map((t) => (hidden.get(t.id) ? 1 : 0)).join('');

function render(n) {
  const key = `${n}|${visKey(n)}|${box.W}x${box.H}`;
  if (cache.has(key)) {
    const p = cache.get(key); cache.delete(key); cache.set(key, p); // LRU bump
    return p;
  }
  const p = (async () => {
    const page = await pdf.getPage(n + 1);
    const fit = fitFor(page);
    let dpr = Math.min(window.devicePixelRatio || 1, 3);
    const maxArea = 16e6; // iOS Safari canvas limit is ~16.7 MP
    if (fit.w * fit.h * dpr * dpr > maxArea) dpr = Math.sqrt(maxArea / (fit.w * fit.h));
    const viewport = page.getViewport({ scale: fit.scale * dpr });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({
      canvas, viewport, background: '#ffffff',
      annotationMode: pdfjsLib.AnnotationMode.ENABLE_STORAGE,
    }).promise;
    canvas._fit = fit;
    canvas._viewport = page.getViewport({ scale: fit.scale });
    return canvas;
  })();
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  while (cache.size > CACHE_MAX) {
    const [oldKey, oldP] = cache.entries().next().value;
    cache.delete(oldKey);
    oldP.then((c) => { if (!c.isConnected) { c.width = 0; c.height = 0; } }).catch(() => {});
  }
  return p;
}

function clearCache() {
  for (const p of cache.values()) p.then((c) => { if (!c.isConnected) { c.width = 0; c.height = 0; } }).catch(() => {});
  cache.clear();
}

function prerender() {
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 120));
  idle(() => { for (const n of [current + 1, current - 1]) if (n >= 0 && n < deck.pageCount) render(n); });
}

// ------------------------------------------------------------------ showing pages
async function show(n, { dir = 1, transition } = {}) {
  const canvas = await render(n);
  const fit = canvas._fit;
  const el = document.createElement('div');
  el.className = 'slide';
  Object.assign(el.style, { width: fit.w + 'px', height: fit.h + 'px', left: fit.x + 'px', top: fit.y + 'px' });
  el.appendChild(canvas);

  const pdfTrans = pageInfo(n).transition;
  const type = transition ?? (pdfTrans?.type || deck.settings.transition);
  const dur = Math.round((pdfTrans?.duration ?? 0.35) * 1000);
  const old = slideEl;
  slideEl = el;
  current = n;
  stage.insertBefore(el, hsLayer);
  updateHotspots();
  updateIndicator();

  if (old && type !== 'none') {
    el.style.setProperty('--dur', dur + 'ms');
    old.style.setProperty('--dur', dur + 'ms');
    if (type === 'fade') { el.style.opacity = '0'; }
    else { el.style.transform = `translateX(${dir * box.W}px)`; }
    el.getBoundingClientRect(); // commit start state
    el.classList.add('anim'); old.classList.add('anim');
    el.style.opacity = '1'; el.style.transform = 'none';
    if (type === 'fade') old.style.opacity = '0';
    else old.style.transform = `translateX(${-dir * box.W * 0.35}px)`;
    await new Promise((r) => setTimeout(r, dur + 30));
  }
  if (old) { old.remove(); }
  try { window.history.replaceState(null, '', '#' + (n + 1)); } catch {}
  prerender();
}

async function go(n, opts = {}) {
  n = clamp(n);
  if (n === current && !opts.force) return;
  if (busy) { pending = [n, opts]; return; }
  busy = true;
  try {
    if (!opts.fromHistory) { history.push(current); forward.length = 0; }
    if (deck.settings.resetOnPageEnter) resetPage(current);
    if (deck.settings.resetOnPageEnter) resetPage(n);
    await show(n, { dir: opts.dir ?? (n >= current ? 1 : -1), transition: opts.transition });
  } finally {
    busy = false;
    if (pending) { const [pn, po] = pending; pending = null; go(pn, po); }
  }
}

function resetPage(n) {
  for (const t of pageInfo(n).toggleable) setHidden(t.id, initialHidden.get(t.id));
}
function setHidden(id, h) {
  if (hidden.get(id) === h) return false;
  hidden.set(id, h);
  storage.setValue(id, { noView: h });
  return true;
}

async function refreshCurrent() {
  // re-draw the current page after a show/hide, swapping the canvas without flicker
  const n = current;
  const canvas = await render(n);
  if (n !== current || !slideEl) return;
  const oldCanvas = slideEl.querySelector('canvas');
  if (oldCanvas !== canvas) slideEl.replaceChild(canvas, oldCanvas);
  updateHotspots();
}

// ------------------------------------------------------------------ hotspots
let hotspots = []; // {x,y,w,h,spot,el}
function updateHotspots() {
  const canvas = slideEl.querySelector('canvas');
  const { _fit: fit, _viewport: vp } = canvas;
  Object.assign(hsLayer.style, { left: fit.x + 'px', top: fit.y + 'px', width: fit.w + 'px', height: fit.h + 'px' });
  hsLayer.textContent = '';
  hotspots = [];
  for (const spot of pageInfo(current).hotspots) {
    if (spot.id && hidden.get(spot.id)) continue;
    const [ta, tb, tc, td, te, tf] = vp.transform;
    const tp = (x, y) => [ta * x + tc * y + te, tb * x + td * y + tf];
    const [x1, y1] = tp(spot.rect[0], spot.rect[1]);
    const [x2, y2] = tp(spot.rect[2], spot.rect[3]);
    const r = { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), spot };
    const d = document.createElement('div');
    d.className = 'hs';
    Object.assign(d.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    hsLayer.appendChild(d);
    r.el = d;
    hotspots.push(r);
  }
}

function hitTest(clientX, clientY) {
  const fit = slideEl?.querySelector('canvas')?._fit;
  if (!fit) return null;
  const x = clientX - fit.x, y = clientY - fit.y;
  const pad = 4; // a little forgiveness for fingers
  for (let i = hotspots.length - 1; i >= 0; i--) {
    const h = hotspots[i];
    if (x >= h.x - pad && x <= h.x + h.w + pad && y >= h.y - pad && y <= h.y + h.h + pad) return h;
  }
  return null;
}

async function runActions(actions) {
  let changed = false, nav = null;
  for (const a of actions) {
    if (a.type === 'visibility') {
      for (const id of a.ids) {
        const h = a.mode === 'toggle' ? !hidden.get(id) : a.mode === 'hide';
        changed = setHidden(id, h) || changed;
      }
    } else if (a.type === 'goto') nav = { page: a.page };
    else if (a.type === 'named') nav = { named: a.name };
    else if (a.type === 'uri') openUrl(a.url);
  }
  if (nav) {
    if (nav.named === 'GoBack') { if (history.length) { forward.push(current); return go(history.pop(), { fromHistory: true, dir: -1 }); } return; }
    if (nav.named === 'GoForward') { if (forward.length) { history.push(current); return go(forward.pop(), { fromHistory: true }); } return; }
    const target = nav.page ?? { NextPage: current + 1, PrevPage: current - 1, FirstPage: 0, LastPage: deck.pageCount - 1 }[nav.named];
    if (target != null && clamp(target) !== current) return go(target);
  }
  if (changed) await refreshCurrent();
}

function openUrl(url) {
  if (/^(mailto|tel|sms):/i.test(url)) { location.href = url; return; }
  if (/^javascript:/i.test(url)) return;
  window.open(url, '_blank', 'noopener');
}

// ------------------------------------------------------------------ input
const pointers = new Map();
let gesture = null, longTimer = null;
const next = () => go(current + 1, { dir: 1 });
const prev = () => go(current - 1, { dir: -1 });

stage.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) {
    gesture = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, multi: false };
    clearTimeout(longTimer);
    longTimer = setTimeout(() => { if (gesture && !gesture.moved && !gesture.multi) { gesture = null; openMenu(); } }, 700);
  } else if (gesture) { gesture.multi = true; clearTimeout(longTimer); }
});
stage.addEventListener('pointermove', (e) => {
  if (!gesture || !pointers.has(e.pointerId)) return;
  if (Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 12) { gesture.moved = true; clearTimeout(longTimer); }
});
const endPointer = (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pointers.size > 0 || !gesture) return;
  clearTimeout(longTimer);
  const g = gesture; gesture = null;
  if (e.type === 'pointercancel') return;
  const dt = performance.now() - g.t, dx = e.clientX - g.x, dy = e.clientY - g.y;
  if (g.multi) { if (dt < 500 && Math.abs(dx) < 30 && Math.abs(dy) < 30) openMenu(); return; }
  if (g.moved) {
    if (deck.settings.swipe && Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy) && dt < 900) dx < 0 ? next() : prev();
    return;
  }
  if (dt > 650) return;
  const hit = hitTest(e.clientX, e.clientY);
  if (hit) {
    hit.el.classList.remove('flash'); void hit.el.offsetWidth; hit.el.classList.add('flash');
    runActions(hit.spot.actions);
  } else if (deck.settings.tapZones) {
    if (e.clientX < box.W * 0.15) prev();
    else if (e.clientX > box.W * 0.85) next();
  }
};
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);
stage.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

document.addEventListener('keydown', (e) => {
  if (!deck || !pdf) return;
  if (!$('menu').hidden) { if (e.key === 'Escape' || e.key === 'm') closeMenu(); return; }
  switch (e.key) {
    case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': case 'Enter': next(); break;
    case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace': prev(); break;
    case 'Home': go(0); break;
    case 'End': go(deck.pageCount - 1); break;
    case 'm': case 'Escape': openMenu(); break;
    case 'f': toggleFullscreen(); break;
    case 'd': document.body.classList.toggle('debug'); break;
    default: return;
  }
  e.preventDefault();
});

let resizeT;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(async () => {
    if (!pdf || (box.W === window.innerWidth && box.H === window.innerHeight)) return;
    layout(); clearCache(); thumbs.clear();
    await show(current, { transition: 'none' });
  }, 150);
});

// ------------------------------------------------------------------ full screen
const root = document.documentElement;
const canFullscreen = () => !!(root.requestFullscreen || root.webkitRequestFullscreen) && (document.fullscreenEnabled || document.webkitFullscreenEnabled);
const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
const isStandalone = () => matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone === true;
function enterFullscreen() {
  try {
    const p = root.requestFullscreen ? root.requestFullscreen({ navigationUI: 'hide' }) : root.webkitRequestFullscreen();
    p?.catch?.(() => {});
  } catch {}
}
function toggleFullscreen() {
  if (isFullscreen()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else enterFullscreen();
}
function start(fs) {
  if (fs && canFullscreen()) enterFullscreen();
  $('start').hidden = true;
}
$('go').addEventListener('click', () => start(true));
$('go-window').addEventListener('click', () => start(false));

// ------------------------------------------------------------------ menu
const thumbs = new Map();
let thumbObserver;
function openMenu() {
  const grid = $('grid');
  $('m-fs').hidden = !canFullscreen() || isStandalone();
  $('m-fs').textContent = isFullscreen() ? 'Ieși din full screen' : 'Full screen';
  if (!grid.childElementCount) {
    thumbObserver = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) { drawThumb(Number(en.target.dataset.n), en.target.querySelector('.img')); thumbObserver.unobserve(en.target); }
    }, { root: grid, rootMargin: '200px' });
    deck.pages.forEach((p, i) => {
      const b = document.createElement('button');
      b.className = 'thumb'; b.dataset.n = i;
      b.innerHTML = `<div class="img" style="--ar:${p.width}/${p.height}"></div><span>${i + 1}</span>`;
      b.addEventListener('click', () => { closeMenu(); go(i); });
      grid.appendChild(b);
      thumbObserver.observe(b);
    });
  }
  grid.querySelectorAll('.thumb').forEach((b) => b.classList.toggle('current', Number(b.dataset.n) === current));
  $('menu').hidden = false;
  grid.children[current]?.scrollIntoView({ block: 'center' });
}
function closeMenu() { $('menu').hidden = true; }
async function drawThumb(n, holder) {
  if (holder.firstChild) return;
  let c = thumbs.get(n);
  if (!c) {
    const page = await pdf.getPage(n + 1);
    const vp1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: (340 / vp1.width) });
    c = document.createElement('canvas');
    c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
    await page.render({ canvas: c, viewport: vp, annotationMode: pdfjsLib.AnnotationMode.ENABLE_STORAGE }).promise;
    thumbs.set(n, c);
  }
  holder.appendChild(c);
}
$('m-close').addEventListener('click', closeMenu);
$('m-fs').addEventListener('click', () => { toggleFullscreen(); closeMenu(); });
$('m-debug').addEventListener('change', (e) => document.body.classList.toggle('debug', e.target.checked));

function updateIndicator() { indicator.textContent = `${current + 1} / ${deck.pageCount}`; }

async function checkOffline() {
  if (!('caches' in window) || !('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  const base = `/p/${encodeURIComponent(slug)}`;
  reg?.active?.postMessage({ cache: [deck.pdf, base, base + '/deck.json', base + '/manifest.webmanifest'] });
  for (let i = 0; i < 40; i++) {
    if (await caches.match(deck.pdf)) { $('m-offline').textContent = '✓ Disponibilă și offline pe acest dispozitiv'; return; }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

load().catch((err) => {
  console.error(err);
  $('loadmsg').textContent = err.message || 'Eroare la încărcare.';
  $('loadmsg').classList.add('error');
});
