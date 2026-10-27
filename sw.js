// Servis çalışanı: uygulama dosyalarını önbelleğe alır -> internetsiz açılır.
// YENİ SÜRÜM YAYINLARKEN: CACHE adını artır (ör. md-v4.0.1), yoksa cihazlar eski dosyayı kullanır.
const CACHE = 'md-v4.5.0';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/db.js', 'js/github.js', 'js/encoding.js', 'js/codepages.js', 'js/zip.js', 'js/textutil.js', 'js/i18n.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  // cache:'reload' → tarayıcının HTTP önbelleğini atla (GitHub Pages 10 dk önbellekler);
  // yoksa yeni sürümün önbelleğine eski app.js girebilir (iPhone'da 4.1.0'da kalma sebebi).
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(FILES.map(f => fetch(new Request(f, { cache: 'reload' })).then(r => { if (!r.ok) throw new Error(f + ' ' + r.status); return c.put(f, r); }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // GitHub API'ye dokunma
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match('index.html')))
  );
});
