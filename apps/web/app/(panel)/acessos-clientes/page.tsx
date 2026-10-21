import { loadSitePage } from '../../../lib/siteBackend.ts';
import { ClientAccessScreen } from '../../../features/acessos-clientes/ClientAccessScreen.tsx';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Acessos dos clientes | Gestor IXTV' };
export default async function Page() {
  return <ClientAccessScreen data={await loadSitePage()} />;
}
