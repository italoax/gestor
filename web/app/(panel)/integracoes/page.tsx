import { loadSitePage } from '../../../lib/siteBackend.ts';
import { IntegrationsScreen } from '../../../features/integracoes/IntegrationsScreen.tsx';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Integrações | Gestor' };
export default async function Page() {
  return <IntegrationsScreen data={await loadSitePage()} />;
}
