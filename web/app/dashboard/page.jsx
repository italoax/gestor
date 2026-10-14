import { loadSitePage } from '../../lib/siteBackend.js';
import { DashboardScreen } from '../../features/dashboard/DashboardScreen.jsx';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard | Gestor' };
export default async function Page() {
  return <DashboardScreen data={await loadSitePage()} />;
}
