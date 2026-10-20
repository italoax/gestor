import express from 'express';
import { createAssetVersions } from '../services/assetVersions.ts';
import { noStoreHeaders } from '../config/cache.ts';

export function installAssets(
  app,
  publicRoot,
  { development = false }: Record<string, any> = {},
) {
  let assets = createAssetVersions(publicRoot);
  app.locals.assetUrl = (url) => assets.assetUrl(url);
  app.locals.serviceWorkerUrl = () => '/__pwa/worker?v=' + assets.cacheName;
  if (!development) {
    // A pasta de assets publica apenas os artefatos destinados ao navegador.
    app.use('/assets', (req, res, next) => {
      let pathname: string;
      try {
        pathname = decodeURIComponent(req.path).replace(/\\/g, '/');
      } catch {
        res.set(noStoreHeaders).sendStatus(404);
        return;
      }
      if (
        /\.(?:map|[cm]?tsx?)$/i.test(pathname) ||
        pathname.split('/').some((segment) => segment.startsWith('.'))
      ) {
        res.set(noStoreHeaders).sendStatus(404);
        return;
      }
      next();
    });
  }
  if (development) {
    app.use((req, _res, next) => {
      if (req.method === 'GET' && !/^\/(assets|icons|uploads)\//.test(req.path))
        assets = createAssetVersions(publicRoot);
      next();
    });
  }
  // Essas rotas precedem express.static para servir versões sincronizadas.
  // O caminho sem extensão também passa pelo Node quando a hospedagem serve
  // arquivos estáticos diretamente, preservando a configuração do worker.
  app.get(['/sw.js', '/__pwa/worker'], (_req, res) => {
    res
      .type('js')
      .set(noStoreHeaders)
      .set('Service-Worker-Allowed', '/')
      .send(assets.workerSource);
  });
  app.get(['/manifest.json', '/__pwa/manifest'], (_req, res) => {
    res
      .type('application/manifest+json')
      .set(noStoreHeaders)
      .send(assets.manifestSource);
  });
  // Mantém os hashes nas URLs e impede armazenamento HTTP mesmo sem versão.
  app.use(
    express.static(publicRoot, {
      dotfiles: 'ignore',
      etag: false,
      lastModified: false,
      setHeaders(res) {
        for (const [key, value] of Object.entries(noStoreHeaders))
          res.setHeader(key, value);
      },
    }),
  );
}
