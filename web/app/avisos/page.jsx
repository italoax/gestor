import { loadSitePage } from '../../lib/siteBackend.js';
import { NoticesScreen } from '../../features/avisos/NoticesScreen.jsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Avisos | Gestor' };
export default async function Page() {
  return <NoticesScreen data={await loadSitePage()} />;
}
