import express from 'express';
import { createAssetVersions } from '../services/assetVersions.js';

export function installAssets(app, publicRoot, { development = false } = {}) {
  let assets = createAssetVersions(publicRoot);
  app.locals.assetUrl = (url) => assets.assetUrl(url);
  app.locals.serviceWorkerUrl = () => '/sw.js?v=' + assets.cacheName;
  if (development) {
    app.use((req, _res, next) => {
      if (req.method === 'GET' && !/^\/(assets|icons|uploads)\//.test(req.path))
        assets = createAssetVersions(publicRoot);
      next();
    });
  }
  // Essas rotas precedem express.static para servir versões sincronizadas.
  app.get('/sw.js', (_req, res) => {
    res.type('js').set('Cache-Control', 'no-cache').send(assets.workerSource);
  });
  app.get('/manifest.json', (_req, res) => {
    res
      .type('application/manifest+json')
      .set('Cache-Control', 'no-cache')
      .send(assets.manifestSource);
  });
  // URLs com hash invalidam o cache automaticamente; ETag também revalida assets
  // acessados sem versão. O worker permanece em /sw.js para atualizar instalações.
  app.use(
    express.static(publicRoot, {
      etag: true,
      lastModified: true,
      setHeaders(res) {
        res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );
}
