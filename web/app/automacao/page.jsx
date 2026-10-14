import { loadSitePage } from '../../lib/siteBackend.js';
import { AutomationScreen } from '../../features/automacao/AutomationScreen.jsx';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Automação | Gestor' };
export default async function Page() {
  return <AutomationScreen data={await loadSitePage()} />;
}
