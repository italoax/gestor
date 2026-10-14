'use client';
import { useLayoutEffect } from 'react';
import { ClientsPage } from '../../../src/frontend/clients/ClientsPage.jsx';
import { PanelShell, SiteNotice } from '../../components/layout/PanelShell.jsx';
import { LegacyControllers } from '../../components/legacy/LegacyControllers.jsx';
import { Icon } from '../../../src/frontend/clients/ui.jsx';
import { PanelStyles } from '../../components/layout/PanelStyles.jsx';

export function ClientsScreen({ data }) {
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
          <ClientsPage key={data.page.now} data={data.page} />
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
