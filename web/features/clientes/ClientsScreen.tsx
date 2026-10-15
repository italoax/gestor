'use client';
import { useLayoutEffect } from 'react';
import { ClientsPage } from '../../../src/frontend/clients/ClientsPage.tsx';
import { PanelShell, SiteNotice } from '../../components/layout/PanelShell.tsx';
import { LegacyControllers } from '../../components/legacy/LegacyControllers.tsx';
import { Icon } from '../../../src/frontend/clients/ui.tsx';
import { PanelStyles } from '../../components/layout/PanelStyles.tsx';

export function ClientsScreen({ data }: { data?: any }) {
  useLayoutEffect(() => {
    document.body.className = 'page-app';
  }, []);
  return (
    <>
      <PanelStyles />
      <meta name="csrf-token" content={data.page.csrfToken} />
      <PanelShell data={data}>
        <SiteNotice
          key={`notice-${data.page.now}`}
          success={data.success}
          error={data.error}
        />
        <div data-react-page="clientes" id="next-clientes-root">
          <ClientsPage data={data.page} />
        </div>
        <LegacyControllers revision={data.page.now} />
        <div hidden>
          {['calendar', 'edit', 'plus'].map((name) => (
            <span key={name} data-ui-icon-source={name}>
              <Icon name={name} />
            </span>
          ))}
        </div>
      </PanelShell>
    </>
  );
}
