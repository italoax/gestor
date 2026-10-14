import { loadSitePage } from '../../lib/siteBackend.js';
import { PortalScreen } from '../../features/area-cliente/PortalScreen.jsx';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Área do cliente | ixstreaming',
  robots: { index: false, follow: false },
};
export default async function Page() {
  return <PortalScreen data={await loadSitePage()} />;
}
