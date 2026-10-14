import { loadSitePage } from '../../lib/siteBackend.js';
import { CatalogScreen } from '../../features/catalogos/CatalogScreen.jsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Planos | Gestor' };
export default async function Page() {
  return <CatalogScreen data={await loadSitePage()} />;
}
