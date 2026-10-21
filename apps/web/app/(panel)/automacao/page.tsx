import { loadSitePage } from '../../../lib/siteBackend.ts';
import { AutomationScreen } from '../../../features/automacao/AutomationScreen.tsx';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Automação | Gestor IXTV' };
export default async function Page() {
  return <AutomationScreen data={await loadSitePage()} />;
}
