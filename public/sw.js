// Offline support: once a presentation has been opened on the iPad it keeps
// working without internet (useful at clients / in hospitals with bad Wi-Fi).
const SHELL = 'pdfdeck-shell-v1';
const FILES = 'pdfdeck-files-v1';
const SHELL_URLS = ['/viewer.js', '/vendor/pdfjs/pdf.min.mjs', '/vendor/pdfjs/pdf.worker.min.mjs', '/icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_URLS)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// The viewer asks us to store the PDF + page after loading (first visit happens
// before this worker controls the page).
self.addEventListener('message', (e) => {
  const urls = e.data?.cache;
  if (!Array.isArray(urls)) return;
  e.waitUntil(Promise.all(urls.map(async (u) => {
    const files = u.startsWith('/files/');
    const cache = await caches.open(files ? FILES : SHELL);
    if (files && await cache.match(u)) return;
    const res = await fetch(u, { cache: 'no-cache' });
    if (res.ok) await cache.put(u, res);
  })).then(() => e.source?.postMessage({ cached: urls })).catch(() => {}));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return;

  // PDFs are versioned (/files/<id>-<version>.pdf) => never change => cache first
  if (url.pathname.startsWith('/files/')) {
    e.respondWith(caches.open(FILES).then(async (c) => {
      const hit = await c.match(url.pathname);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok && res.status === 200) c.put(url.pathname, res.clone());
      return res;
    }));
    return;
  }
  // everything else of the viewer: network first, cache as fallback (offline)
  if (url.pathname.startsWith('/p/') || url.pathname.startsWith('/vendor/') || url.pathname.startsWith('/thumbs/') || SHELL_URLS.includes(url.pathname)) {
    e.respondWith(fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: url.pathname.startsWith('/vendor/') })
      .then((r) => r || caches.match(url.pathname))
      .then((r) => r || new Response('Offline', { status: 503 }))));
  }
});
