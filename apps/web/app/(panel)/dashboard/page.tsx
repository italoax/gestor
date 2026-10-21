import { loadSitePage } from '../../../lib/siteBackend.ts';
import { DashboardScreen } from '../../../features/dashboard/DashboardScreen.tsx';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard | Gestor IXTV' };
export default async function Page() {
  return <DashboardScreen data={await loadSitePage()} />;
}
