import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requestBackend } from '../../src/frontend/backendTransport.ts';
import { cache } from 'react';

export const loadClientsPage = cache(async (archived: boolean) => {
  const requestHeaders = await headers();
  const backend = process.env.NEXT_BACKEND_URL || 'http://127.0.0.1:3001';
  const response = await requestBackend(
    `${backend}/api/clientes${archived ? '?arquivados=1' : ''}`,
    {
      headers: {
        cookie: requestHeaders.get('cookie') || '',
        Accept: 'application/json',
        'x-gestor-page': '1',
        ...(requestHeaders.get('x-forwarded-for')
          ? { 'x-forwarded-for': requestHeaders.get('x-forwarded-for') }
          : {}),
        'x-forwarded-proto': requestHeaders.get('x-forwarded-proto') || 'http',
      },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (response.status === 401 || response.status === 302) redirect('/login');
  if (!response.ok) throw new Error('Não foi possível carregar os clientes.');
  return response.json();
});
