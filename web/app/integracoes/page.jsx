import { loadSitePage } from '../../lib/siteBackend.js';
import { IntegrationsScreen } from '../../features/integracoes/IntegrationsScreen.jsx';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Integrações | Gestor' };
export default async function Page() {
  return <IntegrationsScreen data={await loadSitePage()} />;
}
