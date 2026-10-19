import { headers } from 'next/headers';
import { loadClientsPage } from '../../lib/backend.ts';
import { loadSitePage } from '../../lib/siteBackend.ts';
import { PersistentPanel } from '../../components/layout/PanelShell.tsx';
import { PanelStyles } from '../../components/layout/PanelStyles.tsx';
import { panelShellData } from '../../lib/panelData.ts';

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const request = await headers();
  const pageUrl = new URL(
    request.get('x-gestor-page-url') || '/dashboard',
    'http://gestor.local',
  );
  const data =
    pageUrl.pathname === '/clientes'
      ? await loadClientsPage(pageUrl.searchParams.get('arquivados') === '1')
      : await loadSitePage();
  return (
    <>
      <PanelStyles />
      <PersistentPanel data={panelShellData(data, pageUrl.pathname)}>
        {children}
      </PersistentPanel>
    </>
  );
}
