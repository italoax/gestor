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
    res.type('js').set(noStoreHeaders).send(assets.workerSource);
  });
  app.get('/manifest.json', (_req, res) => {
    res
      .type('application/manifest+json')
      .set(noStoreHeaders)
      .send(assets.manifestSource);
  });
  // Mantém os hashes nas URLs e impede armazenamento HTTP mesmo sem versão.
  app.use(
    express.static(publicRoot, {
      etag: false,
      lastModified: false,
      setHeaders(res) {
        for (const [key, value] of Object.entries(noStoreHeaders))
          res.setHeader(key, value);
      },
    }),
  );
}
