/* =========================================================================
   Service worker — cachea el "cascarón" de la app para que abra al instante
   y siga funcionando sin internet. Los datos de Google Sheets NUNCA se
   cachean: siempre van a la red para no mostrar información vieja.
   ========================================================================= */

const CACHE = 'finanzas-shell-v1';

const RECURSOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './iconos/icon-192.png',
  './iconos/icon-512.png',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      // cache.addAll falla entero si un recurso falla; por eso los agregamos uno por uno.
      Promise.all(RECURSOS.map(url => cache.add(url).catch(() => null)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // La API de Google Sheets siempre va directo a la red.
  const esGoogle = /(^|\.)google(usercontent)?\.com$/.test(url.hostname) ||
                   /(^|\.)googleapis\.com$/.test(url.hostname);
  if (esGoogle) return;

  // Navegaciones: red primero, caché como respaldo (para abrir sin internet).
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html').then(r => r || Response.error()))
    );
    return;
  }

  // Recursos estáticos: caché primero y, si no están, se descargan.
  event.respondWith(
    caches.match(req).then(cachado => {
      if (cachado) return cachado;
      return fetch(req).then(resp => {
        if (resp && resp.ok && resp.type === 'basic') {
          const copia = resp.clone();
          caches.open(CACHE).then(c => c.put(req, copia));
        }
        return resp;
      }).catch(() => cachado || Response.error());
    })
  );
});