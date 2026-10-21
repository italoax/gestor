import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { readSiteDocument } from './siteDocument.ts';
import { requestBackend } from '../../../src/frontend/backendTransport.ts';

export const loadSitePage = cache(async () => {
  const request = await headers();
  const target = request.get('x-gestor-page-url') || '/';
  const backend = new URL(
    process.env.NEXT_BACKEND_URL || 'http://127.0.0.1:3001',
  );
  const url = new URL(backend);
  const pageUrl = new URL(target, 'http://gestor.local');
  url.pathname = pageUrl.pathname;
  url.search = pageUrl.search;
  const response = await requestBackend(url, {
    signal: AbortSignal.timeout(20000),
    headers: {
      cookie: request.get('cookie') || '',
      Accept: 'text/html',
      'x-gestor-page': '1',
      'x-forwarded-proto': request.get('x-forwarded-proto') || 'http',
      ...(request.get('x-forwarded-for')
        ? { 'x-forwarded-for': request.get('x-forwarded-for') }
        : {}),
    },
  });
  if (response.status >= 300 && response.status < 400) {
    const destination = new URL(
      response.headers.get('location') || '/login',
      backend,
    );
    if (destination.origin !== backend.origin)
      throw new Error('Redirecionamento inválido do backend.');
    redirect(destination.pathname + destination.search + destination.hash);
  }
  if (!response.headers.get('content-type')?.includes('application/json')) {
    if (response.status === 404) notFound();
    throw new Error('Não foi possível carregar esta página.');
  }
  const data = await response.json();
  if (response.status === 404) notFound();
  if (response.status >= 500)
    throw new Error('Não foi possível carregar esta página.');
  if (
    [
      'pages/login',
      'pages/minha-conta',
      'pages/planos',
      'pages/servidores',
      'pages/aplicativos',
      'pages/dispositivos',
      'pages/mensagens',
      'pages/transacoes',
      'pages/avisos',
      'pages/automacao',
      'pages/status',
      'pages/dashboard',
      'pages/whatsapp',
      'pages/integracoes',
      'pages/integracao-pagamento',
      'pages/acessos-clientes',
      'pages/area-cliente',
      'pages/pagar',
      'pages/pagar-erro',
      'pages/ix-streaming',
      'pages/em-breve',
    ].includes(data.view)
  )
    return { ...data, path: pageUrl.pathname };
  if (typeof data.html !== 'string')
    throw new Error('Resposta inválida do backend.');
  return {
    ...readSiteDocument(data.html),
    trustedScriptNonce: response.headers
      .get('content-security-policy')
      ?.match(/'nonce-([^']+)'/)?.[1],
    status: data.status,
    path: pageUrl.pathname,
  };
});
