import { loadSitePage } from '../../lib/siteBackend.js';
import { ClientAccessScreen } from '../../features/acessos-clientes/ClientAccessScreen.jsx';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Acessos dos clientes | Gestor' };
export default async function Page() {
  return <ClientAccessScreen data={await loadSitePage()} />;
}
