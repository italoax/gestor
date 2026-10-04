import { watch } from "node:fs";
import path from "node:path";
import type { Express, Response } from "express";

export function installDevReload(app: Express, root: string) {
  const clients = new Set<Response>();
  const instance = String(Date.now());
  let revision = 0;
  let debounce: ReturnType<typeof setTimeout>;
  const watchers = ['src/views', 'public'].map(dir => watch(path.join(root, dir), { recursive: true }, (_event, file) => {
    if (!file || !/\.(ejs|html|css|js|svg|png|jpg|webp)$/i.test(String(file))) return;
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      revision++;
      for (const res of clients) res.write(`data: ${instance}:${revision}\n\n`);
    }, 300);
  }));
  app.get('/__dev/events', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.flushHeaders();
    clients.add(res);
    res.write(`data: ${instance}:${revision}\n\n`);
    const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 20000);
    req.on('close', () => { clearInterval(heartbeat); clients.delete(res); });
  });
  app.get('/__dev/reload.js', (_req, res) => {
    res.type('js').set('Cache-Control', 'no-store').send(`(() => {
      if (window.__devReload) return;
      window.__devReload = true;
      let version;
      const events = new EventSource('/__dev/events');
      events.onmessage = event => {
        if (version !== undefined && version !== event.data) { events.close(); location.reload(); }
        version = event.data;
      };
      window.addEventListener('pagehide', () => events.close());
    })();`);
  });
  app.use((_req, res, next) => {
    const send = res.send.bind(res);
    res.send = ((body: unknown) => {
      if (typeof body === 'string' && /<\/body>/i.test(body)) {
        body = body.replace(/<\/body>/i, '<script src="/__dev/reload.js" defer></script></body>');
      }
      return send(body);
    }) as typeof res.send;
    next();
  });
  return () => {
    clearTimeout(debounce);
    watchers.forEach(w => w.close());
    for (const res of clients) res.end();
  };
}
