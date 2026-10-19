import { loadSitePage } from '../../../lib/siteBackend.ts';
import { CatalogScreen } from '../../../features/catalogos/CatalogScreen.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Planos | Gestor' };
export default async function Page() {
  return <CatalogScreen data={await loadSitePage()} />;
}
