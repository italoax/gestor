// Service worker: rede sem cache HTTP, aviso offline e notificações push.
declare const self: ServiceWorkerGlobalScope & {
  __GESTOR_ASSETS__?: { cacheName?: string; appShell?: string[] };
};
export {};

const { cacheName: CACHE, appShell: APP_SHELL = [] } =
  self.__GESTOR_ASSETS__ || {};
// Página mostrada quando uma navegação acontece sem rede (app instalado offline).
const OFFLINE_URL = '/offline.html';
const OFFLINE_ASSET = APP_SHELL.find(
  (url) => url.split('?')[0] === OFFLINE_URL,
);

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      if (!CACHE) {
        self.skipWaiting();
        return;
      }
      const cache = await caches.open(CACHE);
      // Apenas o aviso offline é público e seguro para guardar localmente.
      await Promise.all(
        APP_SHELL.filter((url) => url === OFFLINE_ASSET).map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: 'no-store' }));
          } catch {
            /* ignora */
          }
        }),
      );
      self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      if (CACHE) {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((k) => k.startsWith('gestor-') && k !== CACHE)
            .map((k) => caches.delete(k)),
        );
      }
      await self.clients.claim();
    })(),
  );
});

// HTML vem da rede; somente o aviso offline pode vir do Cache Storage.
self.addEventListener('fetch', (event) => {
  if (!CACHE) return;
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // Em desenvolvimento, deixa o navegador buscar tudo diretamente.
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    return;
  // Navegacao (abrir uma pagina): network-first. Se a rede falhar (offline),
  // serve a pagina offline em vez do erro do navegador. Nunca cacheia o HTML
  // dinamico — so o fallback offline sai do cache.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req, { cache: 'no-store' });
        } catch {
          const cache = await caches.open(CACHE);
          return (
            (await cache.match(OFFLINE_ASSET || OFFLINE_URL)) ||
            Response.error()
          );
        }
      })(),
    );
    return;
  }
  // Assets e APIs seguem diretamente para a rede, sem Cache Storage.
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data: Record<string, any> = {};
  try {
    data = event.data.json();
  } catch {
    data = { title: 'Gestor', body: event.data.text() };
  }
  const title = data.title || 'ixstreaming';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-192.png',
    tag: data.tag,
    data: { url: data.url || '/dashboard' },
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Click na notificação — abre/foca a aba do gestor na URL apontada.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target =
    (event.notification.data && event.notification.data.url) || '/dashboard';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const c of all) {
        try {
          // Se já tem aba do gestor aberta, foca e navega.
          if (c.url.startsWith(self.location.origin)) {
            await c.focus();
            if ('navigate' in c) await c.navigate(target);
            return;
          }
        } catch {
          /* ignora */
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
