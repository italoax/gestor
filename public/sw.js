// Service worker do ixstreaming.
// Estratégia: cache mínimo do app shell + handler de push notification.
// Não faço offline-first do conteúdo dinâmico — o gestor precisa de banco/WhatsApp
// pra fazer qualquer coisa, então cachear formulários seria enganoso.

// Configuração injetada pelo servidor a partir dos hashes dos arquivos.
// Alterações nos assets ou neste worker renovam o cache automaticamente.
// Se a hospedagem servir o arquivo estático sem passar pelo Node, mantém
// notificações e deixa as requisições com o navegador, sem cache sem versão.
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
      // addAll falha se algum item 404 — fazemos individual com try pra não quebrar tudo.
      await Promise.all(
        APP_SHELL.map(async (url) => {
          try {
            await cache.add(url);
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
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        );
      }
      await self.clients.claim();
    })(),
  );
});

// Stale-while-revalidate só pros assets estáticos. HTML/POST sempre vão pra rede.
self.addEventListener('fetch', (event) => {
  if (!CACHE) return;
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // DEV (localhost): nunca serve do cache — editar main.js/css e recarregar
  // mostra a versao nova na hora, sem rebuild nem hard refresh. Producao intacta.
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    return;
  // Navegacao (abrir uma pagina): network-first. Se a rede falhar (offline),
  // serve a pagina offline em vez do erro do navegador. Nunca cacheia o HTML
  // dinamico — so o fallback offline sai do cache.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          const cache = await caches.open(CACHE);
          return (await cache.match(OFFLINE_ASSET)) || Response.error();
        }
      })(),
    );
    return;
  }
  // Só cacheia /assets/* e /icons/* — resto sempre fresco.
  if (
    !url.pathname.startsWith('/assets/') &&
    !url.pathname.startsWith('/icons/')
  )
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      const fetched = fetch(req)
        .then((resp) => {
          if (resp.ok) cache.put(req, resp.clone());
          return resp;
        })
        .catch(() => cached);
      return cached || fetched;
    })(),
  );
});

// Push notification recebida — exibe notificação do sistema.
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data = {};
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
