import { loadSitePage } from '../../lib/siteBackend.ts';
import { PortalScreen } from '../../features/area-cliente/PortalScreen.tsx';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Área do cliente | ixstreaming',
  robots: { index: false, follow: false },
};
export default async function Page() {
  return <PortalScreen data={await loadSitePage()} />;
}
