'use client';
import { PanelStyles } from './PanelStyles.tsx';
import { PanelShell, SiteNotice } from './PanelShell.tsx';
import { LegacyControllers } from '../legacy/LegacyControllers.tsx';

export function NativePanel({
  data,
  path,
  children,
}: {
  data?: any;
  path?: string;
  children?: React.ReactNode;
}) {
  return (
    <>
      <PanelStyles />
      <meta name="csrf-token" content={data.page.csrfToken} />
      <PanelShell data={{ ...data, currentPath: path }}>
        <SiteNotice success={data.success} error={data.error} />
        {children}
      </PanelShell>
      <LegacyControllers revision={data} />
    </>
  );
}
