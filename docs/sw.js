// アプリのファイルだけをキャッシュする（cache-first）。ファイルを変えたら CACHE の版を上げる。
const CACHE = 'itb-v11';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/state.js',
  './js/storage.js',
  './js/tags.js',
  './js/ui.js',
  './js/builder.js',
  './js/manager.js',
  './js/io.js',
  './js/image.js',
  './js/metadata.js',
  './js/extract.js',
  './js/imageview.js',
  './vendor/Sortable.min.js',
  './icons/icon128.png',
  './icons/icon-180.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('itb-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin) return; // 外部へは関与しない
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});

// 新しい版は自動で切り替えず、画面の「更新する」を押したときだけ切り替える。
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
