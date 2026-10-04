// Service worker do ixstreaming.
// Estratégia: cache mínimo do app shell + handler de push notification.
// Não faço offline-first do conteúdo dinâmico — o gestor precisa de banco/WhatsApp
// pra fazer qualquer coisa, então cachear formulários seria enganoso.

// Bump esse nome de cache sempre que mudar APP_SHELL ou os arquivos referenciados —
// install dispara replace e velhos caches sao limpos no activate.
const CACHE = "gestor-v192";
// Página mostrada quando uma navegação acontece sem rede (app instalado offline).
const OFFLINE_URL = "/offline.html";
const APP_SHELL = [
  OFFLINE_URL,
  "/favicon.svg",
  "/favicon.ico",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/assets/css/style.css?v=192",
  "/assets/css/node-migration.css?v=192",
  "/assets/css/modals.css?v=192",
  "/assets/css/panel-ui.css?v=192",
  "/assets/css/visual-effects.css?v=192",
  "/assets/js/visual-effects.js?v=192",
  "/assets/js/main.js?v=192",
  "/assets/js/navigation.js?v=192",
  "/assets/js/app-shell.js?v=192",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // addAll falha se algum item 404 — fazemos individual com try pra não quebrar tudo.
    await Promise.all(APP_SHELL.map(async (url) => {
      try { await cache.add(url); } catch { /* ignora */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Stale-while-revalidate só pros assets estáticos. HTML/POST sempre vão pra rede.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // DEV (localhost): nunca serve do cache — editar main.js/css e recarregar
  // mostra a versao nova na hora, sem rebuild nem hard refresh. Producao intacta.
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") return;
  // Navegacao (abrir uma pagina): network-first. Se a rede falhar (offline),
  // serve a pagina offline em vez do erro do navegador. Nunca cacheia o HTML
  // dinamico — so o fallback offline sai do cache.
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
        const cache = await caches.open(CACHE);
        return (await cache.match(OFFLINE_URL)) || Response.error();
      }
    })());
    return;
  }
  // Só cacheia /assets/* e /icons/* — resto sempre fresco.
  if (!url.pathname.startsWith("/assets/") && !url.pathname.startsWith("/icons/")) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const fetched = fetch(req).then((resp) => {
      if (resp.ok) cache.put(req, resp.clone());
      return resp;
    }).catch(() => cached);
    return cached || fetched;
  })());
});

// Push notification recebida — exibe notificação do sistema.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { title: "Gestor", body: event.data.text() }; }
  const title = data.title || "ixstreaming";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192.png",
    badge: data.badge || "/icons/icon-192.png",
    tag: data.tag,
    data: { url: data.url || "/dashboard" },
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Click na notificação — abre/foca a aba do gestor na URL apontada.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      try {
        // Se já tem aba do gestor aberta, foca e navega.
        if (c.url.startsWith(self.location.origin)) {
          await c.focus();
          if ("navigate" in c) await c.navigate(target);
          return;
        }
      } catch { /* ignora */ }
    }
    await self.clients.openWindow(target);
  })());
});
