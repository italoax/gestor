import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export async function loadClientsPage(archived) {
  const requestHeaders = await headers();
  const backend = process.env.NEXT_BACKEND_URL || 'http://127.0.0.1:3001';
  const response = await fetch(
    `${backend}/api/clientes${archived ? '?arquivados=1' : ''}`,
    {
      cache: 'no-store',
      redirect: 'manual',
      headers: {
        cookie: requestHeaders.get('cookie') || '',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (response.status === 401 || response.status === 302) redirect('/login');
  if (!response.ok) throw new Error('Não foi possível carregar os clientes.');
  return response.json();
}
