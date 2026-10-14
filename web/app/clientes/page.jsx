import { loadClientsPage } from '../../lib/backend.js';
import { ClientsScreen } from '../../features/clientes/ClientsScreen.jsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Clientes | Gestor' };

export default async function ClientsPage({ searchParams }) {
  const query = await searchParams;
  const data = await loadClientsPage(query.arquivados === '1');
  return <ClientsScreen data={data} />;
}
