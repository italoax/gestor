import { loadSitePage } from '../../../lib/siteBackend.ts';
import { StatusScreen } from '../../../features/status/StatusScreen.tsx';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Status WhatsApp | Gestor IXTV' };
export default async function Page() {
  return <StatusScreen data={await loadSitePage()} />;
}
