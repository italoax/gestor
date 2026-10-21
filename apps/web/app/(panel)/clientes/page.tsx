import { loadClientsPage } from '../../../lib/backend.ts';
import { ClientsScreen } from '../../../features/clientes/ClientsScreen.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Clientes | Gestor IXTV' };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams?: any;
}) {
  const query = await searchParams;
  const data = await loadClientsPage(query.arquivados === '1');
  return <ClientsScreen data={data} />;
}
