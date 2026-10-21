import { loadSitePage } from '../../../lib/siteBackend.ts';
import { NoticesScreen } from '../../../features/avisos/NoticesScreen.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Avisos | Gestor IXTV' };
export default async function Page() {
  return <NoticesScreen data={await loadSitePage()} />;
}
