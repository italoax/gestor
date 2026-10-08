import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const hash = (content) =>
  createHash('sha256').update(content).digest('hex').slice(0, 16);

// Uma única fonte de versões para o HTML, o manifesto PWA e o service worker.
// Uploads de clientes e páginas dinâmicas nunca entram no cache do aplicativo.
export function createAssetVersions(publicRoot) {
  const versions = {};
  function collect(directory, prefix = '') {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    )) {
      const relative = prefix + entry.name;
      if (entry.isDirectory()) {
        if (prefix || ['assets', 'icons'].includes(entry.name))
          collect(path.join(directory, entry.name), relative + '/');
      } else if (
        entry.isFile() &&
        ((prefix &&
          /\.(css|js|png|jpe?g|gif|svg|webp|ico|woff2?)$/i.test(entry.name)) ||
          [
            'offline.html',
            'favicon.svg',
            'favicon.ico',
            'apple-touch-icon.png',
          ].includes(relative))
      ) {
        versions['/' + relative] = hash(
          readFileSync(path.join(directory, entry.name)),
        );
      }
    }
  }
  collect(publicRoot);
  function assetUrl(url) {
    const [pathname] = url.split(/[?#]/);
    const version = versions[pathname];
    if (!version) throw new Error('Asset não encontrado: ' + pathname);
    const parsed = new URL(url, 'https://assets.invalid');
    parsed.searchParams.set('v', version);
    return parsed.pathname + parsed.search + parsed.hash;
  }

  const manifest = JSON.parse(
    readFileSync(path.join(publicRoot, 'manifest.json'), 'utf8'),
  );
  for (const icon of [
    ...(manifest.icons || []),
    ...(manifest.shortcuts || []).flatMap((shortcut) => shortcut.icons || []),
  ])
    icon.src = assetUrl(icon.src);
  const manifestSource = JSON.stringify(manifest, null, 2) + '\n';
  versions['/manifest.json'] = hash(manifestSource);

  const worker = readFileSync(path.join(publicRoot, 'sw.js'), 'utf8');
  const cacheName = 'gestor-' + hash(JSON.stringify(versions) + worker);
  const appShell = Object.keys(versions).map(assetUrl);
  const workerSource =
    'self.__GESTOR_ASSETS__ = ' +
    JSON.stringify({ cacheName, appShell }) +
    ';\n' +
    worker;
  return {
    assetUrl,
    versions,
    cacheName,
    appShell,
    manifestSource,
    workerSource,
  };
}
