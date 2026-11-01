// PDF Deck — demo in the browser (same viewer logic as the server version,
// analysis runs locally instead of at upload time).
const pdfjsLib = globalThis.pdfjsLib;
const $ = (id) => document.getElementById(id);
const stage = $('stage'), hsLayer = $('hotspots'), indicator = $('indicator');

let deck, pdf, storage, current = 0, slideEl = null, busy = false, pending = null;
const back = [], fwd = [];
const hidden = new Map(), initialHidden = new Map();
const box = { W: 0, H: 0 };
const settings = { swipe: true, resetOnPageEnter: true, transition: 'slide' };

async function openPdf(bytes, title) {
  $('loader').hidden = false; $('start').hidden = true;
  $('loadmsg').textContent = 'Analizez butoanele…';
  try {
    const analysis = await analyzePdf(bytes.slice());
    if (pdf) { await pdf.destroy(); clearCache(); thumbs.clear(); $('grid').textContent = ''; }
    deck = { title, ...analysis };
    hidden.clear(); initialHidden.clear(); back.length = 0; fwd.length = 0;
    pdf = await pdfjsLib.getDocument({ data: bytes, isEvalSupported: false, enableXfa: false }).promise;
    storage = pdf.annotationStorage;
    deck.pages.forEach((p) => p.toggleable.forEach((t) => {
      initialHidden.set(t.id, t.hidden); hidden.set(t.id, t.hidden); storage.setValue(t.id, { noView: t.hidden });
    }));
    document.title = 'PDF Deck';
    $('m-title').textContent = title;
    $('m-stats').textContent = `${deck.pageCount} pagini · ${deck.buttonCount} butoane și linkuri găsite` +
      (deck.unsupported.length ? ` · ignorate: ${deck.unsupported.join(', ')}` : '');
    current = 0; slideEl?.remove(); slideEl = null;
    layout();
    await show(0, { transition: 'none' });
    $('loader').hidden = true;
  } catch (e) {
    console.error(e);
    $('loadmsg').textContent = 'Nu am putut deschide PDF-ul: ' + (e.message || e);
  }
}

// ---------------------------------------------------------------- rendering
const clamp = (n) => Math.max(0, Math.min(deck.pageCount - 1, n));
function layout() { box.W = stage.clientWidth; box.H = stage.clientHeight; }
function fitFor(page) {
  const v = page.getViewport({ scale: 1 });
  const s = Math.min(box.W / v.width, box.H / v.height);
  const w = Math.round(v.width * s), h = Math.round(v.height * s);
  return { scale: s, w, h, x: Math.round((box.W - w) / 2), y: Math.round((box.H - h) / 2) };
}
const cache = new Map();
const visKey = (n) => deck.pages[n].toggleable.map((t) => (hidden.get(t.id) ? 1 : 0)).join('');
function render(n) {
  const key = `${n}|${visKey(n)}|${box.W}x${box.H}`;
  if (cache.has(key)) { const p = cache.get(key); cache.delete(key); cache.set(key, p); return p; }
  const p = (async () => {
    const page = await pdf.getPage(n + 1);
    const fit = fitFor(page);
    let dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (fit.w * fit.h * dpr * dpr > 16e6) dpr = Math.sqrt(16e6 / (fit.w * fit.h));
    const viewport = page.getViewport({ scale: fit.scale * dpr });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
    await page.render({ canvas, viewport, background: '#ffffff', annotationMode: pdfjsLib.AnnotationMode.ENABLE_STORAGE }).promise;
    canvas._fit = fit; canvas._vp = page.getViewport({ scale: fit.scale });
    return canvas;
  })();
  cache.set(key, p); p.catch(() => cache.delete(key));
  while (cache.size > 6) {
    const [k, old] = cache.entries().next().value; cache.delete(k);
    old.then((c) => { if (!c.isConnected) c.width = c.height = 0; }).catch(() => {});
  }
  return p;
}
function clearCache() { cache.clear(); }

async function show(n, { dir = 1, transition } = {}) {
  const canvas = await render(n);
  const fit = canvas._fit;
  const el = document.createElement('div');
  el.className = 'slide';
  Object.assign(el.style, { width: fit.w + 'px', height: fit.h + 'px', left: fit.x + 'px', top: fit.y + 'px' });
  el.appendChild(canvas);
  const pt = deck.pages[n].transition;
  const type = transition ?? (pt?.type || settings.transition);
  const dur = Math.round((pt?.duration ?? 0.35) * 1000);
  const old = slideEl;
  slideEl = el; current = n;
  stage.insertBefore(el, hsLayer);
  updateHotspots();
  indicator.textContent = `${n + 1} / ${deck.pageCount}`;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (old && type !== 'none' && !reduce) {
    for (const e of [el, old]) e.style.setProperty('--dur', dur + 'ms');
    if (type === 'fade') el.style.opacity = '0'; else el.style.transform = `translateX(${dir * box.W}px)`;
    el.getBoundingClientRect();
    el.classList.add('anim'); old.classList.add('anim');
    el.style.opacity = '1'; el.style.transform = 'none';
    if (type === 'fade') old.style.opacity = '0'; else old.style.transform = `translateX(${-dir * box.W * 0.35}px)`;
    await new Promise((r) => setTimeout(r, dur + 30));
  }
  old?.remove();
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 120));
  idle(() => [n + 1, n - 1].forEach((k) => k >= 0 && k < deck.pageCount && render(k)));
}

async function go(n, opts = {}) {
  n = clamp(n);
  if (n === current) return;
  if (busy) { pending = [n, opts]; return; }
  busy = true;
  try {
    if (!opts.fromHistory) { back.push(current); fwd.length = 0; }
    if (settings.resetOnPageEnter) { resetPage(current); resetPage(n); }
    await show(n, { dir: opts.dir ?? (n >= current ? 1 : -1) });
  } finally {
    busy = false;
    if (pending) { const [a, b] = pending; pending = null; go(a, b); }
  }
}
function resetPage(n) { for (const t of deck.pages[n].toggleable) setHidden(t.id, initialHidden.get(t.id)); }
function setHidden(id, h) {
  if (hidden.get(id) === h) return false;
  hidden.set(id, h); storage.setValue(id, { noView: h }); return true;
}
async function refreshCurrent() {
  const n = current, canvas = await render(n);
  if (n !== current || !slideEl) return;
  const oldC = slideEl.querySelector('canvas');
  if (oldC !== canvas) slideEl.replaceChild(canvas, oldC);
  updateHotspots();
}

// ---------------------------------------------------------------- hotspots
let hotspots = [];
function updateHotspots() {
  const { _fit: fit, _vp: vp } = slideEl.querySelector('canvas');
  Object.assign(hsLayer.style, { left: fit.x + 'px', top: fit.y + 'px', width: fit.w + 'px', height: fit.h + 'px' });
  hsLayer.textContent = ''; hotspots = [];
  const [ta, tb, tc, td, te, tf] = vp.transform;
  const tp = (x, y) => [ta * x + tc * y + te, tb * x + td * y + tf];
  for (const spot of deck.pages[current].hotspots) {
    if (spot.id && hidden.get(spot.id)) continue;
    const [x1, y1] = tp(spot.rect[0], spot.rect[1]), [x2, y2] = tp(spot.rect[2], spot.rect[3]);
    const r = { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), spot };
    const d = document.createElement('div');
    d.className = 'hs';
    Object.assign(d.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    hsLayer.appendChild(d); r.el = d; hotspots.push(r);
  }
}
function hitTest(cx, cy) {
  const fit = slideEl?.querySelector('canvas')?._fit; if (!fit) return null;
  const rect = stage.getBoundingClientRect();
  const x = cx - rect.left - fit.x, y = cy - rect.top - fit.y;
  for (let i = hotspots.length - 1; i >= 0; i--) {
    const h = hotspots[i];
    if (x >= h.x - 4 && x <= h.x + h.w + 4 && y >= h.y - 4 && y <= h.y + h.h + 4) return h;
  }
  return null;
}
async function runActions(actions) {
  let changed = false, nav = null;
  for (const a of actions) {
    if (a.type === 'visibility') for (const id of a.ids) changed = setHidden(id, a.mode === 'toggle' ? !hidden.get(id) : a.mode === 'hide') || changed;
    else if (a.type === 'goto') nav = { page: a.page };
    else if (a.type === 'named') nav = { named: a.name };
    else if (a.type === 'uri') showLink(a.url);
  }
  if (nav) {
    if (nav.named === 'GoBack') { if (back.length) { fwd.push(current); return go(back.pop(), { fromHistory: true, dir: -1 }); } return; }
    if (nav.named === 'GoForward') { if (fwd.length) { back.push(current); return go(fwd.pop(), { fromHistory: true }); } return; }
    const t = nav.page ?? { NextPage: current + 1, PrevPage: current - 1, FirstPage: 0, LastPage: deck.pageCount - 1 }[nav.named];
    if (t != null && clamp(t) !== current) return go(t);
  }
  if (changed) await refreshCurrent();
}
function showLink(url) {
  // inside this preview, links open through a small card (the frame blocks pop-ups)
  const a = $('linkcard').querySelector('a');
  a.href = url; a.textContent = url;
  $('linkcard').hidden = false;
  clearTimeout(showLink.t); showLink.t = setTimeout(() => { $('linkcard').hidden = true; }, 6000);
}

// ---------------------------------------------------------------- input
const pointers = new Map();
let g = null, longT = null;
const next = () => go(current + 1, { dir: 1 }), prev = () => go(current - 1, { dir: -1 });
stage.addEventListener('pointerdown', (e) => {
  if (!pdf) return;
  pointers.set(e.pointerId, 1);
  if (pointers.size === 1) {
    g = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, multi: false };
    clearTimeout(longT);
    longT = setTimeout(() => { if (g && !g.moved && !g.multi) { g = null; openMenu(); } }, 700);
  } else if (g) { g.multi = true; clearTimeout(longT); }
});
stage.addEventListener('pointermove', (e) => {
  if (g && pointers.has(e.pointerId) && Math.hypot(e.clientX - g.x, e.clientY - g.y) > 12) { g.moved = true; clearTimeout(longT); }
});
const endP = (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pointers.size || !g) return;
  clearTimeout(longT);
  const s = g; g = null;
  if (e.type === 'pointercancel') return;
  const dt = performance.now() - s.t, dx = e.clientX - s.x, dy = e.clientY - s.y;
  if (s.multi) { if (dt < 500) openMenu(); return; }
  if (s.moved) { if (settings.swipe && Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy) && dt < 900) dx < 0 ? next() : prev(); return; }
  if (dt > 650) return;
  const hit = hitTest(e.clientX, e.clientY);
  if (hit) { hit.el.classList.remove('flash'); void hit.el.offsetWidth; hit.el.classList.add('flash'); runActions(hit.spot.actions); }
};
stage.addEventListener('pointerup', endP);
stage.addEventListener('pointercancel', endP);
stage.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('keydown', (e) => {
  if (!pdf || !$('start').hidden) return;
  if (!$('menu').hidden) { if (e.key === 'Escape' || e.key === 'm') closeMenu(); return; }
  const k = e.key;
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(k)) next();
  else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(k)) prev();
  else if (k === 'Home') go(0);
  else if (k === 'End') go(deck.pageCount - 1);
  else if (k === 'm' || k === 'Escape') openMenu();
  else if (k === 'f') toggleFs();
  else return;
  e.preventDefault();
});
let rT;
new ResizeObserver(() => {
  clearTimeout(rT);
  rT = setTimeout(async () => {
    if (!pdf || (box.W === stage.clientWidth && box.H === stage.clientHeight)) return;
    layout(); clearCache(); thumbs.clear(); $('grid').textContent = '';
    await show(current, { transition: 'none' });
  }, 150);
}).observe(stage);

// ---------------------------------------------------------------- full screen + menu
const root = document.documentElement;
function toggleFs() {
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else { const p = (root.requestFullscreen || root.webkitRequestFullscreen)?.call(root); p?.catch?.(() => {}); }
  } catch {}
}
const thumbs = new Map();
function openMenu() {
  const grid = $('grid');
  if (!grid.childElementCount) {
    const io = new IntersectionObserver((en) => en.forEach((x) => {
      if (x.isIntersecting) { drawThumb(+x.target.dataset.n, x.target.querySelector('.img')); io.unobserve(x.target); }
    }), { root: grid, rootMargin: '200px' });
    deck.pages.forEach((p, i) => {
      const b = document.createElement('button');
      b.className = 'thumb'; b.dataset.n = i; b.type = 'button';
      b.innerHTML = `<div class="img" style="--ar:${p.width}/${p.height}"></div><span>${i + 1}</span>`;
      b.addEventListener('click', () => { closeMenu(); go(i); });
      grid.appendChild(b); io.observe(b);
    });
  }
  grid.querySelectorAll('.thumb').forEach((b) => b.classList.toggle('current', +b.dataset.n === current));
  $('menu').hidden = false;
}
function closeMenu() { $('menu').hidden = true; }
async function drawThumb(n, holder) {
  if (holder.firstChild) return;
  let c = thumbs.get(n);
  if (!c) {
    const page = await pdf.getPage(n + 1);
    const v1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: 340 / v1.width });
    c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
    await page.render({ canvas: c, viewport: vp, annotationMode: pdfjsLib.AnnotationMode.ENABLE_STORAGE }).promise;
    thumbs.set(n, c);
  }
  holder.appendChild(c);
}
$('m-close').addEventListener('click', closeMenu);
$('m-fs').addEventListener('click', () => { toggleFs(); closeMenu(); });
$('m-debug').addEventListener('change', (e) => document.body.classList.toggle('debug', e.target.checked));
$('menu-btn').addEventListener('click', openMenu);
$('linkcard').querySelector('button').addEventListener('click', () => { $('linkcard').hidden = true; });

// ---------------------------------------------------------------- opening files
function pickFile(input) {
  input.addEventListener('change', async () => {
    const f = input.files[0]; input.value = '';
    if (!f) return;
    closeMenu();
    $('loader').hidden = false; $('loadmsg').textContent = 'Citesc ' + f.name + '…';
    openPdf(new Uint8Array(await f.arrayBuffer()), f.name.replace(/\.pdf$/i, ''));
  });
}
pickFile($('file-start')); pickFile($('file-menu'));
for (const ev of ['dragover', 'drop']) document.addEventListener(ev, async (e) => {
  e.preventDefault();
  if (ev === 'drop') {
    const f = [...e.dataTransfer.files].find((x) => /\.pdf$/i.test(x.name));
    if (f) { closeMenu(); openPdf(new Uint8Array(await f.arrayBuffer()), f.name.replace(/\.pdf$/i, '')); }
  }
});
$('go-demo').addEventListener('click', () => {
  $('start').hidden = true;
  if ($('fs-on').checked) toggleFs();
});

const demoBytes = Uint8Array.from(atob(DEMO_PDF), (c) => c.charCodeAt(0));
openPdf(demoBytes, 'Demo — prezentare exportată din InDesign').then(() => { $('start').hidden = false; });
