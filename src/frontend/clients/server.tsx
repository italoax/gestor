import { renderToString } from 'react-dom/server';
import { ClientsPage } from './ClientsPage.tsx';
import { createClientPageData } from '../../services/clientPageData.ts';

export function serializePageData(data) {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function renderClientPage(
  locals,
  { now = new Date() }: { now?: Date } = {},
) {
  const data = createClientPageData(locals, { now });
  const bundleUrl =
    locals.assetUrl?.('/assets/js/react/clients.js') ||
    '/assets/js/react/clients.js';
  return (
    '<div id="react-clientes-root" data-react-page="clientes" data-react-bundle="' +
    bundleUrl +
    '">' +
    renderToString(<ClientsPage data={data} />) +
    '</div>' +
    '<script type="application/json" id="react-clientes-data">' +
    serializePageData(data) +
    '</script>'
  );
}
