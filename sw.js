/* sw.js — Service worker de La aldea se duerme.
   · La app (HTML, JS, iconos) se guarda al instalarla: el modo local funciona sin conexión.
   · Estrategia «stale-while-revalidate»: se sirve lo guardado y se actualiza en segundo plano (la nueva versión se ve a la siguiente apertura).
   · Imágenes de cartas y fuentes (otros dominios): se guardan la primera vez que se ven; sin conexión se usa el emoji de reserva.
   · Nunca se intercepta nada de la señalización de PeerJS (WebSocket / API) ni el CDN de PeerJS: el online siempre va a la red.
   Al cambiar archivos de la app, sube VERSION para que los móviles descarten la caché antigua. */
const VERSION = 'v9';
const SHELL = 'aldea-shell-' + VERSION;
const EXTRA = 'aldea-extra-' + VERSION;
const ARCHIVOS = [
  './', 'index.html', 'manifest.webmanifest',
  'js/data.js', 'js/engine.js', 'js/flow.js', 'js/auto.js', 'js/app.js', 'js/online.js', 'js/transport-peer.js', 'js/qrcode.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => Promise.all(ARCHIVOS.map(a => c.add(a).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('aldea-') && k !== SHELL && k !== EXTRA).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function conActualizacion(req, nombre) {
  const cache = await caches.open(nombre);
  const guardado = await cache.match(req, { ignoreSearch: false });
  const red = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) cache.put(req, r.clone()); return r; }).catch(() => null);
  return guardado || (await red) || (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
}

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (/peerjs/i.test(url.hostname) || /peerjs@/.test(url.pathname) || url.pathname.includes('/peerjs/')) return; // online: siempre red
  if (url.origin === location.origin) { e.respondWith(conActualizacion(req, SHELL)); return; }
  if (/\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(url.pathname) || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) e.respondWith(conActualizacion(req, EXTRA));
});
