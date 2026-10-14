'use client';
import { PanelStyles } from './PanelStyles.jsx';
import { PanelShell, SiteNotice } from './PanelShell.jsx';
import { LegacyControllers } from '../legacy/LegacyControllers.jsx';

export function NativePanel({ data, path, children }) {
  return (
    <>
      <PanelStyles />
      <meta name="csrf-token" content={data.page.csrfToken} />
      <PanelShell data={{ ...data, currentPath: path }}>
        <SiteNotice success={data.success} error={data.error} />
        {children}
      </PanelShell>
      <LegacyControllers revision={path} nativeNavigation />
    </>
  );
}
