// PokerTrama — guarda os arquivos do app para abrir rápido. O jogo em si precisa de internet.
const CACHE = 'pokertramas-p2p-v3';
const SHELL = ['./', 'index.html', 'engine.js', 'peerjs.min.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'abertura.webp', 'abertura-chamas.jpg', 'logo-mesa.webp',
  'fonts/big-shoulders-display-latin-600-normal.woff2', 'fonts/big-shoulders-display-latin-800-normal.woff2',
  'fonts/figtree-latin-400-normal.woff2', 'fonts/figtree-latin-500-normal.woff2',
  'fonts/figtree-latin-600-normal.woff2', 'fonts/figtree-latin-700-normal.woff2'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys()
  .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => {
    const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))));
});
